import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

/**
 * Core items table: fixed columns shared by every kind, plus a JSON `data`
 * column holding the per-kind shape validated by `@garden/shared`. Soft
 * delete via `deleted_at` (trash); hard delete is not part of this schema.
 */
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title"),
    url: text("url"),
    notes: text("notes"),
    data: text("data", { mode: "json" }).notNull(),
    source: text("source").notNull(),
    /**
     * Denormalized, space-joined tag names, kept in sync by the repository
     * layer whenever `item_tags` changes for this item. FTS5 triggers read
     * this column instead of joining `item_tags`/`tags` at write time, which
     * keeps the sync triggers simple (see the FTS5 migration for why this was
     * chosen over per-tag triggers on the join table).
     */
    searchText: text("search_text"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("items_kind_idx").on(table.kind),
    index("items_created_at_idx").on(table.createdAt),
    index("items_deleted_at_idx").on(table.deletedAt),
    // Serves the list query: `deleted_at` filter + `created_at DESC, id DESC`
    // keyset order, so pages are read in index order without a sort step.
    index("items_deleted_at_created_at_id_idx").on(
      table.deletedAt,
      sql`${table.createdAt} desc`,
      sql`${table.id} desc`,
    ),
  ],
);

/**
 * Full item snapshots (including categoryIds/tags) captured on every write,
 * enabling undo/history. Cascades with the item: soft delete keeps the item
 * row (and its revisions) around; only a hard delete removes them together.
 */
export const itemRevisions = sqliteTable(
  "item_revisions",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    snapshot: text("snapshot", { mode: "json" }).notNull(),
    actor: text("actor").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("item_revisions_item_id_idx").on(table.itemId)],
);

/**
 * Hierarchical category tree, unlimited depth via self-referencing `parent_id`.
 *
 * FK delete behavior: `ON DELETE SET NULL`, a safety net for a raw delete
 * that bypasses the repository. `CategoriesRepository.delete` is
 * the intended path: it re-parents direct children to the deleted
 * category's own parent (its `parent_id`, possibly `null`) before removing
 * the row, so those children keep their place one level up the tree
 * instead of being promoted all the way to root. Cascading the whole
 * subtree was rejected (could silently wipe out a large subtree the owner
 * did not intend to delete), and restricting was rejected too (would force
 * manually re-parenting every child before the delete could succeed).
 */
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
  },
  (table) => [unique("categories_parent_slug_unique").on(table.parentId, table.slug)],
);

/** Items <-> categories many-to-many. Cascades on either side of the join. */
export const itemCategories = sqliteTable(
  "item_categories",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.categoryId] }),
    index("item_categories_category_id_idx").on(table.categoryId),
  ],
);

/** Flat, free-form tags. */
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

/** Items <-> tags many-to-many. Cascades on either side of the join. */
export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("item_tags_tag_id_idx").on(table.tagId),
  ],
);

/**
 * Denormalized per-item color weights, populated by palette-extraction
 * ingestion to power color filtering without re-decoding images.
 */
export const itemColors = sqliteTable(
  "item_colors",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    hex: text("hex").notNull(),
    weight: real("weight").notNull().default(1),
  },
  (table) => [
    index("item_colors_item_id_idx").on(table.itemId),
    index("item_colors_hex_idx").on(table.hex),
  ],
);

/** Scoped bearer tokens for extension/PWA/agent clients. Only the hash is stored. */
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scope: text("scope").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
});
