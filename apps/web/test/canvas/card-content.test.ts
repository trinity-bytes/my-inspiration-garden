import type { Item, ItemKind } from "@garden/shared";
import { describe, expect, it } from "vitest";
import {
  domainForUrl,
  fontCardContent,
  linkCardContent,
  paletteCardContent,
  textCardContent,
  videoCardContent,
} from "../../src/canvas/card-content";
import { makeItem as makeItemFixture } from "../fixtures/items";

/** `makeItem`'s return type is the full `Item` union (the fixture's `kind` param isn't a per-call literal type), so cast to the specific kind requested — the runtime shape always matches since the fixture switches on `kind` internally. */
function makeItem<K extends ItemKind>(
  id: string,
  kind: K,
  dataOverrides: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Extract<Item, { kind: K }> {
  return makeItemFixture(id, kind, dataOverrides, extra) as Extract<Item, { kind: K }>;
}

describe("domainForUrl", () => {
  it("strips the protocol and path", () => {
    expect(domainForUrl("https://dribbble.com/shots/123-thing")).toBe("dribbble.com");
  });

  it("strips a leading www.", () => {
    expect(domainForUrl("https://www.pinterest.com/pin/1")).toBe("pinterest.com");
  });

  it("falls back to the raw string for an unparsable URL", () => {
    expect(domainForUrl("not a url")).toBe("not a url");
  });
});

describe("linkCardContent", () => {
  it("uses the item title when present, else the domain", () => {
    const withTitle = makeItem("l1", "link", {}, { title: "A cool shot", url: "https://x.com/a" });
    expect(linkCardContent(withTitle).title).toBe("A cool shot");

    const withoutTitle = makeItem("l2", "link", {}, { title: undefined, url: "https://x.com/b" });
    expect(linkCardContent(withoutTitle).title).toBe("x.com");
  });

  it("reports hasPreview based on data.previewImage", () => {
    const withPreview = makeItem("l3", "link", { previewImage: "https://img/1.png" });
    expect(linkCardContent(withPreview).hasPreview).toBe(true);

    const withoutPreview = makeItem("l4", "link", {});
    expect(linkCardContent(withoutPreview).hasPreview).toBe(false);
  });

  it("always reports the domain", () => {
    const item = makeItem("l5", "link", {}, { url: "https://dribbble.com/shots/1" });
    expect(linkCardContent(item).domain).toBe("dribbble.com");
  });
});

describe("videoCardContent", () => {
  it("maps each provider to a display label", () => {
    expect(videoCardContent(makeItem("v1", "video", { provider: "youtube" })).providerLabel).toBe(
      "YouTube",
    );
    expect(videoCardContent(makeItem("v2", "video", { provider: "vimeo" })).providerLabel).toBe(
      "Vimeo",
    );
    expect(videoCardContent(makeItem("v3", "video", { provider: "file" })).providerLabel).toBe(
      "Video",
    );
  });

  it("uses the item title when present, else the provider label", () => {
    const withTitle = makeItem("v4", "video", { provider: "youtube" }, { title: "My clip" });
    expect(videoCardContent(withTitle).title).toBe("My clip");

    const withoutTitle = makeItem("v5", "video", { provider: "vimeo" }, { title: undefined });
    expect(videoCardContent(withoutTitle).title).toBe("Vimeo");
  });

  it("reports hasThumbnail based on data.thumbnail", () => {
    expect(
      videoCardContent(makeItem("v6", "video", { provider: "file", thumbnail: "x.jpg" }))
        .hasThumbnail,
    ).toBe(true);
    expect(videoCardContent(makeItem("v7", "video", { provider: "file" })).hasThumbnail).toBe(
      false,
    );
  });
});

describe("textCardContent", () => {
  it("returns the title (or null) and the body excerpt", () => {
    const withTitle = makeItem("t1", "text", { body: "hello there" }, { title: "A note" });
    expect(textCardContent(withTitle)).toEqual({ title: "A note", excerpt: "hello there" });

    const withoutTitle = makeItem("t2", "text", { body: "just body" }, { title: undefined });
    expect(textCardContent(withoutTitle)).toEqual({ title: null, excerpt: "just body" });
  });
});

describe("paletteCardContent", () => {
  it("uses the title, or 'Palette', for the name", () => {
    const withTitle = makeItem(
      "p1",
      "palette",
      { colors: [{ hex: "#ff0000" }] },
      { title: "Sunset" },
    );
    expect(paletteCardContent(withTitle).name).toBe("Sunset");

    const withoutTitle = makeItem(
      "p2",
      "palette",
      { colors: [{ hex: "#ff0000" }] },
      { title: undefined },
    );
    expect(paletteCardContent(withoutTitle).name).toBe("Palette");
  });

  it("returns colors normalized to an even split when none carry a weight", () => {
    const colors = [{ hex: "#ff0000" }, { hex: "#00ff00", name: "green" }];
    const item = makeItem("p3", "palette", { colors });
    expect(paletteCardContent(item).colors).toEqual([
      { hex: "#ff0000", weight: 0.5, name: undefined },
      { hex: "#00ff00", weight: 0.5, name: "green" },
    ]);
  });

  it("normalizes explicit per-color weights proportionally (T11b B5)", () => {
    const colors = [
      { hex: "#ff0000", weight: 75 },
      { hex: "#00ff00", weight: 25 },
    ];
    const item = makeItem("p4", "palette", { colors });
    expect(paletteCardContent(item).colors).toEqual([
      { hex: "#ff0000", weight: 0.75, name: undefined },
      { hex: "#00ff00", weight: 0.25, name: undefined },
    ]);
  });
});

describe("fontCardContent", () => {
  it("returns the family and a pangram (custom or default)", () => {
    const withPreview = makeItem("f1", "font", { family: "Inter", previewText: "Pack my box" }, {});
    expect(fontCardContent(withPreview)).toEqual({ family: "Inter", pangram: "Pack my box" });

    const withoutPreview = makeItem("f2", "font", { family: "Roboto" });
    const result = fontCardContent(withoutPreview);
    expect(result.family).toBe("Roboto");
    expect(result.pangram.length).toBeGreaterThan(0);
  });
});
