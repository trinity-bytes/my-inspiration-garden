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
