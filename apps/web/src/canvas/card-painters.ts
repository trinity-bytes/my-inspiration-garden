import type { Item } from "@garden/shared";
import {
  fontCardContent,
  linkCardContent,
  paletteCardContent,
  textCardContent,
  videoCardContent,
} from "./card-content";
import { createDeviceCanvas, paintPlaceholderCanvas } from "./placeholder-texture";
import { thumbnailUrlForItem } from "./thumbnail-source";
import { wrapText } from "./wrap-text";

/**
 * Per-kind canvas card painters (T9). The `image` kind is NOT painted here
 * — it stays a raw, full-bleed photo texture (see `layers/cards.ts`'s
 * `assignPhotoTexture`), which is exactly what "no chrome" means for an
 * image card. Every other kind composes a photo (when one is available)
 * with typographic/graphic content onto one 2D canvas, wrapped as a
 * `THREE.CanvasTexture` by the caller.
 *
 * Not unit-tested: jsdom has no real 2D canvas/text rendering (same
 * established convention as `placeholder-texture.ts`); covered by
 * `pnpm --filter web build` + manual visual QA. The content DECISIONS these
 * painters draw (title/domain/excerpt/colors/pangram text, whether a photo
 * is available) live in `card-content.ts`, which IS unit-tested.
 */

const BACKGROUND_HEX = "#e9e3f3"; // --garden-lavender-100
const FOREGROUND_HEX = "#2a2140"; // --garden-ink
const ACCENT_HEX = "#f29a6b"; // --garden-accent
/**
 * Exported (not just a local const) so `item-layout.ts`'s pure content-fit
 * sizing (T9b, owner feedback: short text cards were too tall) can derive a
 * card's height using the SAME padding/font-scale fractions this painter
 * actually draws with — a single source of truth, so the computed layout
 * size and the painted content never drift apart.
 */
export const PADDING_FRACTION = 0.08;
export const TEXT_TITLE_FONT_FRACTION = 0.07;
export const TEXT_TITLE_GAP_FRACTION = 0.11;
export const TEXT_TITLE_LINE_HEIGHT_FRACTION = 0.088;
export const TEXT_TITLE_MAX_LINES = 2;
export const TEXT_BODY_FONT_FRACTION = 0.05;
export const TEXT_BODY_LINE_HEIGHT_FRACTION = 0.065;
export const LINK_TITLE_FONT_FRACTION = 0.075;
export const LINK_TITLE_LINE_HEIGHT_FRACTION = 0.09;
export const LINK_TITLE_GAP_FRACTION = 0.05;
const IMAGE_LOAD_TIMEOUT_MS = 4000;
const FONT_LOAD_TIMEOUT_MS = 2000;

function geistFont(weight: number, sizePx: number, family = "Geist Variable"): string {
  return `${weight} ${Math.round(sizePx)}px "${family}", "Geist Variable", system-ui, sans-serif`;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  topY: number,
  lineHeight: number,
): void {
  lines.forEach((line, i) => {
    ctx.fillText(line, x, topY + i * lineHeight);
  });
}

/** `object-fit: cover`-style draw: fills the whole target rect, cropping the image's longer axis. */
function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

/** Loads an `<img>`; resolves `null` (never rejects) on error or timeout, so a broken/slow preview always falls back to the typographic layout instead of leaving the card stuck. */
function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      clearTimeout(timer);
      finish(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    image.src = url;
  });
}

/** Darkens the bottom of a photo card so overlaid title/domain text stays legible on any underlying image — a deliberate compositing choice for text legibility, distinct from (and not a violation of) the "never darken a texture" color-pipeline convention, which is about not accidentally mis-decoding sRGB bytes. */
function drawLegibilityScrim(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, height * 0.35, 0, height);
  gradient.addColorStop(0, "rgba(42, 33, 64, 0)");
  gradient.addColorStop(1, "rgba(42, 33, 64, 0.72)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawPlayGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  const triangleSize = radius * 0.9;
  ctx.beginPath();
  ctx.fillStyle = FOREGROUND_HEX;
  ctx.moveTo(cx - triangleSize * 0.35, cy - triangleSize * 0.55);
  ctx.lineTo(cx - triangleSize * 0.35, cy + triangleSize * 0.55);
  ctx.lineTo(cx + triangleSize * 0.55, cy);
  ctx.closePath();
  ctx.fill();
}

type LinkItem = Extract<Item, { kind: "link" }>;
type VideoItem = Extract<Item, { kind: "video" }>;
type TextItem = Extract<Item, { kind: "text" }>;
type PaletteItem = Extract<Item, { kind: "palette" }>;
type FontItem = Extract<Item, { kind: "font" }>;

