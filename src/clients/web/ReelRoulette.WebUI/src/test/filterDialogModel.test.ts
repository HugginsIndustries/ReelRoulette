import { describe, expect, it } from "vitest";
import {
  UNCATEGORIZED_COLLAPSE_KEY,
  filterTagCategories,
  filterWithGeneralDraft,
  generalDraftDurationError,
  generalDraftFromFilter,
  presetRowsFromApi,
  sourceLabel,
  toggleFilterTag,
  type FilterSource,
  type GeneralDraft
} from "../filter/filterDialogModel";
import { TAG_MATCH_MODE, createDefaultFilterState, type FilterState } from "../filter/filterStateModel";

const SOURCES: FilterSource[] = [
  { id: "Source-1", displayName: "Movies", rootPath: "C:\\movies" },
  { id: "source-2", displayName: null, rootPath: "C:\\photos" },
  { id: "source-3", isEnabled: false }
];

function filter(change: Partial<FilterState> = {}): FilterState {
  return { ...createDefaultFilterState(), ...change };
}

function draft(change: Partial<GeneralDraft> = {}): GeneralDraft {
  return { ...generalDraftFromFilter(filter(), SOURCES), ...change };
}

describe("generalDraftFromFilter", () => {
  it("shows durations as text, none as an empty field with its box checked, and every source checked when none is stored", () => {
    const shown = generalDraftFromFilter(filter({ minDurationSeconds: 90, maxDurationSeconds: 3700 }), SOURCES);
    expect(shown).toMatchObject({ minText: "01:30", noMin: false, maxText: "01:01:40", noMax: false });
    expect(shown.sourceChecked).toEqual([true, true, true]);

    const none = generalDraftFromFilter(filter(), SOURCES);
    expect(none).toMatchObject({ minText: "", noMin: true, maxText: "", noMax: true });
  });

  it("checks the stored sources, ignoring case", () => {
    expect(generalDraftFromFilter(filter({ includedSourceIds: ["source-1"] }), SOURCES).sourceChecked).toEqual([true, false, false]);
  });
});

