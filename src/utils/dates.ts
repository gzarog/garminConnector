/**
 * Date-range validation and normalization.
 *
 * Tool inputs accept human-friendly ISO calendar dates (YYYY-MM-DD). These
 * helpers validate them, apply sensible defaults, enforce a maximum span, and
 * derive the epoch-second bounds some Garmin endpoints expect.
 */

import { GarminApiError } from "../types.js";

/** Maximum number of days allowed in a single date-range query. */
export const MAX_RANGE_DAYS = 31;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** A validated, normalized date range. */
export interface NormalizedRange {
  /** Inclusive start date, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end date, YYYY-MM-DD. */
  endDate: string;
  /** Number of calendar days the range spans (inclusive). */
  days: number;
  /** Epoch seconds at 00:00:00 UTC of startDate. */
  startEpochSec: number;
  /** Epoch seconds at 23:59:59 UTC of endDate. */
  endEpochSec: number;
}

/** Parse a YYYY-MM-DD string to a UTC-midnight epoch-ms value, or throw. */
function parseUtcMidnight(date: string, field: string): number {
  if (!ISO_DATE.test(date)) {
    throw new GarminApiError(
      `Invalid ${field}: "${date}". Expected YYYY-MM-DD.`,
      400,
    );
  }
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new GarminApiError(`Invalid ${field}: "${date}" is not a real date.`, 400);
  }
  return ms;
}

/**
 * Validate and normalize a date range.
 *
 * - `endDate` defaults to `startDate` when omitted.
 * - Rejects ranges where `endDate` precedes `startDate`.
 * - Rejects ranges longer than {@link MAX_RANGE_DAYS}.
 */
export function normalizeDateRange(
  startDate: string,
  endDate?: string,
): NormalizedRange {
  const startMs = parseUtcMidnight(startDate, "startDate");
  const resolvedEnd = endDate ?? startDate;
  const endMs = parseUtcMidnight(resolvedEnd, "endDate");

  if (endMs < startMs) {
    throw new GarminApiError(
      `endDate (${resolvedEnd}) must not be before startDate (${startDate}).`,
      400,
    );
  }

  const days = Math.round((endMs - startMs) / MS_PER_DAY) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new GarminApiError(
      `Date range of ${days} days exceeds the maximum of ${MAX_RANGE_DAYS}. ` +
        `Narrow the range and query again.`,
      400,
    );
  }

  return {
    startDate,
    endDate: resolvedEnd,
    days,
    startEpochSec: Math.floor(startMs / 1000),
    // End of the endDate day (inclusive) in epoch seconds.
    endEpochSec: Math.floor((endMs + MS_PER_DAY - 1000) / 1000),
  };
}

/**
 * Validate optional `startDate`/`endDate` filters for list-style queries:
 * checks format and ordering, but does not impose the {@link MAX_RANGE_DAYS}
 * span cap (activity history may legitimately span long periods).
 */
export function validateOptionalRange(
  startDate?: string,
  endDate?: string,
): void {
  const startMs = startDate ? parseUtcMidnight(startDate, "startDate") : undefined;
  const endMs = endDate ? parseUtcMidnight(endDate, "endDate") : undefined;
  if (startMs !== undefined && endMs !== undefined && endMs < startMs) {
    throw new GarminApiError(
      `endDate (${endDate}) must not be before startDate (${startDate}).`,
      400,
    );
  }
}
