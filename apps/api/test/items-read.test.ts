import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashHex, insertApiToken, insertCategory, insertTag } from "./helpers";

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
    url: string | null;
    data: unknown;
    source: string;
    deletedAt: string | null;
    searchText: string | null;
    createdAt: string;
  }> = {},
) {
  await env.DB.prepare(
    `INSERT INTO items (id, kind, title, url, notes, data, source, search_text, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      overrides.kind ?? "text",
      overrides.title ?? null,
      overrides.url ?? null,
      overrides.notes ?? null,
      JSON.stringify(overrides.data ?? { body: "hello world" }),
      overrides.source ?? "web",
      overrides.searchText ?? null,
      overrides.createdAt ?? now,
      overrides.createdAt ?? now,
      overrides.deletedAt ?? null,
    )
    .run();
}

async function linkItemCategory(itemId: string, categoryId: string) {
  await env.DB.prepare(`INSERT INTO item_categories (item_id, category_id) VALUES (?, ?)`)
    .bind(itemId, categoryId)
    .run();
}

async function linkItemTag(itemId: string, tagId: string) {
  await env.DB.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)`)
    .bind(itemId, tagId)
    .run();
}

async function insertItemColor(itemId: string, hex: string) {
  await env.DB.prepare(`INSERT INTO item_colors (item_id, hex, weight) VALUES (?, ?, 1)`)
    .bind(itemId, hex)
    .run();
}

describe("GET /api/items filters", () => {
  it("filters by kind", async () => {
    await insertItem("kind-text-1", { kind: "text" });
    await insertItem("kind-image-1", {
      kind: "image",
      data: { r2Key: "k", width: 1, height: 1, mime: "image/png" },
    });

    const res = await SELF.fetch("https://example.com/api/items?kind=image");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { id: string; kind: string }[] }>();
    expect(body.items.every((i) => i.kind === "image")).toBe(true);
    expect(body.items.map((i) => i.id)).toContain("kind-image-1");
    expect(body.items.map((i) => i.id)).not.toContain("kind-text-1");
  });

  it("filters by tag with AND semantics across multiple tags", async () => {
    await insertTag("tag-a", "alpha");
    await insertTag("tag-b", "beta");
    await insertItem("tag-both", {});
    await insertItem("tag-only-a", {});
    await linkItemTag("tag-both", "tag-a");
    await linkItemTag("tag-both", "tag-b");
    await linkItemTag("tag-only-a", "tag-a");

    const res = await SELF.fetch("https://example.com/api/items?tag=alpha&tag=beta");
    const body = await res.json<{ items: { id: string }[] }>();
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("tag-both");
    expect(ids).not.toContain("tag-only-a");
  });

  it("filters by category including descendants", async () => {
    const rootId = "11111111-1111-4111-8111-111111111111";
    const childId = "22222222-2222-4222-8222-222222222222";
    await insertCategory(rootId, { name: "Root", slug: "root" });
    await insertCategory(childId, { name: "Child", slug: "child", parentId: rootId });
    await insertItem("cat-item-child", {});
    await insertItem("cat-item-unrelated", {});
    await linkItemCategory("cat-item-child", childId);

    const res = await SELF.fetch(`https://example.com/api/items?categoryId=${rootId}`);
    const body = await res.json<{ items: { id: string }[] }>();
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("cat-item-child");
    expect(ids).not.toContain("cat-item-unrelated");
  });

  it("filters by color within the documented RGB distance threshold", async () => {
    await insertItem("color-close", {});
    await insertItem("color-far", {});
    await insertItemColor("color-close", "#101010");
    await insertItemColor("color-far", "#ffffff");

    const res = await SELF.fetch("https://example.com/api/items?color=%23000000");
    const body = await res.json<{ items: { id: string }[] }>();
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("color-close");
    expect(ids).not.toContain("color-far");
  });

  it("matches full-text search against title/notes/body", async () => {
    await insertItem("fts-title-item", { title: "Nature Moodboard Search Target" });
    const res = await SELF.fetch("https://example.com/api/items?q=Moodboard");
    const body = await res.json<{ items: { id: string }[] }>();
    expect(body.items.map((i) => i.id)).toContain("fts-title-item");
  });

  it("matches full-text search against tag-only content via search_text", async () => {
    await insertItem("fts-tag-item", { searchText: "uniquetagword" });
    const res = await SELF.fetch("https://example.com/api/items?q=uniquetagword");
    const body = await res.json<{ items: { id: string }[] }>();
    expect(body.items.map((i) => i.id)).toContain("fts-tag-item");
  });

  it("does not error on special characters in q", async () => {
    const res = await SELF.fetch(
      `https://example.com/api/items?q=${encodeURIComponent('"weird" OR (query) NOT* stuff')}`,
    );
    expect(res.status).toBe(200);
  });

  it("excludes soft-deleted items by default and requires auth for includeDeleted", async () => {
    await insertItem("visible-item", {});
    await insertItem("trashed-item", { deletedAt: now });

    const anon = await SELF.fetch("https://example.com/api/items");
    const anonBody = await anon.json<{ items: { id: string }[] }>();
    expect(anonBody.items.map((i) => i.id)).not.toContain("trashed-item");

    const anonIncludeDeleted = await SELF.fetch(
      "https://example.com/api/items?includeDeleted=true",
    );
    expect(anonIncludeDeleted.status).toBe(403);

    const tokenHash = await hashHex("ig_read_token_plain");
    await insertApiToken("read-token-1", { tokenHash, scope: "read" });
    const readTokenIncludeDeleted = await SELF.fetch(
      "https://example.com/api/items?includeDeleted=true",
      {
        headers: { Authorization: "Bearer ig_read_token_plain" },
      },
    );
    expect(readTokenIncludeDeleted.status).toBe(403);

    const writeTokenHash = await hashHex("ig_write_token_plain");
    await insertApiToken("write-token-1", { tokenHash: writeTokenHash, scope: "write" });
    const writeTokenIncludeDeleted = await SELF.fetch(
      "https://example.com/api/items?includeDeleted=true",
      {
        headers: { Authorization: "Bearer ig_write_token_plain" },
      },
    );
    expect(writeTokenIncludeDeleted.status).toBe(200);
    const writeBody = await writeTokenIncludeDeleted.json<{ items: { id: string }[] }>();
    expect(writeBody.items.map((i) => i.id)).toContain("trashed-item");
  });
});

