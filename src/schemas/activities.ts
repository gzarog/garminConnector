/**
 * Zod schemas for activity tool inputs.
 */

import { z } from "zod";
import { isoDate } from "./health.js";

/** Common Garmin activity sport types (non-exhaustive). */
export const activityType = z
  .enum([
    "running",
    "cycling",
    "swimming",
    "walking",
    "hiking",
    "strength_training",
    "cardio",
    "yoga",
    "other",
  ])
  .describe("Activity / sport type filter.");

export const listActivitiesShape = {
  startDate: isoDate
    .optional()
    .describe("Only include activities on or after this date (YYYY-MM-DD)."),
  endDate: isoDate
    .optional()
    .describe("Only include activities on or before this date (YYYY-MM-DD)."),
  activityType: activityType.optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of activities to return (default 20)."),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Pagination offset."),
};

export const activityDetailShape = {
  activityId: z.string().min(1).describe("Garmin activity ID."),
  includeLaps: z.boolean().optional().describe("Include per-lap breakdown."),
  includeHrZones: z
    .boolean()
    .optional()
    .describe("Include heart-rate zone distribution."),
};

export const activitySplitsShape = {
  activityId: z.string().min(1).describe("Garmin activity ID."),
  unit: z
    .enum(["km", "mile"])
    .optional()
    .describe("Split distance unit (default km)."),
};

export const searchActivitiesShape = {
  query: z
    .string()
    .min(1)
    .describe("Free-text search over activity name and notes."),
  activityType: activityType.optional(),
  startDate: isoDate.optional().describe("Earliest date (YYYY-MM-DD)."),
  endDate: isoDate.optional().describe("Latest date (YYYY-MM-DD)."),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of results (default 20)."),
};
