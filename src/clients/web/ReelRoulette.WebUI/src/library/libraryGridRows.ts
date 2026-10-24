import type { LibraryGridRowLayout } from "./libraryGridLayout";
import { buildThumbnailUrl, createGridTile, type GridTile, type GridTileView } from "./libraryGridTile";
import type { LibraryProjectionItem } from "./libraryProjectionModel";

/** The grid's rows in view, kept while they stay in view, with each item's tile moved into whichever row holds it. */
export interface LibraryGridRows {
  /**
   * Shows rows `first` to `end` (exclusive) of `rows`. A row shown before keeps its element and a tile shown before
   * keeps its element and image, moved to its new place and changed only where it differs, so tiles already showing
   * neither flicker nor load again. Only rows and tiles coming into view are created.
   */
  show(rows: readonly LibraryGridRowLayout[], first: number, end: number, items: readonly LibraryProjectionItem[]): void;
  /** Marks the playing item's tile, or none, on the tiles shown and on those created later. */
  setPlayingItemId(itemId: string | null): void;
  clear(): void;
}

/**
 * Puts `children` in `parent` in order, removing any other children first, so the children that stay in order aren't
 * moved and only those out of place are.
 */
function placeChildren(parent: HTMLElement, children: readonly HTMLElement[]): void {
  const wanted = new Set<Element>(children);
  for (const child of Array.from(parent.children)) {
    if (!wanted.has(child)) {
      child.remove();
    }
  }
  children.forEach((child, index) => {
    const current = parent.children[index] ?? null;
    if (current !== child) {
      parent.insertBefore(child, current);
    }
  });
}

interface ShownRow {
  element: HTMLElement;
  height: number;
}

export function createLibraryGridRows(container: HTMLElement, apiBaseUrl: string): LibraryGridRows {
  /** By the row's index in the layout. */
  let shownRows = new Map<number, ShownRow>();
  /**
   * By item id. An item loaded twice, as when the library changes between two pages, has a tile for each place it
   * shows in.
   */
  let shownTiles = new Map<string, GridTile[]>();
  let playingItemId: string | null = null;

  function tileView(item: LibraryProjectionItem, tileWidth: number, tileHeight: number): GridTileView {
    return {
      tileWidth,
      tileHeight,
      fileName: item.fileName,
      thumbnailUrl: item.hasThumbnail ? buildThumbnailUrl(apiBaseUrl, item.id, item.thumbnailVersion) : null,
      isFavorite: item.isFavorite,
      isBlacklisted: item.isBlacklisted
    };
  }

  function show(
    rows: readonly LibraryGridRowLayout[],
    first: number,
    end: number,
    items: readonly LibraryProjectionItem[]
  ): void {
    const nextRows = new Map<number, ShownRow>();
    const nextTiles = new Map<string, GridTile[]>();
    const rowElements: HTMLElement[] = [];

    for (let index = first; index < end; index++) {
      const layout = rows[index];
      if (!layout) {
        continue;
      }
      let row = shownRows.get(index);
      if (!row) {
        const element = document.createElement("div");
        element.className = "library-grid-row";
        row = { element, height: Number.NaN };
      }
      if (row.height !== layout.rowHeight) {
        row.element.style.height = `${layout.rowHeight}px`;
        row.height = layout.rowHeight;
      }

      const tileElements: HTMLElement[] = [];
      for (const tileLayout of layout.tiles) {
        const item = items[tileLayout.itemIndex];
        if (!item) {
          continue;
        }
        const view = tileView(item, tileLayout.tileWidth, tileLayout.tileHeight);
        let tile = shownTiles.get(item.id)?.shift();
        if (tile) {
          tile.update(view);
        } else {
          tile = createGridTile(item.id, view, item.id === playingItemId);
        }
        const sameItem = nextTiles.get(item.id);
        if (sameItem) {
          sameItem.push(tile);
        } else {
          nextTiles.set(item.id, [tile]);
        }
        tileElements.push(tile.element);
      }
      placeChildren(row.element, tileElements);
      nextRows.set(index, row);
      rowElements.push(row.element);
    }

    placeChildren(container, rowElements);
    shownRows = nextRows;
    shownTiles = nextTiles;
  }

  function markPlaying(itemId: string | null, playing: boolean): void {
    if (itemId === null) {
      return;
    }
    for (const tile of shownTiles.get(itemId) ?? []) {
      tile.setPlaying(playing);
    }
  }

  // Changes only the tiles that start or stop playing.
  function setPlayingItemId(itemId: string | null): void {
    if (itemId === playingItemId) {
      return;
    }
    markPlaying(playingItemId, false);
    playingItemId = itemId;
    markPlaying(itemId, true);
  }

  function clear(): void {
    container.replaceChildren();
    shownRows = new Map();
    shownTiles = new Map();
  }

  return { show, setPlayingItemId, clear };
}
