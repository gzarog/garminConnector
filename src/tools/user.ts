/**
 * User profile and device tools (read-only).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool, type ToolContext } from "./helpers.js";

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;

export function registerUserTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "garmin_get_user_profile",
    {
      title: "Get User Profile",
      description: "User profile, device info, and unit preferences.",
      inputSchema: {},
      annotations: { title: "Get User Profile", ...readOnly },
    },
    (_args, extra) =>
      runTool(() => ctx.client.getUserProfile(ctx.resolveUserId(extra))),
  );

  server.registerTool(
    "garmin_get_devices",
    {
      title: "Get Devices",
      description: "List the Garmin devices connected to the user's account.",
      inputSchema: {},
      annotations: { title: "Get Devices", ...readOnly },
    },
    (_args, extra) =>
      runTool(() => ctx.client.getDevices(ctx.resolveUserId(extra))),
  );
}
