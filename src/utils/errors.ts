/**
 * Error normalization for Garmin API responses.
 *
 * Turns raw HTTP failures into {@link GarminApiError}s that carry an
 * actionable, user-facing message and, where possible, the parsed error detail
 * returned by Garmin.
 */

import { GarminApiError } from "../types.js";

/** Ceiling on how long we will honor a Retry-After hint (ms). */
export const MAX_RETRY_DELAY_MS = 20_000;

/** A short, actionable hint for a given HTTP status. */
export function friendlyStatusHint(status: number): string {
  switch (status) {
    case 400:
      return "The request was rejected as invalid. Check the parameters.";
    case 401:
      return "Garmin authentication is invalid or expired. Reconnect your Garmin account.";
    case 403:
      return "Garmin denied access. The connected account may lack the required permission or scope.";
    case 404:
      return "The requested Garmin resource was not found.";
    case 409:
      return "The request conflicts with the current state of the resource.";
    case 413:
      return "The request payload is too large.";
    case 429:
      return "Garmin rate limit reached. Retry after a short delay.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Garmin is temporarily unavailable. This is usually transient.";
    default:
      return status >= 500
        ? "Garmin returned a server error."
        : "The Garmin request failed.";
  }
}

/** Best-effort extraction of a message from a Garmin JSON error body. */
function extractBodyMessage(bodyText?: string): string | undefined {
  if (!bodyText) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "errorMessage"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  } catch {
    // Non-JSON body: fall through and use the raw text if it's short.
  }
  const trimmed = bodyText.trim();
  return trimmed.length > 0 && trimmed.length <= 300 ? trimmed : undefined;
}

/** Build a normalized {@link GarminApiError} from an HTTP failure. */
export function parseGarminError(
  status: number,
  bodyText?: string,
): GarminApiError {
  const hint = friendlyStatusHint(status);
  const detail = extractBodyMessage(bodyText);
  const message = detail ? `${hint} (${detail})` : hint;
  return new GarminApiError(message, status, bodyText);
}

/**
 * Parse a `Retry-After` header value into milliseconds.
 * Supports both delta-seconds and HTTP-date forms. Returns `undefined` when
 * absent or unparseable, and caps the result at {@link MAX_RETRY_DELAY_MS}.
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
): number | undefined {
  if (!headerValue) {
    return undefined;
  }
  const trimmed = headerValue.trim();

  // delta-seconds form
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_DELAY_MS);
  }

  // HTTP-date form
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? Math.min(delta, MAX_RETRY_DELAY_MS) : 0;
  }

  return undefined;
}
