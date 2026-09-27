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

export function formatBrowseResultSummary(visibleCount: number, baselineCount: number): string {
  const visible = visibleCount.toLocaleString();
  const baseline = baselineCount.toLocaleString();
  return `Showing ${visible} of ${baseline} items`;
}
