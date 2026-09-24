import type { Item } from "@garden/shared";
import { useEffect, useState } from "react";
import { listItems } from "../api/endpoints";
import { ITEMS_FETCH_PAGE_LIMIT, mergeItemsPage, shouldFetchNextPage } from "./fetch-plan";

export type GardenItemsStatus = "loading" | "ready" | "empty" | "error";

export interface UseGardenItemsResult {
  status: GardenItemsStatus;
  items: Item[];
}

/**
 * Fetches the items the canvas renders (`item-layout.ts`), paginating the
 * public list endpoint until either the cursor is exhausted or the
 * pagination cap is reached (`fetch-plan.ts`). Any fetch failure resolves
 * to `"error"`; a successful fetch with zero items resolves to `"empty"` —
 * both are surfaced by `CanvasHost` as a subtle DOM message while the sky
 * still renders (T8b "Empty state and fetch error"). Never updates state
 * after unmount.
 */
export function useGardenItems(): UseGardenItemsResult {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<GardenItemsStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      let collected: Item[] = [];
      let cursor: string | undefined;
      try {
        do {
          const page = await listItems({ cursor, limit: ITEMS_FETCH_PAGE_LIMIT });
          collected = mergeItemsPage(collected, page.items);
          cursor = page.nextCursor ?? undefined;
        } while (shouldFetchNextPage(collected.length, cursor ?? null));

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
  }, []);

  return { status, items };
}
