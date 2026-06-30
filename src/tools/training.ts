/**
 * Training and Courses API tools (write operations).
 *
 * These tools push data to the user's Garmin device. They are marked as
 * non-read-only and non-destructive (they create new content rather than
 * deleting or overwriting existing data).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  pushCourseShape,
  pushTrainingPlanShape,
  pushWorkoutShape,
} from "../schemas/training.js";
import { runTool, type ToolContext } from "./helpers.js";

const writeHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export function registerTrainingTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "garmin_push_workout",
    {
      title: "Push Workout",
      description:
        "Send a structured workout (warmup, intervals, targets, cooldown) to the user's Garmin device.",
      inputSchema: pushWorkoutShape,
      annotations: { title: "Push Workout", ...writeHints },
    },
    (args, extra) =>
      runTool(() => ctx.client.pushWorkout(ctx.resolveUserId(extra), args)),
  );

  server.registerTool(
    "garmin_push_training_plan",
    {
      title: "Push Training Plan",
      description:
        "Send a multi-day training plan made up of scheduled workouts to the user's Garmin device.",
      inputSchema: pushTrainingPlanShape,
      annotations: { title: "Push Training Plan", ...writeHints },
    },
    (args, extra) =>
      runTool(() => ctx.client.pushTrainingPlan(ctx.resolveUserId(extra), args)),
  );

  server.registerTool(
    "garmin_push_course",
    {
      title: "Push Course",
      description:
        "Push a GPS course (route of coordinates) to the user's Garmin device for navigation.",
      inputSchema: pushCourseShape,
      annotations: { title: "Push Course", ...writeHints },
    },
    (args, extra) =>
      runTool(() => ctx.client.pushCourse(ctx.resolveUserId(extra), args)),
  );
}
