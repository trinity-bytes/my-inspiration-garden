import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFontOnce, resetLoadedFontsForTests } from "../../src/fonts/load-font";

describe("loadFontOnce", () => {
  const originalFontFace = (globalThis as { FontFace?: unknown }).FontFace;
  const originalFonts = document.fonts;
  let constructed: string[];
  let added: unknown[];
  let loadBehavior: () => Promise<unknown>;

  beforeEach(() => {
    resetLoadedFontsForTests();
    constructed = [];
    added = [];
    loadBehavior = () => Promise.resolve();
    class FakeFontFace {
      constructor(family: string, source: string) {
        constructed.push(`${family} ${source}`);
      }
      load() {
        return loadBehavior().then(() => this);
      }
    }
    (globalThis as { FontFace?: unknown }).FontFace = FakeFontFace;
    Object.defineProperty(document, "fonts", {
      value: { add: (face: unknown) => added.push(face) },
      configurable: true,
    });
  });

  afterEach(() => {
    (globalThis as { FontFace?: unknown }).FontFace = originalFontFace;
    Object.defineProperty(document, "fonts", { value: originalFonts, configurable: true });
    vi.useRealTimers();
  });

  it("creates and registers one FontFace per family and URL however often it is requested", async () => {
    const results = await Promise.all([
      loadFontOnce("Inter", "https://fonts.example/inter.woff2", 1000),
      loadFontOnce("Inter", "https://fonts.example/inter.woff2", 1000),
    ]);
    const later = await loadFontOnce("Inter", "https://fonts.example/inter.woff2", 1000);

    expect(results).toEqual([true, true]);
    expect(later).toBe(true);
    expect(constructed).toEqual(["Inter url(https://fonts.example/inter.woff2)"]);
    expect(added).toHaveLength(1);
  });

  it("clears its timeout once the font settles", async () => {
    vi.useFakeTimers();

    await expect(loadFontOnce("Inter", "https://fonts.example/inter.woff2", 1000)).resolves.toBe(
      true,
    );

    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves false on timeout without registering the face", async () => {
    vi.useFakeTimers();
    loadBehavior = () => new Promise(() => {});

    const pending = loadFontOnce("Slow", "https://fonts.example/slow.woff2", 1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toBe(false);
    expect(added).toHaveLength(0);
  });

  it("retries with a fresh FontFace after a failed load", async () => {
    loadBehavior = () => Promise.reject(new Error("network"));
    await expect(loadFontOnce("Flaky", "https://fonts.example/flaky.woff2", 1000)).resolves.toBe(
      false,
    );

    loadBehavior = () => Promise.resolve();
    await expect(loadFontOnce("Flaky", "https://fonts.example/flaky.woff2", 1000)).resolves.toBe(
      true,
    );
    expect(constructed).toHaveLength(2);
  });

  it("resolves false without a URL or without the FontFace API", async () => {
    await expect(loadFontOnce("Inter", undefined, 1000)).resolves.toBe(false);
    (globalThis as { FontFace?: unknown }).FontFace = undefined;
    await expect(loadFontOnce("Inter", "https://fonts.example/inter.woff2", 1000)).resolves.toBe(
      false,
    );
    expect(constructed).toEqual([]);
  });
});
