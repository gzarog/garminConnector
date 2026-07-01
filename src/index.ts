#!/usr/bin/env node
/**
 * Entry point and transport setup.
 *
 * Supports two transports selected by the TRANSPORT env var:
 *   - "stdio": for MCP Inspector / Claude Desktop (single local user).
 *   - "http":  Streamable HTTP for remote Claude.ai connector, plus the
 *              OAuth 2.0 authorize/callback routes that bridge Garmin auth.
 */

import express, { type Request, type Response } from "express";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  DEFAULT_SCOPES,
  GARMIN_API_BASE_URL,
  GARMIN_AUTHORIZE_URL,
  GARMIN_TOKEN_URL,
  SERVER_NAME,
  SERVER_VERSION,
} from "./constants.js";
import { createKeyValueStore } from "./services/kv.js";
import { KvTokenStore } from "./services/token-store.js";
import { GarminOAuthProvider } from "./services/oauth-provider.js";
import { createServer } from "./server.js";
import { logger, setLogLevel, type LogLevel } from "./utils/logger.js";
import type { ServerConfig } from "./types.js";

/** Resolve runtime configuration from the environment. */
function loadConfig(): ServerConfig {
  const transport = (process.env.TRANSPORT ?? "http") as "http" | "stdio";
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;

  return {
    transport,
    port,
    host,
    publicBaseUrl,
    garmin: {
      clientId: process.env.GARMIN_CLIENT_ID ?? "",
      clientSecret: process.env.GARMIN_CLIENT_SECRET ?? "",
      authorizeUrl: GARMIN_AUTHORIZE_URL,
      tokenUrl: GARMIN_TOKEN_URL,
      apiBaseUrl: GARMIN_API_BASE_URL,
      scopes: DEFAULT_SCOPES,
    },
    tokenStore: (process.env.TOKEN_STORE ?? "memory") as "memory" | "redis",
    redisUrl: process.env.REDIS_URL,
    logLevel: process.env.LOG_LEVEL ?? "info",
    demoMode: (process.env.DEMO_MODE ?? "false").toLowerCase() === "true",
  };
}

async function runStdio(config: ServerConfig): Promise<void> {
  const kv = await createKeyValueStore(config);
  const store = new KvTokenStore(kv);
  const server = createServer(config, store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: under stdio do not write to stdout; it is the protocol channel.
  logger.info(`${SERVER_NAME} v${SERVER_VERSION} ready (stdio).`);
}

async function runHttp(config: ServerConfig): Promise<void> {
  const kv = await createKeyValueStore(config);
  const store = new KvTokenStore(kv);

  const issuerUrl = new URL(config.publicBaseUrl);
  const garminRedirectUri = `${config.publicBaseUrl}/oauth/callback`;
  const provider = new GarminOAuthProvider(config, store, garminRedirectUri, kv);
  const resourceMetadataUrl = `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;

  const app = express();
  app.use(express.json({ limit: "4mb" }));

  // --- Health check --------------------------------------------------------
  app.get("/healthz", (_req, res) => {
    res.json({ name: SERVER_NAME, version: SERVER_VERSION, ok: true });
  });

  // --- Landing page --------------------------------------------------------
  app.get("/", (_req, res) => {
    res.type("html").send(landingPage(config));
  });

  // --- Branding assets (for the Connectors Directory listing) --------------
  const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
  app.use("/assets", express.static(assetsDir, { maxAge: "1h" }));
  app.get("/logo.svg", (_req, res) => res.sendFile(join(assetsDir, "logo.svg")));
  app.get("/favicon.svg", (_req, res) =>
    res.sendFile(join(assetsDir, "favicon.svg")),
  );
  app.get("/favicon.ico", (_req, res) => res.redirect(302, "/favicon.svg"));

  // --- OAuth Authorization Server ------------------------------------------
  // Installs /.well-known/oauth-authorization-server, /.well-known/
  // oauth-protected-resource, /authorize, /token, /register, and /revoke.
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      scopesSupported: config.garmin.scopes,
      resourceName: SERVER_NAME,
    }),
  );

  // Garmin's redirect target: exchange the Garmin code, bind the user, then
  // send the MCP client back to its own redirect_uri with our auth code.
  app.get("/oauth/callback", async (req: Request, res: Response) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (req.query.error) {
      res.status(400).send(`Garmin authorization failed: ${req.query.error}`);
      return;
    }
    if (!code || !state) {
      res.status(400).send("Missing code or state from Garmin.");
      return;
    }
    try {
      const { redirectTo } = await provider.handleGarminCallback(state, code);
      res.redirect(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Garmin callback failed:", message);
      res.status(502).send(`Failed to complete Garmin authorization: ${message}`);
    }
  });

  // --- MCP Streamable HTTP endpoint (stateless, bearer-authenticated) -------
  const bearerAuth = requireBearerAuth({ verifier: provider, resourceMetadataUrl });
  app.post("/mcp", bearerAuth, async (req: Request, res: Response) => {
    const server = createServer(config, store);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET/DELETE on /mcp are used for SSE streams / session teardown, which the
  // stateless transport does not support.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  if (config.demoMode) {
    logger.warn(
      "DEMO_MODE is ON — serving sample data and skipping real Garmin OAuth. " +
        "Do not use in production.",
    );
  } else if (!config.garmin.clientId) {
    logger.warn(
      "GARMIN_CLIENT_ID is not set; real authorization will fail. " +
        "Set Garmin credentials or run with DEMO_MODE=true.",
    );
  }

  app.listen(config.port, config.host, () => {
    logger.info(
      `${SERVER_NAME} v${SERVER_VERSION} listening on ` +
        `http://${config.host}:${config.port} (MCP at /mcp).`,
    );
  });
}

/** Minimal HTML landing page describing the connector and its status. */
function landingPage(config: ServerConfig): string {
  const mode = config.demoMode
    ? '<p><strong>Demo mode is ON</strong> — sample data, no Garmin account needed.</p>'
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${SERVER_NAME}</title>
  <link rel="icon" href="/favicon.svg" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto;
           padding: 0 1rem; color: #1a2733; }
    img { width: 72px; height: 72px; }
    code { background: #eef2f7; padding: 0.1rem 0.35rem; border-radius: 4px; }
    a { color: #1e88e5; }
  </style>
</head>
<body>
  <img src="/logo.svg" alt="logo" />
  <h1>${SERVER_NAME}</h1>
  <p>MCP connector for Garmin Connect. Add this server as a connector in your MCP
     client (e.g. Claude.ai) and click <strong>Connect</strong> to authorize.</p>
  ${mode}
  <p>MCP endpoint: <code>${config.publicBaseUrl}/mcp</code></p>
  <p>Health: <a href="/healthz">/healthz</a> ·
     Metadata: <a href="/.well-known/oauth-protected-resource">/.well-known/oauth-protected-resource</a></p>
</body>
</html>`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel as LogLevel);
  if (config.transport === "stdio") {
    await runStdio(config);
  } else {
    await runHttp(config);
  }
}

main().catch((err) => {
  logger.error("Fatal error starting server:", err);
  process.exit(1);
});
