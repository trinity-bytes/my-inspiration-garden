import type { Item } from "@garden/shared";

/**
 * Pure pagination policy for `useGardenItems.ts`: the canvas needs "a few
 * hundred items max for now" (T8b scope), not the full catalog, so fetching
 * stops once the cursor is exhausted, the item cap is reached, the page
 * cap is reached, or the API is stuck (cursor didn't advance, or a page
 * contributed no new unique items) — the last two guard against unbounded
 * pagination if a misbehaving or malicious API never legitimately
 * exhausts its cursor.
 */
export const ITEMS_FETCH_PAGE_LIMIT = 100;
export const ITEMS_FETCH_MAX_ITEMS = 400;
/** Hard ceiling on page fetches, independent of the item cap — protects against a page size small enough that the item cap alone wouldn't bound the request count. */
export const ITEMS_FETCH_MAX_PAGES = 20;

export interface FetchPageOutcome {
  /** Total unique items collected so far, after merging this page. */
  itemsSoFar: number;
  /** The cursor the just-fetched page returned for the next request, or `null` when exhausted. */
  nextCursor: string | null;
  /** The cursor used to request the page that just resolved (`null` for the first page). */
  requestCursor: string | null;
  /** How many pages have been fetched so far, including this one. */
  pagesSoFar: number;
  /** How many NEW unique items this page contributed (0 if every item in it was already collected). */
  addedCount: number;
}

export function shouldFetchNextPage(outcome: FetchPageOutcome): boolean {
  const { itemsSoFar, nextCursor, requestCursor, pagesSoFar, addedCount } = outcome;
  if (nextCursor === null) {
    return false;
  }
  if (itemsSoFar >= ITEMS_FETCH_MAX_ITEMS) {
    return false;
  }
  if (pagesSoFar >= ITEMS_FETCH_MAX_PAGES) {
    return false;
  }
  // The cursor repeating means the server made no progress — fetching
  // again would loop forever. (requestCursor is null only for the first
  // page, and nextCursor === null already returned above, so this never
  // false-triggers there.)
  if (nextCursor === requestCursor) {
    return false;
  }
  // A page that contributed nothing new means progress stalled even
  // though the cursor moved.
  if (addedCount === 0) {
    return false;
  }
  return true;
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
