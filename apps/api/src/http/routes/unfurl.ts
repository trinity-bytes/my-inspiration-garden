import {
  detectPlatform,
  isSafeFetchUrl,
  type LinkPlatform,
  mergeUnfurlMetadata,
  resolveUrl,
  type UnfurlMetadata,
} from "@garden/shared";
import type { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { fetchSafe } from "../../lib/safe-fetch";
import { requireAuth } from "../middleware/require";
import type { AppDeps, AppEnv } from "../types";

const MAX_HTML_BYTES = 512 * 1024;

function oembedUrlFor(platform: LinkPlatform, pageUrl: string): string | null {
  const encoded = encodeURIComponent(pageUrl);
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/oembed?format=json&url=${encoded}`;
    case "vimeo":
      return `https://vimeo.com/api/oembed.json?url=${encoded}`;
    case "x":
      return `https://publish.twitter.com/oembed?url=${encoded}`;
    // Pinterest's public oEmbed endpoint (`pinterest.com/oembed.json`) has
    // historically been unreliable/undocumented; this is attempted like any
    // other oEmbed source and simply falls back to Open Graph extraction
    // below on any failure (non-200, non-JSON, timeout).
    case "pinterest":
      return `https://www.pinterest.com/oembed.json?url=${encoded}`;
    default:
      return null;
  }
}

/**
 * Fetches `url` through `fetchSafe` (manual-mode redirect walking with
 * per-hop `isSafeFetchUrl` revalidation — see `lib/safe-fetch.ts` — so a
 * safe-looking URL can't 302 its way to a private/loopback/link-local
 * address) and normalizes any failure/non-2xx result to `null`.
 */
async function fetchWithTimeout(fetchImpl: typeof fetch, url: string): Promise<Response | null> {
  const res = await fetchSafe(fetchImpl, url);
  return res?.ok ? res : null;
}

async function fetchOembed(
  fetchImpl: typeof fetch,
  platform: LinkPlatform,
  pageUrl: string,
): Promise<Partial<UnfurlMetadata> | null> {
  const oembedUrl = oembedUrlFor(platform, pageUrl);
  if (!oembedUrl) return null;
  const res = await fetchWithTimeout(fetchImpl, oembedUrl);
  if (!res) return null;
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) return null;
  return {
    title: typeof json.title === "string" ? json.title : undefined,
    author: typeof json.author_name === "string" ? json.author_name : undefined,
    siteName: typeof json.provider_name === "string" ? json.provider_name : undefined,
    previewImage: typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined,
    embed: typeof json.html === "string" ? json.html : undefined,
  };
}

/** Drains `body` up to `maxBytes`, driving any transform (e.g. HTMLRewriter) attached upstream. */
async function drainBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<void> {
  const reader = body?.getReader();
  if (!reader) return;
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return;
    }
  }
}

async function fetchOpenGraph(
  fetchImpl: typeof fetch,
  pageUrl: string,
): Promise<Partial<UnfurlMetadata> | null> {
  const res = await fetchWithTimeout(fetchImpl, pageUrl);
  if (!res) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;

  const meta: Record<string, string> = {};
  let canonical: string | undefined;
  let titleText = "";

  const rewriter = new HTMLRewriter()
    .on("meta", {
      element(el) {
        const property = el.getAttribute("property") ?? el.getAttribute("name");
        const content = el.getAttribute("content");
        if (property && content) meta[property.toLowerCase()] = content;
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        const href = el.getAttribute("href");
        if (href) canonical = href;
      },
    })
    .on("title", {
      text(chunk) {
        titleText += chunk.text;
      },
    });

  const transformed = rewriter.transform(res);
  await drainBody(transformed.body, MAX_HTML_BYTES);

  const title = meta["og:title"] ?? meta["twitter:title"] ?? (titleText.trim() || undefined);
  const description = meta["og:description"] ?? meta["twitter:description"] ?? meta.description;
  const siteName = meta["og:site_name"];
  const previewImageRaw = meta["og:image"] ?? meta["twitter:image"];
  const previewImage = previewImageRaw ? resolveUrl(previewImageRaw, pageUrl) : undefined;
  const canonicalUrl = canonical ? resolveUrl(canonical, pageUrl) : undefined;

  return { title, description, siteName, previewImage, canonicalUrl };
}

export function registerUnfurlRoutes(app: Hono<AppEnv>, deps: AppDeps = {}): void {
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.post("/api/unfurl", requireAuth("write"), async (c) => {
    const rawBody: unknown = await c.req.json().catch(() => null);
    const url =
      rawBody && typeof rawBody === "object" ? (rawBody as { url?: unknown }).url : undefined;
    if (typeof url !== "string" || !isSafeFetchUrl(url)) {
      throw AppError.badRequest("invalid_url", "url must be a safe, well-formed http(s) URL");
    }

    const platform = detectPlatform(url);
    const oembed = await fetchOembed(fetchImpl, platform, url);
    const og = oembed ? null : await fetchOpenGraph(fetchImpl, url);

    const metadata = mergeUnfurlMetadata(url, platform, { oembed, og });
    return c.json(metadata);
  });
}
