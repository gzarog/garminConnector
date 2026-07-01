import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RANGE_DAYS,
  normalizeDateRange,
  validateOptionalRange,
} from "../src/utils/dates.js";
import { GarminApiError } from "../src/types.js";

describe("normalizeDateRange", () => {
  it("defaults endDate to startDate", () => {
    const r = normalizeDateRange("2026-06-30");
    assert.equal(r.startDate, "2026-06-30");
    assert.equal(r.endDate, "2026-06-30");
    assert.equal(r.days, 1);
  });

  it("computes inclusive day count", () => {
    const r = normalizeDateRange("2026-06-01", "2026-06-07");
    assert.equal(r.days, 7);
  });

  it("derives epoch-second bounds covering the full range", () => {
    const r = normalizeDateRange("2026-06-30");
    assert.equal(r.startEpochSec, Date.parse("2026-06-30T00:00:00Z") / 1000);
    // Inclusive end is the last second of the day.
    assert.equal(r.endEpochSec, Date.parse("2026-06-30T23:59:59Z") / 1000);
    assert.ok(r.endEpochSec > r.startEpochSec);
  });

  it("rejects endDate before startDate", () => {
    assert.throws(
      () => normalizeDateRange("2026-06-30", "2026-06-01"),
      (e: unknown) => e instanceof GarminApiError && e.status === 400,
    );
  });

  it("rejects ranges longer than the maximum span", () => {
    assert.throws(
      () => normalizeDateRange("2026-01-01", "2026-12-31"),
      (e: unknown) =>
        e instanceof GarminApiError && /maximum of /.test(e.message),
    );
  });

  it("accepts a range exactly at the maximum span", () => {
    const start = "2026-06-01";
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + (MAX_RANGE_DAYS - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = normalizeDateRange(start, end);
    assert.equal(r.days, MAX_RANGE_DAYS);
  });

  it("rejects malformed dates", () => {
    assert.throws(() => normalizeDateRange("2026/06/30"), GarminApiError);
    assert.throws(() => normalizeDateRange("not-a-date"), GarminApiError);
  });
});

describe("validateOptionalRange", () => {
  it("allows both bounds omitted", () => {
    assert.doesNotThrow(() => validateOptionalRange());
  });

  it("allows a single bound", () => {
    assert.doesNotThrow(() => validateOptionalRange("2026-06-30"));
    assert.doesNotThrow(() => validateOptionalRange(undefined, "2026-06-30"));
  });

  it("does not impose the span cap", () => {
    assert.doesNotThrow(() => validateOptionalRange("2020-01-01", "2026-12-31"));
  });

  it("rejects inverted bounds", () => {
    assert.throws(
      () => validateOptionalRange("2026-06-30", "2026-06-01"),
      GarminApiError,
    );
  });
});
