import type { LibraryMediaType, LibraryProjectionItem } from "./libraryProjectionModel";

export type LibraryGridMediaType = "video" | "photo";

/** The row height the Library tab's justified rows aim for until a zoom over the grid sets this device's own. */
export const DEFAULT_TARGET_ROW_HEIGHT = 160;
/** Ctrl+scroll or a pinch over the grid zooms the row height the rows aim for within these, in whole pixels. */
export const MIN_TARGET_ROW_HEIGHT = 120;
export const MAX_TARGET_ROW_HEIGHT = 300;
/** A row's height stays within these shares of the row height the rows aim for: 100 to 240 px at 160. */
export const SHORTEST_ROW_RATIO = 0.625;
export const TALLEST_ROW_RATIO = 1.5;
export const MIN_LAYOUT_WIDTH = 280;
export const MIN_ASPECT_RATIO = 0.25;
export const MAX_ASPECT_RATIO = 4.0;
export const FALLBACK_PHOTO_ASPECT_RATIO = 4 / 3;
export const FALLBACK_VIDEO_ASPECT_RATIO = 16 / 9;

export interface LibraryGridTileLayout {
  tileWidth: number;
  tileHeight: number;
  itemIndex: number;
}

export interface LibraryGridRowLayout {
  tiles: LibraryGridTileLayout[];
  startItemIndex: number;
  endItemIndexExclusive: number;
  rowHeight: number;
  /** How far apart the row's tiles sit, and how far below it the next row starts. */
  gap: number;
}

/** A row height the rows can aim for: a whole number of pixels within the zoom's range. */
export function isTargetRowHeight(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_TARGET_ROW_HEIGHT && (value as number) <= MAX_TARGET_ROW_HEIGHT;
}

/** The nearest row height the rows can aim for. */
export function clampTargetRowHeight(height: number): number {
  return Math.round(Math.min(MAX_TARGET_ROW_HEIGHT, Math.max(MIN_TARGET_ROW_HEIGHT, height)));
}

/** A size in CSS pixels, rounded to whole device pixels. */
function snapToDevicePixels(value: number, devicePixelRatio: number): number {
  return Math.round(value * devicePixelRatio) / devicePixelRatio;
}

/**
 * How far apart tiles sit, across a row and between rows, in CSS pixels. The row height the rows aim for sets it, not
 * each row's own height, so every gap on screen is the same: 2 px from 120 to 179 px, 3 px from 180 to 239 px, and 4 px
 * from 240 to 300 px. It's rounded to whole device pixels, so every gap draws the same width.
 */
export function tileGap(targetRowHeight: number, devicePixelRatio: number): number {
  const gap = targetRowHeight < 180 ? 2 : targetRowHeight < 240 ? 3 : 4;
  return snapToDevicePixels(gap, devicePixelRatio);
}

export function computeAvailableLayoutWidth(measuredViewportWidth: number): number {
  return Math.max(MIN_LAYOUT_WIDTH, measuredViewportWidth);
}

export function getAspectRatio(
  thumbnailWidth: number,
  thumbnailHeight: number,
  mediaType: LibraryGridMediaType
): number {
  if (thumbnailWidth > 0 && thumbnailHeight > 0) {
    return Math.min(
      MAX_ASPECT_RATIO,
      Math.max(MIN_ASPECT_RATIO, thumbnailWidth / thumbnailHeight)
    );
  }

  return mediaType === "photo" ? FALLBACK_PHOTO_ASPECT_RATIO : FALLBACK_VIDEO_ASPECT_RATIO;
}

export function projectionMediaTypeToGridMediaType(mediaType: LibraryMediaType): LibraryGridMediaType {
  return mediaType === "photo" ? "photo" : "video";
}

export function getProjectionItemAspectRatio(item: LibraryProjectionItem): number {
  const gridMediaType = projectionMediaTypeToGridMediaType(item.mediaType);
  return getAspectRatio(
    item.thumbnailWidth ?? 0,
    item.thumbnailHeight ?? 0,
    gridMediaType
  );
}

export function buildItemAspectRatios(items: readonly LibraryProjectionItem[]): number[] {
  return items.map((item) => getProjectionItemAspectRatio(item));
}

