import type { Category } from "@garden/shared";
import { useEffect, useState } from "react";
import { getCategoryTree } from "../api/endpoints";
import { useCategoriesVersion } from "../categories/useCategoriesVersion";

/**
 * Flat category list for the quick-add/edit forms (T11), which build their
 * own tree via `buildCategoryTree`. Fails soft: a fetch error leaves the
 * list empty rather than throwing (matches `useCategoryNames`'s and
 * `useFilterOptions`'s established convention). Refetches whenever the
 * category manager modal creates, renames, moves, or deletes a category
 * (T11b B6), via the shared `useCategoriesVersion` invalidation signal.
 */
export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);
  const categoriesVersion = useCategoriesVersion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: categoriesVersion is a deliberate re-fetch trigger, not read in the effect body.
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
  }, [categoriesVersion]);

  return categories;
}
