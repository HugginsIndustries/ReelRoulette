import { describe, expect, it } from "vitest";
import {
  AUDIO_FILTER,
  MEDIA_TYPE_FILTER,
  TAG_MATCH_MODE,
  createDefaultFilterState
} from "../filter/filterStateModel";
import {
  filterItemsByFilterState,
  passesFilterState
} from "../library/libraryProjectionDisplayFilter";
import type { LibraryProjectionCatalog, LibraryProjectionItem } from "../library/libraryProjectionModel";

const catalog: LibraryProjectionCatalog = {
  sources: [{ id: "s1", isEnabled: true }],
  categories: [{ id: "c1", name: "Genre" }],
  tags: [
    { name: "Action", categoryId: "c1" },
    { name: "Comedy", categoryId: "c1" }
  ]
};

function item(overrides: Partial<LibraryProjectionItem> = {}): LibraryProjectionItem {
  return {
    id: "i1",
    sourceId: "s1",
    fileName: "clip.mp4",
    relativePath: "clip.mp4",
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: 120,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: true,
    integratedLoudness: -14,
    tags: [],
    hasThumbnail: false,
    thumbnailWidth: null,
    thumbnailHeight: null,
    ...overrides
  };
}

describe("libraryProjectionDisplayFilter", () => {
  it("excludes blacklisted when excludeBlacklisted is true", () => {
    const filterState = createDefaultFilterState();
    expect(passesFilterState(item(), catalog, filterState)).toBe(true);
    expect(passesFilterState(item({ isBlacklisted: true }), catalog, filterState)).toBe(false);
  });

  it("favoritesOnly keeps favorites", () => {
    const filterState = { ...createDefaultFilterState(), favoritesOnly: true };
    expect(passesFilterState(item({ isFavorite: true }), catalog, filterState)).toBe(true);
    expect(passesFilterState(item({ isFavorite: false }), catalog, filterState)).toBe(false);
  });

  it("onlyNeverPlayed excludes played items", () => {
    const filterState = { ...createDefaultFilterState(), onlyNeverPlayed: true };
    expect(passesFilterState(item({ playCount: 0 }), catalog, filterState)).toBe(true);
    expect(passesFilterState(item({ playCount: 1 }), catalog, filterState)).toBe(false);
  });

  it("media type filter limits videos or photos", () => {
    const videosOnly = { ...createDefaultFilterState(), mediaTypeFilter: MEDIA_TYPE_FILTER.VideosOnly };
    expect(passesFilterState(item({ mediaType: "video" }), catalog, videosOnly)).toBe(true);
    expect(passesFilterState(item({ mediaType: "photo" }), catalog, videosOnly)).toBe(false);
  });

  it("duration min/max applies to videos only", () => {
    const min = { ...createDefaultFilterState(), minDurationSeconds: 60 };
    expect(passesFilterState(item({ durationSeconds: 120 }), catalog, min)).toBe(true);
    expect(passesFilterState(item({ durationSeconds: 30 }), catalog, min)).toBe(false);
    expect(passesFilterState(item({ mediaType: "photo", durationSeconds: null }), catalog, min)).toBe(true);
  });

  it("selected tags use category-local AND within category", () => {
    const filterState = {
      ...createDefaultFilterState(),
      selectedTags: ["Action", "Comedy"],
      globalMatchMode: true,
      categoryLocalMatchModes: { c1: TAG_MATCH_MODE.And }
    };
    expect(
      passesFilterState(item({ tags: ["Action", "Comedy"] }), catalog, filterState)
    ).toBe(true);
    expect(passesFilterState(item({ tags: ["Action"] }), catalog, filterState)).toBe(false);
  });

  it("excluded tags remove matching items", () => {
    const filterState = { ...createDefaultFilterState(), excludedTags: ["Action"] };
    expect(passesFilterState(item({ tags: ["Comedy"] }), catalog, filterState)).toBe(true);
    expect(passesFilterState(item({ tags: ["Action"] }), catalog, filterState)).toBe(false);
  });

  it("audio filter respects hasAudio on videos", () => {
    const withAudio = { ...createDefaultFilterState(), audioFilter: AUDIO_FILTER.WithAudioOnly };
    expect(passesFilterState(item({ hasAudio: true }), catalog, withAudio)).toBe(true);
    expect(passesFilterState(item({ hasAudio: false }), catalog, withAudio)).toBe(false);
  });

  it("filterItemsByFilterState batches filtering", () => {
    const rows = [
      item({ id: "a", isBlacklisted: false }),
      item({ id: "b", isBlacklisted: true })
    ];
    const filtered = filterItemsByFilterState(rows, catalog, createDefaultFilterState());
    expect(filtered.map((r) => r.id)).toEqual(["a"]);
  });
});
