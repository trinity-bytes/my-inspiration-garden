import { describe, expect, it } from "vitest";
import { placeholderStyleForItem } from "../../src/canvas/placeholder-style";
import { makeItem } from "../fixtures/items";

describe("placeholderStyleForItem", () => {
  it("labels each kind in human-readable form", () => {
    expect(placeholderStyleForItem(makeItem("a", "text")).label).toBe("Text");
    expect(placeholderStyleForItem(makeItem("b", "link")).label).toBe("Link");
    expect(placeholderStyleForItem(makeItem("c", "video")).label).toBe("Video");
    expect(placeholderStyleForItem(makeItem("d", "palette")).label).toBe("Palette");
    expect(placeholderStyleForItem(makeItem("e", "font")).label).toBe("Font");
    expect(placeholderStyleForItem(makeItem("f", "image")).label).toBe("Image");
  });

  it("uses the item's own title when present", () => {
    const item = makeItem("g", "text", {}, { title: "My inspiration" });
    expect(placeholderStyleForItem(item).displayTitle).toBe("My inspiration");
  });

  it("falls back to the kind label when the title is missing", () => {
    const item = makeItem("h", "text", {}, { title: undefined });
    expect(placeholderStyleForItem(item).displayTitle).toBe("Text");
  });

  it("truncates a very long title", () => {
    const longTitle = "x".repeat(200);
    const item = makeItem("i", "text", {}, { title: longTitle });
    expect(placeholderStyleForItem(item).displayTitle.length).toBeLessThan(longTitle.length);
  });

  it("returns valid #RRGGBB hex colors from the design palette", () => {
    const style = placeholderStyleForItem(makeItem("j", "font"));
    expect(style.background).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(style.foreground).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("is deterministic for the same item", () => {
    const item = makeItem("k", "palette");
    expect(placeholderStyleForItem(item)).toEqual(placeholderStyleForItem(item));
  });
});
