import { compareTagNames } from "../library/tagNameOrder";
import { EMPTY_FIELD, type FieldProblem } from "../validation/fieldValidation";
import {
  AUDIO_FILTER,
  MEDIA_TYPE_FILTER,
  TAG_MATCH_MODE,
  cloneFilterState,
  filterStateFromApiObject,
  formatDurationForDisplay,
  parseTypedDuration,
  withoutAndLocalModes,
  type ApiFilterState,
  type AudioFilterMode,
  type FilterState,
  type FlagFilterMode,
  type MediaTypeFilter,
  type PresetRow,
  type TagMatchMode
} from "./filterStateModel";
import type { PresetLoop } from "./presetWrites";

/** The key the Uncategorized row's collapsed state is stored under. */
export const UNCATEGORIZED_COLLAPSE_KEY = "__filter_uncategorized__";

/** The General tab's Basic Filters, each a checkbox, in the order they show. */
export const BASIC_FILTERS: readonly {
  id: string;
  field: "onlyNeverPlayed" | "onlyKnownDuration" | "onlyKnownLoudness" | "onlyBrowserPlayable";
  label: string;
}[] = [
  { id: "filter-never-played", field: "onlyNeverPlayed", label: "Only never played" },
  { id: "filter-known-dur", field: "onlyKnownDuration", label: "Only videos with known duration" },
  { id: "filter-known-loud", field: "onlyKnownLoudness", label: "Only videos with known loudness" },
  { id: "filter-browser-playable", field: "onlyBrowserPlayable", label: "Only files this browser can play" }
];

/** The rating filters' labels, which the Filters line names them by too. */
export const ONLY_UNRATED_LABEL = "Only unrated";
export const MIN_RATING_LABEL = "Min Rating";

/** The General tab's media type choices. The first is no filter. */
export const MEDIA_TYPES = [
  { value: MEDIA_TYPE_FILTER.All, label: "All (Videos and Photos)" },
  { value: MEDIA_TYPE_FILTER.VideosOnly, label: "Videos only" },
  { value: MEDIA_TYPE_FILTER.PhotosOnly, label: "Photos only" }
] as const;

/** The General tab's audio choices. The first is no filter. */
export const AUDIO_FILTERS = [
  { value: AUDIO_FILTER.PlayAll, label: "All videos" },
  { value: AUDIO_FILTER.WithAudioOnly, label: "Only videos with audio" },
  { value: AUDIO_FILTER.WithoutAudioOnly, label: "Only videos without audio" }
] as const;

/** A media source as `GET /api/sources` returns it. */
export interface FilterSource {
  id: string;
  displayName?: string | null;
  rootPath?: string | null;
  isEnabled?: boolean;
}

/** The tag catalog as `POST /api/tag-editor/model` returns it. */
export interface FilterTagModel {
  categories?: Array<{ id: string; name: string; sortOrder?: number | null }>;
  tags?: Array<{ name: string; categoryId: string }>;
}

/** What the Favorites or Blacklisted dropdown offers: the mode its filter takes while its checkbox is on. */
export type FlagFilterChoice = Exclude<FlagFilterMode, "off">;

/** The dropdown's choice for a filter that is off: Favorites shows only, and Blacklisted shows excluded. */
const DEFAULT_FAVORITES_CHOICE: FlagFilterChoice = "only";
const DEFAULT_BLACKLISTED_CHOICE: FlagFilterChoice = "excluded";

/**
 * What the General tab's fields show. It is filled from the working filter when the dialog opens or starts over,
 * and otherwise keeps what the user left, such as a duration that is not valid, or a Favorites or Blacklisted choice
 * whose checkbox is off, which the working filter cannot hold. An empty duration means no limit.
 */
