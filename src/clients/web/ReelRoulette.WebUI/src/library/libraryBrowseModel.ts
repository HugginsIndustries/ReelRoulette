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

export function createDefaultBrowseControls(): LibraryBrowseControls {
  return {
    sortMode: "Name",
    sortDescending: false,
    searchQuery: ""
  };
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

/** The Library tab's count line: the numbers it shows, and the words screen readers hear in their place. */
export interface BrowseResultSummary {
  shown: string;
  spoken: string;
}

/** "{matching} / {total}", such as "615 / 49,106", which screen readers hear as "615 of 49,106 items". */
export function formatBrowseResultSummary(matchingCount: number, totalCount: number): BrowseResultSummary {
  const matching = matchingCount.toLocaleString();
  const total = totalCount.toLocaleString();
  return { shown: `${matching} / ${total}`, spoken: `${matching} of ${total} items` };
}
