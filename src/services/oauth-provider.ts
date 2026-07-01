/**
 * Garmin-backed OAuth 2.1 Authorization Server for the MCP connector.
 *
 * The MCP client (e.g. Claude.ai) is the OAuth *client*; this server is the
 * Authorization Server. Each end user completes Garmin's own OAuth flow, and we
 * mint our own access/refresh tokens that map back to that user's Garmin token
 * set. Every `/mcp` request then carries our bearer token, from which we derive
 * a stable per-user identity — so each user only ever sees their own data.
 *
 * All server state (registered clients, pending authorizations, authorization
 * codes, and issued tokens) lives in a {@link KeyValueStore}. With the in-memory
 * backend this is single-instance; with Redis it is shared across replicas, so
 * a token issued by one instance is verifiable by any other.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { buildAuthorizeUrl, exchangeCodeForTokens } from "./auth.js";
import { getJson, setJson, type KeyValueStore } from "./kv.js";
import { logger } from "../utils/logger.js";
import type { ServerConfig, TokenStore } from "../types.js";

const AUTH_CODE_TTL_SEC = 5 * 60;
const ACCESS_TOKEN_TTL_SEC = 60 * 60;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
const PENDING_TTL_SEC = 10 * 60;

const KEYS = {
  client: (id: string) => `oauth:client:${id}`,
  pending: (state: string) => `oauth:pending:${state}`,
  code: (code: string) => `oauth:code:${code}`,
  access: (token: string) => `oauth:access:${token}`,
  refresh: (token: string) => `oauth:refresh:${token}`,
};

/** A pending authorization: the MCP client's request awaiting Garmin login. */
interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

/** Our issued authorization code, bound to a user and PKCE challenge. */
interface StoredAuthCode {
  clientId: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
}

interface StoredAccessToken {
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

interface StoredRefreshToken {
  userId: string;
  clientId: string;
  scopes: string[];
}

/** Dynamic client registry backed by the shared key/value store. */
class KvClientsStore implements OAuthRegisteredClientsStore {
  constructor(private readonly kv: KeyValueStore) {}

  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return getJson<OAuthClientInformationFull>(this.kv, KEYS.client(clientId));
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): Promise<OAuthClientInformationFull> {
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    await setJson(this.kv, KEYS.client(registered.client_id), registered);
    logger.info(`Registered OAuth client ${registered.client_id}`);
    return registered;
  }
}

