/**
 * Garmin-backed OAuth 2.1 Authorization Server for the MCP connector.
 *
 * The MCP client (e.g. Claude.ai) is the OAuth *client*; this server is the
 * Authorization Server. Each end user completes Garmin's own OAuth flow, and we
 * mint our own access/refresh tokens that map back to that user's Garmin token
 * set. Every `/mcp` request then carries our bearer token, from which we derive
 * a stable per-user identity — so each user only ever sees their own data.
 *
 * State is held in memory: correct for a single instance. For multi-instance
 * hosting, back these maps with the same store used for Garmin tokens (Redis).
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
import { logger } from "../utils/logger.js";
import type { ServerConfig, TokenStore } from "../types.js";

const AUTH_CODE_TTL_MS = 5 * 60_000;
const ACCESS_TOKEN_TTL_MS = 60 * 60_000;

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
  expiresAt: number;
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

/** In-memory dynamic client registry. */
class MemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(registered.client_id, registered);
    logger.info(`Registered OAuth client ${registered.client_id}`);
    return registered;
  }
}

export class GarminOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new MemoryClientsStore();

  private readonly pending = new Map<string, PendingAuth>();
  private readonly authCodes = new Map<string, StoredAuthCode>();
  private readonly accessTokens = new Map<string, StoredAccessToken>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();

  constructor(
    private readonly config: ServerConfig,
    /** Store for per-user Garmin token sets, keyed by our userId. */
    private readonly garminTokens: TokenStore,
    /** Absolute URI Garmin redirects back to (our callback route). */
    private readonly garminRedirectUri: string,
  ) {}

  /**
   * Step 1: the MCP client wants to authorize. Stash the request and redirect
   * the user to Garmin's consent screen.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const garminState = randomBytes(16).toString("hex");
    this.pending.set(garminState, { client, params });
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
    const pending = this.pending.get(garminState);
    if (!pending) {
      throw new Error("Unknown or expired authorization state.");
    }
    this.pending.delete(garminState);

    const tokens = await exchangeCodeForTokens(
      this.config,
      garminCode,
      this.garminRedirectUri,
    );

    // Each successful connect gets its own user identity + Garmin token set.
    const userId = randomUUID();
    await this.garminTokens.set(userId, tokens);

    const code = randomBytes(24).toString("hex");
    this.authCodes.set(code, {
      clientId: pending.client.client_id,
      userId,
      codeChallenge: pending.params.codeChallenge,
      redirectUri: pending.params.redirectUri,
      scopes: pending.params.scopes ?? [],
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const redirect = new URL(pending.params.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.params.state !== undefined) {
      redirect.searchParams.set("state", pending.params.state);
    }
    return { redirectTo: redirect.toString() };
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new Error("Invalid authorization code.");
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new Error("Invalid authorization code.");
    }
    this.authCodes.delete(authorizationCode); // one-time use
    if (stored.clientId !== client.client_id) {
      throw new Error("Authorization code was issued to a different client.");
    }
    if (Date.now() > stored.expiresAt) {
      throw new Error("Authorization code has expired.");
    }
    return this.issueTokens(stored.clientId, stored.userId, stored.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const stored = this.refreshTokens.get(refreshToken);
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error("Invalid refresh token.");
    }
    this.refreshTokens.delete(refreshToken); // rotate
    return this.issueTokens(
      stored.clientId,
      stored.userId,
      scopes && scopes.length > 0 ? scopes : stored.scopes,
    );
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.accessTokens.get(token);
    if (!stored) {
      throw new Error("Invalid access token.");
    }
    if (Date.now() > stored.expiresAt) {
      this.accessTokens.delete(token);
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
    this.accessTokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }

  private issueTokens(
    clientId: string,
    userId: string,
    scopes: string[],
  ): OAuthTokens {
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    this.accessTokens.set(accessToken, {
      userId,
      clientId,
      scopes,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    });
    this.refreshTokens.set(refreshToken, { userId, clientId, scopes });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: scopes.join(" ") || undefined,
    };
  }
}
