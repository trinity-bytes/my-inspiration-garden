import { describe, expect, it } from "vitest";
import {
  MAX_TEXTURE_CACHE_SIZE,
  MIN_TEXTURE_CACHE_SIZE,
  textureCacheSizeFor,
} from "../../src/canvas/texture-budget";

describe("textureCacheSizeFor", () => {
  it("keeps far more textures resident on a phone, where each card texture is small", () => {
    // Pixel 7: ~160 CSS px columns at DPR 2.625 (textures cap at 2x).
    expect(textureCacheSizeFor(160, 2.625)).toBeGreaterThanOrEqual(300);
  });

  it("never drops below today's cache size on large desktop columns", () => {
    expect(MIN_TEXTURE_CACHE_SIZE).toBe(120);
    expect(textureCacheSizeFor(420, 2)).toBe(MIN_TEXTURE_CACHE_SIZE);
  });

  it("is capped for tiny columns", () => {
    expect(textureCacheSizeFor(40, 1)).toBe(MAX_TEXTURE_CACHE_SIZE);
  });
});
