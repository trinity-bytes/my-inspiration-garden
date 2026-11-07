import type { Item } from "@garden/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { listItems } from "../api/endpoints";
import {
  defaultFilterState,
  type FilterState,
  filtersToListParams,
  isFilterActive,
} from "../filters/filter-state";
import { ITEMS_FETCH_PAGE_LIMIT, mergeItemsPage, shouldFetchNextPage } from "./fetch-plan";

export type GardenItemsStatus = "loading" | "ready" | "empty" | "error";

export interface UseGardenItemsResult {
  status: GardenItemsStatus;
  items: Item[];
  /** Re-runs the fetch from scratch without changing `filters`. */
  refetch: () => void;
  /**
   * Reflects one write the API answered with the saved item (create, update,
   * revision restore, trash restore, soft delete) without re-downloading the
   * library. Falls back to {@link refetch} when a local patch can't be
   * trusted: filters are evaluated server-side (search, color extraction), so
   * whether the saved item still matches them is unknown here; and a fetch
   * still in flight started before the write and would overwrite the patch.
   */
  applySavedItem: (item: Item) => void;
  /** Drops one item locally, e.g. after a soft delete. Always correct: a deleted item never matches the list. */
  removeItem: (id: string) => void;
}

/** The list endpoint's order: `created_at DESC, id DESC`. */
function compareListOrder(a: Item, b: Item): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * Replaces or inserts `item` at its sorted position. When the loaded list is
 * truncated (the pagination cap stopped before the cursor was exhausted), an
 * item sorting after the last loaded one belongs to an unloaded page and is
 * left out, matching what a refetch would show.
 */
function upsertSorted(items: readonly Item[], item: Item, truncated: boolean): Item[] {
  const without = items.filter((existing) => existing.id !== item.id);
  const index = without.findIndex((existing) => compareListOrder(item, existing) < 0);
  if (index === -1) {
    return truncated ? without : [...without, item];
  }
  return [...without.slice(0, index), item, ...without.slice(index)];
}

/**
 * Fetches the items the canvas renders (`item-layout.ts`), paginating the
 * public list endpoint until either the cursor is exhausted or the
 * pagination cap is reached (`fetch-plan.ts`). Any fetch failure resolves
 * to `"error"`; a successful fetch with zero items resolves to `"empty"` —
 * both are surfaced by `CanvasHost` as a subtle DOM message while the canvas
 * still renders. Never updates state after unmount. `filters` restarts the
 * fetch from scratch whenever it changes, aborting the superseded requests —
 * filtering always re-pages from the first cursor rather than trying to
 * patch the already-collected items.
 */
export function useGardenItems(filters: FilterState = defaultFilterState()): UseGardenItemsResult {
  const [items, setItems] = useState<Item[]>([]);
  // `ready`/`empty` derive from `items`, so local patches keep them in sync.
  const [phase, setPhase] = useState<"loading" | "loaded" | "error">("loading");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refetch = useCallback(() => setRefreshIndex((current) => current + 1), []);
  const listParams = filtersToListParams(filters);
  const filterKey = JSON.stringify(listParams);
  const filtersActive = isFilterActive(filters);

  const inFlightRef = useRef(false);
  const truncatedRef = useRef(false);

  // `filterKey` is the stable, deep-equality proxy for `listParams` (a
  // fresh object every render); depending on `listParams` directly would
  // refetch every render even when the filters didn't actually change.
  // `refreshIndex` is the on-demand refetch trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey/refreshIndex are the intentional dependencies, see above.
  useEffect(() => {
    const controller = new AbortController();
    inFlightRef.current = true;

    async function run(): Promise<void> {
      let collected: Item[] = [];
      let cursor: string | undefined;
      let pagesSoFar = 0;
      let keepGoing = true;
      try {
        do {
          const requestCursor = cursor ?? null;
          const page = await listItems(
            { ...listParams, cursor, limit: ITEMS_FETCH_PAGE_LIMIT },
            { signal: controller.signal },
          );
          const merged = mergeItemsPage(collected, page.items);
          const addedCount = merged.length - collected.length;
          collected = merged;
          pagesSoFar++;
          const nextCursor = page.nextCursor ?? null;
          keepGoing = shouldFetchNextPage({
            itemsSoFar: collected.length,
            nextCursor,
            requestCursor,
            pagesSoFar,
            addedCount,
          });
          cursor = nextCursor ?? undefined;
        } while (keepGoing);

        if (!controller.signal.aborted) {
          inFlightRef.current = false;
          truncatedRef.current = cursor !== undefined;
          setItems(collected);
          setPhase("loaded");
        }
      } catch {
        if (!controller.signal.aborted) {
          inFlightRef.current = false;
          setPhase("error");
        }
      }
    }

    void run();
    return () => {
      controller.abort();
    };
  }, [filterKey, refreshIndex]);

  const applySavedItem = useCallback(
    (item: Item) => {
      if (item.deletedAt) {
        setItems((current) => current.filter((existing) => existing.id !== item.id));
        return;
      }
      if (filtersActive || inFlightRef.current) {
        refetch();
        return;
      }
      const truncated = truncatedRef.current;
      setItems((current) => upsertSorted(current, item, truncated));
    },
    [filtersActive, refetch],
  );

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((existing) => existing.id !== id));
  }, []);

  const status: GardenItemsStatus =
    phase === "loaded" ? (items.length === 0 ? "empty" : "ready") : phase;

  return { status, items, refetch, applySavedItem, removeItem };
}
