import { describe, expect, it } from "vitest";
import {
  cellCountInRange,
  clampPoolSize,
  cloudForCell,
  DEFAULT_MAX_CLOUD_POOL_SIZE,
  visibleCellRange,
} from "../../src/canvas/cloud-field";

const config = {
  layerId: 0,
  cellSize: 400,
  density: 0.4,
  scaleMin: 0.8,
  scaleMax: 1.4,
  opacityMin: 0.5,
  opacityMax: 0.9,
};

describe("cloudForCell", () => {
  it("is a pure function of (layer, cellX, cellY): identical inputs give identical output", () => {
    const a = cloudForCell(3, -7, config);
    const b = cloudForCell(3, -7, config);
    expect(a).toEqual(b);
  });

  it("produces placements only within the documented ranges", () => {
    for (let x = -50; x < 50; x++) {
      for (let y = -5; y < 5; y++) {
        const placement = cloudForCell(x, y, config);
        if (placement === null) continue;
        expect([1, 2, 3, 4]).toContain(placement.spriteIndex);
        expect(placement.offsetX).toBeGreaterThanOrEqual(0);
        expect(placement.offsetX).toBeLessThan(1);
        expect(placement.offsetY).toBeGreaterThanOrEqual(0);
        expect(placement.offsetY).toBeLessThan(1);
        expect(placement.scale).toBeGreaterThanOrEqual(config.scaleMin);
        expect(placement.scale).toBeLessThanOrEqual(config.scaleMax);
        expect(placement.opacity).toBeGreaterThanOrEqual(config.opacityMin);
        expect(placement.opacity).toBeLessThanOrEqual(config.opacityMax);
        expect(typeof placement.flipX).toBe("boolean");
      }
    }
  });

  it("occupancy approximates the configured density over a large sample", () => {
    let occupied = 0;
    let total = 0;
    for (let x = -100; x < 100; x++) {
      for (let y = -20; y < 20; y++) {
        total++;
        if (cloudForCell(x, y, config) !== null) occupied++;
      }
    }
    const rate = occupied / total;
    expect(rate).toBeGreaterThan(config.density - 0.05);
    expect(rate).toBeLessThan(config.density + 0.05);
  });

  it("different layers hash independently (different occupancy pattern)", () => {
    const layerA = cloudForCell(10, 10, { ...config, layerId: 0 });
    const layerB = cloudForCell(10, 10, { ...config, layerId: 1 });
    // Not guaranteed to differ for a single cell, but across many cells the
    // patterns must not be identical.
    let differences = 0;
    for (let x = 0; x < 40; x++) {
      const a = cloudForCell(x, 0, { ...config, layerId: 0 });
      const b = cloudForCell(x, 0, { ...config, layerId: 1 });
      if ((a === null) !== (b === null)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
    // silence unused-variable lint for the single-cell probe above
    expect(layerA === null || typeof layerA.spriteIndex === "number").toBe(true);
    expect(layerB === null || typeof layerB.spriteIndex === "number").toBe(true);
  });
});

describe("visibleCellRange", () => {
  it("computes the cell range covering the viewport plus margin", () => {
    const range = visibleCellRange({ centerX: 0, centerY: 0, width: 1000, height: 1000 }, 250, 1);
    expect(range).toEqual({ minX: -3, maxX: 3, minY: -3, maxY: 3 });
  });

  it("shifts with the world center", () => {
    const range = visibleCellRange(
      { centerX: 1000, centerY: 0, width: 1000, height: 1000 },
      250,
      1,
    );
    expect(range.minX).toBe(1);
    expect(range.maxX).toBe(7);
  });

  it("grows with a larger margin", () => {
    const small = visibleCellRange({ centerX: 0, centerY: 0, width: 1000, height: 1000 }, 250, 0);
    const large = visibleCellRange({ centerX: 0, centerY: 0, width: 1000, height: 1000 }, 250, 2);
    expect(cellCountInRange(large)).toBeGreaterThan(cellCountInRange(small));
  });
});

describe("cellCountInRange", () => {
  it("counts cells inclusively", () => {
    expect(cellCountInRange({ minX: -1, maxX: 1, minY: -1, maxY: 1 })).toBe(9);
    expect(cellCountInRange({ minX: 0, maxX: 0, minY: 0, maxY: 0 })).toBe(1);
  });
});

describe("clampPoolSize", () => {
  it("passes through counts under the cap", () => {
    expect(clampPoolSize(10, 64)).toBe(10);
  });

  it("caps counts above the max pool size so the pool never grows unbounded", () => {
    expect(clampPoolSize(10_000, 64)).toBe(64);
  });

  it("has a sane default cap", () => {
    expect(DEFAULT_MAX_CLOUD_POOL_SIZE).toBeGreaterThan(0);
    expect(clampPoolSize(10_000)).toBe(DEFAULT_MAX_CLOUD_POOL_SIZE);
  });
});
