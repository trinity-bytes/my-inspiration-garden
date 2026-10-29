import type { Category } from "@garden/shared";
import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  countActiveFilters,
  defaultFilterState,
  filtersToListParams,
  isFilterActive,
  toggleValue,
} from "../../src/filters/filter-state";

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: "cat-1",
    name: "Category",
    slug: "category",
    parentId: null,
    position: 0,
    ...overrides,
  };
}

describe("toggleValue", () => {
  it("adds a value not already present", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes a value already present", () => {
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("defaultFilterState", () => {
  it("has empty facets and no color/search", () => {
    expect(defaultFilterState()).toEqual({
      kinds: [],
      tags: [],
      categoryIds: [],
      color: undefined,
      q: "",
    });
  });
});

describe("countActiveFilters", () => {
  it("counts each kind, tag and category plus the color, ignoring the search text", () => {
    expect(countActiveFilters(defaultFilterState())).toBe(0);
    expect(
      countActiveFilters({
        kinds: ["image", "link"],
        tags: ["moodboard"],
        categoryIds: ["c1"],
        color: "#F29A6B",
        q: "sunset",
      }),
    ).toBe(5);
  });
});

describe("isFilterActive", () => {
  it("is false for the default state", () => {
    expect(isFilterActive(defaultFilterState())).toBe(false);
  });

  it("is true when any facet is set", () => {
    expect(isFilterActive({ ...defaultFilterState(), kinds: ["image"] })).toBe(true);
    expect(isFilterActive({ ...defaultFilterState(), tags: ["ui"] })).toBe(true);
    expect(isFilterActive({ ...defaultFilterState(), categoryIds: ["cat-1"] })).toBe(true);
    expect(isFilterActive({ ...defaultFilterState(), color: "#ffffff" })).toBe(true);
    expect(isFilterActive({ ...defaultFilterState(), q: "sunset" })).toBe(true);
  });
});

describe("filtersToListParams", () => {
  it("maps every facet through, trimming an empty search string away", () => {
    expect(
      filtersToListParams({
        kinds: ["image", "text"],
        tags: ["ui", "warm"],
        categoryIds: ["cat-1"],
        color: "#f29a6b",
        q: "  ",
      }),
    ).toEqual({
      kind: ["image", "text"],
      tag: ["ui", "warm"],
      categoryId: ["cat-1"],
      color: "#f29a6b",
      q: undefined,
    });
  });

  it("keeps a real trimmed search term", () => {
    expect(filtersToListParams({ ...defaultFilterState(), q: "  sunset  " }).q).toBe("sunset");
  });
});

describe("buildCategoryTree", () => {
  it("nests children under their parent, ordered by position", () => {
    const flat: Category[] = [
      makeCategory({ id: "root-2", name: "B", parentId: null, position: 1 }),
      makeCategory({ id: "root-1", name: "A", parentId: null, position: 0 }),
      makeCategory({ id: "child-1", name: "A1", parentId: "root-1", position: 0 }),
    ];

    const tree = buildCategoryTree(flat);

    expect(tree.map((node) => node.category.id)).toEqual(["root-1", "root-2"]);
    expect(tree[0]?.children.map((node) => node.category.id)).toEqual(["child-1"]);
    expect(tree[1]?.children).toEqual([]);
  });

  it("promotes a node whose parent is missing from the list to the root", () => {
    const flat: Category[] = [makeCategory({ id: "orphan", parentId: "missing-parent" })];
    const tree = buildCategoryTree(flat);
    expect(tree.map((node) => node.category.id)).toEqual(["orphan"]);
  });
});
