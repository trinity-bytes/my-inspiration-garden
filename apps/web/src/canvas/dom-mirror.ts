import type { CardInstance } from "./item-layout";

/** Cap on how many cards the parallel DOM/ARIA layer mirrors at once, so the accessibility tree stays small even when many cards are technically in the render margin. */
export const DEFAULT_DOM_MIRROR_MAX_ENTRIES = 60;

/**
 * Picks and orders the currently-visible cards the parallel DOM/ARIA layer
 * (see `components/CanvasHost/CanvasHost.tsx`) exposes as focusable buttons:
 * stable reading order (top-to-bottom, then left-to-right) so Tab order is
 * predictable regardless of the pooled render order, capped so the
 * accessibility tree never grows unbounded. Pure: does not mutate its input.
 */
export function selectDomMirrorCards(
  cards: readonly CardInstance[],
  maxEntries: number = DEFAULT_DOM_MIRROR_MAX_ENTRIES,
): CardInstance[] {
  return [...cards]
    .sort((a, b) => a.worldRect.y - b.worldRect.y || a.worldRect.x - b.worldRect.x)
    .slice(0, maxEntries);
}
