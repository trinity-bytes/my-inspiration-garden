#!/usr/bin/env node
/**
 * One-off backfill: gives every uploaded video (`provider: "file"`) without a
 * `data.thumbnail` a poster frame, the same one the web app now captures at
 * upload (`apps/web/src/forms/video-poster.ts`). Canvas cards paint from that
 * poster instead of downloading the video. Never run against an environment
 * you have not chosen on purpose.
 *
 *   GARDEN_API_URL=https://garden.example.com GARDEN_API_TOKEN=ig_xxx \
 *     node apps/api/scripts/backfill-video-posters.mjs [--dry-run]
 *
 * Requires `ffmpeg` on PATH (reads the video over HTTP with range requests).
 * The token needs write scope; `--dry-run` only lists (public) items and needs
 * no token. PATCH replaces `data` wholesale, so the item's current `data` is
 * sent back with only `thumbnail` added.
 */

import { spawn } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");
const baseUrl = process.env.GARDEN_API_URL?.replace(/\/+$/, "");
const token = process.env.GARDEN_API_TOKEN;

if (!baseUrl || (!token && !dryRun)) {
  console.error(
    "GARDEN_API_URL and GARDEN_API_TOKEN are required (the token is optional with --dry-run)",
  );
  process.exit(1);
}

/** Same bound as the web app's capture: the poster's shorter side, never upscaled. */
const POSTER_SHORT_SIDE_PX = 960;
const SCALE_FILTER =
  `scale='if(gt(iw,ih),-2,min(${POSTER_SHORT_SIDE_PX},iw))'` +
  `:'if(gt(iw,ih),min(${POSTER_SHORT_SIDE_PX},ih),-2)'`;

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}`);
  return response.json();
}

async function* listVideoItems() {
  let cursor;
  do {
    const query = new URLSearchParams({ kind: "video", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await api(`/api/items?${query}`);
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}

/** Resolves the WebP bytes of one frame at `seconds`, or an empty buffer when there is none. */
function extractFrame(videoUrl, seconds) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        String(seconds),
        "-i",
        videoUrl,
        "-frames:v",
        "1",
        "-vf",
        SCALE_FILTER,
        "-c:v",
        "libwebp",
        "-quality",
        "85",
        "-f",
        "webp",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let stderr = "";
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

/** One second in, like the web capture; clips shorter than that fall back to their first frame. */
async function capturePoster(videoUrl) {
  const frame = await extractFrame(videoUrl, 1);
  return frame.byteLength > 0 ? frame : extractFrame(videoUrl, 0);
}

async function uploadPoster(bytes) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/webp" }), "poster.webp");
  return api("/api/media", { method: "POST", body: form });
}

const summary = { added: 0, skipped: 0, failed: 0 };

for await (const item of listVideoItems()) {
  if (item.data?.provider !== "file" || !item.data.r2Key || item.data.thumbnail) {
    summary.skipped += 1;
    continue;
  }
  if (dryRun) {
    console.log(`would add a poster to ${item.id} (${item.data.r2Key})`);
    summary.added += 1;
    continue;
  }
  try {
    const poster = await capturePoster(`${baseUrl}/api/media/${item.data.r2Key}`);
    if (poster.byteLength === 0) throw new Error("no frame decoded");
    const stored = await uploadPoster(poster);
    await api(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "video", data: { ...item.data, thumbnail: stored.r2Key } }),
    });
    console.log(`added ${item.id} -> ${stored.r2Key}`);
    summary.added += 1;
  } catch (error) {
    console.error(`failed ${item.id}: ${error.message}`);
    summary.failed += 1;
  }
}

console.log(
  `${dryRun ? "[dry-run] " : ""}added: ${summary.added}, skipped: ${summary.skipped}, failed: ${summary.failed}`,
);
