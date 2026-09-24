import { describe, expect, it, vi } from "vitest";
import { TextureRegistry } from "../../src/canvas/texture-registry";

describe("TextureRegistry", () => {
  it("stores and retrieves values", () => {
    const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
    registry.set("a", "value-a");
    expect(registry.get("a")).toBe("value-a");
    expect(registry.has("a")).toBe(true);
  });

  it("evicts the least-recently-used unpinned entry once over capacity", () => {
    const disposed: string[] = [];
    const registry = new TextureRegistry<string>({
      maxSize: 2,
      dispose: (value) => disposed.push(value),
    });
    registry.set("a", "A");
    registry.set("b", "B");
    registry.set("c", "C"); // evicts "a" (least recently used)
    expect(registry.has("a")).toBe(false);
    expect(disposed).toEqual(["A"]);
  });

  it("set() is a no-op when the value is already cached under that key (no dispose)", () => {
    const dispose = vi.fn();
    const registry = new TextureRegistry<{ id: number }>({ maxSize: 2, dispose });
    const texture = { id: 1 };
    registry.set("a", texture);
    registry.set("a", texture); // same object re-set — must NOT dispose it
    expect(dispose).not.toHaveBeenCalled();
    expect(registry.get("a")).toBe(texture);
  });

  it("set() with a genuinely different value for the same key disposes the old one", () => {
    const disposed: number[] = [];
    const registry = new TextureRegistry<number>({
      maxSize: 2,
      dispose: (v) => disposed.push(v),
    });
    registry.set("a", 1);
    registry.set("a", 2);
    expect(registry.get("a")).toBe(2);
    expect(disposed).toEqual([1]);
  });

  describe("pin/unpin", () => {
    it("never evicts a pinned key even when over capacity", () => {
      const disposed: string[] = [];
      const registry = new TextureRegistry<string>({
        maxSize: 1,
        dispose: (v) => disposed.push(v),
      });
      registry.set("a", "A");
      registry.pin("a");
      registry.set("b", "B"); // would normally evict "a" (LRU, over capacity)
      expect(registry.has("a")).toBe(true);
      expect(disposed).toEqual([]);
    });

    it("becomes evictable again once unpinned", () => {
      const disposed: string[] = [];
      const registry = new TextureRegistry<string>({
        maxSize: 1,
        dispose: (v) => disposed.push(v),
      });
      registry.set("a", "A");
      registry.pin("a");
      registry.unpin("a");
      registry.set("b", "B");
      expect(registry.has("a")).toBe(false);
      expect(disposed).toEqual(["A"]);
    });

    it("supports reference counting: stays pinned while any pinner holds it", () => {
      const disposed: string[] = [];
      const registry = new TextureRegistry<string>({
        maxSize: 1,
        dispose: (v) => disposed.push(v),
      });
      registry.set("a", "A");
      registry.pin("a");
      registry.pin("a"); // two pool entries share this key
      registry.unpin("a"); // one entry moved away
      registry.set("b", "B"); // "a" still pinned once — must survive
      expect(registry.has("a")).toBe(true);
      expect(disposed).toEqual([]);
    });

    it("clear() disposes everything, ignoring pins", () => {
      const disposed: string[] = [];
      const registry = new TextureRegistry<string>({
        maxSize: 3,
        dispose: (v) => disposed.push(v),
      });
      registry.set("a", "A");
      registry.pin("a");
      registry.clear();
      expect(registry.has("a")).toBe(false);
      expect(disposed).toEqual(["A"]);
    });
  });

  describe("load", () => {
    it("returns the cached value synchronously without starting a load", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
      registry.set("a", "cached-A");
      const start = vi.fn();
      const onLoad = vi.fn();
      registry.load("a", start, onLoad, vi.fn());
      expect(start).not.toHaveBeenCalled();
      expect(onLoad).toHaveBeenCalledWith("cached-A");
    });

    it("dedupes concurrent loads for the same key: the loader starts only once", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
      let resolve!: (value: string) => void;
      const start = vi.fn((onLoadInner: (value: string) => void) => {
        resolve = onLoadInner;
      });
      const onLoadA = vi.fn();
      const onLoadB = vi.fn();

      registry.load("shared-key", start, onLoadA, vi.fn());
      registry.load("shared-key", start, onLoadB, vi.fn()); // second caller, same key, still in flight

      expect(start).toHaveBeenCalledTimes(1);
      expect(onLoadA).not.toHaveBeenCalled();
      expect(onLoadB).not.toHaveBeenCalled();

      resolve("resolved-value");

      expect(onLoadA).toHaveBeenCalledWith("resolved-value");
      expect(onLoadB).toHaveBeenCalledWith("resolved-value");
      expect(registry.get("shared-key")).toBe("resolved-value");
    });

    it("dedupes concurrent loads that fail: every waiting caller's onError fires, loader starts only once", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
      let reject!: () => void;
      const start = vi.fn((_onLoad: (value: string) => void, onErrorInner: () => void) => {
        reject = onErrorInner;
      });
      const onErrorA = vi.fn();
      const onErrorB = vi.fn();

      registry.load("shared-key", start, vi.fn(), onErrorA);
      registry.load("shared-key", start, vi.fn(), onErrorB);
      expect(start).toHaveBeenCalledTimes(1);

      reject();

      expect(onErrorA).toHaveBeenCalledTimes(1);
      expect(onErrorB).toHaveBeenCalledTimes(1);
      expect(registry.has("shared-key")).toBe(false);
    });

    it("a load() after a completed one is served from cache, not a new loader", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
      const start = vi.fn((onLoadInner: (value: string) => void) => onLoadInner("A"));

      registry.load("a", start, vi.fn(), vi.fn());
      expect(start).toHaveBeenCalledTimes(1);

      // Cached now — a further load() call is served from cache, not a new start().
      registry.load("a", start, vi.fn(), vi.fn());
      expect(start).toHaveBeenCalledTimes(1);
    });

    it("a resolve arriving after clear() disposes the value instead of caching it", () => {
      const disposed: string[] = [];
      const registry = new TextureRegistry<string>({
        maxSize: 3,
        dispose: (v) => disposed.push(v),
      });
      let resolve!: (value: string) => void;
      const start = vi.fn((onLoadInner: (value: string) => void) => {
        resolve = onLoadInner;
      });
      const onLoad = vi.fn();
      registry.load("a", start, onLoad, vi.fn());

      registry.clear(); // torn down while "a" is still in flight

      resolve("late-value");

      expect(disposed).toEqual(["late-value"]);
      expect(registry.has("a")).toBe(false);
      expect(onLoad).not.toHaveBeenCalled();
    });

    it("a reject arriving after clear() does not notify the (torn-down) waiters", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
      let reject!: () => void;
      const start = vi.fn((_onLoad: (value: string) => void, onErrorInner: () => void) => {
        reject = onErrorInner;
      });
      const onError = vi.fn();
      registry.load("a", start, vi.fn(), onError);

      registry.clear();
      reject();

      expect(onError).not.toHaveBeenCalled();
    });

    it("a stale resolve for a superseded (cleared) load does not clobber a newer load's pending waiter record", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });

      let resolveA!: (value: string) => void;
      const startA = vi.fn((onLoadInner: (value: string) => void) => {
        resolveA = onLoadInner;
      });
      registry.load("a", startA, vi.fn(), vi.fn());

      registry.clear(); // "a"'s in-flight load A is now stale/orphaned

      let resolveB!: (value: string) => void;
      const startB = vi.fn((onLoadInner: (value: string) => void) => {
        resolveB = onLoadInner;
      });
      registry.load("a", startB, vi.fn(), vi.fn()); // fresh load B starts for the same key

      resolveA("stale-from-A"); // late resolve of the superseded/cleared load

      // A third caller must still be deduped onto B, not start a fresh loader C.
      const startC = vi.fn();
      const onLoadC = vi.fn();
      registry.load("a", startC, onLoadC, vi.fn());
      expect(startC).not.toHaveBeenCalled();

      resolveB("value-from-B");
      expect(onLoadC).toHaveBeenCalledWith("value-from-B");
    });

    it("a failed load lets a later load() retry (does not leave a stuck pending entry)", () => {
      const registry = new TextureRegistry<string>({ maxSize: 3, dispose: () => {} });
      const start = vi
        .fn()
        .mockImplementationOnce((_onLoad: (value: string) => void, onError: () => void) =>
          onError(),
        )
        .mockImplementationOnce((onLoad: (value: string) => void) => onLoad("B"));

      const onLoad = vi.fn();
      registry.load("a", start, vi.fn(), vi.fn());
      registry.load("a", start, onLoad, vi.fn());

      expect(start).toHaveBeenCalledTimes(2);
      expect(onLoad).toHaveBeenCalledWith("B");
    });
  });
});
