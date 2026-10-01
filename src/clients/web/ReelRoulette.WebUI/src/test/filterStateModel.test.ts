import { describe, expect, it } from "vitest";
import {
  AUDIO_FILTER,
  cloneFilterState,
  createDefaultFilterState,
  filterStateFromApiObject,
  buildHeaderPresetOptions,
  dialogPresetBase,
  filterDialogHasPendingChanges,
  filterStateForHeaderPresetSelection,
  filterStatesEqualForPresetMatch,
  headerPresetListAfterPick,
  headerPresetListForFilter,
  headerPresetPick,
  HEADER_PRESET_STARRED_VALUE,
  presetHeading,
  resolvePresetAnchor,
  formatDurationForDisplay,
  parseDurationInputToSeconds,
  presetsToPostBody,
  serializeFilterStateForApi,
  TAG_MATCH_MODE
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

  it("parses MM:SS and HH:MM:SS", () => {
    expect(parseDurationInputToSeconds("01:05")).toBe(65);
    expect(parseDurationInputToSeconds("1:01:01")).toBe(3661);
    expect(parseDurationInputToSeconds("90")).toBe(90);
    expect(parseDurationInputToSeconds("")).toBe(null);
    expect(parseDurationInputToSeconds("12:99")).toBe("invalid");
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
    b.favoritesOnly = true;
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

  it("filter dialog Apply is not pending after switching the global mode away and back from an unset opening filter", () => {
    const original = filterStateFromApiObject(JSON.parse('{"selectedTags":["Ann","Bob"],"globalMatchMode":null}'));
    const working = cloneFilterState(original);

    expect(filterDialogHasPendingChanges(working, original, false)).toBe(false);
    working.globalMatchMode = false;
    expect(filterDialogHasPendingChanges(working, original, false)).toBe(true);
    working.globalMatchMode = true;
    expect(filterDialogHasPendingChanges(working, original, false)).toBe(false);
    expect(filterDialogHasPendingChanges(working, original, true)).toBe(true);
    expect(original.globalMatchMode).toBeNull();
  });

  it("presetsToPostBody wraps filterState", () => {
    const rows = [{ name: "P1", filterState: createDefaultFilterState() }];
    const body = presetsToPostBody(rows);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("P1");
    expect(body[0].filterState.excludeBlacklisted).toBe(true);
  });

  it("header None selects the default filter and a named preset selects that filter", () => {
    const none = filterStateForHeaderPresetSelection(null);
    expect(none).toEqual(createDefaultFilterState());
    const named = filterStateForHeaderPresetSelection({
      filterState: { favoritesOnly: true, excludeBlacklisted: false }
    });
    expect(named.favoritesOnly).toBe(true);
    expect(named.excludeBlacklisted).toBe(false);
  });

  it("classifies None, a named preset, a starred base, and a missing base", () => {
    const youtube = { name: "YouTube", filterState: { ...createDefaultFilterState(), favoritesOnly: true } };
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

    const dirty = { ...createDefaultFilterState(), favoritesOnly: true, onlyNeverPlayed: true };
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
    const youtube = { name: "YouTube", filterState: { ...createDefaultFilterState(), favoritesOnly: true } };
    const favorites = { name: "Favorites", filterState: { ...createDefaultFilterState(), onlyNeverPlayed: true } };
    const presets = [youtube, favorites];
    const dirty = { ...favorites.filterState, favoritesOnly: true };

    expect(dialogPresetBase(dirty, presets, "Favorites")).toBe("Favorites");
    expect(dialogPresetBase(dirty, presets, "YouTube")).toBe("YouTube");
    expect(dialogPresetBase(dirty, presets, null)).toBeNull();
    expect(dialogPresetBase(favorites.filterState, presets, "YouTube")).toBe("Favorites");
  });

  it("rebuilds the header list without a starred row after None or a named preset", () => {
    const youtube = {
      id: "yt",
      name: "YouTube",
      filterState: { ...createDefaultFilterState(), favoritesOnly: true }
    };
    const dirty = { ...createDefaultFilterState(), favoritesOnly: true, onlyNeverPlayed: true };
    const before = headerPresetListForFilter(dirty, [youtube], "YouTube");
    expect(before.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);

    const named = headerPresetListAfterPick(dirty, [youtube], "YouTube", "yt");
    expect(named.entries.some((entry) => entry.value === HEADER_PRESET_STARRED_VALUE)).toBe(false);
    expect(named.selectedValue).toBe("yt");
    expect(named.baseName).toBe("YouTube");
    expect(named.filter.favoritesOnly).toBe(true);
    expect(named.filter.onlyNeverPlayed).toBe(false);

    const none = headerPresetListAfterPick(dirty, [youtube], "YouTube", "");
    expect(none.filter).toEqual(createDefaultFilterState());
    expect(none.baseName).toBeNull();
    expect(none.selectedValue).toBe("");
    expect(none.entries.some((entry) => entry.value === HEADER_PRESET_STARRED_VALUE)).toBe(false);

    const everything = {
      id: "all",
      name: "Everything",
      filterState: createDefaultFilterState()
    };
    const heldNone = headerPresetListAfterPick(dirty, [everything], null, "");
    expect(heldNone.baseName).toBeNull();
    expect(heldNone.selectedValue).toBe("");
    expect(heldNone.filter).toEqual(createDefaultFilterState());
    const stillHeld = headerPresetListForFilter(createDefaultFilterState(), [everything], null, true);
    expect(stillHeld.selectedValue).toBe("");
    expect(stillHeld.baseName).toBeNull();
    const released = headerPresetListForFilter(createDefaultFilterState(), [everything], null);
    expect(released.baseName).toBe("Everything");
    expect(released.selectedValue).toBe("all");

    const kept = headerPresetListAfterPick(dirty, [youtube], "YouTube", HEADER_PRESET_STARRED_VALUE);
    expect(kept.filter.onlyNeverPlayed).toBe(true);
    expect(kept.baseName).toBe("YouTube");
    expect(kept.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);

    const unknown = headerPresetListAfterPick(dirty, [youtube], "YouTube", "missing");
    expect(unknown.filter.onlyNeverPlayed).toBe(true);
    expect(unknown.selectedValue).toBe(HEADER_PRESET_STARRED_VALUE);
  });
});
