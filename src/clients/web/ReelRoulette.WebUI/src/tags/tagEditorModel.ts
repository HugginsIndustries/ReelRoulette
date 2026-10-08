import { compareTagNames } from "../library/tagNameOrder";
import { planTagEditorSave, type AutoTagSaveAssignment, type TagSaveStep } from "../library/tagSave";

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
  canMoveUp: boolean;
  canMoveDown: boolean;
  chips: TagChipRow[];
}

export function normalizeTagKey(tagName: unknown): string {
  return String(tagName || "").trim().toLowerCase();
}

export function isUncategorizedCategoryId(categoryId: unknown): boolean {
  const id = String(categoryId || "").trim().toLowerCase();
  return id === "" || id === UNCATEGORIZED_CATEGORY_ID;
}

function isUncategorizedCategory(category: { id?: unknown; name?: unknown }): boolean {
  return isUncategorizedCategoryId(category.id) || String(category.name || "").trim().toLowerCase() === "uncategorized";
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

function bySortOrderThenName(a: TagCategory, b: TagCategory): number {
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

/** Whether all, some, or none of the items have the tag. */
export function chipState(tagName: string, items: readonly ItemTags[]): ChipState {
  if (items.length === 0) {
    return "state-none";
  }
  const key = normalizeTagKey(tagName);
  const withTag = items.filter((item) => item.tags.some((tag) => normalizeTagKey(tag) === key)).length;
  return withTag === 0 ? "state-none" : withTag === items.length ? "state-all" : "state-some";
}

/** The Edit Tags tab's categories, each with its controls and its tags by name. */
export function tagCategoryRows(
  display: TagEditorDisplay,
  collapsed: ReadonlySet<string>,
  selections: ReadonlyMap<string, TagSelection>
): TagCategoryRow[] {
  const movableCount = display.categories.filter((category) => !isUncategorizedCategoryId(category.id)).length;
  const canChangeItems = display.items.length > 0;
  return display.categories.map((category, index) => {
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
      collapsed: collapsed.has(category.id),
      canMoveUp: !isUncategorized && movableCount > 1 && index > 0,
      canMoveDown: !isUncategorized && movableCount > 1 && index < movableCount - 1,
      chips
    };
  });
}

/** Swaps a category with its neighbor. Null when it cannot move that way; Uncategorized never moves. */
export function moveCategoryInOrder(order: readonly string[], categoryId: string, direction: -1 | 1): string[] | null {
  if (!categoryId || isUncategorizedCategoryId(categoryId)) {
    return null;
  }
  const movable = order.filter((id) => !isUncategorizedCategoryId(id));
  const index = movable.indexOf(categoryId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= movable.length) {
    return null;
  }
  [movable[index], movable[target]] = [movable[target]!, movable[index]!];
  return order.some((id) => isUncategorizedCategoryId(id)) ? [...movable, UNCATEGORIZED_CATEGORY_ID] : movable;
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
  autoTagAssignments: readonly AutoTagSaveAssignment[];
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
    autoTagAssignments: state.autoTagAssignments
  });
}

export interface TagSaveRequest {
  path: string;
  body: unknown;
  /** Names the step in the status line when the server refuses it. */
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
