import { describe, expect, it } from "vitest";
import {
  buildRows,
  computeAvailableLayoutWidth,
  FALLBACK_PHOTO_ASPECT_RATIO,
  FALLBACK_VIDEO_ASPECT_RATIO,
  getAspectRatio,
  MAX_ASPECT_RATIO,
  MAX_ROW_HEIGHT,
  MIN_ASPECT_RATIO,
  MIN_ROW_HEIGHT
} from "../library/libraryGridLayout";

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
    const result = buildRows(aspects, 0, aspects.length, 920);

    const itemCount = result.rows.reduce((sum, row) => sum + row.itemCount, 0);
    expect(itemCount).toBe(5);
    expect(result.maxColumns).toBeGreaterThanOrEqual(2);
    for (const row of result.rows) {
      expect(row.rowHeight).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT);
      expect(row.rowHeight).toBeLessThanOrEqual(MAX_ROW_HEIGHT);
    }
  });

  it("buildRows honors partial range", () => {
    const aspects = [16 / 9, 4 / 3, 16 / 9];
    const result = buildRows(aspects, 1, 3, 640);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.itemCount).toBe(2);
    expect(result.rows[0]!.startItemIndex).toBe(1);
    expect(result.rows[0]!.endItemIndexExclusive).toBe(3);
  });

  it("computeAvailableLayoutWidth clamps to minimum width", () => {
    expect(computeAvailableLayoutWidth(100)).toBe(280);
    expect(computeAvailableLayoutWidth(1000)).toBe(1000);
  });
});
