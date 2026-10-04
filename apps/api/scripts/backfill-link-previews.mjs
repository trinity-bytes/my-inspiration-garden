#!/usr/bin/env node
/**
 * One-off backfill: re-saves every link item whose `data.previewImage` is still a
 * remote http(s) URL so the API imports the image into R2 (see
 * `apps/api/src/lib/link-preview.ts`). Never run against an environment you have
 * not chosen on purpose.
 *
 *   GARDEN_API_URL=https://garden.example.com GARDEN_API_TOKEN=ig_xxx \
 *     node apps/api/scripts/backfill-link-previews.mjs [--dry-run]
 *
 * The token needs write scope. PATCH replaces `data` wholesale, so the item's
 * current `data` is sent back unchanged.
 */

const dryRun = process.argv.includes("--dry-run");
const baseUrl = process.env.GARDEN_API_URL?.replace(/\/+$/, "");
const token = process.env.GARDEN_API_TOKEN;

if (!baseUrl || !token) {
  console.error("GARDEN_API_URL and GARDEN_API_TOKEN are required");
  process.exit(1);
}

const isRemoteUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}`);
  return response.json();
}

async function* listLinkItems() {
  let cursor;
  do {
    const query = new URLSearchParams({ kind: "link", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await api(`/api/items?${query}`);
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}

const summary = { imported: 0, stillUrl: 0, skipped: 0, failed: 0 };

for await (const item of listLinkItems()) {
  if (!isRemoteUrl(item.data?.previewImage)) {
    summary.skipped += 1;
    continue;
  }
  if (dryRun) {
    console.log(`would re-save ${item.id} (${item.data.previewImage})`);
    summary.stillUrl += 1;
    continue;
  }
  try {
    const updated = await api(`/api/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ kind: "link", data: item.data }),
    });
    if (isRemoteUrl(updated.data?.previewImage)) {
      console.log(`still a url ${item.id} (${updated.data.previewImage})`);
      summary.stillUrl += 1;
    } else {
      console.log(`imported ${item.id} -> ${updated.data.previewImage}`);
      summary.imported += 1;
    }
  } catch (error) {
    console.error(`failed ${item.id}: ${error.message}`);
    summary.failed += 1;
  }
}

console.log(
  `${dryRun ? "[dry-run] " : ""}imported: ${summary.imported}, still-url: ${summary.stillUrl}, skipped: ${summary.skipped}, failed: ${summary.failed}`,
);
