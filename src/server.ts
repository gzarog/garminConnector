/**
 * McpServer initialization and tool registration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { GarminClient } from "./services/garmin-client.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerHealthTools } from "./tools/health.js";
import { registerTrainingTools } from "./tools/training.js";
import { registerUserTools } from "./tools/user.js";
import type { ToolContext } from "./tools/helpers.js";
import type { ServerConfig, TokenStore } from "./types.js";

/** Fixed identity for single-user transports (stdio). */
const LOCAL_USER_ID = "local-user";

/**
 * Derive a stable user id from the MCP request's auth info.
 *
 * In remote (HTTP) mode the SDK attaches OAuth `authInfo` to each request; we
 * key sessions on a hash of the bearer token so the same connected user maps
 * to the same Garmin token set. In stdio mode there is a single local user.
 */
function resolveUserId(extra: unknown): string {
  const authInfo = (extra as { authInfo?: { token?: string; clientId?: string } })
    ?.authInfo;
  if (authInfo?.token) {
    return createHash("sha256").update(authInfo.token).digest("hex").slice(0, 32);
  }
  if (authInfo?.clientId) {
    return authInfo.clientId;
  }
  return LOCAL_USER_ID;
}

/** Build and configure a fresh McpServer instance with all tools registered. */
export function createServer(
  config: ServerConfig,
  store: TokenStore,
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const client = new GarminClient(config, store);
  const ctx: ToolContext = { client, resolveUserId };

  registerHealthTools(server, ctx);
  registerActivityTools(server, ctx);
  registerTrainingTools(server, ctx);
  registerUserTools(server, ctx);

  return server;
}

export { LOCAL_USER_ID };
