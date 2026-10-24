import { isRecord } from "../state/deviceStore";
import type { TagCatalogSnapshot } from "../tags/tagCatalog";
import { categoriesWithTags } from "../tags/tagEditorModel";
import type { components } from "../types/openapi.generated";
import type { FieldProblem } from "../validation/fieldValidation";

export type RandomPickOptionsRequest = components["schemas"]["RandomPickOptionsRequest"];

/** Remember plays for, in days, or null for until everything has played. */
export type RememberPlaysFor = RandomPickOptionsRequest["rememberPlaysForDays"];

/** What Spread by tags counts while it is on: every tag, or only the chosen categories' tags. */
export type TagSpread = "allTags" | "byCategory";

/**
 * The Randomization tab's options, which this device keeps and sends with each random pick. Spread by tags keeps its
 * choice of All tags or By category, and the chosen categories by id, while it is off, so turning it on again brings
 * them back.
 */
export interface RandomOptions {
  shuffle: boolean;
  rememberPlaysForDays: RememberPlaysFor;
  spreadByFolder: boolean;
  spreadByTags: boolean;
  tagSpread: TagSpread;
  spreadCategoryIds: readonly string[];
  favorLessPlayed: boolean;
  favorNewlyAdded: boolean;
  favorNewlyCreated: boolean;
  favorHigherRated: boolean;
}

/** Shuffle, remembering plays for 30 days, and Spread by folder; every other option off. */
export const DEFAULT_RANDOM_OPTIONS: RandomOptions = {
  shuffle: true,
  rememberPlaysForDays: 30,
  spreadByFolder: true,
  spreadByTags: false,
  tagSpread: "allTags",
  spreadCategoryIds: [],
  favorLessPlayed: false,
  favorNewlyAdded: false,
  favorNewlyCreated: false,
  favorHigherRated: false
};

/** Remember plays for's choices, in the dropdown's order. */
export const REMEMBER_PLAYS_FOR: readonly { value: RememberPlaysFor; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: null, label: "Until everything has played" }
];

/** Where a Random pick goes in the history: at its end, or right after the playing item. */
export type RandomBehavior = "jump" | "insert";

export function isRandomBehavior(value: unknown): value is RandomBehavior {
  return value === "jump" || value === "insert";
}

const FLAGS = ["shuffle", "spreadByFolder", "spreadByTags", "favorLessPlayed", "favorNewlyAdded", "favorNewlyCreated", "favorHigherRated"] as const;

/** The options as this device kept them, each one missing or not valid read as its default. */
export function readRandomOptions(saved: unknown): RandomOptions {
  const record = isRecord(saved) ? saved : {};
  const options: RandomOptions = { ...DEFAULT_RANDOM_OPTIONS };
  for (const flag of FLAGS) {
    const value = record[flag];
    if (typeof value === "boolean") {
      options[flag] = value;
    }
  }
  const days = REMEMBER_PLAYS_FOR.find((choice) => choice.value === record.rememberPlaysForDays);
  if (days) {
    options.rememberPlaysForDays = days.value;
  }
  if (record.tagSpread === "allTags" || record.tagSpread === "byCategory") {
    options.tagSpread = record.tagSpread;
  }
  if (Array.isArray(record.spreadCategoryIds)) {
    options.spreadCategoryIds = record.spreadCategoryIds.filter((id): id is string => typeof id === "string");
  }
  return options;
}

/** The options as `POST /api/random` and `POST /api/random/cycle` take them. Category ids go only with By category. */
export function randomPickOptionsRequest(options: RandomOptions): RandomPickOptionsRequest {
  const spreadByTags = !options.spreadByTags ? "off" : options.tagSpread;
  const request: RandomPickOptionsRequest = {
    shuffle: options.shuffle,
    rememberPlaysForDays: options.rememberPlaysForDays,
    spreadByFolder: options.spreadByFolder,
    spreadByTags,
    favorLessPlayed: options.favorLessPlayed,
    favorNewlyAdded: options.favorNewlyAdded,
    favorNewlyCreated: options.favorNewlyCreated,
    favorHigherRated: options.favorHigherRated
  };
  if (spreadByTags === "byCategory") {
    request.spreadCategoryIds = [...options.spreadCategoryIds];
  }
  return request;
}

