import { isSafeFetchUrl } from "@garden/shared";

export interface SafeFetchOptions {
  /** Maximum number of redirect hops to follow. Defaults to 5. */
  maxRedirects?: number;
}

const DEFAULT_MAX_REDIRECTS = 5;

/**
 * SSRF-safe replacement for `fetch(url, { redirect: "follow" })`.
 *
 * `isSafeFetchUrl` alone only validates the URL the caller asked for — a
 * public URL can still 302 to a private/loopback/link-local address (or to
 * `cloudflare-workers-and-pages...`/cloud metadata endpoints), which the
 * underlying platform's automatic redirect-following would happily follow,
 * bypassing the guard entirely. This always requests with
 * `redirect: "manual"` (Cloudflare Workers, unlike browsers, exposes the
 * 3xx status and `Location` header on a manual-mode response instead of an
 * opaque redirect) and re-validates every hop's target with
 * `isSafeFetchUrl` *before* following it, capping the number of hops.
 *
 * Returns `null` (never throws) when the initial URL, any redirect target,
 * or the hop count is unsafe, or when the underlying fetch itself throws
 * (network error, abort/timeout).
 */
export async function safeFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response | null> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = url;

  for (let hop = 0; ; hop++) {
    if (!isSafeFetchUrl(currentUrl)) return null;

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, { ...init, redirect: "manual" });
    } catch {
      return null;
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return response;
    if (hop >= maxRedirects) return null;

    const location = response.headers.get("location");
    if (!location) return null;
    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      return null;
    }
  }
}

export interface FetchSafeOptions extends SafeFetchOptions {
  /** Abort the whole redirect chain after this many milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

/** `safeFetch` plus an overall timeout spanning the whole redirect chain. */
export async function fetchSafe(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit = {},
  options: FetchSafeOptions = {},
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    return await safeFetch(fetchImpl, url, { ...init, signal: controller.signal }, options);
  } finally {
    clearTimeout(timeout);
  }
}
