import type { Category } from "@garden/shared";
import { useEffect, useState } from "react";
import { getCategoryTree } from "../api/endpoints";

/**
 * Flat category list for the quick-add/edit forms (T11), which build their
 * own tree via `buildCategoryTree`. Fails soft: a fetch error leaves the
 * list empty rather than throwing (matches `useCategoryNames`'s and
 * `useFilterOptions`'s established convention).
 */
export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCategoryTree()
      .then(({ categories: loaded }) => {
        if (!cancelled) setCategories(loaded);
      })
      .catch(() => {
        // Leave `categories` empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return categories;
}
