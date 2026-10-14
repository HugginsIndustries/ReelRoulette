import { compareTagNames } from "../library/tagNameOrder";
import { planTagEditorSave, type AutoTagSaveAssignment, type TagSaveStep } from "../library/tagSave";
import { moveEntry } from "../reorder/reorder";
import { EMPTY_FIELD, type FieldProblem } from "../validation/fieldValidation";

export const UNCATEGORIZED_CATEGORY_ID = "uncategorized";

export interface TagCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CatalogTag {
  name: string;
  categoryId: string;
}

export interface ItemTags {
  itemId: string;
  tags: string[];
}

/** The tag catalog and the tags of the items being edited, as `POST /api/tag-editor/model` returns them. */
export interface TagEditorModel {
  categories: TagCategory[];
  tags: CatalogTag[];
  items: ItemTags[];
}

export type TagAction = "add" | "remove";

/** A tag the user asked to add to or remove from the items being edited, keyed by its normalized name. */
export interface TagSelection {
  action: TagAction;
  name: string;
}

export interface TagRename {
  oldName: string;
  newName: string;
  /** The new category, or null to keep the tag's category. */
  newCategoryId: string | null;
}

/** Catalog edits the user made that Save has not sent yet. Tag keys are normalized names. */
export interface PendingTagEdits {
  upsertCategories: ReadonlyMap<string, TagCategory>;
  deleteCategoryIds: ReadonlySet<string>;
  upsertTags: ReadonlyMap<string, CatalogTag>;
  renameTags: ReadonlyMap<string, TagRename>;
  deleteTags: ReadonlyMap<string, { name: string }>;
}

/** The catalog with the pending edits applied, in the order the editor shows it. */
export interface TagEditorDisplay {
  categories: TagCategory[];
  tags: CatalogTag[];
  items: ItemTags[];
  /** The category order with categories that no longer show dropped and new ones added, kept for the next change. */
  order: string[];
}

export type ChipState = "state-all" | "state-some" | "state-none";

export interface TagChipRow {
  name: string;
  state: ChipState;
  pending: TagAction | null;
  /** Adding and removing need at least one item being edited. */
  canChangeItems: boolean;
}

export interface TagCategoryRow {
  id: string;
  name: string;
  uncategorized: boolean;
  collapsed: boolean;
  chips: TagChipRow[];
  /** How many of its tags the items being edited have, which its header shows while it is collapsed. */
  inUse: number;
  /**
   * It holds unsaved changes: a held add or remove on one of its tags, or a name or tags that differ from the saved
   * ones, as a new category's always do. A new order alone doesn't count.
   */
  unsaved: boolean;
}

/**
 * The Edit Tag dialog's name problem: an empty name, which disables Save. Another tag's name is allowed, since the
 * server merges the two tags.
 */
export function editTagNameProblem(name: string): FieldProblem | null {
  return name.trim() ? null : EMPTY_FIELD;
}

/**
 * The New Category and Edit Category dialogs' name problem: an empty name, or the name of another category the editor
 * shows, ignoring case, either of which disables Save. Uncategorized's name is always taken, even while its row isn't
 * showing, since a category with that name would fold into it. `ownId` is the category being edited, or null for a new
 * one.
 */
export function categoryNameProblem(
  name: string,
  categories: readonly Pick<TagCategory, "id" | "name">[],
  ownId: string | null
): FieldProblem | null {
  const key = name.trim().toLowerCase();
  if (!key) {
    return EMPTY_FIELD;
  }
  const taken =
    isUncategorizedName(key) || categories.some((category) => category.id !== ownId && category.name.trim().toLowerCase() === key);
  return taken
    ? { message: "Use a name no other category has." }
    : null;
}

/**
 * The new tag name's problem: an empty name, or the name of a tag the editor shows in any category, ignoring case,
 * either of which disables Add tag. A tag waiting to be deleted doesn't show, so its name is free.
 */
export function newTagNameProblem(name: string, tags: readonly Pick<CatalogTag, "name">[]): FieldProblem | null {
  const key = normalizeTagKey(name);
  if (!key) {
    return EMPTY_FIELD;
  }
  return tags.some((tag) => normalizeTagKey(tag.name) === key) ? { message: "Use a name no other tag has." } : null;
}