/**
 * Lays the items out in justified rows that aim for `targetRowHeight`: a row closes once its tiles reach the width at
 * that height and is scaled to fit it, and the last row keeps its tiles' shapes at that height. Each row's height and
 * each tile's edges land on whole device pixels, so every gap draws exactly the gap's width rather than a pixel more
 * where rounding falls.
 */
export function buildRows(
  itemAspectRatios: readonly number[],
  startIndex: number,
  endExclusive: number,
  layoutWidth: number,
  targetRowHeight: number,
  devicePixelRatio: number
): LibraryGridRowLayout[] {
  const rows: LibraryGridRowLayout[] = [];
  const shortestRow = targetRowHeight * SHORTEST_ROW_RATIO;
  const tallestRow = targetRowHeight * TALLEST_ROW_RATIO;
  const gap = tileGap(targetRowHeight, devicePixelRatio);
  const width = Math.floor(layoutWidth * devicePixelRatio) / devicePixelRatio;

  const pendingAspects: number[] = [];
  const pendingItemIndexes: number[] = [];
  let pendingAspectSum = 0;

  const addRow = (isLastRow: boolean) => {
    if (pendingAspects.length === 0) {
      return;
    }

    let rowHeight = isLastRow
      ? targetRowHeight
      : (width - (pendingAspects.length - 1) * gap) / Math.max(0.01, pendingAspectSum);
    rowHeight = snapToDevicePixels(Math.min(tallestRow, Math.max(shortestRow, rowHeight)), devicePixelRatio);

    const widths = pendingAspects.map((aspect) => Math.max(1, aspect * rowHeight));
    if (!isLastRow) {
      const widthDelta = width - (pendingAspects.length - 1) * gap - widths.reduce((a, b) => a + b, 0);
      widths[widths.length - 1] = Math.max(1, widths[widths.length - 1]! + widthDelta);
    }
    // Each tile's right edge, from the running total, rounded to a device pixel, so the widths still add up to the row's.
    let edge = 0;
    let total = 0;
    for (let i = 0; i < widths.length; i++) {
      total += widths[i]!;
      const next = snapToDevicePixels(total, devicePixelRatio);
      widths[i] = next - edge;
      edge = next;
    }

    const tiles: LibraryGridTileLayout[] = [];
    for (let i = 0; i < pendingAspects.length; i++) {
      tiles.push({
        tileWidth: widths[i]!,
        tileHeight: rowHeight,
        itemIndex: pendingItemIndexes[i]!
      });
    }

    rows.push({
      tiles,
      startItemIndex: pendingItemIndexes[0]!,
      endItemIndexExclusive: pendingItemIndexes[pendingItemIndexes.length - 1]! + 1,
      rowHeight,
      gap
    });

    pendingAspects.length = 0;
    pendingItemIndexes.length = 0;
    pendingAspectSum = 0;
  };

  const clampedStart = Math.min(Math.max(startIndex, 0), itemAspectRatios.length);
  const clampedEnd = Math.min(Math.max(endExclusive, clampedStart), itemAspectRatios.length);

  for (let itemIndex = clampedStart; itemIndex < clampedEnd; itemIndex++) {
    const aspect = itemAspectRatios[itemIndex]!;
    pendingAspects.push(aspect);
    pendingItemIndexes.push(itemIndex);
    pendingAspectSum += aspect;

    if (pendingAspectSum * targetRowHeight + (pendingAspects.length - 1) * gap >= width) {
      addRow(false);
    }
  }

  addRow(true);
  return rows;
}

export function getGridRowMeasuredHeight(row: LibraryGridRowLayout): number {
  const rowHeight = row.rowHeight > 0 ? row.rowHeight : row.tiles.length > 0 ? row.tiles[0]!.tileHeight : 0;
  return Math.max(1, rowHeight) + row.gap;
}

/** How far each of the row's tiles sits from the row's left edge. */
export function getTileLeftOffsets(row: LibraryGridRowLayout): number[] {
  const lefts: number[] = [];
  let left = 0;
  for (const tile of row.tiles) {
    lefts.push(left);
    left += tile.tileWidth + row.gap;
  }
  return lefts;
}
