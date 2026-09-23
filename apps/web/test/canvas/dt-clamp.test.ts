import { describe, expect, it } from "vitest";
import { clampDt, MAX_DT_SECONDS } from "../../src/canvas/dt-clamp";

describe("clampDt", () => {
  it("passes normal frame deltas through unchanged", () => {
    expect(clampDt(1 / 60)).toBeCloseTo(1 / 60, 10);
  });

  it("clamps large gaps (e.g. after a tab switch) to the maximum", () => {
    expect(clampDt(5)).toBe(MAX_DT_SECONDS);
  });

  it("clamps negative values to zero", () => {
    expect(clampDt(-1)).toBe(0);
  });

  it("clamps NaN and non-finite values to zero", () => {
    expect(clampDt(Number.NaN)).toBe(0);
    expect(clampDt(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