export function normalizeTagKey(tagName: unknown): string {
  return String(tagName || "").trim().toLowerCase();
}

export function isUncategorizedCategoryId(categoryId: unknown): boolean {
  const id = String(categoryId || "").trim().toLowerCase();
  return id === "" || id === UNCATEGORIZED_CATEGORY_ID;
}

/** Whether a category name is Uncategorized's, ignoring case and spaces. */
function isUncategorizedName(name: unknown): boolean {
  return String(name || "").trim().toLowerCase() === "uncategorized";
}

function isUncategorizedCategory(category: { id?: unknown; name?: unknown }): boolean {
  return isUncategorizedCategoryId(category.id) || isUncategorizedName(category.name);
}

function uncategorized(): TagCategory {
  return { id: UNCATEGORIZED_CATEGORY_ID, name: "Uncategorized", sortOrder: Number.MAX_SAFE_INTEGER };
}

export function createPendingTagEdits(): PendingTagEdits {
  return {
    upsertCategories: new Map(),
    deleteCategoryIds: new Set(),
    upsertTags: new Map(),
    renameTags: new Map(),
    deleteTags: new Map()
  };
}

export function hasPendingTagEdits(pending: PendingTagEdits): boolean {
  return (
    pending.upsertCategories.size > 0 ||
    pending.deleteCategoryIds.size > 0 ||
    pending.upsertTags.size > 0 ||
    pending.renameTags.size > 0 ||
    pending.deleteTags.size > 0
  );
}

/** Moves the entry held under `oldKey` to `newKey`, unless one is already held there, or drops it when `newKey` is null. */
function moveHeld<T>(entries: ReadonlyMap<string, T>, oldKey: string, newKey: string | null, rename: (entry: T) => T): ReadonlyMap<string, T> {
  const entry = entries.get(oldKey);
  if (entry === undefined) {
    return entries;
  }
  const next = new Map(entries);
  next.delete(oldKey);
  if (newKey !== null && (newKey === oldKey || !next.has(newKey))) {
    next.set(newKey, rename(entry));
  }
  return next;
}

/**
 * The held adds and removes and tag edits once a tag is renamed or deleted elsewhere, so Save doesn't send the old
 * name back: a rename moves each one held for the old name to the new one, unless one is already held for the new
 * name, and a delete drops them. A held rename keeps the name the user gave, or takes the new one when it only moved
 * the tag's category. Gives back the same objects when nothing held names the tag.
 */
export function retargetHeldTag(
  selections: ReadonlyMap<string, TagSelection>,
  pending: PendingTagEdits,
  step: Extract<TagSaveStep, { kind: "rename-tag" | "delete-tag" }>
): { selections: ReadonlyMap<string, TagSelection>; pending: PendingTagEdits } {
  const oldKey = normalizeTagKey(step.kind === "rename-tag" ? step.oldName : step.name);
  const newName = step.kind === "rename-tag" ? step.newName.trim() : "";
  const newKey = newName ? normalizeTagKey(newName) : null;
  const upsertTags = moveHeld(pending.upsertTags, oldKey, newKey, (tag) => ({ ...tag, name: newName }));
  const renameTags = moveHeld(pending.renameTags, oldKey, newKey, (rename) => ({
    ...rename,
    oldName: newName,
    newName: normalizeTagKey(rename.newName) === oldKey ? newName : rename.newName
  }));
  const deleteTags = moveHeld(pending.deleteTags, oldKey, newKey, () => ({ name: newName }));
  const changed = upsertTags !== pending.upsertTags || renameTags !== pending.renameTags || deleteTags !== pending.deleteTags;
  return {
    selections: moveHeld(selections, oldKey, newKey, (selection) => ({ ...selection, name: newName })),
    pending: changed ? { ...pending, upsertTags, renameTags, deleteTags } : pending
  };
}

