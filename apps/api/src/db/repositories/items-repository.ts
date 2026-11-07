import type {
  CreateItemInput,
  Item,
  ItemKind,
  ItemListQuery,
  PaletteColor,
  UpdateItemInput,
} from "@garden/shared";
import { normalizePalette } from "@garden/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { COLOR_DISTANCE_THRESHOLD, hexToRgb, type Rgb } from "../../lib/color";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { AppError } from "../../lib/errors";
import { sanitizeFtsQuery } from "../../lib/fts";
import type { Db } from "../client";
import { itemIdsInCategorySubtreesSql } from "../queries";
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

/**
 * Relation queries for a set of item ids, meant to run inside one `db.batch`
 * together with whatever else the caller reads. `itemIds` is bounded by the
 * list page size (max 100), so binding the ids stays within D1's limit.
 */
function relationQueries(db: Db, itemIds: string[]) {
  return [
    db
      .select({ itemId: itemCategories.itemId, categoryId: itemCategories.categoryId })
      .from(itemCategories)
      .where(inArray(itemCategories.itemId, itemIds)),
    db
      .select({ itemId: itemTags.itemId, name: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(itemTags.tagId, tags.id))
      .where(inArray(itemTags.itemId, itemIds)),
  ] as const;
}

function groupRelations(
  categoryRows: { itemId: string; categoryId: string }[],
  tagRows: { itemId: string; name: string }[],
): { categoriesByItem: Map<string, string[]>; tagsByItem: Map<string, string[]> } {
  const categoriesByItem = new Map<string, string[]>();
  const tagsByItem = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoriesByItem.get(row.itemId) ?? [];
    list.push(row.categoryId);
    categoriesByItem.set(row.itemId, list);
  }
  for (const row of tagRows) {
    const list = tagsByItem.get(row.itemId) ?? [];
    list.push(row.name);
    tagsByItem.set(row.itemId, list);
  }
  return { categoriesByItem, tagsByItem };
}

/** Bulk-loads categoryIds/tags for a set of item ids in one batched round trip (no N+1). */
async function bulkFetchRelations(
  db: Db,
  itemIds: string[],
): Promise<{ categoriesByItem: Map<string, string[]>; tagsByItem: Map<string, string[]> }> {
  if (itemIds.length === 0) return groupRelations([], []);
  const [categoryRows, tagRows] = await db.batch(relationQueries(db, itemIds));
  return groupRelations(categoryRows, tagRows);
}

/** Item row + relation queries for one id; pair with `assembleItem` on the batch results. */
function itemByIdQueries(db: Db, id: string, includeDeleted: boolean) {
  const condition = includeDeleted
    ? eq(items.id, id)
    : and(eq(items.id, id), isNull(items.deletedAt));
  return [db.select().from(items).where(condition).limit(1), ...relationQueries(db, [id])] as const;
}

function assembleItem(
  rows: ItemRow[],
  categoryRows: { itemId: string; categoryId: string }[],
  tagRows: { itemId: string; name: string }[],
): Item | null {
  const row = rows[0];
  if (!row) return null;
  return rowToItem(
    row,
    categoryRows.map((r) => r.categoryId),
    tagRows.map((r) => r.name),
  );
}

/**
 * Squared RGB distance between a stored `item_colors.hex` and a target,
 * computed in SQL so the color filter never ships the whole table to the
 * Worker. Stored hexes are validated `#RRGGBB` (either case) on write, so
 * decoding each nibble with `instr` over a lowercase digit table is exact and
 * mirrors `isColorMatch` in `lib/color.ts`.
 */
