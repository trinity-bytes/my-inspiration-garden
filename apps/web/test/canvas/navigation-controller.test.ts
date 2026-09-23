import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NavigationController } from "../../src/canvas/navigation-controller";

function makeContainer(): HTMLDivElement {
  const el = document.createElement("div");
  el.tabIndex = 0;
  document.body.appendChild(el);
  return el;
}

function dispatchPointerMove(
  target: EventTarget,
  clientX: number,
  clientY: number,
  pointerType = "mouse",
) {
  target.dispatchEvent(
    new PointerEvent("pointermove", {
      clientX,
      clientY,
      pointerType,
      pointerId: 1,
      bubbles: true,
    }),
  );
}

describe("NavigationController", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it("starts at a zero world offset", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
    });

    expect(controller.getWorldOffset()).toEqual({ x: 0, y: 0 });
    controller.dispose();
  });

  it("drifts toward the pointer direction outside the dead zone", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
      smoothingK: 10,
    });
    controller.mount();

    dispatchPointerMove(window, 700, 500); // right of center (center = 500,500)

    for (let i = 0; i < 60; i++) {
      controller.update(1 / 60);
    }

    const offset = controller.getWorldOffset();
    expect(offset.x).toBeGreaterThan(0);
    expect(Math.abs(offset.y)).toBeLessThan(1);

    controller.dispose();
  });

  it("does not drift while the pointer sits inside the dead zone", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
    });
    controller.mount();

    dispatchPointerMove(window, 510, 500);

    for (let i = 0; i < 30; i++) {
      controller.update(1 / 60);
    }

    const offset = controller.getWorldOffset();
    expect(offset.x).toBeCloseTo(0, 5);
    expect(offset.y).toBeCloseTo(0, 5);

    controller.dispose();
  });

  it("stops drifting once the pointer leaves the window", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
    });
    controller.mount();

    dispatchPointerMove(window, 900, 500);
    controller.update(1 / 60);
    const velocityBefore = controller.getVelocity();
    expect(Math.hypot(velocityBefore.x, velocityBefore.y)).toBeGreaterThan(0);

    document.dispatchEvent(
      new PointerEvent("pointerout", {
        clientX: 900,
        clientY: 500,
        relatedTarget: null,
        bubbles: true,
      }),
    );

    for (let i = 0; i < 120; i++) {
      controller.update(1 / 60);
    }

    const velocityAfter = controller.getVelocity();
    expect(Math.hypot(velocityAfter.x, velocityAfter.y)).toBeCloseTo(0, 1);

    controller.dispose();
  });

  it("disables cursor drift for touch pointers, drag only", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
    });
    controller.mount();

    dispatchPointerMove(window, 900, 500, "touch");

    for (let i = 0; i < 60; i++) {
      controller.update(1 / 60);
    }

    const offset = controller.getWorldOffset();
    expect(offset.x).toBeCloseTo(0, 5);
    expect(offset.y).toBeCloseTo(0, 5);

    controller.dispose();
  });

  it("pans 1:1 while dragging and suspends drift", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
    });
    controller.mount();
    container.setPointerCapture = () => {};
    container.releasePointerCapture = () => {};

    container.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 500,
        clientY: 500,
        pointerId: 1,
        pointerType: "mouse",
        bubbles: true,
      }),
    );
    container.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 460,
        clientY: 500,
        pointerId: 1,
        pointerType: "mouse",
        bubbles: true,
      }),
    );

    const offset = controller.getWorldOffset();
    expect(offset.x).toBeCloseTo(-40, 5);
    expect(offset.y).toBeCloseTo(0, 5);

    controller.dispose();
  });

  it("keeps release velocity and decays it after a drag ends", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      dragDecayHalfLife: 0.3,
    });
    controller.mount();
    container.setPointerCapture = () => {};
    container.releasePointerCapture = () => {};

    let t = 0;
    const down = new PointerEvent("pointerdown", {
      clientX: 500,
      clientY: 500,
      pointerId: 1,
      pointerType: "mouse",
      bubbles: true,
    });
    Object.defineProperty(down, "timeStamp", { value: t });
    container.dispatchEvent(down);

    for (const dx of [20, 40, 60, 80]) {
      t += 16;
      const move = new PointerEvent("pointermove", {
        clientX: 500 + dx,
        clientY: 500,
        pointerId: 1,
        pointerType: "mouse",
        bubbles: true,
      });
      Object.defineProperty(move, "timeStamp", { value: t });
      container.dispatchEvent(move);
    }

    t += 16;
    const up = new PointerEvent("pointerup", {
      clientX: 580,
      clientY: 500,
      pointerId: 1,
      pointerType: "mouse",
      bubbles: true,
    });
    Object.defineProperty(up, "timeStamp", { value: t });
    container.dispatchEvent(up);

    const offsetAtRelease = controller.getWorldOffset().x;
    controller.update(1 / 60);
    const offsetAfterOneFrame = controller.getWorldOffset().x;
    expect(offsetAfterOneFrame).toBeGreaterThan(offsetAtRelease);

    for (let i = 0; i < 400; i++) {
      controller.update(1 / 60);
    }
    const velocityAfter = controller.getVelocity();
    expect(Math.hypot(velocityAfter.x, velocityAfter.y)).toBeCloseTo(0, 1);

    controller.dispose();
  });

  it("pans with arrow keys while the container is focused", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      keyboardSpeed: 120,
    });
    controller.mount();
    container.focus();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    for (let i = 0; i < 30; i++) {
      controller.update(1 / 60);
    }

    expect(controller.getWorldOffset().x).toBeGreaterThan(0);

    controller.dispose();
  });

  it("ignores keyboard input when the container is not focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      keyboardSpeed: 120,
    });
    controller.mount();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    for (let i = 0; i < 30; i++) {
      controller.update(1 / 60);
    }

    expect(controller.getWorldOffset().x).toBe(0);

    controller.dispose();
    input.remove();
  });

  it("suppresses auto drift and glide under reduced motion but keeps drag and keyboard direct input", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
      reducedMotion: true,
    });
    controller.mount();

    dispatchPointerMove(window, 900, 500);
    for (let i = 0; i < 30; i++) {
      controller.update(1 / 60);
    }
    expect(controller.getWorldOffset().x).toBeCloseTo(0, 5);

    controller.dispose();
  });

  it("reacts to setReducedMotion at runtime", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
      smoothingK: 10,
    });
    controller.mount();
    controller.setReducedMotion(true);

    dispatchPointerMove(window, 900, 500);
    for (let i = 0; i < 30; i++) {
      controller.update(1 / 60);
    }
    expect(controller.getWorldOffset().x).toBeCloseTo(0, 5);

    controller.dispose();
  });

  it("clamps large dt gaps so a tab switch does not teleport", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
    });
    controller.mount();

    dispatchPointerMove(window, 900, 500);
    controller.update(5); // huge gap, e.g. after being backgrounded

    const offset = controller.getWorldOffset();
    expect(Math.abs(offset.x)).toBeLessThan(300 * (1 / 30) + 1);

    controller.dispose();
  });

  it("dispose stops further updates from moving the offset via listeners", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
    });
    controller.mount();
    dispatchPointerMove(window, 900, 500);
    controller.dispose();

    const before = controller.getWorldOffset();
    dispatchPointerMove(window, 100, 500);
    controller.update(1 / 60);
    const after = controller.getWorldOffset();

    expect(after).toEqual(before);
  });
});
