/**
 * Pure `?item=<id>` deep-link parsing/building — kept
 * framework-free so `App.tsx`'s `location.search`/`history.pushState`
 * wiring stays a thin, mostly-untestable-by-necessity integration layer
 * around this unit-tested logic.
 */

/** The `item` id from a `location.search`-style query string, or `null` when absent/empty. */
export function parseDeepLinkItemId(search: string): string | null {
  const params = new URLSearchParams(search);
  const value = params.get("item");
  return value ? value : null;
}

/** The `location.search`-style query string for `itemId` (`""` — no `?item` param — when `itemId` is `null`, i.e. closed). */
export function buildDeepLinkSearch(itemId: string | null): string {
  if (!itemId) {
    return "";
  }
  const params = new URLSearchParams();
  params.set("item", itemId);
  return `?${params.toString()}`;
}