export class GarminOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;

  constructor(
    private readonly config: ServerConfig,
    /** Store for per-user Garmin token sets, keyed by our userId. */
    private readonly garminTokens: TokenStore,
    /** Absolute URI Garmin redirects back to (our callback route). */
    private readonly garminRedirectUri: string,
    /** Shared store for all OAuth server state. */
    private readonly kv: KeyValueStore,
  ) {
    this.clientsStore = new KvClientsStore(kv);
  }

  /**
   * Step 1: the MCP client wants to authorize. In demo mode we complete inline;
   * otherwise we stash the request and redirect the user to Garmin's consent
   * screen.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (this.config.demoMode) {
      const userId = randomUUID();
      await this.garminTokens.set(userId, {
        accessToken: `demo-${userId}`,
        tokenType: "Bearer",
        expiresAt: Date.now() + 100 * 365 * 24 * 60 * 60_000,
      });
      const code = await this.mintAuthCode(client, params, userId);
      logger.info(`[demo] auto-authorizing client ${client.client_id}`);
      res.redirect(this.buildClientRedirect(params, code));
      return;
    }

    const garminState = randomBytes(16).toString("hex");
    await setJson(
      this.kv,
      KEYS.pending(garminState),
      { client, params } satisfies PendingAuth,
      PENDING_TTL_SEC,
    );
    const url = buildAuthorizeUrl(this.config, garminState, this.garminRedirectUri);
    logger.info(`Authorizing client ${client.client_id}; redirecting to Garmin.`);
    res.redirect(url);
  }

  /**
   * Step 2 (called by the Garmin callback route): exchange Garmin's code, bind
   * a fresh user identity to the returned Garmin tokens, mint our own
   * authorization code, and return where to send the MCP client next.
   */
  async handleGarminCallback(
    garminState: string,
    garminCode: string,
  ): Promise<{ redirectTo: string }> {
    const pending = await getJson<PendingAuth>(
      this.kv,
      KEYS.pending(garminState),
    );
    if (!pending) {
      throw new Error("Unknown or expired authorization state.");
    }
    await this.kv.delete(KEYS.pending(garminState));

    const tokens = await exchangeCodeForTokens(
      this.config,
      garminCode,
      this.garminRedirectUri,
    );

    // Each successful connect gets its own user identity + Garmin token set.
    const userId = randomUUID();
    await this.garminTokens.set(userId, tokens);

    const code = await this.mintAuthCode(pending.client, pending.params, userId);
    return { redirectTo: this.buildClientRedirect(pending.params, code) };
  }

  /** Store an authorization code bound to a user + PKCE challenge. */
  private async mintAuthCode(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    userId: string,
  ): Promise<string> {
    const code = randomBytes(24).toString("hex");
    await setJson(
      this.kv,
      KEYS.code(code),
      {
        clientId: client.client_id,
        userId,
        codeChallenge: params.codeChallenge,
        redirectUri: params.redirectUri,
        scopes: params.scopes ?? [],
      } satisfies StoredAuthCode,
      AUTH_CODE_TTL_SEC,
    );
    return code;
  }

  /** Build the MCP client's redirect URL carrying our code and their state. */
  private buildClientRedirect(params: AuthorizationParams, code: string): string {
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("code", code);
    if (params.state !== undefined) {
      redirect.searchParams.set("state", params.state);
    }
    return redirect.toString();
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = await getJson<StoredAuthCode>(
      this.kv,
      KEYS.code(authorizationCode),
    );
    if (!stored) {
      throw new Error("Invalid authorization code.");
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const stored = await getJson<StoredAuthCode>(
      this.kv,
      KEYS.code(authorizationCode),
    );
    if (!stored) {
      throw new Error("Invalid authorization code.");
    }
    await this.kv.delete(KEYS.code(authorizationCode)); // one-time use
    if (stored.clientId !== client.client_id) {
      throw new Error("Authorization code was issued to a different client.");
    }
    return this.issueTokens(stored.clientId, stored.userId, stored.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const stored = await getJson<StoredRefreshToken>(
      this.kv,
      KEYS.refresh(refreshToken),
    );
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error("Invalid refresh token.");
    }
    await this.kv.delete(KEYS.refresh(refreshToken)); // rotate
    return this.issueTokens(
      stored.clientId,
      stored.userId,
      scopes && scopes.length > 0 ? scopes : stored.scopes,
    );
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = await getJson<StoredAccessToken>(this.kv, KEYS.access(token));
    if (!stored) {
      throw new Error("Invalid access token.");
    }
    if (Date.now() > stored.expiresAt) {
      await this.kv.delete(KEYS.access(token));
      throw new Error("Access token has expired.");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt / 1000),
      extra: { userId: stored.userId },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.kv.delete(KEYS.access(request.token));
    await this.kv.delete(KEYS.refresh(request.token));
  }

  private async issueTokens(
    clientId: string,
    userId: string,
    scopes: string[],
  ): Promise<OAuthTokens> {
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    await setJson(
      this.kv,
      KEYS.access(accessToken),
      {
        userId,
        clientId,
        scopes,
        expiresAt: Date.now() + ACCESS_TOKEN_TTL_SEC * 1000,
      } satisfies StoredAccessToken,
      ACCESS_TOKEN_TTL_SEC,
    );
    await setJson(
      this.kv,
      KEYS.refresh(refreshToken),
      { userId, clientId, scopes } satisfies StoredRefreshToken,
      REFRESH_TOKEN_TTL_SEC,
    );
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope: scopes.join(" ") || undefined,
    };
  }
}
