import type { LibraryProjectionItem } from "./libraryProjectionModel";

export interface ItemStateChangedPayload {
  itemId?: string | null;
  path?: string | null;
  isFavorite?: boolean;
  isBlacklisted?: boolean;
  previousIsFavorite?: boolean | null;
  previousIsBlacklisted?: boolean | null;
}

export interface PlaybackRecordedPayload {
  itemId?: string | null;
  path?: string | null;
  playCount?: number | null;
  lastPlayedUtc?: string | number | null;
}

export interface ItemStatePatchResult {
  changed: boolean;
  item: LibraryProjectionItem | null;
  before: LibraryProjectionItem | null;
}

export interface PlaybackPatchResult {
  changed: boolean;
  item: LibraryProjectionItem | null;
}

/** Items are matched by catalog id only, so two files whose paths differ only in case stay apart. */
export function findProjectionItem(
  items: readonly LibraryProjectionItem[],
  itemId: string | null | undefined
): LibraryProjectionItem | null {
  const id = itemId != null ? String(itemId).trim() : "";
  if (!id) {
    return null;
  }
  return items.find((item) => item.id === id) ?? null;
}

export function applyItemStateChanged(
  items: LibraryProjectionItem[],
  payload: ItemStateChangedPayload
): ItemStatePatchResult {
  const item = findProjectionItem(items, payload.itemId);
  if (!item) {
    return { changed: false, item: null, before: null };
  }

  const before = { ...item };
  const nextFavorite = payload.isFavorite === true;
  const nextBlacklisted = payload.isBlacklisted === true;
  if (item.isFavorite === nextFavorite && item.isBlacklisted === nextBlacklisted) {
    return { changed: false, item, before };
  }

  item.isFavorite = nextFavorite;
  item.isBlacklisted = nextBlacklisted;
  return { changed: true, item, before };
}

export function applyPlaybackRecorded(
  items: LibraryProjectionItem[],
  payload: PlaybackRecordedPayload
): PlaybackPatchResult {
  const item = findProjectionItem(items, payload.itemId);
  if (!item) {
    return { changed: false, item: null };
  }

  const hasPlayCount = typeof payload.playCount === "number" && Number.isFinite(payload.playCount);
  const parsedLastPlayed = parsePlaybackLastPlayedUtcMs(payload.lastPlayedUtc);
  if (!hasPlayCount && parsedLastPlayed == null) {
    return { changed: false, item };
  }

  const nextPlayCount = hasPlayCount ? Math.max(0, Math.trunc(payload.playCount as number)) : item.playCount;
  const nextLastPlayedUtcMs = parsedLastPlayed ?? item.lastPlayedUtcMs;

  if (item.playCount === nextPlayCount && item.lastPlayedUtcMs === nextLastPlayedUtcMs) {
    return { changed: false, item };
  }

  item.playCount = nextPlayCount;
  item.lastPlayedUtcMs = nextLastPlayedUtcMs;
  return { changed: true, item };
}

function parsePlaybackLastPlayedUtcMs(value: string | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}
