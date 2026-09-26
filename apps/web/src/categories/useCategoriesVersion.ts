import { useSyncExternalStore } from "react";
import { getCategoriesVersion, subscribeCategoriesVersion } from "./categories-store";

/**
 * Subscribes to the shared category-invalidation counter (T11b B6): include
 * the returned number in a `useEffect` dependency array to refetch
 * `GET /api/categories` whenever the category manager modal creates,
 * renames, moves, or deletes a category, without a page reload.
 */
export function useCategoriesVersion(): number {
  return useSyncExternalStore(
    subscribeCategoriesVersion,
    getCategoriesVersion,
    getCategoriesVersion,
  );
}
