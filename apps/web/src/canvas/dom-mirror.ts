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

function sameInstances(a: readonly CardInstance[], b: readonly CardInstance[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Per-frame front end for `selectDomMirrorCards`: the visible set is compared
 * element-wise (by instance identity) against last frame's, and only a change
 * pays for the copy/sort/slice. Identity rather than cell key matters: after
 * `setItems` (an edited item) the same cells resolve to new instances whose
 * labels the mirror must pick up.
 */
export class DomMirrorTracker {
  private readonly lastVisible: CardInstance[] = [];
  private lastMirrored: readonly CardInstance[] = [];

  constructor(private readonly maxEntries: number = DEFAULT_DOM_MIRROR_MAX_ENTRIES) {}

  /** The new mirrored subset when it changed since the previous call, otherwise `null`. */
  update(visible: readonly CardInstance[]): CardInstance[] | null {
    if (sameInstances(visible, this.lastVisible)) return null;
    this.lastVisible.length = 0;
    for (const card of visible) this.lastVisible.push(card);
    const mirrored = selectDomMirrorCards(visible, this.maxEntries);
    if (sameInstances(mirrored, this.lastMirrored)) return null;
    this.lastMirrored = mirrored;
    return mirrored;
  }
}
