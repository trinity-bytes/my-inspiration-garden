import { describe, expect, it } from "vitest";
import { cloudForCell, visibleCellRange } from "../../src/canvas/cloud-field";
import { cloudScreenRect, rectOverlapsViewport } from "../../src/canvas/cloud-screen-rect";
import { FAR_CLOUD_CONFIG, MID_CLOUD_CONFIG } from "../../src/canvas/engine";
import type { CloudLayerRuntimeConfig } from "../../src/canvas/layers/clouds";
import { spriteQuadCssSize } from "../../src/canvas/max-sprite-size";

// Real texture dimensions (public/images/cloud-{1..4}.webp), so the sprite
// size math here matches what clouds.ts actually computes, not an
// approximation.
const TEXTURE_SIZES: readonly [number, number][] = [
  [1464, 1216],
  [1600, 879],
  [1600, 682],
  [1600, 887],
];

const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;
const DPR = 1;

/**
 * Reproduces exactly what CloudLayer.update() computes for on-screen cell
 * count, using the real cloud-field/coords/max-sprite-size pure functions
 * (see the T8a "clouds not rendering" bug: cells returned by
 * visibleCellRange don't individually guarantee an on-screen placement).
 */
function countOnScreenClouds(config: CloudLayerRuntimeConfig): number {
  const range = visibleCellRange(
    { centerX: 0, centerY: 0, width: VIEWPORT_W, height: VIEWPORT_H },
    config.cellSize,
    config.marginCells,
  );

  let onScreen = 0;
  for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
    for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
      const placement = cloudForCell(cellX, cellY, config);
      if (!placement) {
        continue;
      }
      const worldX = (cellX + placement.offsetX) * config.cellSize;
      const worldY = (cellY + placement.offsetY) * config.cellSize;
      const requestedWidth = config.baseSpriteSizePx * config.sizeScale * placement.scale;
      const [textureWidth, textureHeight] = TEXTURE_SIZES[placement.spriteIndex - 1] as [
        number,
        number,
      ];
      const { width, height } = spriteQuadCssSize(requestedWidth, textureWidth, textureHeight, DPR);

      // worldOffset is (0,0) at rest; mesh.position = (worldX, -worldY) —
      // see clouds.ts's y-down-world -> y-up-scene negation.
      const rect = cloudScreenRect({ x: worldX, y: -worldY }, width, height, { x: 0, y: 0 }, 1);
      if (rectOverlapsViewport(rect, VIEWPORT_W, VIEWPORT_H)) {
        onScreen++;
      }
    }
  }
  return onScreen;
}

describe("cloud layers are actually visible at rest (1440x900, worldOffset=0)", () => {
  it("each layer places at least one cloud that overlaps the viewport", () => {
    expect(countOnScreenClouds(FAR_CLOUD_CONFIG)).toBeGreaterThanOrEqual(1);
    expect(countOnScreenClouds(MID_CLOUD_CONFIG)).toBeGreaterThanOrEqual(1);
  });

  // T8b owner feedback: the near (fastest, most opaque) cloud layer was
  // removed — cards now supply the depth cue. Far/mid are unchanged, so
  // their combined total is a smaller slice of the old 3-6 (three-layer)
  // range. T8b-2 (below) retunes far/mid together (bigger sprites, slower,
  // more atmospheric) but keeps this same 2-4 on-screen target — cellSize
  // and density are retuned alongside the size/speed/opacity changes so
  // bigger sprites don't crowd the screen past this range.
  it("the two layers together place a reasonable total (2-4, not 0-1 and not a cluttered dozen+)", () => {
    const total = countOnScreenClouds(FAR_CLOUD_CONFIG) + countOnScreenClouds(MID_CLOUD_CONFIG);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(4);
  });
});

