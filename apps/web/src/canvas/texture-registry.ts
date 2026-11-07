export interface TextureRegistryOptions<V> {
  maxSize: number;
  dispose: (value: V) => void;
}

interface PendingLoad<V> {
  onLoad: Array<(value: V) => void>;
  onError: Array<() => void>;
}

/**
 * Owns texture residency for a bounded pool of live consumers (see
 * `layers/cards.ts`). Framework-free and fully generic (fake loader/fake
 * dispose in tests) so it is testable without three.js. Fixes two real bugs
 * a plain LRU cache has when several pool entries can be assigned to the
 * same cache key at once (the card layout repeats items across cells):
 *
 * - `load()` dedupes concurrent loads for the same key: several pool
 *   entries can miss the cache for the same key in the same frame, each
 *   starting its own load; without dedup, the first `onLoad` to resolve
 *   would cache the texture while a still-in-flight sibling later disposes
 *   and replaces it. Only one loader ever runs per key at a time; every
 *   caller waiting on that key gets fanned the same result.
 * - `pin`/`unpin` reference-count keys currently assigned to a live pool
 *   entry; `set`'s LRU eviction skips pinned keys, so a texture a visible
 *   mesh's `u_map` still references is never disposed out from under it.
 * - `set()` is a no-op (no dispose) when the incoming value is already the
 *   cached value for that key — replacing a key with itself (the
 *   error-fallback path re-caching an already-cached placeholder) must
 *   never dispose the very value being kept.
 * - `clear()` (full teardown, e.g. `layers/cards.ts`'s `dispose()`) does not
 *   cancel loads already in flight — the underlying loader (e.g.
 *   `THREE.TextureLoader`) has no cancel hook. A `generation` counter bumped
 *   on every `clear()` lets `load()` recognize its own in-flight load as
 *   superseded once its resolve/reject finally arrives: the late value is
 *   disposed instead of resurrected into the torn-down cache, and waiters
 *   (torn down along with the registry) are not notified.
 * - Each in-flight load's resolve/reject only deletes its OWN `pending`
 *   entry (`pending.get(key) === waiters` identity check), never a newer
 *   load's. Without it, a stale resolve/reject arriving after `clear()` —
 *   while a fresh `load()` for the same key has already started a new
 *   pending record — would delete that NEWER record, so a third caller
 *   would wrongly start yet another loader instead of joining the one
 *   actually in flight.
 */
export class TextureRegistry<V> {
  private maxSize: number;
  private readonly disposeValue: (value: V) => void;
  private readonly entries = new Map<string, V>();
  private readonly pins = new Map<string, number>();
  private readonly pending = new Map<string, PendingLoad<V>>();
  private generation = 0;

  constructor(options: TextureRegistryOptions<V>) {
    this.maxSize = options.maxSize;
    this.disposeValue = options.dispose;
  }

  /** Changes the soft capacity; shrinking evicts least-recently-used unpinned entries right away. */
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    this.evictOverCapacity(null);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Reading a key marks it most-recently-used. */
  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  /**
   * Sets (or replaces) a key, marking it most-recently-used, evicting the
   * least-recently-used UNPINNED entry once over capacity. A no-op when
   * `value` is already the cached value for `key` (see class doc). Replacing
   * a key with a genuinely different value disposes the old one.
   */
  set(key: string, value: V): void {
    const existing = this.entries.get(key);
    if (existing === value) {
      this.entries.delete(key);
      this.entries.set(key, value);
      return;
    }
    if (existing !== undefined) {
      this.entries.delete(key);
      this.disposeValue(existing);
    }
    this.entries.set(key, value);
    this.evictOverCapacity(key);
  }

  /**
   * Evicts least-recently-used entries until back at capacity, skipping
   * `justSetKey` (the value just inserted, so `set` never evicts the value
   * it was just asked to store) and any pinned key. When enough entries are
   * pinned/just-set, capacity can be exceeded — that is the intended
   * trade-off (see class doc): residency for in-use textures wins over the
   * soft size target.
   */
  private evictOverCapacity(justSetKey: string | null): void {
    if (this.entries.size <= this.maxSize) {
      return;
    }
    for (const [key, value] of this.entries) {
      if (this.entries.size <= this.maxSize) {
        break;
      }
      if (key === justSetKey || this.pins.has(key)) {
        continue;
      }
      this.entries.delete(key);
      this.disposeValue(value);
    }
  }

  /** Marks `key` as in-use by a live consumer (reference-counted); pinned keys are never evicted by `set`. */
  pin(key: string): void {
    this.pins.set(key, (this.pins.get(key) ?? 0) + 1);
  }

  /** Releases one reference from `pin`; once the count reaches zero the key is evictable again. */
  unpin(key: string): void {
    const count = this.pins.get(key);
    if (count === undefined) {
      return;
    }
    if (count <= 1) {
      this.pins.delete(key);
    } else {
      this.pins.set(key, count - 1);
    }
  }

  /**
   * Resolves `key`, deduping concurrent requests: if `key` is cached,
   * `onLoad` fires synchronously with no `start` call. If a load for `key`
   * is already in flight, `onLoad`/`onError` are queued onto it instead of
   * starting a second one. Otherwise `start(resolve, reject)` is invoked
   * once; its result is cached (via `set`, so identity/pin rules apply) and
   * fanned out to every caller that asked for `key` while it was pending.
   */
  load(
    key: string,
    start: (resolve: (value: V) => void, reject: () => void) => void,
    onLoad: (value: V) => void,
    onError: () => void,
  ): void {
    const cached = this.get(key);
    if (cached !== undefined) {
      onLoad(cached);
      return;
    }

    const existing = this.pending.get(key);
    if (existing) {
      existing.onLoad.push(onLoad);
      existing.onError.push(onError);
      return;
    }

    const waiters: PendingLoad<V> = { onLoad: [onLoad], onError: [onError] };
    const startGeneration = this.generation;
    this.pending.set(key, waiters);

    start(
      (value) => {
        // Only remove this load's OWN pending record — a `clear()` in
        // between may already have let a newer `load()` for the same key
        // install its own record, which must survive this late arrival.
        if (this.pending.get(key) === waiters) {
          this.pending.delete(key);
        }
        if (startGeneration !== this.generation) {
          // This registry was `clear()`-ed while this load was still in
          // flight. It is superseded: dispose the late value instead of
          // resurrecting it into the torn-down cache, and skip notifying
          // waiters (torn down along with the registry).
          this.disposeValue(value);
          return;
        }
        this.set(key, value);
        for (const callback of waiters.onLoad) {
          callback(value);
        }
      },
      () => {
        if (this.pending.get(key) === waiters) {
          this.pending.delete(key);
        }
        if (startGeneration !== this.generation) {
          return;
        }
        for (const callback of waiters.onError) {
          callback();
        }
      },
    );
  }

  /** Disposes every remaining entry and empties the cache, ignoring pins (full teardown). Bumps `generation` so any load already in flight is recognized as superseded once it resolves/rejects late. */
  clear(): void {
    this.generation++;
    for (const value of this.entries.values()) {
      this.disposeValue(value);
    }
    this.entries.clear();
    this.pins.clear();
    this.pending.clear();
  }
}
