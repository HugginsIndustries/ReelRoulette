/**
 * WebUI filter state aligned with the server's FilterState JSON and its list filter parser.
 * Enums use numeric values (System.Text.Json default for C# enums).
 */

import type { components } from "../types/openapi.generated";

/** A filter state as it goes over the wire, holding durations as text. */
export type ApiFilterState = components["schemas"]["FilterState"];

export const AUDIO_FILTER = { PlayAll: 0, WithAudioOnly: 1, WithoutAudioOnly: 2 } as const;
export const MEDIA_TYPE_FILTER = { All: 0, VideosOnly: 1, PhotosOnly: 2 } as const;
export const TAG_MATCH_MODE = { And: 0, Or: 1 } as const;

export type AudioFilterMode = (typeof AUDIO_FILTER)[keyof typeof AUDIO_FILTER];
export type MediaTypeFilter = (typeof MEDIA_TYPE_FILTER)[keyof typeof MEDIA_TYPE_FILTER];
export type TagMatchMode = (typeof TAG_MATCH_MODE)[keyof typeof TAG_MATCH_MODE];

/** How the Favorites or Blacklisted filter treats its flag: ignored, required, or excluded. */
export type FlagFilterMode = NonNullable<ApiFilterState["favoritesMode"]>;

export interface FilterState {
  favoritesMode: FlagFilterMode;
  blacklistedMode: FlagFilterMode;
  onlyNeverPlayed: boolean;
  onlyKnownDuration: boolean;
  onlyKnownLoudness: boolean;
  audioFilter: AudioFilterMode;
  mediaTypeFilter: MediaTypeFilter;
  /** true = AND across categories, false = OR; null/absent treated as AND on server via Core */
  globalMatchMode: boolean | null;
  categoryLocalMatchModes: Record<string, TagMatchMode> | null;
  selectedTags: string[];
  excludedTags: string[];
  includedSourceIds: string[];
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
}

export function createDefaultFilterState(): FilterState {
  return {
    favoritesMode: "off",
    blacklistedMode: "excluded",
    onlyNeverPlayed: false,
    onlyKnownDuration: false,
    onlyKnownLoudness: false,
    audioFilter: AUDIO_FILTER.PlayAll,
    mediaTypeFilter: MEDIA_TYPE_FILTER.All,
    globalMatchMode: true,
    categoryLocalMatchModes: null,
    selectedTags: [],
    excludedTags: [],
    includedSourceIds: [],
    minDurationSeconds: null,
    maxDurationSeconds: null
  };
}

/** Whether a filter is the default one, by the preset comparison: None stands for it, and no preset may hold it. */
export function isDefaultFilter(filter: FilterState): boolean {
  return filterStatesEqualForPresetMatch(filter, createDefaultFilterState());
}

/** The preset dropdown. None selects the default filter; a named preset selects that preset's filter. */
export function filterStateForHeaderPresetSelection(
  preset: { filterState?: ApiFilterState | null } | null | undefined
): FilterState {
  if (!preset) {
    return createDefaultFilterState();
  }
  return withoutAndLocalModes(filterStateFromApiObject(preset.filterState));
}

export const HEADER_PRESET_NONE_LABEL = "None";
export const HEADER_PRESET_STARRED_VALUE = "\u0000starred";

export interface PresetAnchor {
  baseName: string | null;
  starred: boolean;
  label: string;
}

export interface PresetListEntry {
  label: string;
  value: string;
}

export type HeaderPresetPick = "keep" | "default" | "named";

