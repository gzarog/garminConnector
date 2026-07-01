import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { envelope, extractList } from "../src/utils/format.js";

describe("extractList", () => {
  it("returns a bare array unchanged", () => {
    const arr = [1, 2, 3];
    assert.equal(extractList(arr), arr);
  });

  it("finds a nested list under common keys", () => {
    assert.deepEqual(extractList({ activities: [{ id: 1 }] }), [{ id: 1 }]);
    assert.deepEqual(extractList({ items: [] }), []);
  });

  it("returns undefined when no list is present", () => {
    assert.equal(extractList({ foo: "bar" }), undefined);
    assert.equal(extractList(null), undefined);
    assert.equal(extractList(42), undefined);
  });
});

describe("envelope", () => {
  it("infers count from an array payload", () => {
    const e = envelope([1, 2, 3]);
    assert.equal(e.meta.count, 3);
    assert.deepEqual(e.data, [1, 2, 3]);
  });

  it("infers count from a nested list", () => {
    const e = envelope({ activities: [{ id: 1 }, { id: 2 }] });
    assert.equal(e.meta.count, 2);
  });

  it("preserves supplied metadata and prefers an explicit count", () => {
    const e = envelope([1], { startDate: "2026-06-30", count: 99 });
    assert.equal(e.meta.startDate, "2026-06-30");
    assert.equal(e.meta.count, 99);
  });

  it("omits count for non-list payloads", () => {
    const e = envelope({ restingHeartRate: 52 });
    assert.equal(e.meta.count, undefined);
    assert.deepEqual(e.data, { restingHeartRate: 52 });
  });
});
