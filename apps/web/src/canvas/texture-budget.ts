import { deviceTextureSize } from "./placeholder-texture";

/**
 * GPU memory the card texture cache may hold, on top of whatever is on screen.
 * Phone card textures are small (~0.5 MB at 2x), so a count fixed for desktop
 * (120) evicted cards a normal scroll comes back to, and each one was decoded,
 * repainted and re-uploaded on every return.
 */
export const TEXTURE_MEMORY_BUDGET_BYTES = 160 * 1024 * 1024;
/** The fixed size every device used before; large desktop textures keep it. */
export const MIN_TEXTURE_CACHE_SIZE = 120;
export const MAX_TEXTURE_CACHE_SIZE = 480;
/** Typical card height over its width; only sizes the estimate, cards vary. */
const TYPICAL_CARD_ASPECT = 1.3;
const BYTES_PER_TEXEL = 4;

/** How many card textures fit the memory budget for columns `columnWidthPx` CSS px wide at `dpr`. */
export function textureCacheSizeFor(columnWidthPx: number, dpr: number): number {
  const { width, height } = deviceTextureSize(
    columnWidthPx,
    columnWidthPx * TYPICAL_CARD_ASPECT,
    dpr,
  );
  const fit = Math.floor(TEXTURE_MEMORY_BUDGET_BYTES / (width * height * BYTES_PER_TEXEL));
  return Math.min(MAX_TEXTURE_CACHE_SIZE, Math.max(MIN_TEXTURE_CACHE_SIZE, fit));
}