export interface GeneralDraft {
  favoritesOn: boolean;
  favoritesChoice: FlagFilterChoice;
  blacklistedOn: boolean;
  blacklistedChoice: FlagFilterChoice;
  onlyNeverPlayed: boolean;
  onlyKnownDuration: boolean;
  onlyKnownLoudness: boolean;
  onlyBrowserPlayable: boolean;
  onlyUnrated: boolean;
  /** The minimum rating in stars, or null for none. */
  minRating: number | null;
  mediaTypeFilter: MediaTypeFilter;
  audioFilter: AudioFilterMode;
  minText: string;
  maxText: string;
  /** Whether each source is checked, in the order of the sources list. */
  sourceChecked: boolean[];
  /**
   * The filter's source list the fields were filled from. While the same sources are checked again, the working
   * filter keeps this list as it was, so a preset that names every source still matches.
   */
  startSourceIds: string[];
}

export type TagChipAction = "include" | "exclude";

export interface FilterTagChip {
  name: string;
  included: boolean;
  excluded: boolean;
}

/** One category on the Tags tab. */
export interface FilterTagCategory {
  /** The category id, or null for the Uncategorized row of filter tags the catalog does not have. */
  id: string | null;
  name: string;
  /** The key this device remembers it expanded under. */
  collapseKey: string;
  collapsed: boolean;
  localMode: TagMatchMode;
  chips: FilterTagChip[];
  /** How many of its tags the filter includes or excludes, which its header shows while above 0. */
  inUse: number;
  /** One of its tags is included or excluded differently from the applied filter, until Apply. */
  unsaved: boolean;
}

