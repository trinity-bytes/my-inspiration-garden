import { describe, expect, it } from "vitest";
import { decayVelocity, releaseVelocity } from "../../src/canvas/drag";

describe("releaseVelocity", () => {
  it("is zero with fewer than two samples", () => {
    expect(releaseVelocity([])).toEqual({ x: 0, y: 0 });
    expect(releaseVelocity([{ x: 1, y: 1, t: 0 }])).toEqual({ x: 0, y: 0 });
  });

  it("is zero when the last two samples share a timestamp", () => {
    const v = releaseVelocity([
      { x: 0, y: 0, t: 1 },
      { x: 10, y: 0, t: 1 },
    ]);
    expect(v).toEqual({ x: 0, y: 0 });
  });

  it("computes velocity from the last two samples", () => {
    const v = releaseVelocity([
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 0.5 },
      { x: 120, y: -20, t: 1 },
    ]);
    expect(v.x).toBeCloseTo(40, 5);
    expect(v.y).toBeCloseTo(-40, 5);
  });
});

describe("decayVelocity", () => {
  it("reduces magnitude over time", () => {
    const v0 = { x: 100, y: 0 };
    const v1 = decayVelocity(v0, 1 / 30, 0.35);
    expect(Math.abs(v1.x)).toBeLessThan(100);
  });

  it("halves magnitude after one half-life (stepped)", () => {
    let v = { x: 100, y: 0 };
    const halfLife = 0.35;
    const dt = 1 / 120;
    let elapsed = 0;
    while (elapsed < halfLife) {
      v = decayVelocity(v, dt, halfLife);
      elapsed += dt;
    }
    expect(v.x).toBeCloseTo(50, 0);
  });

  it("is zero for a non-positive half-life", () => {
    expect(decayVelocity({ x: 10, y: 10 }, 1 / 30, 0)).toEqual({ x: 0, y: 0 });
  });

  it("preserves direction", () => {
    const v = decayVelocity({ x: -30, y: 40 }, 1 / 30, 0.35);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
  });

  it("never grows in magnitude", () => {
    const v0 = { x: 60, y: -80 };
    const v1 = decayVelocity(v0, 1 / 30, 0.35);
    expect(Math.hypot(v1.x, v1.y)).toBeLessThanOrEqual(Math.hypot(v0.x, v0.y));
  });
});
