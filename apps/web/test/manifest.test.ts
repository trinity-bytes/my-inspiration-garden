import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import appleTouchIcon from "../public/apple-touch-icon.png?inline";
import icon192 from "../public/icon-192.png?inline";
import icon512 from "../public/icon-512.png?inline";
import iconMaskable512 from "../public/icon-maskable-512.png?inline";
import manifestRaw from "../public/manifest.webmanifest?raw";
import tokensCss from "../src/styles/tokens.css?raw";

/**
 * Installing this app on Android only produces a standalone app — no address
 * bar, its own task in the switcher — when Chrome finds an *installable* web
 * app manifest. Without one, "Add to Home screen" falls back to a shortcut
 * that opens a browser tab, address bar included.
 *
 * Chrome's installability criteria (web.dev/articles/install-criteria):
 * `name`/`short_name`, 192px and 512px icons, `start_url`, a standalone-ish
 * `display`, and `prefer_related_applications` absent or false. A service
 * worker is NOT part of the criteria, so none is declared here.
 */
interface WebAppManifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  background_color?: string;
  theme_color?: string;
  prefer_related_applications?: boolean;
  icons?: { src?: string; sizes?: string; type?: string; purpose?: string }[];
}

const manifest = JSON.parse(manifestRaw) as WebAppManifest;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Asset imports arrive as data URLs in the jsdom pool (no Node types, no
 * `node:fs`), so the PNG header is decoded from base64. Bytes 16 and 20 of a
 * PNG are the big-endian IHDR width and height — the only way to prove the
 * file really has the size the manifest claims, which Chrome trusts blindly.
 */
function pngSize(dataUrl: string): { width: number; height: number } {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  expect([...bytes.slice(0, 8)], "not a PNG file").toEqual(PNG_SIGNATURE);

  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("web app manifest", () => {
  it("declares standalone display, so an installed launch has no browser chrome", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("declares the identity and scope Chrome installs the app under", () => {
    expect(manifest.name).toBe("Inspiration Garden");
    expect(manifest.short_name).toBe("Garden");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("does not prefer a related native app, which would redirect install to a store", () => {
    expect(manifest.prefer_related_applications ?? false).toBe(false);
  });

  it("declares the 192px and 512px PNG icons installability requires", () => {
    const icons = manifest.icons ?? [];
    const anyPurpose = icons.filter((icon) => (icon.purpose ?? "any").split(" ").includes("any"));

    expect(anyPurpose.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of anyPurpose) {
      expect(icon.type).toBe("image/png");
    }
  });

  it("declares a maskable icon, so Android does not letterbox it inside its mask", () => {
    const maskable = (manifest.icons ?? []).filter((icon) =>
      (icon.purpose ?? "").split(" ").includes("maskable"),
    );

    expect(maskable).toHaveLength(1);
    expect(maskable[0]?.sizes).toBe("512x512");
  });

  it("ships real PNG files at the exact sizes the manifest claims", () => {
    expect(pngSize(icon192)).toEqual({ width: 192, height: 192 });
    expect(pngSize(icon512)).toEqual({ width: 512, height: 512 });
    expect(pngSize(iconMaskable512)).toEqual({ width: 512, height: 512 });
  });

  it("is linked from index.html, otherwise the browser never fetches it", () => {
    const link = /<link\b[^>]*\brel=["']manifest["'][^>]*>/i.exec(indexHtml);

    expect(link, 'index.html declares no <link rel="manifest">').not.toBeNull();
    expect(link?.[0]).toMatch(/href=["']\/manifest\.webmanifest["']/);
  });

  it("keeps the HTML theme-color in sync with the manifest", () => {
    const meta = /<meta\b[^>]*\bname=["']theme-color["'][^>]*>/i.exec(indexHtml);
    const content = meta?.[0].match(/content=["'](#[0-9a-f]{6})["']/i)?.[1];

    expect(content?.toLowerCase()).toBe(manifest.theme_color?.toLowerCase());
  });

  it("paints the phone's system bars and splash with the dark canvas color", () => {
    const canvas = /--color-canvas:\s*(#[0-9a-f]{6})/i.exec(tokensCss)?.[1];

    expect(canvas).toBeDefined();
    expect(manifest.theme_color?.toLowerCase()).toBe(canvas?.toLowerCase());
    expect(manifest.background_color?.toLowerCase()).toBe(canvas?.toLowerCase());
  });

  it("draws the canvas under the gesture bar, so Chrome paints no bar of its own there", () => {
    const meta = /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i.exec(indexHtml);

    expect(meta?.[0]).toMatch(/viewport-fit=cover/);
  });

  it("declares the page as dark, so the browser does not assume a light theme", () => {
    const meta = /<meta\b[^>]*\bname=["']color-scheme["'][^>]*>/i.exec(indexHtml);

    expect(meta?.[0]).toMatch(/content=["']dark["']/);
  });
});

/**
 * iOS is the other half of "install it and it launches like an app": Safari has
 * no install prompt and, before iOS 16.4, ignores the manifest `display`
 * entirely. It reads a set of `apple-*` tags instead, and it needs its own
 * opaque 180px icon because it composites transparency onto black.
 */
function metaContent(name: string): string | undefined {
  const meta = new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*>`, "i").exec(indexHtml);

  return meta?.[0].match(/content=["']([^"']+)["']/i)?.[1];
}

describe("iOS home-screen app", () => {
  it("declares the legacy capable flag, the only switch older iOS reads", () => {
    expect(metaContent("apple-mobile-web-app-capable")).toBe("yes");
  });

  it("ships the 180px opaque apple-touch-icon Safari expects", () => {
    const link = /<link\b[^>]*\brel=["']apple-touch-icon["'][^>]*>/i.exec(indexHtml);

    expect(link, 'index.html declares no <link rel="apple-touch-icon">').not.toBeNull();
    expect(link?.[0]).toMatch(/href=["']\/apple-touch-icon\.png["']/);
    expect(pngSize(appleTouchIcon)).toEqual({ width: 180, height: 180 });
  });

  it("keeps the iOS title short enough to fit under the icon", () => {
    expect(metaContent("apple-mobile-web-app-title")).toBe(manifest.short_name);
  });

  it("leaves the status bar visible, so the page stays clear of the clock", () => {
    // "black-translucent" pulls the page under the clock and battery, and the
    // top of the layout is not built for that — so the tag must stay "default".
    expect(metaContent("apple-mobile-web-app-status-bar-style")).toBe("default");
  });
});
