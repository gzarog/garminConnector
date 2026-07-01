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
 * In remote (HTTP) mode the OAuth layer validates the bearer token and attaches
 * `authInfo` to each request, carrying the resolved `userId` in `extra`. That
 * id maps to the user's own Garmin token set, so each user only sees their own
 * data. As a fallback we hash the raw token; in stdio mode there is a single
 * local user.
 */
function resolveUserId(extra: unknown): string {
  const authInfo = (
    extra as {
      authInfo?: {
        token?: string;
        clientId?: string;
        extra?: { userId?: string };
      };
    }
  )?.authInfo;
  if (authInfo?.extra?.userId) {
    return authInfo.extra.userId;
  }
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
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Access Garmin Connect health, fitness, and activity data. Read tools " +
        "(garmin_get_*, garmin_list_activities, garmin_search_activities) accept " +
        "a date or YYYY-MM-DD date range; wellness ranges are capped at 31 days " +
        "and responses include a `meta` envelope with the resolved range and " +
        "record count. Write tools (garmin_push_workout, garmin_push_training_plan, " +
        "garmin_push_course) send content to the user's device and should be " +
        "confirmed with the user first. If a call returns a 401, the user needs to " +
        "reconnect their Garmin account.",
    },
  );

  const client = new GarminClient(config, store);
  const ctx: ToolContext = { client, resolveUserId };

  registerHealthTools(server, ctx);
  registerActivityTools(server, ctx);
  registerTrainingTools(server, ctx);
  registerUserTools(server, ctx);

  return server;
}

export { LOCAL_USER_ID };
