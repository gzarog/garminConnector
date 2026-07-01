import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { DemoGarminClient } from "../src/services/demo-client.js";
import { GarminOAuthProvider } from "../src/services/oauth-provider.js";
import { MemoryTokenStore } from "../src/services/token-store.js";
import { MemoryKeyValueStore } from "../src/services/kv.js";
import { GarminApiError } from "../src/types.js";
import { makeConfig } from "./helpers.js";

const USER = "demo-user";
const CLIENT_REDIRECT = "https://claude.ai/api/mcp/auth_callback";

describe("DemoGarminClient", () => {
  const client = () =>
    new DemoGarminClient(makeConfig({ demoMode: true }), new MemoryTokenStore());

  it("returns enveloped sample sleep data", async () => {
    const res = (await client().getSleep(USER, "2026-06-28")) as {
      meta: { count?: number; days?: number };
      data: Array<{ sleepScore: number }>;
    };
    assert.equal(res.meta.days, 1);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].sleepScore, 82);
  });

  it("returns a daily summary with real steps", async () => {
    const res = (await client().getDailySummary(USER, "2026-06-28")) as {
      data: Array<{ steps: number }>;
    };
    assert.ok(res.data[0].steps > 0);
  });

  it("lists sample activities", async () => {
    const res = (await client().listActivities(USER, { limit: 10 })) as {
      meta: { count?: number };
      data: unknown[];
    };
    assert.equal(res.meta.count, 3);
    assert.equal(res.data.length, 3);
  });

  it("still validates inputs (bad date rejected, no data returned)", async () => {
    await assert.rejects(
      async () => client().getSleep(USER, "not-a-date"),
      GarminApiError,
    );
  });

  it("still validates write payloads", async () => {
    await assert.rejects(
      () =>
        client().pushWorkout(USER, {
          name: "x",
          steps: [{ type: "interval", durationType: "time" }],
        }),
      GarminApiError,
    );
  });

  it("acknowledges a valid pushed workout", async () => {
    const res = (await client().pushWorkout(USER, {
      name: "Intervals",
      steps: [{ type: "warmup", durationType: "time", durationValue: 300 }],
    })) as { status: string };
    assert.equal(res.status, "sent");
  });
});

describe("GarminOAuthProvider (demo mode)", () => {
  it("auto-authorizes without redirecting to Garmin", async () => {
    const store = new MemoryTokenStore();
    const provider = new GarminOAuthProvider(
      makeConfig({ demoMode: true }),
      store,
      "http://localhost:3999/oauth/callback",
      new MemoryKeyValueStore(),
    );
    const client = await provider.clientsStore.registerClient({
      redirect_uris: [CLIENT_REDIRECT],
    } as never);

    let redirectedTo = "";
    const res = { redirect: (u: string) => (redirectedTo = u) } as unknown as Response;
    await provider.authorize(
      client,
      { codeChallenge: "c", redirectUri: CLIENT_REDIRECT, state: "st", scopes: [] },
      res,
    );

    // Redirect goes straight back to the MCP client (not to Garmin).
    const url = new URL(redirectedTo);
    assert.equal(url.origin + url.pathname, CLIENT_REDIRECT);
    assert.equal(url.searchParams.get("state"), "st");
    const code = url.searchParams.get("code")!;
    assert.ok(code);

    const tokens = await provider.exchangeAuthorizationCode(client, code);
    const authInfo = await provider.verifyAccessToken(tokens.access_token);
    const userId = authInfo.extra!.userId as string;
    const stored = await store.get(userId);
    assert.match(stored!.accessToken, /^demo-/);
  });
});
