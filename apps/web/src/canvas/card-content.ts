import type { Item } from "@garden/shared";

/**
 * Pure per-kind content derivation for card rendering (canvas painters,
 * `card-painters.ts`) and, where reused, the DOM detail view. Kept
 * framework/canvas-free so it is unit-testable without jsdom's missing 2D
 * canvas support.
 */

export type LinkItem = Extract<Item, { kind: "link" }>;
export type VideoItem = Extract<Item, { kind: "video" }>;
export type TextItem = Extract<Item, { kind: "text" }>;
export type PaletteItem = Extract<Item, { kind: "palette" }>;
export type FontItem = Extract<Item, { kind: "font" }>;

/** The URL's hostname, with a leading `www.` stripped. Falls back to the raw input if it isn't a parsable URL (defensive — `url` is schema-validated, but this stays safe either way). */
export function domainForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface LinkCardContent {
  title: string;
  domain: string;
  hasPreview: boolean;
}

export function linkCardContent(item: LinkItem): LinkCardContent {
  const domain = domainForUrl(item.url);
  return {
    title: item.title?.trim() || domain,
    domain,
    hasPreview: Boolean(item.data.previewImage),
  };
}

const VIDEO_PROVIDER_LABELS: Record<VideoItem["data"]["provider"], string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  file: "Video",
};

export interface VideoCardContent {
  title: string;
  providerLabel: string;
  hasThumbnail: boolean;
}

export function videoCardContent(item: VideoItem): VideoCardContent {
  const providerLabel = VIDEO_PROVIDER_LABELS[item.data.provider];
  return {
    title: item.title?.trim() || providerLabel,
    providerLabel,
    hasThumbnail: Boolean(item.data.thumbnail),
  };
}

export interface TextCardContent {
  title: string | null;
  excerpt: string;
}

export function textCardContent(item: TextItem): TextCardContent {
  return { title: item.title?.trim() || null, excerpt: item.data.body };
}

export interface PaletteCardContent {
  name: string;
  colors: PaletteItem["data"]["colors"];
}

export function paletteCardContent(item: PaletteItem): PaletteCardContent {
  return { name: item.title?.trim() || "Palette", colors: item.data.colors };
}

const DEFAULT_FONT_PANGRAM = "The quick brown fox jumps over the lazy dog";

export interface FontCardContent {
  family: string;
  pangram: string;
}

export function fontCardContent(item: FontItem): FontCardContent {
  return {
    family: item.data.family,
    pangram: item.data.previewText?.trim() || DEFAULT_FONT_PANGRAM,
  };
}
