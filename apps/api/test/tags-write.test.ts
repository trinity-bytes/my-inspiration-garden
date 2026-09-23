import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashHex, insertApiToken, insertTag } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function writeAuth(id: string, plaintext: string) {
  const tokenHash = await hashHex(plaintext);
  await insertApiToken(id, { tokenHash, scope: "write" });
  return { Authorization: `Bearer ${plaintext}` };
}

async function insertItemWithTag(itemId: string, tagId: string) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO items (id, kind, title, url, notes, data, source, search_text, created_at, updated_at, deleted_at)
       VALUES (?, 'text', NULL, NULL, NULL, ?, 'web', ?, ?, ?, NULL)`,
    ).bind(
      itemId,
      JSON.stringify({ body: "x" }),
      "",
      "2026-09-23T00:00:00.000Z",
      "2026-09-23T00:00:00.000Z",
    ),
    env.DB.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)`).bind(itemId, tagId),
  ]);
}

describe("tags write group", () => {
  it("401s anonymous and 403s a read-scope token for PATCH /api/tags/:id", async () => {
    await insertTag("tag-perm", "permtag");
    const anon = await SELF.fetch("https://example.com/api/tags/tag-perm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(anon.status).toBe(401);

    const tokenHash = await hashHex("ig_tag_read");
    await insertApiToken("tag-read", { tokenHash, scope: "read" });
    const readRes = await SELF.fetch("https://example.com/api/tags/tag-perm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ig_tag_read" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(readRes.status).toBe(403);
  });

  it("renames a tag and updates items.search_text for affected items", async () => {
    const auth = await writeAuth("tag-write", "ig_tag_write");
    await insertTag("tag-rename-a", "oldname");
    await insertItemWithTag("tag-rename-item", "tag-rename-a");

    const res = await SELF.fetch("https://example.com/api/tags/tag-rename-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ name: "NewName" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ name: string }>()).name).toBe("newname");

    const row = await env.DB.prepare(`SELECT search_text FROM items WHERE id = ?`)
      .bind("tag-rename-item")
      .first<{ search_text: string }>();
    expect(row?.search_text).toBe("newname");
  });

  it("merges into an existing tag when renamed to a name that already exists", async () => {
    const auth = await writeAuth("tag-merge-write", "ig_tag_merge_write");
    await insertTag("tag-merge-a", "mergea");
    await insertTag("tag-merge-b", "mergeb");
    await insertItemWithTag("tag-merge-item", "tag-merge-a");

    const res = await SELF.fetch("https://example.com/api/tags/tag-merge-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ name: "mergeb" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ id: string; name: string }>();
    expect(body.id).toBe("tag-merge-b");

    const stillExists = await env.DB.prepare(
      `SELECT id FROM tags WHERE id = 'tag-merge-a'`,
    ).first();
    expect(stillExists).toBeNull();

    const row = await env.DB.prepare(`SELECT search_text FROM items WHERE id = ?`)
      .bind("tag-merge-item")
      .first<{ search_text: string }>();
    expect(row?.search_text).toBe("mergeb");
  });

  it("deletes a tag and recomputes affected items' search_text", async () => {
    const auth = await writeAuth("tag-delete-write", "ig_tag_delete_write");
    await insertTag("tag-delete-a", "deleteme");
    await insertItemWithTag("tag-delete-item", "tag-delete-a");

    const res = await SELF.fetch("https://example.com/api/tags/tag-delete-a", {
      method: "DELETE",
      headers: auth,
    });
    expect(res.status).toBe(204);

    const row = await env.DB.prepare(`SELECT search_text FROM items WHERE id = ?`)
      .bind("tag-delete-item")
      .first<{ search_text: string }>();
    expect(row?.search_text).toBe("");
  });
});
