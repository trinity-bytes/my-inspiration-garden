import type { LinkPlatform } from "./item";

/** Detects the link-preview platform from a URL's hostname. Never throws. */
export function detectPlatform(input: string): LinkPlatform {
  let hostname: string;
  try {
    hostname = new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }

  if (hostname.endsWith("dribbble.com")) return "dribbble";
  if (hostname.endsWith("pinterest.com") || /^pinterest\.[a-z.]+$/.test(hostname)) {
    return "pinterest";
  }
  if (hostname === "x.com" || hostname === "twitter.com") return "x";
  if (hostname.endsWith("behance.net")) return "behance";
  if (hostname.endsWith("youtube.com") || hostname === "youtu.be") return "youtube";
  if (hostname.endsWith("vimeo.com")) return "vimeo";
  return "other";
}
