/**
 * SSRF guard for any server-side fetch of a user-supplied URL (remote image
 * import, link unfurl). Reused by every ingestion path and by the future
 * browser extension so the same rule applies everywhere a URL is fetched on
 * the user's behalf.
 */

function isIPv4Private(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  if (octets.some((n) => Number.isNaN(n) || n > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  return false;
}

function isIPv6Private(hostname: string): boolean {
  const host = (
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
  ).toLowerCase();
  if (host === "::1") return true; // loopback
  if (host === "::") return true; // unspecified
  if (host.startsWith("fe80:") || host.startsWith("fe80::")) return true; // link-local
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local
  return false;
}

/** True when `hostname` (as parsed by `URL`) is loopback, private, or link-local. */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.includes(":")) return isIPv6Private(host);
  return isIPv4Private(host);
}

/**
 * True when `input` is safe to fetch server-side on the user's behalf:
 * a well-formed `http:`/`https:` URL whose hostname is not a loopback,
 * private, or link-local address/literal.
 */
export function isSafeFetchUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return !isPrivateOrLoopbackHost(url.hostname);
}
