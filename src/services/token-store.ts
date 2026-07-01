/**
 * Token persistence.
 *
 * The per-user Garmin token sets are stored via a {@link KeyValueStore}, so the
 * same code works in-memory (single instance) or on Redis (multi-instance). A
 * standalone {@link MemoryTokenStore} is retained for stdio and tests.
 */

import type { TokenSet, TokenStore } from "../types.js";
import { getJson, setJson, type KeyValueStore } from "./kv.js";

const KEY_PREFIX = "garmin:token:";

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

/** Token store backed by a {@link KeyValueStore} (memory or Redis). */
export class KvTokenStore implements TokenStore {
  constructor(private readonly kv: KeyValueStore) {}

  private key(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
  }

  get(userId: string): Promise<TokenSet | undefined> {
    return getJson<TokenSet>(this.kv, this.key(userId));
  }

  set(userId: string, tokens: TokenSet): Promise<void> {
    return setJson(this.kv, this.key(userId), tokens);
  }

  delete(userId: string): Promise<void> {
    return this.kv.delete(this.key(userId));
  }
}
