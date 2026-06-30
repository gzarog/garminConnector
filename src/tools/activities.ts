/**
 * Activity API tools (read-only).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  activityDetailShape,
  activitySplitsShape,
  listActivitiesShape,
  searchActivitiesShape,
} from "../schemas/activities.js";
import { runTool, type ToolContext } from "./helpers.js";

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;

export function registerActivityTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "garmin_list_activities",
    {
      title: "List Activities",
      description:
        "List activities with optional filters for sport type and date range.",
      inputSchema: listActivitiesShape,
      annotations: { title: "List Activities", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.listActivities(ctx.resolveUserId(extra), {
          startDate: args.startDate,
          endDate: args.endDate,
          activityType: args.activityType,
          limit: args.limit,
          offset: args.offset,
        }),
      ),
  );

  server.registerTool(
    "garmin_get_activity_detail",
    {
      title: "Get Activity Detail",
      description:
        "Full activity detail: laps, splits, HR zones, elevation, pace, and training effect.",
      inputSchema: activityDetailShape,
      annotations: { title: "Get Activity Detail", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getActivityDetail(ctx.resolveUserId(extra), args.activityId, {
          includeLaps: args.includeLaps,
          includeHrZones: args.includeHrZones,
        }),
      ),
  );

  server.registerTool(
    "garmin_get_activity_splits",
    {
      title: "Get Activity Splits",
      description: "Per-km or per-mile splits with pace, HR, and elevation.",
      inputSchema: activitySplitsShape,
      annotations: { title: "Get Activity Splits", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getActivitySplits(
          ctx.resolveUserId(extra),
          args.activityId,
          args.unit,
        ),
      ),
  );

  server.registerTool(
    "garmin_search_activities",
    {
      title: "Search Activities",
      description:
        "Search activities by keyword, sport type, and date range.",
      inputSchema: searchActivitiesShape,
      annotations: { title: "Search Activities", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.searchActivities(ctx.resolveUserId(extra), {
          query: args.query,
          activityType: args.activityType,
          startDate: args.startDate,
          endDate: args.endDate,
          limit: args.limit,
        }),
      ),
  );
}