function presetNamesEqual(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** The saved preset with this name, matched as the preset dropdown matches names, ignoring case. */
export function findPresetByName<T extends { id: string; name: string }>(presets: readonly T[], name: string): T | undefined {
  return presets.find((preset) => presetNamesEqual(String(preset.name || preset.id || ""), name));
}

/** Whether `filter` is the named saved preset's own filter, unchanged, as the preset dropdown shows it without a star. */
export function isPresetOwnFilter(
  filter: FilterState,
  presets: readonly { id: string; name: string; filterState?: ApiFilterState | null }[],
  name: string | null
): boolean {
  const preset = name === null ? undefined : findPresetByName(presets, name);
  return !!preset && filterStatesEqualForPresetMatch(filterStateForHeaderPresetSelection(preset), filter);
}

function describePresetAnchor(baseName: string | null, starred: boolean): PresetAnchor {
  const shown = baseName ?? HEADER_PRESET_NONE_LABEL;
  return {
    baseName,
    starred,
    label: starred ? `${shown}*` : shown
  };
}

/**
 * None for the default filter, which no preset may hold; otherwise the first preset whose filter matches, or else the
 * previous preset, or None, with a star. A server match is not consulted here.
 */
export function resolvePresetAnchor(
  current: FilterState,
  presets: readonly { name: string; filterState: FilterState }[],
  previousBase: string | null | undefined
): PresetAnchor {
  if (isDefaultFilter(current)) {
    return describePresetAnchor(null, false);
  }
  const match = presets.find((preset) => filterStatesEqualForPresetMatch(preset.filterState, current));
  if (match?.name) {
    return describePresetAnchor(match.name, false);
  }
  const base = String(previousBase || "").trim();
  const existing = base ? presets.find((preset) => presetNamesEqual(preset.name, base)) : undefined;
  if (existing) {
    return describePresetAnchor(existing.name, true);
  }
  return describePresetAnchor(null, true);
}

/**
 * The named preset, or None for null, starred while the filter differs from that preset's filter, or from the default
 * filter for None. A null filter, such as one whose duration text isn't valid, differs from every filter.
 */
export function presetAnchorForFilter(
  filter: FilterState | null,
  presets: readonly { name: string; filterState: FilterState }[],
  baseName: string | null
): PresetAnchor {
  const matches =
    !!filter &&
    (baseName === null
      ? isDefaultFilter(filter)
      : presets.some((preset) => preset.name === baseName && filterStatesEqualForPresetMatch(preset.filterState, filter)));
  return describePresetAnchor(baseName, !matches);
}

export function presetHeading(anchor: PresetAnchor): string {
  return `Preset: ${anchor.label}`;
}

export function buildHeaderPresetOptions(
  anchor: PresetAnchor,
  presets: readonly { id: string; name: string }[]
): { entries: PresetListEntry[]; selectedValue: string } {
  const entries: PresetListEntry[] = [];
  if (anchor.starred) {
    entries.push({ label: anchor.label, value: HEADER_PRESET_STARRED_VALUE });
  }
  entries.push({ label: HEADER_PRESET_NONE_LABEL, value: "" });
  for (const preset of presets) {
    const name = String(preset.name || preset.id || "").trim();
    if (!name) {
      continue;
    }
    entries.push({ label: name, value: preset.id });
  }
  if (anchor.starred) {
    return { entries, selectedValue: HEADER_PRESET_STARRED_VALUE };
  }
  if (!anchor.baseName) {
    return { entries, selectedValue: "" };
  }
  const selected = presets.find((preset) => presetNamesEqual(String(preset.name || preset.id || ""), anchor.baseName || ""));
  return { entries, selectedValue: selected?.id ?? "" };
}

export function headerPresetPick(value: string | null | undefined): HeaderPresetPick {
  if (value === HEADER_PRESET_STARRED_VALUE) {
    return "keep";
  }
  if (!String(value || "").trim()) {
    return "default";
  }
  return "named";
}

/** Base stored by the filter dialog. The previous base is the dialog's, after the heading has followed the working filter. */
export function dialogPresetBase(
  working: FilterState,
  presets: readonly { name: string; filterState: FilterState }[],
  dialogBase: string | null | undefined
): string | null {
  return resolvePresetAnchor(working, presets, dialogBase).baseName;
}

export interface HeaderPresetList {
  filter: FilterState;
  baseName: string | null;
  entries: PresetListEntry[];
  selectedValue: string;
}

function presetRowsFromHeaderPresets(
  presets: readonly { id?: string; name?: string; filterState?: ApiFilterState | null }[]
): { name: string; filterState: FilterState }[] {
  const rows: { name: string; filterState: FilterState }[] = [];
  for (const preset of presets) {
    const name = String(preset.name || preset.id || "").trim();
    if (!name) {
      continue;
    }
    rows.push({ name, filterState: withoutAndLocalModes(filterStateFromApiObject(preset.filterState)) });
  }
  return rows;
}

export function headerPresetListForFilter(
  filter: FilterState,
  presets: readonly { id: string; name: string; filterState?: ApiFilterState | null }[],
  previousBase: string | null | undefined
): HeaderPresetList {
  const anchor = resolvePresetAnchor(filter, presetRowsFromHeaderPresets(presets), previousBase);
  const options = buildHeaderPresetOptions(anchor, presets);
  return {
    filter: cloneFilterState(filter),
    baseName: anchor.baseName,
    entries: options.entries,
    selectedValue: options.selectedValue
  };
}

/** None and a named preset replace the filter. The starred row keeps it. The returned list matches that filter. */
export function headerPresetListAfterPick(
  filter: FilterState,
  presets: readonly { id: string; name: string; filterState?: ApiFilterState | null }[],
  previousBase: string | null | undefined,
  pickedValue: string | null | undefined
): HeaderPresetList {
  const pick = headerPresetPick(pickedValue);
  if (pick === "default") {
    return headerPresetListForFilter(createDefaultFilterState(), presets, null);
  }
  if (pick === "named") {
    const preset = presets.find((candidate) => candidate.id === pickedValue);
    if (preset) {
      const name = String(preset.name || preset.id || "").trim() || null;
      return headerPresetListForFilter(filterStateForHeaderPresetSelection(preset), presets, name);
    }
  }
  return headerPresetListForFilter(filter, presets, previousBase);
}

export function cloneFilterState(source: FilterState): FilterState {
  return {
    ...source,
    selectedTags: [...source.selectedTags],
    excludedTags: [...source.excludedTags],
    includedSourceIds: [...source.includedSourceIds],
    categoryLocalMatchModes: source.categoryLocalMatchModes
      ? { ...source.categoryLocalMatchModes }
      : null
  };
}

/** A duration as the Filter tab shows it: `MM:SS`, or `HH:MM:SS` from one hour. */
export function formatDurationForDisplay(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "";
  }
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours >= 1) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Serialize duration for `filterState` JSON sent to the server.
 * Always `HH:MM:SS` so the server's `TimeSpan.TryParse` (InvariantCulture) reads it as written;
 * two-part strings are parsed as hours:minutes on the server, not minutes:seconds.
 */
