/**
 * Shared TypeScript interfaces.
 */

/** OAuth 2.0 token set persisted per user. */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

/** A per-user authenticated session. */
export interface UserSession {
  /** Stable identifier for the user (derived from the MCP auth token). */
  userId: string;
  tokens: TokenSet;
}

/** Token storage backend abstraction. */
export interface TokenStore {
  get(userId: string): Promise<TokenSet | undefined>;
  set(userId: string, tokens: TokenSet): Promise<void>;
  delete(userId: string): Promise<void>;
}

/** Options accepted by the Garmin API client request helper. */
export interface GarminRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Query string parameters. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON request body (for POST/PUT). */
  body?: unknown;
  /** Override the default request timeout. */
  timeoutMs?: number;
}

/** Normalized error surfaced from the Garmin API client. */
export class GarminApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "GarminApiError";
    this.status = status;
    this.details = details;
  }
}

/** Server runtime configuration resolved from the environment. */
export interface ServerConfig {
  transport: "http" | "stdio";
  port: number;
  host: string;
  publicBaseUrl: string;
  garmin: {
    clientId: string;
    clientSecret: string;
    authorizeUrl: string;
    tokenUrl: string;
    apiBaseUrl: string;
    scopes: string[];
  };
  tokenStore: "memory" | "redis";
  redisUrl?: string;
  logLevel: string;
}