function colorDistanceSquaredSql(target: Rgb): SQL {
  const channel = (offset: number) =>
    sql.raw(
      `((instr('0123456789abcdef', lower(substr(hex, ${offset}, 1))) - 1) * 16 + ` +
        `(instr('0123456789abcdef', lower(substr(hex, ${offset + 1}, 1))) - 1))`,
    );
  return sql`((${channel(2)} - ${target.r}) * (${channel(2)} - ${target.r}) + (${channel(4)} - ${target.g}) * (${channel(4)} - ${target.g}) + (${channel(6)} - ${target.b}) * (${channel(6)} - ${target.b}))`;
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

function insertItemColorsStatements(db: Db, itemId: string, colors: PaletteColor[]) {
  return colors.length > 0
    ? [db.insert(itemColors).values(colors.map((c) => ({ itemId, hex: c.hex, weight: c.weight })))]
    : [];
}

function replaceItemColorsStatements(db: Db, itemId: string, colors: PaletteColor[]) {
  return [
    db.delete(itemColors).where(eq(itemColors.itemId, itemId)),
    ...insertItemColorsStatements(db, itemId, colors),
  ];
}

function insertItemCategoriesStatements(db: Db, itemId: string, categoryIds: string[]) {
  return categoryIds.length > 0
    ? [db.insert(itemCategories).values(categoryIds.map((categoryId) => ({ itemId, categoryId })))]
    : [];
}

function replaceItemCategoriesStatements(db: Db, itemId: string, categoryIds: string[]) {
  return [
    db.delete(itemCategories).where(eq(itemCategories.itemId, itemId)),
    ...insertItemCategoriesStatements(db, itemId, categoryIds),
  ];
}

function insertItemTagsStatements(db: Db, itemId: string, tagRows: { id: string }[]) {
  return tagRows.length > 0
    ? [db.insert(itemTags).values(tagRows.map((t) => ({ itemId, tagId: t.id })))]
    : [];
}

function replaceItemTagsStatements(db: Db, itemId: string, tagRows: { id: string }[]) {
  return [
    db.delete(itemTags).where(eq(itemTags.itemId, itemId)),
    ...insertItemTagsStatements(db, itemId, tagRows),
  ];
}

function insertRevisionStatement(
  db: Db,
  itemId: string,
  snapshot: Item,
  actor: string,
  createdAt: string,
) {
  return db.insert(itemRevisions).values({
    id: crypto.randomUUID(),
    itemId,
    snapshot,
    actor,
    createdAt,
  });
}

/**
 * Runs write statements assembled from conditional helpers. The spreads widen
 * the array past drizzle's non-empty tuple type, so the cast lives here once.
 */
async function runWriteBatch(db: Db, statements: BatchItem<"sqlite">[]): Promise<void> {
  await db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
}

function categoriesByIdQuery(db: Db, categoryIds: string[]) {
  return db
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.id, categoryIds));
}

function assertNoMissingCategories(categoryIds: string[], found: { id: string }[]): void {
  const foundIds = new Set(found.map((r) => r.id));
  const missing = categoryIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw AppError.badRequest("category_not_found", "one or more categoryIds do not exist", {
      missing,
    });
  }
}

async function assertCategoriesExist(db: Db, categoryIds: string[]): Promise<void> {
  if (categoryIds.length === 0) return;
  assertNoMissingCategories(categoryIds, await categoriesByIdQuery(db, categoryIds));
}

export class ItemsRepository {
  constructor(private readonly db: Db) {}