async function paintLinkCard(
  item: LinkItem,
  widthPx: number,
  heightPx: number,
): Promise<HTMLCanvasElement> {
  const canvas = createDeviceCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const content = linkCardContent(item);
  const previewUrl = thumbnailUrlForItem(item);
  const photo = previewUrl ? await loadImage(previewUrl, IMAGE_LOAD_TIMEOUT_MS) : null;
  const padding = canvas.width * PADDING_FRACTION;

  if (photo) {
    drawCoverImage(ctx, photo, canvas.width, canvas.height);
    drawLegibilityScrim(ctx, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
  } else {
    ctx.fillStyle = BACKGROUND_HEX;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = FOREGROUND_HEX;
  }

  ctx.textBaseline = "alphabetic";
  ctx.font = geistFont(600, canvas.width * LINK_TITLE_FONT_FRACTION);
  const maxTextWidth = canvas.width - padding * 2;
  const { lines: titleLines } = wrapText(
    (text) => ctx.measureText(text).width,
    content.title,
    maxTextWidth,
    2,
  );
  const titleLineHeight = Math.round(canvas.width * LINK_TITLE_LINE_HEIGHT_FRACTION);
  const domainY = canvas.height - padding;
  const titleTop =
    domainY - canvas.width * LINK_TITLE_GAP_FRACTION - titleLines.length * titleLineHeight;
  drawLines(ctx, titleLines, padding, titleTop, titleLineHeight);

  ctx.font = geistFont(500, canvas.width * 0.045);
  ctx.globalAlpha = photo ? 0.85 : 0.65;
  const domainLabel = content.hasPreview ? content.domain : `${content.domain}  ↗`;
  ctx.fillText(domainLabel, padding, domainY);
  ctx.globalAlpha = 1;

  return canvas;
}

async function paintVideoCard(
  item: VideoItem,
  widthPx: number,
  heightPx: number,
): Promise<HTMLCanvasElement> {
  const canvas = createDeviceCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const content = videoCardContent(item);
  const thumbnailUrl = thumbnailUrlForItem(item);
  const thumbnail = thumbnailUrl ? await loadImage(thumbnailUrl, IMAGE_LOAD_TIMEOUT_MS) : null;
  const padding = canvas.width * PADDING_FRACTION;

  if (thumbnail) {
    drawCoverImage(ctx, thumbnail, canvas.width, canvas.height);
    drawLegibilityScrim(ctx, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = BACKGROUND_HEX;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = FOREGROUND_HEX;
    ctx.textBaseline = "alphabetic";
    ctx.font = geistFont(600, canvas.width * 0.08);
    const { lines } = wrapText(
      (text) => ctx.measureText(text).width,
      content.title,
      canvas.width - padding * 2,
      2,
    );
    drawLines(ctx, lines, padding, canvas.height * 0.42, Math.round(canvas.width * 0.095));
  }

  drawPlayGlyph(ctx, canvas.width / 2, canvas.height / 2, canvas.width * 0.11);

  ctx.fillStyle = thumbnail ? "#ffffff" : FOREGROUND_HEX;
  ctx.textBaseline = "alphabetic";
  ctx.font = geistFont(500, canvas.width * 0.045);
  ctx.globalAlpha = thumbnail ? 0.9 : 0.65;
  ctx.fillText(content.providerLabel, padding, canvas.height - padding);
  ctx.globalAlpha = 1;

  return canvas;
}

function paintTextCard(item: TextItem, widthPx: number, heightPx: number): HTMLCanvasElement {
  const canvas = createDeviceCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const content = textCardContent(item);
  const padding = canvas.width * PADDING_FRACTION;
  const maxWidth = canvas.width - padding * 2;

  ctx.fillStyle = BACKGROUND_HEX;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "alphabetic";

  let cursorY = padding + canvas.width * TEXT_TITLE_FONT_FRACTION;
  if (content.title) {
    ctx.fillStyle = FOREGROUND_HEX;
    ctx.font = geistFont(600, canvas.width * TEXT_TITLE_FONT_FRACTION);
    const titleLineHeight = canvas.width * TEXT_TITLE_LINE_HEIGHT_FRACTION;
    const { lines } = wrapText(
      (text) => ctx.measureText(text).width,
      content.title,
      maxWidth,
      TEXT_TITLE_MAX_LINES,
    );
    drawLines(ctx, lines, padding, cursorY, titleLineHeight);
    cursorY += (lines.length - 1) * titleLineHeight + canvas.width * TEXT_TITLE_GAP_FRACTION;
  }

  ctx.fillStyle = FOREGROUND_HEX;
  ctx.globalAlpha = 0.85;
  ctx.font = geistFont(400, canvas.width * TEXT_BODY_FONT_FRACTION);
  const bodyLineHeight = Math.round(canvas.width * TEXT_BODY_LINE_HEIGHT_FRACTION);
  const remainingHeight = canvas.height - padding - cursorY;
  const maxLines = Math.max(1, Math.floor(remainingHeight / bodyLineHeight));
  const { lines } = wrapText(
    (text) => ctx.measureText(text).width,
    content.excerpt,
    maxWidth,
    maxLines,
  );
  drawLines(ctx, lines, padding, cursorY, bodyLineHeight);
  ctx.globalAlpha = 1;

  return canvas;
}

function paintPaletteCard(item: PaletteItem, widthPx: number, heightPx: number): HTMLCanvasElement {
  const canvas = createDeviceCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const content = paletteCardContent(item);
  // `content.colors` weights already sum to 1 (normalized in `paletteCardContent`),
  // so each band's width is just its share of the canvas — no per-band
  // renormalization needed here (T11b B5).
  let x = 0;
  content.colors.forEach((color) => {
    const bandWidth = color.weight * canvas.width;
    ctx.fillStyle = color.hex;
    ctx.fillRect(Math.round(x), 0, Math.ceil(bandWidth) + 1, canvas.height);
    x += bandWidth;
  });

  const padding = canvas.width * PADDING_FRACTION * 0.6;
  const label = content.name;
  ctx.font = geistFont(600, canvas.width * 0.045);
  const labelWidth = ctx.measureText(label).width;
  const chipPaddingX = canvas.width * 0.025;
  const chipHeight = canvas.width * 0.07;
  const chipY = canvas.height - padding - chipHeight;

  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.beginPath();
  const chipRadius = chipHeight / 2;
  const chipWidth = labelWidth + chipPaddingX * 2;
  ctx.roundRect?.(padding, chipY, chipWidth, chipHeight, chipRadius);
  if (!ctx.roundRect) {
    ctx.rect(padding, chipY, chipWidth, chipHeight);
  }
  ctx.fill();

  ctx.fillStyle = FOREGROUND_HEX;
  ctx.textBaseline = "middle";
  ctx.fillText(label, padding + chipPaddingX, chipY + chipHeight / 2);

  return canvas;
}

/** Loads `family` from `sourceUrl` via the FontFace API, racing a timeout; resolves `false` (never throws) on any failure or timeout, or when the font is already loadable without a URL (nothing to fetch). */
async function loadCardFont(
  family: string,
  sourceUrl: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  if (
    !sourceUrl ||
    typeof FontFace === "undefined" ||
    typeof document === "undefined" ||
    !document.fonts
  ) {
    return false;
  }
  try {
    const face = new FontFace(family, `url(${sourceUrl})`);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("font load timeout")), timeoutMs);
    });
    const loaded = await Promise.race([face.load(), timeout]);
    document.fonts.add(loaded);
    return true;
  } catch {
    return false;
  }
}

