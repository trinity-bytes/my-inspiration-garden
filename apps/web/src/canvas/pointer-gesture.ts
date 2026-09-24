import { CLICK_DRAG_THRESHOLD_PX, isClick } from "./click-vs-drag";
import type { Vec2 } from "./types";

/**
 * Pure pointer gesture state machine backing `engine.ts`'s pointer
 * handlers: tracks whether a button is currently held (hover feedback is
 * suppressed while it is — mid-pan/about-to-click is noisy, see
 * `isPointerGesturePressed`) and decides click-vs-drag on release (see
 * `pointerGestureUp`).
 *
 * This module has no "release happened outside the canvas" special case of
 * its own — it only guarantees that whichever transition arrives
 * (`pointerGestureUp` or `pointerGestureReset`), the state always ends up
 * idle. Making sure one of those transitions actually FIRES even when the
 * pointer is released off-canvas is `engine.ts`'s job (Pointer Capture on
 * `pointerdown`, so `pointerup`/`pointercancel`/`lostpointercapture` keep
 * targeting the canvas no matter where the pointer physically is).
 */
export interface PointerGestureState {
  /** Container-relative position at `pointerGestureDown`, or `null` when no button is held. */
  readonly downPos: Vec2 | null;
}

export const IDLE_POINTER_GESTURE: PointerGestureState = { downPos: null };

/** True while a button is held — `engine.ts`'s `pointermove` handler uses this to suppress hover feedback mid-gesture. */
export function isPointerGesturePressed(state: PointerGestureState): boolean {
  return state.downPos !== null;
}

/** pointerdown: begins tracking a potential click/drag from `pos`. */
export function pointerGestureDown(pos: Vec2): PointerGestureState {
  return { downPos: pos };
}

export interface PointerGestureUpResult {
  state: PointerGestureState;
  /** True if this was a click (barely moved) rather than a drag — see `click-vs-drag.ts`. Always false if no gesture was in progress (an up with no matching down, e.g. after a reset already cleared it). */
  isClick: boolean;
}

/** pointerup: ends tracking, deciding click vs. drag by straight-line distance from the `pointerGestureDown` position to `pos`. */
export function pointerGestureUp(
  state: PointerGestureState,
  pos: Vec2,
  thresholdPx: number = CLICK_DRAG_THRESHOLD_PX,
): PointerGestureUpResult {
  const wasClick = state.downPos !== null && isClick(state.downPos, pos, thresholdPx);
  return { state: IDLE_POINTER_GESTURE, isClick: wasClick };
}

/** pointercancel / lostpointercapture / any other release path: always clears tracking without counting as a click. */
export function pointerGestureReset(): PointerGestureState {
  return IDLE_POINTER_GESTURE;
}
