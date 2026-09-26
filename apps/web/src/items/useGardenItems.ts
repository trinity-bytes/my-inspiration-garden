import type { Item } from "@garden/shared";
import { useCallback, useEffect, useState } from "react";
import { listItems } from "../api/endpoints";
import { defaultFilterState, type FilterState, filtersToListParams } from "../filters/filter-state";
import { ITEMS_FETCH_PAGE_LIMIT, mergeItemsPage, shouldFetchNextPage } from "./fetch-plan";

export type GardenItemsStatus = "loading" | "ready" | "empty" | "error";

export interface UseGardenItemsResult {
  status: GardenItemsStatus;
  items: Item[];
  /** Re-runs the fetch from scratch without changing `filters` (T11: reflect a write — add/edit/delete/restore — on the canvas). */
  refetch: () => void;
}

/**
 * Fetches the items the canvas renders (`item-layout.ts`), paginating the
 * public list endpoint until either the cursor is exhausted or the
 * pagination cap is reached (`fetch-plan.ts`). Any fetch failure resolves
 * to `"error"`; a successful fetch with zero items resolves to `"empty"` —
 * both are surfaced by `CanvasHost` as a subtle DOM message while the sky
 * still renders (T8b "Empty state and fetch error"). Never updates state
 * after unmount. `filters` (T10's filter panel state) restarts the fetch
 * from scratch whenever it changes — filtering always re-pages from the
 * first cursor rather than trying to patch the already-collected items.
 */
export function useGardenItems(filters: FilterState = defaultFilterState()): UseGardenItemsResult {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<GardenItemsStatus>("loading");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refetch = useCallback(() => setRefreshIndex((current) => current + 1), []);
  const listParams = filtersToListParams(filters);
  const filterKey = JSON.stringify(listParams);

  // `filterKey` is the stable, deep-equality proxy for `listParams` (a
  // fresh object every render); depending on `listParams` directly would
  // refetch every render even when the filters didn't actually change.
  // `refreshIndex` is the on-demand refetch trigger (T11's `refetch`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey/refreshIndex are the intentional dependencies, see above.
  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      let collected: Item[] = [];
      let cursor: string | undefined;
      let pagesSoFar = 0;
      let keepGoing = true;
      try {
        do {
          const requestCursor = cursor ?? null;
          const page = await listItems({
            ...listParams,
            cursor,
            limit: ITEMS_FETCH_PAGE_LIMIT,
          });
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

        if (!cancelled) {
          setItems(collected);
          setStatus(collected.length === 0 ? "empty" : "ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [filterKey, refreshIndex]);

  return { status, items, refetch };
}
