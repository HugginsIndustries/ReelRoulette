import { describe, expect, it } from "vitest";
import {
  UNCATEGORIZED_COLLAPSE_KEY,
  filterTagCategories,
  DURATION_PROBLEM,
  FILTER_ACTION_BESIDE,
  FILTER_ACTION_FIELDS,
  FLAG_MODES_PROBLEM,
  editPresetNameProblem,
  filterFieldProblems,
  filterHeldReason,
  filterWithGeneralDraft,
  filterWithTypedDurations,
  generalDraftFromFilter,
  presetRowsFromApi,
  sourceLabel,
  toggleFilterTag,
  type FilterSource,
  type GeneralDraft
} from "../filter/filterDialogModel";
import { TAG_MATCH_MODE, createDefaultFilterState, type FilterState, type FlagFilterMode } from "../filter/filterStateModel";
import { EMPTY_FIELD, isFlagged } from "../validation/fieldValidation";

const SOURCES: FilterSource[] = [
  { id: "Source-1", displayName: "Movies", rootPath: "C:\\movies" },
  { id: "source-2", displayName: null, rootPath: "C:\\photos" },
  { id: "source-3", isEnabled: false }
];

const FLAG_MODES: readonly FlagFilterMode[] = ["off", "only", "excluded"];
const FLAG_MODE_PAIRS = FLAG_MODES.flatMap((favorites) => FLAG_MODES.map((blacklisted) => [favorites, blacklisted] as const));

function filter(change: Partial<FilterState> = {}): FilterState {
  return { ...createDefaultFilterState(), ...change };
}

function draft(change: Partial<GeneralDraft> = {}): GeneralDraft {
  return { ...generalDraftFromFilter(filter(), SOURCES), ...change };
}

