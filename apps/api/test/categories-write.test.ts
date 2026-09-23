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

  it("deletes a category, promoting its children to root", async () => {
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
});
