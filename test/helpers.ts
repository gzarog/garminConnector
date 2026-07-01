import { MemoryTokenStore } from "../src/services/token-store.js";
import type { ServerConfig, TokenSet } from "../src/types.js";

/** Minimal config suitable for unit tests. */
export function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    transport: "stdio",
    port: 3000,
    host: "127.0.0.1",
    publicBaseUrl: "http://localhost:3000",
    garmin: {
      clientId: "test-client",
      clientSecret: "test-secret",
      authorizeUrl: "https://connect.garmin.com/oauth2Confirm",
      tokenUrl: "https://diauth.garmin.com/token",
      apiBaseUrl: "https://apis.garmin.com",
      scopes: [],
    },
    tokenStore: "memory",
    logLevel: "error",
    ...overrides,
  };
}

/** A token store seeded with a long-lived access token for `userId`. */
export function storeWithToken(
  userId: string,
  partial: Partial<TokenSet> = {},
): MemoryTokenStore {
  const store = new MemoryTokenStore();
  void store.set(userId, {
    accessToken: "valid-access-token",
    refreshToken: "valid-refresh-token",
    tokenType: "Bearer",
    expiresAt: Date.now() + 3_600_000,
    ...partial,
  });
  return store;
}

/** Build a minimal fetch Response stand-in, optionally with headers. */
export function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const lower = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(text) : body),
  } as Response;
}

/**
 * Install a queue-based fetch stub. Each call returns (or throws) the next
 * entry. Returns a restore function and a ref to the recorded calls.
 */
export function stubFetch(
  responses: Array<Response | Error>,
): { restore: () => void; calls: Array<{ url: string; init?: RequestInit }> } {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as typeof fetch;
  return { restore: () => void (globalThis.fetch = original), calls };
}
