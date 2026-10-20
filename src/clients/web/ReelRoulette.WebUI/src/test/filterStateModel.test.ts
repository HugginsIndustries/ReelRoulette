import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIO_FILTER,
  cloneFilterState,
  createDefaultFilterState,
  filterStateFromApiObject,
  buildHeaderPresetOptions,
  dialogPresetBase,
  filterDialogHasUnsavedChanges,
  filterStateForHeaderPresetSelection,
  filterStatesEqualForPresetMatch,
  headerPresetListAfterPick,
  headerPresetListForFilter,
  headerPresetPick,
  HEADER_PRESET_STARRED_VALUE,
  presetHeading,
  presetListsEqual,
  resolvePresetAnchor,
  formatDurationForDisplay,
  parseServerDuration,
  parseTypedDuration,
  serializeFilterStateForApi,
  MEDIA_TYPE_FILTER,
  TAG_MATCH_MODE,
  isPresetOwnFilter,
  withoutAndLocalModes,
  type ApiFilterState,
  type FilterState,
  type FlagFilterMode
} from "../filter/filterStateModel";

describe("filterStateModel", () => {
  it("default state serializes core modes and enums", () => {
    const s = createDefaultFilterState();
    const json = serializeFilterStateForApi(s);
    expect(json.favoritesMode).toBe("off");
    expect(json.blacklistedMode).toBe("excluded");
    expect(json.audioFilter).toBe(AUDIO_FILTER.PlayAll);
    expect(json.selectedTags).toEqual([]);
    expect(json).not.toHaveProperty("minDuration");
    expect(json).not.toHaveProperty("maxDuration");
  });

  it("writes Only files this browser can play, and reads it as off unless it is true", () => {
    expect(serializeFilterStateForApi(createDefaultFilterState()).onlyBrowserPlayable).toBe(false);
    expect(serializeFilterStateForApi({ ...createDefaultFilterState(), onlyBrowserPlayable: true }).onlyBrowserPlayable).toBe(true);
    expect(filterStateFromApiObject({ onlyBrowserPlayable: true }).onlyBrowserPlayable).toBe(true);
    expect(filterStateFromApiObject({ onlyBrowserPlayable: false }).onlyBrowserPlayable).toBe(false);
    expect(filterStateFromApiObject({}).onlyBrowserPlayable).toBe(false);
    expect(filterStateFromApiObject({ onlyBrowserPlayable: "true" } as unknown as ApiFilterState).onlyBrowserPlayable).toBe(false);
  });

  it("formats a duration under an hour as MM:SS", () => {
    expect(formatDurationForDisplay(65)).toBe("01:05");
  });

  it("formats duration with hours pad", () => {
    expect(formatDurationForDisplay(3661)).toBe("01:01:01");
  });

  it("parses typed MM:SS, HH:MM:SS, and seconds", () => {
    expect(parseTypedDuration("01:05")).toBe(65);
    expect(parseTypedDuration("1:7")).toBe(67);
    expect(parseTypedDuration("90:00")).toBe(5400);
    expect(parseTypedDuration("1:01:01")).toBe(3661);
    expect(parseTypedDuration("1:59:59")).toBe(7199);
    expect(parseTypedDuration("90")).toBe(90);
    expect(parseTypedDuration(" 12 ")).toBe(12);
    expect(parseTypedDuration("12.5")).toBe(12.5);
    expect(parseTypedDuration("")).toBe(null);
    expect(parseTypedDuration("   ")).toBe(null);
  });

  it("refuses a typed duration that is not whole MM:SS, HH:MM:SS, or a number of seconds", () => {
    for (const text of ["1:7x", "12abc", "1:75", "12:99", "0:60:00", "1:00:60", "1e3", ".5", "12.", "-5", "1:-5", "1:2:3:4", "00:01:30.5000000"]) {
      expect(parseTypedDuration(text), text).toBe("invalid");
    }
  });

  it("reads a server duration's leading numbers, so a stored preset's fractional seconds read as whole seconds", () => {
    expect(parseServerDuration("00:01:30.5000000")).toBe(90);
    expect(parseServerDuration("00:01:30")).toBe(90);
    expect(parseServerDuration("01:05")).toBe(65);
    expect(parseServerDuration("90")).toBe(90);
    expect(parseServerDuration("")).toBe(null);
    expect(parseServerDuration("12:99")).toBe("invalid");
  });

  it("serializes min/max duration as HH:MM:SS for server TimeSpan parsing", () => {
    const s = createDefaultFilterState();
    s.minDurationSeconds = 600;
    s.maxDurationSeconds = 30;
    const ser = serializeFilterStateForApi(s);
    expect(ser.minDuration).toBe("00:10:00");
    expect(ser.maxDuration).toBe("00:00:30");
  });

  it("round-trips durations through API object", () => {
    const s = createDefaultFilterState();
    s.minDurationSeconds = 125;
    s.maxDurationSeconds = 3600;
    const ser = serializeFilterStateForApi(s);
    expect(ser.minDuration).toBe("00:02:05");
    expect(ser.maxDuration).toBe("01:00:00");
    const back = filterStateFromApiObject(ser);
    expect(back.minDurationSeconds).toBe(125);
    expect(back.maxDurationSeconds).toBe(3600);
  });

  it("tri-state tag lists round-trip", () => {
    const s = createDefaultFilterState();
    s.selectedTags = ["A", "b"];
    s.excludedTags = ["C"];
    const back = filterStateFromApiObject(serializeFilterStateForApi(s));
    expect(back.selectedTags).toEqual(["A", "b"]);
    expect(back.excludedTags).toEqual(["C"]);
  });

  it("categoryLocalMatchModes round-trip", () => {
    const s = createDefaultFilterState();
    s.categoryLocalMatchModes = { cat1: TAG_MATCH_MODE.Or };
    const back = filterStateFromApiObject(serializeFilterStateForApi(s));
    expect(back.categoryLocalMatchModes).toEqual({ cat1: TAG_MATCH_MODE.Or });
  });

  it("cloneFilterState is deep for collections", () => {
    const a = createDefaultFilterState();
    a.selectedTags.push("x");
    const b = cloneFilterState(a);
    b.selectedTags.push("y");
    expect(a.selectedTags).toEqual(["x"]);
    expect(b.selectedTags).toEqual(["x", "y"]);
  });

  it("filterStatesEqualForPresetMatch matches serialized payload", () => {
    const a = createDefaultFilterState();
    const b = createDefaultFilterState();
    expect(filterStatesEqualForPresetMatch(a, b)).toBe(true);
    b.favoritesMode = "only";
    expect(filterStatesEqualForPresetMatch(a, b)).toBe(false);
  });

  it("treats an unset global mode as AND, so a preset saved with null matches an explicit AND but not OR", () => {
    const storedPreset = filterStateFromApiObject(JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":null}'));
    const and = { ...createDefaultFilterState(), selectedTags: ["Ann", "Bob"], globalMatchMode: true };
    const or = { ...and, globalMatchMode: false };

    expect(storedPreset.globalMatchMode).toBeNull();
    expect(filterStatesEqualForPresetMatch(storedPreset, and)).toBe(true);
    expect(filterStatesEqualForPresetMatch(and, storedPreset)).toBe(true);
    expect(filterStatesEqualForPresetMatch(storedPreset, or)).toBe(false);
    expect(resolvePresetAnchor(and, [{ id: "stored", name: "Stored", filterState: storedPreset }], null).label).toBe("Stored");
    expect(storedPreset.globalMatchMode).toBeNull();
  });

  it("ignores tagMatchMode in saved preset text, so presets saved with different values and the same filter match", () => {
    const orTextPreset = filterStateFromApiObject(
      JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":false,"tagMatchMode":1}')
    );
    const andTextPreset = filterStateFromApiObject(
      JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":false,"tagMatchMode":0}')
    );
    const current = { ...createDefaultFilterState(), selectedTags: ["Ann", "Bob"], globalMatchMode: false };

    expect(serializeFilterStateForApi(orTextPreset)).not.toHaveProperty("tagMatchMode");
    expect(filterStatesEqualForPresetMatch(orTextPreset, andTextPreset)).toBe(true);
    expect(filterStatesEqualForPresetMatch(current, orTextPreset)).toBe(true);
    expect(resolvePresetAnchor(current, [{ id: "web-or", name: "Web OR", filterState: orTextPreset }], null).label).toBe("Web OR");
  });

  it("the Filter tab has no unsaved changes after switching the global mode away and back from an unset applied filter", () => {
    const applied = filterStateFromApiObject(JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":null}'));
    const working = cloneFilterState(applied);

    expect(filterDialogHasUnsavedChanges(working, applied, false)).toBe(false);
    working.globalMatchMode = false;
    expect(filterDialogHasUnsavedChanges(working, applied, false)).toBe(true);
    working.globalMatchMode = true;
    expect(filterDialogHasUnsavedChanges(working, applied, false)).toBe(false);
    expect(filterDialogHasUnsavedChanges(working, applied, true)).toBe(true);
    expect(applied.globalMatchMode).toBeNull();
  });

  it("the preset dropdown's None selects the default filter and a named preset selects that filter", () => {
    const none = filterStateForHeaderPresetSelection(null);
    expect(none).toEqual(createDefaultFilterState());
    const named = filterStateForHeaderPresetSelection({
      filterState: { favoritesMode: "only", blacklistedMode: "off" }
    });
    expect(named.favoritesMode).toBe("only");
    expect(named.blacklistedMode).toBe("off");
  });

  it("classifies None, a named preset, a starred base, and a missing base, which stays as None*", () => {
    const youtube = { id: "yt", name: "YouTube", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
    const presets = [youtube];
    const cleanNone = resolvePresetAnchor(createDefaultFilterState(), presets, "yt");
    expect(cleanNone.label).toBe("None");
    expect(presetHeading(cleanNone)).toBe("Preset: None");
    expect(buildHeaderPresetOptions(cleanNone, [{ id: "yt", name: "YouTube" }]).entries.map((entry) => entry.label)).toEqual([
      "None",
      "YouTube"
    ]);

    const cleanNamed = resolvePresetAnchor(youtube.filterState, presets, null);
    expect(cleanNamed.label).toBe("YouTube");
    expect(presetHeading(cleanNamed)).toBe("Preset: YouTube");

    const dirty = { ...createDefaultFilterState(), favoritesMode: "only" as const, onlyNeverPlayed: true };
    const starred = resolvePresetAnchor(dirty, presets, "yt");
    expect(starred.label).toBe("YouTube*");
    expect(presetHeading(starred)).toBe("Preset: YouTube*");
    const starredOptions = buildHeaderPresetOptions(starred, [{ id: "yt", name: "YouTube" }]);
    expect(starredOptions.entries.map((entry) => entry.label)).toEqual(["YouTube*", "None", "YouTube"]);
    expect(starredOptions.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);
    expect(headerPresetPick(starredOptions.selectedValue)).toBe("keep");

    const missing = resolvePresetAnchor(dirty, presets, "gone");
    expect(missing.label).toBe("None*");
    expect(missing.baseId).toBe("gone");
    expect(presetHeading(missing)).toBe("Preset: None*");
    expect(buildHeaderPresetOptions(missing, [{ id: "yt", name: "YouTube" }]).entries[0]?.label).toBe("None*");
  });

  it("keeps the dialog base on a dirty edit and adopts a preset the filter comes to match", () => {
    const youtube = { id: "yt", name: "YouTube", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
    const favorites = { id: "fav", name: "Favorites", filterState: { ...createDefaultFilterState(), onlyNeverPlayed: true } };
    const presets = [youtube, favorites];
    const dirty = { ...favorites.filterState, favoritesMode: "only" as const };

    expect(dialogPresetBase(dirty, presets, "fav")).toBe("fav");
    expect(dialogPresetBase(dirty, presets, "yt")).toBe("yt");
    expect(dialogPresetBase(dirty, presets, null)).toBeNull();
    expect(dialogPresetBase(favorites.filterState, presets, "yt")).toBe("fav");
  });

  it("rebuilds the preset dropdown's list without a starred row after None or a named preset", () => {
    const youtube = {
      id: "yt",
      name: "YouTube",
      filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const }
    };
    const dirty = { ...createDefaultFilterState(), favoritesMode: "only" as const, onlyNeverPlayed: true };
    const before = headerPresetListForFilter(dirty, [youtube], "yt");
    expect(before.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);

    const named = headerPresetListAfterPick(dirty, [youtube], "yt", "yt");
    expect(named.entries.some((entry) => entry.value === HEADER_PRESET_STARRED_VALUE)).toBe(false);
    expect(named.selectedValue).toBe("yt");
    expect(named.baseId).toBe("yt");
    expect(named.filter.favoritesMode).toBe("only");
    expect(named.filter.onlyNeverPlayed).toBe(false);

    const none = headerPresetListAfterPick(dirty, [youtube], "yt", "");
    expect(none.filter).toEqual(createDefaultFilterState());
    expect(none.baseId).toBeNull();
    expect(none.selectedValue).toBe("");
    expect(none.entries.some((entry) => entry.value === HEADER_PRESET_STARRED_VALUE)).toBe(false);

    const kept = headerPresetListAfterPick(dirty, [youtube], "yt", HEADER_PRESET_STARRED_VALUE);
    expect(kept.filter.onlyNeverPlayed).toBe(true);
    expect(kept.baseId).toBe("yt");
    expect(kept.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);

    const unknown = headerPresetListAfterPick(dirty, [youtube], "yt", "missing");
    expect(unknown.filter.onlyNeverPlayed).toBe(true);
    expect(unknown.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);
  });
});

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../../../../../shared/fixtures/${name}`, import.meta.url), "utf8")) as T;
}

interface EnumValuesCase {
  name: string;
  filter: ApiFilterState;
  audioFilter: number;
  mediaTypeFilter: number;
  categoryLocalMatchModes: Record<string, number>;
  favoritesMode: FlagFilterMode;
  blacklistedMode: FlagFilterMode;
}

// Core reads the same fixture.
const enumCases = readFixture<EnumValuesCase[]>("filter-enum-values.json");

describe("flag filter modes read", () => {
  it("reads a missing mode as the default filter's, without the older favoritesOnly and excludeBlacklisted", () => {
    const read = filterStateFromApiObject({ favoritesOnly: true, excludeBlacklisted: false });
    expect(read.favoritesMode).toBe("off");
    expect(read.blacklistedMode).toBe("excluded");
  });
});

const FLAG_MODES: readonly FlagFilterMode[] = ["off", "only", "excluded"];
const flagModeCombinations = FLAG_MODES.flatMap((favoritesMode) =>
  FLAG_MODES.map((blacklistedMode) => ({ favoritesMode, blacklistedMode }))
);

describe("flag filter modes written", () => {
  it.each(flagModeCombinations)(
    "writes Favorites $favoritesMode and Blacklisted $blacklistedMode as the modes only, and reads them back",
    ({ favoritesMode, blacklistedMode }) => {
      const json = serializeFilterStateForApi({ ...createDefaultFilterState(), favoritesMode, blacklistedMode });
      expect(json.favoritesMode).toBe(favoritesMode);
      expect(json.blacklistedMode).toBe(blacklistedMode);
      expect(json).not.toHaveProperty("favoritesOnly");
      expect(json).not.toHaveProperty("excludeBlacklisted");
      const read = filterStateFromApiObject(json);
      expect(read.favoritesMode).toBe(favoritesMode);
      expect(read.blacklistedMode).toBe(blacklistedMode);
    }
  );
});

describe("filter enum values shared fixture", () => {
  it.each(enumCases)("$name", ({ filter, audioFilter, mediaTypeFilter, categoryLocalMatchModes, favoritesMode, blacklistedMode }) => {
    const read = filterStateFromApiObject(filter);
    expect(read.audioFilter).toBe(audioFilter);
    expect(read.mediaTypeFilter).toBe(mediaTypeFilter);
    // The fixture writes none as {}, which the reader holds as null.
    expect(read.categoryLocalMatchModes).toEqual(Object.keys(categoryLocalMatchModes).length ? categoryLocalMatchModes : null);
    expect(read.favoritesMode).toBe(favoritesMode);
    expect(read.blacklistedMode).toBe(blacklistedMode);
  });
});

interface WrittenFilterFixture {
  webui: ApiFilterState;
}

// One filter as the WebUI writes it in full.
const writtenFilters = JSON.parse(
  readFileSync(new URL("./fixtures/filter-state-written.json", import.meta.url), "utf8")
) as WrittenFilterFixture;

/** The fixture's filter: Favorites excluded, Blacklisted only, and a value in every other field. */
function writtenFixtureFilter(): FilterState {
  return {
    ...createDefaultFilterState(),
    favoritesMode: "excluded",
    blacklistedMode: "only",
    onlyNeverPlayed: true,
    audioFilter: AUDIO_FILTER.WithAudioOnly,
    mediaTypeFilter: MEDIA_TYPE_FILTER.VideosOnly,
    minDurationSeconds: 90,
    maxDurationSeconds: 5400,
    selectedTags: ["Beach"],
    excludedTags: ["Spoiler"],
    categoryLocalMatchModes: { people: TAG_MATCH_MODE.Or },
    globalMatchMode: false,
    includedSourceIds: ["source-1"],
    onlyKnownDuration: false,
    onlyKnownLoudness: false,
    onlyBrowserPlayable: true
  };
}

describe("filter state written fixture", () => {
  it("writes the filter as its webui entry", () => {
    expect(serializeFilterStateForApi(writtenFixtureFilter())).toEqual(writtenFilters.webui);
  });
});

describe("AND match modes read for use", () => {
  it("drops a category's AND entry, keeping its OR entries, and an emptied map reads as none", () => {
    const read = filterStateFromApiObject({ categoryLocalMatchModes: { places: 0, people: 1 } });
    expect(read.categoryLocalMatchModes).toEqual({ places: 0, people: 1 });
    expect(withoutAndLocalModes(read).categoryLocalMatchModes).toEqual({ people: 1 });
    expect(withoutAndLocalModes(filterStateFromApiObject({ categoryLocalMatchModes: { places: "And" } })).categoryLocalMatchModes).toBeNull();
    expect(withoutAndLocalModes(createDefaultFilterState()).categoryLocalMatchModes).toBeNull();
    expect(read.categoryLocalMatchModes).toEqual({ places: 0, people: 1 });
  });

  it("reads a preset from the server without AND entries, so a preset saved with a leftover one matches the filter it describes", () => {
    const leftover = { id: "p-beach", name: "Beach", filterState: { selectedTags: ["Beach"], categoryLocalMatchModes: { places: 0 } } };
    const described: FilterState = { ...createDefaultFilterState(), selectedTags: ["Beach"] };

    expect(filterStateForHeaderPresetSelection(leftover).categoryLocalMatchModes).toBeNull();
    expect(isPresetOwnFilter(described, [leftover], "p-beach")).toBe(true);
    const list = headerPresetListForFilter(described, [leftover], "p-beach");
    expect(list).toMatchObject({ baseId: "p-beach", selectedValue: "p-beach" });
    expect(list.entries.map((entry) => entry.label)).toEqual(["None", "Beach"]);
    const picked = headerPresetListAfterPick(createDefaultFilterState(), [leftover], null, "p-beach");
    expect(picked.filter.categoryLocalMatchModes).toBeNull();
  });
});

describe("presetListsEqual", () => {
  const favorites = { id: "fav", name: "Favorites", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
  const recent = { id: "recent", name: "Recent", filterState: { ...createDefaultFilterState(), onlyNeverPlayed: true } };

  it("compares by order, by id, by name with case counting, and by filter as presets match", () => {
    expect(presetListsEqual([favorites, recent], [favorites, recent])).toBe(true);
    expect(presetListsEqual([favorites, recent], [recent, favorites])).toBe(false);
    expect(presetListsEqual([favorites, recent], [favorites])).toBe(false);
    expect(presetListsEqual([favorites], [{ ...favorites, name: "favorites" }])).toBe(false);
    expect(presetListsEqual([favorites], [{ ...favorites, id: "other" }])).toBe(false);
    expect(presetListsEqual([favorites], [{ ...favorites, filterState: createDefaultFilterState() }])).toBe(false);
    const sameFilter = { ...favorites, filterState: { ...favorites.filterState, globalMatchMode: null } };
    expect(presetListsEqual([favorites], [sameFilter])).toBe(true);
  });
});
