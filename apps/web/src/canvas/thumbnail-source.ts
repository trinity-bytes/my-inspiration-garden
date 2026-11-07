import type { Item } from "@garden/shared";
import { resolveThumbnailRef } from "../api/media-ref";

/**
 * The URL of the image a canvas card paints for `item`, or `null` when none
 * exists (the card then paints its generated layout, see `layers/cards.ts`).
 * R2-stored media (an `image` item's upload, a link `previewImage` key, an
 * uploaded video's poster in `thumbnail`) resolves to its card thumbnail sized
 * for `paintedWidthPx` device pixels; remote URLs (legacy link previews,
 * YouTube/Vimeo thumbnails) pass through. Never the video file itself: a card
 * must not download a video to show one frame.
 */
export function thumbnailUrlForItem(
  item: Item,
  paintedWidthPx: number,
  apiBaseUrl = "",
): string | null {
  const ref = cardImageRef(item);
  return ref ? resolveThumbnailRef(ref, paintedWidthPx, apiBaseUrl) : null;
}

function cardImageRef(item: Item): string | null {
  switch (item.kind) {
    case "image":
      return item.data.r2Key || null;
    case "link":
      return item.data.previewImage || null;
    case "video":
      return item.data.thumbnail || null;
    default:
      return null;
  }
}
