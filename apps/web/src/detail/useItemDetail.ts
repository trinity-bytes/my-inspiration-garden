import type { Item } from "@garden/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { getItem } from "../api/endpoints";
import { buildDeepLinkSearch, parseDeepLinkItemId } from "./deep-link";

export interface UseItemDetailResult {
  /** The resolved item to show in the detail modal, or `null` when nothing is open. */
  selectedItem: Item | null;
  selectedItemId: string | null;
  openItem: (itemId: string) => void;
  closeItem: () => void;
}

/**
 * Owns the item detail modal's open/closed selection AND its `?item=<id>`
 * deep link (T9 scope B): reads the id from `location.search` on mount,
 * keeps the URL in sync via `history.pushState` as items open/close (so the
 * browser back button closes it — `popstate` re-syncs from the URL without
 * pushing a duplicate entry), and fetches the item by id via the API when
 * a deep-linked id isn't in the loaded `items` list. `itemsLoaded` should
 * be `false` while `useGardenItems`'s own list fetch is still in flight, so
 * a deep link to an item the list is about to include anyway doesn't fire
 * a redundant extra request before the list has had a chance to resolve.
 */
export function useItemDetail(items: Item[], itemsLoaded: boolean): UseItemDetailResult {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : parseDeepLinkItemId(window.location.search),
  );
  const [fetchedItem, setFetchedItem] = useState<Item | null>(null);
  /** Set just before a `popstate`-driven selection change, so the URL-sync effect below skips pushing a redundant/duplicate history entry for a navigation that already changed the URL. */
  const skipNextPushRef = useRef(false);

  const itemFromList = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedItem =
    itemFromList ?? (fetchedItem && fetchedItem.id === selectedItemId ? fetchedItem : null);

  // Deep link resolution: fetch by id only once the items list has settled
  // (loaded, or failed/empty) and the id still isn't present in it.
  useEffect(() => {
    if (!selectedItemId || itemFromList || !itemsLoaded) {
      return;
    }
    let cancelled = false;
    getItem(selectedItemId)
      .then((item) => {
        if (!cancelled) {
          setFetchedItem(item);
        }
      })
      .catch(() => {
        // Unresolvable deep-linked id (deleted, wrong id, network error) —
        // nothing to show; the modal simply never opens for it.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItemId, itemFromList, itemsLoaded]);

  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const nextSearch = buildDeepLinkSearch(selectedItemId);
    if (nextSearch !== window.location.search) {
      window.history.pushState({}, "", `${window.location.pathname}${nextSearch}`);
    }
  }, [selectedItemId]);

  useEffect(() => {
    function handlePopState() {
      skipNextPushRef.current = true;
      setSelectedItemId(parseDeepLinkItemId(window.location.search));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openItem = useCallback((itemId: string) => setSelectedItemId(itemId), []);
  const closeItem = useCallback(() => setSelectedItemId(null), []);

  return { selectedItem, selectedItemId, openItem, closeItem };
}
