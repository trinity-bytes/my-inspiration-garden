import { thumbnailWidthFor } from "@garden/shared";

/**
 * Resolves a stored media reference to a loadable URL. Remote (http/https) and
 * data URLs pass through untouched (legacy link previews); anything else is an
 * R2 key served by `GET /api/media/*key`.
 */
export function resolveMediaRef(ref: string, apiBaseUrl = ""): string {
  if (/^(https?:|data:)/i.test(ref)) return ref;
  return `${apiBaseUrl}/api/media/${ref}`;
}

/**
 * Like `resolveMediaRef`, but an R2 key resolves to its card thumbnail
 * (`GET /api/thumbs/:width/*key`, a small WebP) sized for `paintedWidthPx`
 * device pixels. For canvas cards only; the detail view keeps the original.
 * The API redirects to the original when a thumbnail cannot be generated.
 */
export function resolveThumbnailRef(ref: string, paintedWidthPx: number, apiBaseUrl = ""): string {
  if (/^(https?:|data:)/i.test(ref)) return ref;
  return `${apiBaseUrl}/api/thumbs/${thumbnailWidthFor(paintedWidthPx)}/${ref}`;
}