export function formatDurationForApi(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00:00";
  }
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * A typed duration in seconds, null when empty, or "invalid": whole MM:SS or HH:MM:SS with seconds under 60, and
 * minutes under 60 in HH:MM:SS, or a number of seconds. MM:SS minutes have no limit, so "90:00" is 90 minutes.
 */
export function parseTypedDuration(text: string): number | null | "invalid" {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  let match = /^(\d+):(\d{1,2})$/.exec(raw);
  if (match) {
    const [minutes, seconds] = [Number(match[1]), Number(match[2])];
    return seconds < 60 ? minutes * 60 + seconds : "invalid";
  }
  match = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (match) {
    const [hours, minutes, seconds] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return minutes < 60 && seconds < 60 ? hours * 3600 + minutes * 60 + seconds : "invalid";
  }
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : "invalid";
}

/**
 * A duration from a preset or filter the server sent, in seconds, null if empty, or "invalid". It reads each part's
 * leading number, so fractional seconds in a stored preset, such as "00:01:30.5000000", read as 90.
 */
export function parseServerDuration(text: string): number | null | "invalid" {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(":");
  if (parts.length === 2) {
    const minutes = Number.parseInt(parts[0]!, 10);
    const seconds = Number.parseInt(parts[1]!, 10);
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60) {
      return minutes * 60 + seconds;
    }
    return "invalid";
  }
  if (parts.length === 3) {
    const hours = Number.parseInt(parts[0]!, 10);
    const minutes = Number.parseInt(parts[1]!, 10);
    const seconds = Number.parseInt(parts[2]!, 10);
    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(seconds) &&
      hours >= 0 &&
      minutes >= 0 &&
      minutes < 60 &&
      seconds >= 0 &&
      seconds < 60
    ) {
      return hours * 3600 + minutes * 60 + seconds;
    }
    return "invalid";
  }

  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  return "invalid";
}

