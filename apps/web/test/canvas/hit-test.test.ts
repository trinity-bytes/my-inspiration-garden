import { describe, expect, it } from "vitest";
import { DEFAULT_BARREL_K, lensScale } from "../../src/canvas/distortion";
import { hitTestCard, pointerToWorld, worldToPointer } from "../../src/canvas/hit-test";

const viewport = { width: 1440, height: 900 };
const k = DEFAULT_BARREL_K;

describe("pointerToWorld / worldToPointer round-trip", () => {
  const cases: Array<{
    pointer: { x: number; y: number };
    viewport: { width: number; height: number };
    offset: { x: number; y: number };
  }> = [
    { pointer: { x: 720, y: 450 }, viewport, offset: { x: 0, y: 0 } },
    { pointer: { x: 100, y: 50 }, viewport, offset: { x: 200, y: -80 } },
    { pointer: { x: 1400, y: 890 }, viewport, offset: { x: -500, y: 300 } },
    {
      pointer: { x: 720, y: 450 },
      viewport: { width: 390, height: 844 },
      offset: { x: 40, y: 40 },
    },
  ];

  it("worldToPointer(pointerToWorld(p)) recovers p", () => {
    for (const { pointer, viewport: vp, offset } of cases) {
      const world = pointerToWorld(pointer, vp, offset, k);
      const recovered = worldToPointer(world, vp, offset, k);
      expect(recovered.x).toBeCloseTo(pointer.x, 3);
      expect(recovered.y).toBeCloseTo(pointer.y, 3);
    }
  });

  it("pointerToWorld(worldToPointer(w)) recovers w", () => {
    const worldPoints = [
      { x: 0, y: 0 },
      { x: 300, y: -150 },
      { x: -800, y: 220 },
    ];
    for (const world of worldPoints) {
      for (const { viewport: vp, offset } of cases) {
        const pointer = worldToPointer(world, vp, offset, k);
        const recovered = pointerToWorld(pointer, vp, offset, k);
        expect(recovered.x).toBeCloseTo(world.x, 3);
        expect(recovered.y).toBeCloseTo(world.y, 3);
      }
    }
  });

  it("the viewport center pointer maps to -worldOffset (undistorted at center)", () => {
    const offset = { x: 120, y: -60 };
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const world = pointerToWorld(center, viewport, offset, k);
    expect(world.x).toBeCloseTo(-offset.x, 5);
    expect(world.y).toBeCloseTo(-offset.y, 5);
  });
});

describe("hitTestCard", () => {
  const offset = { x: 0, y: 0 };

  it("finds the card whose world rect contains the pointer, through the distortion", () => {
    const cardWorld = { x: 200, y: -100 };
    const pointer = worldToPointer(cardWorld, viewport, offset, k);
    const cards = [
      { id: "far-away", worldRect: { x: -900, y: 700, width: 100, height: 100 } },
      { id: "target", worldRect: { x: 200, y: -100, width: 300, height: 200 } },
    ];
    expect(hitTestCard(pointer, viewport, offset, k, cards)).toBe("target");
  });

  it("returns null when the pointer is outside every card", () => {
    const pointer = worldToPointer({ x: 5000, y: 5000 }, viewport, offset, k);
    const cards = [{ id: "only", worldRect: { x: 0, y: 0, width: 100, height: 100 } }];
    expect(hitTestCard(pointer, viewport, offset, k, cards)).toBeNull();
  });

  it("returns the topmost (last) card when rects overlap", () => {
    const pointer = worldToPointer({ x: 0, y: 0 }, viewport, offset, k);
    const cards = [
      { id: "bottom", worldRect: { x: 0, y: 0, width: 200, height: 200 } },
      { id: "top", worldRect: { x: 0, y: 0, width: 200, height: 200 } },
    ];
    expect(hitTestCard(pointer, viewport, offset, k, cards)).toBe("top");
  });

  it("works with a non-zero world offset (panned view)", () => {
    const panned = { x: -400, y: 250 };
    const cardWorld = { x: -400, y: 250 };
    const pointer = worldToPointer(cardWorld, viewport, panned, k);
    const cards = [
      { id: "panned-target", worldRect: { x: -400, y: 250, width: 150, height: 150 } },
    ];
    expect(hitTestCard(pointer, viewport, panned, k, cards)).toBe("panned-target");
  });
});

describe("barrel lens on portrait viewports", () => {
  const phone = { width: 390, height: 844 };

  it("bends the side edges of a phone as much as the top edge of a desktop", () => {
    // How far (as a fraction of the half-extent) the content under an edge midpoint is pulled inward.
    const desktopTopPull =
      1 - Math.abs(pointerToWorld({ x: 720, y: 0 }, viewport, { x: 0, y: 0 }, k).y) / 450;
    const phoneSidePull =
      1 - Math.abs(pointerToWorld({ x: 0, y: 422 }, phone, { x: 0, y: 0 }, k).x) / 195;
    expect(phoneSidePull).toBeCloseTo(desktopTopPull, 6);
  });

  it("leaves landscape viewports unchanged (unit = viewport height)", () => {
    expect(lensScale(viewport)).toEqual({ x: 1440 / 900, y: 1 });
    expect(lensScale(phone)).toEqual({ x: 1, y: 844 / 390 });
  });
});
