import { describe, expect, it } from "vitest";
import { cloudForCell, visibleCellRange } from "../../src/canvas/cloud-field";
import { cloudScreenRect, rectOverlapsViewport } from "../../src/canvas/cloud-screen-rect";
import { FAR_CLOUD_CONFIG, MID_CLOUD_CONFIG, SKY_PARALLAX } from "../../src/canvas/engine";
import type { CloudLayerRuntimeConfig } from "../../src/canvas/layers/clouds";
import { clampSpriteCssSize, spriteQuadCssSize } from "../../src/canvas/max-sprite-size";

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
  // range. T8b-2 and T8b-3 (below) each retune far/mid together (bigger
  // sprites, slower, more atmospheric) but keep this same 2-4 on-screen
  // target — cellSize and density are retuned alongside the size/speed/
  // opacity changes each time so bigger sprites don't crowd the screen
  // past this range.
  it("the two layers together place a reasonable total (2-4, not 0-1 and not a cluttered dozen+)", () => {
    const total = countOnScreenClouds(FAR_CLOUD_CONFIG) + countOnScreenClouds(MID_CLOUD_CONFIG);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(4);
  });
});

// T8b-3 owner feedback (second retune — "the motion still doesn't feel
// right", goal = realism): far/mid retuned AGAIN, this time relative to
// the sky/haze parallax (SKY_PARALLAX=0.05, HAZE_PARALLAX=0.12, both in
// engine.ts) instead of an arbitrary ratio of their own old values — real
// clouds barely outpace the sky they drift across. Also bigger again and
// noticeably hazier, still cohesive (mid nearer-reading than far).
describe("T8b-3 far/mid cloud retune #2 (realism: barely-faster speed, bigger again, stronger atmosphere)", () => {
  // The T8b-2 retune's own output (previous "current" state, from the prior
  // commit): baseSpriteSizePx=720. Speed/atmosphere targets below are
  // absolute (owner gave concrete numbers), not ratios off T8b-2's values.
  const PREVIOUS_BASE_SPRITE_SIZE_PX = 720;

  it("speed: far/mid parallax ordered sky < far < mid < cards(1), each step only barely faster (ratio 1.3-2.0x)", () => {
    expect(FAR_CLOUD_CONFIG.parallax).toBeGreaterThan(SKY_PARALLAX);
    expect(MID_CLOUD_CONFIG.parallax).toBeGreaterThan(FAR_CLOUD_CONFIG.parallax);
    expect(MID_CLOUD_CONFIG.parallax).toBeLessThan(1);

    const farToSkyRatio = FAR_CLOUD_CONFIG.parallax / SKY_PARALLAX;
    expect(farToSkyRatio).toBeGreaterThanOrEqual(1.3);
    expect(farToSkyRatio).toBeLessThanOrEqual(2.0);

    const midToFarRatio = MID_CLOUD_CONFIG.parallax / FAR_CLOUD_CONFIG.parallax;
    expect(midToFarRatio).toBeGreaterThanOrEqual(1.3);
    expect(midToFarRatio).toBeLessThanOrEqual(2.0);
  });

  it("far parallax lands close to the ~0.08 target, mid close to ~0.13", () => {
    expect(FAR_CLOUD_CONFIG.parallax).toBeCloseTo(0.08, 1);
    expect(MID_CLOUD_CONFIG.parallax).toBeCloseTo(0.13, 1);
  });

  it("bigger again: baseSpriteSizePx grows ~1.4x from the T8b-2 base (720), mid still larger than far via sizeScale", () => {
    const ratio = FAR_CLOUD_CONFIG.baseSpriteSizePx / PREVIOUS_BASE_SPRITE_SIZE_PX;
    expect(ratio).toBeGreaterThanOrEqual(1.3);
    expect(ratio).toBeLessThanOrEqual(1.5);
    expect(MID_CLOUD_CONFIG.baseSpriteSizePx).toBe(FAR_CLOUD_CONFIG.baseSpriteSizePx);
    expect(MID_CLOUD_CONFIG.sizeScale).toBeGreaterThan(FAR_CLOUD_CONFIG.sizeScale);
  });

  it("clouds (not cards) may upscale past their texture's native resolution at high DPR, bounded to 1.5x", () => {
    // Same real cloud texture (1464px, the narrowest — the tightest clamp
    // case) at DPR=2: a card's clampSpriteCssSize call (no 4th arg, see
    // layers/cards.ts) still caps at texturePx/dpr; a cloud's
    // spriteQuadCssSize call (layers/clouds.ts) may go up to 1.5x that.
    const texturePx = 1464;
    const dpr = 2;
    const hugeRequest = 5000; // deliberately beyond both caps, to probe them
    const cardWidth = clampSpriteCssSize(hugeRequest, texturePx, dpr);
    const cloudWidth = clampSpriteCssSize(hugeRequest, texturePx, dpr, 1.5);
    expect(cardWidth).toBeCloseTo(texturePx / dpr, 6);
    expect(cloudWidth).toBeCloseTo((texturePx * 1.5) / dpr, 6);
    expect(cloudWidth).toBeGreaterThan(cardWidth);
  });

  it("stronger atmosphere: far atmosphereMix~0.65/opacity~0.45, mid atmosphereMix~0.45/opacity~0.6, mid still nearer than far", () => {
    expect(FAR_CLOUD_CONFIG.atmosphereMix).toBeCloseTo(0.65, 1);
    expect(MID_CLOUD_CONFIG.atmosphereMix).toBeCloseTo(0.45, 1);

    const farOpacityAvg = (FAR_CLOUD_CONFIG.opacityMin + FAR_CLOUD_CONFIG.opacityMax) / 2;
    const midOpacityAvg = (MID_CLOUD_CONFIG.opacityMin + MID_CLOUD_CONFIG.opacityMax) / 2;
    expect(farOpacityAvg).toBeCloseTo(0.45, 1);
    expect(midOpacityAvg).toBeCloseTo(0.6, 1);

    expect(midOpacityAvg).toBeGreaterThan(farOpacityAvg);
    expect(MID_CLOUD_CONFIG.atmosphereMix).toBeLessThan(FAR_CLOUD_CONFIG.atmosphereMix);
  });
});
