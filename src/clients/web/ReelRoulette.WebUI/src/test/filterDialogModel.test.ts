import { describe, expect, it } from "vitest";
import {
  UNCATEGORIZED_COLLAPSE_KEY,
  filterTagCategories,
  DATE_END_PROBLEM,
  DATE_ORDER_PROBLEM,
  DATE_RANGE_CHOICES,
  DATE_START_PROBLEM,
  DATE_YEARS_PROBLEM,
  DURATION_PROBLEM,
  FILTER_ACTION_BESIDE,
  FILTER_ACTION_FIELDS,
  FLAG_MODES_PROBLEM,
  RATING_FILTERS_PROBLEM,
  editPresetNameProblem,
  filterFieldProblems,
  filterAsFieldsRead,
  filterHeldReason,
  filterWithGeneralDraft,
  generalDraftAfterApply,
  generalDraftFromFilter,
  presetRowsFromApi,
  sourceLabel,
  toggleFilterTag,
  type DateRangeDraft,
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

function custom(fromText: string, toText: string): DateRangeDraft {
  return { choice: "custom", fromText, toText };
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

  it("shows each date range as its choice, with a custom range's dates and no dates otherwise", () => {
    const shown = generalDraftFromFilter(filter({ addedRange: "last30Days", createdRange: { from: "2026-01-03", to: "2026-03-31" } }), SOURCES);
    expect(shown.added).toEqual({ choice: "last30Days", fromText: "", toText: "" });
    expect(shown.created).toEqual(custom("2026-01-03", "2026-03-31"));
    expect(generalDraftFromFilter(filter(), SOURCES)).toMatchObject({
      added: { choice: null, fromText: "", toText: "" },
      created: { choice: null, fromText: "", toText: "" }
    });
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

  it("keeps Only unrated and the minimum rating through the draft", () => {
    for (const change of [{ onlyUnrated: true, minRating: null }, { onlyUnrated: false, minRating: 3.5 }, { onlyUnrated: false, minRating: null }]) {
      const working = filter(change);
      const shown = generalDraftFromFilter(working, SOURCES);
      expect(shown, JSON.stringify(change)).toMatchObject(change);
      expect(filterWithGeneralDraft(filter(), shown, SOURCES), JSON.stringify(change)).toMatchObject(change);
    }
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

  it("stores no duration for an empty field, and keeps the filter's duration while the text is not valid", () => {
    expect(filterWithGeneralDraft(filter(), draft({ maxText: "abc" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter(), draft({ maxText: "12abc" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter({ maxDurationSeconds: 60 }), draft({ maxText: "abc" }), SOURCES).maxDurationSeconds).toBe(60);
    expect(filterWithGeneralDraft(filter({ minDurationSeconds: 30 }), draft({ minText: "1:2:3:4" }), SOURCES).minDurationSeconds).toBe(30);
    expect(filterWithGeneralDraft(filter({ maxDurationSeconds: 60 }), draft({ maxText: "" }), SOURCES).maxDurationSeconds).toBeNull();
    expect(filterWithGeneralDraft(filter(), draft({ maxText: "1:00" }), SOURCES).maxDurationSeconds).toBe(60);
  });

  it("stores each date range's choice and a custom range as its dates, and keeps the filter's range while a custom range has a problem", () => {
    const read = (added: DateRangeDraft, created: DateRangeDraft, from = filter()) => {
      const { addedRange, createdRange } = filterWithGeneralDraft(from, draft({ added, created }), SOURCES);
      return { addedRange, createdRange };
    };
    expect(read({ choice: "thisYear", fromText: "2026-01-03", toText: "2026-03-31" }, custom("2026-01-03", "2026-03-31"))).toEqual({
      addedRange: "thisYear",
      createdRange: { from: "2026-01-03", to: "2026-03-31" }
    });
    expect(read({ choice: null, fromText: "2026-01-03", toText: "2026-03-31" }, custom("2026-03-31", "2026-01-03"))).toEqual({
      addedRange: null,
      createdRange: null
    });
    expect(read(custom("", "2026-03-31"), custom("1969-12-31", "2026-03-31"))).toEqual({ addedRange: null, createdRange: null });
    const ranged = filter({ addedRange: { from: "2026-01-03", to: "2026-03-31" }, createdRange: "last7Days" });
    expect(read(custom("", "2026-03-31"), custom("2026-03-31", "2026-01-03"), ranged)).toEqual({
      addedRange: { from: "2026-01-03", to: "2026-03-31" },
      createdRange: "last7Days"
    });
    expect(read({ choice: null, fromText: "", toText: "2026-03-31" }, custom("2026-01-03", "2026-03-31"), ranged)).toEqual({
      addedRange: null,
      createdRange: { from: "2026-01-03", to: "2026-03-31" }
    });
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

describe("filterAsFieldsRead", () => {
  it("reads each duration as its field's text, empty as no limit, and nothing while either text isn't valid", () => {
    const applied = filter({ minDurationSeconds: 90, maxDurationSeconds: 600 });
    expect(filterAsFieldsRead(applied, draft({ minText: "", maxText: "" }))).toMatchObject({
      minDurationSeconds: null,
      maxDurationSeconds: null
    });
    expect(filterAsFieldsRead(filter(), draft({ minText: "90", maxText: "10:00" }))).toMatchObject({
      minDurationSeconds: 90,
      maxDurationSeconds: 600
    });
    expect(filterAsFieldsRead(filter(), draft({ minText: "abc" }))).toBeNull();
    expect(filterAsFieldsRead(filter(), draft({ maxText: "1:75" }))).toBeNull();
    expect(applied).toMatchObject({ minDurationSeconds: 90, maxDurationSeconds: 600 });
  });

  it("reads each date range as its fields, and nothing while a custom range has a problem", () => {
    const applied = filter({ addedRange: "last7Days", createdRange: "thisYear" });
    expect(filterAsFieldsRead(applied, draft({ added: custom("2026-01-03", "2026-01-03") }))).toMatchObject({
      addedRange: { from: "2026-01-03", to: "2026-01-03" },
      createdRange: null
    });
    expect(filterAsFieldsRead(applied, draft({ added: custom("", "2026-01-03") }))).toBeNull();
    expect(filterAsFieldsRead(applied, draft({ created: custom("2026-01-03", "2100-01-01") }))).toBeNull();
    expect(filterAsFieldsRead(applied, draft({ created: custom("2026-03-31", "2026-01-03") }))).toBeNull();
    // Dates kept for another choice aren't read.
    expect(filterAsFieldsRead(applied, draft({ added: { choice: "last90Days", fromText: "", toText: "2026-01-03" } }))).toMatchObject({
      addedRange: "last90Days"
    });
  });
});

describe("generalDraftAfterApply", () => {
  it("drops the dates a date filter not on Custom range kept, and keeps a custom range's", () => {
    const after = generalDraftAfterApply(
      draft({ added: { choice: "last7Days", fromText: "2026-01-03", toText: "2026-03-31" }, created: custom("2026-01-03", "2026-03-31") })
    );
    expect(after.added).toEqual({ choice: "last7Days", fromText: "", toText: "" });
    expect(after.created).toEqual(custom("2026-01-03", "2026-03-31"));
  });
});

describe("DATE_RANGE_CHOICES", () => {
  it("offers Any time, the presets, and Custom range, in the mockup's order", () => {
    expect(DATE_RANGE_CHOICES).toEqual([
      { value: null, label: "Any time" },
      { value: "last7Days", label: "Last 7 days" },
      { value: "last30Days", label: "Last 30 days" },
      { value: "last90Days", label: "Last 90 days" },
      { value: "thisYear", label: "This year" },
      { value: "custom", label: "Custom range" }
    ]);
  });
});

describe("filterFieldProblems", () => {
  const PRESETS = [{ id: "fav", name: "Favorites", filterState: filter() }];

  it("flags a duration that is not valid, read strictly, and not an empty one", () => {
    expect(filterFieldProblems(draft(), "Mine", PRESETS)).toEqual({
      flagModes: null,
      ratingFilters: null,
      minDuration: null,
      maxDuration: null,
      addedFrom: null,
      addedTo: null,
      createdFrom: null,
      createdTo: null,
      newPresetName: null
    });
    for (const text of ["1:7x", "12abc", "1:75"]) {
      expect(filterFieldProblems(draft({ minText: text }), "Mine", PRESETS).minDuration, text).toEqual({ message: DURATION_PROBLEM });
      expect(filterFieldProblems(draft({ maxText: text }), "Mine", PRESETS).maxDuration, text).toEqual({ message: DURATION_PROBLEM });
    }
    expect(filterFieldProblems(draft({ minText: "" }), "Mine", PRESETS).minDuration).toBeNull();
    expect(filterFieldProblems(draft({ minText: "  " }), "Mine", PRESETS).minDuration).toBeNull();
    expect(filterFieldProblems(draft({ minText: "90:00" }), "Mine", PRESETS).minDuration).toBeNull();
  });

  it("flags a custom range's empty date, a date outside 1970 to 2099, and a To before its From", () => {
    const problems = (added: DateRangeDraft) => {
      const { addedFrom, addedTo } = filterFieldProblems(draft({ added }), "Mine", PRESETS);
      return { addedFrom, addedTo };
    };
    expect(problems(custom("2026-01-03", "2026-03-31"))).toEqual({ addedFrom: null, addedTo: null });
    expect(problems(custom("2026-01-03", "2026-01-03"))).toEqual({ addedFrom: null, addedTo: null });
    expect(problems(custom("", ""))).toEqual({ addedFrom: { message: DATE_START_PROBLEM }, addedTo: { message: DATE_END_PROBLEM } });
    expect(problems(custom("1969-12-31", "2100-01-01"))).toEqual({
      addedFrom: { message: DATE_YEARS_PROBLEM },
      addedTo: { message: DATE_YEARS_PROBLEM }
    });
    expect(problems(custom("1970-01-01", "2099-12-31"))).toEqual({ addedFrom: null, addedTo: null });
    expect(problems(custom("2026-03-31", "2026-01-03"))).toEqual({ addedFrom: null, addedTo: { message: DATE_ORDER_PROBLEM } });
    expect(problems(custom("", "2026-01-03"))).toEqual({ addedFrom: { message: DATE_START_PROBLEM }, addedTo: null });
    expect(isFlagged(problems(custom("", "")).addedFrom)).toBe(true);
    expect(DATE_YEARS_PROBLEM).toBe("Choose a date from 1970 to 2099.");
    const created = filterFieldProblems(draft({ created: custom("2026-03-31", "") }), "Mine", PRESETS);
    expect(created).toMatchObject({ createdFrom: null, createdTo: { message: DATE_END_PROBLEM }, addedFrom: null, addedTo: null });
  });

  it("finds no date problem unless the choice is Custom range, whatever dates its fields kept", () => {
    for (const choice of [null, "last7Days", "thisYear"] as const) {
      const { addedFrom, addedTo } = filterFieldProblems(draft({ added: { choice, fromText: "", toText: "" } }), "Mine", PRESETS);
      expect({ addedFrom, addedTo }, String(choice)).toEqual({ addedFrom: null, addedTo: null });
    }
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

  it("flags Only unrated with a minimum rating, and either one alone not at all", () => {
    const problem = (onlyUnrated: boolean, minRating: number | null) =>
      filterFieldProblems(draft({ onlyUnrated, minRating }), "Mine", PRESETS).ratingFilters;
    expect(problem(true, 0.5)).toEqual({ message: RATING_FILTERS_PROBLEM });
    expect(problem(true, 5)).toEqual({ message: RATING_FILTERS_PROBLEM });
    expect(isFlagged(problem(true, 3))).toBe(true);
    expect(problem(true, null)).toBeNull();
    expect(problem(false, 3)).toBeNull();
    expect(problem(false, null)).toBeNull();
    expect(RATING_FILTERS_PROBLEM).toBe("Nothing unrated has a minimum rating. Clear one of them.");
  });
});

describe("editPresetNameProblem", () => {
  const PRESETS = [
    { id: "fav", name: "Favorites", filterState: filter() },
    { id: "beach", name: "Beach days", filterState: filter() }
  ];

  it("finds an empty name required, without a flag", () => {
    for (const text of ["", "   "]) {
      expect(editPresetNameProblem(text, PRESETS, "beach"), JSON.stringify(text)).toBe(EMPTY_FIELD);
      expect(isFlagged(editPresetNameProblem(text, PRESETS, "beach")), JSON.stringify(text)).toBe(false);
    }
  });

  it("flags another preset's name, ignoring case and surrounding spaces", () => {
    for (const text of ["Favorites", "favorites ", " FAVORITES"]) {
      expect(editPresetNameProblem(text, PRESETS, "beach"), text).toEqual({ message: "Use a name no other preset has." });
      expect(isFlagged(editPresetNameProblem(text, PRESETS, "beach")), text).toBe(true);
    }
  });

  it("accepts the preset's own name in any case, and a name no preset has", () => {
    expect(editPresetNameProblem("Beach days", PRESETS, "beach")).toBeNull();
    expect(editPresetNameProblem(" BEACH DAYS ", PRESETS, "beach")).toBeNull();
    expect(editPresetNameProblem("Sunny days", PRESETS, "beach")).toBeNull();
    expect(editPresetNameProblem("Beach days", PRESETS, "fav")).toEqual({ message: "Use a name no other preset has." });
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
    expect(filterHeldReason("apply", "ratingFilters")).toBe("Clear Only unrated or Min Rating to apply.");
    expect(filterHeldReason("updatePreset", "ratingFilters")).toBe("Clear Only unrated or Min Rating first.");
    expect(filterHeldReason("addPreset", "ratingFilters")).toBe("Clear Only unrated or Min Rating first.");
    expect(filterHeldReason("apply", "addedFrom")).toBe("Correct the Added dates to apply.");
    expect(filterHeldReason("apply", "addedTo")).toBe("Correct the Added dates to apply.");
    expect(filterHeldReason("apply", "createdTo")).toBe("Correct the Created dates to apply.");
    expect(filterHeldReason("addPreset", "addedTo")).toBe("Correct the Added dates first.");
    expect(filterHeldReason("updatePreset", "createdFrom")).toBe("Correct the Created dates first.");
  });

  it("checks the General fields for every action and Add Preset's name first, which sits beside it", () => {
    const general = ["flagModes", "ratingFilters", "minDuration", "maxDuration", "addedFrom", "addedTo", "createdFrom", "createdTo"];
    expect(FILTER_ACTION_FIELDS).toEqual({ apply: general, addPreset: ["newPresetName", ...general], updatePreset: general });
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
  it("keeps each preset row's id, names it by its name or id, and leaves out rows without an id, which Apply can't write", () => {
    const rows = presetRowsFromApi([
      { id: "p1", name: " Favorites ", filterState: { favoritesMode: "only" } },
      { id: "p2", name: "", filterState: {} },
      { name: "Nameless id" },
      { name: "" }
    ]);
    expect(rows.map((row) => [row.id, row.name])).toEqual([["p1", "Favorites"], ["p2", "p2"]]);
    expect(rows[0]!.filterState.favoritesMode).toBe("only");
  });

  it("reads preset rows without AND match modes, keeping OR ones", () => {
    const rows = presetRowsFromApi([
      { id: "mixed", name: "Mixed", filterState: { categoryLocalMatchModes: { places: 0, people: 1 } } },
      { id: "and", name: "And", filterState: { categoryLocalMatchModes: { places: 0 } } }
    ]);
    expect(rows.map((row) => row.filterState.categoryLocalMatchModes)).toEqual([{ people: 1 }, null]);
  });

  it("labels a source by its display name and its folder, or whichever it has, then its id", () => {
    expect(SOURCES.map(sourceLabel)).toEqual(["Movies (C:\\movies)", "C:\\photos", "source-3"]);
    expect(sourceLabel({ id: "s", displayName: "C:\\movies", rootPath: "C:\\movies" })).toBe("C:\\movies");
    expect(sourceLabel({ id: "s", displayName: "Movies" })).toBe("Movies");
  });
});
