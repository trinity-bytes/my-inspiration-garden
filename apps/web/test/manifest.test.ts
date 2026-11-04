import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import icon192 from "../public/icon-192.png?inline";
import icon512 from "../public/icon-512.png?inline";
import iconMaskable512 from "../public/icon-maskable-512.png?inline";
import manifestRaw from "../public/manifest.webmanifest?raw";

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
});
