import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashHex, insertApiToken, insertCategory } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function writeAuth(id: string, plaintext: string) {
  const tokenHash = await hashHex(plaintext);
  await insertApiToken(id, { tokenHash, scope: "write" });
  return { Authorization: `Bearer ${plaintext}` };
}

describe("categories write group", () => {
  it("401s anonymous and 403s a read-scope token for POST /api/categories", async () => {
    const anon = await SELF.fetch("https://example.com/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(anon.status).toBe(401);

    const tokenHash = await hashHex("ig_cat_read");
    await insertApiToken("cat-read", { tokenHash, scope: "read" });
    const readRes = await SELF.fetch("https://example.com/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ig_cat_read" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(readRes.status).toBe(403);
  });

  it("creates, renames/moves, and rejects a cycle", async () => {
    const auth = await writeAuth("cat-write", "ig_cat_write");

    const rootRes = await SELF.fetch("https://example.com/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ name: "Root" }),
    });
    expect(rootRes.status).toBe(201);
    const root = await rootRes.json<{ id: string }>();

    const childRes = await SELF.fetch("https://example.com/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ name: "Child", parentId: root.id }),
    });
    const child = await childRes.json<{ id: string }>();
    expect(childRes.status).toBe(201);

    const renameRes = await SELF.fetch(`https://example.com/api/categories/${child.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ name: "Renamed Child" }),
    });
    expect(renameRes.status).toBe(200);
    expect((await renameRes.json<{ name: string }>()).name).toBe("Renamed Child");

    const cycleRes = await SELF.fetch(`https://example.com/api/categories/${root.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ parentId: child.id }),
    });
    expect(cycleRes.status).toBe(422);

    const selfCycleRes = await SELF.fetch(`https://example.com/api/categories/${root.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ parentId: root.id }),
    });
    expect(selfCycleRes.status).toBe(422);
  });

  it("deletes a top-level category, moving its children up to root", async () => {
    const auth = await writeAuth("cat-delete", "ig_cat_delete");
    const rootId = "44444444-4444-4444-8444-444444444444";
    const childId = "55555555-5555-4555-8555-555555555555";
    await insertCategory(rootId, { name: "Root2", slug: "root2" });
    await insertCategory(childId, { name: "Child2", slug: "child2", parentId: rootId });

    const del = await SELF.fetch(`https://example.com/api/categories/${rootId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(del.status).toBe(204);

    const listRes = await SELF.fetch("https://example.com/api/categories");
    const list = await listRes.json<{ categories: { id: string; parentId: string | null }[] }>();
    const child = list.categories.find((c) => c.id === childId);
    expect(child?.parentId).toBeNull();
  });

  it("deletes a mid-tree category, moving its children up to ITS parent (not to root)", async () => {
    const auth = await writeAuth("cat-delete-mid", "ig_cat_delete_mid");
    const grandId = "66666666-6666-4666-8666-666666666666";
    const midId = "77777777-7777-4777-8777-777777777777";
    const leafId = "88888888-8888-4888-8888-888888888888";
    await insertCategory(grandId, { name: "Grand", slug: "grand" });
    await insertCategory(midId, { name: "Mid", slug: "mid", parentId: grandId });
    await insertCategory(leafId, { name: "Leaf", slug: "leaf", parentId: midId });

    const del = await SELF.fetch(`https://example.com/api/categories/${midId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(del.status).toBe(204);

    const listRes = await SELF.fetch("https://example.com/api/categories");
    const list = await listRes.json<{ categories: { id: string; parentId: string | null }[] }>();
    const leaf = list.categories.find((c) => c.id === leafId);
    expect(leaf?.parentId).toBe(grandId);
  });

  it("deduplicates a moved child's slug when it collides with an existing sibling under the new parent", async () => {
    const auth = await writeAuth("cat-delete-clash", "ig_cat_delete_clash");
    const grandId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const midId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const leafId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const clashId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await insertCategory(grandId, { name: "Grand", slug: "grand" });
    await insertCategory(midId, { name: "Mid", slug: "mid", parentId: grandId });
    await insertCategory(leafId, { name: "Leaf", slug: "clash", parentId: midId });
    // Already a direct child of `grandId` with the slug `leaf` will inherit once promoted.
    await insertCategory(clashId, { name: "Clash", slug: "clash", parentId: grandId });

    const del = await SELF.fetch(`https://example.com/api/categories/${midId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(del.status).toBe(204);

    const listRes = await SELF.fetch("https://example.com/api/categories");
    const list = await listRes.json<{ categories: { id: string; parentId: string | null; slug: string }[] }>();
    const leaf = list.categories.find((c) => c.id === leafId);
    expect(leaf?.parentId).toBe(grandId);
    expect(leaf?.slug).toBe("clash-2");
  });

  it("removes only the item-category link when a category with tagged items is deleted", async () => {
    const auth = await writeAuth("cat-delete-items", "ig_cat_delete_items");
    const catId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await insertCategory(catId, { name: "Solo", slug: "solo" });

    const createRes = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({
        kind: "text",
        categoryIds: [catId],
        tags: [],
        data: { body: "hello" },
      }),
    });
    expect(createRes.status).toBe(201);
    const item = await createRes.json<{ id: string }>();

    const del = await SELF.fetch(`https://example.com/api/categories/${catId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(del.status).toBe(204);

    const itemRes = await SELF.fetch(`https://example.com/api/items/${item.id}`);
    const fetchedItem = await itemRes.json<{ categoryIds: string[] }>();
    expect(fetchedItem.categoryIds).toEqual([]);
  });
});
