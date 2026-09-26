import type {
  CreateItemInput,
  Item,
  ItemKind,
  ItemListQuery,
  PaletteColor,
  UpdateItemInput,
} from "@garden/shared";
import { normalizePalette } from "@garden/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { isColorMatch } from "../../lib/color";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { AppError } from "../../lib/errors";
import { sanitizeFtsQuery } from "../../lib/fts";
import type { Db } from "../client";
import { getCategoryDescendantIds } from "../queries";
import {
  categories,
  itemCategories,
  itemColors,
  itemRevisions,
  items,
  itemTags,
  tags,
} from "../schema";

interface ItemRow {
  id: string;
  kind: string;
  title: string | null;
  url: string | null;
  notes: string | null;
  data: unknown;
  source: string;
  searchText: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ItemRevision {
  id: string;
  itemId: string;
  snapshot: Item;
  actor: string;
  createdAt: string;
}

export interface ListItemsResult {
  items: Item[];
  nextCursor: string | null;
}

function now(): string {
  return new Date().toISOString();
}

function rowToItem(row: ItemRow, categoryIds: string[], itemTagNames: string[]): Item {
  return {
    id: row.id,
    kind: row.kind as ItemKind,
    title: row.title ?? undefined,
    url: row.url ?? undefined,
    notes: row.notes ?? undefined,
    data: row.data,
    source: row.source,
    categoryIds,
    tags: itemTagNames,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  } as Item;
}

/** Bulk-loads categoryIds/tags for a set of item ids in two queries (no N+1). */
async function bulkFetchRelations(
  db: Db,
  itemIds: string[],
): Promise<{ categoriesByItem: Map<string, string[]>; tagsByItem: Map<string, string[]> }> {
  const categoriesByItem = new Map<string, string[]>();
  const tagsByItem = new Map<string, string[]>();
  if (itemIds.length === 0) return { categoriesByItem, tagsByItem };

  const categoryRows = await db
    .select({ itemId: itemCategories.itemId, categoryId: itemCategories.categoryId })
    .from(itemCategories)
    .where(inArray(itemCategories.itemId, itemIds));
  for (const row of categoryRows) {
    const list = categoriesByItem.get(row.itemId) ?? [];
    list.push(row.categoryId);
    categoriesByItem.set(row.itemId, list);
  }

  const tagRows = await db
    .select({ itemId: itemTags.itemId, name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(itemTags.tagId, tags.id))
    .where(inArray(itemTags.itemId, itemIds));
  for (const row of tagRows) {
    const list = tagsByItem.get(row.itemId) ?? [];
    list.push(row.name);
    tagsByItem.set(row.itemId, list);
  }

  return { categoriesByItem, tagsByItem };
}

/** Upserts tags by normalized name; returns id rows for every requested name (existing + newly inserted). */
async function upsertTagsByName(db: Db, names: string[]): Promise<{ id: string; name: string }[]> {
  if (names.length === 0) return [];
  const existing = await db.select().from(tags).where(inArray(tags.name, names));
  const existingNames = new Set(existing.map((t) => t.name));
  const missing = names.filter((name) => !existingNames.has(name));
  const created = missing.map((name) => ({ id: crypto.randomUUID(), name }));
  if (created.length > 0) {
    await db.insert(tags).values(created);
  }
  return [...existing, ...created];
}

/**
 * Derives the `item_colors` rows for an item from its kind-specific `data`:
 * `image` items index `data.palette` (client-extracted via
 * `packages/shared/src/palette.ts`); `palette` items index `data.colors`
 * directly so color filtering also finds standalone palette items. Every
 * other kind has no colors. Both kinds go through the same shared
 * `normalizePalette` (T11b B5, owner decision 2026-09-26): an explicit
 * per-color `weight` is normalized proportionally against the others (it
 * need not sum to 1 or 100), and a color missing a weight falls back to an
 * even share — which is also what keeps pre-B5 items (with no `weight`
 * field at all) indexing exactly as before.
 */
function deriveItemColors(kind: string, data: unknown): PaletteColor[] {
  if (kind === "image") {
    const palette = (data as { palette?: unknown }).palette;
    if (Array.isArray(palette) && palette.length > 0) {
      return normalizePalette(palette as (string | { hex: string; weight?: number })[]);
    }
    return [];
  }
  if (kind === "palette") {
    const colors = (data as { colors?: { hex: string; weight?: number }[] }).colors;
    if (Array.isArray(colors) && colors.length > 0) {
      return normalizePalette(colors);
    }
  }
  return [];
}

function replaceItemColorsStatements(db: Db, itemId: string, colors: PaletteColor[]) {
  return [
    db.delete(itemColors).where(eq(itemColors.itemId, itemId)),
    ...(colors.length > 0
      ? [
          db
            .insert(itemColors)
            .values(colors.map((c) => ({ itemId, hex: c.hex, weight: c.weight }))),
        ]
      : []),
  ];
}

async function assertCategoriesExist(db: Db, categoryIds: string[]): Promise<void> {
  if (categoryIds.length === 0) return;
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.id, categoryIds));
  const found = new Set(rows.map((r) => r.id));
  const missing = categoryIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw AppError.badRequest("category_not_found", "one or more categoryIds do not exist", {
      missing,
    });
  }
}

