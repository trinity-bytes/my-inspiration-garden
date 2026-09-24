import { useEffect, useState } from "react";
import { getCategoryTree } from "../api/endpoints";

/**
 * `categoryId` -> display name, fetched once from `GET /api/categories`.
 * The item detail response only carries `categoryIds` (not names — T9
 * documented gap), so the modal needs this side map to show real names
 * instead of raw ids; T10 owns the full category tree UI and can reuse or
 * replace this. Fails soft: a fetch error leaves the map empty rather than
 * throwing, and callers fall back to showing the raw id (see
 * `ItemDetailModal`'s `categoryNames[id] ?? id`).
 */
export function useCategoryNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

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
  }, []);

  return names;
}
