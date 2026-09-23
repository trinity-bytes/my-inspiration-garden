import { isSafeFetchUrl } from "@garden/shared";
import type { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { IMAGE_MIME_TYPES, sniffMime, VIDEO_MIME_TYPES } from "../../lib/magic-bytes";
import { maxBytesForMime } from "../../lib/media-limits";
import { buildMediaKey } from "../../lib/r2-key";
import { fetchSafe } from "../../lib/safe-fetch";
import { requireAuth } from "../middleware/require";
import type { AppDeps, AppEnv } from "../types";

/** Long-lived, immutable caching: media objects are never overwritten in place (new key per upload). */
const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

async function storeMedia(
  bucket: R2Bucket,
  bytes: Uint8Array,
  mime: string,
): Promise<{ r2Key: string; mime: string; size: number }> {
  const key = buildMediaKey(new Date(), crypto.randomUUID(), mime);
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: CACHE_CONTROL_IMMUTABLE },
  });
  return { r2Key: key, mime, size: bytes.byteLength };
}

export function registerMediaRoutes(app: Hono<AppEnv>, deps: AppDeps = {}): void {
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.post("/api/media", requireAuth("write"), async (c) => {
    const formData = await c.req.raw.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) {
      throw AppError.badRequest("missing_file", "a 'file' multipart field is required");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime || !(IMAGE_MIME_TYPES.has(mime) || VIDEO_MIME_TYPES.has(mime))) {
      throw AppError.unprocessable(
        "unsupported_media_type",
        "file content is not a supported image or video type",
      );
    }

    const maxBytes = maxBytesForMime(mime, c.env);
    if (bytes.byteLength > maxBytes) {
      throw AppError.unprocessable(
        "file_too_large",
        `file exceeds the ${maxBytes}-byte limit for ${mime}`,
      );
    }

    const stored = await storeMedia(c.env.MEDIA, bytes, mime);
    return c.json(stored, 201);
  });

  app.get("/api/media/*", async (c) => {
    const key = c.req.path.replace(/^\/api\/media\//, "");
    const object = await c.env.MEDIA.get(key);
    if (!object) throw AppError.notFound("media object not found");

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", CACHE_CONTROL_IMMUTABLE);
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  });

  app.post("/api/media/import", requireAuth("write"), async (c) => {
    const rawBody: unknown = await c.req.json().catch(() => null);
    const url =
      rawBody && typeof rawBody === "object" ? (rawBody as { url?: unknown }).url : undefined;
    if (typeof url !== "string" || !isSafeFetchUrl(url)) {
      throw AppError.badRequest("invalid_url", "url must be a safe, well-formed http(s) URL");
    }

    const response = await fetchSafe(fetchImpl, url);
    if (!response) {
      throw AppError.unprocessable(
        "fetch_failed",
        "could not fetch the remote image (unreachable, timed out, or redirected to an unsafe address)",
      );
    }
    if (!response.ok) {
      throw AppError.unprocessable("fetch_failed", `remote server responded ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw AppError.unprocessable("unsupported_media_type", "remote resource is not an image");
    }

    const maxBytes = maxBytesForMime("image/jpeg", c.env);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw AppError.unprocessable("file_too_large", "remote image exceeds the size limit");
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const mime = sniffMime(bytes);
    if (!mime || !IMAGE_MIME_TYPES.has(mime)) {
      throw AppError.unprocessable(
        "unsupported_media_type",
        "remote content is not a supported image type",
      );
    }

    const stored = await storeMedia(c.env.MEDIA, bytes, mime);
    return c.json(stored, 201);
  });
}
