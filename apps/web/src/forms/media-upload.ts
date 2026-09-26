import type { PaletteColor } from "@garden/shared";
import { extractPalette } from "@garden/shared";
import { uploadMedia } from "../api/endpoints";

export interface ImageUploadResult {
  r2Key: string;
  mime: string;
  width: number;
  height: number;
  /** Auto-extracted so uploaded images are color-filterable (MVP constraint) — `undefined` if
   * dimension/pixel decoding isn't available (e.g. `createImageBitmap`/canvas unsupported); this
   * is non-fatal, the upload itself already succeeded. */
  palette?: PaletteColor[];
}

/**
 * Reads an already-decoded bitmap's pixels into a palette via the shared
 * median-cut extractor. Canvas-dependent (draws to an offscreen 2D canvas to
 * read back `ImageData`) — like `card-painters.ts`/`placeholder-texture.ts`,
 * untestable under jsdom (no real canvas backend) and covered by build +
 * manual QA, not unit tests. Never throws: any canvas/2D-context failure
 * yields `undefined` (no palette), since palette extraction is optional.
 */
function extractPaletteFromBitmap(bitmap: ImageBitmap): PaletteColor[] | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const palette = extractPalette(data);
    return palette.length > 0 ? palette : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Uploads an image file to R2 (`POST /api/media`) and derives the rest of
 * `imageDataSchema` client-side: dimensions via `createImageBitmap`, palette
 * via median-cut over the decoded pixels (T6 decision: Workers can't decode
 * images cheaply). Palette extraction is best-effort/non-fatal.
 */
export async function uploadImageFile(file: File): Promise<ImageUploadResult> {
  const stored = await uploadMedia(file);
  const bitmap = await createImageBitmap(file);
  try {
    const palette = extractPaletteFromBitmap(bitmap);
    return {
      r2Key: stored.r2Key,
      mime: stored.mime,
      width: bitmap.width,
      height: bitmap.height,
      palette,
    };
  } finally {
    bitmap.close?.();
  }
}
