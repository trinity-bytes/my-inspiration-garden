import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashHex, insertApiToken, insertCategory } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function writeToken(id: string, plaintext: string, name = "writer") {
  const tokenHash = await hashHex(plaintext);
  await insertApiToken(id, { tokenHash, scope: "write", name });
  return { Authorization: `Bearer ${plaintext}` };
}

async function createItem(headers: Record<string, string>, body: unknown) {
  const res = await SELF.fetch("https://example.com/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return res;
}

describe("POST /api/items", () => {
  it("creates an item, writes a revision, and validates categoryIds exist", async () => {
    const auth = await writeToken("write-create", "ig_write_create");
    const catId = "33333333-3333-4333-8333-333333333333";
    await insertCategory(catId, { name: "Cat", slug: "cat" });

    const res = await createItem(auth, {
      kind: "text",
      source: "web",
      data: { body: "hi" },
      tags: ["Nature", "nature", " Clouds "],
      categoryIds: [catId],
    });
    expect(res.status).toBe(201);
    const item = await res.json<{ id: string; tags: string[]; categoryIds: string[] }>();
    expect(item.tags).toEqual(["nature", "clouds"]);
    expect(item.categoryIds).toEqual([catId]);

    const revisions = await SELF.fetch(`https://example.com/api/items/${item.id}/revisions`, {
      headers: auth,
    });
    const revBody = await revisions.json<{ revisions: { actor: string }[] }>();
    expect(revBody.revisions).toHaveLength(1);
    expect(revBody.revisions[0]?.actor).toBe("agent:writer");
  });

  it("400s when a categoryId does not exist", async () => {
    const auth = await writeToken("write-badcat", "ig_write_badcat");
    const res = await createItem(auth, {
      kind: "text",
      source: "web",
      data: { body: "hi" },
      categoryIds: ["99999999-9999-4999-8999-999999999999"],
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/items/:id", () => {
  it("updates fields, replaces tags wholesale, and rejects a kind change", async () => {
    const auth = await writeToken("write-update", "ig_write_update");
    const created = await createItem(auth, {
      kind: "text",
      source: "web",
      data: { body: "hi" },
      tags: ["one"],
    });
    const item = await created.json<{ id: string }>();

    const patched = await SELF.fetch(`https://example.com/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ kind: "text", tags: ["two", "three"], title: "New title" }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json<{ tags: string[]; title: string }>();
    expect(patchedBody.tags).toEqual(["two", "three"]);
    expect(patchedBody.title).toBe("New title");

    const kindMismatch = await SELF.fetch(`https://example.com/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({
        kind: "image",
        data: { r2Key: "k", width: 1, height: 1, mime: "image/png" },
      }),
    });
    expect(kindMismatch.status).toBe(422);
  });

  it("404s updating a missing item", async () => {
    const auth = await writeToken("write-update-404", "ig_write_update_404");
    const res = await SELF.fetch("https://example.com/api/items/does-not-exist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ kind: "text" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE and restore", () => {
  it("soft-deletes, hides from anonymous list, then restores", async () => {
    const auth = await writeToken("write-delete", "ig_write_delete");
    const created = await createItem(auth, { kind: "text", source: "web", data: { body: "hi" } });
    const item = await created.json<{ id: string }>();

    const deleted = await SELF.fetch(`https://example.com/api/items/${item.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleted.status).toBe(200);

    const anonGet = await SELF.fetch(`https://example.com/api/items/${item.id}`);
    expect(anonGet.status).toBe(404);

    const restored = await SELF.fetch(`https://example.com/api/items/${item.id}/restore`, {
      method: "POST",
      headers: auth,
    });
    expect(restored.status).toBe(200);

    const anonGetAfterRestore = await SELF.fetch(`https://example.com/api/items/${item.id}`);
    expect(anonGetAfterRestore.status).toBe(200);
  });
});

describe("revisions restore", () => {
  it("restores an earlier revision as a new revision", async () => {
    const auth = await writeToken("write-revrestore", "ig_write_revrestore");
    const created = await createItem(auth, {
      kind: "text",
      source: "web",
      data: { body: "version one" },
      title: "v1",
    });
    const item = await created.json<{ id: string }>();

    await SELF.fetch(`https://example.com/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ kind: "text", title: "v2" }),
    });

    const revisionsRes = await SELF.fetch(`https://example.com/api/items/${item.id}/revisions`, {
      headers: auth,
    });
    const { revisions } = await revisionsRes.json<{
      revisions: { id: string; snapshot: { title?: string } }[];
    }>();
    const v1Revision = revisions.find((r) => r.snapshot.title === "v1");
    expect(v1Revision).toBeDefined();

    const restoreRes = await SELF.fetch(
      `https://example.com/api/items/${item.id}/revisions/${v1Revision?.id}/restore`,
      { method: "POST", headers: auth },
    );
    expect(restoreRes.status).toBe(200);
    const restored = await restoreRes.json<{ title: string }>();
    expect(restored.title).toBe("v1");

    const afterRevisionsRes = await SELF.fetch(
      `https://example.com/api/items/${item.id}/revisions`,
      {
        headers: auth,
      },
    );
    const after = await afterRevisionsRes.json<{ revisions: unknown[] }>();
    expect(after.revisions).toHaveLength(3);
  });
});
