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
}

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
    ? `<span class="material-symbol-icon library-grid-tile-badge-icon" aria-hidden="true">favorite</span>`
    : "";
  const blacklistBadge = tile.isBlacklisted
    ? `<span class="material-symbol-icon library-grid-tile-badge-icon" aria-hidden="true">thumb_down</span>`
    : "";
  const badgeHtml = hasGridStateIndicator(tile.isFavorite, tile.isBlacklisted)
    ? `<div class="library-grid-tile-badge">${favoriteBadge}${blacklistBadge}</div>`
    : "";

  return `<div class="library-grid-tile" style="${style}" data-item-id="${escapeHtml(tile.itemId)}" tabindex="0" role="button">
  <div class="library-grid-tile-media">
    <div class="library-grid-tile-scrim">${imgHtml}</div>
    ${badgeHtml}
    <div class="library-grid-tile-filename" title="${escapeHtml(tile.fileName)}">${escapeHtml(tile.fileName)}</div>
  </div>
</div>`;
}
