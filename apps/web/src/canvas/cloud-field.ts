/**
 * Deterministic, infinite cloud placement: world space is divided into
 * cells per parallax layer; a pure hash of (layer, cellX, cellY) decides
 * whether a cell has a cloud and its appearance. Only cells intersecting
 * the (parallaxed) viewport plus a margin are instantiated by the caller,
 * from a bounded pool (see `clampPoolSize`).
 */

export interface CloudLayerConfig {
  layerId: number;
  /** World units per cell. */
  cellSize: number;
  /** Probability, in [0, 1], that a given cell contains a cloud. */
  density: number;
  scaleMin: number;
  scaleMax: number;
  opacityMin: number;
  opacityMax: number;
}

export interface CloudPlacement {
  spriteIndex: 1 | 2 | 3 | 4;
  /** Offset within the cell, in [0, 1) of the cell size, on each axis. */
  offsetX: number;
  offsetY: number;
  scale: number;
  flipX: boolean;
  opacity: number;
}

export interface CellRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ViewportWorldRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

const CHANNEL_EXISTENCE = 0;
const CHANNEL_SPRITE = 104_729;
const CHANNEL_OFFSET_X = 224_737;
const CHANNEL_OFFSET_Y = 350_377;
const CHANNEL_SCALE = 479_001;
const CHANNEL_FLIP = 599_999;
const CHANNEL_OPACITY = 715_827;

const TWO_POW_32 = 4_294_967_296;

/** A small, deterministic 32-bit integer hash (bit-mixing, no external state). */
function hash32(a: number, b: number, c: number): number {
  let h =
    (Math.imul(a | 0, 374_761_393) ^
      Math.imul(b | 0, 668_265_263) ^
      Math.imul(c | 0, 2_147_483_647)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hashes to a float in [0, 1). */
function hashToUnit(layer: number, cellX: number, cellY: number, channel: number): number {
  return hash32(layer, cellX, cellY + channel) / TWO_POW_32;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * The cloud placement for one cell, or `null` if the cell is empty. Pure:
 * identical inputs always produce an identical result.
 */
export function cloudForCell(
  cellX: number,
  cellY: number,
  config: CloudLayerConfig,
): CloudPlacement | null {
  const { layerId } = config;
  const exists = hashToUnit(layerId, cellX, cellY, CHANNEL_EXISTENCE) < config.density;
  if (!exists) {
    return null;
  }

  const spriteIndex = (1 + Math.floor(hashToUnit(layerId, cellX, cellY, CHANNEL_SPRITE) * 4)) as
    | 1
    | 2
    | 3
    | 4;
  const offsetX = hashToUnit(layerId, cellX, cellY, CHANNEL_OFFSET_X);
  const offsetY = hashToUnit(layerId, cellX, cellY, CHANNEL_OFFSET_Y);
  const scale = lerp(
    config.scaleMin,
    config.scaleMax,
    hashToUnit(layerId, cellX, cellY, CHANNEL_SCALE),
  );
  const flipX = hashToUnit(layerId, cellX, cellY, CHANNEL_FLIP) < 0.5;
  const opacity = lerp(
    config.opacityMin,
    config.opacityMax,
    hashToUnit(layerId, cellX, cellY, CHANNEL_OPACITY),
  );

  return { spriteIndex, offsetX, offsetY, scale, flipX, opacity };
}

/** The inclusive cell range covering a world-space viewport rect plus a margin, in cell units. */
export function visibleCellRange(
  rect: ViewportWorldRect,
  cellSize: number,
  marginCells: number,
): CellRange {
  const halfW = rect.width / 2 + marginCells * cellSize;
  const halfH = rect.height / 2 + marginCells * cellSize;
  return {
    minX: Math.floor((rect.centerX - halfW) / cellSize),
    maxX: Math.ceil((rect.centerX + halfW) / cellSize),
    minY: Math.floor((rect.centerY - halfH) / cellSize),
    maxY: Math.ceil((rect.centerY + halfH) / cellSize),
  };
}

export function cellCountInRange(range: CellRange): number {
  return (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
}

/** Reused everywhere a caller wants a sane cap without picking their own number. */
export const DEFAULT_MAX_CLOUD_POOL_SIZE = 64;

/** Caps a cell count so a sprite pool never grows unbounded as the viewport grows. */
export function clampPoolSize(
  count: number,
  maxPoolSize: number = DEFAULT_MAX_CLOUD_POOL_SIZE,
): number {
  return Math.min(count, maxPoolSize);
}
