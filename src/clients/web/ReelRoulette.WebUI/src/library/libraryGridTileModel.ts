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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface GridTileRenderInput {
  tileWidth: number;
  tileHeight: number;
  fileName: string;
  itemId: string;
  hasThumbnail: boolean;
  isFavorite: boolean;
  isBlacklisted: boolean;
  /** The playing item's tile, which shows the playing icon. */
  isPlaying: boolean;
}

/** The class that marks the playing item's tile. */
export const PLAYING_TILE_CLASS = "is-playing";

export function hasGridStateIndicator(isFavorite: boolean, isBlacklisted: boolean): boolean {
  return isFavorite || isBlacklisted;
}

export function renderGridTileHtml(tile: GridTileRenderInput, thumbnailUrl: string | null): string {
  const style = `width:${tile.tileWidth}px;height:${tile.tileHeight}px`;
  const imgHtml =
    tile.hasThumbnail && thumbnailUrl
      ? `<img class="library-grid-tile-image" src="${escapeHtml(thumbnailUrl)}" alt="" loading="lazy" decoding="async" />`
      : "";

  const favoriteBadge = tile.isFavorite
    ? `<span class="material-symbol-icon is-filled library-grid-tile-badge-icon">favorite</span>`
    : "";
  const blacklistBadge = tile.isBlacklisted
    ? `<span class="material-symbol-icon is-filled library-grid-tile-badge-icon">thumb_down</span>`
    : "";
  const badgeHtml = hasGridStateIndicator(tile.isFavorite, tile.isBlacklisted)
    ? `<div class="library-grid-tile-badge">${favoriteBadge}${blacklistBadge}</div>`
    : "";
  const tileClass = tile.isPlaying ? `library-grid-tile ${PLAYING_TILE_CLASS}` : "library-grid-tile";
  const name = escapeHtml(tile.fileName);

  // Every tile has the playing icon, which the stylesheet shows only on the playing tile, so the grid can move it
  // without rendering the tiles again. The name is the whole tile's tooltip.
  return `<div class="${tileClass}" style="${style}" data-item-id="${escapeHtml(tile.itemId)}" title="${name}">
  <div class="library-grid-tile-media">
    <div class="library-grid-tile-scrim">${imgHtml}</div>
    ${badgeHtml}
    <div class="library-grid-tile-playing"><span class="material-symbol-icon is-filled">play_circle</span></div>
    <div class="library-grid-tile-filename">${name}</div>
  </div>
</div>`;
}
