import {
  IDLE_POINTER_GESTURE,
  isPointerGesturePressed,
  type PointerGestureState,
  pointerGestureDown,
  pointerGestureReset,
  pointerGestureUp,
} from "./pointer-gesture";
import type { Vec2 } from "./types";

export interface PointerInteractionOptions {
  /** The element pointerdown/pointermove/pointerleave are scoped to — a click gesture only
   * begins when the pointer goes down ON this element (the canvas itself, in `engine.ts`). */
  canvas: HTMLElement;
  /**
   * Where pointerup/pointercancel/lostpointercapture are listened for. Defaults to `window`.
   *
   * `engine.ts` mounts a sibling `NavigationController` on an ANCESTOR of `canvas` (the outer
   * container), which also calls `setPointerCapture` on pointerdown for its own drag panning.
   * Pointer capture is exclusive per pointer id, and the ancestor's capture call always wins in
   * a real browser (its listener runs during the bubble phase, after `canvas`'s own target-phase
   * listener already captured) — every later pointerup/pointercancel for that gesture then
   * retargets to the ancestor instead of `canvas`. A release listener attached directly to
   * `canvas` would never see it, silently breaking click-to-open. `window` is always an ancestor
   * of whichever element ends up holding capture, so it keeps receiving the event regardless —
   * this mirrors `NavigationController`'s own `handleWindowPointerMove`, which listens on
   * `window` for exactly the same reason.
   */
  releaseTarget?: EventTarget;
  pointerFromEvent: (event: PointerEvent) => Vec2;
  hitTestAt: (pos: Vec2) => string | null;
  onHoverChange: (key: string | null) => void;
  /** Fired with the hit card's key on a click (not a drag) that lands on one. */
  onItemOpen: (key: string) => void;
}

/**
 * Owns the click-vs-drag / hover gesture state machine for canvas card interaction (see
 * `pointer-gesture.ts` for the pure decision logic and `hit-test.ts` for the hit-testing math).
 * Extracted out of `engine.ts` so the pointer-capture wiring above is covered by a DOM-only test
 * — `engine.ts` itself can't be exercised under this project's jsdom test environment (WebGL
 * context construction always fails there, so `CanvasEngine.mount()` never gets past its own
 * fallback path in tests).
 */
export class PointerInteractionController {
  private readonly options: PointerInteractionOptions;
  private readonly releaseTarget: EventTarget;
  private gesture: PointerGestureState = IDLE_POINTER_GESTURE;
  private mounted = false;

  constructor(options: PointerInteractionOptions) {
    this.options = options;
    this.releaseTarget = options.releaseTarget ?? window;
  }

  mount(): void {
    if (this.mounted) {
      return;
    }
    this.mounted = true;
    this.options.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.options.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.options.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.releaseTarget.addEventListener("pointerup", this.handlePointerUp as EventListener);
    this.releaseTarget.addEventListener("pointercancel", this.handlePointerCancel as EventListener);
    this.releaseTarget.addEventListener(
      "lostpointercapture",
      this.handlePointerCancel as EventListener,
    );
  }

  dispose(): void {
    if (!this.mounted) {
      return;
    }
    this.mounted = false;
    this.options.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.options.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.options.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.releaseTarget.removeEventListener("pointerup", this.handlePointerUp as EventListener);
    this.releaseTarget.removeEventListener(
      "pointercancel",
      this.handlePointerCancel as EventListener,
    );
    this.releaseTarget.removeEventListener(
      "lostpointercapture",
      this.handlePointerCancel as EventListener,
    );
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.gesture = pointerGestureDown(this.options.pointerFromEvent(event));
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    // A held button means the user is panning (NavigationController's own drag handling) or
    // about to click — hover feedback would just be noisy mid-gesture.
    if (isPointerGesturePressed(this.gesture)) {
      return;
    }
    this.options.onHoverChange(this.options.hitTestAt(this.options.pointerFromEvent(event)));
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pos = this.options.pointerFromEvent(event);
    const { state, isClick } = pointerGestureUp(this.gesture, pos);
    this.gesture = state;
    if (!isClick) {
      return;
    }
    const hitKey = this.options.hitTestAt(pos);
    if (hitKey) {
      this.options.onItemOpen(hitKey);
    }
  };

  private readonly handlePointerCancel = (): void => {
    this.gesture = pointerGestureReset();
  };

  private readonly handlePointerLeave = (): void => {
    this.options.onHoverChange(null);
  };
}
