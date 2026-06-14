import type { LibraryGridRowLayout } from "./libraryGridLayout";
import type { LibraryProjectionItem } from "./libraryProjectionModel";
import { buildThumbnailUrl, renderGridTileHtml } from "./libraryGridTileModel";

export function renderGridRowHtml(
  row: LibraryGridRowLayout,
  items: readonly LibraryProjectionItem[],
  apiBaseUrl: string
): string {
  const tiles = row.tiles
    .map((tileLayout) => {
      const item = items[tileLayout.itemIndex];
      if (!item) {
        return "";
      }
      const thumbnailUrl = item.hasThumbnail ? buildThumbnailUrl(apiBaseUrl, item.id) : null;
      return renderGridTileHtml(
        {
          tileWidth: tileLayout.tileWidth,
          tileHeight: tileLayout.tileHeight,
          fileName: item.fileName,
          itemId: item.id,
          hasThumbnail: item.hasThumbnail,
          isFavorite: item.isFavorite,
          isBlacklisted: item.isBlacklisted
        },
        thumbnailUrl
      );
    })
    .join("");

  return `<div class="library-grid-row" style="height:${row.rowHeight}px">${tiles}</div>`;
}