function durationToApiValue(seconds: number): string {
  return formatDurationForApi(seconds);
}

/** Serialize for POST /api/random and preset snapshots. Each flag filter is written as its mode. */
export function serializeFilterStateForApi(state: FilterState): ApiFilterState {
  const out: ApiFilterState = {
    favoritesMode: state.favoritesMode,
    blacklistedMode: state.blacklistedMode,
    onlyNeverPlayed: state.onlyNeverPlayed,
    onlyKnownDuration: state.onlyKnownDuration,
    onlyKnownLoudness: state.onlyKnownLoudness,
    audioFilter: state.audioFilter,
    mediaTypeFilter: state.mediaTypeFilter,
    globalMatchMode: state.globalMatchMode,
    selectedTags: [...state.selectedTags],
    excludedTags: [...state.excludedTags],
    includedSourceIds: [...state.includedSourceIds]
  };

  if (state.categoryLocalMatchModes && Object.keys(state.categoryLocalMatchModes).length > 0) {
    const modes: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.categoryLocalMatchModes)) {
      modes[k] = v;
    }
    out.categoryLocalMatchModes = modes;
  }

  if (state.minDurationSeconds != null && Number.isFinite(state.minDurationSeconds)) {
    out.minDuration = durationToApiValue(state.minDurationSeconds);
  }
  if (state.maxDurationSeconds != null && Number.isFinite(state.maxDurationSeconds)) {
    out.maxDuration = durationToApiValue(state.maxDurationSeconds);
  }

  return out;
}

function readDurationFromUnknown(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const p = parseServerDuration(value);
    if (p === "invalid") {
      return null;
    }
    return p;
  }
  return null;
}

/**
 * An enum value is a name from `names` in any case, or an integer. Anything else, including null, is null. Matches
 * the server's list filter parser. Locked to shared/fixtures/filter-enum-values.json.
 */
function readEnumValue(value: unknown, names: Readonly<Record<string, number>>): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();
  for (const [name, code] of Object.entries(names)) {
    if (name.toLowerCase() === lower) {
      return code;
    }
  }
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * A mode is one of the names `off`, `only`, or `excluded` in any case. Anything else counts as missing, which reads as
 * the default filter's mode, as the server's parser reads it. Locked to shared/fixtures/filter-enum-values.json.
 */
function readFlagMode(value: unknown): FlagFilterMode | null {
  if (typeof value !== "string") {
    return null;
  }
  const lower = value.toLowerCase();
  return lower === "off" || lower === "only" || lower === "excluded" ? lower : null;
}

/** Hydrate from an API filter state. Each field is still checked, since a stored preset holds whatever was posted. */
export function filterStateFromApiObject(raw: ApiFilterState | null | undefined): FilterState {
  const base = createDefaultFilterState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;

  base.favoritesMode = readFlagMode(o.favoritesMode) ?? base.favoritesMode;
  base.blacklistedMode = readFlagMode(o.blacklistedMode) ?? base.blacklistedMode;
  if (typeof o.onlyNeverPlayed === "boolean") {
    base.onlyNeverPlayed = o.onlyNeverPlayed;
  }
  if (typeof o.onlyKnownDuration === "boolean") {
    base.onlyKnownDuration = o.onlyKnownDuration;
  }
  if (typeof o.onlyKnownLoudness === "boolean") {
    base.onlyKnownLoudness = o.onlyKnownLoudness;
  }

  base.audioFilter = (readEnumValue(o.audioFilter, AUDIO_FILTER) ?? base.audioFilter) as AudioFilterMode;
  base.mediaTypeFilter = (readEnumValue(o.mediaTypeFilter, MEDIA_TYPE_FILTER) ?? base.mediaTypeFilter) as MediaTypeFilter;

  if (typeof o.globalMatchMode === "boolean") {
    base.globalMatchMode = o.globalMatchMode;
  } else if (o.globalMatchMode === null) {
    base.globalMatchMode = null;
  }

  if (Array.isArray(o.selectedTags)) {
    base.selectedTags = o.selectedTags.map((x) => String(x)).filter(Boolean);
  }
  if (Array.isArray(o.excludedTags)) {
    base.excludedTags = o.excludedTags.map((x) => String(x)).filter(Boolean);
  }
  if (Array.isArray(o.includedSourceIds)) {
    base.includedSourceIds = o.includedSourceIds.map((x) => String(x)).filter(Boolean);
  }

  if (o.categoryLocalMatchModes && typeof o.categoryLocalMatchModes === "object" && !Array.isArray(o.categoryLocalMatchModes)) {
    // An entry whose mode is unknown or null is dropped, as the server's parser drops it.
    const cm: Record<string, TagMatchMode> = {};
    for (const [k, v] of Object.entries(o.categoryLocalMatchModes as Record<string, unknown>)) {
      const mode = readEnumValue(v, TAG_MATCH_MODE);
      if (mode !== null) {
        cm[k] = mode as TagMatchMode;
      }
    }
    base.categoryLocalMatchModes = Object.keys(cm).length ? cm : null;
  }

  base.minDurationSeconds = readDurationFromUnknown(o.minDuration);
  base.maxDurationSeconds = readDurationFromUnknown(o.maxDuration);

  return base;
}

