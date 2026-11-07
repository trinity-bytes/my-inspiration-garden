import type { Item } from "@garden/shared";
import { resolveMediaRef } from "../api/media-ref";

/**
 * The URL of an image-like representation of `item`, or `null` when none
 * exists — decides whether to load a thumbnail texture or fall back to a
 * generated placeholder (see `layers/cards.ts`). `image` items are served from R2 via `GET
 * /api/media/*key` (`docs/api.md`); `link`/`video` items use whatever
 * preview ingestion already resolved into their `data` (a link `previewImage`
 * is an R2 key, or a legacy remote URL).
 */
export function thumbnailUrlForItem(item: Item, apiBaseUrl = ""): string | null {
  switch (item.kind) {
    case "image":
      return item.data.r2Key ? `${apiBaseUrl}/api/media/${item.data.r2Key}` : null;
    case "link":
      return item.data.previewImage ? resolveMediaRef(item.data.previewImage, apiBaseUrl) : null;
    case "video":
      return item.data.thumbnail ?? null;
    default:
      return null;
  }
}
