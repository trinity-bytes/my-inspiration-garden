import { describe, expect, it } from "vitest";
import {
  clamp,
  DEAD_ZONE_MAX_PX,
  DEAD_ZONE_MIN_PX,
  deadZoneDiameter,
  deadZoneRadius,
} from "../../src/canvas/deadzone";

describe("clamp", () => {
  it("passes values through unchanged inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps below the minimum", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps above the maximum", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("deadZoneDiameter", () => {
  it("is ~99px at a typical desktop viewport (1440x900)", () => {
    expect(deadZoneDiameter(1440, 900)).toBeCloseTo(99, 5);
  });

  it("clamps to the minimum on a small viewport (formula gives 42.9 < 72), ~72px at 390x844", () => {
    expect(deadZoneDiameter(390, 844)).toBe(DEAD_ZONE_MIN_PX);
    expect(deadZoneDiameter(390, 844)).toBeCloseTo(72, 5);
  });

  it("clamps to the maximum on a very large viewport", () => {
    expect(deadZoneDiameter(2000, 2000)).toBe(DEAD_ZONE_MAX_PX);
  });

  it("uses the unclamped formula (0.11 * min(vw, vh)) in the middle range", () => {
    expect(deadZoneDiameter(1000, 1000)).toBeCloseTo(110, 5);
  });

  it("uses the smaller of width/height", () => {
    expect(deadZoneDiameter(1000, 2000)).toBe(deadZoneDiameter(1000, 1000));
  });

  it("never exceeds the documented bounds", () => {
    for (const size of [100, 500, 1000, 1500, 3000, 5000]) {
      const diameter = deadZoneDiameter(size, size);
      expect(diameter).toBeGreaterThanOrEqual(DEAD_ZONE_MIN_PX);
      expect(diameter).toBeLessThanOrEqual(DEAD_ZONE_MAX_PX);
    }
  });
});

describe("deadZoneRadius", () => {
  it("is half the diameter", () => {
    expect(deadZoneRadius(1000, 1000)).toBeCloseTo(deadZoneDiameter(1000, 1000) / 2, 5);
  });
});
