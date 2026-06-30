/**
 * OAuth 2.0 flow handlers for Garmin Connect.
 *
 * Implements the authorization-code grant and refresh-token grant described in
 * ARCHITECTURE.md. The HTTP layer (Express routes in index.ts) calls into these
 * helpers; the helpers themselves are transport-agnostic and testable.
 */

import { randomBytes } from "node:crypto";
import type { ServerConfig, TokenSet, TokenStore } from "../types.js";
import { GarminApiError } from "../types.js";

/** Build the Garmin authorization URL the user is redirected to. */
export function buildAuthorizeUrl(
  config: ServerConfig,
  state: string,
  redirectUri: string,
): string {
  const url = new URL(config.garmin.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.garmin.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (config.garmin.scopes.length > 0) {
    url.searchParams.set("scope", config.garmin.scopes.join(" "));
  }
  return url.toString();
}

/** Generate a cryptographically random `state` value for CSRF protection. */
export function generateState(): string {
  return randomBytes(16).toString("hex");
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

function toTokenSet(raw: RawTokenResponse): TokenSet {
  const expiresInMs = (raw.expires_in ?? 3600) * 1000;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    tokenType: raw.token_type ?? "Bearer",
    expiresAt: Date.now() + expiresInMs,
    scope: raw.scope,
  };
}

async function postTokenRequest(
  config: ServerConfig,
  params: URLSearchParams,
): Promise<TokenSet> {
  const basic = Buffer.from(
    `${config.garmin.clientId}:${config.garmin.clientSecret}`,
  ).toString("base64");

  const res = await fetch(config.garmin.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => undefined);
    throw new GarminApiError(
      `Garmin token request failed (${res.status})`,
      res.status,
      details,
    );
  }

  const raw = (await res.json()) as RawTokenResponse;
  return toTokenSet(raw);
}

/** Exchange an authorization code for an access/refresh token pair. */
export async function exchangeCodeForTokens(
  config: ServerConfig,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.garmin.clientId,
  });
  return postTokenRequest(config, params);
}

/** Refresh an expired access token using the refresh token. */
export async function refreshTokens(
  config: ServerConfig,
  refreshToken: string,
): Promise<TokenSet> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.garmin.clientId,
  });
  return postTokenRequest(config, params);
}

/**
 * Return a valid access token for a user, refreshing it if it is expired or
 * about to expire. Throws if the user has no stored tokens.
 */
export async function getValidAccessToken(
  config: ServerConfig,
  store: TokenStore,
  userId: string,
): Promise<string> {
  const tokens = await store.get(userId);
  if (!tokens) {
    throw new GarminApiError(
      "Not authenticated with Garmin. Connect your account first.",
      401,
    );
  }

  // Refresh 60s before actual expiry to avoid edge-of-expiry failures.
  const isExpiring = Date.now() >= tokens.expiresAt - 60_000;
  if (!isExpiring) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    throw new GarminApiError(
      "Garmin access token expired and no refresh token is available. " +
        "Please reconnect your account.",
      401,
    );
  }

  const refreshed = await refreshTokens(config, tokens.refreshToken);
  // Garmin may not return a new refresh token; keep the previous one.
  if (!refreshed.refreshToken) {
    refreshed.refreshToken = tokens.refreshToken;
  }
  await store.set(userId, refreshed);
  return refreshed.accessToken;
}