describe("filterWithGeneralDraft", () => {
  it("reads the fields into the filter and keeps the rest of it", () => {
    const working = filter({ selectedTags: ["Beach"], globalMatchMode: false });
    const read = filterWithGeneralDraft(
      working,
      draft({ favoritesMode: "only", mediaTypeFilter: 2, audioFilter: 1, noMin: false, minText: "1:00:00" }),
      SOURCES
    );
    expect(read).toMatchObject({
      favoritesMode: "only",
      mediaTypeFilter: 2,
      audioFilter: 1,
      minDurationSeconds: 3600,
      maxDurationSeconds: null,
      selectedTags: ["Beach"],
      globalMatchMode: false
    });
    expect(working.favoritesMode).toBe("off");
  });

  it("keeps a flag mode the checkboxes cannot show", () => {
    const working = filter({ favoritesMode: "excluded", blacklistedMode: "only" });
    const read = filterWithGeneralDraft(working, generalDraftFromFilter(working, SOURCES), SOURCES);
    expect(read).toMatchObject({ favoritesMode: "excluded", blacklistedMode: "only" });
  });

  it("stores no duration for a checked none box or text that is not valid", () => {
    expect(filterWithGeneralDraft(filter(), draft({ noMin: true, minText: "1:00" }), SOURCES).minDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter(), draft({ noMax: false, maxText: "abc" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter(), draft({ noMax: false, maxText: "" }), SOURCES).maxDurationSeconds).toBeNull();
  });

  it("stores the checked sources, and none once all are checked", () => {
    expect(filterWithGeneralDraft(filter(), draft({ sourceChecked: [true, false, true] }), SOURCES).includedSourceIds).toEqual([
      "Source-1",
      "source-3"
    ]);
    expect(filterWithGeneralDraft(filter({ includedSourceIds: ["x"] }), draft({ sourceChecked: [true, true, true] }), SOURCES).includedSourceIds).toEqual([]);
  });
});

describe("generalDraftDurationError", () => {
  it("names the first duration in use that is not valid", () => {
    expect(generalDraftDurationError(draft())).toBeNull();
    expect(generalDraftDurationError(draft({ noMin: true, minText: "abc", noMax: false, maxText: "1:75" }))).toBe(
      "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds."
    );
    expect(generalDraftDurationError(draft({ noMin: false, minText: "abc", noMax: false, maxText: "1:75" }))).toBe(
      "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds."
    );
    expect(generalDraftDurationError(draft({ noMin: false, minText: "" }))).toBeNull();
  });
});

describe("toggleFilterTag", () => {
  it("includes, switches to excluded, and clears, ignoring case, without changing the filter it was given", () => {
    const start = filter();
    const included = toggleFilterTag(start, "Beach", "include");
    expect(included).toMatchObject({ selectedTags: ["Beach"], excludedTags: [] });
    const excluded = toggleFilterTag(included, "beach", "exclude");
    expect(excluded).toMatchObject({ selectedTags: [], excludedTags: ["beach"] });
    expect(toggleFilterTag(excluded, "BEACH", "exclude")).toMatchObject({ selectedTags: [], excludedTags: [] });
    expect(start.selectedTags).toEqual([]);
    expect(included.selectedTags).toEqual(["Beach"]);
  });
});

describe("filterTagCategories", () => {
  const model = {
    categories: [
      { id: "people", name: "People", sortOrder: 1 },
      { id: "places", name: "Places", sortOrder: 0 },
      { id: "empty", name: "Empty", sortOrder: 0 },
      { id: "mood", name: "mood", sortOrder: 1 }
    ],
    tags: [
      { name: "Bob", categoryId: "people" },
      { name: "alice", categoryId: "people" },
      { name: "Beach", categoryId: "places" },
      { name: "Calm", categoryId: "mood" }
    ]
  };

  it("orders categories by sort order and name and their tags by name, leaving out categories without tags", () => {
    const blocks = filterTagCategories(model, filter(), new Set());
    expect(blocks.map((block) => block.name)).toEqual(["Places", "mood", "People"]);
    expect(blocks[2]!.chips.map((chip) => chip.name)).toEqual(["alice", "Bob"]);
    expect(blocks[0]).toMatchObject({ id: "places", collapseKey: "places", collapsed: false, localMode: TAG_MATCH_MODE.And });
  });

  it("marks included and excluded tags, collapsed categories, and each category's match mode", () => {
    const blocks = filterTagCategories(
      model,
      filter({ selectedTags: ["beach"], excludedTags: ["BOB"], categoryLocalMatchModes: { people: TAG_MATCH_MODE.Or } }),
      new Set(["people"])
    );
    expect(blocks[0]!.chips).toEqual([{ name: "Beach", included: true, excluded: false }]);
    expect(blocks[2]).toMatchObject({ collapsed: true, localMode: TAG_MATCH_MODE.Or });
    expect(blocks[2]!.chips[1]).toEqual({ name: "Bob", included: false, excluded: true });
  });

  it("puts filter tags the catalog does not have last, in an Uncategorized row", () => {
    const blocks = filterTagCategories(
      model,
      filter({ selectedTags: ["Ghost", "beach"], excludedTags: ["Ghost", "Alps"], categoryLocalMatchModes: { "": TAG_MATCH_MODE.Or } }),
      new Set([UNCATEGORIZED_COLLAPSE_KEY])
    );
    expect(blocks.at(-1)).toEqual({
      id: null,
      name: "Uncategorized",
      collapseKey: UNCATEGORIZED_COLLAPSE_KEY,
      collapsed: true,
      localMode: TAG_MATCH_MODE.Or,
      chips: [
        { name: "Alps", included: false, excluded: true },
        { name: "Ghost", included: true, excluded: true }
      ]
    });
    expect(filterTagCategories(null, filter({ selectedTags: ["Ghost"] }), new Set()).map((block) => block.name)).toEqual([
      "Uncategorized"
    ]);
    expect(filterTagCategories(null, filter(), new Set())).toEqual([]);
  });
});

describe("presets and sources", () => {
  it("names preset rows by name or id and leaves out rows with neither", () => {
    const rows = presetRowsFromApi([
      { id: "p1", name: " Favorites ", filterState: { favoritesOnly: true } },
      { id: "p2", name: "", filterState: {} },
      { name: "" }
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Favorites", "p2"]);
    expect(rows[0]!.filterState.favoritesMode).toBe("only");
  });

  it("labels a source by display name, then root path, then id", () => {
    expect(SOURCES.map(sourceLabel)).toEqual(["Movies", "C:\\photos", "source-3"]);
  });
});
