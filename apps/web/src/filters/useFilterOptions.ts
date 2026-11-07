import type { Category } from "@garden/shared";
import { useEffect, useState } from "react";
import { getCategoryTree, getTags, type TagsResult } from "../api/endpoints";
import { useCategoriesVersion } from "../categories/useCategoriesVersion";

export interface FilterOptions {
  categories: Category[];
  tags: TagsResult["tags"];
}

/**
 * Loads the filter panel's option lists once: the flat category list (the
 * panel builds the tree via `buildCategoryTree`) and every tag with its
 * item count. Each fetch fails soft and independently — a failed category
 * or tag load leaves that list empty rather than breaking the other one or
 * throwing (matches `useCategoryNames`'s established convention). The
 * category list refetches whenever the category manager modal changes a
 * category, via the shared `useCategoriesVersion` invalidation
 * signal; tags are unaffected and stay on their own one-shot load.
 */
export function useFilterOptions(): FilterOptions {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagsResult["tags"]>([]);
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

  useEffect(() => {
    let cancelled = false;

    getTags()
      .then(({ tags: loaded }) => {
        if (!cancelled) setTags(loaded);
      })
      .catch(() => {
        // Leave `tags` empty.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, tags };
}
