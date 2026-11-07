/**
 * Card thumbnail variants served by `GET /api/thumbs/:width/*key`. The API
 * whitelists exactly these widths (bounding Cloudflare Images usage) and the
 * web canvas picks one per card, so both sides share this single list.
 *
 * The phone layout paints cards around 160 CSS px at 2x; desktop columns go up
 * to 420 CSS px at 2x (card textures cap at 1024 px on their longer edge).
 */
export const THUMBNAIL_WIDTHS = [384, 768] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

/** Upscaling a variant by a few percent is invisible and saves a heavier download. */
const UPSCALE_TOLERANCE = 1.05;

export function isThumbnailWidth(value: number): value is ThumbnailWidth {
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(value);
}

/** The smallest variant that covers `paintedWidthPx` device pixels, capped at the largest. */
export function thumbnailWidthFor(paintedWidthPx: number): ThumbnailWidth {
  for (const width of THUMBNAIL_WIDTHS) {
    if (width * UPSCALE_TOLERANCE >= paintedWidthPx) return width;
  }
  return THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1] as ThumbnailWidth;
}
