/**
 * Token persistence.
 *
 * Provides an in-memory implementation suitable for local development and a
 * factory that can be extended to Redis/KV for production multi-instance
 * deployments. The interface is intentionally small so backends are swappable.
 */

import type { TokenSet, TokenStore } from "../types.js";

/** Simple in-process token store. Not suitable for multi-instance hosting. */
export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, TokenSet>();

  async get(userId: string): Promise<TokenSet | undefined> {
    return this.tokens.get(userId);
  }

  async set(userId: string, tokens: TokenSet): Promise<void> {
    this.tokens.set(userId, tokens);
  }

  async delete(userId: string): Promise<void> {
    this.tokens.delete(userId);
  }
}

/**
 * Create a token store from configuration.
 *
 * The Redis backend is a placeholder: wiring a real client (e.g. `ioredis`)
 * is left as a deployment-time concern so the core package stays dependency
 * light. Until then we fall back to in-memory with a warning.
 */
export function createTokenStore(
  backend: "memory" | "redis",
  redisUrl?: string,
): TokenStore {
  if (backend === "redis") {
    if (!redisUrl) {
      console.warn(
        "[token-store] TOKEN_STORE=redis but REDIS_URL is unset; " +
          "falling back to in-memory store.",
      );
    } else {
      console.warn(
        "[token-store] Redis backend not yet implemented; " +
          "falling back to in-memory store. See services/token-store.ts.",
      );
    }
  }
  return new MemoryTokenStore();
}
