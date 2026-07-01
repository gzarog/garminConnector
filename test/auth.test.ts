import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getValidAccessToken } from "../src/services/auth.js";
import { GarminApiError } from "../src/types.js";
import { MemoryTokenStore } from "../src/services/token-store.js";
import { makeConfig, makeResponse, storeWithToken, stubFetch } from "./helpers.js";

const USER = "user-1";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("getValidAccessToken", () => {
  it("returns the current token when it is not expiring", async () => {
    const f = stubFetch([makeResponse(200, {})]);
    restore = f.restore;
    const token = await getValidAccessToken(makeConfig(), storeWithToken(USER), USER);
    assert.equal(token, "valid-access-token");
    // No refresh request should have been made.
    assert.equal(f.calls.length, 0);
  });

  it("refreshes an expiring token and persists the new one", async () => {
    const f = stubFetch([
      makeResponse(200, {
        access_token: "fresh-token",
        refresh_token: "fresh-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    ]);
    restore = f.restore;
    const store = storeWithToken(USER, { expiresAt: Date.now() + 10_000 });
    const token = await getValidAccessToken(makeConfig(), store, USER);
    assert.equal(token, "fresh-token");
    const stored = await store.get(USER);
    assert.equal(stored?.accessToken, "fresh-token");
    assert.equal(stored?.refreshToken, "fresh-refresh");
  });

  it("keeps the prior refresh token if the refresh response omits one", async () => {
    const f = stubFetch([
      makeResponse(200, { access_token: "fresh-token", expires_in: 3600 }),
    ]);
    restore = f.restore;
    const store = storeWithToken(USER, { expiresAt: Date.now() + 10_000 });
    await getValidAccessToken(makeConfig(), store, USER);
    const stored = await store.get(USER);
    assert.equal(stored?.refreshToken, "valid-refresh-token");
  });

  it("throws 401 when the user has no stored tokens", async () => {
    await assert.rejects(
      () => getValidAccessToken(makeConfig(), new MemoryTokenStore(), USER),
      (e: unknown) => e instanceof GarminApiError && e.status === 401,
    );
  });

  it("throws 401 when expiring with no refresh token", async () => {
    const store = storeWithToken(USER, {
      expiresAt: Date.now() + 10_000,
      refreshToken: undefined,
    });
    await assert.rejects(
      () => getValidAccessToken(makeConfig(), store, USER),
      (e: unknown) => e instanceof GarminApiError && e.status === 401,
    );
  });
});
