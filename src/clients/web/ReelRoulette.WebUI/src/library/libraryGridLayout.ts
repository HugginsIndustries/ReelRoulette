import type { LibraryMediaType, LibraryProjectionItem } from "./libraryProjectionModel";

export type LibraryGridMediaType = "video" | "photo";

export const TARGET_ROW_HEIGHT = 300;
export const MIN_ROW_HEIGHT = 200;
export const MAX_ROW_HEIGHT = 400;
export const HORIZONTAL_GAP = 2;
export const VERTICAL_ROW_GAP = 1;
export const MIN_LAYOUT_WIDTH = 280;
export const MIN_ASPECT_RATIO = 0.25;
export const MAX_ASPECT_RATIO = 4.0;
export const FALLBACK_PHOTO_ASPECT_RATIO = 4 / 3;
export const FALLBACK_VIDEO_ASPECT_RATIO = 16 / 9;
export const FALLBACK_HEIGHT = 100;

export interface LibraryGridTileLayout {
  tileWidth: number;
  tileHeight: number;
  itemIndex: number;
  aspectRatioUsed: number;
}

export interface LibraryGridRowLayout {
  tiles: LibraryGridTileLayout[];
  startItemIndex: number;
  endItemIndexExclusive: number;
  itemCount: number;
  rowHeight: number;
  rowWidth: number;
}

export interface LibraryGridLayoutResult {
  rows: LibraryGridRowLayout[];
  maxColumns: number;
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

export function getFallbackThumbnailDimensions(mediaType: LibraryGridMediaType): { width: number; height: number } {
  const aspect = mediaType === "photo" ? FALLBACK_PHOTO_ASPECT_RATIO : FALLBACK_VIDEO_ASPECT_RATIO;
  return { width: FALLBACK_HEIGHT * aspect, height: FALLBACK_HEIGHT };
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

export function buildRows(
  itemAspectRatios: readonly number[],
  startIndex: number,
  endExclusive: number,
  layoutWidth: number
): LibraryGridLayoutResult {
  let maxColumns = 1;
  const rows: LibraryGridRowLayout[] = [];

  const pendingAspects: number[] = [];
  const pendingItemIndexes: number[] = [];
  let pendingAspectSum = 0;

  const addRow = (isLastRow: boolean) => {
    if (pendingAspects.length === 0) {
      return;
    }

    let rowHeight = isLastRow
      ? TARGET_ROW_HEIGHT
      : (layoutWidth - (pendingAspects.length - 1) * HORIZONTAL_GAP) / Math.max(0.01, pendingAspectSum);
    rowHeight = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, rowHeight));

    const widths = pendingAspects.map((aspect) => Math.max(1, aspect * rowHeight));
    if (!isLastRow) {
      const widthDelta = layoutWidth - (pendingAspects.length - 1) * HORIZONTAL_GAP - widths.reduce((a, b) => a + b, 0);
      widths[widths.length - 1] = Math.max(1, widths[widths.length - 1]! + widthDelta);
    }

    const tiles: LibraryGridTileLayout[] = [];
    for (let i = 0; i < pendingAspects.length; i++) {
      tiles.push({
        tileWidth: widths[i]!,
        tileHeight: rowHeight,
        itemIndex: pendingItemIndexes[i]!,
        aspectRatioUsed: pendingAspects[i]!
      });
    }

    rows.push({
      tiles,
      startItemIndex: pendingItemIndexes[0]!,
      endItemIndexExclusive: pendingItemIndexes[pendingItemIndexes.length - 1]! + 1,
      itemCount: tiles.length,
      rowHeight,
      rowWidth: widths.reduce((a, b) => a + b, 0) + (tiles.length - 1) * HORIZONTAL_GAP
    });
    maxColumns = Math.max(maxColumns, tiles.length);

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

    const projectedWidth = pendingAspectSum * TARGET_ROW_HEIGHT + (pendingAspects.length - 1) * HORIZONTAL_GAP;
    if (projectedWidth >= layoutWidth && pendingAspects.length > 0) {
      addRow(false);
    }
  }

  addRow(true);
  return { rows, maxColumns };
}

export function getGridRowMeasuredHeight(row: LibraryGridRowLayout): number {
  const rowHeight = row.rowHeight > 0 ? row.rowHeight : row.tiles.length > 0 ? row.tiles[0]!.tileHeight : 0;
  return Math.max(1, rowHeight) + VERTICAL_ROW_GAP;
}
