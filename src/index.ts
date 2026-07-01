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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DEFAULT_SCOPES,
  GARMIN_API_BASE_URL,
  GARMIN_AUTHORIZE_URL,
  GARMIN_TOKEN_URL,
  SERVER_NAME,
  SERVER_VERSION,
} from "./constants.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  generateState,
} from "./services/auth.js";
import { createTokenStore } from "./services/token-store.js";
import { createServer, LOCAL_USER_ID } from "./server.js";
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
  };
}

async function runStdio(config: ServerConfig): Promise<void> {
  const store = createTokenStore(config.tokenStore, config.redisUrl);
  const server = createServer(config, store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: under stdio do not write to stdout; it is the protocol channel.
  logger.info(`${SERVER_NAME} v${SERVER_VERSION} ready (stdio).`);
}

async function runHttp(config: ServerConfig): Promise<void> {
  const store = createTokenStore(config.tokenStore, config.redisUrl);
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  /** Pending OAuth `state` values awaiting a callback. */
  const pendingStates = new Set<string>();
  const redirectUri = `${config.publicBaseUrl}/oauth/callback`;

  // --- Health check --------------------------------------------------------
  app.get("/healthz", (_req, res) => {
    res.json({ name: SERVER_NAME, version: SERVER_VERSION, ok: true });
  });

  // --- OAuth: begin authorization -----------------------------------------
  app.get("/authorize", (_req: Request, res: Response) => {
    if (!config.garmin.clientId) {
      res.status(500).send("GARMIN_CLIENT_ID is not configured.");
      return;
    }
    const state = generateState();
    pendingStates.add(state);
    const url = buildAuthorizeUrl(config, state, redirectUri);
    res.redirect(url);
  });

  // --- OAuth: Garmin callback ---------------------------------------------
  app.get("/oauth/callback", async (req: Request, res: Response) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!code || !state || !pendingStates.has(state)) {
      res.status(400).send("Invalid or expired OAuth state.");
      return;
    }
    pendingStates.delete(state);
    try {
      const tokens = await exchangeCodeForTokens(config, code, redirectUri);
      // Scaffold: associate tokens with the local user. Production deployments
      // bridge this to the Claude.ai connector identity via the MCP auth token.
      await store.set(LOCAL_USER_ID, tokens);
      res.send(
        "Garmin account connected. You can close this window and return to Claude.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).send(`Failed to exchange code: ${message}`);
    }
  });

  // --- MCP Streamable HTTP endpoint (stateless) ----------------------------
  app.post("/mcp", async (req: Request, res: Response) => {
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

  app.listen(config.port, config.host, () => {
    logger.info(
      `${SERVER_NAME} v${SERVER_VERSION} listening on ` +
        `http://${config.host}:${config.port} (MCP at /mcp).`,
    );
  });
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
