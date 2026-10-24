import { parseRating } from "../rating/rating";
import type { ItemRatingChangedPayload } from "../types/serverContracts";
import type { LibraryProjectionItem } from "./libraryProjectionModel";

export interface ItemStateChangedPayload {
  itemId?: string | null;
  path?: string | null;
  isFavorite?: boolean;
  isBlacklisted?: boolean;
  previousIsFavorite?: boolean | null;
  previousIsBlacklisted?: boolean | null;
  /** The device whose favorite or blacklist request made the change, when it sent one. */
  clientId?: string | null;
}

export interface PlaybackRecordedPayload {
  itemId?: string | null;
  playCount?: number | null;
  lastPlayedUtc?: string | number | null;
}

/** The loaded tiles by catalog id, built once per event so a batch looks each of its items up at once. */
export type ProjectionItemIndex = ReadonlyMap<string, LibraryProjectionItem>;

export function indexProjectionItems(items: readonly LibraryProjectionItem[]): ProjectionItemIndex {
  return new Map(items.map((item) => [item.id, item]));
}

/** Items are matched by catalog id only, so two files whose paths differ only in case stay apart. */
export function findProjectionItem(
  index: ProjectionItemIndex,
  itemId: string | null | undefined
): LibraryProjectionItem | null {
  const id = itemId != null ? String(itemId).trim() : "";
  if (!id) {
    return null;
  }
  return index.get(id) ?? null;
}

/** Puts the event's favorite and blacklist on the loaded tile with its id, saying whether they changed. */
export function applyItemStateChanged(index: ProjectionItemIndex, payload: ItemStateChangedPayload): boolean {
  const item = findProjectionItem(index, payload.itemId);
  const nextFavorite = payload.isFavorite === true;
  const nextBlacklisted = payload.isBlacklisted === true;
  if (!item || (item.isFavorite === nextFavorite && item.isBlacklisted === nextBlacklisted)) {
    return false;
  }
  item.isFavorite = nextFavorite;
  item.isBlacklisted = nextBlacklisted;
  return true;
}

/** Puts the event's rating on the loaded tile with its id, saying whether it changed. */
export function applyItemRatingChanged(index: ProjectionItemIndex, payload: ItemRatingChangedPayload): boolean {
  const item = findProjectionItem(index, payload.itemId);
  const rating = parseRating(payload.rating);
  if (!item || item.rating === rating) {
    return false;
  }
  item.rating = rating;
  return true;
}

/** Puts the event's play count and last played time on the loaded tile with its id, saying whether they changed. */
export function applyPlaybackRecorded(index: ProjectionItemIndex, payload: PlaybackRecordedPayload): boolean {
  const item = findProjectionItem(index, payload.itemId);
  if (!item) {
    return false;
  }

  const hasPlayCount = typeof payload.playCount === "number" && Number.isFinite(payload.playCount);
  const parsedLastPlayed = parsePlaybackLastPlayedUtcMs(payload.lastPlayedUtc);
  if (!hasPlayCount && parsedLastPlayed == null) {
    return false;
  }

  const nextPlayCount = hasPlayCount ? Math.max(0, Math.trunc(payload.playCount as number)) : item.playCount;
  const nextLastPlayedUtcMs = parsedLastPlayed ?? item.lastPlayedUtcMs;

  if (item.playCount === nextPlayCount && item.lastPlayedUtcMs === nextLastPlayedUtcMs) {
    return false;
  }

  item.playCount = nextPlayCount;
  item.lastPlayedUtcMs = nextLastPlayedUtcMs;
  return true;
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
