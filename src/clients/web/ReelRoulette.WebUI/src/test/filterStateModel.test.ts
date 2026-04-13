import { describe, expect, it } from "vitest";
import {
  AUDIO_FILTER,
  cloneFilterState,
  createDefaultFilterState,
  filterStateFromApiObject,
  filterStatesEqualForPresetMatch,
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

  it("presetsToPostBody wraps filterState", () => {
    const rows = [{ name: "P1", filterState: createDefaultFilterState() }];
    const body = presetsToPostBody(rows);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("P1");
    expect(body[0].filterState.excludeBlacklisted).toBe(true);
  });
});
