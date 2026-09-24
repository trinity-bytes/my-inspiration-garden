import type { Item, ItemKind } from "@garden/shared";

/**
 * Colors/text for a generic placeholder card (item kinds with no thumbnail —
 * see `thumbnail-source.ts` — or whose thumbnail failed to load). Per-kind
 * rich rendering is T9; this is the one generic look, using the design
 * tokens' lavender/ink palette (`styles/tokens.css`) hardcoded as hex since
 * the placeholder is painted on a 2D `<canvas>` (`placeholder-texture.ts`),
 * which cannot read CSS custom properties.
 */
export interface PlaceholderStyle {
  background: string;
  foreground: string;
  label: string;
  displayTitle: string;
}

const KIND_LABELS: Record<ItemKind, string> = {
  image: "Image",
  link: "Link",
  text: "Text",
  video: "Video",
  palette: "Palette",
  font: "Font",
};

/** `--garden-lavender-100` from `styles/tokens.css`. */
const BACKGROUND_HEX = "#E9E3F3";
/** `--garden-ink` from `styles/tokens.css`. */
const FOREGROUND_HEX = "#2A2140";

const MAX_TITLE_LENGTH = 60;

export function placeholderStyleForItem(item: Item): PlaceholderStyle {
  const label = KIND_LABELS[item.kind];
  const rawTitle = item.title?.trim() || label;
  const displayTitle =
    rawTitle.length > MAX_TITLE_LENGTH ? `${rawTitle.slice(0, MAX_TITLE_LENGTH - 1)}…` : rawTitle;

  return {
    background: BACKGROUND_HEX,
    foreground: FOREGROUND_HEX,
    label,
    displayTitle,
  };
}
