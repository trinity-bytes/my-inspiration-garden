export type DerivedVideoProvider = "youtube" | "vimeo";

export interface DerivedVideoEmbed {
  provider: DerivedVideoProvider;
  embedUrl: string;
}

/**
 * Pure derivation of a video embed URL + provider from a pasted YouTube or
 * Vimeo page URL (T11b B4). Handles `youtube.com/watch?v=`, `youtu.be/`,
 * `youtube.com/shorts/`, and `vimeo.com/<numeric id>`. Returns `null` for
 * anything else (unrecognized host, malformed URL, or a recognized host with
 * no extractable video id) so the caller can fail soft.
 */
export function deriveVideoEmbed(rawUrl: string): DerivedVideoEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.slice("/shorts/".length).split("/")[0];
      if (!id) return null;
      return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    const id = url.searchParams.get("v");
    if (!id) return null;
    return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (!id) return null;
    return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }

  if (host === "vimeo.com") {
    const id = url.pathname.slice(1).split("/")[0];
    if (!id || !/^\d+$/.test(id)) return null;
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  return null;
}
