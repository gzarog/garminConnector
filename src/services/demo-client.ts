/**
 * Demo Garmin client.
 *
 * Extends {@link GarminClient} and overrides only the low-level `request` so all
 * the real input validation, date-range handling, enveloping, and pagination
 * still run — but responses are sample data instead of live Garmin calls. This
 * lets the connector be added to Claude and exercised end-to-end without a
 * Garmin developer app (DEMO_MODE=true).
 */

import { GARMIN_ENDPOINTS } from "../constants.js";
import { GarminClient } from "./garmin-client.js";
import type { GarminRequestOptions, ServerConfig, TokenStore } from "../types.js";

function isoFromQuery(options: GarminRequestOptions): string {
  const secs = options.query?.uploadStartTimeInSeconds;
  const ms = typeof secs === "number" ? secs * 1000 : Date.now();
  return new Date(ms).toISOString().slice(0, 10);
}

function sampleActivities(count: number) {
  const types = ["running", "cycling", "walking"] as const;
  return Array.from({ length: count }, (_, i) => ({
    activityId: `demo-${1000 + i}`,
    activityName: `${types[i % types.length]} session ${i + 1}`,
    activityType: types[i % types.length],
    startTimeLocal: `2026-06-${String(20 + (i % 9)).padStart(2, "0")}T07:0${i % 6}:00`,
    distanceMeters: 5000 + i * 750,
    durationSeconds: 1800 + i * 300,
    averageHeartRate: 138 + (i % 12),
    calories: 320 + i * 40,
  }));
}

export class DemoGarminClient extends GarminClient {
  constructor(config: ServerConfig, store: TokenStore) {
    super(config, store);
  }

  /** Return canned data keyed by endpoint path; never touches the network. */
  override async request<T = unknown>(
    _userId: string,
    path: string,
    options: GarminRequestOptions = {},
  ): Promise<T> {
    const date = isoFromQuery(options);
    const data = this.dataForPath(path, date);
    return data as T;
  }

  private dataForPath(path: string, date: string): unknown {
    switch (path) {
      case GARMIN_ENDPOINTS.dailySummary:
        return [
          {
            calendarDate: date,
            steps: 9432,
            activeKilocalories: 620,
            totalKilocalories: 2380,
            distanceInMeters: 7120,
            floorsClimbed: 12,
            intensityMinutes: 47,
          },
        ];
      case GARMIN_ENDPOINTS.heartRate:
        return [
          {
            calendarDate: date,
            restingHeartRate: 52,
            maxHeartRate: 171,
            minHeartRate: 48,
            averageHeartRate: 68,
          },
        ];
      case GARMIN_ENDPOINTS.sleep:
        return [
          {
            calendarDate: date,
            durationSeconds: 27180,
            deepSleepSeconds: 6120,
            lightSleepSeconds: 15480,
            remSleepSeconds: 4680,
            awakeSeconds: 900,
            sleepScore: 82,
            averageSpo2: 96,
            averageRespirationValue: 14.2,
          },
        ];
      case GARMIN_ENDPOINTS.stress:
        return [
          {
            calendarDate: date,
            averageStressLevel: 34,
            maxStressLevel: 88,
            restStressDurationSeconds: 18000,
            highStressDurationSeconds: 3600,
          },
        ];
      case GARMIN_ENDPOINTS.bodyBattery:
        return [
          { calendarDate: date, charged: 61, drained: 47, highestLevel: 84, lowestLevel: 22 },
        ];
      case GARMIN_ENDPOINTS.pulseOx:
        return [{ calendarDate: date, averageSpo2: 96, lowestSpo2: 91 }];
      case GARMIN_ENDPOINTS.respiration:
        return [
          { calendarDate: date, avgWakingRespirationValue: 14, avgSleepRespirationValue: 13 },
        ];
      case GARMIN_ENDPOINTS.hrv:
        return [
          { calendarDate: date, status: "BALANCED", weeklyAvgMs: 62, lastNightAvgMs: 58 },
        ];
      case GARMIN_ENDPOINTS.hydration:
        return [{ calendarDate: date, valueInMl: 1800, goalInMl: 2500 }];
      case GARMIN_ENDPOINTS.bodyComposition:
        return [
          {
            calendarDate: date,
            weightGrams: 75200,
            bmi: 23.1,
            bodyFatPercentage: 18.4,
            muscleMassGrams: 34100,
            boneMassGrams: 3200,
          },
        ];
      case GARMIN_ENDPOINTS.activities:
        return sampleActivities(3);
      case GARMIN_ENDPOINTS.userProfile:
        return {
          displayName: "Demo User",
          measurementSystem: "metric",
          timeZone: "Europe/Athens",
          vo2Max: 51,
        };
      case GARMIN_ENDPOINTS.devices:
        return [
          { deviceId: "demo-device-1", productName: "Forerunner 965", firmwareVersion: "20.26" },
          { deviceId: "demo-device-2", productName: "Index S2 Scale", firmwareVersion: "3.10" },
        ];
      case GARMIN_ENDPOINTS.workouts:
        return { status: "sent", workoutId: "demo-workout-1", message: "Workout sent to device." };
      case GARMIN_ENDPOINTS.trainingPlans:
        return { status: "sent", planId: "demo-plan-1", message: "Training plan scheduled." };
      case GARMIN_ENDPOINTS.courses:
        return { status: "sent", courseId: "demo-course-1", message: "Course sent to device." };
      default:
        // Activity detail / splits carry the id in the path.
        if (path.startsWith(GARMIN_ENDPOINTS.activityDetail)) {
          return {
            activityId: path.split("/").pop(),
            activityName: "Morning run",
            activityType: "running",
            distanceMeters: 10230,
            durationSeconds: 3120,
            averageHeartRate: 148,
            elevationGainMeters: 96,
            laps: [
              { lap: 1, distanceMeters: 1000, durationSeconds: 300, averageHeartRate: 142 },
              { lap: 2, distanceMeters: 1000, durationSeconds: 295, averageHeartRate: 150 },
            ],
            hrZones: [
              { zone: 1, seconds: 300 },
              { zone: 2, seconds: 1200 },
              { zone: 3, seconds: 1000 },
              { zone: 4, seconds: 500 },
              { zone: 5, seconds: 120 },
            ],
          };
        }
        if (path.startsWith(GARMIN_ENDPOINTS.activitySplits)) {
          return {
            activityId: path.split("/").pop(),
            splits: [
              { index: 1, distanceMeters: 1000, durationSeconds: 300, averageHeartRate: 142 },
              { index: 2, distanceMeters: 1000, durationSeconds: 295, averageHeartRate: 150 },
              { index: 3, distanceMeters: 1000, durationSeconds: 305, averageHeartRate: 147 },
            ],
          };
        }
        return {};
    }
  }
}