async function paintFontCard(
  item: FontItem,
  widthPx: number,
  heightPx: number,
  timeoutMs: number,
): Promise<HTMLCanvasElement> {
  const canvas = createDeviceCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const content = fontCardContent(item);
  const loaded = await loadCardFont(content.family, item.data.sourceUrl, timeoutMs);
  const specimenFamily = loaded ? content.family : "Geist Variable";
  const padding = canvas.width * PADDING_FRACTION;

  ctx.fillStyle = BACKGROUND_HEX;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = FOREGROUND_HEX;
  ctx.globalAlpha = 0.65;
  ctx.font = geistFont(500, canvas.width * 0.04);
  ctx.fillText(content.family.toUpperCase(), padding, padding + canvas.width * 0.04);
  ctx.globalAlpha = 1;

  ctx.font = geistFont(600, canvas.height * 0.38, specimenFamily);
  ctx.fillText("Aa", padding, canvas.height * 0.62);

  ctx.font = geistFont(400, canvas.width * 0.045, specimenFamily);
  const { lines } = wrapText(
    (text) => ctx.measureText(text).width,
    content.pangram,
    canvas.width - padding * 2,
    2,
  );
  drawLines(
    ctx,
    lines,
    padding,
    canvas.height - padding - (lines.length - 1) * canvas.width * 0.06,
    canvas.width * 0.06,
  );

  if (!loaded && item.data.sourceUrl) {
    ctx.fillStyle = ACCENT_HEX;
    ctx.globalAlpha = 0.9;
    ctx.font = geistFont(500, canvas.width * 0.032);
    ctx.fillText("preview unavailable — showing in Geist", padding, padding + canvas.width * 0.075);
    ctx.globalAlpha = 1;
  }

  return canvas;
}

export interface CardPaintOptions {
  fontLoadTimeoutMs?: number;
}

/**
 * Paints the rich per-kind card content for every kind EXCEPT `image`
 * (which the caller renders as a raw photo texture instead — see
 * `layers/cards.ts`). Never rejects: any internal failure falls back to
 * the generic placeholder so a card is always paintable.
 */
export async function paintItemCardCanvas(
  item: Item,
  widthPx: number,
  heightPx: number,
  options: CardPaintOptions = {},
): Promise<HTMLCanvasElement> {
  try {
    switch (item.kind) {
      case "link":
        return await paintLinkCard(item, widthPx, heightPx);
      case "video":
        return await paintVideoCard(item, widthPx, heightPx);
      case "text":
        return paintTextCard(item, widthPx, heightPx);
      case "palette":
        return paintPaletteCard(item, widthPx, heightPx);
      case "font":
        return await paintFontCard(
          item,
          widthPx,
          heightPx,
          options.fontLoadTimeoutMs ?? FONT_LOAD_TIMEOUT_MS,
        );
      case "image":
        // Not expected here (image uses the raw-photo path) — defensive fallback.
        return paintPlaceholderCanvas(item, widthPx, heightPx);
    }
  } catch {
    return paintPlaceholderCanvas(item, widthPx, heightPx);
  }
}
