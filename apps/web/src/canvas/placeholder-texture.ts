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
export const DEVICE_PIXEL_SIZE = 512;
const CORNER_RADIUS_FRACTION = 0.06;

/** A `<canvas>` sized so its longer edge is `DEVICE_PIXEL_SIZE` device px, preserving `widthPx`/`heightPx`'s aspect ratio — the resolution budget every per-kind card texture (placeholder or rich) paints at, independent of the card's exact on-screen CSS size (which varies with viewport/column width). */
export function createDeviceCanvas(widthPx: number, heightPx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = DEVICE_PIXEL_SIZE / Math.max(widthPx, heightPx, 1);
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
  // NoColorSpace throughout the canvas engine (see engine.ts / layers/sky.ts):
  // the card shader composites in raw sRGB-encoded byte space, no per-texture
  // conversion.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
