import { type PointerEvent, useRef } from "react";

/** Downward travel, in px, past which a released swipe dismisses the sheet. */
export const SWIPE_DISMISS_DISTANCE_PX = 80;
/** A flick faster than this (px/ms) dismisses even when it traveled less. */
const SWIPE_DISMISS_VELOCITY = 0.5;
/** Movement under this still counts as a tap on the handle. */
const TAP_SLOP_PX = 6;

interface SwipeState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  moved: boolean;
}

/**
 * Drag-to-dismiss for a bottom sheet's grab handle: the sheet follows the
 * finger downward, and on release it either dismisses (far or fast enough) or
 * snaps back. A tap on the handle dismisses too. Spread `handleProps` on the
 * handle (which owns its touch gestures via `touch-action: none` in CSS) and
 * attach `sheetRef` to the element that moves.
 */
export function useSwipeToDismiss<T extends HTMLElement>(onDismiss: () => void) {
  const sheetRef = useRef<T>(null);
  const swipe = useRef<SwipeState | null>(null);
  // A drag that ends over the handle may still fire `click`; it must not also count as a tap.
  const suppressClick = useRef(false);

  function moveSheet(offsetY: number | null): void {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = offsetY === null ? "" : "none";
    sheet.style.translate = offsetY === null ? "" : `0 ${offsetY}px`;
  }

  function onPointerDown(event: PointerEvent<HTMLElement>): void {
    suppressClick.current = false;
    swipe.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>): void {
    const current = swipe.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dt = event.timeStamp - current.lastT;
    if (dt > 0) current.velocity = (event.clientY - current.lastY) / dt;
    current.lastY = event.clientY;
    current.lastT = event.timeStamp;
    const offsetY = Math.max(0, event.clientY - current.startY);
    if (offsetY > TAP_SLOP_PX) current.moved = true;
    if (current.moved) moveSheet(offsetY);
  }

  function onPointerUp(event: PointerEvent<HTMLElement>): void {
    const current = swipe.current;
    if (!current || event.pointerId !== current.pointerId) return;
    swipe.current = null;
    if (!current.moved) return;
    suppressClick.current = true;
    const offsetY = event.clientY - current.startY;
    if (offsetY > SWIPE_DISMISS_DISTANCE_PX || current.velocity > SWIPE_DISMISS_VELOCITY) {
      onDismiss();
      return;
    }
    moveSheet(null);
  }

  function onPointerCancel(): void {
    swipe.current = null;
    moveSheet(null);
  }

  function onClick(): void {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onDismiss();
  }

  return {
    sheetRef,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick },
  };
}
