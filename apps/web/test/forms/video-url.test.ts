import { describe, expect, it } from "vitest";
import { deriveVideoEmbed } from "../../src/forms/video-url";

describe("deriveVideoEmbed", () => {
  it("derives from a youtube.com/watch?v= url", () => {
    expect(deriveVideoEmbed("https://www.youtube.com/watch?v=abc123")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
    });
  });

  it("ignores extra query params on a watch url", () => {
    expect(deriveVideoEmbed("https://www.youtube.com/watch?v=abc123&t=42s")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
    });
  });

  it("derives from a youtu.be short url", () => {
    expect(deriveVideoEmbed("https://youtu.be/abc123")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
    });
  });

  it("derives from a youtube.com/shorts/ url", () => {
    expect(deriveVideoEmbed("https://www.youtube.com/shorts/abc123")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
    });
  });

  it("derives from a vimeo.com/<id> url", () => {
    expect(deriveVideoEmbed("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("works without a www prefix", () => {
    expect(deriveVideoEmbed("https://youtube.com/watch?v=abc123")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/abc123",
    });
  });

  it("returns null for a youtube url with no video id", () => {
    expect(deriveVideoEmbed("https://www.youtube.com/")).toBeNull();
  });

  it("returns null for a vimeo url with a non-numeric path", () => {
    expect(deriveVideoEmbed("https://vimeo.com/about")).toBeNull();
  });

  it("returns null for an unrelated url", () => {
    expect(deriveVideoEmbed("https://example.com/watch?v=abc123")).toBeNull();
  });

  it("returns null for a malformed url", () => {
    expect(deriveVideoEmbed("not a url")).toBeNull();
  });
});
