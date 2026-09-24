import { describe, expect, it } from "vitest";
import { centerOffsetFor, screenToWorld, worldToScreen } from "../../src/canvas/coords";

describe("worldToScreen / screenToWorld", () => {
  it("round-trips: screenToWorld(worldToScreen(p)) === p, for any offset and parallax", () => {
    const cases = [
      { world: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, parallax: 1 },
      { world: { x: 120, y: -80 }, offset: { x: 50, y: 30 }, parallax: 1 },
      { world: { x: -400, y: 250 }, offset: { x: -200, y: 700 }, parallax: 0.35 },
      { world: { x: 10, y: 10 }, offset: { x: 0, y: 0 }, parallax: 0.05 },
    ];
    for (const { world, offset, parallax } of cases) {
      const screen = worldToScreen(world, offset, parallax);
      const roundTripped = screenToWorld(screen, offset, parallax);
      expect(roundTripped.x).toBeCloseTo(world.x, 8);
      expect(roundTripped.y).toBeCloseTo(world.y, 8);
    }
  });

  it("also round-trips the other way: worldToScreen(screenToWorld(p)) === p", () => {
    const screen = { x: 300, y: -150 };
    const offset = { x: 42, y: -17 };
    const parallax = 0.65;
    const world = screenToWorld(screen, offset, parallax);
    const roundTripped = worldToScreen(world, offset, parallax);
    expect(roundTripped.x).toBeCloseTo(screen.x, 8);
    expect(roundTripped.y).toBeCloseTo(screen.y, 8);
  });

  it("invariant (i) — drag: a world-fixed point's screen position shifts by exactly the offset delta at parallax=1 (both axes, sign included)", () => {
    const world = { x: 100, y: 50 };
    const offsetBefore = { x: 0, y: 0 };
    // Simulates NavigationController's actual drag delta accumulation
    // (worldOffset = dragStart + (pointerNow - pointerAtDragStart)),
    // unchanged by this correction round.
    const dragDelta = { x: 20, y: -30 };
    const offsetAfter = { x: offsetBefore.x + dragDelta.x, y: offsetBefore.y + dragDelta.y };

    const screenBefore = worldToScreen(world, offsetBefore, 1);
    const screenAfter = worldToScreen(world, offsetAfter, 1);

    expect(screenAfter.x - screenBefore.x).toBeCloseTo(dragDelta.x, 10);
    expect(screenAfter.y - screenBefore.y).toBeCloseTo(dragDelta.y, 10);
  });

  it("invariant (i) — the shift scales by parallax for a non-1:1 layer", () => {
    const world = { x: 0, y: 0 };
    const dragDelta = { x: 40, y: 40 };
    const parallax = 0.5;
    const screenBefore = worldToScreen(world, { x: 0, y: 0 }, parallax);
    const screenAfter = worldToScreen(world, dragDelta, parallax);
    expect(screenAfter.x - screenBefore.x).toBeCloseTo(dragDelta.x * parallax, 10);
    expect(screenAfter.y - screenBefore.y).toBeCloseTo(dragDelta.y * parallax, 10);
  });

  it("invariant (iv) — worldToScreen and screenToWorld are exact inverses with parallax != 1", () => {
    const p = { x: 77, y: -233 };
    const offset = { x: 12, y: -5 };
    const parallax = 0.12;
    expect(screenToWorld(worldToScreen(p, offset, parallax), offset, parallax)).toEqual(p);
  });

  it("a zero offset is the identity in both directions", () => {
    const p = { x: 5, y: -5 };
    expect(worldToScreen(p, { x: 0, y: 0 }, 1)).toEqual(p);
    expect(screenToWorld(p, { x: 0, y: 0 }, 1)).toEqual(p);
  });
});

describe("centerOffsetFor", () => {
  it("produces the offset that puts worldPoint at the screen center (parallax 1)", () => {
    const worldPoint = { x: 250, y: -120 };
    const offset = centerOffsetFor(worldPoint, 1);
    expect(screenToWorld({ x: 0, y: 0 }, offset, 1)).toEqual(worldPoint);
  });

  it("scales with parallax for a non-1:1 layer", () => {
    const worldPoint = { x: 100, y: 100 };
    const parallax = 0.5;
    const offset = centerOffsetFor(worldPoint, parallax);
    const recovered = screenToWorld({ x: 0, y: 0 }, offset, parallax);
    expect(recovered.x).toBeCloseTo(worldPoint.x, 8);
    expect(recovered.y).toBeCloseTo(worldPoint.y, 8);
  });

  it("the origin centers on itself with a zero offset", () => {
    expect(centerOffsetFor({ x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
  });
});
