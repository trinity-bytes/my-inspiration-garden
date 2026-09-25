import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLoadedFontFamily } from "../../src/detail/useLoadedFontFamily";

describe("useLoadedFontFamily", () => {
  const originalFontFace = (globalThis as { FontFace?: unknown }).FontFace;
  const originalFonts = document.fonts;

  afterEach(() => {
    (globalThis as { FontFace?: unknown }).FontFace = originalFontFace;
    Object.defineProperty(document, "fonts", { value: originalFonts, configurable: true });
    vi.useRealTimers();
  });

  it("returns the fallback family immediately when there is no sourceUrl", () => {
    const { result } = renderHook(() => useLoadedFontFamily("Inter", undefined, "Geist Variable"));
    expect(result.current).toEqual({ fontFamily: "Geist Variable", loaded: false });
  });

  it("returns the real family once FontFace loads successfully", async () => {
    const added: unknown[] = [];
    class FakeFontFace {
      family: string;
      constructor(family: string) {
        this.family = family;
      }
      load() {
        return Promise.resolve(this);
      }
    }
    (globalThis as { FontFace?: unknown }).FontFace = FakeFontFace;
    Object.defineProperty(document, "fonts", {
      value: { add: (f: unknown) => added.push(f) },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useLoadedFontFamily("Inter", "https://fonts.example/inter.woff2", "Geist Variable"),
    );

    await waitFor(() => expect(result.current).toEqual({ fontFamily: "Inter", loaded: true }));
    expect(added).toHaveLength(1);
  });

  it("falls back when FontFace.load() rejects", async () => {
    class FailingFontFace {
      load() {
        return Promise.reject(new Error("nope"));
      }
    }
    (globalThis as { FontFace?: unknown }).FontFace = FailingFontFace;

    const { result } = renderHook(() =>
      useLoadedFontFamily("Broken", "https://fonts.example/broken.woff2", "Geist Variable"),
    );

    await waitFor(() =>
      expect(result.current).toEqual({ fontFamily: "Geist Variable", loaded: false }),
    );
  });

  it("falls back when the FontFace API is unavailable", () => {
    (globalThis as { FontFace?: unknown }).FontFace = undefined;

    const { result } = renderHook(() =>
      useLoadedFontFamily("Inter", "https://fonts.example/inter.woff2", "Geist Variable"),
    );

    expect(result.current).toEqual({ fontFamily: "Geist Variable", loaded: false });
  });
});
