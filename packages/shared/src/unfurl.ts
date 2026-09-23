import type { LinkPlatform } from "./item";

export interface UnfurlMetadata {
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  siteName?: string;
  platform: LinkPlatform;
  previewImage?: string;
  author?: string;
  /** Provider-supplied embed markup (from oEmbed's `html` field), when available. */
  embed?: string;
}

/** Resolves a (possibly relative) URL against a page URL. Never throws. */
export function resolveUrl(maybeRelative: string, base: string): string | undefined {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return undefined;
  }
}

export interface UnfurlSources {
  oembed?: Partial<UnfurlMetadata> | null;
  og?: Partial<UnfurlMetadata> | null;
}

/**
 * Merges oEmbed data (preferred, more structured) over Open Graph/meta-tag
 * data field by field. Never throws; a missing/failed source simply
 * contributes no fields.
 */
export function mergeUnfurlMetadata(
  url: string,
  platform: LinkPlatform,
  sources: UnfurlSources,
): UnfurlMetadata {
  const oembed = sources.oembed ?? {};
  const og = sources.og ?? {};
  return {
    url,
    platform,
    canonicalUrl: oembed.canonicalUrl ?? og.canonicalUrl,
    title: oembed.title ?? og.title,
    description: oembed.description ?? og.description,
    siteName: oembed.siteName ?? og.siteName,
    previewImage: oembed.previewImage ?? og.previewImage,
    author: oembed.author ?? og.author,
    embed: oembed.embed ?? og.embed,
  };
}
