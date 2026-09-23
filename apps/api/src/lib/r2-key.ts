const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? "bin";
}

/** Builds the `media/<yyyy>/<mm>/<id>.<ext>` R2 key for a stored media object. */
export function buildMediaKey(date: Date, id: string, mime: string): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `media/${yyyy}/${mm}/${id}.${extensionForMime(mime)}`;
}
