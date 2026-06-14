import { describe, expect, it } from "vitest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import {
  applyLibraryBrowse,
  createDefaultBrowseControls,
  filterItemsBySearch,
  getSortDirectionLabel,
  isDefaultDescendingForSortMode,
  sortLibraryItems
} from "../library/libraryBrowseModel";
import type { LibraryProjectionCatalog, LibraryProjectionItem } from "../library/libraryProjectionModel";

const catalog: LibraryProjectionCatalog = {
  sources: [{ id: "s1", isEnabled: true }],
  categories: [],
  tags: []
};

function row(
  fileName: string,
  overrides: Partial<LibraryProjectionItem> = {}
): LibraryProjectionItem {
  return {
    id: fileName,
    sourceId: "s1",
    fileName,
    fullPath: null,
    relativePath: fileName,
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: null,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: false,
    thumbnailWidth: null,
    thumbnailHeight: null,
    ...overrides
  };
}

describe("libraryBrowseModel", () => {
  it("defaults to Name ascending", () => {
    const controls = createDefaultBrowseControls();
    expect(controls.sortMode).toBe("Name");
    expect(controls.sortDescending).toBe(false);
    expect(isDefaultDescendingForSortMode("LastPlayed")).toBe(true);
  });

  it("search matches filename and relative path case-insensitively", () => {
    const items = [
      row("Alpha.mp4", { relativePath: "folder/alpha.mp4" }),
      row("Beta.mp4", { relativePath: "other/beta.mp4" })
    ];
    expect(filterItemsBySearch(items, "ALPHA").map((i) => i.fileName)).toEqual(["Alpha.mp4"]);
    expect(filterItemsBySearch(items, "other/").map((i) => i.fileName)).toEqual(["Beta.mp4"]);
    expect(filterItemsBySearch(items, "")).toHaveLength(2);
  });

  it("sorts Name ascending and LastPlayed descending with missing as oldest", () => {
    const items = [
      row("z.mp4"),
      row("a.mp4"),
      row("played.mp4", { lastPlayedUtcMs: Date.parse("2024-06-01T00:00:00Z") }),
      row("missing.mp4", { lastPlayedUtcMs: null })
    ];
    expect(sortLibraryItems(items, "Name", false).map((i) => i.fileName)).toEqual([
      "a.mp4",
      "missing.mp4",
      "played.mp4",
      "z.mp4"
    ]);
    expect(sortLibraryItems(items, "LastPlayed", true).map((i) => i.fileName)[0]).toBe("played.mp4");
  });

  it("sorts DateAdded and Duration with tie-breaker fileName", () => {
    const ts = Date.parse("2023-05-01T00:00:00Z");
    const items = [
      row("b.mp4", { lastWriteTimeUtcMs: ts }),
      row("a.mp4", { lastWriteTimeUtcMs: ts })
    ];
    expect(sortLibraryItems(items, "DateAdded", true).map((i) => i.fileName)).toEqual(["a.mp4", "b.mp4"]);

    const dur = [
      row("long.mp4", { durationSeconds: 300 }),
      row("short.mp4", { durationSeconds: 10 }),
      row("unknown.mp4", { durationSeconds: null })
    ];
    expect(sortLibraryItems(dur, "Duration", false).map((i) => i.fileName)).toEqual([
      "unknown.mp4",
      "short.mp4",
      "long.mp4"
    ]);
  });

  it("applyLibraryBrowse runs search then FilterState then sort", () => {
    const items = [
      row("fav.mp4", { isFavorite: true, fileName: "fav.mp4" }),
      row("plain.mp4", { isFavorite: false }),
      row("hidden.mp4", { isFavorite: true, isBlacklisted: true })
    ];
    const filterState = { ...createDefaultFilterState(), favoritesOnly: true };
    const controls = { ...createDefaultBrowseControls(), searchQuery: "fav" };
    const result = applyLibraryBrowse(catalog, items, filterState, controls);
    expect(result.filterBaselineCount).toBe(1);
    expect(result.visibleItems.map((i) => i.fileName)).toEqual(["fav.mp4"]);
  });

  it("getSortDirectionLabel matches desktop labels", () => {
    expect(getSortDirectionLabel("Name", false)).toBe("A–Z");
    expect(getSortDirectionLabel("DateAdded", true)).toBe("Newest → Oldest");
  });
});
