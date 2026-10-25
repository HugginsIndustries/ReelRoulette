import { describe, expect, it } from "vitest";
import {
  buildRows,
  clampTargetRowHeight,
  computeAvailableLayoutWidth,
  FALLBACK_PHOTO_ASPECT_RATIO,
  FALLBACK_VIDEO_ASPECT_RATIO,
  getAspectRatio,
  getGridRowMeasuredHeight,
  getTileLeftOffsets,
  isTargetRowHeight,
  MAX_ASPECT_RATIO,
  MIN_ASPECT_RATIO,
  tileGap,
  type LibraryGridRowLayout
} from "../library/libraryGridLayout";

/** Thumbnail shapes from tall to wide, so rows hold different numbers of tiles. */
const MIXED_ASPECTS = Array.from({ length: 300 }, (_, index) => [16 / 9, 9 / 16, 4 / 3, 3, 1, 0.25, 4][index % 7]!);

/** Screens at 1x, at 2x, and at a fractional ratio, as a 125% display scale gives. */
const DEVICE_PIXEL_RATIOS = [1, 2, 1.25];

/** Expects a size in CSS pixels to be a whole number of device pixels. */
function expectWholeDevicePixels(value: number, devicePixelRatio: number): void {
  const devicePixels = value * devicePixelRatio;
  expect(Math.abs(devicePixels - Math.round(devicePixels))).toBeLessThan(1e-6);
}

/** How far each tile's left edge is from the right edge of the tile before it. */
function gapsBetweenTiles(row: LibraryGridRowLayout): number[] {
  const lefts = getTileLeftOffsets(row);
  return lefts.slice(1).map((left, index) => left - lefts[index]! - row.tiles[index]!.tileWidth);
}

