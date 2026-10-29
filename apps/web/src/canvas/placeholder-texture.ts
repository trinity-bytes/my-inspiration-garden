import type { Item } from "@garden/shared";
import * as THREE from "three";
import { placeholderStyleForItem } from "./placeholder-style";
import { wrapText } from "./wrap-text";

/**
 * Paints a generic placeholder card (title + kind, Geist, palette tokens —
 * see `placeholder-style.ts` for the pure color/text derivation) onto a 2D
 * `<canvas>` and wraps it as a `THREE.CanvasTexture`. Not unit-tested: jsdom
 * has no real 2D canvas/text rendering (see the test setup's "Not
 * implemented: getContext()" warnings elsewhere in this suite); covered by
 * `pnpm --filter web build` + manual visual QA, like the rest of the GPU
 * glue in this directory. Also the fallback for every per-kind painter
 * (`card-painters.ts`, T9) when its own content can't be painted.
 */
/**
 * Upper bound for a card texture's longer edge, in device px. Bounds GPU memory for the texture
 * cache (`engine.ts`'s `CARD_TEXTURE_CACHE_SIZE`) on large cards and high-DPR screens.
 */
export const MAX_TEXTURE_EDGE_PX = 1024;
/** Same cap as `engine.ts`'s `DPR_CAP`: beyond 2x the extra texels are not visible. */
const MAX_TEXTURE_DPR = 2;
const CORNER_RADIUS_FRACTION = 0.06;

/**
 * A `<canvas>` with one texel per device pixel of the card's on-screen CSS size (`widthPx` x
 * `heightPx` at `dpr`), with its longer edge capped at `MAX_TEXTURE_EDGE_PX`. Painting at the
 * screen's resolution keeps text sharp on Retina screens without shrinking the card below its
 * column slot (owner feedback, 2026-10-29: on a 2x iMac the cards looked too far apart because a
 * fixed 512px budget forced them smaller than their columns).
 */
export function createDeviceCanvas(
  widthPx: number,
  heightPx: number,
  dpr: number = window.devicePixelRatio || 1,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const longEdge = Math.max(widthPx, heightPx, 1);
  const scale = Math.min(Math.max(dpr, 1), MAX_TEXTURE_DPR, MAX_TEXTURE_EDGE_PX / longEdge);
  canvas.width = Math.max(1, Math.round(widthPx * scale));
  canvas.height = Math.max(1, Math.round(heightPx * scale));
  return canvas;
}

export function paintPlaceholderCanvas(
  item: Item,
  widthPx: number,
  heightPx: number,
): HTMLCanvasElement {
  const canvas = createDeviceCanvas(widthPx, heightPx);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const style = placeholderStyleForItem(item);
  const radius = Math.min(canvas.width, canvas.height) * CORNER_RADIUS_FRACTION;

  ctx.fillStyle = style.background;
  ctx.beginPath();
  ctx.roundRect?.(0, 0, canvas.width, canvas.height, radius);
  if (!ctx.roundRect) {
    ctx.rect(0, 0, canvas.width, canvas.height);
  }
  ctx.fill();

  const padding = canvas.width * 0.08;
  ctx.fillStyle = style.foreground;
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 ${Math.round(canvas.width * 0.045)}px "Geist Variable", system-ui, sans-serif`;
  ctx.globalAlpha = 0.65;
  ctx.fillText(style.label.toUpperCase(), padding, padding + canvas.width * 0.045);
  ctx.globalAlpha = 1;

  ctx.font = `600 ${Math.round(canvas.width * 0.07)}px "Geist Variable", system-ui, sans-serif`;
  const maxWidth = canvas.width - padding * 2;
  const { lines } = wrapText(
    (text) => ctx.measureText(text).width,
    style.displayTitle,
    maxWidth,
    3,
  );
  const lineHeight = Math.round(maxWidth * 0.12) || 28;
  const startY = canvas.height - padding - (lines.length - 1) * lineHeight;
  lines.forEach((line, i) => {
    ctx.fillText(line, padding, startY + i * lineHeight);
  });

  return canvas;
}

export function createPlaceholderTexture(
  item: Item,
  widthPx: number,
  heightPx: number,
): THREE.Texture {
  const canvas = paintPlaceholderCanvas(item, widthPx, heightPx);
  const texture = new THREE.CanvasTexture(canvas);
  // NoColorSpace throughout the canvas engine (see engine.ts):
  // the card shader composites in raw sRGB-encoded byte space, no per-texture
  // conversion.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
