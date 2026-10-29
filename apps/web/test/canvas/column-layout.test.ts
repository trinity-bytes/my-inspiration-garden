import { describe, expect, it } from "vitest";
import {
  COLUMN_GUTTER_PX,
  columnLayoutFor,
  MAX_COLUMN_WIDTH_PX,
  MIN_COLUMN_WIDTH_PX,
  MOBILE_COLUMN_GUTTER_PX,
  PHONE_VISIBLE_COLUMNS,
} from "../../src/canvas/column-layout";

describe("COLUMN_GUTTER_PX", () => {
  it("is halved to 28 once the background became solid (owner feedback 2026-10-04: cards still too far apart)", () => {
    expect(COLUMN_GUTTER_PX).toBe(28);
  });
});

describe("MOBILE_COLUMN_GUTTER_PX", () => {
  it("is 12 (F7, owner feedback 2026-10-29: on phones the cards looked too far apart)", () => {
    expect(MOBILE_COLUMN_GUTTER_PX).toBe(12);
  });
});

describe("columnLayoutFor gutter", () => {
  it("uses the mobile gutter below a 480px viewport, for the column stride", () => {
    for (const width of [320, 390, 479]) {
      const layout = columnLayoutFor(width);
      expect(layout.gutter).toBe(MOBILE_COLUMN_GUTTER_PX);
      expect(layout.columnStride).toBeCloseTo(layout.columnWidth + MOBILE_COLUMN_GUTTER_PX, 6);
    }
  });

  it("keeps the desktop gutter from 480px up", () => {
    for (const width of [480, 768, 1440]) {
      expect(columnLayoutFor(width).gutter).toBe(COLUMN_GUTTER_PX);
    }
  });

  it("fits 2 full columns plus a peek of the next one on a 390px phone", () => {
    const layout = columnLayoutFor(390);
    expect(layout.columns).toBe(PHONE_VISIBLE_COLUMNS);
    expect(layout.columns * layout.columnWidth + (layout.columns - 1) * layout.gutter).toBeCloseTo(
      390,
      6,
    );
    const visibleColumns = 390 / layout.columnStride;
    expect(visibleColumns).toBeGreaterThan(2.2);
    expect(visibleColumns).toBeLessThan(2.5);
  });
});

describe("columnLayoutFor", () => {
  it("is a pure function of viewport width: identical input gives identical output", () => {
    expect(columnLayoutFor(1440)).toEqual(columnLayoutFor(1440));
  });

  it("shows roughly 4-6 columns at desktop width (1440px)", () => {
    const layout = columnLayoutFor(1440);
    expect(layout.columns).toBeGreaterThanOrEqual(4);
    expect(layout.columns).toBeLessThanOrEqual(6);
  });

  it("shows roughly 2 columns at mobile width (390px)", () => {
    const layout = columnLayoutFor(390);
    expect(layout.columns).toBeGreaterThanOrEqual(2);
    expect(layout.columns).toBeLessThanOrEqual(3);
  });

  it("uses the constant gutter for the column stride", () => {
    const layout = columnLayoutFor(1440);
    expect(layout.columnStride).toBeCloseTo(layout.columnWidth + COLUMN_GUTTER_PX, 6);
  });

  it("tiles the columns to roughly fill the viewport width (columns * stride is close to the viewport width)", () => {
    const width = 1440;
    const layout = columnLayoutFor(width);
    const covered = layout.columns * layout.columnStride;
    expect(Math.abs(covered - width)).toBeLessThan(layout.columnStride);
  });

  it("clamps column width into [MIN_COLUMN_WIDTH_PX, MAX_COLUMN_WIDTH_PX] across a wide range of viewport sizes", () => {
    for (const width of [200, 320, 390, 768, 1024, 1440, 1920, 2560, 3440]) {
      const layout = columnLayoutFor(width);
      expect(layout.columnWidth).toBeGreaterThanOrEqual(MIN_COLUMN_WIDTH_PX);
      expect(layout.columnWidth).toBeLessThanOrEqual(MAX_COLUMN_WIDTH_PX);
      expect(layout.columnWidth).toBeGreaterThan(0);
    }
  });

  it("never produces a non-positive width for a degenerate (zero or negative) viewport width", () => {
    for (const width of [0, -100]) {
      const layout = columnLayoutFor(width);
      expect(layout.columnWidth).toBeGreaterThan(0);
      expect(layout.columns).toBeGreaterThanOrEqual(1);
    }
  });

  it("generally widens (or holds) the viewport before adding a column: wider viewports don't show FEWER columns", () => {
    const widths = [390, 480, 900, 1200, 1440, 1680, 1920];
    let previousColumns = 0;
    for (const width of widths) {
      const layout = columnLayoutFor(width);
      expect(layout.columns).toBeGreaterThanOrEqual(previousColumns);
      previousColumns = layout.columns;
    }
  });
});
