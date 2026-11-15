import type { Category } from "@garden/shared";
import { useEffect, useState } from "react";
import { getCategoryTree, getTags, type TagsResult } from "../api/endpoints";
import { useCategoriesVersion } from "../categories/useCategoriesVersion";
import { useTagsVersion } from "../tags/useTagsVersion";

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
 * signal, and the tag list refetches whenever the tag manager renames or
 * deletes a tag, via `useTagsVersion`.
 */
export function useFilterOptions(): FilterOptions {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagsResult["tags"]>([]);
  const categoriesVersion = useCategoriesVersion();
  const tagsVersion = useTagsVersion();

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: tagsVersion is a deliberate re-fetch trigger, not read in the effect body.
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
  }, [tagsVersion]);

  return { categories, tags };
}
