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

  /** Normalize a date range into Garmin's expected query params. */
  private dateRangeQuery(startDate: string, endDate?: string) {
    return {
      uploadStartTimeInSeconds: undefined, // placeholder for ping/pull variants
      startDate,
      endDate: endDate ?? startDate,
    };
  }

  getDailySummary(userId: string, startDate: string, endDate?: string) {
    return this.request(userId, GARMIN_ENDPOINTS.dailySummary, {
      query: this.dateRangeQuery(startDate, endDate),
    });
  }

  getHeartRate(
    userId: string,
    startDate: string,
    endDate?: string,
    includeSamples?: boolean,
  ) {
    return this.request(userId, GARMIN_ENDPOINTS.heartRate, {
      query: { ...this.dateRangeQuery(startDate, endDate), includeSamples },
    });
  }

  getSleep(
    userId: string,
    startDate: string,
    endDate?: string,
    extra?: { includeSpo2?: boolean; includeRespiration?: boolean },
  ) {
    return this.request(userId, GARMIN_ENDPOINTS.sleep, {
      query: { ...this.dateRangeQuery(startDate, endDate), ...extra },
    });
  }

  getStress(
    userId: string,
    startDate: string,
    endDate?: string,
    includeSamples?: boolean,
  ) {
    return this.request(userId, GARMIN_ENDPOINTS.stress, {
      query: { ...this.dateRangeQuery(startDate, endDate), includeSamples },
    });
  }

  getBodyBattery(userId: string, startDate: string, endDate?: string) {
    return this.request(userId, GARMIN_ENDPOINTS.bodyBattery, {
      query: this.dateRangeQuery(startDate, endDate),
    });
  }

  getPulseOx(userId: string, startDate: string, endDate?: string) {
    return this.request(userId, GARMIN_ENDPOINTS.pulseOx, {
      query: this.dateRangeQuery(startDate, endDate),
    });
  }

  getRespiration(userId: string, startDate: string, endDate?: string) {
    return this.request(userId, GARMIN_ENDPOINTS.respiration, {
      query: this.dateRangeQuery(startDate, endDate),
    });
  }

  getHrv(userId: string, startDate: string, endDate?: string) {
    return this.request(userId, GARMIN_ENDPOINTS.hrv, {
      query: this.dateRangeQuery(startDate, endDate),
    });
  }

  getHydration(userId: string, startDate: string, endDate?: string) {
    return this.request(userId, GARMIN_ENDPOINTS.hydration, {
      query: this.dateRangeQuery(startDate, endDate),
    });
  }

  getBodyComposition(
    userId: string,
    startDate: string,
    endDate?: string,
    limit?: number,
  ) {
    return this.request(userId, GARMIN_ENDPOINTS.bodyComposition, {
      query: { ...this.dateRangeQuery(startDate, endDate), limit },
    });
  }

  listActivities(
    userId: string,
    params: {
      startDate?: string;
      endDate?: string;
      activityType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.request(userId, GARMIN_ENDPOINTS.activities, {
      query: {
        startDate: params.startDate,
        endDate: params.endDate,
        activityType: params.activityType,
        limit: params.limit ?? DEFAULTS.pageSize,
        offset: params.offset ?? 0,
      },
    });
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

  searchActivities(
    userId: string,
    params: {
      query: string;
      activityType?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
  ) {
    return this.request(userId, GARMIN_ENDPOINTS.activities, {
      query: {
        search: params.query,
        activityType: params.activityType,
        startDate: params.startDate,
        endDate: params.endDate,
        limit: params.limit ?? DEFAULTS.pageSize,
      },
    });
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
