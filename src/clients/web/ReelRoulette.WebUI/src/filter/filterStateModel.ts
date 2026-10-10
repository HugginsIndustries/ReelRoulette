/**
 * WebUI filter state aligned with desktop FilterState JSON and the server list filter parser.
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

export interface FilterState {
  favoritesOnly: boolean;
  excludeBlacklisted: boolean;
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
    favoritesOnly: false,
    excludeBlacklisted: true,
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

/** Header preset dropdown. None selects the default filter; a named preset selects that preset's filter. */
export function filterStateForHeaderPresetSelection(
  preset: { filterState?: ApiFilterState | null } | null | undefined
): FilterState {
  if (!preset) {
    return createDefaultFilterState();
  }
  return filterStateFromApiObject(preset.filterState);
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

function describePresetAnchor(baseName: string | null, starred: boolean): PresetAnchor {
  const shown = baseName ?? HEADER_PRESET_NONE_LABEL;
  return {
    baseName,
    starred,
    label: starred ? `${shown}*` : shown
  };
}

/** None, a named preset, or a starred unsaved row. A server match is not consulted here. */
export function resolvePresetAnchor(
  current: FilterState,
  presets: readonly { name: string; filterState: FilterState }[],
  previousBase: string | null | undefined
): PresetAnchor {
  return presetAnchorForDisplay(current, presets, previousBase, false);
}

/**
 * While holdNone is set, the default filter stays on None even when a saved preset has that same filter.
 */
export function presetAnchorForDisplay(
  current: FilterState,
  presets: readonly { name: string; filterState: FilterState }[],
  previousBase: string | null | undefined,
  holdNone: boolean
): PresetAnchor {
  if (holdNone && filterStatesEqualForPresetMatch(current, createDefaultFilterState())) {
    return describePresetAnchor(null, false);
  }
  const match = presets.find((preset) => filterStatesEqualForPresetMatch(preset.filterState, current));
  if (match?.name) {
    return describePresetAnchor(match.name, false);
  }
  if (filterStatesEqualForPresetMatch(current, createDefaultFilterState())) {
    return describePresetAnchor(null, false);
  }
  const base = String(previousBase || "").trim();
  const existing = base ? presets.find((preset) => presetNamesEqual(preset.name, base)) : undefined;
  if (existing) {
    return describePresetAnchor(existing.name, true);
  }
  return describePresetAnchor(null, true);
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
    rows.push({ name, filterState: filterStateFromApiObject(preset.filterState) });
  }
  return rows;
}

export function headerPresetListForFilter(
  filter: FilterState,
  presets: readonly { id: string; name: string; filterState?: ApiFilterState | null }[],
  previousBase: string | null | undefined,
  holdNone = false
): HeaderPresetList {
  const anchor = presetAnchorForDisplay(filter, presetRowsFromHeaderPresets(presets), previousBase, holdNone);
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
    return headerPresetListForFilter(createDefaultFilterState(), presets, null, true);
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

/** Desktop FilterDialog.FormatTimeSpan */
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
 * Always `HH:MM:SS` so `TimeSpan.TryParse` (InvariantCulture) matches desktop `TimeSpan` JSON;
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

/** Desktop FilterDialog.ParseTimeSpan — returns seconds or null if empty/invalid */
export function parseDurationInputToSeconds(text: string): number | null | "invalid" {
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

/** Serialize for POST /api/random and preset snapshots (matches desktop JsonSerializer shape). */
export function serializeFilterStateForApi(state: FilterState): ApiFilterState {
  const out: ApiFilterState = {
    favoritesOnly: state.favoritesOnly,
    excludeBlacklisted: state.excludeBlacklisted,
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
    const p = parseDurationInputToSeconds(value);
    if (p === "invalid") {
      return null;
    }
    return p;
  }
  return null;
}

function readEnumInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

/** Hydrate from an API filter state. Each field is still checked, since a stored preset holds whatever was posted. */
export function filterStateFromApiObject(raw: ApiFilterState | null | undefined): FilterState {
  const base = createDefaultFilterState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.favoritesOnly === "boolean") {
    base.favoritesOnly = o.favoritesOnly;
  }
  if (typeof o.excludeBlacklisted === "boolean") {
    base.excludeBlacklisted = o.excludeBlacklisted;
  }
  if (typeof o.onlyNeverPlayed === "boolean") {
    base.onlyNeverPlayed = o.onlyNeverPlayed;
  }
  if (typeof o.onlyKnownDuration === "boolean") {
    base.onlyKnownDuration = o.onlyKnownDuration;
  }
  if (typeof o.onlyKnownLoudness === "boolean") {
    base.onlyKnownLoudness = o.onlyKnownLoudness;
  }

  base.audioFilter = readEnumInt(o.audioFilter, base.audioFilter) as AudioFilterMode;
  base.mediaTypeFilter = readEnumInt(o.mediaTypeFilter, base.mediaTypeFilter) as MediaTypeFilter;

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
    const cm: Record<string, TagMatchMode> = {};
    for (const [k, v] of Object.entries(o.categoryLocalMatchModes as Record<string, unknown>)) {
      cm[k] = readEnumInt(v, TAG_MATCH_MODE.And) as TagMatchMode;
    }
    base.categoryLocalMatchModes = Object.keys(cm).length ? cm : null;
  }

  base.minDurationSeconds = readDurationFromUnknown(o.minDuration);
  base.maxDurationSeconds = readDurationFromUnknown(o.maxDuration);

  return base;
}

/** Sorted, de-duplicated values compared by UTF-16 code unit, matching ordinal order in C#. */
function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function comparablePresetSnapshot(state: FilterState): string {
  return JSON.stringify(
    serializeFilterStateForApi({
      ...state,
      globalMatchMode: state.globalMatchMode ?? true,
      // Tag names compare case-insensitively, as the catalog and filtering treat them.
      // Matches the desktop copy only for ASCII names: toUpperCase and .NET ToUpperInvariant differ on some
      // non-ASCII letters, for example "ß".
      selectedTags: sortedUnique(state.selectedTags.map((tag) => tag.toUpperCase())),
      excludedTags: sortedUnique(state.excludedTags.map((tag) => tag.toUpperCase())),
      includedSourceIds: sortedUnique(state.includedSourceIds),
      categoryLocalMatchModes: state.categoryLocalMatchModes
        ? Object.fromEntries(Object.entries(state.categoryLocalMatchModes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : null
    })
  );
}

/**
 * Preset comparison. An unset global match mode means AND, so it equals an explicit AND.
 * Tags compare as case-insensitive sets, source IDs as sets, and category modes by key in any order.
 */
export function filterStatesEqualForPresetMatch(a: FilterState, b: FilterState): boolean {
  return comparablePresetSnapshot(a) === comparablePresetSnapshot(b);
}

/** Filter dialog Apply pending: the working filter differs from the one the dialog opened with, or a preset changed. */
export function filterDialogHasPendingChanges(
  working: FilterState,
  original: FilterState,
  presetCatalogDirty: boolean
): boolean {
  return !filterStatesEqualForPresetMatch(working, original) || presetCatalogDirty;
}

export interface PresetRow {
  name: string;
  filterState: FilterState;
}

export function presetsToPostBody(rows: PresetRow[]): components["schemas"]["FilterPresetSnapshot"][] {
  return rows.map((r) => ({
    name: r.name,
    filterState: serializeFilterStateForApi(r.filterState)
  }));
}