describe("GET /api/items pagination", () => {
  it("returns stable, non-overlapping pages ordered by created_at desc, id desc", async () => {
    for (let i = 0; i < 5; i++) {
      await insertItem(`page-item-${i}`, {
        createdAt: `2026-01-01T00:00:0${i}.000Z`,
        title: `page ${i}`,
      });
    }

    const first = await SELF.fetch("https://example.com/api/items?limit=2&kind=text&q=page");
    const firstBody = await first.json<{ items: { id: string }[]; nextCursor: string | null }>();
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).toBeTruthy();

    const second = await SELF.fetch(
      `https://example.com/api/items?limit=2&kind=text&q=page&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
    );
    const secondBody = await second.json<{ items: { id: string }[] }>();

    const firstIds = new Set(firstBody.items.map((i) => i.id));
    for (const item of secondBody.items) expect(firstIds.has(item.id)).toBe(false);
  });
});

describe("GET /api/items/:id", () => {
  it("returns 404 for a missing item", async () => {
    const res = await SELF.fetch("https://example.com/api/items/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a soft-deleted item to an anonymous caller", async () => {
    await insertItem("detail-trashed", { deletedAt: now });
    const res = await SELF.fetch("https://example.com/api/items/detail-trashed");
    expect(res.status).toBe(404);
  });

  it("returns the item with categoryIds and tags populated", async () => {
    await insertCategory("detail-cat", { name: "Detail", slug: "detail" });
    await insertTag("detail-tag", "detailtag");
    await insertItem("detail-item", {});
    await linkItemCategory("detail-item", "detail-cat");
    await linkItemTag("detail-item", "detail-tag");

    const res = await SELF.fetch("https://example.com/api/items/detail-item");
    expect(res.status).toBe(200);
    const body = await res.json<{ categoryIds: string[]; tags: string[] }>();
    expect(body.categoryIds).toContain("detail-cat");
    expect(body.tags).toContain("detailtag");
  });
});

describe("GET /api/categories and /api/tags", () => {
  it("returns a flat category list with parentId and position", async () => {
    await insertCategory("flat-root", { name: "Flat Root", slug: "flat-root", position: 1 });
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<{
      categories: { id: string; parentId: string | null; position: number }[];
    }>();
    const found = body.categories.find((c) => c.id === "flat-root");
    expect(found).toBeDefined();
    expect(found?.parentId).toBeNull();
  });

  it("returns tags with counts", async () => {
    await insertTag("count-tag", "counttag");
    await insertItem("count-tag-item", {});
    await linkItemTag("count-tag-item", "count-tag");

    const res = await SELF.fetch("https://example.com/api/tags");
    const body = await res.json<{ tags: { id: string; count: number }[] }>();
    const found = body.tags.find((t) => t.id === "count-tag");
    expect(found?.count).toBeGreaterThanOrEqual(1);
  });
});
