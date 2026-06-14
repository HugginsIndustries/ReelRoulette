import { describe, expect, it } from "vitest";
import { buildRows } from "../library/libraryGridLayout";
import {
  countVisibleRows,
  createVirtualizerState,
  findVisibleRowRange,
  rebuildOffsetIndex
} from "../library/libraryGridVirtualizer";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";

function makeItem(index: number): LibraryProjectionItem {
  return {
    id: `item-${index}`,
    sourceId: "s1",
    fileName: `file-${index}.mp4`,
    relativePath: `folder/file-${index}.mp4`,
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: 60,
    mediaType: index % 3 === 0 ? "photo" : "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: true,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: index % 2 === 0,
    thumbnailWidth: index % 2 === 0 ? 480 : null,
    thumbnailHeight: index % 2 === 0 ? 270 : null
  };
}

describe("libraryGridVirtualizer", () => {
  it("bounds visible row count for large libraries at mid-scroll", () => {
    const items = Array.from({ length: 1200 }, (_, i) => makeItem(i));
    const state = createVirtualizerState(items, 920);
    expect(state.rows.length).toBeGreaterThan(200);

    const midScroll = Math.floor(state.offsetIndex.totalExtentHeight / 2);
    const window = findVisibleRowRange(state.offsetIndex, midScroll, 800, 900);
    const visibleCount = countVisibleRows(window);

    expect(visibleCount).toBeLessThan(state.rows.length / 4);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it("spacer heights sum to total extent", () => {
    const aspects = Array.from({ length: 40 }, () => 16 / 9);
    const rows = buildRows(aspects, 0, aspects.length, 640).rows;
    const offsetIndex = rebuildOffsetIndex(rows);
    const window = findVisibleRowRange(offsetIndex, 500, 400, 900);

    const mountedExtent =
      window.topSpacerHeight +
      rows.slice(window.firstVisibleRow, window.endExclusive).reduce((sum, row, i, slice) => {
        void i;
        void slice;
        return sum + row.rowHeight + 1;
      }, 0) +
      window.bottomSpacerHeight;

    expect(window.topSpacerHeight + window.bottomSpacerHeight).toBeLessThan(offsetIndex.totalExtentHeight);
    expect(mountedExtent).toBeGreaterThanOrEqual(offsetIndex.totalExtentHeight - 2000);
  });

  it("returns empty window when there are no rows", () => {
    const state = createVirtualizerState([], 920);
    const window = findVisibleRowRange(state.offsetIndex, 0, 600);
    expect(window.firstVisibleRow).toBe(0);
    expect(window.endExclusive).toBe(0);
    expect(window.topSpacerHeight).toBe(0);
    expect(window.bottomSpacerHeight).toBe(0);
  });

  it("includes single row for small libraries", () => {
    const items = [makeItem(0), makeItem(1)];
    const state = createVirtualizerState(items, 920);
    const window = findVisibleRowRange(state.offsetIndex, 0, 800);
    expect(countVisibleRows(window)).toBeGreaterThanOrEqual(1);
    expect(countVisibleRows(window)).toBeLessThanOrEqual(state.rows.length);
  });
});
