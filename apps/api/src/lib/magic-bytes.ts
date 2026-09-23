/**
 * Content sniffing by magic bytes, independent of any client-declared
 * `Content-Type` header/form field. Used to validate uploads and remote
 * image imports so a mislabeled or hostile file can't slip past a
 * string-only mime check.
 */
export type SniffedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif"
  | "video/mp4"
  | "video/webm";

export const IMAGE_MIME_TYPES: ReadonlySet<SniffedMime> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export const VIDEO_MIME_TYPES: ReadonlySet<SniffedMime> = new Set(["video/mp4", "video/webm"]);

function matchesIsoBmffBrand(bytes: Uint8Array): "image/avif" | "video/mp4" | null {
  // ISO base media file format: box size (4 bytes) + "ftyp" + 4-byte brand.
  if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return null;
  const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
  if (brand === "avif" || brand === "avis") return "image/avif";
  return "video/mp4";
}

/** Sniffs the mime type of `bytes` from its leading signature. Returns `null` when unrecognized. */
export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  const isoBmff = matchesIsoBmffBrand(bytes);
  if (isoBmff) return isoBmff;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video/webm";
  }
  return null;
}
