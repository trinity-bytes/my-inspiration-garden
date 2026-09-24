import type { Item } from "@garden/shared";

/**
 * The URL of an image-like representation of `item`, or `null` when none
 * exists (per-kind rich rendering is T9; T8b only needs to know whether to
 * load a thumbnail texture or fall back to a generated placeholder — see
 * `layers/cards.ts`). `image` items are served from R2 via `GET
 * /api/media/*key` (`docs/api.md`); `link`/`video` items use whatever
 * preview URL ingestion (T6) already resolved into their `data`.
 */
export function thumbnailUrlForItem(item: Item, apiBaseUrl = ""): string | null {
  switch (item.kind) {
    case "image":
      return item.data.r2Key ? `${apiBaseUrl}/api/media/${item.data.r2Key}` : null;
    case "link":
      return item.data.previewImage ?? null;
    case "video":
      return item.data.thumbnail ?? null;
    default:
      return null;
  }
}
