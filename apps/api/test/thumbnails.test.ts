import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app";
import { thumbnailKeyFor } from "../src/lib/thumbnails";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0xd, 0x49, 0x48, 0x44, 0x52,
]);
const WEBP_BYTES = new TextEncoder().encode("RIFF....WEBPfake-thumbnail");
const ORIGINAL_KEY = "media/2026/11/photo.png";

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

function fakeThumbnailer() {
  return vi.fn(async (input: ReadableStream<Uint8Array>, _width: number) => {
    await new Response(input).arrayBuffer();
    return streamOf(WEBP_BYTES);
  });
}

beforeEach(async () => {
  const listed = await env.MEDIA.list();
  for (const obj of listed.objects) await env.MEDIA.delete(obj.key);
});

async function putOriginal(key = ORIGINAL_KEY, contentType = "image/png") {
  await env.MEDIA.put(key, PNG_BYTES, { httpMetadata: { contentType } });
}

describe("GET /api/thumbs/:width/*", () => {
  it("generates a WebP thumbnail on first request, stores it in R2 and serves it immutable", async () => {
    await putOriginal();
    const thumbnailer = fakeThumbnailer();
    const app = createApp({ thumbnailer });

    const res = await app.request(`https://example.com/api/thumbs/384/${ORIGINAL_KEY}`, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WEBP_BYTES);
    expect(thumbnailer).toHaveBeenCalledTimes(1);
    expect(thumbnailer.mock.calls[0]?.[1]).toBe(384);

    const stored = await env.MEDIA.get(thumbnailKeyFor(ORIGINAL_KEY, 384));
    expect(stored?.httpMetadata?.contentType).toBe("image/webp");
    expect(new Uint8Array(await (stored as R2ObjectBody).arrayBuffer())).toEqual(WEBP_BYTES);
  });

  it("serves an already stored thumbnail without transforming again", async () => {
    await putOriginal();
    await env.MEDIA.put(thumbnailKeyFor(ORIGINAL_KEY, 768), WEBP_BYTES, {
      httpMetadata: { contentType: "image/webp" },
    });
    const thumbnailer = fakeThumbnailer();
    const app = createApp({ thumbnailer });

    const res = await app.request(`https://example.com/api/thumbs/768/${ORIGINAL_KEY}`, {}, env);

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WEBP_BYTES);
    expect(thumbnailer).not.toHaveBeenCalled();
  });

  it("redirects to the original, briefly cached and not stored, when the transformation fails", async () => {
    await putOriginal();
    const thumbnailer = vi.fn(async () => {
      throw new Error("9422: quota exceeded");
    });
    const app = createApp({ thumbnailer });

    const res = await app.request(`https://example.com/api/thumbs/384/${ORIGINAL_KEY}`, {}, env);

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe(`/api/media/${ORIGINAL_KEY}`);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await env.MEDIA.head(thumbnailKeyFor(ORIGINAL_KEY, 384))).toBeNull();
  });

  it("redirects to the original when no Images binding is configured", async () => {
    await putOriginal();
    const app = createApp();

    const res = await app.request(
      `https://example.com/api/thumbs/384/${ORIGINAL_KEY}`,
      {},
      { ...env, IMAGES: undefined },
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe(`/api/media/${ORIGINAL_KEY}`);
  });

  it("rejects a width outside the allowed variants", async () => {
    await putOriginal();
    const thumbnailer = fakeThumbnailer();
    const app = createApp({ thumbnailer });

    const res = await app.request(`https://example.com/api/thumbs/1000/${ORIGINAL_KEY}`, {}, env);

    expect(res.status).toBe(400);
    expect(thumbnailer).not.toHaveBeenCalled();
  });

  it("rejects non-canonical width spellings", async () => {
    await putOriginal();
    const thumbnailer = fakeThumbnailer();
    const app = createApp({ thumbnailer });

    const hex = await app.request(`https://example.com/api/thumbs/0x180/${ORIGINAL_KEY}`, {}, env);

    expect(hex.status).toBe(400);
    expect(thumbnailer).not.toHaveBeenCalled();
  });

  it("percent-encodes the original key in the fallback redirect", async () => {
    await putOriginal("media/2026/11/a b.png");
    const app = createApp({
      thumbnailer: vi.fn(async () => {
        throw new Error("fail");
      }),
    });

    const res = await app.request(
      "https://example.com/api/thumbs/384/media/2026/11/a%20b.png",
      {},
      env,
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/api/media/media/2026/11/a%20b.png");
  });

  it("returns 404 for a missing original", async () => {
    const thumbnailer = fakeThumbnailer();
    const app = createApp({ thumbnailer });

    const res = await app.request(`https://example.com/api/thumbs/384/${ORIGINAL_KEY}`, {}, env);

    expect(res.status).toBe(404);
    expect(thumbnailer).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-image original or a key outside media/", async () => {
    await putOriginal("media/2026/11/clip.mp4", "video/mp4");
    await putOriginal("thumbs/w384/media/2026/11/photo.png.webp");
    const thumbnailer = fakeThumbnailer();
    const app = createApp({ thumbnailer });

    const video = await app.request(
      "https://example.com/api/thumbs/384/media/2026/11/clip.mp4",
      {},
      env,
    );
    const nested = await app.request(
      "https://example.com/api/thumbs/384/thumbs/w384/media/2026/11/photo.png.webp",
      {},
      env,
    );

    expect(video.status).toBe(404);
    expect(nested.status).toBe(404);
    expect(thumbnailer).not.toHaveBeenCalled();
  });
});
