import { describe, expect, it } from "vitest";
import { clamp01, computeDriftVelocity, smoothstep } from "../../src/canvas/navigation";

describe("clamp01", () => {
  it("clamps to [0, 1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });
});

describe("smoothstep", () => {
  it("is 0 at x=0 and 1 at x=1", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
  });

  it("is monotonically increasing across [0, 1]", () => {
    let previous = -Infinity;
    for (let x = 0; x <= 1; x += 0.05) {
      const value = smoothstep(x);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("clamps outside [0, 1]", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });
});

describe("computeDriftVelocity", () => {
  const base = {
    viewportWidth: 1000,
    viewportHeight: 1000,
    deadZoneRadius: 50,
    maxSpeed: 200,
  };

  it("is zero at the exact center", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 0, pointerY: 0 });
    expect(v).toEqual({ x: 0, y: 0 });
  });

  it("is zero inside the dead zone", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 30, pointerY: 0 });
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("is zero exactly at the dead zone boundary", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 50, pointerY: 0 });
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("reaches ~max speed at the viewport edge along an axis", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 500, pointerY: 0 });
    expect(v.x).toBeCloseTo(200, 1);
    expect(v.y).toBeCloseTo(0, 5);
  });

  it("points in the pointer's direction", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 0, pointerY: -300 });
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeLessThan(0);
  });

  it("grows monotonically with distance from the dead zone to the edge", () => {
    let previousSpeed = -1;
    for (let d = 50; d <= 500; d += 25) {
      const v = computeDriftVelocity({ ...base, pointerX: d, pointerY: 0 });
      const speed = Math.hypot(v.x, v.y);
      expect(speed).toBeGreaterThanOrEqual(previousSpeed - 1e-9);
      previousSpeed = speed;
    }
  });

  it("uses ray-box edge distance so diagonal speed is also bounded by max speed", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 700, pointerY: 700 });
    const speed = Math.hypot(v.x, v.y);
    expect(speed).toBeLessThanOrEqual(200 + 1e-6);
  });

  it("never exceeds max speed even far beyond the edge", () => {
    const v = computeDriftVelocity({ ...base, pointerX: 5000, pointerY: 0 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(200, 1);
  });
});