export function namesEqualIgnoringCase(a: string, b: string): boolean {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

export function containsIgnoringCase(list: readonly string[], value: string): boolean {
  return list.some((entry) => namesEqualIgnoringCase(entry, value));
}

function removeIgnoringCase(list: string[], value: string): void {
  const index = list.findIndex((entry) => namesEqualIgnoringCase(entry, value));
  if (index >= 0) {
    list.splice(index, 1);
  }
}

/** A source's name and, when it has a different one, its folder: "Videos (/media/videos)". */
export function sourceLabel(source: FilterSource): string {
  const name = source.displayName || "";
  const path = source.rootPath || "";
  if (name && path && name !== path) {
    return `${name} (${path})`;
  }
  return name || path || source.id;
}

function flagChoice(mode: FlagFilterMode, fallback: FlagFilterChoice): FlagFilterChoice {
  return mode === "off" ? fallback : mode;
}

function flagMode(on: boolean, choice: FlagFilterChoice): FlagFilterMode {
  return on ? choice : "off";
}

export function generalDraftFromFilter(filter: FilterState, sources: readonly FilterSource[]): GeneralDraft {
  return {
    favoritesOn: filter.favoritesMode !== "off",
    favoritesChoice: flagChoice(filter.favoritesMode, DEFAULT_FAVORITES_CHOICE),
    blacklistedOn: filter.blacklistedMode !== "off",
    blacklistedChoice: flagChoice(filter.blacklistedMode, DEFAULT_BLACKLISTED_CHOICE),
    onlyNeverPlayed: filter.onlyNeverPlayed,
    onlyKnownDuration: filter.onlyKnownDuration,
    onlyKnownLoudness: filter.onlyKnownLoudness,
    onlyBrowserPlayable: filter.onlyBrowserPlayable,
    onlyUnrated: filter.onlyUnrated,
    minRating: filter.minRating,
    mediaTypeFilter: filter.mediaTypeFilter,
    audioFilter: filter.audioFilter,
    minText: filter.minDurationSeconds != null ? formatDurationForDisplay(filter.minDurationSeconds) : "",
    maxText: filter.maxDurationSeconds != null ? formatDurationForDisplay(filter.maxDurationSeconds) : "",
    sourceChecked: sourcesChecked(filter.includedSourceIds, sources),
    startSourceIds: [...filter.includedSourceIds]
  };
}

/** Whether each source is checked for a filter's source list. An empty list checks every source. */
function sourcesChecked(sourceIds: readonly string[], sources: readonly FilterSource[]): boolean[] {
  return sources.map((source) => sourceIds.length === 0 || containsIgnoringCase(sourceIds, source.id));
}

/**
 * An empty duration is no limit. One that is not valid counts as none too: it holds the actions that would use it,
 * so none of them takes it.
 */
function draftDuration(text: string): number | null {
  const seconds = parseTypedDuration(text);
  return seconds === "invalid" ? null : seconds;
}

/**
 * The working filter with the General tab's fields read into it. Sources checked as they were filled keep the list
 * they were filled from; otherwise, when every source is checked, none is stored.
 */
export function filterWithGeneralDraft(
  filter: FilterState,
  draft: GeneralDraft,
  sources: readonly FilterSource[]
): FilterState {
  const next = cloneFilterState(filter);
  next.favoritesMode = flagMode(draft.favoritesOn, draft.favoritesChoice);
  next.blacklistedMode = flagMode(draft.blacklistedOn, draft.blacklistedChoice);
  next.onlyNeverPlayed = draft.onlyNeverPlayed;
  next.onlyKnownDuration = draft.onlyKnownDuration;
  next.onlyKnownLoudness = draft.onlyKnownLoudness;
  next.onlyBrowserPlayable = draft.onlyBrowserPlayable;
  next.onlyUnrated = draft.onlyUnrated;
  next.minRating = draft.minRating;
  next.mediaTypeFilter = draft.mediaTypeFilter;
  next.audioFilter = draft.audioFilter;
  next.minDurationSeconds = draftDuration(draft.minText);
  next.maxDurationSeconds = draftDuration(draft.maxText);
  const startChecked = sourcesChecked(draft.startSourceIds, sources);
  if (startChecked.every((checked, index) => checked === !!draft.sourceChecked[index])) {
    next.includedSourceIds = [...draft.startSourceIds];
    return next;
  }
  const checked = sources.filter((_, index) => draft.sourceChecked[index]).map((source) => source.id);
  next.includedSourceIds = checked.length === sources.length ? [] : checked;
  return next;
}

/**
 * The filter with each duration as its General field's text reads, so a duration still being typed, which typing
 * doesn't read into the working filter, counts as it shows: empty text is no limit. Null while either text isn't a
 * valid duration, which differs from every filter.
 */
export function filterWithTypedDurations(filter: FilterState, draft: GeneralDraft): FilterState | null {
  const min = parseTypedDuration(draft.minText);
  const max = parseTypedDuration(draft.maxText);
  if (min === "invalid" || max === "invalid") {
    return null;
  }
  return { ...cloneFilterState(filter), minDurationSeconds: min, maxDurationSeconds: max };
}

/**
 * The filter dialog's fields that can hold a value that is not valid. The flag modes are the Favorites and Blacklisted
 * filters, and the rating filters are Only unrated and Min Rating, each checked as a pair.
 */
export type FilterField = "flagModes" | "ratingFilters" | "minDuration" | "maxDuration" | "newPresetName";

/** The filter dialog's actions that use those fields. */
export type FilterAction = "apply" | "addPreset" | "updatePreset";

/** The fields each action uses, in the order a held action moves to them, which is their order on screen. */
export const FILTER_ACTION_FIELDS: Readonly<Record<FilterAction, readonly FilterField[]>> = {
  apply: ["flagModes", "ratingFilters", "minDuration", "maxDuration"],
  addPreset: ["newPresetName", "flagModes", "ratingFilters", "minDuration", "maxDuration"],
  updatePreset: ["flagModes", "ratingFilters", "minDuration", "maxDuration"]
};

/** The fields right next to each action, any problem in which disables it: Add Preset's name sits beside it. */
export const FILTER_ACTION_BESIDE: Readonly<Record<FilterAction, readonly FilterField[]>> = {
  apply: [],
  addPreset: ["newPresetName"],
  updatePreset: []
};

/** The fields in the General section, which can hold an action from another section. */
export type GeneralField = Exclude<FilterField, "newPresetName">;

/** The dialog section each field is in. */
export const FILTER_FIELD_SECTION: Readonly<Record<FilterField, "general" | "presets">> = {
  flagModes: "general",
  ratingFilters: "general",
  minDuration: "general",
  maxDuration: "general",
  newPresetName: "presets"
};

export const DURATION_PROBLEM = "Use MM:SS, HH:MM:SS, or seconds.";

/** A preset name another preset has, ignoring case. */
export const PRESET_NAME_PROBLEM = "Use a name no other preset has.";

/** Why Add Preset and Update are disabled while the filter is the default one, which no preset may hold. */
export const DEFAULT_FILTER_PRESET_REASON = "Choose a filter to save as a preset.";

/** Why Add Preset and Update are disabled while a preset already has the filter, which no two presets may share. */
export function sharedFilterReason(name: string): string {
  return `Preset "${name}" already has this filter.`;
}

/** Why Update is disabled while Choose Preset is on None, which has nothing to write the filter into. */
export const NO_CHOSEN_PRESET_REASON = "Choose a preset to update.";

/** Favorites only with Blacklisted only matches nothing, since the app never lets an item be both. */
export const FLAG_MODES_PROBLEM = "Nothing is both a favorite and blacklisted. Use excluded for one of them.";

/** Only unrated with a minimum rating matches nothing, since a minimum leaves unrated files out. */
export const RATING_FILTERS_PROBLEM = "Nothing unrated has a minimum rating. Clear one of them.";

function durationProblem(text: string): FieldProblem | null {
  return parseTypedDuration(text) === "invalid" ? { message: DURATION_PROBLEM } : null;
}

/** Each field's problem, or null while its value is valid. An empty duration is valid: it means no limit. */
export function filterFieldProblems(
  draft: GeneralDraft,
  newPresetName: string,
  presets: readonly PresetRow[]
): Record<FilterField, FieldProblem | null> {
  const name = newPresetName.trim();
  const bothOnly =
    draft.favoritesOn && draft.favoritesChoice === "only" && draft.blacklistedOn && draft.blacklistedChoice === "only";
  return {
    flagModes: bothOnly ? { message: FLAG_MODES_PROBLEM } : null,
    ratingFilters: draft.onlyUnrated && draft.minRating !== null ? { message: RATING_FILTERS_PROBLEM } : null,
    minDuration: durationProblem(draft.minText),
    maxDuration: durationProblem(draft.maxText),
    newPresetName: !name
      ? EMPTY_FIELD
      : presets.some((row) => namesEqualIgnoringCase(row.name, name))
        ? { message: PRESET_NAME_PROBLEM }
        : null
  };
}

/**
 * The problem of the name typed in Edit Preset for the preset with `id`, or null while it is valid: empty, or another
 * preset's name, ignoring case. The preset's own name is valid, in any case.
 */
export function editPresetNameProblem(text: string, presets: readonly PresetRow[], id: string): FieldProblem | null {
  const name = text.trim();
  if (!name) {
    return EMPTY_FIELD;
  }
  const taken = presets.some((row) => row.id !== id && namesEqualIgnoringCase(row.name, name));
  return taken ? { message: PRESET_NAME_PROBLEM } : null;
}

/** Names in quotes, as `"A" and "B"` or `"A", "B", and "C"`. */
function quotedNames(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  return quoted.length <= 2 ? quoted.join(" and ") : `${quoted.slice(0, -1).join(", ")}, and ${quoted.at(-1)}`;
}

/**
 * Why a loop of presets blocks Apply, naming each preset in it, in the tab's order, and its log line, which leaves
 * their names out.
 */
export function presetLoopReason(loop: PresetLoop, presets: readonly PresetRow[]): { text: string; logText: string } {
  const names = loop.ids.map((id) => presets.find((row) => row.id === id)?.name ?? id);
  const [what, other, finish] = loop.kind === "names" ? ["names", "another name", "rename it"] : ["filters", "another filter", "update it"];
  return {
    text: `Presets ${quotedNames(names)} would take each other's ${what}. Apply in two steps: give one of them ${other}, apply, then ${finish}.`,
    logText: `Presets would take each other's ${what}. Apply in two steps.`
  };
}

/**
 * Why a General field holds an action, which the action's title and accessible description say. The new preset name
 * never holds Add Preset: it sits beside it, so it disables it.
 */
export function filterHeldReason(action: FilterAction, field: GeneralField): string {
  const ending = action === "apply" ? "to apply" : "first";
  if (field === "flagModes") {
    return `Change Favorites or Blacklisted ${ending}.`;
  }
  if (field === "ratingFilters") {
    return `Clear ${ONLY_UNRATED_LABEL} or ${MIN_RATING_LABEL} ${ending}.`;
  }
  return `Correct the ${field === "minDuration" ? "minimum" : "maximum"} duration ${ending}.`;
}

/** Includes or excludes a tag, or clears it when it already is. Including takes it out of the excluded tags, and the other way round. */
export function toggleFilterTag(filter: FilterState, tag: string, action: TagChipAction): FilterState {
  const next = cloneFilterState(filter);
  const [own, other] = action === "include" ? [next.selectedTags, next.excludedTags] : [next.excludedTags, next.selectedTags];
  if (containsIgnoringCase(own, tag)) {
    removeIgnoringCase(own, tag);
  } else {
    removeIgnoringCase(other, tag);
    own.push(tag);
  }
  return next;
}

/**
 * The Tags tab's categories by sort order and then name, each with its tags by name; categories without tags
 * are left out. Filter tags the catalog does not have come last, in an Uncategorized row.
 */
export function filterTagCategories(
  model: FilterTagModel | null,
  filter: FilterState,
  expanded: ReadonlySet<string>,
  applied: FilterState = filter
): FilterTagCategory[] {
  const categories = (model?.categories || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || compareTagNames(a.name, b.name));
  const tags = model?.tags || [];
  const chip = (name: string): FilterTagChip => ({
    name,
    included: containsIgnoringCase(filter.selectedTags, name),
    excluded: containsIgnoringCase(filter.excludedTags, name)
  });
  const changed = (name: string): boolean => {
    const now = chip(name);
    return now.included !== containsIgnoringCase(applied.selectedTags, name) || now.excluded !== containsIgnoringCase(applied.excludedTags, name);
  };
  const counts = (names: readonly string[]) => {
    const chips = names.map(chip);
    return {
      chips,
      inUse: chips.filter((entry) => entry.included || entry.excluded).length,
      unsaved: names.some(changed)
    };
  };

  const blocks: FilterTagCategory[] = [];
  const catalogNames = new Set<string>();
  for (const category of categories) {
    const names = tags
      .filter((tag) => tag.categoryId === category.id)
      .map((tag) => tag.name)
      .sort(compareTagNames);
    if (names.length === 0) {
      continue;
    }
    for (const name of names) {
      catalogNames.add(String(name).toLowerCase());
    }
    const collapseKey = String(category.id ?? "");
    blocks.push({
      id: category.id,
      name: category.name,
      collapseKey,
      collapsed: !expanded.has(collapseKey),
      localMode: filter.categoryLocalMatchModes?.[category.id] ?? TAG_MATCH_MODE.And,
      ...counts(names)
    });
  }

  const missing = [...new Set([...filter.selectedTags, ...filter.excludedTags])]
    .filter((name) => !catalogNames.has(String(name).toLowerCase()))
    .sort(compareTagNames);
  if (missing.length > 0) {
    blocks.push({
      id: null,
      name: "Uncategorized",
      collapseKey: UNCATEGORIZED_COLLAPSE_KEY,
      collapsed: !expanded.has(UNCATEGORIZED_COLLAPSE_KEY),
      localMode: filter.categoryLocalMatchModes?.[""] ?? TAG_MATCH_MODE.And,
      ...counts(missing)
    });
  }
  return blocks;
}

/** The dialog's preset rows, by id, from the presets `GET /api/presets` returned. */
export function presetRowsFromApi(
  presets: readonly { id?: string; name?: string; filterState?: ApiFilterState | null }[]
): PresetRow[] {
  return (Array.isArray(presets) ? presets : [])
    .map((preset) => ({
      id: String(preset.id || ""),
      name: String(preset.name || preset.id || "").trim() || String(preset.id || ""),
      filterState: withoutAndLocalModes(filterStateFromApiObject(preset.filterState))
    }))
    .filter((row) => row.id && row.name);
}
