import { signal, type ReadonlySignal } from "@preact/signals";
import type { Library } from "../library/library";
import { createAutoTagScanRequest, libraryQueryTagSaveEffect } from "../library/libraryQuerySession";
import {
  createTagSaveSession,
  handleIncomingItemTags,
  retargetTagFilter,
  runTagEditorSave,
  type TagSaveHandle,
  type TagSaveStep,
  type TaggedItem
} from "../library/tagSave";
import type { Player } from "../playback/player";
import type { AppApi } from "../state/appApi";
import type { AppStore, StorageLike } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import {
  AUTO_TAG_SCANNING,
  autoTagApplyPending,
  autoTagAssignments,
  autoTagResults,
  autoTagRowsFromScan,
  autoTagStatusAfterChange,
  collapseEmptyAutoTagRows,
  selectFile,
  selectRowFiles,
  selectVisibleAutoTagFiles,
  type AutoTagResults,
  type AutoTagRow
} from "./autoTagModel";
import {
  UNCATEGORIZED_CATEGORY_ID,
  addCategoryToOrder,
  autoTagAppliedFromResponse,
  categoryOptions,
  createPendingTagEdits,
  hasPendingTagEdits,
  initialCategoryOrder,
  moveCategoryInOrder,
  normalizeTagKey,
  planTagEdits,
  tagCategoryRows,
  tagEditorDisplay,
  tagSaveRequest,
  toggleTagSelection,
  type PendingTagEdits,
  type TagAction,
  type TagCategory,
  type TagCategoryRow,
  type TagEditorModel,
  type TagSelection
} from "./tagEditorModel";

const COLLAPSED_CATEGORIES_KEY = "rr_tagEditorCollapsed";
const SCAN_FULL_LIBRARY_KEY = "rr_autoTagScanFullLibrary";
const SAVE_SUCCEEDED = "Tag editor changes applied";

export type TagEditorTab = "edit" | "autotag";

/** The Edit Tag dialog: the tag as it was, and the name and category typed and chosen. */
export interface TagEditDraft {
  oldName: string;
  oldCategoryId: string;
  name: string;
  categoryId: string;
}

interface AutoTagState {
  scanFull: boolean;
  viewAll: boolean;
  rows: AutoTagRow[];
  hasRun: boolean;
  scanning: boolean;
  /** The status above the results, updated where the results change. */
  status: string;
}

interface TagEditorState {
  /** The last tag model loaded, kept while a new one loads and while the editor is closed. */
  model: TagEditorModel | null;
  /** The items being edited: the item playing when the editor opened. */
  itemIds: string[];
  order: string[];
  orderChanged: boolean;
  selections: ReadonlyMap<string, TagSelection>;
  pending: PendingTagEdits;
  /** The categories collapsed, kept for the browser session. */
  collapsed: ReadonlySet<string>;
  /** The new tag's name and category, kept while the editor is closed. */
  newTagName: string;
  newTagCategoryId: string;
  /** The Edit Tag dialog's fields, kept after it closes, or null before it first opens. */
  edit: TagEditDraft | null;
  editing: boolean;
  autoTag: AutoTagState;
}

/** What the editor shows. Each change replaces it. */
export interface TagEditorView extends TagEditorState {
  /** The categories and their tags, or null before a tag model loads. */
  categories: TagCategoryRow[] | null;
  /** The categories a tag can go in, for the new tag and the Edit Tag dialog. */
  categoryOptions: TagCategory[];
  /** Shown in place of the categories after a change made before any tag model loaded. */
  noModel: boolean;
  /** Save is enabled and marked while there is something to save. */
  savePending: boolean;
  results: AutoTagResults;
}

/**
 * The tag editor: the playing item's tags and the tag catalog on Edit Tags, file name matches on Auto Tag, and
 * Save, which sends all of their changes in the background after closing.
 */