export class ItemsRepository {
  constructor(private readonly db: Db) {}

  async list(query: ItemListQuery): Promise<ListItemsResult> {
    const conditions = [];
    if (query.deletedOnly) {
      conditions.push(isNotNull(items.deletedAt));
    } else if (!query.includeDeleted) {
      conditions.push(isNull(items.deletedAt));
    }
    if (query.kind.length > 0) conditions.push(inArray(items.kind, query.kind));

    if (query.tag.length > 0) {
      const rows = await this.db
        .select({ itemId: itemTags.itemId, name: tags.name })
        .from(itemTags)
        .innerJoin(tags, eq(itemTags.tagId, tags.id))
        .where(inArray(tags.name, query.tag));
      const namesByItem = new Map<string, Set<string>>();
      for (const row of rows) {
        const set = namesByItem.get(row.itemId) ?? new Set<string>();
        set.add(row.name);
        namesByItem.set(row.itemId, set);
      }
      const matchingIds = [...namesByItem.entries()]
        .filter(([, names]) => query.tag.every((tag) => names.has(tag)))
        .map(([itemId]) => itemId);
      if (matchingIds.length === 0) return { items: [], nextCursor: null };
      conditions.push(inArray(items.id, matchingIds));
    }

    if (query.categoryId.length > 0) {
      const expandedIds = await getCategoryDescendantIds(this.db, query.categoryId);
      if (expandedIds.length === 0) return { items: [], nextCursor: null };
      const rows = await this.db
        .select({ itemId: itemCategories.itemId })
        .from(itemCategories)
        .where(inArray(itemCategories.categoryId, expandedIds));
      const matchingIds = [...new Set(rows.map((r) => r.itemId))];
      if (matchingIds.length === 0) return { items: [], nextCursor: null };
      conditions.push(inArray(items.id, matchingIds));
    }

    if (query.color) {
      const target = query.color;
      const colorRows = await this.db
        .select({ itemId: itemColors.itemId, hex: itemColors.hex })
        .from(itemColors);
      const matchingIds = [
        ...new Set(colorRows.filter((r) => isColorMatch(r.hex, target)).map((r) => r.itemId)),
      ];
      if (matchingIds.length === 0) return { items: [], nextCursor: null };
      conditions.push(inArray(items.id, matchingIds));
    }

    if (query.q) {
      const ftsQuery = sanitizeFtsQuery(query.q);
      const rows = await this.db.all<{ id: string }>(
        sql`SELECT id FROM items_fts WHERE items_fts MATCH ${ftsQuery}`,
      );
      const matchingIds = rows.map((r) => r.id);
      if (matchingIds.length === 0) return { items: [], nextCursor: null };
      conditions.push(inArray(items.id, matchingIds));
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) throw AppError.badRequest("invalid_cursor", "cursor is malformed");
      conditions.push(
        or(
          lt(items.createdAt, cursor.createdAt),
          and(eq(items.createdAt, cursor.createdAt), lt(items.id, cursor.id)),
        ),
      );
    }