/** A category Spread by tags can count. */
export interface SpreadCategory {
  id: string;
  name: string;
}

/**
 * The categories By category lists, those with tags, in the tag catalog's order, as the Filter tab lists them; null
 * before the catalog has loaded.
 */
export function spreadCategories(catalog: TagCatalogSnapshot | null): SpreadCategory[] | null {
  if (!catalog) {
    return null;
  }
  return categoriesWithTags(catalog.categories, catalog.tags).map(({ category }) => ({ id: category.id, name: category.name }));
}

/** The chosen categories the list shows, in its order. A chosen id the catalog no longer lists is left out. */
export function chosenCategories(options: RandomOptions, categories: readonly SpreadCategory[]): SpreadCategory[] {
  return categories.filter((category) => options.spreadCategoryIds.includes(category.id));
}

/** By category's message while Spread by tags is on and no category is chosen. */
export const NO_CATEGORY_MESSAGE = "Choose at least one category.";

/**
 * By category's problem: Spread by tags on By category with no listed category chosen. Before the catalog has loaded,
 * only an empty choice can be told.
 */
export function byCategoryProblem(options: RandomOptions, categories: readonly SpreadCategory[] | null): FieldProblem | null {
  if (!options.spreadByTags || options.tagSpread !== "byCategory") {
    return null;
  }
  const none = categories ? chosenCategories(options, categories).length === 0 : options.spreadCategoryIds.length === 0;
  return none ? { message: NO_CATEGORY_MESSAGE } : null;
}

/** What comes before the options on the Library tab's Random line. */
export const RANDOM_LINE_LABEL = "Random: ";
/** What separates the Random line's parts. */
export const RANDOM_LINE_SEPARATOR = " · ";

const FAVOR_NAMES: readonly { flag: (typeof FLAGS)[number]; name: string }[] = [
  { flag: "favorLessPlayed", name: "less played" },
  { flag: "favorNewlyAdded", name: "newly added" },
  { flag: "favorNewlyCreated", name: "newly created" },
  { flag: "favorHigherRated", name: "higher rated" }
];

/** Names joined as a list: "a", "a and b", or "a, b, and c". */
function listText(names: readonly string[]): string {
  return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/**
 * The options as the Library tab's Random line names them after its label: "Shuffle", one Spread part, such as
 * "Spread by folder and tags", where By category names the chosen categories, as in "Spread by folder, People, and
 * Places", and one Favor part, such as "Favor less played and higher rated", joined by " · ". With every option off it
 * reads "Pure random". It never names Remember plays for. Before the catalog has loaded, By category with categories
 * chosen reads as "tags", since their names aren't known yet.
 */
export function randomLineText(options: RandomOptions, categories: readonly SpreadCategory[] | null): string {
  const parts: string[] = [];
  if (options.shuffle) {
    parts.push("Shuffle");
  }
  const spread = options.spreadByFolder ? ["folder"] : [];
  if (options.spreadByTags) {
    if (options.tagSpread === "allTags") {
      spread.push("tags");
    } else if (categories) {
      spread.push(...chosenCategories(options, categories).map((category) => category.name));
    } else if (options.spreadCategoryIds.length > 0) {
      spread.push("tags");
    }
  }
  if (spread.length > 0) {
    parts.push(`Spread by ${listText(spread)}`);
  }
  const favor = FAVOR_NAMES.filter(({ flag }) => options[flag]).map(({ name }) => name);
  if (favor.length > 0) {
    parts.push(`Favor ${listText(favor)}`);
  }
  return parts.length > 0 ? parts.join(RANDOM_LINE_SEPARATOR) : "Pure random";
}