describe("libraryGridLayout", () => {
  it("getAspectRatio uses thumbnail dimensions when present", () => {
    const aspect = getAspectRatio(480, 270, "video");
    expect(aspect).toBeCloseTo(16 / 9, 3);
  });

  it("getAspectRatio clamps extreme values", () => {
    expect(getAspectRatio(1000, 100, "video")).toBe(MAX_ASPECT_RATIO);
    expect(getAspectRatio(100, 1000, "video")).toBe(MIN_ASPECT_RATIO);
  });

  it("getAspectRatio uses media type fallback when dimensions missing", () => {
    expect(getAspectRatio(0, 0, "photo")).toBe(FALLBACK_PHOTO_ASPECT_RATIO);
    expect(getAspectRatio(0, 0, "video")).toBe(FALLBACK_VIDEO_ASPECT_RATIO);
  });

  it("buildRows packs all items across rows", () => {
    const aspects = [16 / 9, 4 / 3, 16 / 9, 1, 16 / 9];
    const rows = buildRows(aspects, 0, aspects.length, 920, 160, 1);

    const itemCount = rows.reduce((sum, row) => sum + row.tiles.length, 0);
    expect(itemCount).toBe(5);
    expect(Math.max(...rows.map((row) => row.tiles.length))).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.rowHeight).toBeGreaterThanOrEqual(100);
      expect(row.rowHeight).toBeLessThanOrEqual(240);
    }
  });

  it("at 160 px and 1x, closes rows where they closed before and fits them to the width with tiles 2 px apart", () => {
    const aspects = [16 / 9, 4 / 3, 16 / 9, 1, 16 / 9];
    const rows = buildRows(aspects, 0, aspects.length, 920, 160, 1);

    // A row closes once its tiles reach the width at 160 px, and is scaled to fit it on whole pixels; the last keeps
    // 160 px.
    expect(rows.map((row) => row.tiles.map((tile) => tile.itemIndex))).toEqual([[0, 1, 2, 3], [4]]);
    const fullHeight = (920 - 3 * 2) / (16 / 9 + 4 / 3 + 16 / 9 + 1);
    expect(rows[0]!.rowHeight).toBe(Math.round(fullHeight));
    const widths = rows[0]!.tiles.map((tile) => tile.tileWidth);
    expect(widths.every(Number.isInteger)).toBe(true);
    [16 / 9, 4 / 3, 16 / 9, 1].forEach((aspect, index) => {
      expect(Math.abs(widths[index]! - aspect * Math.round(fullHeight))).toBeLessThanOrEqual(1);
    });
    expect(widths.reduce((sum, width) => sum + width, 0) + 3 * 2).toBe(920);
    expect(rows[1]!.rowHeight).toBe(160);
    expect(rows[1]!.tiles[0]!.tileWidth).toBe(Math.round((16 / 9) * 160));
  });

  for (const target of [120, 160, 300]) {
    it(`aims for rows of ${target} px, keeping each from 0.625 to 1.5 times that, with the last at ${target}`, () => {
      const rows = buildRows(MIXED_ASPECTS, 0, MIXED_ASPECTS.length, 920, target, 1);

      expect(rows.length).toBeGreaterThan(5);
      for (const row of rows) {
        expect(row.rowHeight).toBeGreaterThanOrEqual(target * 0.625);
        expect(row.rowHeight).toBeLessThanOrEqual(target * 1.5);
      }
      expect(rows.at(-1)!.rowHeight).toBe(target);
      expect(rows.some((row) => Math.abs(row.rowHeight - target) > 1)).toBe(true);
    });
  }

  it("sets tiles 2 px apart while the rows aim for 120 to 179 px, 3 px for 180 to 239 px, and 4 px for 240 to 300 px", () => {
    const ranges = [
      { gap: 2, targets: [120, 160, 179] },
      { gap: 3, targets: [180, 210, 239] },
      { gap: 4, targets: [240, 270, 300] }
    ];
    for (const { gap, targets } of ranges) {
      for (const target of targets) {
        expect(tileGap(target, 1)).toBe(gap);
        expect(tileGap(target, 2)).toBe(gap);
        // At a fractional ratio, the nearest whole number of device pixels.
        expect(tileGap(target, 1.25)).toBe(Math.round(gap * 1.25) / 1.25);
      }
    }
  });

  for (const devicePixelRatio of DEVICE_PIXEL_RATIOS) {
    for (const target of [120, 179, 180, 239, 240, 300]) {
      it(`at ${devicePixelRatio}x and ${target} px, sets every row's tiles and the rows the gap for ${target} px apart`, () => {
        const rows = buildRows(MIXED_ASPECTS, 0, MIXED_ASPECTS.length, 920, target, devicePixelRatio);
        const gap = tileGap(target, devicePixelRatio);

        for (const row of rows) {
          expect(row.gap).toBe(gap);
          expect(gapsBetweenTiles(row)).toEqual(gapsBetweenTiles(row).map(() => expect.closeTo(gap, 9)));
          expect(getGridRowMeasuredHeight(row)).toBe(row.rowHeight + gap);
        }
      });
    }
  }

  // A row closes at or under the height the rows aim for, so its own height can fall in the range below from 180 px up.
  for (const target of [180, 240]) {
    it(`at ${target} px, sets the rows whose own heights fall in the gap's range below the gap for ${target} px apart`, () => {
      for (const devicePixelRatio of DEVICE_PIXEL_RATIOS) {
        const rows = buildRows(MIXED_ASPECTS, 0, MIXED_ASPECTS.length, 920, target, devicePixelRatio);
        const gap = tileGap(target, devicePixelRatio);

        const below = rows.filter((row) => tileGap(row.rowHeight, devicePixelRatio) !== gap);
        expect(below.length).toBeGreaterThan(0);
        for (const row of below) {
          expect(row.gap).toBe(gap);
          expect(gapsBetweenTiles(row)).toEqual(gapsBetweenTiles(row).map(() => expect.closeTo(gap, 9)));
          expect(getGridRowMeasuredHeight(row)).toBe(row.rowHeight + gap);
        }
      }
    });
  }

  for (const devicePixelRatio of DEVICE_PIXEL_RATIOS) {
    it(`at ${devicePixelRatio}x, puts every row's height and every tile's edges on whole device pixels, each full row's tiles and gaps filling its width`, () => {
      for (const target of [120, 160, 243, 300]) {
        for (const layoutWidth of [920, 919.7, 1001.3]) {
          const rows = buildRows(MIXED_ASPECTS, 0, MIXED_ASPECTS.length, layoutWidth, target, devicePixelRatio);
          // The width the rows fill, down to whole device pixels.
          const width = Math.floor(layoutWidth * devicePixelRatio) / devicePixelRatio;

          expect(rows.length).toBeGreaterThan(5);
          for (const row of rows) {
            expectWholeDevicePixels(row.rowHeight, devicePixelRatio);
            const lefts = getTileLeftOffsets(row);
            row.tiles.forEach((tile, index) => {
              expect(tile.tileHeight).toBe(row.rowHeight);
              expectWholeDevicePixels(lefts[index]!, devicePixelRatio);
              expectWholeDevicePixels(lefts[index]! + tile.tileWidth, devicePixelRatio);
            });
          }
          for (const row of rows.slice(0, -1)) {
            const tilesAndGaps = row.tiles.reduce((sum, tile) => sum + tile.tileWidth, 0) + (row.tiles.length - 1) * row.gap;
            expect(tilesAndGaps).toBeCloseTo(width, 9);
          }
          // The last row isn't stretched to the width: its tiles keep their shapes, to within a device pixel.
          const lastRow = rows.at(-1)!;
          for (const tile of lastRow.tiles) {
            expect(Math.abs(tile.tileWidth - MIXED_ASPECTS[tile.itemIndex]! * lastRow.rowHeight)).toBeLessThanOrEqual(1 / devicePixelRatio);
          }
        }
      }
    });
  }

  it("takes a whole row height from 120 to 300 px to aim for, and clamps and rounds others to the nearest", () => {
    expect([120, 160, 243, 300].every(isTargetRowHeight)).toBe(true);
    expect([100, 119, 301, 160.5, "160", null, Number.NaN].some(isTargetRowHeight)).toBe(false);
    expect(clampTargetRowHeight(243.4)).toBe(243);
    expect(clampTargetRowHeight(42)).toBe(120);
    expect(clampTargetRowHeight(512)).toBe(300);
  });

  it("buildRows honors partial range", () => {
    const aspects = [16 / 9, 4 / 3, 16 / 9];
    const rows = buildRows(aspects, 1, 3, 640, 160, 1);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tiles).toHaveLength(2);
    expect(rows[0]!.startItemIndex).toBe(1);
    expect(rows[0]!.endItemIndexExclusive).toBe(3);
  });

  it("computeAvailableLayoutWidth clamps to minimum width", () => {
    expect(computeAvailableLayoutWidth(100)).toBe(280);
    expect(computeAvailableLayoutWidth(1000)).toBe(1000);
  });
});
