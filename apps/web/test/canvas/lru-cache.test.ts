import { describe, expect, it, vi } from "vitest";
import { LruCache } from "../../src/canvas/lru-cache";

describe("LruCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LruCache<string>(3, () => {});
    cache.set("a", "value-a");
    expect(cache.get("a")).toBe("value-a");
    expect(cache.has("a")).toBe(true);
  });

  it("returns undefined for a missing key", () => {
    const cache = new LruCache<string>(3, () => {});
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
  });

  it("evicts the least-recently-used entry once over capacity", () => {
    const disposed: string[] = [];
    const cache = new LruCache<string>(2, (value) => disposed.push(value));
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C"); // evicts "a" (least recently used)
    expect(cache.has("a")).toBe(false);
    expect(disposed).toEqual(["A"]);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("touching a key via get() protects it from eviction", () => {
    const disposed: string[] = [];
    const cache = new LruCache<string>(2, (value) => disposed.push(value));
    cache.set("a", "A");
    cache.set("b", "B");
    cache.get("a"); // "a" is now most-recently-used
    cache.set("c", "C"); // should evict "b", not "a"
    expect(cache.has("a")).toBe(true);
    expect(disposed).toEqual(["B"]);
  });

  it("disposes the evicted value, not the newly set one", () => {
    const dispose = vi.fn();
    const cache = new LruCache<number>(1, dispose);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(1);
  });

  it("delete() disposes and removes an entry", () => {
    const dispose = vi.fn();
    const cache = new LruCache<number>(2, dispose);
    cache.set("a", 1);
    cache.delete("a");
    expect(cache.has("a")).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(1);
  });

  it("re-setting an existing key replaces and disposes the old value", () => {
    const disposed: number[] = [];
    const cache = new LruCache<number>(2, (v) => disposed.push(v));
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.get("a")).toBe(2);
    expect(disposed).toEqual([1]);
  });
});