/**
 * The filter without its categories' AND match modes, as the WebUI keeps a filter it reads for its own use: a category
 * without a mode filters as AND, so its entry says nothing, and a filter put back to AND then matches its preset. A
 * map left empty reads as none.
 */
export function withoutAndLocalModes(filter: FilterState): FilterState {
  const modes = filter.categoryLocalMatchModes;
  if (!modes) {
    return filter;
  }
  const kept = Object.fromEntries(Object.entries(modes).filter(([, mode]) => mode !== TAG_MATCH_MODE.And));
  return { ...filter, categoryLocalMatchModes: Object.keys(kept).length > 0 ? kept : null };
}

/** Sorted, de-duplicated values compared by UTF-16 code unit, matching ordinal order in C#. */
function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function comparablePresetSnapshot(state: FilterState): string {
  const localModes = withoutAndLocalModes(state).categoryLocalMatchModes;
  return JSON.stringify(
    serializeFilterStateForApi({
      ...state,
      globalMatchMode: state.globalMatchMode ?? true,
      // Tag names compare case-insensitively, as the catalog and filtering treat them.
      selectedTags: sortedUnique(state.selectedTags.map((tag) => tag.toUpperCase())),
      excludedTags: sortedUnique(state.excludedTags.map((tag) => tag.toUpperCase())),
      includedSourceIds: sortedUnique(state.includedSourceIds),
      categoryLocalMatchModes: localModes
        ? Object.fromEntries(Object.entries(localModes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : null
    })
  );
}

/**
 * Preset comparison, which no preset may share with another or with the default filter. An unset global match mode
 * means AND, so it equals an explicit AND, and a category's AND mode counts as no entry. Tags compare as
 * case-insensitive sets, source IDs as sets, so a list naming every source differs from all sources, category modes
 * by key in any order, and durations in whole seconds. Core's FilterStateComparison is the C# copy. Locked to
 * shared/fixtures/preset-filter-equality.json.
 */
export function filterStatesEqualForPresetMatch(a: FilterState, b: FilterState): boolean {
  return comparablePresetSnapshot(a) === comparablePresetSnapshot(b);
}

/**
 * The Filter tab holds unsaved changes: its working filter differs from the applied filter by the preset comparison,
 * or its preset list differs from the saved one (`presetsChanged`).
 */
export function filterDialogHasUnsavedChanges(working: FilterState, applied: FilterState, presetsChanged: boolean): boolean {
  return !filterStatesEqualForPresetMatch(working, applied) || presetsChanged;
}

export interface PresetRow {
  name: string;
  filterState: FilterState;
}

/** Whether two preset lists are the same: in the same order, each with the same name, case counting, and filter. */
export function presetListsEqual(a: readonly PresetRow[], b: readonly PresetRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((row, index) => row.name === b[index]!.name && filterStatesEqualForPresetMatch(row.filterState, b[index]!.filterState))
  );
}

export function presetsToPostBody(rows: PresetRow[]): components["schemas"]["FilterPresetSnapshot"][] {
  return rows.map((r) => ({
    name: r.name,
    filterState: serializeFilterStateForApi(r.filterState)
  }));
}
