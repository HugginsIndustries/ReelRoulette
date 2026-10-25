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
  /** Marks the selected items' tiles, as `isSelected` says, on the tiles shown and on those shown later. */
  setSelection(isSelected: (itemId: string) => boolean): void;
  /** The tiles shown, in layout order. */
  shownTiles(): readonly ShownTile[];
  clear(): void;
}

/** A tile shown, with its row's index in the layout and its place in that row. */
export interface ShownTile {
  element: HTMLElement;
  row: number;
  slot: number;
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
  let shownList: ShownTile[] = [];
  let playingItemId: string | null = null;
  let isSelected: (itemId: string) => boolean = () => false;

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
    const nextList: ShownTile[] = [];
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
      layout.tiles.forEach((tileLayout, slot) => {
        const item = items[tileLayout.itemIndex];
        if (!item) {
          return;
        }
        const view = tileView(item, tileLayout.tileWidth, tileLayout.tileHeight);
        let tile = shownTiles.get(item.id)?.shift();
        if (tile) {
          tile.update(view);
          tile.setSelected(isSelected(item.id));
        } else {
          tile = createGridTile(item.id, view, item.id === playingItemId, isSelected(item.id));
        }
        const sameItem = nextTiles.get(item.id);
        if (sameItem) {
          sameItem.push(tile);
        } else {
          nextTiles.set(item.id, [tile]);
        }
        tileElements.push(tile.element);
        nextList.push({ element: tile.element, row: index, slot });
      });
      placeChildren(row.element, tileElements);
      nextRows.set(index, row);
      rowElements.push(row.element);
    }

    placeChildren(container, rowElements);
    shownRows = nextRows;
    shownTiles = nextTiles;
    shownList = nextList;
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

  // Changes only the tiles whose mark differs.
  function setSelection(next: (itemId: string) => boolean): void {
    isSelected = next;
    for (const [itemId, tiles] of shownTiles) {
      const selected = next(itemId);
      for (const tile of tiles) {
        tile.setSelected(selected);
      }
    }
  }

  function clear(): void {
    container.replaceChildren();
    shownRows = new Map();
    shownTiles = new Map();
    shownList = [];
  }

  return { show, setPlayingItemId, setSelection, shownTiles: () => shownList, clear };
}
