export type TextureFormat = "avif" | "webp";

/** Pure selection logic: AVIF is preferred; WebP is the universal fallback. */
export function selectTextureFormat(avifSupported: boolean): TextureFormat {
  return avifSupported ? "avif" : "webp";
}

/** Builds the derivative URL for a base path (no extension) and a chosen format. */
export function textureUrl(basePath: string, format: TextureFormat): string {
  return `${basePath}.${format}`;
}

/**
 * Detects AVIF decode support once, by attempting to decode a tiny known
 * AVIF image. Not pure (touches `Image`/`HTMLImageElement`) and therefore
 * not unit-tested; `selectTextureFormat` above carries the tested logic.
 */
export function detectAvifSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.width > 0 && image.height > 0);
    image.onerror = () => resolve(false);
    // 1x1 AVIF, from the MDN/Modernizr feature-detection reference test.
    image.src =
      "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=";
  });
}
