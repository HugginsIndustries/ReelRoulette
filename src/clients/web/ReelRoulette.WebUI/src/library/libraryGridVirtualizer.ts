import {
  buildItemAspectRatios,
  buildRows,
  getGridRowMeasuredHeight,
  type LibraryGridRowLayout
} from "./libraryGridLayout";
import type { LibraryProjectionItem } from "./libraryProjectionModel";

export const DEFAULT_GRID_OVERSCAN_PX = 900;

export interface GridOffsetIndex {
  rowTopOffsets: number[];
  rowBottomOffsets: number[];
  totalExtentHeight: number;
}

export interface VisibleGridWindow {
  firstVisibleRow: number;
  endExclusive: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
}

export interface LibraryGridVirtualizerState {
  rows: LibraryGridRowLayout[];
  offsetIndex: GridOffsetIndex;
}

export function buildGridRowsFromItems(
  items: readonly LibraryProjectionItem[],
  layoutWidth: number
): LibraryGridRowLayout[] {
  if (items.length === 0) {
    return [];
  }
  const aspects = buildItemAspectRatios(items);
  return buildRows(aspects, 0, aspects.length, layoutWidth).rows;
}

export function rebuildOffsetIndex(rows: readonly LibraryGridRowLayout[]): GridOffsetIndex {
  const rowTopOffsets: number[] = [];
  const rowBottomOffsets: number[] = [];
  let runningTop = 0;

  for (const row of rows) {
    rowTopOffsets.push(runningTop);
    runningTop += getGridRowMeasuredHeight(row);
    rowBottomOffsets.push(runningTop);
  }

  return {
    rowTopOffsets,
    rowBottomOffsets,
    totalExtentHeight: runningTop
  };
}

export function findFirstVisibleRowIndexForOffset(
  rowBottomOffsets: readonly number[],
  offsetY: number
): number {
  if (rowBottomOffsets.length === 0) {
    return 0;
  }

  const clampedOffset = Math.max(0, offsetY);
  let low = 0;
  let high = rowBottomOffsets.length - 1;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (rowBottomOffsets[mid]! <= clampedOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(Math.max(low, 0), rowBottomOffsets.length - 1);
}

export function findLastVisibleRowIndexForOffset(
  rowTopOffsets: readonly number[],
  bottomOffsetY: number
): number {
  if (rowTopOffsets.length === 0) {
    return 0;
  }

  const clampedBottom = Math.max(0, bottomOffsetY);
  let low = 0;
  let high = rowTopOffsets.length - 1;
  while (low < high) {
    const mid = low + Math.floor((high - low + 1) / 2);
    if (rowTopOffsets[mid]! < clampedBottom) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return Math.min(Math.max(low, 0), rowTopOffsets.length - 1);
}

export function findVisibleRowRange(
  offsetIndex: GridOffsetIndex,
  scrollTop: number,
  viewportHeight: number,
  overscanPx = DEFAULT_GRID_OVERSCAN_PX
): VisibleGridWindow {
  const { rowTopOffsets, rowBottomOffsets, totalExtentHeight } = offsetIndex;
  const rowCount = rowTopOffsets.length;

  if (rowCount === 0) {
    return {
      firstVisibleRow: 0,
      endExclusive: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0
    };
  }

  const viewportTop = Math.max(0, scrollTop);
  const viewportBottom = viewportTop + Math.max(0, viewportHeight);
  const startOffset = Math.max(0, viewportTop - overscanPx);
  const endOffset = Math.max(startOffset, viewportBottom + overscanPx);

  let firstVisibleRow = findFirstVisibleRowIndexForOffset(rowBottomOffsets, startOffset);
  let lastVisibleRow = findLastVisibleRowIndexForOffset(rowTopOffsets, endOffset);
  firstVisibleRow = Math.min(Math.max(firstVisibleRow, 0), rowCount - 1);
  lastVisibleRow = Math.min(Math.max(lastVisibleRow, firstVisibleRow), rowCount - 1);
  const endExclusive = lastVisibleRow + 1;

  const topSpacerHeight = rowTopOffsets[firstVisibleRow] ?? 0;
  const bottomBoundary = rowBottomOffsets[lastVisibleRow] ?? 0;
  const bottomSpacerHeight = Math.max(0, totalExtentHeight - bottomBoundary);

  return {
    firstVisibleRow,
    endExclusive,
    topSpacerHeight,
    bottomSpacerHeight
  };
}

export function createVirtualizerState(
  items: readonly LibraryProjectionItem[],
  layoutWidth: number
): LibraryGridVirtualizerState {
  const rows = buildGridRowsFromItems(items, layoutWidth);
  return {
    rows,
    offsetIndex: rebuildOffsetIndex(rows)
  };
}

export function countVisibleRows(window: VisibleGridWindow): number {
  return Math.max(0, window.endExclusive - window.firstVisibleRow);
}
