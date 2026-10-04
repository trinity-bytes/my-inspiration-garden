import { isSafeFetchUrl } from "@garden/shared";
import type { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { IMAGE_MIME_TYPES, sniffMime, VIDEO_MIME_TYPES } from "../../lib/magic-bytes";
import { maxBytesForMime } from "../../lib/media-limits";
import { CACHE_CONTROL_IMMUTABLE, importRemoteImage, storeMedia } from "../../lib/media-store";
import { requireAuth } from "../middleware/require";
import type { AppDeps, AppEnv } from "../types";

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

    const result = await importRemoteImage(c.env, fetchImpl, url);
    if (!result.ok) throw AppError.unprocessable(result.error.code, result.error.message);
    const { ok: _ok, ...stored } = result;
    return c.json(stored, 201);
  });
}
