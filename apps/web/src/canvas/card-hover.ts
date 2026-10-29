import type { Vec2 } from "./types";

/**
 * Pure hover → visual decision for a card (see `layers/cards.ts`): a
 * hovered card lifts slightly (uniform scale bump on its mesh) and gets a
 * subtle highlight tint (mixed in by `shaders/card.ts`'s `u_highlight`).
 */
export interface CardHoverStyle {
  scale: number;
  highlight: number;
}

const HOVER_SCALE = 1.035;

export function cardHoverStyle(isHovered: boolean): CardHoverStyle {
  return isHovered ? { scale: HOVER_SCALE, highlight: 1 } : { scale: 1, highlight: 0 };
}

/**
 * Pan speed (world px/s) at and above which hover feedback is hidden. While the canvas sweeps
 * fast, cards cross the cursor in a few frames each; lifting and tinting every one of them reads
 * as a stutter instead of feedback (owner feedback, 2026-10-29). Below this speed the user can
 * still aim at a card while drifting slowly.
 */
export const HOVER_MAX_PAN_SPEED = 240;

/** The card key to render as hovered: the hit-tested `hoveredKey`, or `null` while panning fast. */
export function visibleHoverKey(hoveredKey: string | null, panVelocity: Vec2): string | null {
  if (hoveredKey === null) {
    return null;
  }
  return Math.hypot(panVelocity.x, panVelocity.y) < HOVER_MAX_PAN_SPEED ? hoveredKey : null;
}
