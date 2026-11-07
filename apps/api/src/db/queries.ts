import { type SQL, sql } from "drizzle-orm";
import type { Db } from "./client";

/** Recursive CTE `descendants(id)`: every category in the subtrees rooted at `rootIds`, roots included. */
function categoryDescendantsCte(rootIds: string[]): SQL {
  return sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM categories WHERE id IN (${sql.join(
        rootIds.map((id) => sql`${id}`),
        sql.raw(", "),
      )})
      UNION
      SELECT c.id FROM categories c
      INNER JOIN descendants d ON c.parent_id = d.id
    )`;
}

/**
 * Returns every category id in the subtree rooted at each of `rootIds`,
 * including the roots themselves (so a caller can pass the result straight
 * into a `category_id IN (...)` filter and get "this category or any
 * descendant", matching the "filtering a parent includes descendants" rule).
 */
export async function getCategoryDescendantIds(db: Db, rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];

  const rows = await db.all<{ id: string }>(sql`
    ${categoryDescendantsCte(rootIds)}
    SELECT id FROM descendants
  `);

  return rows.map((row) => row.id);
}

/**
 * Subquery selecting the ids of items linked to any category in the subtrees
 * rooted at `rootIds`. Resolving the hierarchy inside SQL keeps the bound
 * parameter count at `rootIds.length`, independent of how many descendants
 * or matching items exist (D1 caps bound parameters per statement).
 * `rootIds` must be non-empty.
 */
export function itemIdsInCategorySubtreesSql(rootIds: string[]): SQL {
  return sql`
    ${categoryDescendantsCte(rootIds)}
    SELECT item_id FROM item_categories
    WHERE category_id IN (SELECT id FROM descendants)`;
}
