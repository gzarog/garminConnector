import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { GarminOAuthProvider } from "../src/services/oauth-provider.js";
import { MemoryTokenStore } from "../src/services/token-store.js";
import { MemoryKeyValueStore } from "../src/services/kv.js";
import { makeConfig, makeResponse, stubFetch } from "./helpers.js";

const REDIRECT = "http://localhost:3999/oauth/callback";
const CLIENT_REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function newProvider(store = new MemoryTokenStore()) {
  return new GarminOAuthProvider(makeConfig(), store, REDIRECT, new MemoryKeyValueStore());
}

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Register a client and run authorize, returning the Garmin `state`. */
async function beginAuthorize(
  provider: GarminOAuthProvider,
  clientState: string,
) {
  const client = await provider.clientsStore.registerClient({
    redirect_uris: [CLIENT_REDIRECT],
  } as never);

  let redirectedTo = "";
  const res = { redirect: (url: string) => (redirectedTo = url) } as unknown as Response;
  await provider.authorize(
    client,
    {
      codeChallenge: "challenge123",
      redirectUri: CLIENT_REDIRECT,
      state: clientState,
      scopes: [],
    },
    res,
  );
  const garminState = new URL(redirectedTo).searchParams.get("state");
  assert.ok(garminState, "authorize should redirect to Garmin with a state");
  return { client, garminState: garminState! };
}

/** Complete a full connect and return the minted access token + user id. */
async function connectUser(
  provider: GarminOAuthProvider,
  clientState: string,
  garminAccessToken: string,
) {
  const f = stubFetch([
    makeResponse(200, {
      access_token: garminAccessToken,
      refresh_token: `${garminAccessToken}-refresh`,
      expires_in: 3600,
      token_type: "Bearer",
    }),
  ]);
  restore = f.restore;

  const { client, garminState } = await beginAuthorize(provider, clientState);
  const { redirectTo } = await provider.handleGarminCallback(
    garminState,
    "garmin-auth-code",
  );

  const back = new URL(redirectTo);
  assert.equal(back.origin + back.pathname, CLIENT_REDIRECT);
  assert.equal(back.searchParams.get("state"), clientState);
  const code = back.searchParams.get("code")!;
  assert.ok(code);

  const tokens = await provider.exchangeAuthorizationCode(client, code);
  const authInfo = await provider.verifyAccessToken(tokens.access_token);
  restore();
  restore = undefined;
  return { tokens, userId: authInfo.extra!.userId as string, authInfo };
}

describe("GarminOAuthProvider", () => {
  it("isolates two users' Garmin tokens", async () => {
    const store = new MemoryTokenStore();
    const provider = newProvider(store);

    const a = await connectUser(provider, "state-A", "garmin-access-A");
    const b = await connectUser(provider, "state-B", "garmin-access-B");

    // Distinct identities and distinct MCP access tokens.
    assert.notEqual(a.userId, b.userId);
    assert.notEqual(a.tokens.access_token, b.tokens.access_token);

    // Each user id maps to its own Garmin token set.
    assert.equal((await store.get(a.userId))?.accessToken, "garmin-access-A");
    assert.equal((await store.get(b.userId))?.accessToken, "garmin-access-B");
  });

  it("shares state across instances via a common key/value store", async () => {
    // Two server instances (e.g. two replicas) backed by the same Redis-like KV.
    const kv = new MemoryKeyValueStore();
    const store = new MemoryTokenStore();
    const cfg = makeConfig();
    const instanceA = new GarminOAuthProvider(cfg, store, REDIRECT, kv);
    const instanceB = new GarminOAuthProvider(cfg, store, REDIRECT, kv);

    // Connect on instance A.
    const { tokens } = await connectUser(instanceA, "s", "garmin-access");

    // Instance B can verify the token A issued, and resolve the same user.
    const authInfo = await instanceB.verifyAccessToken(tokens.access_token);
    assert.ok(authInfo.extra?.userId);

    // A client registered on A is visible on B.
    const registered = await instanceA.clientsStore.registerClient({
      redirect_uris: [CLIENT_REDIRECT],
    } as never);
    const seenByB = await instanceB.clientsStore.getClient(registered.client_id);
    assert.equal(seenByB?.client_id, registered.client_id);
  });

  it("issues a bearer access token with the user id in authInfo.extra", async () => {
    const store = new MemoryTokenStore();
    const provider = newProvider(store);
    const { tokens, authInfo } = await connectUser(provider, "s", "garmin-access");
    assert.equal(tokens.token_type, "Bearer");
    assert.ok(tokens.refresh_token);
    assert.ok(authInfo.extra?.userId);
  });

  it("rejects an unknown callback state", async () => {
    const provider = newProvider();
    await assert.rejects(
      () => provider.handleGarminCallback("nope", "code"),
      /Unknown or expired authorization state/,
    );
  });

  it("rejects an unknown access token", async () => {
    const provider = newProvider();
    await assert.rejects(() => provider.verifyAccessToken("bogus"), /Invalid access token/);
  });

  it("does not reuse an authorization code", async () => {
    const store = new MemoryTokenStore();
    const provider = newProvider(store);

    const f = stubFetch([
      makeResponse(200, { access_token: "g", expires_in: 3600, token_type: "Bearer" }),
    ]);
    restore = f.restore;
    const { client, garminState } = await beginAuthorize(provider, "s");
    const { redirectTo } = await provider.handleGarminCallback(garminState, "c");
    const code = new URL(redirectTo).searchParams.get("code")!;

    await provider.exchangeAuthorizationCode(client, code);
    await assert.rejects(
      () => provider.exchangeAuthorizationCode(client, code),
      /Invalid authorization code/,
    );
  });

  it("rotates refresh tokens", async () => {
    const store = new MemoryTokenStore();
    const provider = newProvider(store);
    const { tokens } = await connectUser(provider, "s", "garmin-access");

    // The refresh token was issued to the original client; reuse its id.
    const clientId = (await provider.verifyAccessToken(tokens.access_token)).clientId;
    const refreshed = await provider.exchangeRefreshToken(
      { client_id: clientId } as never,
      tokens.refresh_token!,
    );
    assert.ok(refreshed.access_token);
    assert.notEqual(refreshed.access_token, tokens.access_token);
    // Old refresh token no longer works.
    await assert.rejects(
      () => provider.exchangeRefreshToken({ client_id: "x" } as never, tokens.refresh_token!),
      /Invalid refresh token/,
    );
  });
});
