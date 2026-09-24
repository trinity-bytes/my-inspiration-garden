/**
 * Small, generic LRU cache used for card textures (`layers/cards.ts`):
 * evicted values are disposed via the caller-supplied `dispose` callback
 * (`(texture) => texture.dispose()` for a THREE.Texture), so a bounded
 * number of GPU textures ever exist regardless of how many distinct
 * items/thumbnails scroll past. Framework-free and fully generic so it is
 * testable without three.js.
 */
export class LruCache<V> {
  private readonly maxSize: number;
  private readonly disposeValue: (value: V) => void;
  private readonly entries = new Map<string, V>();

  constructor(maxSize: number, dispose: (value: V) => void) {
    this.maxSize = maxSize;
    this.disposeValue = dispose;
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

  /** Sets (or replaces) a key, marking it most-recently-used, evicting the least-recently-used entry once over capacity. Replacing an existing key disposes its old value. */
  set(key: string, value: V): void {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      this.entries.delete(key);
      this.disposeValue(existing);
    }
    this.entries.set(key, value);

    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const oldestValue = this.entries.get(oldestKey) as V;
      this.entries.delete(oldestKey);
      this.disposeValue(oldestValue);
    }
  }

  delete(key: string): void {
    const value = this.entries.get(key);
    if (value === undefined) {
      return;
    }
    this.entries.delete(key);
    this.disposeValue(value);
  }

  /** Disposes every remaining entry and empties the cache. */
  clear(): void {
    for (const value of this.entries.values()) {
      this.disposeValue(value);
    }
    this.entries.clear();
  }
}