// T8b-2 owner feedback: after the near layer's removal, retune far+mid
// TOGETHER — bigger sprites, slower parallax, a little more atmospheric
// perspective — while keeping mid cohesive with far (not a stand-alone
// "near" layer) and still nearer-reading than far.
describe("T8b-2 far/mid cloud retune (bigger, slower, more atmospheric)", () => {
  // Pre-retune baseline, from the T8b commit history (odd/tasks/garden-mvp.md):
  // baseSpriteSizePx=480, far parallax=0.3, mid parallax=0.5 (old depth=0.5),
  // far atmosphereMix=0.4, mid atmosphereMix=0.2, far opacity=0.65, mid
  // opacity=0.825 (midpoint of the old far/near opacity lerp).
  const OLD_BASE_SPRITE_SIZE_PX = 480;
  const OLD_FAR_PARALLAX = 0.3;
  const OLD_MID_PARALLAX = 0.5;
  const OLD_FAR_ATMOSPHERE_MIX = 0.4;
  const OLD_MID_ATMOSPHERE_MIX = 0.2;
  const OLD_FAR_OPACITY = 0.65;
  const OLD_MID_OPACITY = 0.825;

  it("bigger: baseSpriteSizePx grows ~1.4-1.6x for both layers", () => {
    expect(FAR_CLOUD_CONFIG.baseSpriteSizePx).toBeGreaterThanOrEqual(OLD_BASE_SPRITE_SIZE_PX * 1.4);
    expect(FAR_CLOUD_CONFIG.baseSpriteSizePx).toBeLessThanOrEqual(OLD_BASE_SPRITE_SIZE_PX * 1.6);
    expect(MID_CLOUD_CONFIG.baseSpriteSizePx).toBe(FAR_CLOUD_CONFIG.baseSpriteSizePx);
  });

  it("the effective on-screen sprite size actually grows (clamp isn't fully eating the size bump)", () => {
    // Same math CloudLayer.update() uses: requestedWidth clamped to the
    // texture's own resolution (see max-sprite-size.ts). Using the largest
    // real cloud texture (1600px) and the layers' own mid-range scale.
    const [textureWidth, textureHeight] = [1600, 887];
    const oldRequested = OLD_BASE_SPRITE_SIZE_PX * FAR_CLOUD_CONFIG.sizeScale * 1;
    const newRequested = FAR_CLOUD_CONFIG.baseSpriteSizePx * FAR_CLOUD_CONFIG.sizeScale * 1;
    const oldEffective = spriteQuadCssSize(oldRequested, textureWidth, textureHeight, 1).width;
    const newEffective = spriteQuadCssSize(newRequested, textureWidth, textureHeight, 1).width;
    expect(newEffective).toBeGreaterThan(oldEffective * 1.3);
  });

  it("slower: parallax reduced to ~0.6x the pre-retune values, far still slower than mid, both slower than cards (1.0)", () => {
    expect(FAR_CLOUD_CONFIG.parallax).toBeCloseTo(OLD_FAR_PARALLAX * 0.6, 1);
    expect(MID_CLOUD_CONFIG.parallax).toBeCloseTo(OLD_MID_PARALLAX * 0.6, 1);
    expect(FAR_CLOUD_CONFIG.parallax).toBeLessThan(MID_CLOUD_CONFIG.parallax);
    expect(MID_CLOUD_CONFIG.parallax).toBeLessThan(1);
  });

  it("more atmospheric: atmosphereMix raised (~+0.1) for both layers, opacity lowered slightly for both", () => {
    expect(FAR_CLOUD_CONFIG.atmosphereMix).toBeGreaterThanOrEqual(OLD_FAR_ATMOSPHERE_MIX + 0.05);
    expect(MID_CLOUD_CONFIG.atmosphereMix).toBeGreaterThanOrEqual(OLD_MID_ATMOSPHERE_MIX + 0.05);

    const farOpacityAvg = (FAR_CLOUD_CONFIG.opacityMin + FAR_CLOUD_CONFIG.opacityMax) / 2;
    const midOpacityAvg = (MID_CLOUD_CONFIG.opacityMin + MID_CLOUD_CONFIG.opacityMax) / 2;
    expect(farOpacityAvg).toBeLessThan(OLD_FAR_OPACITY);
    expect(midOpacityAvg).toBeLessThan(OLD_MID_OPACITY);
  });

  it("mid still reads as nearer than far (more solid, less atmosphere) — cohesive, not a stand-alone near layer", () => {
    const farOpacityAvg = (FAR_CLOUD_CONFIG.opacityMin + FAR_CLOUD_CONFIG.opacityMax) / 2;
    const midOpacityAvg = (MID_CLOUD_CONFIG.opacityMin + MID_CLOUD_CONFIG.opacityMax) / 2;
    expect(midOpacityAvg).toBeGreaterThan(farOpacityAvg);
    expect(MID_CLOUD_CONFIG.atmosphereMix).toBeLessThan(FAR_CLOUD_CONFIG.atmosphereMix);
  });
});
