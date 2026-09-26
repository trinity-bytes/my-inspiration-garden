/**
 * Tiny shared invalidation signal (T11b B6): the category manager modal is
 * the only writer of categories, but `useCategories`, `useFilterOptions`,
 * and `useCategoryNames` each independently fetch `GET /api/categories` in
 * their own component subtree, with no shared cache or context between
 * them. Rather than introduce a data-fetching library or a context
 * provider just for this, a module-level version counter plus a plain
 * subscriber set is enough: every mutation bumps the version, and each
 * consumer hook refetches whenever the version it observes changes (see
 * `useCategoriesVersion`).
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let version = 0;

export function getCategoriesVersion(): number {
  return version;
}

export function subscribeCategoriesVersion(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call after any category create/rename/move/delete succeeds. */
export function invalidateCategories(): void {
  version += 1;
  for (const listener of listeners) listener();
}