/** One entry per category id, with any Uncategorized category under the Uncategorized id and name. */
function canonicalizeCategories(categories: readonly Partial<TagCategory>[]): TagCategory[] {
  const deduped = new Map<string, TagCategory>();
  for (const category of categories) {
    const id = isUncategorizedCategory(category) ? UNCATEGORIZED_CATEGORY_ID : String(category.id || "");
    if (!deduped.has(id)) {
      deduped.set(id, {
        id,
        name: id === UNCATEGORIZED_CATEGORY_ID ? "Uncategorized" : String(category.name || ""),
        sortOrder: Number(category.sortOrder ?? 0)
      });
    }
  }
  return Array.from(deduped.values());
}

/** Orders categories by their saved sort order, then name, as the Tags tab starts them and the Stats tab orders tags. */
export function bySortOrderThenName(a: TagCategory, b: TagCategory): number {
  const x = Number(a.sortOrder || 0);
  const y = Number(b.sortOrder || 0);
  return x !== y ? x - y : compareTagNames(a.name, b.name);
}

/** The model's category ids by sort order, then name: the order the editor starts with. */
export function initialCategoryOrder(model: TagEditorModel): string[] {
  return canonicalizeCategories(model.categories ?? []).sort(bySortOrderThenName).map((category) => category.id);
}

/** Categories for the new tag and Edit Tag category lists, by sort order then name, always with Uncategorized. */
export function categoryOptions(categories: readonly TagCategory[]): TagCategory[] {
  const options = canonicalizeCategories(categories);
  if (!options.some((category) => isUncategorizedCategoryId(category.id))) {
    options.push(uncategorized());
  }
  return options.sort(bySortOrderThenName);
}

/** Puts the categories in `order`, then any not in it, then Uncategorized when it is among them. */
function orderCategories(categories: readonly TagCategory[], order: readonly string[]): { ordered: TagCategory[]; order: string[] } {
  const includeUncategorized = categories.some((category) => isUncategorizedCategoryId(category.id));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const wanted = order.length > 0 ? order : categories.map((category) => category.id);
  const ordered: TagCategory[] = [];
  const seen = new Set<string>();
  for (const id of wanted) {
    const category = byId.get(id);
    if (seen.has(id) || !category) {
      continue;
    }
    ordered.push(category);
    seen.add(id);
  }
  for (const category of categories) {
    if (seen.has(category.id) || isUncategorizedCategoryId(category.id)) {
      continue;
    }
    ordered.push(category);
    seen.add(category.id);
  }
  if (includeUncategorized && !seen.has(UNCATEGORIZED_CATEGORY_ID)) {
    ordered.push(byId.get(UNCATEGORIZED_CATEGORY_ID) ?? uncategorized());
  }
  return { ordered, order: ordered.map((category) => category.id) };
}

/**
 * The catalog with the pending edits applied: renamed and new categories, deleted ones gone with their tags under
 * Uncategorized, new, renamed, moved, and deleted tags, and renamed tags renamed on the items. Categories follow
 * `order` and get their place as their sort order; Uncategorized shows last, and only while a tag has no category.
 */
