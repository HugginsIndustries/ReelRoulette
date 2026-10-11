import { compareTagNames } from "../library/tagNameOrder";
import type { FieldProblem } from "../validation/fieldValidation";
import {
  TAG_MATCH_MODE,
  cloneFilterState,
  filterStateFromApiObject,
  formatDurationForDisplay,
  parseTypedDuration,
  type ApiFilterState,
  type AudioFilterMode,
  type FilterState,
  type FlagFilterMode,
  type MediaTypeFilter,
  type PresetRow,
  type TagMatchMode
} from "./filterStateModel";

/** The key the Uncategorized row's collapsed state is stored under. */
export const UNCATEGORIZED_COLLAPSE_KEY = "__filter_uncategorized__";

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
  mediaTypeFilter: MediaTypeFilter;
  audioFilter: AudioFilterMode;
  minText: string;
  maxText: string;
  /** Whether each source is checked, in the order of the sources list. */
  sourceChecked: boolean[];
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
  /** The key the collapsed state is stored under. */
  collapseKey: string;
  collapsed: boolean;
  localMode: TagMatchMode;
  chips: FilterTagChip[];
}

export function namesEqualIgnoringCase(a: string, b: string): boolean {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function containsIgnoringCase(list: readonly string[], value: string): boolean {
  return list.some((entry) => namesEqualIgnoringCase(entry, value));
}

function removeIgnoringCase(list: string[], value: string): void {
  const index = list.findIndex((entry) => namesEqualIgnoringCase(entry, value));
  if (index >= 0) {
    list.splice(index, 1);
  }
}

export function sourceLabel(source: FilterSource): string {
  return source.displayName || source.rootPath || source.id;
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
    mediaTypeFilter: filter.mediaTypeFilter,
    audioFilter: filter.audioFilter,
    minText: filter.minDurationSeconds != null ? formatDurationForDisplay(filter.minDurationSeconds) : "",
    maxText: filter.maxDurationSeconds != null ? formatDurationForDisplay(filter.maxDurationSeconds) : "",
    sourceChecked: sources.map(
      (source) => filter.includedSourceIds.length === 0 || containsIgnoringCase(filter.includedSourceIds, source.id)
    )
  };
}

/**
 * An empty duration is no limit. One that is not valid counts as none too: it holds the actions that would use it,
 * so none of them takes it.
 */
function draftDuration(text: string): number | null {
  const seconds = parseTypedDuration(text);
  return seconds === "invalid" ? null : seconds;
}

/** The working filter with the General tab's fields read into it. When every source is checked, none is stored. */
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
  next.mediaTypeFilter = draft.mediaTypeFilter;
  next.audioFilter = draft.audioFilter;
  next.minDurationSeconds = draftDuration(draft.minText);
  next.maxDurationSeconds = draftDuration(draft.maxText);
  const checked = sources.filter((_, index) => draft.sourceChecked[index]).map((source) => source.id);
  next.includedSourceIds = checked.length === sources.length ? [] : checked;
  return next;
}

/**
 * The filter dialog's fields that can hold a value that is not valid. The flag modes are the Favorites and Blacklisted
 * filters, checked as a pair.
 */
export type FilterField = "flagModes" | "minDuration" | "maxDuration" | "newPresetName";

/** The filter dialog's actions that use those fields. */
export type FilterAction = "apply" | "addPreset" | "updatePreset";

/** The fields each action uses, in the order a held action moves to them. Add Preset's name sits beside it, so it is first. */
export const FILTER_ACTION_FIELDS: Readonly<Record<FilterAction, readonly FilterField[]>> = {
  apply: ["flagModes", "minDuration", "maxDuration"],
  addPreset: ["newPresetName", "flagModes", "minDuration", "maxDuration"],
  updatePreset: ["flagModes", "minDuration", "maxDuration"]
};

/** The dialog section each field is in. */
export const FILTER_FIELD_SECTION: Readonly<Record<FilterField, "general" | "presets">> = {
  flagModes: "general",
  minDuration: "general",
  maxDuration: "general",
  newPresetName: "presets"
};

export const DURATION_PROBLEM = "Use MM:SS, HH:MM:SS, or seconds.";

/** Favorites only with Blacklisted only matches nothing, since the app never lets an item be both. */
export const FLAG_MODES_PROBLEM = "Nothing is both a favorite and blacklisted. Use excluded for one of them.";

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
    minDuration: durationProblem(draft.minText),
    maxDuration: durationProblem(draft.maxText),
    newPresetName: !name
      ? { message: "Enter a preset name.", empty: true }
      : presets.some((row) => namesEqualIgnoringCase(row.name, name))
        ? { message: "Use a name no other preset has." }
        : null
  };
}

/** Why a field holds an action, which the action's title and accessible description say. */
export function filterHeldReason(action: FilterAction, field: FilterField, problem: FieldProblem): string {
  if (field === "newPresetName") {
    return problem.empty ? "Enter a preset name first." : "Use a name no other preset has.";
  }
  const ending = action === "apply" ? "to apply" : "first";
  if (field === "flagModes") {
    return `Change Favorites or Blacklisted ${ending}.`;
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
  collapsed: ReadonlySet<string>
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
      collapsed: collapsed.has(collapseKey),
      localMode: filter.categoryLocalMatchModes?.[category.id] ?? TAG_MATCH_MODE.And,
      chips: names.map(chip)
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
      collapsed: collapsed.has(UNCATEGORIZED_COLLAPSE_KEY),
      localMode: filter.categoryLocalMatchModes?.[""] ?? TAG_MATCH_MODE.And,
      chips: missing.map(chip)
    });
  }
  return blocks;
}

/** The dialog's preset rows from the presets `GET /api/presets` returned. */
export function presetRowsFromApi(
  presets: readonly { id?: string; name?: string; filterState?: ApiFilterState | null }[]
): PresetRow[] {
  return (Array.isArray(presets) ? presets : [])
    .map((preset) => ({
      name: String(preset.name || preset.id || "").trim() || String(preset.id || ""),
      filterState: filterStateFromApiObject(preset.filterState)
    }))
    .filter((row) => row.name);
}
