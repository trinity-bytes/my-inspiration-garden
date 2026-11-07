import type { ThumbnailWidth } from "@garden/shared";

/**
 * Card thumbnails: small WebP variants of stored images, generated on first
 * request and kept in R2 next to the originals. Canvas cards load these, so a
 * phone never downloads or decodes a multi-megabyte original just to paint a
 * few hundred pixels; the original still serves the detail view.
 *
 * The thumbnail key is derived from the original key instead of stored on the
 * item: no schema change, nothing to keep in sync when an item's media
 * changes, and every existing image is backfilled lazily by its first view.
 */

export const THUMBNAIL_MIME = "image/webp";
const THUMBNAIL_QUALITY = 80;

/** Only originals stored by upload/import (`media/...`) have thumbnails; never a thumbnail of a thumbnail. */
export function isThumbnailSourceKey(key: string): boolean {
  return key.startsWith("media/") && !key.split("/").includes("..");
}

export function thumbnailKeyFor(originalKey: string, width: ThumbnailWidth): string {
  return `thumbs/w${width}/${originalKey}.webp`;
}

/** Resizes image bytes to at most `width` px wide, WebP-encoded. Rejects when the image cannot be transformed. */
export type Thumbnailer = (
  image: ReadableStream<Uint8Array>,
  width: ThumbnailWidth,
) => Promise<ReadableStream<Uint8Array>>;

export function imagesBindingThumbnailer(images: ImagesBinding): Thumbnailer {
  return async (image, width) => {
    const result = await images
      .input(image)
      // scale-down never enlarges an image already smaller than the variant.
      .transform({ width, fit: "scale-down" })
      // Cards draw one still frame, so animated GIFs keep only the first.
      .output({ format: THUMBNAIL_MIME, quality: THUMBNAIL_QUALITY, anim: false });
    return result.image();
  };
}
