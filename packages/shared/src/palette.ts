/**
 * Client-side palette extraction. Workers can't decode images cheaply, so
 * this runs in the browser (or any environment that can hand us decoded
 * pixel data) — see T6 progress notes. `extractPalette` is a pure, seedless
 * median-cut quantizer: no RNG is involved, so it is deterministic by
 * construction for a given input (unlike k-means, which needs a fixed seed
 * to be reproducible).
 */

/** Matches the API's `isColorMatch` threshold (`apps/api/src/lib/color.ts`):
 * two colors are considered a match when their Euclidean RGB distance is
 * within this value. Kept here so future clients (browser extension) can
 * pre-filter without a round trip to the API. */
export const COLOR_DISTANCE_THRESHOLD = 60;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  hex: string;
  weight: number;
  name?: string;
}

export interface ExtractPaletteOptions {
  /** Desired palette size, clamped to [5, 8]. Defaults to 6. */
  colorCount?: number;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function byteToHex(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex(rgb: Rgb): string {
  return `#${byteToHex(rgb.r)}${byteToHex(rgb.g)}${byteToHex(rgb.b)}`;
}

/** Euclidean distance between two `#RRGGBB` colors in RGB space. */
export function hexDistance(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

interface Box {
  pixels: Rgb[];
}

type Channel = "r" | "g" | "b";

function widestChannel(box: Box): { channel: Channel; range: number } {
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (const p of box.pixels) {
    if (p.r < minR) minR = p.r;
    if (p.r > maxR) maxR = p.r;
    if (p.g < minG) minG = p.g;
    if (p.g > maxG) maxG = p.g;
    if (p.b < minB) minB = p.b;
    if (p.b > maxB) maxB = p.b;
  }
  const ranges: Record<Channel, number> = { r: maxR - minR, g: maxG - minG, b: maxB - minB };
  let channel: Channel = "r";
  if (ranges.g >= ranges[channel]) channel = "g";
  if (ranges.b >= ranges[channel]) channel = "b";
  return { channel, range: ranges[channel] };
}

function splitBox(box: Box): [Box, Box] {
  const { channel } = widestChannel(box);
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(sorted.length / 2);
  return [{ pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) }];
}

function boxAverage(box: Box): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of box.pixels) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = box.pixels.length;
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Median-cut palette extraction over decoded RGBA pixel data. Fully
 * transparent pixels (`alpha === 0`) are ignored. Returns 5-8 colors sorted
 * by descending weight (weight = fraction of opaque pixels), or `[]` if the
 * image has no opaque pixels. Boxes that cannot be split further (uniform
 * color, or fewer than 2 pixels) stop the quantization early, so a solid
 * color image legitimately yields a single color.
 */
export function extractPalette(
  pixels: Uint8ClampedArray,
  opts: ExtractPaletteOptions = {},
): PaletteColor[] {
  const colorCount = Math.min(8, Math.max(5, opts.colorCount ?? 6));

  const opaque: Rgb[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    opaque.push({ r: pixels[i] ?? 0, g: pixels[i + 1] ?? 0, b: pixels[i + 2] ?? 0 });
  }
  if (opaque.length === 0) return [];

  const boxes: Box[] = [{ pixels: opaque }];
  while (boxes.length < colorCount) {
    let splitIndex = -1;
    let bestSize = -1;
    boxes.forEach((box, idx) => {
      if (box.pixels.length < 2) return;
      const { range } = widestChannel(box);
      if (range === 0) return;
      if (box.pixels.length > bestSize) {
        bestSize = box.pixels.length;
        splitIndex = idx;
      }
    });
    if (splitIndex === -1) break;
    const [a, b] = splitBox(boxes[splitIndex] as Box);
    boxes.splice(splitIndex, 1, a, b);
  }

  const total = opaque.length;
  const colors = boxes.map((box) => ({
    hex: rgbToHex(boxAverage(box)),
    weight: box.pixels.length / total,
  }));
  colors.sort((a, b) => b.weight - a.weight);
  return colors;
}

/**
 * Normalizes a palette entry list that may be either legacy plain hex
 * strings or `{ hex, weight?, name? }` objects (see `imageDataSchema.palette`
 * / `paletteDataSchema.colors`) into uniform `PaletteColor[]` whose weights
 * always sum to 1 — the one shared normalization function used everywhere a
 * palette's per-color proportions matter (item indexing, canvas card bands,
 * the detail view's swatches; T11b B5, owner decision 2026-09-26).
 *
 * Any entry missing a weight (or carrying a non-positive one) falls back to
 * an even share of the palette (`1 / entries.length`) *before* normalization
 * — this is what keeps pre-B5 items (which never had a `weight` field at
 * all) rendering exactly as before: when no entry has a weight, every
 * fallback share is equal, so normalizing changes nothing. When some entries
 * do carry an explicit weight (which need not sum to 1, or to 100 — a
 * percentage-style input works exactly the same as a fraction-style one,
 * since only the *ratio* between weights matters), every contribution is
 * rescaled proportionally so the result still sums to 1.
 */
export function normalizePalette(
  entries: (string | { hex: string; weight?: number; name?: string })[],
): PaletteColor[] {
  if (entries.length === 0) return [];
  const evenShare = 1 / entries.length;
  const contributions = entries.map((entry) => {
    const weight = typeof entry === "string" ? undefined : entry.weight;
    return typeof weight === "number" && weight > 0 ? weight : evenShare;
  });
  const total = contributions.reduce((sum, weight) => sum + weight, 0);
  return entries.map((entry, i) => ({
    hex: typeof entry === "string" ? entry : entry.hex,
    weight: (contributions[i] as number) / total,
    name: typeof entry === "string" ? undefined : entry.name,
  }));
}
