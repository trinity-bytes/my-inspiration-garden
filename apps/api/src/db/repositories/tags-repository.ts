import { normalizeTag } from "@garden/shared";
import { eq, sql } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import type { Db } from "../client";
import { items, itemTags, tags } from "../schema";

export interface TagWithCount {
  id: string;
  name: string;
  count: number;
}

/** Recomputes `items.search_text` (space-joined tag names) for one item from its current `item_tags`. */
async function recomputeSearchText(db: Db, itemId: string): Promise<void> {
  const rows = await db
    .select({ name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(itemTags.tagId, tags.id))
    .where(eq(itemTags.itemId, itemId));
  const searchText = rows.map((r) => r.name).join(" ");
  await db.update(items).set({ searchText }).where(eq(items.id, itemId));
}

export class TagsRepository {
  constructor(private readonly db: Db) {}

  async listWithCounts(): Promise<TagWithCount[]> {
    const rows = await this.db
      .select({ id: tags.id, name: tags.name, count: sql<number>`count(${itemTags.itemId})` })
      .from(tags)
      .leftJoin(itemTags, eq(itemTags.tagId, tags.id))
      .groupBy(tags.id);
    return rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) }));
  }

  async rename(id: string, rawName: string): Promise<TagWithCount> {
    const existingRows = await this.db.select().from(tags).where(eq(tags.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) throw AppError.notFound("tag not found");

    const name = normalizeTag(rawName);
    if (name.length === 0)
      throw AppError.badRequest("invalid_tag_name", "tag name cannot be empty");
    if (name === existing.name) {
      const countRows = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(itemTags)
        .where(eq(itemTags.tagId, id));
      return { id, name, count: Number(countRows[0]?.count ?? 0) };
    }

    const conflictRows = await this.db.select().from(tags).where(eq(tags.name, name)).limit(1);
    const conflict = conflictRows[0];

    const affectedItemRows = await this.db
      .select({ itemId: itemTags.itemId })
      .from(itemTags)
      .where(eq(itemTags.tagId, id));
    const affectedItemIds = affectedItemRows.map((r) => r.itemId);

    if (conflict) {
      // Merge into the existing tag: repoint item_tags rows, skipping ones
      // that would collide with an item already tagged with the target name,
      // then drop the old tag row.
      for (const itemId of affectedItemIds) {
        await this.db.insert(itemTags).values({ itemId, tagId: conflict.id }).onConflictDoNothing();
      }
      await this.db.delete(itemTags).where(eq(itemTags.tagId, id));
      await this.db.delete(tags).where(eq(tags.id, id));

      const mergedAffectedItemRows = await this.db
        .select({ itemId: itemTags.itemId })
        .from(itemTags)
        .where(eq(itemTags.tagId, conflict.id));
      for (const row of mergedAffectedItemRows) await recomputeSearchText(this.db, row.itemId);

      const countRows = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(itemTags)
        .where(eq(itemTags.tagId, conflict.id));
      return { id: conflict.id, name: conflict.name, count: Number(countRows[0]?.count ?? 0) };
    }

    await this.db.update(tags).set({ name }).where(eq(tags.id, id));
    for (const itemId of affectedItemIds) await recomputeSearchText(this.db, itemId);

    return { id, name, count: affectedItemIds.length };
  }

  async delete(id: string): Promise<void> {
    const existingRows = await this.db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (existingRows.length === 0) throw AppError.notFound("tag not found");

    const affectedItemRows = await this.db
      .select({ itemId: itemTags.itemId })
      .from(itemTags)
      .where(eq(itemTags.tagId, id));
    const affectedItemIds = affectedItemRows.map((r) => r.itemId);

    await this.db.delete(tags).where(eq(tags.id, id));
    for (const itemId of affectedItemIds) await recomputeSearchText(this.db, itemId);
  }
}
