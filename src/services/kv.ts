/**
 * Key/value storage abstraction.
 *
 * A tiny interface that both the in-memory (single instance) and Redis
 * (multi-instance) backends implement. All shared state — Garmin tokens and
 * OAuth server state — is built on top of this, so swapping backends is a
 * one-line change and the storage logic is testable without a real Redis.
 */

import { logger } from "../utils/logger.js";
import type { ServerConfig } from "../types.js";

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  /** Set a value, optionally expiring it after `ttlSeconds`. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Entry {
  value: string;
  /** Epoch ms at which this entry expires, if any. */
  expiresAt?: number;
}

/** In-process key/value store with lazy TTL expiry. Single instance only. */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, Entry>();

  async get(key: string): Promise<string | undefined> {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.map.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** Read and JSON-parse a value, or undefined if absent. */
export async function getJson<T>(
  kv: KeyValueStore,
  key: string,
): Promise<T | undefined> {
  const raw = await kv.get(key);
  return raw === undefined ? undefined : (JSON.parse(raw) as T);
}

/** JSON-serialize and store a value. */
export async function setJson(
  kv: KeyValueStore,
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  await kv.set(key, JSON.stringify(value), ttlSeconds);
}

/**
 * Build the configured key/value store. Falls back to in-memory (with a
 * warning) if Redis is requested but unavailable, so the server always starts.
 */
export async function createKeyValueStore(
  config: ServerConfig,
): Promise<KeyValueStore> {
  if (config.tokenStore !== "redis") {
    return new MemoryKeyValueStore();
  }
  if (!config.redisUrl) {
    logger.warn(
      "TOKEN_STORE=redis but REDIS_URL is unset; using in-memory store.",
    );
    return new MemoryKeyValueStore();
  }
  try {
    const { createRedisKeyValueStore } = await import("./redis-kv.js");
    const kv = await createRedisKeyValueStore(config.redisUrl);
    logger.info("Using Redis key/value store.");
    return kv;
  } catch (err) {
    logger.error(
      "Failed to connect to Redis; falling back to in-memory store.",
      err instanceof Error ? err.message : err,
    );
    return new MemoryKeyValueStore();
  }
}
