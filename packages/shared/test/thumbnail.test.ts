import { describe, expect, it } from "vitest";
import { THUMBNAIL_WIDTHS, thumbnailWidthFor } from "../src/thumbnail";

describe("thumbnailWidthFor", () => {
  it("offers the phone and desktop variants", () => {
    expect(THUMBNAIL_WIDTHS).toEqual([384, 768]);
  });

  it("picks the smallest variant that covers the painted width", () => {
    expect(thumbnailWidthFor(200)).toBe(384);
    expect(thumbnailWidthFor(384)).toBe(384);
    expect(thumbnailWidthFor(500)).toBe(768);
    expect(thumbnailWidthFor(768)).toBe(768);
  });

  it("tolerates a few percent of upscaling before stepping up a variant", () => {
    expect(thumbnailWidthFor(400)).toBe(384);
  });

  it("caps at the largest variant", () => {
    expect(thumbnailWidthFor(1024)).toBe(768);
  });
});
