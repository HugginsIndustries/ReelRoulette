import type { LibraryMediaType, LibraryProjectionItem } from "./libraryProjectionModel";

export type LibraryGridMediaType = "video" | "photo";

/** The row height the Library tab's justified rows aim for until a zoom over the grid sets this device's own. */
export const DEFAULT_TARGET_ROW_HEIGHT = 160;
/** Ctrl+scroll or a pinch over the grid zooms the row height the rows aim for within these, in whole pixels. */
export const MIN_TARGET_ROW_HEIGHT = 100;
export const MAX_TARGET_ROW_HEIGHT = 300;
/** A row's height stays within these shares of the row height the rows aim for: 100 to 240 px at 160. */
export const SHORTEST_ROW_RATIO = 0.625;
export const TALLEST_ROW_RATIO = 1.5;
/** Tiles sit this far apart, across a row and between rows, at every row height. */
export const TILE_GAP = 1;
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
}

/** A row height the rows can aim for: a whole number of pixels within the zoom's range. */
export function isTargetRowHeight(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_TARGET_ROW_HEIGHT && (value as number) <= MAX_TARGET_ROW_HEIGHT;
}

/** The nearest row height the rows can aim for. */
export function clampTargetRowHeight(height: number): number {
  return Math.round(Math.min(MAX_TARGET_ROW_HEIGHT, Math.max(MIN_TARGET_ROW_HEIGHT, height)));
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
 * that height and is scaled to fit it, and the last row keeps its tiles' shapes at that height.
 */
export function buildRows(
  itemAspectRatios: readonly number[],
  startIndex: number,
  endExclusive: number,
  layoutWidth: number,
  targetRowHeight: number
): LibraryGridRowLayout[] {
  const rows: LibraryGridRowLayout[] = [];
  const shortestRow = targetRowHeight * SHORTEST_ROW_RATIO;
  const tallestRow = targetRowHeight * TALLEST_ROW_RATIO;

  const pendingAspects: number[] = [];
  const pendingItemIndexes: number[] = [];
  let pendingAspectSum = 0;

  const addRow = (isLastRow: boolean) => {
    if (pendingAspects.length === 0) {
      return;
    }

    let rowHeight = isLastRow
      ? targetRowHeight
      : (layoutWidth - (pendingAspects.length - 1) * TILE_GAP) / Math.max(0.01, pendingAspectSum);
    rowHeight = Math.min(tallestRow, Math.max(shortestRow, rowHeight));

    const widths = pendingAspects.map((aspect) => Math.max(1, aspect * rowHeight));
    if (!isLastRow) {
      const widthDelta = layoutWidth - (pendingAspects.length - 1) * TILE_GAP - widths.reduce((a, b) => a + b, 0);
      widths[widths.length - 1] = Math.max(1, widths[widths.length - 1]! + widthDelta);
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
      rowHeight
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

    const projectedWidth = pendingAspectSum * targetRowHeight + (pendingAspects.length - 1) * TILE_GAP;
    if (projectedWidth >= layoutWidth && pendingAspects.length > 0) {
      addRow(false);
    }
  }

  addRow(true);
  return rows;
}

export function getGridRowMeasuredHeight(row: LibraryGridRowLayout): number {
  const rowHeight = row.rowHeight > 0 ? row.rowHeight : row.tiles.length > 0 ? row.tiles[0]!.tileHeight : 0;
  return Math.max(1, rowHeight) + TILE_GAP;
}

/** How far each of the row's tiles sits from the row's left edge. */
export function getTileLeftOffsets(row: LibraryGridRowLayout): number[] {
  const lefts: number[] = [];
  let left = 0;
  for (const tile of row.tiles) {
    lefts.push(left);
    left += tile.tileWidth + TILE_GAP;
  }
  return lefts;
}
