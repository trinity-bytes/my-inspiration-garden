import { useEffect, useState } from "react";
import { getCategoryTree } from "../api/endpoints";
import { useCategoriesVersion } from "../categories/useCategoriesVersion";

/**
 * `categoryId` -> display name, fetched once from `GET /api/categories`.
 * The item detail response only carries `categoryIds` (not names), so the
 * modal needs this side map to show real names instead of raw ids. Fails soft: a fetch error leaves the map empty rather than
 * throwing, and callers fall back to showing the raw id (see
 * `ItemDetailModal`'s `categoryNames[id] ?? id`). Refetches whenever the
 * category manager modal changes a category, via the shared
 * `useCategoriesVersion` invalidation signal.
 */
export function useCategoryNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const categoriesVersion = useCategoriesVersion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: categoriesVersion is a deliberate re-fetch trigger, not read in the effect body.
  useEffect(() => {
    let cancelled = false;
    getCategoryTree()
      .then(({ categories }) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const category of categories) {
          next[category.id] = category.name;
        }
        setNames(next);
      })
      .catch(() => {
        // Leave `names` empty — callers fall back to the raw id.
      });
    return () => {
      cancelled = true;
    };
  }, [categoriesVersion]);

  return names;
}