export interface TagEditor {
  readonly isOpen: ReadonlySignal<boolean>;
  /** The tab shown, or null before the editor first opens. */
  readonly tab: ReadonlySignal<TagEditorTab | null>;
  /** Null before the editor first opens. */
  readonly view: ReadonlySignal<TagEditorView | null>;

  /** Pauses playback, shows Edit Tags, and loads the tags of the item playing. */
  open(): void;
  /** Asks first when there are changes, then hides the editor and resumes playback. Not while a scan runs. */
  close(): void;
  showTab(tab: TagEditorTab): void;
  /** Asks first when there are changes, then drops them and loads the tags again. Not while a scan runs. */
  refresh(): void;
  /** Closes the editor and sends the changes in the background. */
  save(): void;

  toggleCategory(categoryId: string): void;
  moveCategory(categoryId: string, direction: -1 | 1): void;
  /** Asks for the new name. */
  renameCategory(categoryId: string): void;
  /** Asks first. */
  deleteCategory(categoryId: string): void;
  /** Asks for the name. */
  addCategory(): void;
  toggleTag(tagName: string, action: TagAction): void;
  /** Asks first. */
  deleteTag(tagName: string): void;
  typeNewTag(text: string): void;
  chooseNewTagCategory(categoryId: string): void;
  addTag(): void;

  /** Opens the Edit Tag dialog. */
  editTag(tagName: string): void;
  typeEditName(text: string): void;
  chooseEditCategory(categoryId: string): void;
  saveEdit(): void;
  cancelEdit(): void;

  setScanFullLibrary(checked: boolean): void;
  setViewAll(checked: boolean): void;
  selectAll(): void;
  deselectAll(): void;
  scan(): Promise<void>;
  toggleRowExpanded(rowId: number): void;
  checkRow(rowId: number, checked: boolean): void;
  checkFile(rowId: number, itemId: string, checked: boolean): void;
}

export interface TagEditorOptions {
  store: AppStore;
  api: AppApi;
  connection: Pick<ServerConnection, "on">;
  library: Pick<Library, "session">;
  player: Pick<Player, "pauseForTagEditor" | "resumeAfterTagEditor">;
  /** Browser `sessionStorage`, for the collapsed categories. */
  sessionStorage: StorageLike;
  /** Browser `localStorage`, for Scan full library. */
  localStorage: StorageLike;
  /** Defaults to `window.confirm`, looked up on each use. */
  confirm?: (message: string) => boolean;
  /** Defaults to `window.prompt`, looked up on each use. */
  prompt?: (message: string, value?: string) => string | null;
  /** Defaults to `window.alert`, looked up on each use. */
  alert?: (message: string) => void;
  /** Ids for new categories. */
  newId?: () => string;
}

function errorText(error: unknown): string {
  return (error as { message?: string } | null)?.message || String(error);
}

function emptyAutoTag(scanFull: boolean, viewAll: boolean): AutoTagState {
  return { scanFull, viewAll, rows: [], hasRun: false, scanning: false, status: "" };
}

