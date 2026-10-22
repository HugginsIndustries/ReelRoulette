import type { components } from "../types/openapi.generated";

/** A sort the library query takes. */
export type LibrarySortMode = NonNullable<components["schemas"]["LibraryQueryRequest"]["sortMode"]>;

/**
 * Each sort, in the order the Library tab lists them: its name there, and its direction button's text for each
 * direction. Keyed by every sort the server takes, so a new one needs its labels here.
 */
const LIBRARY_SORTS: Readonly<Record<LibrarySortMode, { label: string; ascending: string; descending: string }>> = {
  Name: { label: "Name", ascending: "A–Z", descending: "Z–A" },
  LastPlayed: { label: "Last played", ascending: "Oldest → Newest", descending: "Newest → Oldest" },
  PlayCount: { label: "Play count", ascending: "Least Plays → Most Plays", descending: "Most Plays → Least Plays" },
  Duration: { label: "Duration", ascending: "Shortest → Longest", descending: "Longest → Shortest" },
  DateAdded: { label: "Date added", ascending: "Oldest → Newest", descending: "Newest → Oldest" },
  Rating: { label: "Rating", ascending: "Lowest → Highest", descending: "Highest → Lowest" }
};

export const LIBRARY_SORT_MODES = Object.keys(LIBRARY_SORTS) as LibrarySortMode[];

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

/** Every sort but Name starts on its highest, newest, or longest first. */
export function isDefaultDescendingForSortMode(sortMode: LibrarySortMode): boolean {
  return sortMode !== "Name";
}

/** The sort's name in the Library tab's sort list. */
export function getSortLabel(sortMode: LibrarySortMode): string {
  return LIBRARY_SORTS[sortMode].label;
}

export function getSortDirectionLabel(sortMode: LibrarySortMode, descending: boolean): string {
  const sort = LIBRARY_SORTS[sortMode];
  return descending ? sort.descending : sort.ascending;
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
