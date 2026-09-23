import { describe, expect, it } from "vitest";
import { normalizeTag, slugify } from "../src/helpers";

describe("normalizeTag", () => {
  it("trims and lowercases", () => {
    expect(normalizeTag("  Nature  ")).toBe("nature");
  });

  it("lowercases mixed case without extra whitespace", () => {
    expect(normalizeTag("GlassMorphism")).toBe("glassmorphism");
  });
});

describe("slugify", () => {
  it("converts spaces and punctuation to hyphens", () => {
    expect(slugify("Cloud & Glass!")).toBe("cloud-glass");
  });

  it("collapses repeated separators and strips edges", () => {
    expect(slugify("  --Multi   Word--  ")).toBe("multi-word");
  });

  it("strips accents", () => {
    expect(slugify("Inspiración")).toBe("inspiracion");
  });
});
