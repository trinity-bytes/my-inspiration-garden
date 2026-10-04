/**
 * Resolves a stored media reference to a loadable URL. Remote (http/https) and
 * data URLs pass through untouched (legacy link previews); anything else is an
 * R2 key served by `GET /api/media/*key`.
 */
export function resolveMediaRef(ref: string, apiBaseUrl = ""): string {
  if (/^(https?:|data:)/i.test(ref)) return ref;
  return `${apiBaseUrl}/api/media/${ref}`;
}