export function tagEditorDisplay(model: TagEditorModel | null, pending: PendingTagEdits, order: readonly string[]): TagEditorDisplay {
  const source = model ?? { categories: [], tags: [], items: [] };
  let categories = canonicalizeCategories(source.categories ?? []);
  pending.upsertCategories.forEach((category, id) => {
    const existing = categories.find((candidate) => candidate.id === id);
    if (existing) {
      existing.name = String(category.name || existing.name || "");
    } else {
      categories.push({ id, name: String(category.name || ""), sortOrder: Number(category.sortOrder || 0) });
    }
  });
  categories = categories.filter((category) => isUncategorizedCategoryId(category.id) || !pending.deleteCategoryIds.has(category.id));

  let tags: CatalogTag[] = (source.tags ?? [])
    .map((tag) => ({ name: String(tag.name || ""), categoryId: String(tag.categoryId || UNCATEGORIZED_CATEGORY_ID) }))
    .filter((tag) => tag.name.length > 0);
  pending.upsertTags.forEach((upsert, key) => {
    const existing = tags.find((tag) => normalizeTagKey(tag.name) === key);
    if (existing) {
      existing.categoryId = String(upsert.categoryId || UNCATEGORIZED_CATEGORY_ID);
    } else {
      tags.push({ name: String(upsert.name || ""), categoryId: String(upsert.categoryId || UNCATEGORIZED_CATEGORY_ID) });
    }
  });
  pending.renameTags.forEach((rename) => {
    const existing = tags.find((tag) => normalizeTagKey(tag.name) === normalizeTagKey(rename.oldName));
    if (existing) {
      existing.name = String(rename.newName || existing.name);
      if (typeof rename.newCategoryId === "string") {
        existing.categoryId = rename.newCategoryId;
      }
    }
  });

  const items: ItemTags[] = (source.items ?? []).map((item) => ({
    itemId: String(item?.itemId || ""),
    tags: Array.isArray(item?.tags) ? item.tags.slice() : []
  }));
  pending.renameTags.forEach((rename) => {
    const oldKey = normalizeTagKey(rename.oldName);
    const newName = String(rename.newName || rename.oldName || "");
    const newKey = normalizeTagKey(newName);
    for (const item of items) {
      if (!item.tags.some((tag) => normalizeTagKey(tag) === oldKey)) {
        continue;
      }
      item.tags = item.tags.filter((tag) => normalizeTagKey(tag) !== oldKey);
      if (!item.tags.some((tag) => normalizeTagKey(tag) === newKey)) {
        item.tags.push(newName);
      }
    }
  });

  pending.deleteTags.forEach((_, key) => {
    tags = tags.filter((tag) => normalizeTagKey(tag.name) !== key);
  });
  const categoryIds = new Set(categories.map((category) => category.id));
  for (const tag of tags) {
    if (!tag.categoryId || pending.deleteCategoryIds.has(tag.categoryId) || !categoryIds.has(tag.categoryId)) {
      tag.categoryId = UNCATEGORIZED_CATEGORY_ID;
    }
  }

  const hasUncategorizedTags = tags.some((tag) => isUncategorizedCategoryId(tag.categoryId));
  const hasUncategorized = categories.some((category) => isUncategorizedCategoryId(category.id));
  if (hasUncategorizedTags && !hasUncategorized) {
    categories.push(uncategorized());
  } else if (!hasUncategorizedTags && hasUncategorized) {
    categories = categories.filter((category) => !isUncategorizedCategoryId(category.id));
  }
  const arranged = orderCategories(canonicalizeCategories(categories), order);
  arranged.ordered.forEach((category, index) => {
    category.sortOrder = isUncategorizedCategoryId(category.id) ? Number.MAX_SAFE_INTEGER : index;
  });
  tags.sort((a, b) => compareTagNames(a.name, b.name));
  return { categories: arranged.ordered, tags, items, order: arranged.order };
}

/**
 * The tag model as it will be once a save of these changes lands: the catalog with the pending edits applied, in the
 * editor's order, and the items with the held adds and removes applied and deleted tags gone. The editor shows it
 * until the tags load again.
 */
export function savedTagModel(
  model: TagEditorModel | null,
  pending: PendingTagEdits,
  order: readonly string[],
  selections: ReadonlyMap<string, TagSelection>
): TagEditorModel {
  const display = tagEditorDisplay(model, pending, order);
  const items = display.items.map((item) => {
    let tags = item.tags.filter((tag) => !pending.deleteTags.has(normalizeTagKey(tag)));
    for (const selection of selections.values()) {
      const key = normalizeTagKey(selection.name);
      if (selection.action === "remove") {
        tags = tags.filter((tag) => normalizeTagKey(tag) !== key);
      } else if (!tags.some((tag) => normalizeTagKey(tag) === key)) {
        tags.push(selection.name);
      }
    }
    return { itemId: item.itemId, tags };
  });
  return {
    categories: display.categories
      .filter((category) => !isUncategorizedCategoryId(category.id))
      .map((category) => ({ id: category.id, name: category.name, sortOrder: category.sortOrder })),
    tags: display.tags.map((tag) => ({ name: tag.name, categoryId: isUncategorizedCategoryId(tag.categoryId) ? "" : tag.categoryId })),
    items
  };
}

