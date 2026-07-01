/**
 * Redis adapter for {@link KeyValueStore}.
 *
 * Kept in its own module and imported dynamically so the `redis` package is
 * only loaded when `TOKEN_STORE=redis`. A thin wrapper over node-redis: get,
 * set (with optional TTL), and delete.
 *
 * The initial connection is bounded by a timeout so that an unreachable Redis
 * at startup fails fast and the caller can fall back to in-memory, rather than
 * hanging on node-redis's indefinite reconnect loop.
 */

import { logger } from "../utils/logger.js";
import type { KeyValueStore } from "./kv.js";

const CONNECT_TIMEOUT_MS = 3000;

export async function createRedisKeyValueStore(
  url: string,
): Promise<KeyValueStore> {
  const { createClient } = await import("redis");
  const client = createClient({ url, socket: { connectTimeout: CONNECT_TIMEOUT_MS } });
  client.on("error", (err: unknown) =>
    logger.error("Redis client error:", err instanceof Error ? err.message : err),
  );

  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis connection timed out")),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    // Stop background reconnect attempts before falling back.
    void Promise.resolve(client.disconnect()).catch(() => undefined);
    throw err;
  }

  return {
    async get(key: string): Promise<string | undefined> {
      const value = await client.get(key);
      return value ?? undefined;
    },
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, value, { EX: ttlSeconds });
      } else {
        await client.set(key, value);
      }
    },
    async delete(key: string): Promise<void> {
      await client.del(key);
    },
  };
}
