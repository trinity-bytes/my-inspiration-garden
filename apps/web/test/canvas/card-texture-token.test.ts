import { describe, expect, it } from "vitest";
import { isStaleLoadCallback } from "../../src/canvas/card-texture-token";

describe("isStaleLoadCallback", () => {
  it("is not stale when the entry's current load token still matches the captured one", () => {
    expect(isStaleLoadCallback(3, 3)).toBe(false);
  });

  it("is stale once the entry has moved on to a newer load token", () => {
    expect(isStaleLoadCallback(4, 3)).toBe(true);
  });

  it("is stale even if the entry's token somehow went backwards (defensive: any mismatch is stale)", () => {
    expect(isStaleLoadCallback(1, 3)).toBe(true);
  });
});
