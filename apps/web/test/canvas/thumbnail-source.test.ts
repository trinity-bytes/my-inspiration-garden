import { describe, expect, it } from "vitest";
import { thumbnailUrlForItem } from "../../src/canvas/thumbnail-source";
import { makeItem } from "../fixtures/items";

describe("thumbnailUrlForItem", () => {
  it("loads an image item's card thumbnail, not the original", () => {
    const item = makeItem("img1", "image", { r2Key: "media/2026/09/a.png" });
    expect(thumbnailUrlForItem(item, 300)).toBe("/api/thumbs/384/media/2026/09/a.png");
  });

  it("picks the desktop variant for wide cards", () => {
    const item = makeItem("img3", "image", { r2Key: "media/2026/09/a.png" });
    expect(thumbnailUrlForItem(item, 700)).toBe("/api/thumbs/768/media/2026/09/a.png");
  });

  it("prefixes the thumbnail URL with an explicit API base URL", () => {
    const item = makeItem("img2", "image", { r2Key: "media/x.png" });
    expect(thumbnailUrlForItem(item, 300, "https://api.example.com")).toBe(
      "https://api.example.com/api/thumbs/384/media/x.png",
    );
  });

  it("uses a remote link previewImage as is (legacy previews have no thumbnail)", () => {
    const item = makeItem("link1", "link", { previewImage: "https://cdn.example.com/preview.jpg" });
    expect(thumbnailUrlForItem(item, 300)).toBe("https://cdn.example.com/preview.jpg");
  });

  it("loads the thumbnail of a link previewImage stored as an R2 key", () => {
    const item = makeItem("link3", "link", { previewImage: "media/2026/10/abc.png" });
    expect(thumbnailUrlForItem(item, 300, "https://api.test")).toBe(
      "https://api.test/api/thumbs/384/media/2026/10/abc.png",
    );
  });

  it("returns null for a link item without a preview image", () => {
    const item = makeItem("link2", "link", {});
    expect(thumbnailUrlForItem(item, 300)).toBeNull();
  });

  it("uses a remote video thumbnail as is", () => {
    const item = makeItem("vid1", "video", { thumbnail: "https://cdn.example.com/thumb.jpg" });
    expect(thumbnailUrlForItem(item, 300)).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("loads the thumbnail of an uploaded video's poster stored as an R2 key", () => {
    const item = makeItem("vid3", "video", {
      provider: "file",
      r2Key: "media/2026/11/clip.mp4",
      thumbnail: "media/2026/11/poster.webp",
    });
    expect(thumbnailUrlForItem(item, 300)).toBe("/api/thumbs/384/media/2026/11/poster.webp");
  });

  it("returns null for a video item without a thumbnail, never the video file itself", () => {
    expect(thumbnailUrlForItem(makeItem("vid2", "video", {}), 300)).toBeNull();
    const uploaded = makeItem("vid4", "video", { provider: "file", r2Key: "media/2026/11/a.mp4" });
    expect(thumbnailUrlForItem(uploaded, 300)).toBeNull();
  });

  it("returns null for kinds with no image-like representation (text, palette, font)", () => {
    expect(thumbnailUrlForItem(makeItem("t1", "text"), 300)).toBeNull();
    expect(thumbnailUrlForItem(makeItem("p1", "palette"), 300)).toBeNull();
    expect(thumbnailUrlForItem(makeItem("f1", "font"), 300)).toBeNull();
  });
});
