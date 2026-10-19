import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import { compareTagNames } from "../library/tagNameOrder";
import { formatPlaybackTime } from "../playback/nowPlaying";
import type { TagCatalogSnapshot } from "../tags/tagCatalog";
import { bySortOrderThenName, isUncategorizedCategoryId, normalizeTagKey } from "../tags/tagEditorModel";
import type { components } from "../types/openapi.generated";

export type LibraryStats = components["schemas"]["LibraryStatsResponse"];

/** One line of the current file's stats: its label and its value. */
export interface StatsRow {
  label: string;
  value: string;
}

/** One of the library's cards: a value over its label. */
export interface StatsCard {
  label: string;
  value: string;
}

/** What the Stats tab shows of the playing file. */
export interface StatsFileView {
  name: string;
  /** The file's full path. */
  path: string;
  /** Its stats, or null until they load for it, and while the server holds back or asks for pairing. */
  rows: StatsRow[] | null;
  /** Its tags in the tag catalog's order, with the rows. */
  tags: string[];
}

/** What the Stats tab shows of the library: its cards, a message in their place, or nothing yet. */
export type StatsLibraryView = { kind: "cards"; cards: StatsCard[] } | { kind: "message"; text: string; error: boolean } | { kind: "none" };

export interface StatsView {
  /** The playing file, or null while nothing plays. */
  file: StatsFileView | null;
  library: StatsLibraryView;
}

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

/** How long ago `utcMs` was, as Last played says it, or Never for null. */
export function playedAgo(utcMs: number | null, nowMs: number): string {
  if (utcMs === null) {
    return "Never";
  }
  const minutes = Math.floor(Math.max(0, nowMs - utcMs) / 60_000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Yes, No, or Unknown before the loudness scan has looked at the file. */
export function hasAudioText(hasAudio: boolean | null): string {
  return hasAudio === null ? "Unknown" : yesNo(hasAudio);
}

/** The integrated loudness, N/A without audio, or Unknown without a measurement. */
export function loudnessText(item: Pick<LibraryProjectionItem, "hasAudio" | "integratedLoudness">): string {
  if (item.hasAudio === false) {
    return "N/A";
  }
  return item.integratedLoudness === null ? "Unknown" : `${item.integratedLoudness.toFixed(1)} LUFS`;
}

/**
 * The scan's true peak, N/A without audio, or Not measured. A digitally silent track has no audio, since the server
 * counts it as a file without an audio track.
 */
export function truePeakText(item: Pick<LibraryProjectionItem, "hasAudio" | "peakDb">): string {
  if (item.hasAudio === false) {
    return "N/A";
  }
  return item.peakDb === null ? "Not measured" : `${item.peakDb.toFixed(1)} dBTP`;
}

/**
 * The current file's rows: plays, the time before this play, favorite, and blacklisted, then for a video its duration
 * and audio. The tags follow them, in the tab.
 */
export function fileRows(item: LibraryProjectionItem, lastPlayedUtcMs: number | null, nowMs: number): StatsRow[] {
  const rows: StatsRow[] = [
    { label: "Plays", value: String(item.playCount) },
    { label: "Last played", value: playedAgo(lastPlayedUtcMs, nowMs) },
    { label: "Favorite", value: yesNo(item.isFavorite) },
    { label: "Blacklisted", value: yesNo(item.isBlacklisted) }
  ];
  if (item.mediaType !== "photo") {
    rows.push(
      { label: "Duration", value: item.durationSeconds === null ? "Unknown" : formatPlaybackTime(item.durationSeconds) },
      { label: "Has audio", value: hasAudioText(item.hasAudio) },
      { label: "Loudness", value: loudnessText(item) },
      { label: "True peak", value: truePeakText(item) }
    );
  }
  return rows;
}

/** The library's cards, in the mockup's order. */
export function libraryCards(stats: LibraryStats): StatsCard[] {
  const global = stats.global;
  const count = (value: number | null | undefined) => Number(value ?? 0).toLocaleString();
  return [
    { label: "Videos", value: count(global.totalVideos) },
    { label: "Photos", value: count(global.totalPhotos) },
    { label: "Total media", value: count(global.totalMedia) },
    { label: "Favorites", value: count(global.favorites) },
    { label: "Blacklisted", value: count(global.blacklisted) },
    { label: "Total plays", value: count(global.totalPlays) },
    { label: "Unique played", value: count(global.uniquePlayedMedia) },
    { label: "Never played", value: count(global.neverPlayedMedia) },
    { label: "Videos with audio", value: count(global.videosWithAudio) },
    { label: "Videos without audio", value: count(global.videosWithoutAudio) },
    { label: "Baseline loudness", value: `${Number(global.baselineLoudnessLufs).toFixed(1)} LUFS` }
  ];
}

/**
 * A file's tags in the order the Tags tab shows them: by category, in the categories' saved order, then by name, with
 * tags that have no category, or aren't in the catalog, last. Without a catalog, by name.
 */
export function orderTags(tags: readonly string[], catalog: TagCatalogSnapshot | null): string[] {
  const categoryRank = new Map<string, number>();
  [...(catalog?.categories ?? [])]
    .filter((category) => !isUncategorizedCategoryId(category.id))
    .sort(bySortOrderThenName)
    .forEach((category, index) => categoryRank.set(category.id, index));
  const tagRank = new Map<string, number>();
  for (const tag of catalog?.tags ?? []) {
    tagRank.set(normalizeTagKey(tag.name), categoryRank.get(tag.categoryId) ?? Number.MAX_SAFE_INTEGER);
  }
  const rank = (name: string) => tagRank.get(normalizeTagKey(name)) ?? Number.MAX_SAFE_INTEGER;
  return [...tags].sort((a, b) => rank(a) - rank(b) || compareTagNames(a, b));
}
