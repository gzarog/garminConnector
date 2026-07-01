import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MemoryKeyValueStore,
  getJson,
  setJson,
} from "../src/services/kv.js";
import { KvTokenStore } from "../src/services/token-store.js";

describe("MemoryKeyValueStore", () => {
  it("stores and retrieves values", async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set("a", "1");
    assert.equal(await kv.get("a"), "1");
  });

  it("returns undefined for missing keys", async () => {
    const kv = new MemoryKeyValueStore();
    assert.equal(await kv.get("nope"), undefined);
  });

  it("deletes values", async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set("a", "1");
    await kv.delete("a");
    assert.equal(await kv.get("a"), undefined);
  });

  it("expires values after their TTL", async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set("a", "1", 0.02); // 20ms
    assert.equal(await kv.get("a"), "1");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(await kv.get("a"), undefined);
  });

  it("does not expire values without a TTL", async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set("a", "1");
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(await kv.get("a"), "1");
  });
});

describe("getJson / setJson", () => {
  it("round-trips an object", async () => {
    const kv = new MemoryKeyValueStore();
    await setJson(kv, "obj", { a: 1, b: ["x"] });
    assert.deepEqual(await getJson(kv, "obj"), { a: 1, b: ["x"] });
  });

  it("returns undefined for a missing key", async () => {
    const kv = new MemoryKeyValueStore();
    assert.equal(await getJson(kv, "missing"), undefined);
  });
});

describe("KvTokenStore", () => {
  it("round-trips a token set over a key/value store", async () => {
    const store = new KvTokenStore(new MemoryKeyValueStore());
    const tokens = {
      accessToken: "at",
      refreshToken: "rt",
      tokenType: "Bearer",
      expiresAt: 123,
    };
    await store.set("user-1", tokens);
    assert.deepEqual(await store.get("user-1"), tokens);
  });

  it("isolates users and supports deletion", async () => {
    const kv = new MemoryKeyValueStore();
    const store = new KvTokenStore(kv);
    await store.set("a", { accessToken: "A", tokenType: "Bearer", expiresAt: 1 });
    await store.set("b", { accessToken: "B", tokenType: "Bearer", expiresAt: 1 });
    assert.equal((await store.get("a"))?.accessToken, "A");
    assert.equal((await store.get("b"))?.accessToken, "B");
    await store.delete("a");
    assert.equal(await store.get("a"), undefined);
    assert.equal((await store.get("b"))?.accessToken, "B");
  });
});
