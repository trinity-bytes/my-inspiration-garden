import type { Item } from "@garden/shared";
import * as THREE from "three";
import { placeholderStyleForItem } from "./placeholder-style";

/**
 * Paints a generic placeholder card (title + kind, Geist, palette tokens —
 * see `placeholder-style.ts` for the pure color/text derivation) onto a 2D
 * `<canvas>` and wraps it as a `THREE.CanvasTexture`. Not unit-tested: jsdom
 * has no real 2D canvas/text rendering (see the test setup's "Not
 * implemented: getContext()" warnings elsewhere in this suite); covered by
 * `pnpm --filter web build` + manual visual QA, like the rest of the GPU
 * glue in this directory.
 */
const DEVICE_PIXEL_SIZE = 512;
const CORNER_RADIUS_FRACTION = 0.06;

export function paintPlaceholderCanvas(
  item: Item,
  widthPx: number,
  heightPx: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = DEVICE_PIXEL_SIZE / Math.max(widthPx, heightPx);
  canvas.width = Math.max(1, Math.round(widthPx * scale));
  canvas.height = Math.max(1, Math.round(heightPx * scale));

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
  wrapText(ctx, style.displayTitle, padding, canvas.height - padding, canvas.width - padding * 2);

  return canvas;
}

/** Simple greedy word-wrap, capped at 3 lines (a placeholder card, not a text reader). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  bottomY: number,
  maxWidth: number,
): void {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const maxLines = 3;
  const shown = lines.slice(0, maxLines);
  const lineHeight = Math.round(maxWidth * 0.12) || 28;
  const startY = bottomY - (shown.length - 1) * lineHeight;
  shown.forEach((line, i) => {
    ctx.fillText(line, x, startY + i * lineHeight);
  });
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
