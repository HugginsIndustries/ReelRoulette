import type { LibraryProjectionItem } from "./libraryProjectionModel";

export function normalizeLibraryPath(path: string | null | undefined): string {
  return String(path || "").replace(/\//g, "\\").toLowerCase();
}

export interface ProjectionItemLookup {
  itemId?: string | null;
  path?: string | null;
}

export interface ItemStateChangedPayload {
  itemId?: string | null;
  path?: string | null;
  isFavorite?: boolean;
  isBlacklisted?: boolean;
}

export interface PlaybackRecordedPayload {
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

export function findProjectionItem(
  items: readonly LibraryProjectionItem[],
  lookup: ProjectionItemLookup
): LibraryProjectionItem | null {
  const itemId = lookup.itemId != null ? String(lookup.itemId).trim() : "";
  if (itemId) {
    const byId = items.find((item) => item.id === itemId);
    if (byId) {
      return byId;
    }
  }

  const path = lookup.path != null ? String(lookup.path).trim() : "";
  if (!path) {
    return null;
  }

  const normalizedPath = normalizeLibraryPath(path);
  return (
    items.find((item) => {
      if (item.fullPath && normalizeLibraryPath(item.fullPath) === normalizedPath) {
        return true;
      }
      return normalizeLibraryPath(item.id) === normalizedPath;
    }) ?? null
  );
}

export function applyItemStateChanged(
  items: LibraryProjectionItem[],
  payload: ItemStateChangedPayload
): ItemStatePatchResult {
  const item = findProjectionItem(items, {
    itemId: payload.itemId,
    path: payload.path
  });
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
  const item = findProjectionItem(items, { path: payload.path });
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
