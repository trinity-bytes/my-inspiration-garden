/**
 * Parses a single cookie value out of a raw `Cookie` request header. Robust
 * to a malformed header: pairs without `=` are skipped, keys/values are
 * trimmed, and a value that fails percent-decoding falls back to its raw
 * form instead of throwing. Returns `null` when the header is absent, the
 * named cookie is not present, or its value is empty.
 */
export function readCookie(cookieHeader: string | undefined | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;

    const key = pair.slice(0, eq).trim();
    if (key !== name) continue;

    const rawValue = pair.slice(eq + 1).trim();
    if (!rawValue) continue;

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}
