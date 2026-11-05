import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import faviconSvg from "../public/favicon.svg?raw";

/**
 * The favicon closes a long-standing `/favicon.ico` 404: a browser requests
 * `/favicon.ico` whenever a document declares no icon, and there is no such
 * file. The fix is an explicit `<link rel="icon">` in `index.html` pointing at
 * a hand-written SVG in `public/`.
 *
 * Both files arrive as Vite `?raw` imports, which also make their existence a
 * precondition of this suite loading at all — the jsdom pool has no Node types
 * here, and `import.meta.url` is an http URL rather than a file URL, so
 * `node:fs` and `readFileSync(import.meta.url)` are both unavailable.
 */
const ICON_LINK = /<link\b[^>]*\brel=["']icon["'][^>]*>/i;

/**
 * The art direction for this app (`odd/tasks/garden-mvp.md` "Visual theme",
 * mirrored by `src/styles/tokens.css`): a lavender scale on ink, with apricot
 * as the single accent and **no hot pink**. Spelled out here so a future edit
 * to the icon cannot quietly drift off-palette.
 */
const PALETTE = new Set([
  "#f6f3fa", // lavender 50
  "#e9e3f3", // lavender 100
  "#d5cbe8", // lavender 200
  "#b3a3d1", // lavender 300
  "#8f7bb5", // lavender 400
  "#5e4c82", // lavender 500
  "#2a2140", // ink
  "#1c1830", // canvas
  "#f29a6b", // accent
  "#e0784e", // accent strong
  "#fce3d3", // accent soft
]);

describe("favicon", () => {
  it("is declared explicitly in index.html, so browsers stop probing /favicon.ico", () => {
    const link = ICON_LINK.exec(indexHtml);

    expect(link, 'index.html declares no <link rel="icon">').not.toBeNull();
    expect(link?.[0]).toMatch(/href=["']\/favicon\.svg["']/);
  });

  it("is well-formed XML, which SVG requires", () => {
    // XML forbids "--" inside a comment, so writing a design-token name such
    // as a `var(--garden-lavender-200)` reference in the explanatory comment
    // silently produces a file every strict parser rejects — including
    // browsers. jsdom's DOMParser is a real XML parser, so it catches that.
    const parsed = new DOMParser().parseFromString(faviconSvg, "image/svg+xml");

    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.nodeName).toBe("svg");
  });

  it("stays inside the garden palette", () => {
    const colors = (faviconSvg.match(/#[0-9a-f]{6}/gi) ?? []).map((color) => color.toLowerCase());

    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(PALETTE.has(color), `${color} is not in the garden palette`).toBe(true);
    }
  });

  it("draws the Four cards mark: four rounded cards, one apricot, on the canvas tile", () => {
    const parsed = new DOMParser().parseFromString(faviconSvg, "image/svg+xml");
    const [tile, ...cards] = [...parsed.querySelectorAll("rect")];
    const fills = cards.map((card) => card.getAttribute("fill")?.toLowerCase());

    expect(tile?.getAttribute("fill")?.toLowerCase()).toBe("#1c1830");
    expect(fills).toHaveLength(4);
    expect(fills.filter((fill) => fill === "#f29a6b")).toHaveLength(1);
    expect(parsed.querySelector("circle")).toBeNull();
  });

  it("is small enough to stay legible at 16x16", () => {
    // A tab renders the icon at 16px. A much larger viewBox means the shapes
    // go sub-pixel, so this is a shape-count guard, not a byte-size one.
    const viewBox = /viewBox=["']0 0 (\d+) \1["']/.exec(faviconSvg);

    expect(viewBox).not.toBeNull();
    expect(Number(viewBox?.[1])).toBeLessThanOrEqual(64);
    expect((faviconSvg.match(/<(circle|rect|ellipse|path)\b/g) ?? []).length).toBeLessThanOrEqual(
      12,
    );
  });
});
