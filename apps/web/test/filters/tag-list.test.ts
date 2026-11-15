import { describe, expect, it } from "vitest";
import { matchTags, sortTags } from "../../src/filters/tag-list";

const tags = [
  { id: "a", name: "portrait", count: 6 },
  { id: "b", name: "inspiration", count: 94 },
  { id: "c", name: "ai", count: 25 },
  { id: "d", name: "article", count: 25 },
];

describe("sortTags", () => {
  it("orders by count, most used first, breaking ties by name", () => {
    expect(sortTags(tags, "count").map((t) => t.name)).toEqual([
      "inspiration",
      "ai",
      "article",
      "portrait",
    ]);
  });

  it("orders alphabetically for A–Z", () => {
    expect(sortTags(tags, "name").map((t) => t.name)).toEqual([
      "ai",
      "article",
      "inspiration",
      "portrait",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [...tags];
    sortTags(input, "name");
    expect(input).toEqual(tags);
  });
});

describe("matchTags", () => {
  it("keeps tags whose name contains the query, ignoring case and outer spaces", () => {
    expect(matchTags(tags, "  RT ").map((t) => t.name)).toEqual(["portrait", "article"]);
  });

  it("returns every tag for an empty query", () => {
    expect(matchTags(tags, "   ")).toEqual(tags);
  });
});
