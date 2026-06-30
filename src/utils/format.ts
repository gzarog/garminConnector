/**
 * Response formatting.
 *
 * Garmin responses are wrapped in a consistent envelope that carries query
 * metadata (the resolved date range, result counts, pagination) alongside the
 * data. The raw Garmin payload is passed through untouched under `data` so no
 * information is lost, while `meta` gives the model concise context.
 */

/** Metadata attached to every enveloped response. */
export interface ResponseMeta {
  /** Resolved start date of the query, if date-scoped. */
  startDate?: string;
  /** Resolved end date of the query, if date-scoped. */
  endDate?: string;
  /** Number of days the query spans, if date-scoped. */
  days?: number;
  /** Number of records returned, when the payload is a list. */
  count?: number;
  /** Pagination cursor for the next page, when applicable. */
  nextOffset?: number;
  /** Free-form extra context. */
  [key: string]: unknown;
}

/** A consistently shaped tool response. */
export interface Envelope<T = unknown> {
  meta: ResponseMeta;
  data: T;
}

/** Keys under which Garmin list endpoints commonly nest their array payload. */
const LIST_KEYS = ["items", "activities", "results", "records"] as const;

/**
 * Return the array payload from a Garmin response, whether it is a bare array
 * or nested under a common list key. Returns `undefined` if no list is found.
 */
export function extractList(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    for (const key of LIST_KEYS) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return undefined;
}

/** Count records if the payload (or its common list fields) is array-like. */
function inferCount(data: unknown): number | undefined {
  return extractList(data)?.length;
}

/**
 * Wrap a Garmin payload in the standard envelope, inferring the record count
 * when the caller does not supply one.
 */
export function envelope<T>(data: T, meta: ResponseMeta = {}): Envelope<T> {
  const count = meta.count ?? inferCount(data);
  return {
    meta: { ...meta, ...(count !== undefined ? { count } : {}) },
    data,
  };
}
