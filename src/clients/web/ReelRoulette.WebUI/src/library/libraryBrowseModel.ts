import type { FilterState } from "../filter/filterStateModel";
import { filterItemsByFilterState } from "./libraryProjectionDisplayFilter";
import type { LibraryProjectionCatalog, LibraryProjectionItem } from "./libraryProjectionModel";

export type LibrarySortMode = "Name" | "LastPlayed" | "PlayCount" | "Duration" | "DateAdded";

export const LIBRARY_SORT_MODES: LibrarySortMode[] = [
  "Name",
  "LastPlayed",
  "PlayCount",
  "Duration",
  "DateAdded"
];

export interface LibraryBrowseControls {
  sortMode: LibrarySortMode;
  sortDescending: boolean;
  searchQuery: string;
}

export interface LibraryBrowseResult {
  visibleItems: LibraryProjectionItem[];
  filterBaselineCount: number;
}

const MIN_EPOCH_MS = 0;

function compareFileName(a: LibraryProjectionItem, b: LibraryProjectionItem): number {
  return a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "accent" });
}

export function createDefaultBrowseControls(): LibraryBrowseControls {
  return {
    sortMode: "Name",
    sortDescending: false,
    searchQuery: ""
  };
}

export function filterItemsBySearch(
  items: readonly LibraryProjectionItem[],
  query: string
): LibraryProjectionItem[] {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return [...items];
  }
  const searchLower = trimmed.toLowerCase();
  return items.filter(
    (item) =>
      item.fileName.toLowerCase().includes(searchLower) ||
      item.relativePath.toLowerCase().includes(searchLower)
  );
}

export function sortLibraryItems(
  items: readonly LibraryProjectionItem[],
  sortMode: LibrarySortMode,
  descending: boolean
): LibraryProjectionItem[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortMode) {
      case "LastPlayed": {
        const av = a.lastPlayedUtcMs ?? MIN_EPOCH_MS;
        const bv = b.lastPlayedUtcMs ?? MIN_EPOCH_MS;
        cmp = av - bv;
        break;
      }
      case "PlayCount":
        cmp = a.playCount - b.playCount;
        break;
      case "Duration": {
        const av = a.durationSeconds ?? 0;
        const bv = b.durationSeconds ?? 0;
        cmp = av - bv;
        break;
      }
      case "DateAdded": {
        const av = a.lastWriteTimeUtcMs ?? MIN_EPOCH_MS;
        const bv = b.lastWriteTimeUtcMs ?? MIN_EPOCH_MS;
        cmp = av - bv;
        break;
      }
      default:
        cmp = compareFileName(a, b);
        break;
    }
    if (cmp !== 0) {
      return descending ? -cmp : cmp;
    }
    return compareFileName(a, b);
  });
  return sorted;
}

export function isDefaultDescendingForSortMode(sortMode: LibrarySortMode): boolean {
  return sortMode !== "Name";
}

export function getSortDirectionLabel(sortMode: LibrarySortMode, descending: boolean): string {
  switch (sortMode) {
    case "LastPlayed":
    case "DateAdded":
      return descending ? "Newest → Oldest" : "Oldest → Newest";
    case "PlayCount":
      return descending ? "Most Plays → Least Plays" : "Least Plays → Most Plays";
    case "Duration":
      return descending ? "Longest → Shortest" : "Shortest → Longest";
    default:
      return descending ? "Z–A" : "A–Z";
  }
}

export function formatBrowseResultSummary(visibleCount: number, baselineCount: number): string {
  const visible = visibleCount.toLocaleString();
  const baseline = baselineCount.toLocaleString();
  return `Showing ${visible} of ${baseline} items`;
}

/** Desktop library panel order: enabled items → search → FilterState → sort. */
export function applyLibraryBrowse(
  catalog: LibraryProjectionCatalog,
  items: readonly LibraryProjectionItem[],
  filterState: FilterState,
  controls: LibraryBrowseControls
): LibraryBrowseResult {
  const searched = filterItemsBySearch(items, controls.searchQuery);
  const filterBaselineCount = searched.length;
  const filtered = filterItemsByFilterState(searched, catalog, filterState);
  const visibleItems = sortLibraryItems(filtered, controls.sortMode, controls.sortDescending);
  return { visibleItems, filterBaselineCount };
}
