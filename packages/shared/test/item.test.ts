import { describe, expect, it } from "vitest";
import {
  createItemInputSchema,
  fontDataSchema,
  imageDataSchema,
  itemListQuerySchema,
  itemSchema,
  linkDataSchema,
  paletteDataSchema,
  textDataSchema,
  updateItemInputSchema,
  videoDataSchema,
} from "../src/item";

const now = "2026-09-23T12:00:00.000Z";

function baseItem(overrides: Record<string, unknown>) {
  return {
    id: "01J8Z6Q7GZ7YV1N7Q9K2X3M4A5",
    source: "web",
    categoryIds: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("imageDataSchema", () => {
  it("accepts valid image data", () => {
    const result = imageDataSchema.safeParse({
      r2Key: "media/foo.png",
      width: 800,
      height: 600,
      mime: "image/png",
      palette: ["#FFFFFF", "#000000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid palette hex values", () => {
    const result = imageDataSchema.safeParse({
      r2Key: "media/foo.png",
      width: 800,
      height: 600,
      mime: "image/png",
      palette: ["not-a-color"],
    });
    expect(result.success).toBe(false);
  });

  it("passes through unknown extra keys", () => {
    const result = imageDataSchema.parse({
      r2Key: "media/foo.png",
      width: 800,
      height: 600,
      mime: "image/png",
      exif: { camera: "Fujifilm" },
    });
    expect(result.exif).toEqual({ camera: "Fujifilm" });
  });

  it("accepts a text description and rejects any other type", () => {
    const base = { r2Key: "media/foo.png", width: 800, height: 600, mime: "image/png" };
    expect(imageDataSchema.parse({ ...base, description: "A pier" }).description).toBe("A pier");
    expect(imageDataSchema.safeParse({ ...base, description: 42 }).success).toBe(false);
  });
});

describe("linkDataSchema", () => {
  it("accepts a minimal link", () => {
    expect(linkDataSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown platform", () => {
    const result = linkDataSchema.safeParse({ platform: "myspace" });
    expect(result.success).toBe(false);
  });
});

describe("textDataSchema", () => {
  it("requires a body", () => {
    expect(textDataSchema.safeParse({}).success).toBe(false);
    expect(textDataSchema.safeParse({ body: "# hello" }).success).toBe(true);
  });
});

describe("videoDataSchema", () => {
  it("requires a provider", () => {
    expect(videoDataSchema.safeParse({}).success).toBe(false);
    expect(
      videoDataSchema.safeParse({ provider: "youtube", embedUrl: "https://youtube.com/x" }).success,
    ).toBe(true);
  });

  it("rejects an unknown provider", () => {
    expect(videoDataSchema.safeParse({ provider: "tiktok" }).success).toBe(false);
  });
});

describe("paletteDataSchema", () => {
  it("requires between 1 and 16 colors", () => {
    expect(paletteDataSchema.safeParse({ colors: [] }).success).toBe(false);
    expect(paletteDataSchema.safeParse({ colors: [{ hex: "#ABCDEF" }] }).success).toBe(true);
    const tooMany = Array.from({ length: 17 }, () => ({ hex: "#ABCDEF" }));
    expect(paletteDataSchema.safeParse({ colors: tooMany }).success).toBe(false);
  });

  it("rejects malformed hex", () => {
    expect(paletteDataSchema.safeParse({ colors: [{ hex: "ABCDEF" }] }).success).toBe(false);
  });

  it("accepts an optional positive weight per color (T11b B5)", () => {
    expect(paletteDataSchema.safeParse({ colors: [{ hex: "#ABCDEF", weight: 40 }] }).success).toBe(
      true,
    );
  });

  it("rejects a non-positive weight", () => {
    expect(paletteDataSchema.safeParse({ colors: [{ hex: "#ABCDEF", weight: 0 }] }).success).toBe(
      false,
    );
    expect(paletteDataSchema.safeParse({ colors: [{ hex: "#ABCDEF", weight: -5 }] }).success).toBe(
      false,
    );
  });
});

describe("fontDataSchema", () => {
  it("requires a family", () => {
    expect(fontDataSchema.safeParse({}).success).toBe(false);
    expect(fontDataSchema.safeParse({ family: "Inter" }).success).toBe(true);
  });

  it("rejects an unknown license", () => {
    expect(fontDataSchema.safeParse({ family: "Inter", license: "proprietary" }).success).toBe(
      false,
    );
  });
});

describe("itemSchema", () => {
  it("validates a full text item", () => {
    const item = baseItem({ kind: "text", data: { body: "hello" } });
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("requires url on link items", () => {
    const withoutUrl = baseItem({ kind: "link", data: {} });
    expect(itemSchema.safeParse(withoutUrl).success).toBe(false);

    const withUrl = baseItem({
      kind: "link",
      url: "https://dribbble.com/shots/1",
      data: {},
    });
    expect(itemSchema.safeParse(withUrl).success).toBe(true);
  });

  it("rejects data that does not match the item kind", () => {
    const mismatched = baseItem({ kind: "text", data: { family: "Inter" } });
    expect(itemSchema.safeParse(mismatched).success).toBe(false);
  });
});

describe("tag normalization on items", () => {
  it("normalizes, dedupes and lowercases tags", () => {
    const item = baseItem({
      kind: "text",
      data: { body: "hello" },
      tags: [" Nature ", "nature", "Glass"],
    });
    const parsed = itemSchema.parse(item);
    expect(parsed.tags).toEqual(["nature", "glass"]);
  });
});

describe("createItemInputSchema", () => {
  it("does not require id or timestamps", () => {
    const input = {
      kind: "palette",
      source: "web",
      data: { colors: [{ hex: "#112233" }] },
    };
    const result = createItemInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryIds).toEqual([]);
      expect(result.data.tags).toEqual([]);
    }
  });
});

describe("updateItemInputSchema", () => {
  it("allows partial updates with only kind and one field", () => {
    const input = { kind: "text", notes: "updated note" };
    const result = updateItemInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("keeps kind required and immutable (cannot omit it)", () => {
    const input = { notes: "updated note" };
    const result = updateItemInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects data that belongs to a different kind than the declared kind", () => {
    const input = { kind: "text", data: { family: "Inter" } };
    const result = updateItemInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("itemListQuerySchema", () => {
  it("applies defaults when given an empty query", () => {
    const result = itemListQuerySchema.parse({});
    expect(result).toMatchObject({
      kind: [],
      tag: [],
      categoryId: [],
      limit: 40,
    });
  });

  it("coerces single query-string values into arrays and normalizes tags", () => {
    const idA = "01J8Z6Q7GZ7YV1N7Q9K2X3M4A5";
    const idB = "01J8Z6Q7GZ7YV1N7Q9K2X3M4A6";
    const result = itemListQuerySchema.parse({
      kind: "image",
      tag: " Nature ",
      categoryId: [idA, idB],
      limit: "10",
      includeDeleted: "true",
    });
    expect(result.kind).toEqual(["image"]);
    expect(result.tag).toEqual(["nature"]);
    expect(result.categoryId).toEqual([idA, idB]);
    expect(result.limit).toBe(10);
    expect(result.includeDeleted).toBe(true);
  });

  it("coerces deletedOnly from a query-string boolean (T11 trash list gap)", () => {
    expect(itemListQuerySchema.parse({}).deletedOnly).toBeUndefined();
    expect(itemListQuerySchema.parse({ deletedOnly: "true" }).deletedOnly).toBe(true);
    expect(itemListQuerySchema.parse({ deletedOnly: "false" }).deletedOnly).toBe(false);
  });

  it("rejects a limit above 100 or below 1", () => {
    expect(itemListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(itemListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
