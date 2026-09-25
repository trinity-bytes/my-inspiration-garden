import type { Category } from "@garden/shared";
import { useEffect, useState } from "react";
import { getCategoryTree, getTags, type TagsResult } from "../api/endpoints";

export interface FilterOptions {
  categories: Category[];
  tags: TagsResult["tags"];
}

/**
 * Loads the filter panel's option lists once: the flat category list (the
 * panel builds the tree via `buildCategoryTree`) and every tag with its
 * item count. Each fetch fails soft and independently — a failed category
 * or tag load leaves that list empty rather than breaking the other one or
 * throwing (matches `useCategoryNames`'s established convention).
 */
export function useFilterOptions(): FilterOptions {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagsResult["tags"]>([]);

  useEffect(() => {
    let cancelled = false;

    getCategoryTree()
      .then(({ categories: loaded }) => {
        if (!cancelled) setCategories(loaded);
      })
      .catch(() => {
        // Leave `categories` empty.
      });

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
