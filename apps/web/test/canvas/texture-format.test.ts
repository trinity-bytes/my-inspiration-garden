import { describe, expect, it } from "vitest";
import { selectTextureFormat, textureUrl } from "../../src/canvas/texture-format";

describe("selectTextureFormat", () => {
  it("prefers avif when supported", () => {
    expect(selectTextureFormat(true)).toBe("avif");
  });

  it("falls back to webp when avif is not supported", () => {
    expect(selectTextureFormat(false)).toBe("webp");
  });
});

describe("textureUrl", () => {
  it("builds an avif url", () => {
    expect(textureUrl("/images/sky", "avif")).toBe("/images/sky.avif");
  });

  it("builds a webp url", () => {
    expect(textureUrl("/images/cloud-1", "webp")).toBe("/images/cloud-1.webp");
  });
});
