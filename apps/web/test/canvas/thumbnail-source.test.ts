import { describe, expect, it } from "vitest";
import { thumbnailUrlForItem } from "../../src/canvas/thumbnail-source";
import { makeItem } from "../fixtures/items";

describe("thumbnailUrlForItem", () => {
  it("builds a media URL from an image item's r2Key", () => {
    const item = makeItem("img1", "image", { r2Key: "media/2026/09/a.png" });
    expect(thumbnailUrlForItem(item)).toBe("/api/media/media/2026/09/a.png");
  });

  it("prefixes the media URL with an explicit API base URL", () => {
    const item = makeItem("img2", "image", { r2Key: "media/x.png" });
    expect(thumbnailUrlForItem(item, "https://api.example.com")).toBe(
      "https://api.example.com/api/media/media/x.png",
    );
  });

  it("uses a link item's previewImage when present", () => {
    const item = makeItem("link1", "link", { previewImage: "https://cdn.example.com/preview.jpg" });
    expect(thumbnailUrlForItem(item)).toBe("https://cdn.example.com/preview.jpg");
  });

  it("resolves a link previewImage stored as an R2 key through the media endpoint", () => {
    const item = makeItem("link3", "link", { previewImage: "media/2026/10/abc.png" });
    expect(thumbnailUrlForItem(item, "https://api.test")).toBe(
      "https://api.test/api/media/media/2026/10/abc.png",
    );
  });

  it("returns null for a link item without a preview image", () => {
    const item = makeItem("link2", "link", {});
    expect(thumbnailUrlForItem(item)).toBeNull();
  });

  it("uses a video item's thumbnail when present", () => {
    const item = makeItem("vid1", "video", { thumbnail: "https://cdn.example.com/thumb.jpg" });
    expect(thumbnailUrlForItem(item)).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("returns null for a video item without a thumbnail", () => {
    const item = makeItem("vid2", "video", {});
    expect(thumbnailUrlForItem(item)).toBeNull();
  });

  it("returns null for kinds with no image-like representation (text, palette, font)", () => {
    expect(thumbnailUrlForItem(makeItem("t1", "text"))).toBeNull();
    expect(thumbnailUrlForItem(makeItem("p1", "palette"))).toBeNull();
    expect(thumbnailUrlForItem(makeItem("f1", "font"))).toBeNull();
  });
});
