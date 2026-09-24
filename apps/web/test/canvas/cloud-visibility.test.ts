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
  // range.
  it("the two layers together place a reasonable total (2-4, not 0-1 and not a cluttered dozen+)", () => {
    const total = countOnScreenClouds(FAR_CLOUD_CONFIG) + countOnScreenClouds(MID_CLOUD_CONFIG);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(4);
  });
});
