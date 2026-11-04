/**
 * Minimal structural view of the clipboard payloads we care about. Kept
 * structural instead of `DataTransfer` so the same helper works against a real
 * `ClipboardEvent.clipboardData` and against lightweight test doubles — jsdom
 * ships no `DataTransfer` implementation.
 */
export interface ClipboardImageSource {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardImageItem> | null;
}

interface ClipboardImageItem {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Returns the first image carried by a clipboard payload, if any. Browsers
 * disagree on where a screenshot lands (`files` vs. `items`), so both are
 * checked. Anything that is not an `image/*` file is ignored, which keeps a
 * normal text paste inside the form untouched.
 */
export function firstClipboardImage(
  data: ClipboardImageSource | null | undefined,
): File | undefined {
  if (!data) return undefined;

  for (const file of Array.from(data.files ?? [])) {
    if (isImageFile(file)) return file;
  }

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file && isImageFile(file)) return file;
  }

  return undefined;
}
