/**
 * Shared invalidation signal for tags, the same shape as
 * `categories/categories-store.ts`: the tag manager is the only place that
 * renames or deletes tags, and every hook that lists them (the filter
 * panel's options) refetches when the version it observes changes.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let version = 0;

export function getTagsVersion(): number {
  return version;
}

export function subscribeTagsVersion(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call after any tag rename or delete succeeds. */
export function invalidateTags(): void {
  version += 1;
  for (const listener of listeners) listener();
}