    const rows = (await this.db
      .select()
      .from(items)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(items.createdAt), desc(items.id))
      .limit(query.limit + 1)) as ItemRow[];

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasMore && lastRow ? encodeCursor({ createdAt: lastRow.createdAt, id: lastRow.id }) : null;

    const { categoriesByItem, tagsByItem } = await bulkFetchRelations(
      this.db,
      pageRows.map((r) => r.id),
    );

    return {
      items: pageRows.map((row) =>
        rowToItem(row, categoriesByItem.get(row.id) ?? [], tagsByItem.get(row.id) ?? []),
      ),
      nextCursor,
    };
  }

  async getById(id: string, includeDeleted: boolean): Promise<Item | null> {
    const conditions = [eq(items.id, id)];
    if (!includeDeleted)
      conditions.push(isNull(items.deletedAt) as unknown as ReturnType<typeof eq>);
    const rows = (await this.db
      .select()
      .from(items)
      .where(and(...conditions))
      .limit(1)) as ItemRow[];
    const row = rows[0];
    if (!row) return null;
    const { categoriesByItem, tagsByItem } = await bulkFetchRelations(this.db, [row.id]);
    return rowToItem(row, categoriesByItem.get(row.id) ?? [], tagsByItem.get(row.id) ?? []);
  }

  async create(input: CreateItemInput, actor: string): Promise<Item> {
    await assertCategoriesExist(this.db, input.categoryIds);
    // all rows (existing + newly created) are needed for the item_tags join inserts below
    const tagRows = await upsertTagsByName(this.db, input.tags);

    const id = crypto.randomUUID();
    const timestamp = now();
    const row = {
      id,
      kind: input.kind,
      title: input.title ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
      data: input.data,
      source: input.source,
      searchText: input.tags.join(" "),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    const item = rowToItem(row, input.categoryIds, input.tags);
    const colors = deriveItemColors(input.kind, input.data);

    await this.db.batch([
      this.db.insert(items).values(row),
      ...(input.categoryIds.length > 0
        ? [
            this.db
              .insert(itemCategories)
              .values(input.categoryIds.map((categoryId) => ({ itemId: id, categoryId }))),
          ]
        : []),
      ...(tagRows.length > 0
        ? [this.db.insert(itemTags).values(tagRows.map((t) => ({ itemId: id, tagId: t.id })))]
        : []),
      ...(colors.length > 0
        ? [
            this.db
              .insert(itemColors)
              .values(colors.map((c) => ({ itemId: id, hex: c.hex, weight: c.weight }))),
          ]
        : []),
      this.db.insert(itemRevisions).values({
        id: crypto.randomUUID(),
        itemId: id,
        snapshot: item,
        actor,
        createdAt: timestamp,
      }),
    ] as Parameters<Db["batch"]>[0]);

    return item;
  }

  async update(id: string, input: UpdateItemInput, actor: string): Promise<Item> {
    const existing = await this.getById(id, false);
    if (!existing) throw AppError.notFound("item not found");
    if (input.kind !== existing.kind) {
      throw AppError.unprocessable("kind_immutable", "an item's kind cannot be changed");
    }

    const categoryIdsProvided = input.categoryIds !== undefined;
    const tagsProvided = input.tags !== undefined;
    if (categoryIdsProvided) await assertCategoriesExist(this.db, input.categoryIds as string[]);

    const nextCategoryIds = categoryIdsProvided
      ? (input.categoryIds as string[])
      : existing.categoryIds;
    const nextTags = tagsProvided ? (input.tags as string[]) : existing.tags;
    const tagRows = tagsProvided ? await upsertTagsByName(this.db, nextTags) : [];

    const timestamp = now();
    const row = {
      title: (input.title !== undefined ? input.title : existing.title) ?? null,
      url: (input.url !== undefined ? input.url : existing.url) ?? null,
      notes: (input.notes !== undefined ? input.notes : existing.notes) ?? null,
      data: input.data !== undefined ? input.data : existing.data,
      searchText: tagsProvided ? nextTags.join(" ") : undefined,
      updatedAt: timestamp,
    };

    const merged: Item = {
      ...existing,
      title: row.title ?? undefined,
      url: row.url ?? undefined,
      notes: row.notes ?? undefined,
      data: row.data,
      categoryIds: nextCategoryIds,
      tags: nextTags,
      updatedAt: timestamp,
    } as Item;

    const setValues: Record<string, unknown> = {
      title: row.title,
      url: row.url,
      notes: row.notes,
      data: row.data,
      updatedAt: row.updatedAt,
    };
    if (tagsProvided) setValues.searchText = row.searchText;
    const colors = deriveItemColors(existing.kind, row.data);

    await this.db.batch([
      this.db.update(items).set(setValues).where(eq(items.id, id)),
      ...replaceItemColorsStatements(this.db, id, colors),
      ...(categoryIdsProvided
        ? [
            this.db.delete(itemCategories).where(eq(itemCategories.itemId, id)),
            ...(nextCategoryIds.length > 0
              ? [
                  this.db
                    .insert(itemCategories)
                    .values(nextCategoryIds.map((categoryId) => ({ itemId: id, categoryId }))),
                ]
              : []),
          ]
        : []),
      ...(tagsProvided
        ? [
            this.db.delete(itemTags).where(eq(itemTags.itemId, id)),
            ...(tagRows.length > 0
              ? [this.db.insert(itemTags).values(tagRows.map((t) => ({ itemId: id, tagId: t.id })))]
              : []),
          ]
        : []),
      this.db.insert(itemRevisions).values({
        id: crypto.randomUUID(),
        itemId: id,
        snapshot: merged,
        actor,
        createdAt: timestamp,
      }),
    ] as Parameters<Db["batch"]>[0]);

    return merged;
  }

  async softDelete(id: string, actor: string): Promise<Item> {
    const existing = await this.getById(id, false);
    if (!existing) throw AppError.notFound("item not found");
    const timestamp = now();
    const snapshot: Item = { ...existing, deletedAt: timestamp, updatedAt: timestamp } as Item;

    await this.db.batch([
      this.db
        .update(items)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(eq(items.id, id)),
      this.db.insert(itemRevisions).values({
        id: crypto.randomUUID(),
        itemId: id,
        snapshot,
        actor,
        createdAt: timestamp,
      }),
    ] as Parameters<Db["batch"]>[0]);

    return snapshot;
  }

  async restore(id: string, actor: string): Promise<Item> {
    const existing = await this.getById(id, true);
    if (!existing) throw AppError.notFound("item not found");
    if (!existing.deletedAt) throw AppError.badRequest("not_deleted", "item is not in trash");
    const timestamp = now();
    const snapshot: Item = { ...existing, deletedAt: undefined, updatedAt: timestamp } as Item;

    await this.db.batch([
      this.db.update(items).set({ deletedAt: null, updatedAt: timestamp }).where(eq(items.id, id)),
      this.db.insert(itemRevisions).values({
        id: crypto.randomUUID(),
        itemId: id,
        snapshot,
        actor,
        createdAt: timestamp,
      }),
    ] as Parameters<Db["batch"]>[0]);

    return snapshot;
  }

  async listRevisions(id: string): Promise<ItemRevision[]> {
    const existing = await this.getById(id, true);
    if (!existing) throw AppError.notFound("item not found");
    const rows = await this.db
      .select()
      .from(itemRevisions)
      .where(eq(itemRevisions.itemId, id))
      .orderBy(desc(itemRevisions.createdAt));
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      snapshot: row.snapshot as Item,
      actor: row.actor,
      createdAt: row.createdAt,
    }));
  }

  async restoreRevision(id: string, revisionId: string, actor: string): Promise<Item> {
    const existing = await this.getById(id, true);
    if (!existing) throw AppError.notFound("item not found");
    const revisionRows = await this.db
      .select()
      .from(itemRevisions)
      .where(and(eq(itemRevisions.id, revisionId), eq(itemRevisions.itemId, id)))
      .limit(1);
    const revisionRow = revisionRows[0];
    if (!revisionRow) throw AppError.notFound("revision not found");
    const snapshot = revisionRow.snapshot as Item;

    const existingCategories = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        inArray(
          categories.id,
          snapshot.categoryIds.length > 0 ? snapshot.categoryIds : ["__none__"],
        ),
      );
    const validCategoryIds = snapshot.categoryIds.filter((cid) =>
      existingCategories.some((c) => c.id === cid),
    );
    const tagRows = await upsertTagsByName(this.db, snapshot.tags);

    const timestamp = now();
    const restored: Item = {
      ...snapshot,
      id,
      categoryIds: validCategoryIds,
      updatedAt: timestamp,
      deletedAt: undefined,
    } as Item;

    await this.db.batch([
      this.db
        .update(items)
        .set({
          title: restored.title ?? null,
          url: restored.url ?? null,
          notes: restored.notes ?? null,
          data: restored.data,
          searchText: restored.tags.join(" "),
          updatedAt: timestamp,
          deletedAt: null,
        })
        .where(eq(items.id, id)),
      ...replaceItemColorsStatements(this.db, id, deriveItemColors(restored.kind, restored.data)),
      this.db.delete(itemCategories).where(eq(itemCategories.itemId, id)),
      ...(validCategoryIds.length > 0
        ? [
            this.db
              .insert(itemCategories)
              .values(validCategoryIds.map((categoryId) => ({ itemId: id, categoryId }))),
          ]
        : []),
      this.db.delete(itemTags).where(eq(itemTags.itemId, id)),
      ...(tagRows.length > 0
        ? [this.db.insert(itemTags).values(tagRows.map((t) => ({ itemId: id, tagId: t.id })))]
        : []),
      this.db.insert(itemRevisions).values({
        id: crypto.randomUUID(),
        itemId: id,
        snapshot: restored,
        actor,
        createdAt: timestamp,
      }),
    ] as Parameters<Db["batch"]>[0]);

    return restored;
  }
}
