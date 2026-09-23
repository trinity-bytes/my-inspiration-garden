import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashHex, insertApiToken } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function writeToken(id: string, plaintext: string) {
  const tokenHash = await hashHex(plaintext);
  await insertApiToken(id, { tokenHash, scope: "write", name: "writer" });
  return { Authorization: `Bearer ${plaintext}` };
}

async function itemColorRows(itemId: string) {
  const { results } = await env.DB.prepare(
    `SELECT hex, weight FROM item_colors WHERE item_id = ? ORDER BY weight DESC`,
  )
    .bind(itemId)
    .all<{ hex: string; weight: number }>();
  return results;
}

async function createItem(headers: Record<string, string>, body: unknown) {
  const res = await SELF.fetch("https://example.com/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return res;
}

describe("item_colors indexing", () => {
  it("indexes item_colors from an image item's data.palette on create", async () => {
    const auth = await writeToken("colors-image-create", "ig_colors_image_create");
    const res = await createItem(auth, {
      kind: "image",
      source: "web",
      data: {
        r2Key: "media/2026/09/a.png",
        width: 10,
        height: 10,
        mime: "image/png",
        palette: [
          { hex: "#ff0000", weight: 0.6 },
          { hex: "#0000ff", weight: 0.4 },
        ],
      },
    });
    expect(res.status).toBe(201);
    const item = await res.json<{ id: string }>();

    const rows = await itemColorRows(item.id);
    expect(rows).toEqual([
      { hex: "#ff0000", weight: 0.6 },
      { hex: "#0000ff", weight: 0.4 },
    ]);
  });

  it("indexes item_colors from a palette item's data.colors on create", async () => {
    const auth = await writeToken("colors-palette-create", "ig_colors_palette_create");
    const res = await createItem(auth, {
      kind: "palette",
      source: "web",
      data: { colors: [{ hex: "#112233" }, { hex: "#445566" }] },
    });
    expect(res.status).toBe(201);
    const item = await res.json<{ id: string }>();

    const rows = await itemColorRows(item.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.hex).sort()).toEqual(["#112233", "#445566"]);
  });

  it("replaces item_colors on update instead of accumulating", async () => {
    const auth = await writeToken("colors-update", "ig_colors_update");
    const created = await createItem(auth, {
      kind: "image",
      source: "web",
      data: { r2Key: "k", width: 1, height: 1, mime: "image/png", palette: ["#ff0000"] },
    });
    const item = await created.json<{ id: string }>();
    expect(await itemColorRows(item.id)).toHaveLength(1);

    await SELF.fetch(`https://example.com/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({
        kind: "image",
        data: {
          r2Key: "k",
          width: 1,
          height: 1,
          mime: "image/png",
          palette: ["#00ff00", "#0000ff"],
        },
      }),
    });

    const rows = await itemColorRows(item.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.hex).sort()).toEqual(["#00ff00", "#0000ff"].sort());
  });

  it("leaves item_colors empty for an item with no palette/colors", async () => {
    const auth = await writeToken("colors-none", "ig_colors_none");
    const res = await createItem(auth, { kind: "text", source: "web", data: { body: "hi" } });
    const item = await res.json<{ id: string }>();
    expect(await itemColorRows(item.id)).toEqual([]);
  });

  it("makes color-filtered list results find the newly indexed image item", async () => {
    const auth = await writeToken("colors-filter", "ig_colors_filter");
    await createItem(auth, {
      kind: "image",
      source: "web",
      data: { r2Key: "k2", width: 1, height: 1, mime: "image/png", palette: ["#ff0000"] },
    });

    const res = await SELF.fetch("https://example.com/api/items?color=%23ff0000");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { kind: string }[] }>();
    expect(body.items.some((i) => i.kind === "image")).toBe(true);
  });
});