/** Whether all, some, or none of the items have the tag. */
export function chipState(tagName: string, items: readonly ItemTags[]): ChipState {
  if (items.length === 0) {
    return "state-none";
  }
  const key = normalizeTagKey(tagName);
  const withTag = items.filter((item) => item.tags.some((tag) => normalizeTagKey(tag) === key)).length;
  return withTag === 0 ? "state-none" : withTag === items.length ? "state-all" : "state-some";
}

/** Each category's name and its tags' names in order, as the model saved them. */
function savedCategoryShapes(model: TagEditorModel | null): Map<string, string> {
  const saved = tagEditorDisplay(model, createPendingTagEdits(), []);
  return new Map(saved.categories.map((category) => [category.id, categoryShape(category, saved.tags)]));
}

function categoryShape(category: TagCategory, tags: readonly CatalogTag[]): string {
  const names = tags
    .filter((tag) => (isUncategorizedCategoryId(tag.categoryId) ? UNCATEGORIZED_CATEGORY_ID : tag.categoryId) === category.id)
    .map((tag) => tag.name);
  return JSON.stringify([category.name, names]);
}

/**
 * The Tags tab's categories, each with its controls and its tags by name. A category is collapsed unless `expanded`
 * holds it, and the saved `model` tells which ones hold unsaved changes.
 */
export function tagCategoryRows(
  display: TagEditorDisplay,
  expanded: ReadonlySet<string>,
  selections: ReadonlyMap<string, TagSelection>,
  model: TagEditorModel | null
): TagCategoryRow[] {
  const canChangeItems = display.items.length > 0;
  const saved = savedCategoryShapes(model);
  return display.categories.map((category) => {
    const isUncategorized = isUncategorizedCategoryId(category.id);
    const chips = display.tags
      .filter((tag) => (isUncategorizedCategoryId(tag.categoryId) ? UNCATEGORIZED_CATEGORY_ID : tag.categoryId) === category.id)
      .map((tag) => ({
        name: tag.name,
        state: chipState(tag.name, display.items),
        pending: selections.get(normalizeTagKey(tag.name))?.action ?? null,
        canChangeItems
      }));
    return {
      id: category.id,
      name: category.name,
      uncategorized: isUncategorized,
      collapsed: !expanded.has(category.id),
      chips,
      inUse: chips.filter((chip) => chip.state !== "state-none").length,
      unsaved: chips.some((chip) => chip.pending !== null) || saved.get(category.id) !== categoryShape(category, display.tags)
    };
  });
}

/**
 * Moves a category to `to`, counted among the categories that can move. Null when it is already there or cannot move
 * there; Uncategorized never moves and stays last.
 */
export function moveCategoryInOrder(order: readonly string[], categoryId: string, to: number): string[] | null {
  if (!categoryId || isUncategorizedCategoryId(categoryId)) {
    return null;
  }
  const movable = order.filter((id) => !isUncategorizedCategoryId(id));
  const from = movable.indexOf(categoryId);
  if (from < 0 || to < 0 || to >= movable.length || to === from) {
    return null;
  }
  const moved = moveEntry(movable, from, to);
  return order.some((id) => isUncategorizedCategoryId(id)) ? [...moved, UNCATEGORIZED_CATEGORY_ID] : moved;
}

/** Adds a new category last, before Uncategorized. */
export function addCategoryToOrder(order: readonly string[], categoryId: string): string[] {
  const next = order.slice();
  const uncategorizedIndex = next.findIndex((id) => isUncategorizedCategoryId(id));
  if (uncategorizedIndex >= 0) {
    next.splice(uncategorizedIndex, 0, categoryId);
  } else {
    next.push(categoryId);
  }
  return next;
}

/** Turns a held change off when it is chosen again, and otherwise holds it. */
export function toggleTagSelection(
  selections: ReadonlyMap<string, TagSelection>,
  tagName: string,
  action: TagAction
): Map<string, TagSelection> {
  const next = new Map(selections);
  const key = normalizeTagKey(tagName);
  if (next.get(key)?.action === action) {
    next.delete(key);
  } else {
    next.set(key, { action, name: tagName });
  }
  return next;
}

