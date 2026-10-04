import { isSafeFetchUrl } from "@garden/shared";
import { IMAGE_MIME_TYPES, sniffMime } from "./magic-bytes";
import { maxBytesForMime } from "./media-limits";
import { buildMediaKey } from "./r2-key";
import { fetchSafe } from "./safe-fetch";

/** Long-lived, immutable caching: media objects are never overwritten in place (new key per upload). */
export const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

export interface StoredMedia {
  r2Key: string;
  mime: string;
  size: number;
}

export type ImportErrorCode =
  | "invalid_url"
  | "fetch_failed"
  | "unsupported_media_type"
  | "file_too_large";

export type ImportResult =
  | ({ ok: true } & StoredMedia)
  | { ok: false; error: { code: ImportErrorCode; message: string } };

export async function storeMedia(
  bucket: R2Bucket,
  bytes: Uint8Array,
  mime: string,
): Promise<StoredMedia> {
  const key = buildMediaKey(new Date(), crypto.randomUUID(), mime);
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: CACHE_CONTROL_IMMUTABLE },
  });
  return { r2Key: key, mime, size: bytes.byteLength };
}

function fail(code: ImportErrorCode, message: string): ImportResult {
  return { ok: false, error: { code, message } };
}

/**
 * Fetches a remote image (SSRF-guarded), validates type and size, and stores it
 * in R2. Never throws for remote-side problems; they come back as `{ ok: false }`.
 */
export async function importRemoteImage(
  env: { MEDIA: R2Bucket; MAX_IMAGE_BYTES?: string; MAX_VIDEO_BYTES?: string },
  fetchImpl: typeof fetch,
  url: string,
): Promise<ImportResult> {
  if (!isSafeFetchUrl(url)) {
    return fail("invalid_url", "url must be a safe, well-formed http(s) URL");
  }

  const response = await fetchSafe(fetchImpl, url);
  if (!response) {
    return fail(
      "fetch_failed",
      "could not fetch the remote image (unreachable, timed out, or redirected to an unsafe address)",
    );
  }
  if (!response.ok) {
    return fail("fetch_failed", `remote server responded ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return fail("unsupported_media_type", "remote resource is not an image");
  }

  const maxBytes = maxBytesForMime("image/jpeg", env);
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
        return fail("file_too_large", "remote image exceeds the size limit");
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
    return fail("unsupported_media_type", "remote content is not a supported image type");
  }

  return { ok: true, ...(await storeMedia(env.MEDIA, bytes, mime)) };
}
