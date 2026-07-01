import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GarminClient } from "../src/services/garmin-client.js";
import { GarminApiError } from "../src/types.js";
import { makeConfig, makeResponse, storeWithToken, stubFetch } from "./helpers.js";

const USER = "user-1";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("GarminClient.request", () => {
  it("returns parsed JSON on success", async () => {
    const f = stubFetch([makeResponse(200, { restingHeartRate: 52 })]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    const result = await client.request(USER, "/wellness-api/rest/user");
    assert.deepEqual(result, { restingHeartRate: 52 });
    assert.equal(f.calls.length, 1);
  });

  it("sends a Bearer token", async () => {
    const f = stubFetch([makeResponse(200, {})]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    await client.request(USER, "/x");
    const auth = (f.calls[0].init?.headers as Record<string, string>)?.Authorization;
    assert.equal(auth, "Bearer valid-access-token");
  });

  it("retries transient 503 then succeeds", async () => {
    const f = stubFetch([
      makeResponse(503, "unavailable"),
      makeResponse(200, { ok: true }),
    ]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    const result = await client.request(USER, "/x");
    assert.deepEqual(result, { ok: true });
    assert.equal(f.calls.length, 2);
  });

  it("does not retry a non-retryable 404", async () => {
    const f = stubFetch([makeResponse(404, "not found")]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    await assert.rejects(
      () => client.request(USER, "/x"),
      (e: unknown) => e instanceof GarminApiError && e.status === 404,
    );
    assert.equal(f.calls.length, 1);
  });

  it("returns undefined for 204 No Content", async () => {
    const f = stubFetch([makeResponse(204, "")]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    const result = await client.request(USER, "/x");
    assert.equal(result, undefined);
  });
});

describe("GarminClient.listActivities", () => {
  it("paginates across pages and envelopes the result", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 5 }, (_, i) => ({ id: 20 + i }));
    const f = stubFetch([makeResponse(200, page1), makeResponse(200, page2)]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));

    const result = await client.listActivities(USER, { limit: 25 });
    assert.equal(result.meta.count, 25);
    assert.equal((result.data as unknown[]).length, 25);
    assert.equal(f.calls.length, 2);
  });

  it("stops early on a short first page", async () => {
    const page = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const f = stubFetch([makeResponse(200, page)]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));

    const result = await client.listActivities(USER, { limit: 50 });
    assert.equal(result.meta.count, 3);
    assert.equal(f.calls.length, 1);
  });

  it("validates an inverted date range before calling the API", async () => {
    const f = stubFetch([makeResponse(200, [])]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    await assert.rejects(
      () =>
        client.listActivities(USER, {
          startDate: "2026-06-30",
          endDate: "2026-06-01",
        }),
      GarminApiError,
    );
    assert.equal(f.calls.length, 0);
  });
});

describe("GarminClient error handling", () => {
  it("honors a Retry-After header on 429 and then succeeds", async () => {
    const f = stubFetch([
      makeResponse(429, { message: "slow down" }, { "retry-after": "0" }),
      makeResponse(200, { ok: true }),
    ]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    const result = await client.request(USER, "/x");
    assert.deepEqual(result, { ok: true });
    assert.equal(f.calls.length, 2);
  });

  it("surfaces a friendly, parsed error message", async () => {
    const f = stubFetch([makeResponse(400, { message: "bad param" })]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    await assert.rejects(
      () => client.request(USER, "/x"),
      (e: unknown) =>
        e instanceof GarminApiError && e.status === 400 && /bad param/.test(e.message),
    );
  });
});

describe("GarminClient write validation", () => {
  it("rejects an invalid workout before calling the API", async () => {
    const f = stubFetch([makeResponse(200, {})]);
    restore = f.restore;
    const client = new GarminClient(makeConfig(), storeWithToken(USER));
    await assert.rejects(
      () =>
        client.pushWorkout(USER, {
          name: "x",
          steps: [{ type: "interval", durationType: "time" }],
        }),
      GarminApiError,
    );
    assert.equal(f.calls.length, 0);
  });
});
