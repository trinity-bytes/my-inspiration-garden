import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_VIDEO_BYTES,
  maxBytesForMime,
} from "../src/lib/media-limits";
import { buildMediaKey } from "../src/lib/r2-key";

describe("buildMediaKey", () => {
  it("builds a media/<yyyy>/<mm>/<id>.<ext> key from the mime's extension", () => {
    const date = new Date(Date.UTC(2026, 8, 23)); // September (0-indexed month 8)
    expect(buildMediaKey(date, "01abc", "image/png")).toBe("media/2026/09/01abc.png");
  });

  it("pads single-digit months", () => {
    const date = new Date(Date.UTC(2026, 0, 5)); // January
    expect(buildMediaKey(date, "id", "image/jpeg")).toBe("media/2026/01/id.jpg");
  });

  it("maps every supported mime to its extension", () => {
    const date = new Date(Date.UTC(2026, 0, 1));
    expect(buildMediaKey(date, "id", "image/webp")).toMatch(/\.webp$/);
    expect(buildMediaKey(date, "id", "image/gif")).toMatch(/\.gif$/);
    expect(buildMediaKey(date, "id", "image/avif")).toMatch(/\.avif$/);
    expect(buildMediaKey(date, "id", "video/mp4")).toMatch(/\.mp4$/);
    expect(buildMediaKey(date, "id", "video/webm")).toMatch(/\.webm$/);
  });
});

describe("maxBytesForMime", () => {
  it("defaults to 15 MB for images", () => {
    expect(maxBytesForMime("image/png", {})).toBe(DEFAULT_MAX_IMAGE_BYTES);
  });

  it("defaults to 50 MB for video", () => {
    expect(maxBytesForMime("video/mp4", {})).toBe(DEFAULT_MAX_VIDEO_BYTES);
  });

  it("honors an env override", () => {
    expect(maxBytesForMime("image/png", { MAX_IMAGE_BYTES: "1000" })).toBe(1000);
    expect(maxBytesForMime("video/webm", { MAX_VIDEO_BYTES: "2000" })).toBe(2000);
  });
});
