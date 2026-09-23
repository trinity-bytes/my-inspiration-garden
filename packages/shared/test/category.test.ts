import { describe, expect, it } from "vitest";
import { createCategoryInputSchema, updateCategoryInputSchema } from "../src/category";

describe("createCategoryInputSchema", () => {
  it("requires a name", () => {
    expect(createCategoryInputSchema.safeParse({}).success).toBe(false);
    expect(createCategoryInputSchema.safeParse({ name: "Nature" }).success).toBe(true);
  });

  it("allows an explicit null parentId for root categories", () => {
    const result = createCategoryInputSchema.safeParse({ name: "Nature", parentId: null });
    expect(result.success).toBe(true);
  });
});

describe("updateCategoryInputSchema", () => {
  it("allows partial updates", () => {
    expect(updateCategoryInputSchema.safeParse({ position: 3 }).success).toBe(true);
  });
});
