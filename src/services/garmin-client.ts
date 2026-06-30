/**
 * Garmin API HTTP client.
 *
 * Handles authenticated requests, automatic token refresh, retry with
 * exponential backoff for transient failures, query-string building, and
 * error normalization. Tools call the typed convenience methods rather than
 * constructing requests themselves.
 */

import { DEFAULTS, GARMIN_ENDPOINTS } from "../constants.js";
import { getValidAccessToken } from "./auth.js";
import {
  normalizeDateRange,
  validateOptionalRange,
  type NormalizedRange,
} from "../utils/dates.js";
import { envelope, extractList, type Envelope } from "../utils/format.js";
import type {
  GarminRequestOptions,
  ServerConfig,
  TokenStore,
} from "../types.js";
import { GarminApiError } from "../types.js";

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(
  base: string,
  path: string,
  query?: GarminRequestOptions["query"],
): string {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export class GarminClient {
  constructor(
    private readonly config: ServerConfig,
    private readonly store: TokenStore,
  ) {}

  /**
   * Perform an authenticated request to the Garmin API for the given user,
   * retrying transient failures and normalizing errors.
   */
  async request<T = unknown>(
    userId: string,
    path: string,
    options: GarminRequestOptions = {},
  ): Promise<T> {
    const {
      method = "GET",
      query,
      body,
      timeoutMs = DEFAULTS.requestTimeoutMs,
    } = options;

    const url = buildUrl(this.config.garmin.apiBaseUrl, path, query);

    let lastError: unknown;
    for (let attempt = 0; attempt <= DEFAULTS.maxRetries; attempt++) {
      const accessToken = await getValidAccessToken(
        this.config,
        this.store,
        userId,
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (res.ok) {
          if (res.status === 204) {
            return undefined as T;
          }
          const text = await res.text();
          return (text ? JSON.parse(text) : undefined) as T;
        }

        // Non-OK: decide whether to retry.
        const details = await res.text().catch(() => undefined);
        if (RETRYABLE_STATUS.has(res.status) && attempt < DEFAULTS.maxRetries) {
          lastError = new GarminApiError(
            `Garmin API ${res.status}`,
            res.status,
            details,
          );
          await sleep(DEFAULTS.retryBaseDelayMs * 2 ** attempt);
          continue;
        }

        throw new GarminApiError(
          `Garmin API request failed (${res.status})`,
          res.status,
          details,
        );
      } catch (err) {
        // Network/abort errors are retryable.
        if (err instanceof GarminApiError && !RETRYABLE_STATUS.has(err.status)) {
          throw err;
        }
        lastError = err;
        if (attempt < DEFAULTS.maxRetries) {
          await sleep(DEFAULTS.retryBaseDelayMs * 2 ** attempt);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError instanceof GarminApiError) {
      throw lastError;
    }
    throw new GarminApiError(
      `Garmin API request failed after ${DEFAULTS.maxRetries + 1} attempts: ` +
        `${lastError instanceof Error ? lastError.message : String(lastError)}`,
      503,
      lastError,
    );
  }

  // --- Convenience helpers used by tools -----------------------------------

  /**
   * Validate a date range and issue a request against a date-scoped endpoint,
   * returning the payload wrapped in a metadata envelope. Garmin's wellness
   * endpoints are bounded by epoch-second upload windows.
   */
  private async dateRangeRequest<T = unknown>(
    userId: string,
    path: string,
    range: NormalizedRange,
    extraQuery: Record<string, string | number | boolean | undefined> = {},
  ): Promise<Envelope<T>> {
    const data = await this.request<T>(userId, path, {
      query: {
        uploadStartTimeInSeconds: range.startEpochSec,
        uploadEndTimeInSeconds: range.endEpochSec,
        ...extraQuery,
      },
    });
    return envelope(data, {
      startDate: range.startDate,
      endDate: range.endDate,
      days: range.days,
    });
  }

  getDailySummary(userId: string, startDate: string, endDate?: string) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.dailySummary,
      normalizeDateRange(startDate, endDate),
    );
  }

  getHeartRate(
    userId: string,
    startDate: string,
    endDate?: string,
    includeSamples?: boolean,
  ) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.heartRate,
      normalizeDateRange(startDate, endDate),
      { includeSamples },
    );
  }

  getSleep(
    userId: string,
    startDate: string,
    endDate?: string,
    extra?: { includeSpo2?: boolean; includeRespiration?: boolean },
  ) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.sleep,
      normalizeDateRange(startDate, endDate),
      { ...extra },
    );
  }

  getStress(
    userId: string,
    startDate: string,
    endDate?: string,
    includeSamples?: boolean,
  ) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.stress,
      normalizeDateRange(startDate, endDate),
      { includeSamples },
    );
  }

  getBodyBattery(userId: string, startDate: string, endDate?: string) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.bodyBattery,
      normalizeDateRange(startDate, endDate),
    );
  }

  getPulseOx(userId: string, startDate: string, endDate?: string) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.pulseOx,
      normalizeDateRange(startDate, endDate),
    );
  }

  getRespiration(userId: string, startDate: string, endDate?: string) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.respiration,
      normalizeDateRange(startDate, endDate),
    );
  }

  getHrv(userId: string, startDate: string, endDate?: string) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.hrv,
      normalizeDateRange(startDate, endDate),
    );
  }

  getHydration(userId: string, startDate: string, endDate?: string) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.hydration,
      normalizeDateRange(startDate, endDate),
    );
  }

  getBodyComposition(
    userId: string,
    startDate: string,
    endDate?: string,
    limit?: number,
  ) {
    return this.dateRangeRequest(
      userId,
      GARMIN_ENDPOINTS.bodyComposition,
      normalizeDateRange(startDate, endDate),
      { limit },
    );
  }

  async listActivities(
    userId: string,
    params: {
      startDate?: string;
      endDate?: string;
      activityType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    validateOptionalRange(params.startDate, params.endDate);
    const limit = Math.min(params.limit ?? DEFAULTS.pageSize, DEFAULTS.maxPageSize);
    const offset = params.offset ?? 0;

    const collected = await this.paginate(
      userId,
      GARMIN_ENDPOINTS.activities,
      {
        startDate: params.startDate,
        endDate: params.endDate,
        activityType: params.activityType,
      },
      limit,
      offset,
    );

    return envelope(collected.items, {
      startDate: params.startDate,
      endDate: params.endDate,
      count: collected.items.length,
      nextOffset: collected.nextOffset,
    });
  }

  /**
   * Fetch sequential pages from a list endpoint until `limit` records are
   * collected or a short (final) page is returned. Bounds the number of
   * requests so a misbehaving endpoint cannot loop indefinitely.
   */
  private async paginate(
    userId: string,
    path: string,
    baseQuery: Record<string, string | number | boolean | undefined>,
    limit: number,
    startOffset: number,
  ): Promise<{ items: unknown[]; nextOffset?: number }> {
    const items: unknown[] = [];
    let offset = startOffset;
    const maxPages = Math.ceil(limit / DEFAULTS.pageSize) + 1;

    for (let page = 0; page < maxPages && items.length < limit; page++) {
      const pageSize = Math.min(DEFAULTS.pageSize, limit - items.length);
      const data = await this.request(userId, path, {
        query: { ...baseQuery, limit: pageSize, offset },
      });
      const list = extractList(data);
      if (!list || list.length === 0) {
        return { items };
      }
      items.push(...list);
      offset += list.length;
      // A short page means we've reached the end.
      if (list.length < pageSize) {
        return { items };
      }
    }

    return { items: items.slice(0, limit), nextOffset: offset };
  }

  getActivityDetail(
    userId: string,
    activityId: string,
    extra?: { includeLaps?: boolean; includeHrZones?: boolean },
  ) {
    return this.request(
      userId,
      `${GARMIN_ENDPOINTS.activityDetail}/${encodeURIComponent(activityId)}`,
      { query: { ...extra } },
    );
  }

  getActivitySplits(userId: string, activityId: string, unit?: "km" | "mile") {
    return this.request(
      userId,
      `${GARMIN_ENDPOINTS.activitySplits}/${encodeURIComponent(activityId)}`,
      { query: { unit: unit ?? "km" } },
    );
  }

  async searchActivities(
    userId: string,
    params: {
      query: string;
      activityType?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
  ) {
    validateOptionalRange(params.startDate, params.endDate);
    const limit = Math.min(params.limit ?? DEFAULTS.pageSize, DEFAULTS.maxPageSize);
    const data = await this.request(userId, GARMIN_ENDPOINTS.activities, {
      query: {
        search: params.query,
        activityType: params.activityType,
        startDate: params.startDate,
        endDate: params.endDate,
        limit,
      },
    });
    return envelope(data, { startDate: params.startDate, endDate: params.endDate });
  }

  pushWorkout(userId: string, workout: unknown) {
    return this.request(userId, GARMIN_ENDPOINTS.workouts, {
      method: "POST",
      body: workout,
    });
  }

  pushTrainingPlan(userId: string, plan: unknown) {
    return this.request(userId, GARMIN_ENDPOINTS.trainingPlans, {
      method: "POST",
      body: plan,
    });
  }

  pushCourse(userId: string, course: unknown) {
    return this.request(userId, GARMIN_ENDPOINTS.courses, {
      method: "POST",
      body: course,
    });
  }

  getUserProfile(userId: string) {
    return this.request(userId, GARMIN_ENDPOINTS.userProfile);
  }

  getDevices(userId: string) {
    return this.request(userId, GARMIN_ENDPOINTS.devices);
  }
}
