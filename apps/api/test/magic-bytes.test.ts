import { describe, expect, it } from "vitest";
import { IMAGE_MIME_TYPES, sniffMime, VIDEO_MIME_TYPES } from "../src/lib/magic-bytes";

describe("sniffMime", () => {
  it("detects png by its 8-byte signature", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniffMime(bytes)).toBe("image/png");
  });

  it("detects jpeg by its FF D8 FF signature", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffMime(bytes)).toBe("image/jpeg");
  });

  it("detects gif87a and gif89a", () => {
    const gif89a = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(sniffMime(gif89a)).toBe("image/gif");
    const gif87a = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(sniffMime(gif87a)).toBe("image/gif");
  });

  it("detects webp via the RIFF....WEBP container", () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMime(bytes)).toBe("image/webp");
  });

  it("detects avif via the ftyp box brand", () => {
    const bytes = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    expect(sniffMime(bytes)).toBe("image/avif");
  });

  it("detects mp4 via the ftyp box brand", () => {
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniffMime(bytes)).toBe("video/mp4");
  });

  it("detects webm via the EBML header", () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffMime(bytes)).toBe("video/webm");
  });

  it("returns null for unrecognized or too-short content", () => {
    expect(sniffMime(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sniffMime(new Uint8Array(20))).toBeNull();
  });

  it("returns null for content that merely declares an image mime in a header but isn't one", () => {
    // e.g. an HTML error page mistakenly uploaded with a spoofed Content-Type
    const html = new TextEncoder().encode("<!doctype html><html></html>");
    expect(sniffMime(html)).toBeNull();
  });
});

describe("IMAGE_MIME_TYPES / VIDEO_MIME_TYPES", () => {
  it("classifies sniffed mimes into image vs video sets", () => {
    expect(IMAGE_MIME_TYPES.has("image/png")).toBe(true);
    expect(VIDEO_MIME_TYPES.has("image/png")).toBe(false);
    expect(VIDEO_MIME_TYPES.has("video/mp4")).toBe(true);
  });
});
