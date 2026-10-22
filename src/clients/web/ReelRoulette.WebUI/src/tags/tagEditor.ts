import { signal, type ReadonlySignal } from "@preact/signals";
import { noticeRequestFailure, refusalError, requestFailure, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { FilterDialog } from "../filter/filterDialog";
import { cloneFilterState } from "../filter/filterStateModel";
import type { Library } from "../library/library";
import { createAutoTagScanRequest, libraryQueryTagSaveEffect } from "../library/libraryQuerySession";
import { eventLoadFailedLine } from "../logging/relayLogLines";
import type { Notifications } from "../notifications/notifications";
import {
  createTagSaveSession,
  handleIncomingItemTags,
  retargetTagFilter,
  runTagEditorSave,
  type TagSaveHandle,
  type TagSaveStep,
  type TaggedItem
} from "../library/tagSave";
import type { AppApi } from "../state/appApi";
import type { AppStore, StorageLike } from "../state/appStore";
import type { DeviceStore } from "../state/deviceStore";
import type { ServerConnection } from "../state/serverConnection";
import { createCoalescedRefresh } from "../stats/coalescedRefresh";
import { actionBlock, isFlagged, type FieldProblem } from "../validation/fieldValidation";
import {
  AUTO_TAG_SCANNING,
  autoTagApplyPending,
  autoTagAssignments,
  autoTagResults,
  autoTagRowsAfterApply,
  autoTagRowsAfterRefusal,
  autoTagRowsFromScan,
  autoTagRowsLeftCatalog,
  autoTagStatusAfterChange,
  autoTagSummary,
  collapseEmptyAutoTagRows,
  selectAllAutoTagFiles,
  selectFile,
  selectRowFiles,
  type AutoTagResults,
  type AutoTagRow
} from "./autoTagModel";
import type { TagCatalog } from "./tagCatalog";
import {
  UNCATEGORIZED_CATEGORY_ID,
  addCategoryToOrder,
  autoTagAppliedFromResponse,
  categoryNameProblem,
  categoryOptions,
  createPendingTagEdits,
  editTagNameProblem,
  hasPendingTagEdits,
  initialCategoryOrder,
  moveCategoryInOrder,
  newTagNameProblem,
  normalizeTagKey,
  planAutoTagApply,
  planTagEdits,
  retargetHeldTag,
  savedTagModel,
  tagCategoryRows,
  tagEditorDisplay,
  tagSaveRequest,
  toggleTagSelection,
  type CatalogTag,
  type PendingTagEdits,
  type TagAction,
  type TagCategory,
  type TagCategoryRow,
  type TagEditorModel,
  type TagSelection
} from "./tagEditorModel";

const EXPANDED_CATEGORIES_KEY = "tags.expandedCategories";
const SCAN_FULL_LIBRARY_KEY = "rr_autoTagScanFullLibrary";
const SAVE_SUCCEEDED = "Tag editor changes applied";

/** The Edit Tag dialog: the tag as it was, and the name and category typed and chosen. */
export interface TagEditDraft {
  oldName: string;
  oldCategoryId: string;
  name: string;
  categoryId: string;
}

/** The Edit Category dialog: the category and the name typed. */
export interface CategoryEditDraft {
  categoryId: string;
  name: string;
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
  /**
   * The items being edited: the item playing, which the editor follows unless it holds changes to the item's tags or
   * a save hasn't landed yet.
   */
  itemIds: string[];
  /** The file name of the item being edited, for the line that names it while it isn't the one playing. */
  itemName: string;
  order: string[];
  orderChanged: boolean;
  selections: ReadonlyMap<string, TagSelection>;
  pending: PendingTagEdits;
  /** The categories expanded, which this device remembers; every other category is collapsed. */
  expanded: ReadonlySet<string>;
  /** The new tag's name and category, kept while the editor is closed. */
  newTagName: string;
  newTagCategoryId: string;
  /** The Edit Tag dialog's fields, kept after it closes, or null before it first opens. */
  edit: TagEditDraft | null;
  editing: boolean;
  /** The Edit Category dialog, or null while it is closed. */
  categoryEdit: CategoryEditDraft | null;
  /** The New Category dialog's name, or null while it is closed. */
  newCategory: { name: string } | null;
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
  /** Auto Tag's Apply is enabled while a file is selected and no scan runs. */
  autoTagApplyPending: boolean;
  /** The file name of the item being edited while it isn't the one playing, which the tab then names, or null. */
  heldName: string | null;
  /** The Edit Tag name's problem, which disables its Save, or null. */
  editNameProblem: FieldProblem | null;
  editNameFlagged: boolean;
  /** The Edit Category name's problem, which disables its Save, or null. */
  categoryEditProblem: FieldProblem | null;
  categoryEditFlagged: boolean;
  /** The New Category name's problem, which disables its Save, or null. */
  newCategoryProblem: FieldProblem | null;
  newCategoryFlagged: boolean;
  /** The new tag name's problem, or null. */
  newTagProblem: FieldProblem | null;
  newTagFlagged: boolean;
  /** Add tag is disabled: the new tag name sits beside it, so any problem in it disables it. */
  addTagDisabled: boolean;
}

/**
 * The Tags tab's tag editor: the playing item's tags and the tag catalog, with Save, which sends their changes in the
 * background; and Auto Tag, which opens over the whole page from the tab to find files whose names hold a tag's name,
 * with its own Apply. The panel shows and hides the tab, and the editor keeps its changes while it is hidden. It
 * follows the playing item unless it holds changes to its item's tags.
 */
export interface TagEditor {
  /** Whether the Tags tab shows. */
  readonly isOpen: ReadonlySignal<boolean>;
  /** Whether Auto Tag shows, over the whole page. */
  readonly autoTagOpen: ReadonlySignal<boolean>;
  /** Null before the editor first opens. */
  readonly view: ReadonlySignal<TagEditorView | null>;

  /**
   * The tab shows: loads the tags of the item it edits, which it doesn't while the server fails the compatibility
   * check or runs without a library, nor while a save is on its way, which loads them once it lands. A tab that shows
   * while the server has no library loads once it is ready. Its changes are as it was left with them.
   *
   * While it shows without changes, a tag catalog change or a resync loads the tags again, once for a burst of them;
   * with changes it keeps them and loads nothing. Such a load that fails keeps what the tab shows, says nothing, and
   * sends one line to the log. A hidden tab loads when it next shows.
   */
  open(): void;
  /** The tab hides: closes the editor's dialogs, keeping the changes. */
  close(): void;
  /**
   * Discard changes: drops the changes at once, without asking, closes the editor's dialogs, puts the categories back in
   * the order of the tags about to load, follows the playing item, and loads the tags again, or once a save on its way
   * lands. Disabled while there are no changes.
   */
  discardChanges(): void;
  /**
   * Shows the changes as saved and sends them in the background, leaving the panel open. Once the save lands, the
   * editor follows the playing item and loads the tags again. Not while the server fails the compatibility check or
   * runs without a library.
   */
  save(): void;

  toggleCategory(categoryId: string): void;
  /** Moves a category to `to` among the categories that can move, until Save. */
  moveCategory(categoryId: string, to: number): void;
  /** Opens the New Category dialog. */
  addCategory(): void;
  typeNewCategoryName(text: string): void;
  /** Adds the category last, before Uncategorized. Does nothing while the name is empty or taken. */
  saveNewCategory(): void;
  cancelNewCategory(): void;

  /** Opens the Edit Category dialog. Not for Uncategorized. */
  editCategory(categoryId: string): void;
  typeCategoryName(text: string): void;
  /** Renames the category, or just closes when the name is unchanged. Does nothing while the name is empty or taken. */
  saveCategoryEdit(): void;
  cancelCategoryEdit(): void;
  /** Asks first, then deletes the category, its tags becoming Uncategorized, and closes the dialog. */
  deleteEditedCategory(): Promise<void>;

  toggleTag(tagName: string, action: TagAction): void;
  typeNewTag(text: string): void;
  chooseNewTagCategory(categoryId: string): void;
  /**
   * Creates the tag in the chosen category, until Save, expanding the category so its chip shows, and returns its name.
   * It doesn't put the tag on the playing item; the chip's add does. Does nothing while the name is empty or another
   * tag's, and returns null.
   */
  addTag(): string | null;

  /** Opens the Edit Tag dialog. */
  editTag(tagName: string): void;
  typeEditName(text: string): void;
  chooseEditCategory(categoryId: string): void;
  /** Does nothing while the name is empty. */
  saveEdit(): void;
  cancelEdit(): void;
  /** Asks first about the tag as it was when the dialog opened, then deletes it and closes the dialog. */
  deleteEditedTag(): Promise<void>;

  /** Opens Auto Tag over the whole page, with its last scan. */
  openAutoTag(): void;
  /** The X: closes Auto Tag and keeps its last scan. Not while a scan runs. */
  closeAutoTag(): void;
  /** Cancel: clears the scan and closes Auto Tag. Not while a scan runs. */
  cancelAutoTag(): void;
  /**
   * Sends the selected files in the background, and shows them as having their tag, until another scan. A refused
   * apply puts the rows back. Not while a scan runs, nor while the server fails the compatibility check or runs without
   * a library.
   */
  applyAutoTag(): void;
  setScanFullLibrary(checked: boolean): void;
  setViewAll(checked: boolean): void;
  /** Selects every file without its tag; a file that has it can't be selected. */
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
  /** The Filter tab, whose unsaved changes take a tag renamed or deleted. */
  filter: Pick<FilterDialog, "reviseTags">;
  /** This device's memory, for the categories expanded. */
  device: DeviceStore;
  /** Browser `localStorage`, for Scan full library. */
  localStorage: StorageLike;
  /** The in-app dialogs, for the confirmations and the notices of what failed. */
  dialogs: Pick<Dialogs, "confirm" | "notice">;
  /** The one-off messages: a save that landed says so. */
  notifications: Pick<Notifications, "notify">;
  /** Ids for new categories. */
  newId?: () => string;
  /** The tag catalog the tabs share, which takes each catalog the editor loads. */
  tagCatalog?: Pick<TagCatalog, "take">;
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function emptyAutoTag(scanFull: boolean, viewAll: boolean): AutoTagState {
  return { scanFull, viewAll, rows: [], hasRun: false, scanning: false, status: "" };
}

export function createTagEditor(options: TagEditorOptions): TagEditor {
  const { store, api, connection, library, dialogs, notifications } = options;
  const newId = options.newId ?? (() => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`));

  const isOpen = signal(false);
  const autoTagOpen = signal(false);
  const view = signal<TagEditorView | null>(null);
  let state: TagEditorState = {
    model: null,
    itemIds: [],
    itemName: "",
    order: [],
    orderChanged: false,
    selections: new Map(),
    pending: createPendingTagEdits(),
    expanded: new Set(options.device.read(EXPANDED_CATEGORIES_KEY, [] as string[], isIdList)),
    newTagName: "",
    newTagCategoryId: "",
    edit: null,
    editing: false,
    categoryEdit: null,
    newCategory: null,
    autoTag: emptyAutoTag(readScanFull(), false)
  };

  const saves = createTagSaveSession();
  /** Saves and Auto Tag applies sent and not yet landed. The editor follows the playing item and loads the tags only once they land. */
  let savesInFlight = 0;
  /** Counts tag model loads, and saves, so only the latest load's reply is taken. */
  let loads = 0;
  /** Counts Auto Tag scans and their clearing, so a refused Apply only puts back rows a new scan hasn't replaced. */
  let scans = 0;

  function hasChanges(current: TagEditorState): boolean {
    return current.orderChanged || current.selections.size > 0 || hasPendingTagEdits(current.pending);
  }

  /**
   * Works out what the editor shows, and keeps the category order and the new tag's category as shown: the order
   * with categories dropped and added, and the first category when the chosen one is gone.
   */
  function settle(next: TagEditorState): void {
    let categories: TagCategoryRow[] | null = null;
    let options: TagCategory[] = [];
    let tags: CatalogTag[] = [];
    if (next.model) {
      const display = tagEditorDisplay(next.model, next.pending, next.order);
      tags = display.tags;
      categories = tagCategoryRows(display, next.expanded, next.selections, next.model);
      options = categoryOptions(display.categories);
      const newTagCategoryId = options.some((option) => option.id === next.newTagCategoryId)
        ? next.newTagCategoryId
        : (options[0]?.id ?? "");
      // An order emptied to start over stays empty until the next tag model sets it.
      next = { ...next, order: next.order.length > 0 ? display.order : next.order, newTagCategoryId };
    }
    state = next;
    const editNameProblem = next.edit ? editTagNameProblem(next.edit.name) : null;
    const categoryEditProblem = next.categoryEdit
      ? categoryNameProblem(next.categoryEdit.name, categories ?? [], next.categoryEdit.categoryId)
      : null;
    const newCategoryProblem = next.newCategory ? categoryNameProblem(next.newCategory.name, categories ?? [], null) : null;
    const newTagProblem = newTagNameProblem(next.newTagName, tags);
    const playingId = store.current.peek()?.itemId || "";
    view.value = {
      ...next,
      categories,
      categoryOptions: options,
      noModel: !next.model && hasChanges(next),
      savePending: hasChanges(next),
      results: autoTagResults(next.autoTag.rows, next.autoTag.viewAll, next.autoTag.hasRun),
      autoTagApplyPending: !next.autoTag.scanning && autoTagApplyPending(next.autoTag.rows, next.autoTag.hasRun),
      heldName: next.itemIds.length > 0 && next.itemIds[0] !== playingId ? next.itemName : null,
      editNameProblem,
      editNameFlagged: isFlagged(editNameProblem),
      categoryEditProblem,
      categoryEditFlagged: isFlagged(categoryEditProblem),
      newCategoryProblem,
      newCategoryFlagged: isFlagged(newCategoryProblem),
      newTagProblem,
      newTagFlagged: isFlagged(newTagProblem),
      addTagDisabled: actionBlock(["newTag"], { newTag: newTagProblem }, ["newTag"]).disabled
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

  /** Closes the Edit Tag, Edit Category, and New Category dialogs. Edit Tag keeps its fields. */
  function dialogsClosed(): Pick<TagEditorState, "editing" | "categoryEdit" | "newCategory"> {
    return { editing: false, categoryEdit: null, newCategory: null };
  }

  /** The categories expanded with these changed, which this device then remembers. */
  function withExpanded(ids: readonly string[], open: boolean): Set<string> {
    const expanded = new Set(state.expanded);
    for (const id of ids) {
      if (open) {
        expanded.add(id);
      } else {
        expanded.delete(id);
      }
    }
    options.device.write(EXPANDED_CATEGORIES_KEY, Array.from(expanded));
    return expanded;
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

  /**
   * Takes the playing item as the item being edited, unless the editor holds changes to its item's tags or a save
   * hasn't landed. Says whether the item changed. Before the editor first opens, it only notes the item.
   */
  function follow(): boolean {
    if (state.selections.size > 0 || savesInFlight > 0) {
      return false;
    }
    const current = store.current.peek();
    const itemIds = current?.itemId ? [current.itemId] : [];
    if (itemIds.length === state.itemIds.length && itemIds.every((id, index) => id === state.itemIds[index])) {
      return false;
    }
    const change = { itemIds, itemName: current?.displayName || "" };
    if (view.peek()) {
      update(change);
    } else {
      state = { ...state, ...change };
    }
    return true;
  }

  /**
   * Loads the tags of the item being edited; only the latest load is taken. Nothing loads while the server fails the
   * compatibility check or runs without a library.
   */
  async function loadModel(): Promise<void> {
    if (store.heldBack.peek()) {
      return;
    }
    const load = ++loads;
    const loaded = (await api.postJson("/api/tag-editor/model", { itemIds: state.itemIds.slice() })) as TagEditorModel | null;
    const model = loaded || { categories: [], tags: [], items: [] };
    options.tagCatalog?.take(loaded);
    if (load === loads) {
      update({ model, order: state.order.length > 0 ? state.order : initialCategoryOrder(model) });
    }
  }

  /**
   * Loads the tags again, unless a save is on its way, which loads them once it lands, so a reply can't undo it. A
   * failure shows in the in-app notice as `failure`, with the server's reason when it gives one, except a 401, whose
   * pairing prompt is the thing to act on.
   */
  function reload(failure: string): void {
    if (savesInFlight > 0) {
      return;
    }
    loadModel().catch((error) => noticeRequestFailure(dialogs, failure, error));
  }

  /** Follows the playing item, as `follow` does, and while the tab shows, loads its tags. Says whether the item changed. */
  function followAndLoad(): boolean {
    if (!follow()) {
      return false;
    }
    if (isOpen.peek()) {
      reload("Tag editor unavailable");
    }
    return true;
  }

  /** Clears Auto Tag's scan, so an Apply sent from it no longer puts its rows back. */
  function clearScan(): void {
    scans += 1;
    update({ autoTag: emptyAutoTag(state.autoTag.scanFull, state.autoTag.viewAll) });
  }

  /** A save or Auto Tag apply landed: the editor follows the playing item, and while it shows, loads the tags again. */
  function saveLanded(): void {
    savesInFlight -= 1;
    follow();
    if (isOpen.peek()) {
      reload("Tag load failed");
    }
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
   * Renames or removes a renamed or deleted tag in the presets, in place, then in the applied filter, which is replaced,
   * so the Filters line and the device's memory follow and see it still as its preset's own, and in the library's
   * filter and the Filter tab's unsaved changes. The preset dropdown is rebuilt.
   */
  function retargetFilters(step: TagSaveStep): void {
    let presetsChanged = false;
    for (const preset of store.presets.peek() || []) {
      const filter = preset?.filterState as { selectedTags?: unknown; excludedTags?: unknown } | undefined;
      if (!filter || !Array.isArray(filter.selectedTags) || !Array.isArray(filter.excludedTags)) {
        continue;
      }
      presetsChanged = retargetTagFilter(filter.selectedTags, filter.excludedTags, step) || presetsChanged;
    }
    const applied = cloneFilterState(store.appliedFilter.peek());
    const filterChanged = retargetTagFilter(applied.selectedTags, applied.excludedTags, step);
    if (filterChanged) {
      store.appliedFilter.value = applied;
    }
    library.session.reviseStoredFilter((selected, excluded) => {
      retargetTagFilter(selected, excluded, step);
    });
    options.filter.reviseTags((selected, excluded) => {
      retargetTagFilter(selected, excluded, step);
    });
    if (filterChanged || presetsChanged) {
      store.syncHeaderPresets();
    }
  }

  /**
   * A tag renamed or deleted, by this page's save or another client: the filters take the change, and a kept Auto Tag
   * scan, which may name the old tag, is cleared, so its Apply can't create the tag again. The editor's held changes
   * take it too, so Save doesn't send the old name back, and while the tab shows the tags load again. Other steps
   * change nothing.
   */
  function retargetTag(step: TagSaveStep): void {
    if (step.kind !== "rename-tag" && step.kind !== "delete-tag") {
      return;
    }
    // A rename that keeps the name only moves the tag to another category, as the server's event treats it. A rename
    // that only changes the case still retargets.
    if (step.kind === "rename-tag" && step.oldName.trim() === step.newName.trim()) {
      return;
    }
    retargetFilters(step);
    if (state.autoTag.hasRun && !state.autoTag.scanning) {
      clearScan();
    }
    const held = retargetHeldTag(state.selections, state.pending, step);
    if (held.selections !== state.selections || held.pending !== state.pending) {
      update(held);
    }
    // A deleted tag's add or remove may have been the last one holding the item.
    if (!followAndLoad() && isOpen.peek()) {
      reload("Tag load failed");
    }
  }

  async function postStep(handle: TagSaveHandle, step: TagSaveStep): Promise<void> {
    const request = tagSaveRequest(step);
    const response = await api.post(request.path, request.body);
    if (!response.ok) {
      throw await refusalError(response);
    }
    if (step.kind === "apply-auto-tag") {
      saves.noteAutoTagResult(handle, autoTagAppliedFromResponse(await response.json().catch(() => null)));
    }
    retargetTag(step);
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

  function savedMessage(): void {
    notifications.notify({ kind: "actions", text: SAVE_SUCCEEDED, key: "tags" });
  }

  /**
   * Sends the save's steps, and says whether the server took them all. A failed save shows its own error in the
   * in-app notice. A landed save says so, even when the library's reload after it fails, which the library reports.
   */
  async function saveInBackground(handle: TagSaveHandle, steps: TagSaveStep[]): Promise<boolean> {
    const result = await runTagEditorSave(steps, {
      post: (step) => postStep(handle, step),
      label: (step) => tagSaveRequest(step).label
    });
    if (!result.ok) {
      // A step the server confirmed through its event before refusing a later one is not rolled back.
      if (failSave(handle, result.accepted)) {
        // A 401 has no failure to show: the pairing prompt shows instead.
        if (result.failure) {
          void dialogs.notice(result.failure.text, result.failure.logText);
        }
      } else {
        savedMessage();
      }
      return false;
    }
    projectLoadedTagItems();
    if (saves.succeed(handle, reloadOnLand()).reload) {
      try {
        await library.session.reloadLoaded();
      } catch {
        // The library reports its own failed load; the save has landed either way.
      }
    }
    savedMessage();
    return true;
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
        retarget: retargetTag,
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

  // A tab that showed while the server had no library loaded nothing, so while it shows it loads once the server is
  // ready, keeping its changes.
  connection.on("serverReady", () => {
    if (isOpen.peek()) {
      reload("Tag editor unavailable");
    }
  });

  /**
   * Whether a load for a server event can go: the tab shows without changes, no save is on its way, which loads once it
   * lands, and the server isn't held back.
   */
  function eventLoadCanGo(): boolean {
    return isOpen.peek() && !hasChanges(state) && savesInFlight === 0 && !store.heldBack.peek();
  }

  /**
   * Loads the tags again for a server event. A failure keeps what the tab shows and says nothing, sending one line to
   * the log naming the error's status or kind, never a name; a 401 has sent its own line and asked for pairing.
   */
  async function loadForEvents(): Promise<void> {
    if (!eventLoadCanGo()) {
      return;
    }
    try {
      await loadModel();
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) {
        void api.relayLog("warn", eventLoadFailedLine("tags", error));
      }
    }
  }

  /** Loads the tags again once for a burst of server events. */
  const eventLoads = createCoalescedRefresh(loadForEvents);

  function requestEventLoad(): void {
    if (eventLoadCanGo()) {
      void eventLoads.request();
    }
  }

  // A catalog change, this page's own save's or another device's, can leave the tab's tags out of date. While it shows
  // without changes it loads again; with changes it keeps them, and a hidden tab loads when it next shows. A rename or
  // delete of a tag no file has comes only as a catalog change, without the old name, so a kept scan that names a tag
  // no longer in the catalog is cleared, and its Apply can't create the tag again.
  connection.on("tagCatalogChanged", (payload) => {
    requestEventLoad();
    const tags: unknown = payload?.tags ?? payload?.Tags;
    if (!Array.isArray(tags) || !state.autoTag.hasRun || state.autoTag.scanning) {
      return;
    }
    if (autoTagRowsLeftCatalog(state.autoTag.rows, tags.map((tag) => tag?.name ?? tag?.Name))) {
      clearScan();
    }
  });

  // Events missed can leave the tab's tags out of date, so it loads again as for a catalog change.
  connection.on("resyncRequired", requestEventLoad);

  // The editor follows the playing item, and the line naming a held item follows it too.
  store.current.subscribe(() => {
    if (!followAndLoad() && view.peek()) {
      update({});
    }
  });

  function findCategory(categoryId: string): TagCategoryRow | undefined {
    return view.peek()?.categories?.find((category) => category.id === categoryId);
  }

  /** Deletes a tag, with any change held for it, as part of `change`. */
  function deleteTag(tagName: string, change: Partial<TagEditorState>): void {
    const key = normalizeTagKey(tagName);
    const upsertTags = new Map(state.pending.upsertTags);
    upsertTags.delete(key);
    const renameTags = new Map(state.pending.renameTags);
    renameTags.delete(key);
    const selections = new Map(state.selections);
    selections.delete(key);
    update({
      ...change,
      pending: { ...state.pending, deleteTags: new Map(state.pending.deleteTags).set(key, { name: tagName }), upsertTags, renameTags },
      selections
    });
    // A deleted tag's add or remove may have been the last one holding the item.
    followAndLoad();
  }

  /**
   * Deletes a category, its tags becoming Uncategorized, as part of `change`. Uncategorized expands when tags move into
   * it, so the change is visible.
   */
  function deleteCategory(categoryId: string, change: Partial<TagEditorState>): void {
    const upsertCategories = new Map(state.pending.upsertCategories);
    upsertCategories.delete(categoryId);
    const hadTags = (findCategory(categoryId)?.chips.length ?? 0) > 0;
    update({
      ...change,
      ...(hadTags ? { expanded: withExpanded([UNCATEGORIZED_CATEGORY_ID], true) } : {}),
      pending: { ...state.pending, deleteCategoryIds: new Set(state.pending.deleteCategoryIds).add(categoryId), upsertCategories },
      order: state.order.filter((id) => id !== categoryId)
    });
  }

  const editor: TagEditor = {
    isOpen,
    autoTagOpen,
    view,

    open() {
      follow();
      // A moved category keeps its place; otherwise the categories take the order of the tags about to load.
      update({ order: state.orderChanged ? state.order : [] });
      isOpen.value = true;
      reload("Tag editor unavailable");
    },

    close() {
      if (!isOpen.peek()) {
        return;
      }
      update(dialogsClosed());
      isOpen.value = false;
    },

    discardChanges() {
      update({
        ...cleared(),
        ...dialogsClosed(),
        order: []
      });
      follow();
      reload("Tag load failed");
    },

    save() {
      if (!hasChanges(state) || store.heldBack.peek()) {
        return;
      }
      const steps = planTagEdits({
        model: state.model,
        pending: state.pending,
        order: state.order,
        selections: state.selections,
        itemIds: state.itemIds.slice()
      });
      if (steps.length === 0) {
        // The changes cancel out, so they are dropped, and their dots go.
        update(cleared());
        followAndLoad();
        void dialogs.notice("No tag changes to save.");
        return;
      }
      const loaded = loadedTagItems();
      const handle = saves.begin(loaded, steps, false, tagFilterCanChangeMembership());
      writeLoadedTagItems(loaded);
      // The editor shows the changes as saved until the tags load again once the save lands. A load sent before now
      // answers with the tags as they were, so its reply is dropped.
      const before = state.model;
      const model = savedTagModel(state.model, state.pending, state.order, state.selections);
      loads += 1;
      update({ model, order: initialCategoryOrder(model), ...cleared() });
      savesInFlight += 1;
      void saveInBackground(handle, steps).then((saved) => {
        // A refused save shows the tags as they were, unless they have loaded since, in case they can't load again.
        if (!saved && state.model === model) {
          update({ model: before, order: before ? initialCategoryOrder(before) : [] });
        }
        saveLanded();
      });
    },

    toggleCategory(categoryId) {
      update({ expanded: withExpanded([categoryId], !state.expanded.has(categoryId)) });
    },

    moveCategory(categoryId, to) {
      const order = moveCategoryInOrder(state.order, categoryId, to);
      if (order) {
        update({ order, orderChanged: true });
      }
    },

    addCategory() {
      update({ newCategory: { name: "" } });
    },

    typeNewCategoryName(text) {
      if (state.newCategory) {
        update({ newCategory: { name: text } });
      }
    },

    saveNewCategory() {
      if (!state.newCategory || view.peek()?.newCategoryProblem) {
        return;
      }
      const id = newId();
      const name = state.newCategory.name.trim();
      const upsertCategories = new Map(state.pending.upsertCategories).set(id, { id, name, sortOrder: state.order.length });
      update({ pending: { ...state.pending, upsertCategories }, order: addCategoryToOrder(state.order, id), newCategory: null });
    },

    cancelNewCategory() {
      update({ newCategory: null });
    },

    editCategory(categoryId) {
      const category = findCategory(categoryId);
      if (!category || category.uncategorized) {
        return;
      }
      update({ categoryEdit: { categoryId, name: category.name.trim() } });
    },

    typeCategoryName(text) {
      if (state.categoryEdit) {
        update({ categoryEdit: { ...state.categoryEdit, name: text } });
      }
    },

    saveCategoryEdit() {
      const edit = state.categoryEdit;
      if (!edit || view.peek()?.categoryEditProblem) {
        return;
      }
      const category = findCategory(edit.categoryId);
      const name = edit.name.trim();
      if (!category || name === category.name.trim()) {
        update({ categoryEdit: null });
        return;
      }
      const sortOrder = Math.max(0, state.order.indexOf(edit.categoryId));
      const upsertCategories = new Map(state.pending.upsertCategories).set(edit.categoryId, { id: edit.categoryId, name, sortOrder });
      update({ pending: { ...state.pending, upsertCategories }, categoryEdit: null });
    },

    cancelCategoryEdit() {
      update({ categoryEdit: null });
    },

    async deleteEditedCategory() {
      const category = state.categoryEdit ? findCategory(state.categoryEdit.categoryId) : undefined;
      if (!category || category.uncategorized) {
        return;
      }
      const message = `Delete category "${category.name || "Category"}"? Tags will become Uncategorized.`;
      if (!(await dialogs.confirm({ message, confirmLabel: "Delete", danger: true }))) {
        return;
      }
      // The dialog may have closed while it asked.
      if (state.categoryEdit?.categoryId === category.id) {
        deleteCategory(category.id, { categoryEdit: null });
      }
    },

    toggleTag(tagName, action) {
      update({ selections: toggleTagSelection(state.selections, tagName, action) });
      // Undoing the last add or remove ends the hold on the item.
      followAndLoad();
    },

    typeNewTag(text) {
      update({ newTagName: text });
    },

    chooseNewTagCategory(categoryId) {
      update({ newTagCategoryId: categoryId });
    },

    addTag() {
      const current = view.peek();
      if (!current || current.addTagDisabled) {
        return null;
      }
      const name = state.newTagName.trim();
      const key = normalizeTagKey(name);
      const categoryId = state.newTagCategoryId || UNCATEGORIZED_CATEGORY_ID;
      const deleteTags = new Map(state.pending.deleteTags);
      deleteTags.delete(key);
      const upsertTags = new Map(state.pending.upsertTags).set(key, { name, categoryId });
      const expanded = state.expanded.has(categoryId) ? state.expanded : withExpanded([categoryId], true);
      update({ pending: { ...state.pending, deleteTags, upsertTags }, expanded, newTagName: "" });
      return name;
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
      if (editTagNameProblem(edit.name)) {
        return;
      }
      const name = edit.name.trim();
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
      // The category a tag moves into expands, so the change is visible.
      const expanded = categoryChanged && !state.expanded.has(categoryId) ? withExpanded([categoryId], true) : state.expanded;
      update({ pending: { ...state.pending, deleteTags, renameTags }, expanded, editing: false });
    },

    cancelEdit() {
      update({ editing: false });
    },

    async deleteEditedTag() {
      const edit = state.edit;
      if (!edit || !state.editing) {
        return;
      }
      if (!(await dialogs.confirm({ message: `Delete tag "${edit.oldName}"?`, confirmLabel: "Delete", danger: true }))) {
        return;
      }
      // The dialog may have closed while it asked.
      if (state.editing) {
        deleteTag(edit.oldName, { editing: false });
      }
    },

    openAutoTag() {
      autoTagOpen.value = true;
    },

    closeAutoTag() {
      if (!state.autoTag.scanning) {
        autoTagOpen.value = false;
      }
    },

    cancelAutoTag() {
      if (state.autoTag.scanning) {
        return;
      }
      clearScan();
      autoTagOpen.value = false;
    },

    applyAutoTag() {
      const autoTag = state.autoTag;
      if (autoTag.scanning || !autoTagApplyPending(autoTag.rows, autoTag.hasRun) || store.heldBack.peek()) {
        return;
      }
      const steps = planAutoTagApply(autoTagAssignments(autoTag.rows));
      if (steps.length === 0) {
        return;
      }
      const loaded = loadedTagItems();
      const handle = saves.begin(loaded, steps, false, tagFilterCanChangeMembership());
      writeLoadedTagItems(loaded);
      const sent = autoTag.rows;
      const scan = scans;
      const applied = autoTagRowsAfterApply(sent, autoTag.viewAll);
      update({ autoTag: { ...autoTag, rows: applied, status: autoTagSummary(applied, autoTag.viewAll) } });
      savesInFlight += 1;
      void saveInBackground(handle, steps).then((saved) => {
        // Unless a new scan has replaced them, a refused apply shows the files it sent as without their tag again.
        if (!saved && scans === scan) {
          const rows = autoTagRowsAfterRefusal(state.autoTag.rows, sent);
          update({ autoTag: { ...state.autoTag, rows, status: autoTagSummary(rows, state.autoTag.viewAll) } });
        }
        saveLanded();
      });
    },

    setScanFullLibrary(checked) {
      saveScanFull(checked);
      update({ autoTag: { ...state.autoTag, scanFull: checked } });
    },

    setViewAll(checked) {
      updateRows(collapseEmptyAutoTagRows(state.autoTag.rows, checked), { viewAll: checked });
    },

    selectAll() {
      updateRows(selectAllAutoTagFiles(state.autoTag.rows, true));
    },

    deselectAll() {
      updateRows(selectAllAutoTagFiles(state.autoTag.rows, false));
    },

    async scan() {
      if (state.autoTag.scanning || store.heldBack.peek()) {
        return;
      }
      update({ autoTag: { ...state.autoTag, scanning: true, status: AUTO_TAG_SCANNING } });
      let rows: AutoTagRow[];
      try {
        rows = autoTagRowsFromScan(await api.postJson("/api/autotag/scan", createAutoTagScanRequest(state.autoTag.scanFull)));
      } catch (error) {
        // A failed scan shows its failure in place, and relays it, with the results as before any scan and nothing to
        // apply. A 401 shows nothing there, since the pairing prompt, which the request has asked for, is the only thing
        // to show.
        scans += 1;
        let status = "";
        if (!(error instanceof UnauthorizedError)) {
          const failure = requestFailure("Scan failed", error);
          status = failure.text;
          store.relayStatus(failure.logText);
        }
        update({ autoTag: { ...state.autoTag, rows: [], hasRun: false, scanning: false, status } });
        return;
      }
      scans += 1;
      // The scan's summary replaces "Scanning…", even when every match already has its tag and no row shows.
      update({ autoTag: { ...state.autoTag, rows, hasRun: true, scanning: false, status: autoTagSummary(rows, state.autoTag.viewAll) } });
    },

    toggleRowExpanded(rowId) {
      updateRows(state.autoTag.rows.map((row) => (row.rowId === rowId ? { ...row, expanded: !row.expanded } : row)));
    },

    checkRow(rowId, checked) {
      updateRows(state.autoTag.rows.map((row) => (row.rowId === rowId ? selectRowFiles(row, checked) : row)));
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
