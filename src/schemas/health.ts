/**
 * Zod schemas for health tool inputs.
 *
 * Schemas are expressed as raw shapes (`Record<string, ZodType>`) so they can
 * be passed directly to `registerTool`'s `inputSchema` field.
 */

import { z } from "zod";

/** ISO-8601 calendar date, e.g. "2026-06-30". */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** Shared date-range shape used by most health tools. */
export const dateRangeShape = {
  startDate: isoDate.describe("Start date (inclusive), YYYY-MM-DD"),
  endDate: isoDate
    .optional()
    .describe("End date (inclusive), YYYY-MM-DD. Defaults to startDate."),
};

export const dailySummaryShape = { ...dateRangeShape };

export const heartRateShape = {
  ...dateRangeShape,
  includeSamples: z
    .boolean()
    .optional()
    .describe("Include timestamped HR samples in addition to summary."),
};

export const sleepShape = {
  ...dateRangeShape,
  includeSpo2: z.boolean().optional().describe("Include SpO2 readings."),
  includeRespiration: z
    .boolean()
    .optional()
    .describe("Include respiration readings."),
};

export const stressShape = {
  ...dateRangeShape,
  includeSamples: z
    .boolean()
    .optional()
    .describe("Include timestamped stress samples."),
};

export const bodyBatteryShape = { ...dateRangeShape };
export const pulseOxShape = { ...dateRangeShape };
export const respirationShape = { ...dateRangeShape };
export const hrvShape = { ...dateRangeShape };
export const hydrationShape = { ...dateRangeShape };

export const bodyCompositionShape = {
  ...dateRangeShape,
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Maximum number of measurements to return."),
};
