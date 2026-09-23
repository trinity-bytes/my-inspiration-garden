import { describe, expect, it } from "vitest";
import { cloudScreenRect, rectOverlapsViewport } from "../../src/canvas/cloud-screen-rect";

describe("cloudScreenRect", () => {
  it("places the rect's center at the world position when worldOffset is zero", () => {
    const rect = cloudScreenRect({ x: 120, y: -40 }, 200, 100, { x: 0, y: 0 }, 0.5);
    expect(rect.center).toEqual({ x: 120, y: -40 });
    expect(rect.halfWidth).toBe(100);
    expect(rect.halfHeight).toBe(50);
  });

  it("shifts the center by worldOffset*parallax (matches coords.ts's worldToScreen)", () => {
    const rect = cloudScreenRect({ x: 0, y: 0 }, 100, 100, { x: 40, y: -20 }, 0.5);
    expect(rect.center).toEqual({ x: 20, y: -10 });
  });
});

describe("rectOverlapsViewport", () => {
  const viewportWidth = 1440;
  const viewportHeight = 900;

  it("is true when the rect is centered in the viewport", () => {
    const rect = { center: { x: 0, y: 0 }, halfWidth: 100, halfHeight: 100 };
    expect(rectOverlapsViewport(rect, viewportWidth, viewportHeight)).toBe(true);
  });

  it("is true when the rect only partially overlaps at an edge", () => {
    const rect = { center: { x: 700, y: 0 }, halfWidth: 50, halfHeight: 50 }; // spans 650..750, viewport right edge is 720
    expect(rectOverlapsViewport(rect, viewportWidth, viewportHeight)).toBe(true);
  });

  it("is false when the rect is entirely outside the viewport (both axes far off)", () => {
    const rect = { center: { x: 2000, y: 2000 }, halfWidth: 50, halfHeight: 50 };
    expect(rectOverlapsViewport(rect, viewportWidth, viewportHeight)).toBe(false);
  });

  it("is false when only the x axis is off-screen (large cell size pushes it past the right edge)", () => {
    // center 1355 with halfWidth 100 -> spans 1255..1455, viewport right edge is 720
    const rect = { center: { x: 1355, y: 0 }, halfWidth: 100, halfHeight: 100 };
    expect(rectOverlapsViewport(rect, viewportWidth, viewportHeight)).toBe(false);
  });

  it("treats exact-boundary touching as overlapping", () => {
    const rect = { center: { x: 720 + 50, y: 0 }, halfWidth: 50, halfHeight: 50 }; // left edge exactly at 720
    expect(rectOverlapsViewport(rect, viewportWidth, viewportHeight)).toBe(true);
  });
});
