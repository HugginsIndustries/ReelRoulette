export function buildThumbnailUrl(apiBaseUrl: string, itemId: string, version: string | null = null): string {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, "");
  const encodedId = encodeURIComponent(itemId);
  const url = new URL(`/api/thumbnail/${encodedId}`, `${normalizedBase}/`);
  // The server lets the browser keep a thumbnail requested at its current version until it changes.
  if (version) {
    url.searchParams.set("v", version);
  }
  return url.toString();
}

/** The class that marks the playing item's tile. */
const PLAYING_TILE_CLASS = "is-playing";

/** What a tile shows. */
export interface GridTileView {
  tileWidth: number;
  tileHeight: number;
  fileName: string;
  /** Null for an item without a thumbnail. */
  thumbnailUrl: string | null;
  isFavorite: boolean;
  isBlacklisted: boolean;
}

/** One item's tile, kept while it stays in view and changed in place. */
export interface GridTile {
  readonly element: HTMLElement;
  /** Changes only what differs from what the tile shows, so an image already showing is never requested again. */
  update(view: GridTileView): void;
  setPlaying(playing: boolean): void;
}

function block(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

function filledIcon(name: string, className = "material-symbol-icon is-filled"): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.textContent = name;
  return icon;
}

function thumbnailImage(url: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = "library-grid-tile-image";
  image.alt = "";
  // Set before the source, so the browser waits to load it until it nears the view.
  image.setAttribute("loading", "lazy");
  image.setAttribute("decoding", "async");
  image.src = url;
  return image;
}

/**
 * Every tile has the playing icon, which the stylesheet shows only on the playing tile, so the grid can move it
 * without changing the tiles. The name is the whole tile's tooltip, and shows in the name bar with the Settings
 * tab's option.
 */
export function createGridTile(itemId: string, view: GridTileView, playing: boolean): GridTile {
  const element = block("library-grid-tile");
  element.dataset.itemId = itemId;
  const media = block("library-grid-tile-media");
  const scrim = block("library-grid-tile-scrim");
  const playingIcon = block("library-grid-tile-playing");
  playingIcon.append(filledIcon("play_circle"));
  const nameBar = block("library-grid-tile-filename");
  media.append(scrim, playingIcon, nameBar);
  element.append(media);

  let image: HTMLImageElement | null = null;
  let badge: HTMLDivElement | null = null;
  let shown: GridTileView | null = null;

  function showBadge(isFavorite: boolean, isBlacklisted: boolean): void {
    if (!isFavorite && !isBlacklisted) {
      badge?.remove();
      badge = null;
      return;
    }
    const icons: HTMLSpanElement[] = [];
    if (isFavorite) {
      icons.push(filledIcon("favorite", "material-symbol-icon is-filled library-grid-tile-badge-icon"));
    }
    if (isBlacklisted) {
      icons.push(filledIcon("thumb_down", "material-symbol-icon is-filled library-grid-tile-badge-icon"));
    }
    if (badge) {
      badge.replaceChildren(...icons);
      return;
    }
    badge = block("library-grid-tile-badge");
    badge.append(...icons);
    media.insertBefore(badge, playingIcon);
  }

  function showThumbnail(url: string | null): void {
    if (!url) {
      image?.remove();
      image = null;
    } else if (!image) {
      image = thumbnailImage(url);
      scrim.append(image);
    } else {
      image.src = url;
    }
  }

  function update(next: GridTileView): void {
    if (shown?.tileWidth !== next.tileWidth) {
      element.style.width = `${next.tileWidth}px`;
    }
    if (shown?.tileHeight !== next.tileHeight) {
      element.style.height = `${next.tileHeight}px`;
    }
    if (shown?.fileName !== next.fileName) {
      element.title = next.fileName;
      nameBar.textContent = next.fileName;
    }
    if (shown?.thumbnailUrl !== next.thumbnailUrl) {
      showThumbnail(next.thumbnailUrl);
    }
    if (shown?.isFavorite !== next.isFavorite || shown?.isBlacklisted !== next.isBlacklisted) {
      showBadge(next.isFavorite, next.isBlacklisted);
    }
    shown = { ...next };
  }

  function setPlaying(isPlaying: boolean): void {
    element.classList.toggle(PLAYING_TILE_CLASS, isPlaying);
  }

  update(view);
  setPlaying(playing);
  return { element, update, setPlaying };
}
