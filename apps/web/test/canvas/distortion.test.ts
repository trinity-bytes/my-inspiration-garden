import { describe, expect, it } from "vitest";
import { barrelForward, barrelInverse, DEFAULT_BARREL_K } from "../../src/canvas/distortion";

describe("barrelForward", () => {
  it("leaves the center unchanged", () => {
    expect(barrelForward({ x: 0, y: 0 }, DEFAULT_BARREL_K)).toEqual({ x: 0, y: 0 });
  });

  it("is a no-op when k=0", () => {
    const p = { x: 0.4, y: -0.3 };
    expect(barrelForward(p, 0)).toEqual(p);
  });

  it("pushes points outward for a positive k (pincushion away from center)", () => {
    const p = { x: 0.5, y: 0 };
    const out = barrelForward(p, 0.2);
    expect(out.x).toBeGreaterThan(p.x);
  });

  it("scales the point radially, preserving direction", () => {
    const p = { x: 0.3, y: 0.4 };
    const out = barrelForward(p, 0.1);
    const originalAngle = Math.atan2(p.y, p.x);
    const outAngle = Math.atan2(out.y, out.x);
    expect(outAngle).toBeCloseTo(originalAngle, 10);
  });
});

describe("barrelInverse", () => {
  it("is the identity at the center", () => {
    expect(barrelInverse({ x: 0, y: 0 }, DEFAULT_BARREL_K)).toEqual({ x: 0, y: 0 });
  });

  it("is a no-op when k=0", () => {
    const p = { x: 0.4, y: -0.3 };
    expect(barrelInverse(p, 0)).toEqual(p);
  });

  it("undoes barrelForward within tolerance across the unit disc", () => {
    const k = DEFAULT_BARREL_K;
    const points = [
      { x: 0.1, y: 0 },
      { x: -0.2, y: 0.15 },
      { x: 0.35, y: -0.4 },
      { x: -0.6, y: -0.6 },
      { x: 0.05, y: 0.9 },
      { x: 0.99, y: 0 },
    ];
    for (const p of points) {
      const distorted = barrelForward(p, k);
      const recovered = barrelInverse(distorted, k);
      expect(recovered.x).toBeCloseTo(p.x, 5);
      expect(recovered.y).toBeCloseTo(p.y, 5);
    }
  });

  it("undoes barrelForward for a larger, more visible k", () => {
    const k = 0.3;
    const p = { x: 0.5, y: -0.35 };
    const recovered = barrelInverse(barrelForward(p, k), k);
    expect(recovered.x).toBeCloseTo(p.x, 4);
    expect(recovered.y).toBeCloseTo(p.y, 4);
  });

  it("forward(inverse(p)) also round-trips", () => {
    const k = DEFAULT_BARREL_K;
    const p = { x: 0.4, y: 0.2 };
    const roundTrip = barrelForward(barrelInverse(p, k), k);
    expect(roundTrip.x).toBeCloseTo(p.x, 5);
    expect(roundTrip.y).toBeCloseTo(p.y, 5);
  });
});
