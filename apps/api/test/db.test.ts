import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { getCategoryDescendantIds } from "../src/db/queries";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const now = "2026-09-23T00:00:00.000Z";

async function insertItem(
  id: string,
  overrides: Partial<{
    kind: string;
    title: string | null;
    notes: string | null;
    data: unknown;
    deletedAt: string | null;
    searchText: string | null;
  }> = {},
) {
  await env.DB.prepare(
    `INSERT INTO items (id, kind, title, url, notes, data, source, search_text, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'web', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      overrides.kind ?? "text",
      overrides.title ?? null,
      overrides.notes ?? null,
      JSON.stringify(overrides.data ?? { body: "hello world" }),
      overrides.searchText ?? null,
      now,
      now,
      overrides.deletedAt ?? null,
    )
    .run();
}

describe("migrations", () => {
  it("apply cleanly and create every table", async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);

    for (const table of [
      "items",
      "item_revisions",
      "categories",
      "item_categories",
      "tags",
      "item_tags",
      "item_colors",
      "api_tokens",
    ]) {
      expect(names).toContain(table);
    }
  });
});

describe("items_fts", () => {
  it("finds an inserted item by title", async () => {
    await insertItem("item-fts-title", {
      title: "Nature Moodboard",
      data: { body: "clouds and glass" },
    });

    const { results } = await env.DB.prepare(`SELECT id FROM items_fts WHERE items_fts MATCH ?`)
      .bind("Moodboard")
      .all<{ id: string }>();

    expect(results.map((r) => r.id)).toContain("item-fts-title");
  });

  it("finds an inserted item by notes", async () => {
    await insertItem("item-fts-notes", { notes: "glassmorphism reference board" });

    const { results } = await env.DB.prepare(`SELECT id FROM items_fts WHERE items_fts MATCH ?`)
      .bind("glassmorphism")
      .all<{ id: string }>();

    expect(results.map((r) => r.id)).toContain("item-fts-notes");
  });
});

describe("soft delete", () => {
  it("excludes soft-deleted rows from a basic active-items query", async () => {
    await insertItem("item-active", {});
    await insertItem("item-trashed", { deletedAt: now });

    const { results } = await env.DB.prepare(`SELECT id FROM items WHERE deleted_at IS NULL`).all<{
      id: string;
    }>();

    const ids = results.map((r) => r.id);
    expect(ids).toContain("item-active");
    expect(ids).not.toContain("item-trashed");
  });
});

describe("cascade deletes", () => {
  it("removes item_categories and item_tags rows when the item is deleted", async () => {
    await insertItem("item-cascade", {});
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('cat-1','Nature','nature', NULL, 0)`,
      ),
      env.DB.prepare(`INSERT INTO tags (id, name) VALUES ('tag-1','glass')`),
      env.DB.prepare(
        `INSERT INTO item_categories (item_id, category_id) VALUES ('item-cascade','cat-1')`,
      ),
      env.DB.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('item-cascade','tag-1')`),
    ]);

    await env.DB.prepare(`DELETE FROM items WHERE id = 'item-cascade'`).run();

    const categoryJoin = await env.DB.prepare(
      `SELECT * FROM item_categories WHERE item_id = 'item-cascade'`,
    ).all();
    const tagJoin = await env.DB.prepare(
      `SELECT * FROM item_tags WHERE item_id = 'item-cascade'`,
    ).all();

    expect(categoryJoin.results).toHaveLength(0);
    expect(tagJoin.results).toHaveLength(0);
  });
});

describe("getCategoryDescendantIds", () => {
  it("returns the full subtree (including the roots) for multiple roots", async () => {
    const db = createDb(env.DB);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('root-a','A','a', NULL, 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('child-a1','A1','a1','root-a', 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('grandchild-a1','A1a','a1a','child-a1', 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('root-b','B','b', NULL, 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('child-b1','B1','b1','root-b', 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO categories (id, name, slug, parent_id, position) VALUES ('unrelated','U','u', NULL, 0)`,
      ),
    ]);

    const ids = await getCategoryDescendantIds(db, ["root-a", "root-b"]);

    expect(new Set(ids)).toEqual(
      new Set(["root-a", "child-a1", "grandchild-a1", "root-b", "child-b1"]),
    );
    expect(ids).not.toContain("unrelated");
  });

  it("returns an empty array when given no root ids", async () => {
    const db = createDb(env.DB);
    expect(await getCategoryDescendantIds(db, [])).toEqual([]);
  });
});
