import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import manifestRaw from "../public/manifest.webmanifest?raw";
import ogImage from "../public/og-image.png?inline";
import robotsTxt from "../public/robots.txt?raw";

/**
 * What a crawler or a link unfurler reads from the shell. None of them run the
 * app, so everything has to be static in `index.html`, and image URLs have to
 * be absolute: unfurlers do not resolve them against the page.
 */
const SITE_URL = "https://inspo.jahattrinidad.com/";
const DESCRIPTION = "A personal space of resources, curated by me, for me.";

const head = new DOMParser().parseFromString(indexHtml, "text/html").head;

function meta(attribute: "name" | "property", key: string): string | null | undefined {
  return head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute("content");
}

function pngSize(dataUrl: string): { width: number; height: number } {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("social metadata", () => {
  it("points the canonical and og:url at the custom domain, not the workers.dev host", () => {
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(SITE_URL);
    expect(meta("property", "og:url")).toBe(SITE_URL);
  });

  it("uses one description everywhere the site describes itself", () => {
    const manifest = JSON.parse(manifestRaw) as { description?: string };

    expect(meta("name", "description")).toBe(DESCRIPTION);
    expect(meta("property", "og:description")).toBe(DESCRIPTION);
    expect(meta("name", "twitter:description")).toBe(DESCRIPTION);
    expect(manifest.description).toBe(DESCRIPTION);
  });

  it("declares the title and card type unfurlers need", () => {
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:title")).toBe("Inspiration Garden");
    expect(meta("name", "twitter:title")).toBe("Inspiration Garden");
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
  });

  it("serves the preview image from an absolute URL with its real size and alt text", () => {
    const imageUrl = `${SITE_URL}og-image.png`;

    expect(meta("property", "og:image")).toBe(imageUrl);
    expect(meta("name", "twitter:image")).toBe(imageUrl);
    expect(meta("property", "og:image:alt")).toBeTruthy();
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(pngSize(ogImage)).toEqual({ width: 1200, height: 630 });
  });
});

describe("robots.txt", () => {
  it("keeps the API out of search, which also keeps saved third-party images out", () => {
    expect(robotsTxt).toMatch(/^User-agent: \*$/m);
    expect(robotsTxt).toMatch(/^Disallow: \/api\/$/m);
    expect(robotsTxt).toMatch(/^Disallow: \/auth\/$/m);
  });

  it("leaves the home page and the preview image crawlable", () => {
    expect(robotsTxt).not.toMatch(/^Disallow: \/$/m);
    expect(robotsTxt).not.toMatch(/^Disallow: \/og-image/m);
  });
});
