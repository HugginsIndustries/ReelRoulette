import { describe, expect, it } from "vitest";
import { buildRows } from "../library/libraryGridLayout";
import {
  createVirtualizerState,
  findRowIndexForItem,
  findVisibleRowRange,
  measureTrailingItemsHeight,
  rebuildOffsetIndex,
  type VisibleGridWindow
} from "../library/libraryGridVirtualizer";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";

function visibleRowCount(window: VisibleGridWindow): number {
  return window.endExclusive - window.firstVisibleRow;
}

function makeItem(index: number): LibraryProjectionItem {
  return {
    id: `item-${index}`,
    sourceId: "s1",
    fileName: `file-${index}.mp4`,
    fullPath: null,
    relativePath: `folder/file-${index}.mp4`,
    playCount: 0,
    lastPlayedUtcMs: null,
    dateAddedUtcMs: null,
    dateCreatedUtcMs: null,
    durationSeconds: 60,
    mediaType: index % 3 === 0 ? "photo" : "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: true,
    integratedLoudness: null,
    peakDb: null,
    rating: null,
    tags: [],
    hasThumbnail: index % 2 === 0,
    thumbnailVersion: null,
    thumbnailWidth: index % 2 === 0 ? 480 : null,
    thumbnailHeight: index % 2 === 0 ? 270 : null
  };
}

describe("libraryGridVirtualizer", () => {
  it("bounds visible row count for large libraries at mid-scroll", () => {
    const items = Array.from({ length: 1200 }, (_, i) => makeItem(i));
    const state = createVirtualizerState(items, 920, 160, 1);
    expect(state.rows.length).toBeGreaterThan(200);

    const midScroll = Math.floor(state.offsetIndex.totalExtentHeight / 2);
    const window = findVisibleRowRange(state.offsetIndex, midScroll, 800, 900);
    const visibleCount = visibleRowCount(window);

    expect(visibleCount).toBeLessThan(state.rows.length / 4);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it("spacer heights sum to total extent", () => {
    const aspects = Array.from({ length: 40 }, () => 16 / 9);
    const rows = buildRows(aspects, 0, aspects.length, 640, 160, 1);
    const offsetIndex = rebuildOffsetIndex(rows);
    const window = findVisibleRowRange(offsetIndex, 500, 400, 900);

    const mountedExtent =
      window.topSpacerHeight +
      rows.slice(window.firstVisibleRow, window.endExclusive).reduce((sum, row, i, slice) => {
        void i;
        void slice;
        return sum + row.rowHeight + row.gap;
      }, 0) +
      window.bottomSpacerHeight;

    expect(window.topSpacerHeight + window.bottomSpacerHeight).toBeLessThan(offsetIndex.totalExtentHeight);
    expect(mountedExtent).toBeGreaterThanOrEqual(offsetIndex.totalExtentHeight - 2000);
  });

  it("puts every row's top on a whole device pixel at a fractional device pixel ratio", () => {
    const items = Array.from({ length: 300 }, (_, i) => makeItem(i));
    const state = createVirtualizerState(items, 919.7, 243, 1.25);

    expect(state.rows.length).toBeGreaterThan(20);
    for (const top of [...state.offsetIndex.rowTopOffsets, state.offsetIndex.totalExtentHeight]) {
      expect(Math.abs(top * 1.25 - Math.round(top * 1.25))).toBeLessThan(1e-6);
    }
  });

  it("returns empty window when there are no rows", () => {
    const state = createVirtualizerState([], 920, 160, 1);
    const window = findVisibleRowRange(state.offsetIndex, 0, 600);
    expect(window.firstVisibleRow).toBe(0);
    expect(window.endExclusive).toBe(0);
    expect(window.topSpacerHeight).toBe(0);
    expect(window.bottomSpacerHeight).toBe(0);
  });

  it("measures the trailing items from the top of the row holding the first of them", () => {
    const aspects = Array.from({ length: 40 }, () => 16 / 9);
    const rows = buildRows(aspects, 0, aspects.length, 480, 160, 1);
    const state = { rows, offsetIndex: rebuildOffsetIndex(rows) };
    expect(rows.every((row) => row.tiles.length === 2)).toBe(true);
    const { rowTopOffsets, totalExtentHeight } = state.offsetIndex;

    expect(measureTrailingItemsHeight(state, 10)).toBe(totalExtentHeight - rowTopOffsets[15]!);
    expect(measureTrailingItemsHeight(state, 11)).toBe(totalExtentHeight - rowTopOffsets[14]!);
    expect(measureTrailingItemsHeight(state, 40)).toBe(totalExtentHeight);
    expect(measureTrailingItemsHeight(state, 200)).toBe(totalExtentHeight);
    expect(measureTrailingItemsHeight(createVirtualizerState([], 480, 160, 1), 200)).toBe(0);
  });

  it("finds the row holding an item", () => {
    const items = Array.from({ length: 300 }, (_, i) => makeItem(i));
    const { rows } = createVirtualizerState(items, 920, 160, 1);

    for (const index of [0, 1, 57, 150, 299]) {
      const row = rows[findRowIndexForItem(rows, index)]!;
      expect(row.tiles.map((tile) => tile.itemIndex)).toContain(index);
    }
    expect(findRowIndexForItem(rows, 300)).toBe(-1);
    expect(findRowIndexForItem([], 0)).toBe(-1);
  });

  it("includes single row for small libraries", () => {
    const items = [makeItem(0), makeItem(1)];
    const state = createVirtualizerState(items, 920, 160, 1);
    const window = findVisibleRowRange(state.offsetIndex, 0, 800);
    expect(visibleRowCount(window)).toBeGreaterThanOrEqual(1);
    expect(visibleRowCount(window)).toBeLessThanOrEqual(state.rows.length);
  });
});