export function createTagEditor(options: TagEditorOptions): TagEditor {
  const { store, api, connection, library } = options;
  const confirm = options.confirm ?? ((message: string) => window.confirm(message));
  const prompt = options.prompt ?? ((...args: [message: string, value?: string]) => window.prompt(...args));
  const alert = options.alert ?? ((message: string) => window.alert(message));
  const newId = options.newId ?? (() => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`));

  const isOpen = signal(false);
  const tab = signal<TagEditorTab | null>(null);
  const view = signal<TagEditorView | null>(null);
  let state: TagEditorState = {
    model: null,
    itemIds: [],
    order: [],
    orderChanged: false,
    selections: new Map(),
    pending: createPendingTagEdits(),
    collapsed: new Set(),
    newTagName: "",
    newTagCategoryId: "",
    edit: null,
    editing: false,
    autoTag: emptyAutoTag(false, false)
  };

  const saves = createTagSaveSession();
  /** The message of the last refused save step on this page (recorded in WebUI Status Line Overhaul). */
  let lastSaveError = "";

  function manualPending(current: TagEditorState): boolean {
    return current.orderChanged || current.selections.size > 0 || hasPendingTagEdits(current.pending);
  }

  function autoTagPending(current: TagEditorState): boolean {
    return autoTagApplyPending(current.autoTag.rows, current.autoTag.viewAll, current.autoTag.hasRun);
  }

  function hasChanges(current: TagEditorState): boolean {
    return manualPending(current) || autoTagPending(current);
  }

  /**
   * Works out what the editor shows, and keeps the category order and the new tag's category as shown: the order
   * with categories dropped and added, and the first category when the chosen one is gone.
   */
  function settle(next: TagEditorState): void {
    let categories: TagCategoryRow[] | null = null;
    let options: TagCategory[] = [];
    if (next.model) {
      const display = tagEditorDisplay(next.model, next.pending, next.order);
      categories = tagCategoryRows(display, next.collapsed, next.selections);
      options = categoryOptions(display.categories);
      const newTagCategoryId = options.some((option) => option.id === next.newTagCategoryId)
        ? next.newTagCategoryId
        : (options[0]?.id ?? "");
      // An order emptied to start over stays empty until the next tag model sets it.
      next = { ...next, order: next.order.length > 0 ? display.order : next.order, newTagCategoryId };
    }
    state = next;
    view.value = {
      ...next,
      categories,
      categoryOptions: options,
      noModel: !next.model && manualPending(next),
      savePending: hasChanges(next),
      results: autoTagResults(next.autoTag.rows, next.autoTag.viewAll, next.autoTag.hasRun)
    };
  }

  function update(change: Partial<TagEditorState>): void {
    settle({ ...state, ...change });
  }

  /** Replaces the Auto Tag rows, and the status as the results now read. */
  function updateRows(rows: AutoTagRow[], change: Partial<AutoTagState> = {}): void {
    const autoTag = { ...state.autoTag, ...change, rows };
    update({ autoTag: { ...autoTag, status: autoTagStatusAfterChange(rows, autoTag.viewAll, autoTag.hasRun, autoTag.status) } });
  }

  function cleared(): Pick<TagEditorState, "selections" | "pending" | "orderChanged"> {
    return { selections: new Map(), pending: createPendingTagEdits(), orderChanged: false };
  }

  function readCollapsed(): Set<string> {
    try {
      const raw = options.sessionStorage.getItem(COLLAPSED_CATEGORIES_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? new Set(parsed.map((id) => String(id || ""))) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveCollapsed(collapsed: ReadonlySet<string>): void {
    try {
      options.sessionStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify(Array.from(collapsed)));
    } catch {
      // Best effort: the categories open expanded next time.
    }
  }

  function readScanFull(): boolean {
    try {
      return options.localStorage.getItem(SCAN_FULL_LIBRARY_KEY) === "true";
    } catch {
      return false;
    }
  }

  function saveScanFull(value: boolean): void {
    try {
      options.localStorage.setItem(SCAN_FULL_LIBRARY_KEY, value ? "true" : "false");
    } catch {
      // Best effort: the box starts unchecked next time.
    }
  }

  function currentItemIds(): string[] {
    if (state.itemIds.length > 0) {
      return state.itemIds.slice();
    }
    const current = store.current.peek();
    return current?.itemId ? [current.itemId] : [];
  }

  async function loadModel(): Promise<void> {
    const response = await api.post("/api/tag-editor/model", { itemIds: currentItemIds() });
    if (!response.ok) {
      throw new Error(`tag-model:${response.status}`);
    }
    const model = ((await response.json()) as TagEditorModel | null) || { categories: [], tags: [], items: [] };
    update({ model, order: state.order.length > 0 ? state.order : initialCategoryOrder(model) });
  }

  function closeEditor(): void {
    update({ editing: false, itemIds: [], ...cleared(), autoTag: emptyAutoTag(state.autoTag.scanFull, state.autoTag.viewAll) });
    isOpen.value = false;
    options.player.resumeAfterTagEditor();
  }

  // Tiles and filters the save changes.

  function loadedTagItems(): TaggedItem[] {
    return library.session.snapshot().items.map((item) => ({ id: item.id, tags: item.tags.slice() }));
  }

  function writeLoadedTagItems(items: readonly TaggedItem[]): void {
    library.session.writeTags(items.map((item) => ({ itemId: item.id, tags: item.tags })));
  }

  function tagFilterCanChangeMembership(): boolean {
    const applied = store.appliedFilter.peek();
    return (applied?.selectedTags?.length || 0) > 0 || (applied?.excludedTags?.length || 0) > 0;
  }

  function reloadOnLand(): boolean {
    return library.session.snapshot().inFlight || libraryQueryTagSaveEffect(store.appliedFilter.peek()) === "reload";
  }

  /**
   * Renames or removes a renamed or deleted tag in the applied filter and the presets, in place, and in the
   * library's filter. Nothing renders from the applied filter, so the header preset list is rebuilt here.
   */
  function retargetFilters(step: TagSaveStep): void {
    if (step.kind !== "rename-tag" && step.kind !== "delete-tag") {
      return;
    }
    const applied = store.appliedFilter.peek();
    const filterChanged = applied ? retargetTagFilter(applied.selectedTags || [], applied.excludedTags || [], step) : false;
    let presetsChanged = false;
    for (const preset of store.presets.peek() || []) {
      const filter = preset?.filterState as { selectedTags?: unknown; excludedTags?: unknown } | undefined;
      if (!filter || !Array.isArray(filter.selectedTags) || !Array.isArray(filter.excludedTags)) {
        continue;
      }
      presetsChanged = retargetTagFilter(filter.selectedTags, filter.excludedTags, step) || presetsChanged;
    }
    library.session.reviseStoredFilter((selected, excluded) => {
      retargetTagFilter(selected, excluded, step);
    });
    if (filterChanged || presetsChanged) {
      store.syncHeaderPresets();
    }
  }

  async function postStep(handle: TagSaveHandle, step: TagSaveStep): Promise<boolean> {
    const request = tagSaveRequest(step);
    const response = await api.post(request.path, request.body);
    if (!response.ok) {
      lastSaveError = `${request.label} failed (${response.status})`;
      return false;
    }
    if (step.kind === "apply-auto-tag") {
      saves.noteAutoTagResult(handle, autoTagAppliedFromResponse(await response.json().catch(() => null)));
    }
    retargetFilters(step);
    return true;
  }

  function projectLoadedTagItems(): void {
    const current = loadedTagItems();
    saves.project(current);
    writeLoadedTagItems(current);
  }

  function failSave(handle: TagSaveHandle, accepted: readonly TagSaveStep[]): boolean {
    const current = loadedTagItems();
    const rolledBack = saves.fail(handle, current, accepted);
    writeLoadedTagItems(current);
    return rolledBack;
  }

  async function saveInBackground(handle: TagSaveHandle, steps: TagSaveStep[]): Promise<void> {
    let result;
    try {
      result = await runTagEditorSave(steps, { post: (step) => postStep(handle, step) });
    } catch (error) {
      const rolledBack = failSave(handle, []);
      store.setStatus(rolledBack ? (error as Error | null)?.message || `Tag apply failed: ${error}` : SAVE_SUCCEEDED);
      return;
    }
    if (!result.ok) {
      // A step the server confirmed through its event before refusing a later one is not rolled back.
      const rolledBack = failSave(handle, result.accepted);
      store.setStatus(rolledBack ? lastSaveError || "Tag apply failed" : SAVE_SUCCEEDED);
      return;
    }
    try {
      projectLoadedTagItems();
      if (saves.succeed(handle, reloadOnLand()).reload) {
        await library.session.reloadLoaded();
      }
      store.setStatus(SAVE_SUCCEEDED);
    } catch (error) {
      store.setStatus((error as Error | null)?.message || SAVE_SUCCEEDED);
    }
  }

  /** An item-tags event: this page's own save, or another client's change, possibly a catalog rename or delete. */
  function applyItemTagsEvent(payload: any): void {
    const echo = {
      itemIds: payload.resolvedItemIds || payload.ResolvedItemIds || [],
      addedTags: payload.addedTags || payload.AddedTags || [],
      removedTags: payload.removedTags || payload.RemovedTags || []
    };
    const catalogReplacedTag = payload.catalogReplacedTag || payload.CatalogReplacedTag || null;
    handleIncomingItemTags(
      {
        resolvedItemIds: echo.itemIds,
        addedTags: echo.addedTags,
        removedTags: echo.removedTags,
        catalogReplacedTag,
        catalogReplacementTag: payload.catalogReplacementTag || payload.CatalogReplacementTag || null
      },
      {
        tagFilterCanChangeMembership,
        retarget: retargetFilters,
        afterRetarget(handling) {
          const decision = saves.onEcho(echo, handling.hadTagFilter || reloadOnLand());
          if (decision.skipPatch) {
            projectLoadedTagItems();
            saves.sweep();
            if (decision.reload) {
              void library.session.reloadLoaded();
            }
            return;
          }
          saves.sweep();
          void library.session.applyTags({
            resolvedItemIds: echo.itemIds,
            addedTags: echo.addedTags,
            removedTags: echo.removedTags,
            catalogReplacedTag
          });
          if (handling.reloadBecauseFilterCleared) {
            void library.session.reloadLoaded();
          }
        }
      }
    );
  }

  connection.on("itemTagsChanged", applyItemTagsEvent);

  function findCategory(categoryId: string): TagCategoryRow | undefined {
    return view.peek()?.categories?.find((category) => category.id === categoryId);
  }

  const editor: TagEditor = {
    isOpen,
    tab,
    view,

    open() {
      const current = store.current.peek();
      update({
        itemIds: current?.itemId ? [current.itemId] : [],
        order: [],
        collapsed: readCollapsed(),
        ...cleared(),
        autoTag: emptyAutoTag(readScanFull(), false)
      });
      tab.value = "edit";
      options.player.pauseForTagEditor();
      isOpen.value = true;
      loadModel().catch((error) => {
        store.setStatus(`Tag editor unavailable: ${errorText(error)}`);
      });
    },

    close() {
      if (state.autoTag.scanning) {
        return;
      }
      if (hasChanges(state) && !confirm("Discard changes?")) {
        return;
      }
      closeEditor();
    },

    showTab(next) {
      tab.value = next;
    },

    refresh() {
      if (state.autoTag.scanning) {
        return;
      }
      if (hasChanges(state) && !confirm("Discard changes?")) {
        return;
      }
      update({ ...cleared(), order: [], autoTag: emptyAutoTag(state.autoTag.scanFull, state.autoTag.viewAll) });
      loadModel().catch((error) => {
        store.setStatus(`Tag refresh failed: ${errorText(error)}`);
      });
    },

    save() {
      if (state.autoTag.scanning || !hasChanges(state)) {
        return;
      }
      const steps = planTagEdits({
        model: state.model,
        pending: state.pending,
        order: state.order,
        selections: state.selections,
        itemIds: currentItemIds(),
        autoTagAssignments: autoTagAssignments(state.autoTag.rows, state.autoTag.viewAll)
      });
      if (steps.length === 0) {
        store.setStatus("No tag changes to save.");
        return;
      }
      const loaded = loadedTagItems();
      const handle = saves.begin(loaded, steps, false, tagFilterCanChangeMembership());
      writeLoadedTagItems(loaded);
      closeEditor();
      void saveInBackground(handle, steps);
    },

    toggleCategory(categoryId) {
      const collapsed = new Set(state.collapsed);
      if (collapsed.has(categoryId)) {
        collapsed.delete(categoryId);
      } else {
        collapsed.add(categoryId);
      }
      saveCollapsed(collapsed);
      update({ collapsed });
    },

    moveCategory(categoryId, direction) {
      const order = moveCategoryInOrder(state.order, categoryId, direction);
      if (order) {
        update({ order, orderChanged: true });
      }
    },

    renameCategory(categoryId) {
      const category = findCategory(categoryId);
      if (!category || category.uncategorized) {
        return;
      }
      const name = String(prompt("Rename Category", category.name.trim()) || "").trim();
      if (!name) {
        return;
      }
      const taken = view
        .peek()!
        .categories!.some((other) => other.id !== categoryId && other.name.trim().toLowerCase() === name.toLowerCase());
      if (taken) {
        alert("Category already exists.");
        return;
      }
      const sortOrder = Math.max(0, state.order.indexOf(categoryId));
      const upsertCategories = new Map(state.pending.upsertCategories).set(categoryId, { id: categoryId, name, sortOrder });
      update({ pending: { ...state.pending, upsertCategories } });
    },

    deleteCategory(categoryId) {
      const category = findCategory(categoryId);
      if (!category || category.uncategorized) {
        return;
      }
      if (!confirm(`Delete category "${category.name || "Category"}"? Tags will become Uncategorized.`)) {
        return;
      }
      const upsertCategories = new Map(state.pending.upsertCategories);
      upsertCategories.delete(categoryId);
      update({
        pending: { ...state.pending, deleteCategoryIds: new Set(state.pending.deleteCategoryIds).add(categoryId), upsertCategories },
        order: state.order.filter((id) => id !== categoryId)
      });
    },

    addCategory() {
      const name = prompt("New category name");
      if (!name || !name.trim()) {
        return;
      }
      const id = newId();
      const upsertCategories = new Map(state.pending.upsertCategories).set(id, { id, name: name.trim(), sortOrder: state.order.length });
      update({ pending: { ...state.pending, upsertCategories }, order: addCategoryToOrder(state.order, id) });
    },

    toggleTag(tagName, action) {
      update({ selections: toggleTagSelection(state.selections, tagName, action) });
    },

    deleteTag(tagName) {
      if (!confirm(`Delete tag "${tagName}"?`)) {
        return;
      }
      const key = normalizeTagKey(tagName);
      const upsertTags = new Map(state.pending.upsertTags);
      upsertTags.delete(key);
      const renameTags = new Map(state.pending.renameTags);
      renameTags.delete(key);
      const selections = new Map(state.selections);
      selections.delete(key);
      update({
        pending: { ...state.pending, deleteTags: new Map(state.pending.deleteTags).set(key, { name: tagName }), upsertTags, renameTags },
        selections
      });
    },

    typeNewTag(text) {
      update({ newTagName: text });
    },

    chooseNewTagCategory(categoryId) {
      update({ newTagCategoryId: categoryId });
    },

    addTag() {
      const name = state.newTagName.trim();
      if (!name) {
        return;
      }
      const key = normalizeTagKey(name);
      const deleteTags = new Map(state.pending.deleteTags);
      deleteTags.delete(key);
      const upsertTags = new Map(state.pending.upsertTags).set(key, {
        name,
        categoryId: state.newTagCategoryId || UNCATEGORIZED_CATEGORY_ID
      });
      const selections = new Map(state.selections);
      if (currentItemIds().length > 0) {
        selections.set(key, { action: "add", name });
      } else {
        selections.delete(key);
      }
      update({ pending: { ...state.pending, deleteTags, upsertTags }, selections, newTagName: "" });
    },

    editTag(tagName) {
      const current = view.peek();
      const tag = state.model ? tagEditorDisplay(state.model, state.pending, state.order).tags.find((candidate) => candidate.name === tagName) : null;
      if (!current || !tag) {
        return;
      }
      const categoryId = String(tag.categoryId || "");
      update({
        edit: {
          oldName: tag.name,
          oldCategoryId: String(tag.categoryId || UNCATEGORIZED_CATEGORY_ID),
          name: tag.name,
          categoryId: current.categoryOptions.some((option) => option.id === categoryId)
            ? categoryId
            : (current.categoryOptions[0]?.id ?? "")
        },
        editing: true
      });
    },

    typeEditName(text) {
      if (state.edit && state.editing) {
        update({ edit: { ...state.edit, name: text } });
      }
    },

    chooseEditCategory(categoryId) {
      if (state.edit && state.editing) {
        update({ edit: { ...state.edit, categoryId } });
      }
    },

    saveEdit() {
      const edit = state.edit;
      if (!edit || !state.editing) {
        return;
      }
      const name = edit.name.trim();
      if (!name) {
        store.setStatus("Tag name is required.");
        return;
      }
      const categoryId = edit.categoryId || UNCATEGORIZED_CATEGORY_ID;
      const nameChanged = normalizeTagKey(name) !== normalizeTagKey(edit.oldName);
      const categoryChanged = categoryId !== edit.oldCategoryId;
      if (!nameChanged && !categoryChanged) {
        update({ editing: false });
        return;
      }
      const key = normalizeTagKey(edit.oldName);
      const deleteTags = new Map(state.pending.deleteTags);
      deleteTags.delete(key);
      const renameTags = new Map(state.pending.renameTags).set(key, {
        oldName: edit.oldName,
        newName: name,
        newCategoryId: categoryChanged ? categoryId : null
      });
      update({ pending: { ...state.pending, deleteTags, renameTags }, editing: false });
    },

    cancelEdit() {
      update({ editing: false });
    },

    setScanFullLibrary(checked) {
      saveScanFull(checked);
      update({ autoTag: { ...state.autoTag, scanFull: checked } });
    },

    setViewAll(checked) {
      updateRows(collapseEmptyAutoTagRows(state.autoTag.rows, checked), { viewAll: checked });
    },

    selectAll() {
      updateRows(selectVisibleAutoTagFiles(state.autoTag.rows, state.autoTag.viewAll, true));
    },

    deselectAll() {
      updateRows(selectVisibleAutoTagFiles(state.autoTag.rows, state.autoTag.viewAll, false));
    },

    async scan() {
      if (state.autoTag.scanning) {
        return;
      }
      update({ autoTag: { ...state.autoTag, scanning: true, status: AUTO_TAG_SCANNING } });
      let rows: AutoTagRow[] = [];
      try {
        const response = await api.post("/api/autotag/scan", createAutoTagScanRequest(state.autoTag.scanFull));
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        rows = autoTagRowsFromScan(await response.json());
      } catch {
        // A failed scan reads as one that found nothing (recorded in WebUI Status Line Overhaul).
        rows = [];
      }
      updateRows(rows, { hasRun: true });
      update({ autoTag: { ...state.autoTag, scanning: false } });
    },

    toggleRowExpanded(rowId) {
      updateRows(state.autoTag.rows.map((row) => (row.rowId === rowId ? { ...row, expanded: !row.expanded } : row)));
    },

    checkRow(rowId, checked) {
      updateRows(state.autoTag.rows.map((row) => (row.rowId === rowId ? selectRowFiles(row, state.autoTag.viewAll, checked) : row)));
    },

    checkFile(rowId, itemId, checked) {
      if (!itemId) {
        return;
      }
      updateRows(state.autoTag.rows.map((row) => (row.rowId === rowId ? selectFile(row, itemId, checked) : row)));
    }
  };

  return editor;
}
