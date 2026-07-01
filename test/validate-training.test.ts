import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCourse, validateWorkout } from "../src/utils/validate-training.js";
import { GarminApiError } from "../src/types.js";

describe("validateWorkout", () => {
  it("accepts a valid workout", () => {
    assert.doesNotThrow(() =>
      validateWorkout({
        name: "Intervals",
        steps: [
          { type: "warmup", durationType: "time", durationValue: 600 },
          {
            type: "interval",
            durationType: "distance",
            durationValue: 1000,
            targetType: "pace",
            targetLow: 300,
            targetHigh: 330,
          },
          { type: "cooldown", durationType: "open" },
        ],
      }),
    );
  });

  it("requires durationValue for timed/distance steps", () => {
    assert.throws(
      () =>
        validateWorkout({
          name: "x",
          steps: [{ type: "interval", durationType: "time" }],
        }),
      (e: unknown) =>
        e instanceof GarminApiError &&
        e.status === 400 &&
        /durationValue is required/.test(e.message),
    );
  });

  it("rejects non-positive durations", () => {
    assert.throws(
      () =>
        validateWorkout({
          name: "x",
          steps: [{ type: "interval", durationType: "time", durationValue: 0 }],
        }),
      GarminApiError,
    );
  });

  it("rejects an inverted target range", () => {
    assert.throws(
      () =>
        validateWorkout({
          name: "x",
          steps: [
            {
              type: "interval",
              durationType: "open",
              targetType: "heart_rate",
              targetLow: 170,
              targetHigh: 150,
            },
          ],
        }),
      (e: unknown) =>
        e instanceof GarminApiError && /must not exceed targetHigh/.test(e.message),
    );
  });

  it("allows open steps without a duration", () => {
    assert.doesNotThrow(() =>
      validateWorkout({ name: "x", steps: [{ type: "rest", durationType: "open" }] }),
    );
  });
});

describe("validateCourse", () => {
  it("accepts two distinct points", () => {
    assert.doesNotThrow(() =>
      validateCourse({
        points: [
          { lat: 40.0, lng: -105.0 },
          { lat: 40.1, lng: -105.1 },
        ],
      }),
    );
  });

  it("rejects a course whose points are all identical", () => {
    assert.throws(
      () =>
        validateCourse({
          points: [
            { lat: 40.0, lng: -105.0 },
            { lat: 40.0, lng: -105.0 },
          ],
        }),
      (e: unknown) =>
        e instanceof GarminApiError && /two distinct GPS points/.test(e.message),
    );
  });
});