  async list(query: ItemListQuery): Promise<ListItemsResult> {
    // Every filter is a subquery so the statement binds a constant number of
    // parameters no matter how many items match (D1 caps bound parameters).
    const conditions: SQL[] = [];
    if (query.deletedOnly) {
      conditions.push(isNotNull(items.deletedAt));
    } else if (!query.includeDeleted) {
      conditions.push(isNull(items.deletedAt));
    }
    if (query.kind.length > 0) conditions.push(inArray(items.kind, query.kind));

    if (query.tag.length > 0) {
      // AND semantics: the item must carry every requested tag.
      const tagNames = [...new Set(query.tag)];
      conditions.push(
        inArray(
          items.id,
          this.db
            .select({ itemId: itemTags.itemId })
            .from(itemTags)
            .innerJoin(tags, eq(itemTags.tagId, tags.id))
            .where(inArray(tags.name, tagNames))
            .groupBy(itemTags.itemId)
            .having(sql`count(distinct ${tags.name}) = ${tagNames.length}`),
        ),
      );
    }

    if (query.categoryId.length > 0) {
      conditions.push(sql`${items.id} IN (${itemIdsInCategorySubtreesSql(query.categoryId)})`);
    }

    if (query.color) {
      conditions.push(
        sql`${items.id} IN (SELECT item_id FROM item_colors WHERE ${colorDistanceSquaredSql(
          hexToRgb(query.color),
        )} <= ${COLOR_DISTANCE_THRESHOLD * COLOR_DISTANCE_THRESHOLD})`,
      );
    }

    if (query.q) {
      conditions.push(
        sql`${items.id} IN (SELECT id FROM items_fts WHERE items_fts MATCH ${sanitizeFtsQuery(query.q)})`,
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) throw AppError.badRequest("invalid_cursor", "cursor is malformed");
      const cursorCondition = or(
        lt(items.createdAt, cursor.createdAt),
        and(eq(items.createdAt, cursor.createdAt), lt(items.id, cursor.id)),
      );
      if (cursorCondition) conditions.push(cursorCondition);
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
    const [rows, categoryRows, tagRows] = await this.db.batch(
      itemByIdQueries(this.db, id, includeDeleted),
    );
    return assembleItem(rows as ItemRow[], categoryRows, tagRows);
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

    await runWriteBatch(this.db, [
      this.db.insert(items).values(row),
      ...insertItemCategoriesStatements(this.db, id, input.categoryIds),
      ...insertItemTagsStatements(this.db, id, tagRows),
      ...insertItemColorsStatements(this.db, id, colors),
      insertRevisionStatement(this.db, id, item, actor, timestamp),
    ]);

    return item;
  }

  async update(id: string, input: UpdateItemInput, actor: string): Promise<Item> {
    const categoryIdsProvided = input.categoryIds !== undefined;
    const requestedCategoryIds = categoryIdsProvided ? (input.categoryIds as string[]) : [];
    // The category existence check rides in the same round trip as the item
    // read; errors are still raised in the original order below.
    const [rows, categoryRows, tagRelationRows, foundCategories] = await this.db.batch([
      ...itemByIdQueries(this.db, id, false),
      categoriesByIdQuery(this.db, requestedCategoryIds),
    ]);
    const existing = assembleItem(rows as ItemRow[], categoryRows, tagRelationRows);
    if (!existing) throw AppError.notFound("item not found");
    if (input.kind !== existing.kind) {
      throw AppError.unprocessable("kind_immutable", "an item's kind cannot be changed");
    }

    const tagsProvided = input.tags !== undefined;
    if (categoryIdsProvided) assertNoMissingCategories(requestedCategoryIds, foundCategories);

    const nextCategoryIds = categoryIdsProvided ? requestedCategoryIds : existing.categoryIds;
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

    await runWriteBatch(this.db, [
      this.db.update(items).set(setValues).where(eq(items.id, id)),
      ...replaceItemColorsStatements(this.db, id, colors),
      ...(categoryIdsProvided ? replaceItemCategoriesStatements(this.db, id, nextCategoryIds) : []),
      ...(tagsProvided ? replaceItemTagsStatements(this.db, id, tagRows) : []),
      insertRevisionStatement(this.db, id, merged, actor, timestamp),
    ]);

    return merged;
  }

  async softDelete(id: string, actor: string): Promise<Item> {
    const existing = await this.getById(id, false);
    if (!existing) throw AppError.notFound("item not found");
    const timestamp = now();
    const snapshot: Item = { ...existing, deletedAt: timestamp, updatedAt: timestamp } as Item;

    await runWriteBatch(this.db, [
      this.db
        .update(items)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(eq(items.id, id)),
      insertRevisionStatement(this.db, id, snapshot, actor, timestamp),
    ]);

    return snapshot;
  }

  async restore(id: string, actor: string): Promise<Item> {
    const existing = await this.getById(id, true);
    if (!existing) throw AppError.notFound("item not found");
    if (!existing.deletedAt) throw AppError.badRequest("not_deleted", "item is not in trash");
    const timestamp = now();
    const snapshot: Item = { ...existing, deletedAt: undefined, updatedAt: timestamp } as Item;

    await runWriteBatch(this.db, [
      this.db.update(items).set({ deletedAt: null, updatedAt: timestamp }).where(eq(items.id, id)),
      insertRevisionStatement(this.db, id, snapshot, actor, timestamp),
    ]);

    return snapshot;
  }

  async listRevisions(id: string): Promise<ItemRevision[]> {
    // Only existence matters here, so skip the relation reads getById would do.
    const [existingRows, rows] = await this.db.batch([
      this.db.select({ id: items.id }).from(items).where(eq(items.id, id)).limit(1),
      this.db
        .select()
        .from(itemRevisions)
        .where(eq(itemRevisions.itemId, id))
        .orderBy(desc(itemRevisions.createdAt)),
    ]);
    if (existingRows.length === 0) throw AppError.notFound("item not found");
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      snapshot: row.snapshot as Item,
      actor: row.actor,
      createdAt: row.createdAt,
    }));
  }

  async restoreRevision(id: string, revisionId: string, actor: string): Promise<Item> {
    // Only existence of the item matters; the restored state comes from the revision.
    const [existingRows, revisionRows] = await this.db.batch([
      this.db.select({ id: items.id }).from(items).where(eq(items.id, id)).limit(1),
      this.db
        .select()
        .from(itemRevisions)
        .where(and(eq(itemRevisions.id, revisionId), eq(itemRevisions.itemId, id)))
        .limit(1),
    ]);
    if (existingRows.length === 0) throw AppError.notFound("item not found");
    const revisionRow = revisionRows[0];
    if (!revisionRow) throw AppError.notFound("revision not found");
    const snapshot = revisionRow.snapshot as Item;

    const existingCategories =
      snapshot.categoryIds.length > 0
        ? await categoriesByIdQuery(this.db, snapshot.categoryIds)
        : [];
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

    await runWriteBatch(this.db, [
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
      ...replaceItemCategoriesStatements(this.db, id, validCategoryIds),
      ...replaceItemTagsStatements(this.db, id, tagRows),
      insertRevisionStatement(this.db, id, restored, actor, timestamp),
    ]);

    return restored;
  }
}
