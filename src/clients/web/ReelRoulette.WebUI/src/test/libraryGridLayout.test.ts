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
  MIN_ASPECT_RATIO
} from "../library/libraryGridLayout";

/** Thumbnail shapes from tall to wide, so rows hold different numbers of tiles. */
const MIXED_ASPECTS = Array.from({ length: 300 }, (_, index) => [16 / 9, 9 / 16, 4 / 3, 3, 1, 0.25, 4][index % 7]!);

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
    const rows = buildRows(aspects, 0, aspects.length, 920, 160);

    const itemCount = rows.reduce((sum, row) => sum + row.tiles.length, 0);
    expect(itemCount).toBe(5);
    expect(Math.max(...rows.map((row) => row.tiles.length))).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.rowHeight).toBeGreaterThanOrEqual(100);
      expect(row.rowHeight).toBeLessThanOrEqual(240);
    }
  });

  it("at 160 px, closes rows where they closed before and fits them to the width with tiles 1 px apart", () => {
    const aspects = [16 / 9, 4 / 3, 16 / 9, 1, 16 / 9];
    const rows = buildRows(aspects, 0, aspects.length, 920, 160);

    // A row closes once its tiles reach the width at 160 px, and is scaled to fit it; the last keeps 160 px.
    expect(rows.map((row) => row.tiles.map((tile) => tile.itemIndex))).toEqual([[0, 1, 2, 3], [4]]);
    const fullHeight = (920 - 3) / (16 / 9 + 4 / 3 + 16 / 9 + 1);
    expect(rows[0]!.rowHeight).toBeCloseTo(fullHeight, 9);
    expect(rows[0]!.tiles.map((tile) => tile.tileWidth)).toEqual(
      [16 / 9, 4 / 3, 16 / 9, 1].map((aspect) => expect.closeTo(aspect * fullHeight, 9))
    );
    expect(rows[1]!.rowHeight).toBe(160);
    expect(rows[1]!.tiles[0]!.tileWidth).toBeCloseTo((16 / 9) * 160, 9);
  });

  for (const target of [100, 160, 300]) {
    it(`aims for rows of ${target} px, keeping each from 0.625 to 1.5 times that, with the last at ${target}`, () => {
      const rows = buildRows(MIXED_ASPECTS, 0, MIXED_ASPECTS.length, 920, target);

      expect(rows.length).toBeGreaterThan(5);
      for (const row of rows) {
        expect(row.rowHeight).toBeGreaterThanOrEqual(target * 0.625);
        expect(row.rowHeight).toBeLessThanOrEqual(target * 1.5);
      }
      expect(rows.at(-1)!.rowHeight).toBe(target);
      expect(rows.some((row) => Math.abs(row.rowHeight - target) > 1)).toBe(true);
    });

    it(`sets tiles 1 px apart across a row and between rows at ${target} px`, () => {
      const rows = buildRows(MIXED_ASPECTS, 0, MIXED_ASPECTS.length, 920, target);

      for (const row of rows.slice(0, -1)) {
        const lastTile = row.tiles.at(-1)!;
        const lefts = getTileLeftOffsets(row);
        expect(lefts[0]).toBe(0);
        for (let index = 1; index < row.tiles.length; index++) {
          expect(lefts[index]! - lefts[index - 1]! - row.tiles[index - 1]!.tileWidth).toBeCloseTo(1, 9);
        }
        expect(lefts.at(-1)! + lastTile.tileWidth).toBeCloseTo(920, 6);
      }
      for (const row of rows) {
        expect(getGridRowMeasuredHeight(row)).toBe(row.rowHeight + 1);
      }
    });
  }

  it("takes a whole row height from 100 to 300 px to aim for, and clamps and rounds others to the nearest", () => {
    expect([100, 160, 243, 300].every(isTargetRowHeight)).toBe(true);
    expect([99, 301, 160.5, "160", null, Number.NaN].some(isTargetRowHeight)).toBe(false);
    expect(clampTargetRowHeight(243.4)).toBe(243);
    expect(clampTargetRowHeight(42)).toBe(100);
    expect(clampTargetRowHeight(512)).toBe(300);
  });

  it("buildRows honors partial range", () => {
    const aspects = [16 / 9, 4 / 3, 16 / 9];
    const rows = buildRows(aspects, 1, 3, 640, 160);

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