export interface TagSavePlanState {
  model: TagEditorModel | null;
  pending: PendingTagEdits;
  order: readonly string[];
  selections: ReadonlyMap<string, TagSelection>;
  itemIds: readonly string[];
}

/** The requests that save the editor's changes, in the order they are sent. */
export function planTagEdits(state: TagSavePlanState): TagSaveStep[] {
  const display = tagEditorDisplay(state.model, state.pending, state.order);
  const toPlan = (category: TagCategory) => ({
    id: String(category.id || ""),
    name: String(category.name || ""),
    sortOrder: Number(category.sortOrder || 0)
  });
  const addTags: string[] = [];
  const removeTags: string[] = [];
  for (const selection of state.selections.values()) {
    (selection.action === "add" ? addTags : removeTags).push(selection.name);
  }
  return planTagEditorSave({
    baselineCategories: (state.model?.categories ?? []).map(toPlan),
    displayCategories: display.categories.map(toPlan),
    deleteCategoryIds: [...state.pending.deleteCategoryIds],
    upsertTags: [...state.pending.upsertTags.values()],
    renameTags: [...state.pending.renameTags.values()],
    deleteTags: [...state.pending.deleteTags.values()],
    itemIds: state.itemIds,
    addTags,
    removeTags,
    autoTagAssignments: []
  });
}

/** The request that applies Auto Tag's selected files, or none while there are none. */
export function planAutoTagApply(assignments: readonly AutoTagSaveAssignment[]): TagSaveStep[] {
  return planTagEditorSave({
    baselineCategories: [],
    displayCategories: [],
    deleteCategoryIds: [],
    upsertTags: [],
    renameTags: [],
    deleteTags: [],
    itemIds: [],
    addTags: [],
    removeTags: [],
    autoTagAssignments: assignments
  });
}

export interface TagSaveRequest {
  path: string;
  body: unknown;
  /** Names the step in a failed save's message, such as "Tag apply failed (500)". */
  label: string;
}

/** The request that sends one save step. */
export function tagSaveRequest(step: TagSaveStep): TagSaveRequest {
  switch (step.kind) {
    case "upsert-category":
      return {
        path: "/api/tag-editor/upsert-category",
        body: { id: step.id, name: step.name, sortOrder: step.sortOrder },
        label: "Category update"
      };
    case "delete-category":
      return {
        path: "/api/tag-editor/delete-category",
        body: { categoryId: step.categoryId, newCategoryId: null },
        label: "Category delete"
      };
    case "upsert-tag":
      return {
        path: "/api/tag-editor/upsert-tag",
        body: { name: step.name, categoryId: step.categoryId || "" },
        label: "Tag create/update"
      };
    case "rename-tag":
      return {
        path: "/api/tag-editor/rename-tag",
        body: { oldName: step.oldName, newName: step.newName, newCategoryId: step.newCategoryId },
        label: "Tag rename"
      };
    case "delete-tag":
      return { path: "/api/tag-editor/delete-tag", body: { name: step.name }, label: "Tag delete" };
    case "apply-item-tags":
      return {
        path: "/api/tag-editor/apply-item-tags",
        body: { itemIds: step.itemIds, addTags: step.addTags, removeTags: step.removeTags },
        label: "Tag apply"
      };
    case "apply-auto-tag":
      return {
        path: "/api/autotag/apply",
        body: { assignments: step.assignments.map((assignment) => ({ tagName: assignment.tagName, itemPaths: assignment.itemPaths })) },
        label: "Auto-tag apply"
      };
  }
}

/** The tags each auto-tag assignment newly wrote, from the apply response. */
export function autoTagAppliedFromResponse(body: unknown): Array<{ tagName: string; changedItemIds: string[] }> {
  const response = body as { applied?: unknown; Applied?: unknown } | null;
  const rows = response?.applied || response?.Applied || [];
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({
    tagName: String(row?.tagName || row?.TagName || ""),
    changedItemIds: Array.isArray(row?.changedItemIds) ? row.changedItemIds : Array.isArray(row?.ChangedItemIds) ? row.ChangedItemIds : []
  }));
}
