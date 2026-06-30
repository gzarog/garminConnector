/**
 * API URLs, limits, and defaults.
 *
 * Endpoint paths follow the Garmin Connect Developer Program Health and
 * Activity API structure. They are centralized here so that swapping or
 * versioning endpoints does not require touching the client or tools.
 */

import process from "node:process";

export const SERVER_NAME = "garmin-mcp-server";
export const SERVER_VERSION = "0.1.0";

/** Garmin REST API base. Override via GARMIN_API_BASE_URL. */
export const GARMIN_API_BASE_URL =
  process.env.GARMIN_API_BASE_URL ?? "https://apis.garmin.com";

/** Garmin OAuth 2.0 endpoints. */
export const GARMIN_AUTHORIZE_URL =
  process.env.GARMIN_AUTHORIZE_URL ?? "https://connect.garmin.com/oauth2Confirm";
export const GARMIN_TOKEN_URL =
  process.env.GARMIN_TOKEN_URL ??
  "https://diauth.garmin.com/di-oauth2-service/oauth/token";

/**
 * Garmin Health / Activity / Training API paths.
 * These are relative to GARMIN_API_BASE_URL.
 */
export const GARMIN_ENDPOINTS = {
  // Health API
  dailySummary: "/wellness-api/rest/dailies",
  heartRate: "/wellness-api/rest/heartRate",
  sleep: "/wellness-api/rest/sleeps",
  stress: "/wellness-api/rest/stressDetails",
  bodyBattery: "/wellness-api/rest/bodyBattery",
  pulseOx: "/wellness-api/rest/pulseOx",
  respiration: "/wellness-api/rest/respiration",
  bodyComposition: "/wellness-api/rest/bodyComps",
  hrv: "/wellness-api/rest/hrv",
  hydration: "/wellness-api/rest/hydration",

  // Activity API
  activities: "/activity-api/rest/activities",
  activityDetail: "/activity-api/rest/activityDetails",
  activitySplits: "/activity-api/rest/activitySplits",

  // Training / Courses API (write)
  workouts: "/training-api/rest/workouts",
  trainingPlans: "/training-api/rest/trainingPlans",
  courses: "/courses-api/rest/courses",

  // User / device
  userProfile: "/wellness-api/rest/user",
  devices: "/wellness-api/rest/userDevices",
} as const;

/** Request defaults and limits. */
export const DEFAULTS = {
  /** Default page size for paginated list endpoints. */
  pageSize: 20,
  /** Maximum page size we will request. */
  maxPageSize: 100,
  /** HTTP request timeout in milliseconds. */
  requestTimeoutMs: 30_000,
  /** Number of automatic retries for transient (5xx / network) failures. */
  maxRetries: 3,
  /** Base backoff in milliseconds (doubles each retry). */
  retryBaseDelayMs: 500,
} as const;

/** Default OAuth scopes if none are provided via env. */
export const DEFAULT_SCOPES = (process.env.GARMIN_SCOPES ?? "")
  .split(/\s+/)
  .filter(Boolean);
