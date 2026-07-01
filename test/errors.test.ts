import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RETRY_DELAY_MS,
  friendlyStatusHint,
  parseGarminError,
  parseRetryAfterMs,
} from "../src/utils/errors.js";
import { GarminApiError } from "../src/types.js";

describe("parseGarminError", () => {
  it("uses a friendly hint for the status", () => {
    const e = parseGarminError(401);
    assert.ok(e instanceof GarminApiError);
    assert.equal(e.status, 401);
    assert.match(e.message, /Reconnect your Garmin account/);
  });

  it("appends a message parsed from a JSON error body", () => {
    const e = parseGarminError(400, JSON.stringify({ message: "bad date" }));
    assert.match(e.message, /bad date/);
  });

  it("reads alternative error keys", () => {
    const e = parseGarminError(403, JSON.stringify({ error: "forbidden scope" }));
    assert.match(e.message, /forbidden scope/);
  });

  it("uses a short non-JSON body as the detail", () => {
    const e = parseGarminError(500, "upstream exploded");
    assert.match(e.message, /upstream exploded/);
  });

  it("ignores an overly long non-JSON body", () => {
    const e = parseGarminError(500, "x".repeat(500));
    assert.doesNotMatch(e.message, /xxxx/);
  });
});

describe("friendlyStatusHint", () => {
  it("covers common statuses", () => {
    assert.match(friendlyStatusHint(429), /rate limit/i);
    assert.match(friendlyStatusHint(404), /not found/i);
    assert.match(friendlyStatusHint(503), /temporarily unavailable/i);
  });
});

describe("parseRetryAfterMs", () => {
  it("returns undefined when absent", () => {
    assert.equal(parseRetryAfterMs(null), undefined);
    assert.equal(parseRetryAfterMs(undefined), undefined);
  });

  it("parses delta-seconds", () => {
    assert.equal(parseRetryAfterMs("2"), 2000);
    assert.equal(parseRetryAfterMs("0"), 0);
  });

  it("caps very large values", () => {
    assert.equal(parseRetryAfterMs("99999"), MAX_RETRY_DELAY_MS);
  });

  it("parses an HTTP-date in the future", () => {
    const future = new Date(Date.now() + 3000).toUTCString();
    const ms = parseRetryAfterMs(future);
    assert.ok(ms !== undefined && ms > 0 && ms <= MAX_RETRY_DELAY_MS);
  });

  it("returns 0 for a past HTTP-date", () => {
    const past = new Date(Date.now() - 3000).toUTCString();
    assert.equal(parseRetryAfterMs(past), 0);
  });

  it("returns undefined for garbage", () => {
    assert.equal(parseRetryAfterMs("soon"), undefined);
  });
});
