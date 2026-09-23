import { sql } from "drizzle-orm";
import type { Db } from "./client";

/**
 * Returns every category id in the subtree rooted at each of `rootIds`,
 * including the roots themselves (so a caller can pass the result straight
 * into a `category_id IN (...)` filter and get "this category or any
 * descendant", matching the "filtering a parent includes descendants" rule).
 * Needed by T4's list endpoint before item filtering can honor category
 * hierarchy.
 */
export async function getCategoryDescendantIds(db: Db, rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];

  const rows = await db.all<{ id: string }>(sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM categories WHERE id IN (${sql.join(
        rootIds.map((id) => sql`${id}`),
        sql.raw(", "),
      )})
      UNION
      SELECT c.id FROM categories c
      INNER JOIN descendants d ON c.parent_id = d.id
    )
    SELECT id FROM descendants
  `);

  return rows.map((row) => row.id);
}
