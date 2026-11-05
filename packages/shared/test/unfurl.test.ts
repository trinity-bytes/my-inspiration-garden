import { describe, expect, it } from "vitest";
import { mergeUnfurlMetadata, resolveUrl, upgradePinterestThumbnail } from "../src/unfurl";

describe("resolveUrl", () => {
  it("resolves a relative path against the page URL", () => {
    expect(resolveUrl("/img/hero.png", "https://example.com/blog/post")).toBe(
      "https://example.com/img/hero.png",
    );
  });

  it("passes through an already-absolute URL", () => {
    expect(resolveUrl("https://cdn.example.com/hero.png", "https://example.com/blog/post")).toBe(
      "https://cdn.example.com/hero.png",
    );
  });

  it("returns undefined for an unresolvable value", () => {
    expect(resolveUrl("", "not a base")).toBeUndefined();
  });
});

describe("mergeUnfurlMetadata", () => {
  it("prefers oEmbed fields over open graph fields", () => {
    const merged = mergeUnfurlMetadata("https://youtube.com/watch?v=1", "youtube", {
      oembed: { title: "oEmbed title", author: "Author" },
      og: { title: "OG title", description: "OG description" },
    });
    expect(merged.title).toBe("oEmbed title");
    expect(merged.author).toBe("Author");
    expect(merged.description).toBe("OG description");
    expect(merged.platform).toBe("youtube");
    expect(merged.url).toBe("https://youtube.com/watch?v=1");
  });

  it("never throws and returns partial metadata when both sources are null", () => {
    const merged = mergeUnfurlMetadata("https://example.com", "other", { oembed: null, og: null });
    expect(merged).toEqual({
      url: "https://example.com",
      platform: "other",
      canonicalUrl: undefined,
      title: undefined,
      description: undefined,
      siteName: undefined,
      previewImage: undefined,
      author: undefined,
      embed: undefined,
    });
  });
});

describe("upgradePinterestThumbnail", () => {
  it("swaps the 236px rendition for the 736px one on Pinterest's image host", () => {
    expect(upgradePinterestThumbnail("https://i.pinimg.com/236x/a7/66/56/a.jpg")).toBe(
      "https://i.pinimg.com/736x/a7/66/56/a.jpg",
    );
  });

  it("leaves other hosts and other renditions untouched", () => {
    const otherHost = "https://cdn.example.com/236x/a.jpg";
    const otherSize = "https://i.pinimg.com/originals/a7/66/56/a.jpg";
    expect(upgradePinterestThumbnail(otherHost)).toBe(otherHost);
    expect(upgradePinterestThumbnail(otherSize)).toBe(otherSize);
  });
});
