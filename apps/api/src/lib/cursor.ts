/**
 * Opaque cursor for `GET /api/items` pagination, ordered by
 * `created_at desc, id desc`. The cursor encodes the last row's sort key so
 * the next page can resume with `(created_at, id) < (cursor.createdAt,
 * cursor.id)` in that descending order — stable even if rows are inserted
 * concurrently, unlike an offset.
 */
export interface ItemCursor {
  createdAt: string;
  id: string;
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(cursor: ItemCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodeCursor(raw: string): ItemCursor | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "createdAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as { createdAt: unknown }).createdAt === "string" &&
      typeof (parsed as { id: unknown }).id === "string"
    ) {
      return parsed as ItemCursor;
    }
    return null;
  } catch {
    return null;
  }
}
