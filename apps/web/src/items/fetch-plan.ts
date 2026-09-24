import type { Item } from "@garden/shared";

/**
 * Pure pagination policy for `useGardenItems.ts`: the canvas needs "a few
 * hundred items max for now" (T8b scope), not the full catalog, so fetching
 * stops once either the cursor is exhausted or the item cap is reached.
 */
export const ITEMS_FETCH_PAGE_LIMIT = 100;
export const ITEMS_FETCH_MAX_ITEMS = 400;

export function shouldFetchNextPage(itemsSoFar: number, nextCursor: string | null): boolean {
  return nextCursor !== null && itemsSoFar < ITEMS_FETCH_MAX_ITEMS;
}

/** Appends a fetched page to the accumulated items, deduplicating by id (an item can theoretically reappear across pages if it changed between requests). Does not mutate `existing`. */
export function mergeItemsPage(existing: readonly Item[], page: readonly Item[]): Item[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = existing.slice();
  for (const item of page) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}
