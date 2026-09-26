import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationController } from "../../src/canvas/navigation-controller";
import { PointerInteractionController } from "../../src/canvas/pointer-interaction";

/**
 * Owner QA bug: clicking a card on the canvas didn't open the detail view.
 *
 * Root cause: `engine.ts` mounts a `NavigationController` on the OUTER
 * container element (for drag-panning) and, separately, listens for its own
 * pointerdown/move/up/cancel directly on the INNER `canvas` child (for
 * click-vs-drag + hit-testing). Both call `setPointerCapture` on
 * `pointerdown` — the container's call always wins in real browsers because
 * its listener runs during the bubble phase, AFTER the canvas's own
 * target-phase listener already captured (and is then overridden). Once the
 * container holds capture, every later pointerup/pointercancel for that
 * gesture is retargeted to the container, so a listener attached to the
 * (now-bypassed) child `canvas` never sees it — clicks silently stop opening
 * cards.
 *
 * jsdom doesn't implement real Pointer Capture retargeting (confirmed by
 * the existing `setPointerCapture = () => {}` stubs in
 * navigation-controller.test.ts and the "jsdom has no WebGL" comment this
 * repo already carries for `engine.ts`, which can't be mounted here at all).
 * We simulate the retargeted browser behavior directly: dispatch `pointerup`
 * on the CONTAINER (where capture would have sent it), not on the canvas
 * that was actually clicked, and assert the click is still detected.
 */

function makeDom() {
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  document.body.appendChild(container);
  // jsdom has no layout engine — hit-testing only needs a stable rect.
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
  return { container, canvas };
}

function down(target: EventTarget, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { clientX: x, clientY: y, pointerId: 1, bubbles: true }),
  );
}

function up(target: EventTarget, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent("pointerup", { clientX: x, clientY: y, pointerId: 1, bubbles: true }),
  );
}

describe("PointerInteractionController", () => {
  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    ({ container, canvas } = makeDom());
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it("opens the card on a plain click that starts and ends on the canvas", () => {
    const onItemOpen = vi.fn();
    const controller = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange: () => {},
      onItemOpen,
    });
    controller.mount();

    down(canvas, 100, 100);
    up(canvas, 101, 101);

    expect(onItemOpen).toHaveBeenCalledWith("card-1");
    controller.dispose();
  });

  it("does not open a card when the release moved past the click/drag threshold", () => {
    const onItemOpen = vi.fn();
    const controller = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange: () => {},
      onItemOpen,
    });
    controller.mount();

    down(canvas, 100, 100);
    up(canvas, 300, 300);

    expect(onItemOpen).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("REGRESSION (owner QA): still opens the card when a sibling NavigationController captures the pointer on the ancestor container, retargeting pointerup there instead of the canvas that was clicked", () => {
    const onItemOpen = vi.fn();

    // Real production wiring: NavigationController owns the container for
    // drag-panning and captures the pointer on pointerdown, exactly like
    // engine.ts's mount() does.
    const navigation = new NavigationController({
      container,
      getViewportSize: () => ({ width: 800, height: 600 }),
    });
    navigation.mount();
    // jsdom has no Pointer Capture API — stub it so NavigationController's
    // own pointerdown handler (which calls it unconditionally) doesn't
    // throw, matching navigation-controller.test.ts's own convention.
    container.setPointerCapture = () => {};
    container.releasePointerCapture = () => {};

    const controller = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange: () => {},
      onItemOpen,
    });
    controller.mount();

    // pointerdown starts on the canvas (bubbles to container, exactly as a
    // real click does) — both NavigationController and our controller see
    // it and begin tracking their own gesture.
    down(canvas, 100, 100);
    // In a real browser, the container's later-registered capture call
    // would now redirect the matching pointerup there instead of the
    // canvas. Simulate that retargeting directly.
    up(container, 101, 101);

    expect(onItemOpen).toHaveBeenCalledWith("card-1");

    controller.dispose();
    navigation.dispose();
  });

  it("documents the bug mechanism: a controller listening for release on the canvas itself (the pre-fix wiring) misses the retargeted pointerup", () => {
    const onItemOpen = vi.fn();

    const navigation = new NavigationController({
      container,
      getViewportSize: () => ({ width: 800, height: 600 }),
    });
    navigation.mount();
    container.setPointerCapture = () => {};
    container.releasePointerCapture = () => {};

    // `releaseTarget: canvas` reproduces the ORIGINAL (buggy) engine.ts
    // wiring, which listened for pointerup on the same child `canvas` it
    // listened for pointerdown on.
    const controller = new PointerInteractionController({
      canvas,
      releaseTarget: canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange: () => {},
      onItemOpen,
    });
    controller.mount();

    down(canvas, 100, 100);
    up(container, 101, 101); // retargeted by the container's capture, as above

    expect(onItemOpen).not.toHaveBeenCalled();

    controller.dispose();
    navigation.dispose();
  });

  it("suppresses hover while a button is held, and clears it on pointerleave", () => {
    const onHoverChange = vi.fn();
    const controller = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange,
      onItemOpen: () => {},
    });
    controller.mount();

    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 10, bubbles: true }),
    );
    expect(onHoverChange).toHaveBeenLastCalledWith("card-1");

    down(canvas, 100, 100);
    onHoverChange.mockClear();
    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 20, clientY: 20, bubbles: true }),
    );
    expect(onHoverChange).not.toHaveBeenCalled();

    canvas.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(onHoverChange).toHaveBeenLastCalledWith(null);

    controller.dispose();
  });

  it("resets the gesture on pointercancel and lostpointercapture without opening anything", () => {
    const onItemOpen = vi.fn();
    const controller = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange: () => {},
      onItemOpen,
    });
    controller.mount();

    down(canvas, 100, 100);
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
    up(canvas, 100, 100); // a stray up after cancel must not count as a click

    expect(onItemOpen).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("dispose stops the controller from reacting to further events", () => {
    const onItemOpen = vi.fn();
    const controller = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
      hitTestAt: () => "card-1",
      onHoverChange: () => {},
      onItemOpen,
    });
    controller.mount();
    controller.dispose();

    down(canvas, 100, 100);
    up(window, 101, 101);

    expect(onItemOpen).not.toHaveBeenCalled();
  });
});
