import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBOARD_SPEED,
  DEFAULT_MAX_SPEED,
  NAVIGATION_BLOCKER_ATTRIBUTE,
  NavigationController,
} from "../../src/canvas/navigation-controller";

describe("navigation speed defaults", () => {
  it("raises the speeds another 1.5x after the first live check (owner feedback 2026-10-04)", () => {
    expect(DEFAULT_MAX_SPEED).toBe(1710);
    expect(DEFAULT_KEYBOARD_SPEED).toBe(1890);
  });
});

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

  it("invariant (ii) — pointer right of center: you travel right, so the world offset moves opposite (content recedes toward where you look)", () => {
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
    // worldOffset feeds coords.ts's worldToScreen(world, offset, parallax) =
    // world + offset*parallax; a negative offset.x here means a world-fixed
    // point's screen x decreases — content moves left — for "pointer right".
    expect(offset.x).toBeLessThan(0);
    expect(Math.abs(offset.y)).toBeLessThan(1);

    controller.dispose();
  });

  it("invariant (ii) — pointer below center: you travel down, so the world offset moves opposite (content moves up on screen)", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
      smoothingK: 10,
    });
    controller.mount();

    dispatchPointerMove(window, 500, 700); // below center

    for (let i = 0; i < 60; i++) {
      controller.update(1 / 60);
    }

    const offset = controller.getWorldOffset();
    expect(offset.y).toBeLessThan(0);
    expect(Math.abs(offset.x)).toBeLessThan(1);

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

  it("stops drifting while the pointer is over a navigation blocker (the navbar) and resumes after leaving it", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
    });
    controller.mount();
    const navbar = document.createElement("header");
    navbar.setAttribute(NAVIGATION_BLOCKER_ATTRIBUTE, "");
    const navbarButton = document.createElement("button");
    navbar.appendChild(navbarButton);
    document.body.appendChild(navbar);

    dispatchPointerMove(window, 500, 0);
    controller.update(1 / 60);
    expect(Math.hypot(...Object.values(controller.getVelocity()))).toBeGreaterThan(0);

    dispatchPointerMove(navbarButton, 500, 0);
    for (let i = 0; i < 120; i++) {
      controller.update(1 / 60);
    }
    expect(Math.hypot(...Object.values(controller.getVelocity()))).toBeCloseTo(0, 1);

    dispatchPointerMove(container, 500, 0);
    controller.update(1 / 60);
    expect(Math.hypot(...Object.values(controller.getVelocity()))).toBeGreaterThan(0);

    navbar.remove();
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

  it("keeps panning 1:1 from the drag origin through a long drag", () => {
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
        clientY: 800,
        pointerId: 1,
        pointerType: "touch",
        bubbles: true,
      }),
    );
    // More moves than the release-velocity sample window keeps.
    for (let step = 1; step <= 12; step += 1) {
      container.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 500,
          clientY: 800 - step * 40,
          pointerId: 1,
          pointerType: "touch",
          bubbles: true,
        }),
      );
      expect(controller.getWorldOffset().y).toBeCloseTo(-step * 40, 5);
    }

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

  it("invariant (iii) — ArrowRight travels right, so the world offset moves opposite, matching drift's sign", () => {
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

    expect(controller.getWorldOffset().x).toBeLessThan(0);

    controller.dispose();
  });

  it("invariant (iii) — ArrowDown/S travels down (world offset decreases, content moves up); ArrowUp/W travels up (offset increases, content moves down)", () => {
    const down = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      keyboardSpeed: 120,
    });
    down.mount();
    container.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    for (let i = 0; i < 30; i++) {
      down.update(1 / 60);
    }
    expect(down.getWorldOffset().y).toBeLessThan(0);
    down.dispose();

    const upContainer = makeContainer();
    const up = new NavigationController({
      container: upContainer,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      keyboardSpeed: 120,
    });
    up.mount();
    upContainer.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }));
    for (let i = 0; i < 30; i++) {
      up.update(1 / 60);
    }
    expect(up.getWorldOffset().y).toBeGreaterThan(0);
    up.dispose();
    upContainer.remove();
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

  // T9 scope B: canvas navigation (drift/keyboard) must pause while the
  // item detail modal is open.
  describe("setPaused (T9 detail modal)", () => {
    it("suppresses cursor drift while paused", () => {
      const controller = new NavigationController({
        container,
        getViewportSize: () => ({ width: 1000, height: 1000 }),
        maxSpeed: 300,
      });
      controller.mount();
      controller.setPaused(true);

      dispatchPointerMove(window, 900, 500);
      for (let i = 0; i < 30; i++) {
        controller.update(1 / 60);
      }
      expect(controller.getWorldOffset().x).toBeCloseTo(0, 5);

      controller.dispose();
    });

    it("suppresses keyboard panning while paused", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      const controller = new NavigationController({
        container,
        getViewportSize: () => ({ width: 1000, height: 1000 }),
        keyboardSpeed: 120,
      });
      controller.mount();
      controller.setPaused(true);
      container.focus();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      for (let i = 0; i < 30; i++) {
        controller.update(1 / 60);
      }

      expect(controller.getWorldOffset().x).toBe(0);

      controller.dispose();
      input.remove();
    });

    it("zeroes any in-flight velocity immediately when paused", () => {
      const controller = new NavigationController({
        container,
        getViewportSize: () => ({ width: 1000, height: 1000 }),
        maxSpeed: 300,
      });
      controller.mount();
      dispatchPointerMove(window, 900, 500);
      controller.update(1 / 60);
      expect(controller.getVelocity().x).not.toBe(0);

      controller.setPaused(true);
      expect(controller.getVelocity()).toEqual({ x: 0, y: 0 });

      controller.dispose();
    });

    it("resumes normal drift once unpaused", () => {
      const controller = new NavigationController({
        container,
        getViewportSize: () => ({ width: 1000, height: 1000 }),
        maxSpeed: 300,
      });
      controller.mount();
      controller.setPaused(true);
      controller.setPaused(false);

      dispatchPointerMove(window, 900, 500);
      for (let i = 0; i < 30; i++) {
        controller.update(1 / 60);
      }
      expect(controller.getWorldOffset().x).not.toBe(0);

      controller.dispose();
    });
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

  it("hands out stable read-only offset and velocity views instead of per-call copies", () => {
    const controller = new NavigationController({
      container,
      getViewportSize: () => ({ width: 1000, height: 1000 }),
      maxSpeed: 300,
    });
    controller.mount();
    const offset = controller.getWorldOffset();
    const velocity = controller.getVelocity();
    dispatchPointerMove(window, 900, 500);
    controller.update(1 / 60);
    expect(controller.getWorldOffset()).toBe(offset);
    expect(controller.getVelocity()).toBe(velocity);
    expect(offset.x).not.toBe(0);
    controller.dispose();
  });
});