describe("generalDraftFromFilter", () => {
  it("shows durations as text, none as an empty field with its box checked, and every source checked when none is stored", () => {
    const shown = generalDraftFromFilter(filter({ minDurationSeconds: 90, maxDurationSeconds: 3700 }), SOURCES);
    expect(shown).toMatchObject({ minText: "01:30", maxText: "01:01:40" });
    expect(shown.sourceChecked).toEqual([true, true, true]);

    const none = generalDraftFromFilter(filter(), SOURCES);
    expect(none).toMatchObject({ minText: "", maxText: "" });
  });

  it("shows each flag mode as its checkbox and choice, with the default choice for a filter that is off", () => {
    const shown = (favoritesMode: FlagFilterMode, blacklistedMode: FlagFilterMode) => {
      const { favoritesOn, favoritesChoice, blacklistedOn, blacklistedChoice } = generalDraftFromFilter(
        filter({ favoritesMode, blacklistedMode }),
        SOURCES
      );
      return { favoritesOn, favoritesChoice, blacklistedOn, blacklistedChoice };
    };
    expect(generalDraftFromFilter(filter(), SOURCES)).toMatchObject({
      favoritesOn: false,
      favoritesChoice: "only",
      blacklistedOn: true,
      blacklistedChoice: "excluded"
    });
    expect(shown("off", "off")).toEqual({ favoritesOn: false, favoritesChoice: "only", blacklistedOn: false, blacklistedChoice: "excluded" });
    expect(shown("only", "only")).toEqual({ favoritesOn: true, favoritesChoice: "only", blacklistedOn: true, blacklistedChoice: "only" });
    expect(shown("excluded", "excluded")).toEqual({
      favoritesOn: true,
      favoritesChoice: "excluded",
      blacklistedOn: true,
      blacklistedChoice: "excluded"
    });
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
      draft({ favoritesOn: true, mediaTypeFilter: 2, audioFilter: 1, minText: "1:00:00" }),
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

  it.each(FLAG_MODE_PAIRS)("keeps Favorites %s and Blacklisted %s through the draft", (favoritesMode, blacklistedMode) => {
    const working = filter({ favoritesMode, blacklistedMode });
    const read = filterWithGeneralDraft(working, generalDraftFromFilter(working, SOURCES), SOURCES);
    expect(read).toMatchObject({ favoritesMode, blacklistedMode });
  });

  it("reads a checked filter as its choice and an unchecked one as off, whatever its choice", () => {
    const read = (change: Partial<GeneralDraft>) => {
      const { favoritesMode, blacklistedMode } = filterWithGeneralDraft(filter(), draft(change), SOURCES);
      return { favoritesMode, blacklistedMode };
    };
    expect(read({ favoritesOn: true, favoritesChoice: "excluded", blacklistedOn: true, blacklistedChoice: "only" })).toEqual({
      favoritesMode: "excluded",
      blacklistedMode: "only"
    });
    expect(read({ favoritesOn: false, favoritesChoice: "excluded", blacklistedOn: false, blacklistedChoice: "only" })).toEqual({
      favoritesMode: "off",
      blacklistedMode: "off"
    });
  });

  it("keeps a choice while its filter is unchecked, and the filter takes it again once checked", () => {
    const sources: FilterSource[] = [];
    let current = filter({ favoritesMode: "excluded", blacklistedMode: "only" });
    let shown = generalDraftFromFilter(current, sources);
    shown = { ...shown, favoritesOn: false, blacklistedOn: false };
    current = filterWithGeneralDraft(current, shown, sources);
    expect(current).toMatchObject({ favoritesMode: "off", blacklistedMode: "off" });
    expect(shown).toMatchObject({ favoritesChoice: "excluded", blacklistedChoice: "only" });

    shown = { ...shown, favoritesOn: true, blacklistedOn: true };
    expect(filterWithGeneralDraft(current, shown, sources)).toMatchObject({ favoritesMode: "excluded", blacklistedMode: "only" });
  });

  it("stores no duration for an empty field or text that is not valid", () => {
    expect(filterWithGeneralDraft(filter(), draft({ maxText: "abc" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter(), draft({ maxText: "12abc" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter({ maxDurationSeconds: 60 }), draft({ maxText: "" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter(), draft({ maxText: "1:00" }), SOURCES).maxDurationSeconds).toBe(60);
  });

  it("stores the checked sources, and none once all are checked", () => {
    expect(filterWithGeneralDraft(filter(), draft({ sourceChecked: [true, false, true] }), SOURCES).includedSourceIds).toEqual([
      "Source-1",
      "source-3"
    ]);
    expect(filterWithGeneralDraft(filter({ includedSourceIds: ["x"] }), draft({ sourceChecked: [true, true, true] }), SOURCES).includedSourceIds).toEqual([]);
  });

  it("keeps the source list it was filled from while the same sources are checked again, as after any General change", () => {
    const every = filter({ includedSourceIds: ["source-3", "Source-1", "source-2", "gone"] });
    const shown = generalDraftFromFilter(every, SOURCES);
    expect(shown.sourceChecked).toEqual([true, true, true]);
    expect(filterWithGeneralDraft(every, { ...shown, onlyNeverPlayed: true }, SOURCES).includedSourceIds).toEqual([
      "source-3",
      "Source-1",
      "source-2",
      "gone"
    ]);
    const unchecked = filterWithGeneralDraft(every, { ...shown, sourceChecked: [false, true, true] }, SOURCES);
    expect(unchecked.includedSourceIds).toEqual(["source-2", "source-3"]);
    const checkedAgain = filterWithGeneralDraft(unchecked, { ...shown, sourceChecked: [true, true, true] }, SOURCES);
    expect(checkedAgain.includedSourceIds).toEqual(["source-3", "Source-1", "source-2", "gone"]);

    const partial = filter({ includedSourceIds: ["source-2"] });
    const partialShown = generalDraftFromFilter(partial, SOURCES);
    expect(filterWithGeneralDraft(partial, partialShown, SOURCES).includedSourceIds).toEqual(["source-2"]);
    expect(filterWithGeneralDraft(partial, { ...partialShown, sourceChecked: [true, true, true] }, SOURCES).includedSourceIds).toEqual([]);
  });
});

describe("filterWithTypedDurations", () => {
  it("reads each duration as its field's text, empty as no limit, and nothing while either text isn't valid", () => {
    const applied = filter({ minDurationSeconds: 90, maxDurationSeconds: 600 });
    expect(filterWithTypedDurations(applied, draft({ minText: "", maxText: "" }))).toMatchObject({
      minDurationSeconds: null,
      maxDurationSeconds: null
    });
    expect(filterWithTypedDurations(filter(), draft({ minText: "90", maxText: "10:00" }))).toMatchObject({
      minDurationSeconds: 90,
      maxDurationSeconds: 600
    });
    expect(filterWithTypedDurations(filter(), draft({ minText: "abc" }))).toBeNull();
    expect(filterWithTypedDurations(filter(), draft({ maxText: "1:75" }))).toBeNull();
    expect(applied).toMatchObject({ minDurationSeconds: 90, maxDurationSeconds: 600 });
  });
});

describe("filterFieldProblems", () => {
  const PRESETS = [{ name: "Favorites", filterState: filter() }];

  it("flags a duration that is not valid, read strictly, and not an empty one", () => {
    expect(filterFieldProblems(draft(), "Mine", PRESETS)).toEqual({ flagModes: null, minDuration: null, maxDuration: null, newPresetName: null });
    for (const text of ["1:7x", "12abc", "1:75"]) {
      expect(filterFieldProblems(draft({ minText: text }), "Mine", PRESETS).minDuration, text).toEqual({ message: DURATION_PROBLEM });
      expect(filterFieldProblems(draft({ maxText: text }), "Mine", PRESETS).maxDuration, text).toEqual({ message: DURATION_PROBLEM });
    }
    expect(filterFieldProblems(draft({ minText: "" }), "Mine", PRESETS).minDuration).toBeNull();
    expect(filterFieldProblems(draft({ minText: "  " }), "Mine", PRESETS).minDuration).toBeNull();
    expect(filterFieldProblems(draft({ minText: "90:00" }), "Mine", PRESETS).minDuration).toBeNull();
  });

  it("finds an empty new preset name required, without a flag, and flags a saved preset's name ignoring case", () => {
    expect(filterFieldProblems(draft(), "  ", PRESETS).newPresetName).toBe(EMPTY_FIELD);
    expect(isFlagged(filterFieldProblems(draft(), "  ", PRESETS).newPresetName)).toBe(false);
    expect(filterFieldProblems(draft(), " FAVORITES ", PRESETS).newPresetName).toEqual({ message: "Use a name no other preset has." });
    expect(filterFieldProblems(draft(), "Favorites 2", PRESETS).newPresetName).toBeNull();
  });

  it.each(FLAG_MODE_PAIRS)("flags only Favorites only with Blacklisted only: Favorites %s with Blacklisted %s", (favorites, blacklisted) => {
    const shown = generalDraftFromFilter(filter({ favoritesMode: favorites, blacklistedMode: blacklisted }), SOURCES);
    const expected = favorites === "only" && blacklisted === "only" ? { message: FLAG_MODES_PROBLEM } : null;
    expect(filterFieldProblems(shown, "Mine", PRESETS).flagModes).toEqual(expected);
  });

  it("does not flag Favorites only with a Blacklisted only choice whose box is off", () => {
    expect(filterFieldProblems(draft({ favoritesOn: true, favoritesChoice: "only", blacklistedOn: false, blacklistedChoice: "only" }), "Mine", PRESETS).flagModes).toBeNull();
  });
});

describe("editPresetNameProblem", () => {
  const PRESETS = [
    { name: "Favorites", filterState: filter() },
    { name: "Beach days", filterState: filter() }
  ];

  it("finds an empty name required, without a flag", () => {
    for (const text of ["", "   "]) {
      expect(editPresetNameProblem(text, PRESETS, 1), JSON.stringify(text)).toBe(EMPTY_FIELD);
      expect(isFlagged(editPresetNameProblem(text, PRESETS, 1)), JSON.stringify(text)).toBe(false);
    }
  });

  it("flags another preset's name, ignoring case and surrounding spaces", () => {
    for (const text of ["Favorites", "favorites ", " FAVORITES"]) {
      expect(editPresetNameProblem(text, PRESETS, 1), text).toEqual({ message: "Use a name no other preset has." });
      expect(isFlagged(editPresetNameProblem(text, PRESETS, 1)), text).toBe(true);
    }
  });

  it("accepts the preset's own name in any case, and a name no preset has", () => {
    expect(editPresetNameProblem("Beach days", PRESETS, 1)).toBeNull();
    expect(editPresetNameProblem(" BEACH DAYS ", PRESETS, 1)).toBeNull();
    expect(editPresetNameProblem("Sunny days", PRESETS, 1)).toBeNull();
    expect(editPresetNameProblem("Beach days", PRESETS, 0)).toEqual({ message: "Use a name no other preset has." });
  });
});

describe("filterHeldReason", () => {
  it("says which General field holds the action and what it expects", () => {
    expect(filterHeldReason("apply", "minDuration")).toBe("Correct the minimum duration to apply.");
    expect(filterHeldReason("apply", "maxDuration")).toBe("Correct the maximum duration to apply.");
    expect(filterHeldReason("apply", "flagModes")).toBe("Change Favorites or Blacklisted to apply.");
    expect(filterHeldReason("updatePreset", "maxDuration")).toBe("Correct the maximum duration first.");
    expect(filterHeldReason("addPreset", "flagModes")).toBe("Change Favorites or Blacklisted first.");
    expect(filterHeldReason("addPreset", "minDuration")).toBe("Correct the minimum duration first.");
  });

  it("checks the General fields for every action and Add Preset's name first, which sits beside it", () => {
    expect(FILTER_ACTION_FIELDS).toEqual({
      apply: ["flagModes", "minDuration", "maxDuration"],
      addPreset: ["newPresetName", "flagModes", "minDuration", "maxDuration"],
      updatePreset: ["flagModes", "minDuration", "maxDuration"]
    });
    expect(FILTER_ACTION_BESIDE).toEqual({ apply: [], addPreset: ["newPresetName"], updatePreset: [] });
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
    // Every category starts collapsed.
    expect(blocks[0]).toMatchObject({ id: "places", collapseKey: "places", collapsed: true, localMode: TAG_MATCH_MODE.And });
  });

  it("marks included and excluded tags, expanded categories, and each category's match mode", () => {
    const blocks = filterTagCategories(
      model,
      filter({ selectedTags: ["beach"], excludedTags: ["BOB"], categoryLocalMatchModes: { people: TAG_MATCH_MODE.Or } }),
      new Set(["people"])
    );
    expect(blocks[0]!.chips).toEqual([{ name: "Beach", included: true, excluded: false }]);
    expect(blocks[0]!.collapsed).toBe(true);
    expect(blocks[2]).toMatchObject({ collapsed: false, localMode: TAG_MATCH_MODE.Or });
    expect(blocks[2]!.chips[1]).toEqual({ name: "Bob", included: false, excluded: true });
  });

  it("counts each category's tags the filter uses, and marks one whose tags differ from the applied filter", () => {
    const applied = filter({ selectedTags: ["beach"], excludedTags: ["bob"] });
    const same = filterTagCategories(model, applied, new Set(), applied);
    expect(same.map((block) => [block.name, block.inUse, block.unsaved])).toEqual([
      ["Places", 1, false],
      ["mood", 0, false],
      ["People", 1, false]
    ]);
    // Bob moves from excluded to included, and Alice is excluded: People changes, and Places stays as applied.
    const working = filter({ selectedTags: ["beach", "Bob"], excludedTags: ["alice"] });
    const changed = filterTagCategories(model, working, new Set(), applied);
    expect(changed.map((block) => [block.name, block.inUse, block.unsaved])).toEqual([
      ["Places", 1, false],
      ["mood", 0, false],
      ["People", 2, true]
    ]);
    // Without an applied filter, the filter is its own.
    expect(filterTagCategories(model, working, new Set()).some((block) => block.unsaved)).toBe(false);
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
      collapsed: false,
      localMode: TAG_MATCH_MODE.Or,
      chips: [
        { name: "Alps", included: false, excluded: true },
        { name: "Ghost", included: true, excluded: true }
      ],
      inUse: 2,
      unsaved: false
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
      { id: "p1", name: " Favorites ", filterState: { favoritesMode: "only" } },
      { id: "p2", name: "", filterState: {} },
      { name: "" }
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Favorites", "p2"]);
    expect(rows[0]!.filterState.favoritesMode).toBe("only");
  });

  it("reads preset rows without AND match modes, keeping OR ones", () => {
    const rows = presetRowsFromApi([
      { name: "Mixed", filterState: { categoryLocalMatchModes: { places: 0, people: 1 } } },
      { name: "And", filterState: { categoryLocalMatchModes: { places: 0 } } }
    ]);
    expect(rows.map((row) => row.filterState.categoryLocalMatchModes)).toEqual([{ people: 1 }, null]);
  });

  it("labels a source by its display name and its folder, or whichever it has, then its id", () => {
    expect(SOURCES.map(sourceLabel)).toEqual(["Movies (C:\\movies)", "C:\\photos", "source-3"]);
    expect(sourceLabel({ id: "s", displayName: "C:\\movies", rootPath: "C:\\movies" })).toBe("C:\\movies");
    expect(sourceLabel({ id: "s", displayName: "Movies" })).toBe("Movies");
  });
});
