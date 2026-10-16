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
  presetsToPostBody,
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
  it("default state serializes core booleans and enums", () => {
    const s = createDefaultFilterState();
    const json = serializeFilterStateForApi(s);
    expect(json.favoritesOnly).toBe(false);
    expect(json.excludeBlacklisted).toBe(true);
    expect(json.audioFilter).toBe(AUDIO_FILTER.PlayAll);
    expect(json.selectedTags).toEqual([]);
    expect(json).not.toHaveProperty("minDuration");
    expect(json).not.toHaveProperty("maxDuration");
  });

  it("formats duration like desktop (MM:SS under 1h)", () => {
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

  it("reads a server duration's leading numbers, so the desktop's fractional seconds read as whole seconds", () => {
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

  it("treats an unset global mode as AND, so a desktop preset saved with null matches an explicit AND but not OR", () => {
    const desktopPreset = filterStateFromApiObject(JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":null}'));
    const and = { ...createDefaultFilterState(), selectedTags: ["Ann", "Bob"], globalMatchMode: true };
    const or = { ...and, globalMatchMode: false };

    expect(desktopPreset.globalMatchMode).toBeNull();
    expect(filterStatesEqualForPresetMatch(desktopPreset, and)).toBe(true);
    expect(filterStatesEqualForPresetMatch(and, desktopPreset)).toBe(true);
    expect(filterStatesEqualForPresetMatch(desktopPreset, or)).toBe(false);
    expect(resolvePresetAnchor(and, [{ name: "Desktop", filterState: desktopPreset }], null).label).toBe("Desktop");
    expect(desktopPreset.globalMatchMode).toBeNull();
  });

  it("ignores tagMatchMode in saved preset text, so desktop and WebUI presets with the same filter match", () => {
    const webPreset = filterStateFromApiObject(
      JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":false,"tagMatchMode":1}')
    );
    const desktopPreset = filterStateFromApiObject(
      JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":false,"tagMatchMode":0}')
    );
    const current = { ...createDefaultFilterState(), selectedTags: ["Ann", "Bob"], globalMatchMode: false };

    expect(serializeFilterStateForApi(webPreset)).not.toHaveProperty("tagMatchMode");
    expect(filterStatesEqualForPresetMatch(webPreset, desktopPreset)).toBe(true);
    expect(filterStatesEqualForPresetMatch(current, webPreset)).toBe(true);
    expect(resolvePresetAnchor(current, [{ name: "Web OR", filterState: webPreset }], null).label).toBe("Web OR");
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

  it("presetsToPostBody wraps filterState", () => {
    const rows = [{ name: "P1", filterState: createDefaultFilterState() }];
    const body = presetsToPostBody(rows);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("P1");
    expect(body[0].filterState.excludeBlacklisted).toBe(true);
  });

  it("the preset dropdown's None selects the default filter and a named preset selects that filter", () => {
    const none = filterStateForHeaderPresetSelection(null);
    expect(none).toEqual(createDefaultFilterState());
    const named = filterStateForHeaderPresetSelection({
      filterState: { favoritesOnly: true, excludeBlacklisted: false }
    });
    expect(named.favoritesMode).toBe("only");
    expect(named.blacklistedMode).toBe("off");
  });

  it("classifies None, a named preset, a starred base, and a missing base", () => {
    const youtube = { name: "YouTube", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
    const presets = [youtube];
    const cleanNone = resolvePresetAnchor(createDefaultFilterState(), presets, "YouTube");
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
    const starred = resolvePresetAnchor(dirty, presets, "YouTube");
    expect(starred.label).toBe("YouTube*");
    expect(presetHeading(starred)).toBe("Preset: YouTube*");
    const starredOptions = buildHeaderPresetOptions(starred, [{ id: "yt", name: "YouTube" }]);
    expect(starredOptions.entries.map((entry) => entry.label)).toEqual(["YouTube*", "None", "YouTube"]);
    expect(starredOptions.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);
    expect(headerPresetPick(starredOptions.selectedValue)).toBe("keep");

    const missing = resolvePresetAnchor(dirty, presets, "Gone");
    expect(missing.label).toBe("None*");
    expect(presetHeading(missing)).toBe("Preset: None*");
    expect(buildHeaderPresetOptions(missing, [{ id: "yt", name: "YouTube" }]).entries[0]?.label).toBe("None*");
  });

  it("keeps the dialog base on a dirty edit and adopts a preset the filter comes to match", () => {
    const youtube = { name: "YouTube", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
    const favorites = { name: "Favorites", filterState: { ...createDefaultFilterState(), onlyNeverPlayed: true } };
    const presets = [youtube, favorites];
    const dirty = { ...favorites.filterState, favoritesMode: "only" as const };

    expect(dialogPresetBase(dirty, presets, "Favorites")).toBe("Favorites");
    expect(dialogPresetBase(dirty, presets, "YouTube")).toBe("YouTube");
    expect(dialogPresetBase(dirty, presets, null)).toBeNull();
    expect(dialogPresetBase(favorites.filterState, presets, "YouTube")).toBe("Favorites");
  });

  it("rebuilds the preset dropdown's list without a starred row after None or a named preset", () => {
    const youtube = {
      id: "yt",
      name: "YouTube",
      filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const }
    };
    const dirty = { ...createDefaultFilterState(), favoritesMode: "only" as const, onlyNeverPlayed: true };
    const before = headerPresetListForFilter(dirty, [youtube], "YouTube");
    expect(before.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);

    const named = headerPresetListAfterPick(dirty, [youtube], "YouTube", "yt");
    expect(named.entries.some((entry) => entry.value === HEADER_PRESET_STARRED_VALUE)).toBe(false);
    expect(named.selectedValue).toBe("yt");
    expect(named.baseName).toBe("YouTube");
    expect(named.filter.favoritesMode).toBe("only");
    expect(named.filter.onlyNeverPlayed).toBe(false);

    const none = headerPresetListAfterPick(dirty, [youtube], "YouTube", "");
    expect(none.filter).toEqual(createDefaultFilterState());
    expect(none.baseName).toBeNull();
    expect(none.selectedValue).toBe("");
    expect(none.entries.some((entry) => entry.value === HEADER_PRESET_STARRED_VALUE)).toBe(false);

    const kept = headerPresetListAfterPick(dirty, [youtube], "YouTube", HEADER_PRESET_STARRED_VALUE);
    expect(kept.filter.onlyNeverPlayed).toBe(true);
    expect(kept.baseName).toBe("YouTube");
    expect(kept.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);

    const unknown = headerPresetListAfterPick(dirty, [youtube], "YouTube", "missing");
    expect(unknown.filter.onlyNeverPlayed).toBe(true);
    expect(unknown.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);
  });
});

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../../../../../shared/fixtures/${name}`, import.meta.url), "utf8")) as T;
}

interface FlagModeResolutionCase {
  name: string;
  filter: ApiFilterState;
  favoritesMode: FlagFilterMode;
  blacklistedMode: FlagFilterMode;
}

interface FlagModeProjectionCase {
  name: string;
  favoritesMode: FlagFilterMode;
  blacklistedMode: FlagFilterMode;
  written: Pick<ApiFilterState, "favoritesMode" | "favoritesOnly" | "blacklistedMode" | "excludeBlacklisted">;
}

interface EnumValuesCase {
  name: string;
  filter: ApiFilterState;
  audioFilter: number;
  mediaTypeFilter: number;
  categoryLocalMatchModes: Record<string, number>;
}

// Core and the desktop read the same fixtures.
const resolutionCases = readFixture<FlagModeResolutionCase[]>("filter-mode-resolution.json");
const projectionCases = readFixture<FlagModeProjectionCase[]>("filter-mode-projection.json");
const enumCases = readFixture<EnumValuesCase[]>("filter-enum-values.json");

describe("flag filter mode resolution shared fixture", () => {
  it.each(resolutionCases)("$name", ({ filter, favoritesMode, blacklistedMode }) => {
    const read = filterStateFromApiObject(filter);
    expect(read.favoritesMode).toBe(favoritesMode);
    expect(read.blacklistedMode).toBe(blacklistedMode);
  });
});

describe("flag filter mode projection shared fixture", () => {
  it.each(projectionCases)("$name", ({ favoritesMode, blacklistedMode, written }) => {
    const json = serializeFilterStateForApi({ ...createDefaultFilterState(), favoritesMode, blacklistedMode });
    expect({
      favoritesMode: json.favoritesMode,
      favoritesOnly: json.favoritesOnly,
      blacklistedMode: json.blacklistedMode,
      excludeBlacklisted: json.excludeBlacklisted
    }).toEqual(written);
    const read = filterStateFromApiObject(json);
    expect(read.favoritesMode).toBe(favoritesMode);
    expect(read.blacklistedMode).toBe(blacklistedMode);
  });
});

describe("filter enum values shared fixture", () => {
  it.each(enumCases)("$name", ({ filter, audioFilter, mediaTypeFilter, categoryLocalMatchModes }) => {
    const read = filterStateFromApiObject(filter);
    expect(read.audioFilter).toBe(audioFilter);
    expect(read.mediaTypeFilter).toBe(mediaTypeFilter);
    // The fixture writes none as {}, which the reader holds as null.
    expect(read.categoryLocalMatchModes).toEqual(Object.keys(categoryLocalMatchModes).length ? categoryLocalMatchModes : null);
  });
});

interface WrittenFilterFixture {
  desktop: ApiFilterState;
  webui: ApiFilterState;
}

// One filter as each client writes it in full. The desktop's tests read the same fixture.
const writtenFilters = readFixture<WrittenFilterFixture>("filter-state-written.json");

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
    onlyKnownLoudness: false
  };
}

describe("filter state written shared fixture", () => {
  it("writes the filter as its webui entry", () => {
    expect(serializeFilterStateForApi(writtenFixtureFilter())).toEqual(writtenFilters.webui);
  });

  it.each(projectionCases)("reads its desktop entry with $name", ({ favoritesMode, blacklistedMode, written }) => {
    const read = filterStateFromApiObject({ ...writtenFilters.desktop, ...written });
    expect(read.favoritesMode).toBe(favoritesMode);
    expect(read.blacklistedMode).toBe(blacklistedMode);
    expect(filterStatesEqualForPresetMatch(read, { ...writtenFixtureFilter(), favoritesMode, blacklistedMode })).toBe(true);
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
    expect(isPresetOwnFilter(described, [leftover], "Beach")).toBe(true);
    const list = headerPresetListForFilter(described, [leftover], "Beach");
    expect(list).toMatchObject({ baseName: "Beach", selectedValue: "p-beach" });
    expect(list.entries.map((entry) => entry.label)).toEqual(["None", "Beach"]);
    const picked = headerPresetListAfterPick(createDefaultFilterState(), [leftover], null, "p-beach");
    expect(picked.filter.categoryLocalMatchModes).toBeNull();
  });
});

describe("presetListsEqual", () => {
  const favorites = { name: "Favorites", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
  const recent = { name: "Recent", filterState: { ...createDefaultFilterState(), onlyNeverPlayed: true } };

  it("compares by order, by name with case counting, and by filter as presets match", () => {
    expect(presetListsEqual([favorites, recent], [favorites, recent])).toBe(true);
    expect(presetListsEqual([favorites, recent], [recent, favorites])).toBe(false);
    expect(presetListsEqual([favorites, recent], [favorites])).toBe(false);
    expect(presetListsEqual([favorites], [{ ...favorites, name: "favorites" }])).toBe(false);
    expect(presetListsEqual([favorites], [{ ...favorites, filterState: createDefaultFilterState() }])).toBe(false);
    const sameFilter = { ...favorites, filterState: { ...favorites.filterState, globalMatchMode: null } };
    expect(presetListsEqual([favorites], [sameFilter])).toBe(true);
  });
});
