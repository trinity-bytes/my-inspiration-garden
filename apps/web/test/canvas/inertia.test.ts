import { describe, expect, it } from "vitest";
import { approach, approachVec2 } from "../../src/canvas/inertia";

describe("approach", () => {
  it("moves current toward target", () => {
    const result = approach(0, 100, 1 / 30, 6);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });

  it("does not overshoot the target in a single step", () => {
    const result = approach(0, 100, 1 / 30, 6);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("stays at the target once reached", () => {
    expect(approach(100, 100, 1 / 30, 6)).toBe(100);
  });

  it("converges closer to the target with a larger dt", () => {
    const near = approach(0, 100, 1 / 60, 6);
    const far = approach(0, 100, 1 / 10, 6);
    expect(far).toBeGreaterThan(near);
  });

  it("is frame-rate independent: 30fps and 120fps converge to the same trajectory within tolerance", () => {
    const target = 100;
    const k = 6;
    const totalSeconds = 1;

    let value30 = 0;
    const dt30 = 1 / 30;
    for (let t = 0; t < totalSeconds; t += dt30) {
      value30 = approach(value30, target, dt30, k);
    }

    let value120 = 0;
    const dt120 = 1 / 120;
    for (let t = 0; t < totalSeconds; t += dt120) {
      value120 = approach(value120, target, dt120, k);
    }

    expect(Math.abs(value30 - value120)).toBeLessThan(0.5);
  });
});

describe("approachVec2", () => {
  it("applies approach componentwise", () => {
    const result = approachVec2({ x: 0, y: 0 }, { x: 100, y: -50 }, 1 / 30, 6);
    expect(result.x).toBeCloseTo(approach(0, 100, 1 / 30, 6), 10);
    expect(result.y).toBeCloseTo(approach(0, -50, 1 / 30, 6), 10);
  });
});
