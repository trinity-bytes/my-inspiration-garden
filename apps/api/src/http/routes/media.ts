import { isSafeFetchUrl } from "@garden/shared";
import type { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { IMAGE_MIME_TYPES, sniffMime, VIDEO_MIME_TYPES } from "../../lib/magic-bytes";
import { maxBytesForMime } from "../../lib/media-limits";
import { CACHE_CONTROL_IMMUTABLE, importRemoteImage, storeMedia } from "../../lib/media-store";
import {
  imagesBindingThumbnailer,
  isThumbnailSourceKey,
  isThumbnailWidth,
  THUMBNAIL_MIME,
  THUMBNAIL_WIDTHS,
  thumbnailKeyFor,
} from "../../lib/thumbnails";
import { requireAuth } from "../middleware/require";
import type { AppDeps, AppEnv } from "../types";

// Unsupported units, malformed ranges and multipart requests are ignored, as
// permitted by HTTP. BigInt keeps untrusted decimal offsets from losing precision.
function parseByteRange(
  value: string,
  size: number,
): { offset: number; length: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const total = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2] ?? "0");
    if (suffix === 0n || total === 0n) return "unsatisfiable";
    const length = suffix < total ? suffix : total;
    return { offset: Number(total - length), length: Number(length) };
  }
  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : total - 1n;
  if (match[2] && requestedEnd < start) return null;
  if (start >= total) return "unsatisfiable";
  const end = requestedEnd < total ? requestedEnd : total - 1n;
  return { offset: Number(start), length: Number(end - start + 1n) };
}

function mediaHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", CACHE_CONTROL_IMMUTABLE);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  return headers;
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
    const rangeHeader = c.req.header("Range");
    // Consult metadata before ranged reads so unsatisfiable requests never ask
    // R2 for an invalid range, and the response reports the full object size.
    const metadata = rangeHeader ? await c.env.MEDIA.head(key) : null;
    if (rangeHeader && !metadata) throw AppError.notFound("media object not found");
    const ifRange = c.req.header("If-Range");
    const range =
      rangeHeader && metadata && (!ifRange || ifRange === metadata.httpEtag)
        ? parseByteRange(rangeHeader, metadata.size)
        : null;
    if (range === "unsatisfiable" && metadata) {
      const headers = mediaHeaders(metadata);
      headers.set("Content-Range", `bytes */${metadata.size}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }
    const selectedRange = range && range !== "unsatisfiable" ? range : null;
    const object = await c.env.MEDIA.get(key, selectedRange ? { range: selectedRange } : undefined);
    if (!object) throw AppError.notFound("media object not found");
    const headers = mediaHeaders(object);
    headers.set("Content-Length", String(selectedRange ? selectedRange.length : object.size));
    if (selectedRange) {
      headers.set(
        "Content-Range",
        `bytes ${selectedRange.offset}-${selectedRange.offset + selectedRange.length - 1}/${object.size}`,
      );
    }
    return new Response(object.body, {
      status: selectedRange ? 206 : 200,
      headers,
    });
  });

  app.get("/api/thumbs/:width/*", async (c) => {
    const width = Number(c.req.param("width"));
    if (!isThumbnailWidth(width)) {
      throw AppError.badRequest(
        "invalid_width",
        `width must be one of ${THUMBNAIL_WIDTHS.join(", ")}`,
      );
    }
    const key = c.req.path.replace(/^\/api\/thumbs\/[^/]+\//, "");
    if (!isThumbnailSourceKey(key)) throw AppError.notFound("media object not found");

    const thumbnailKey = thumbnailKeyFor(key, width);
    const cached = await c.env.MEDIA.get(thumbnailKey);
    if (cached) return new Response(cached.body, { headers: mediaHeaders(cached) });

    const metadata = await c.env.MEDIA.head(key);
    if (!metadata) throw AppError.notFound("media object not found");
    if (!IMAGE_MIME_TYPES.has((metadata.httpMetadata?.contentType ?? "") as never)) {
      throw AppError.notFound("no thumbnail for this media type");
    }

    const thumbnailer =
      deps.thumbnailer ?? (c.env.IMAGES ? imagesBindingThumbnailer(c.env.IMAGES) : null);
    const original = thumbnailer ? await c.env.MEDIA.get(key) : null;
    let bytes: ArrayBuffer | null = null;
    if (thumbnailer && original) {
      try {
        bytes = await new Response(await thumbnailer(original.body, width)).arrayBuffer();
      } catch {
        bytes = null;
      }
    }
    if (!bytes || bytes.byteLength === 0) {
      // Fall back to the original, cached briefly so a transient failure
      // (quota, binding outage) is retried later instead of pinned for a year.
      return new Response(null, {
        status: 307,
        headers: { Location: `/api/media/${key}`, "Cache-Control": "public, max-age=300" },
      });
    }

    const stored = await c.env.MEDIA.put(thumbnailKey, bytes, {
      httpMetadata: { contentType: THUMBNAIL_MIME, cacheControl: CACHE_CONTROL_IMMUTABLE },
    });
    const headers = mediaHeaders(stored);
    headers.set("Content-Length", String(bytes.byteLength));
    return new Response(bytes, { headers });
  });

  app.post("/api/media/import", requireAuth("write"), async (c) => {
    const rawBody: unknown = await c.req.json().catch(() => null);
    const url =
      rawBody && typeof rawBody === "object" ? (rawBody as { url?: unknown }).url : undefined;
    if (typeof url !== "string" || !isSafeFetchUrl(url)) {
      throw AppError.badRequest("invalid_url", "url must be a safe, well-formed http(s) URL");
    }

    const result = await importRemoteImage(c.env, fetchImpl, url);
    if (!result.ok) throw AppError.unprocessable(result.error.code, result.error.message);
    const { ok: _ok, ...stored } = result;
    return c.json(stored, 201);
  });
}
