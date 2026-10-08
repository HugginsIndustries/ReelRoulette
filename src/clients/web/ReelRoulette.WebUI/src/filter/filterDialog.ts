import { signal, type ReadonlySignal } from "@preact/signals";
import type { Library } from "../library/library";
import type { AppApi } from "../state/appApi";
import type { AppStore, StorageLike } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import {
  filterTagCategories,
  filterWithGeneralDraft,
  generalDraftDurationError,
  generalDraftFromFilter,
  namesEqualIgnoringCase,
  presetRowsFromApi,
  toggleFilterTag,
  type FilterSource,
  type FilterTagModel,
  type GeneralDraft,
  type TagChipAction
} from "./filterDialogModel";
import {
  cloneFilterState,
  createDefaultFilterState,
  dialogPresetBase,
  filterDialogHasPendingChanges,
  filterStatesEqualForPresetMatch,
  presetAnchorForDisplay,
  presetHeading,
  presetsToPostBody,
  type FilterState,
  type PresetRow,
  type TagMatchMode
} from "./filterStateModel";

const COLLAPSED_CATEGORIES_KEY = "rr_filterDialogCollapsedCategories";

export type FilterDialogTab = "general" | "tags" | "presets";

/** The dialog's working copy, without what is worked out from it after each change. */
interface FilterDialogState {
  working: FilterState;
  /** The filter the dialog opened with or was cleared to. Apply is pending while the working filter differs. */
  original: FilterState;
  general: GeneralDraft;
  sources: FilterSource[];
  tagModel: FilterTagModel | null;
  presets: PresetRow[];
  /** A preset was added, changed, moved, renamed, or deleted, so Apply saves the list. */
  presetsChanged: boolean;
  /** The preset the dialog's preset list shows, or null for None. */
  presetName: string | null;
  /** A copy of the header's None hold, which a preset chosen in the dialog ends. */
  holdNone: boolean;
  /** The tag categories collapsed on the Tags tab, kept for the browser session. */
  collapsed: ReadonlySet<string>;
  newPresetName: string;
}

/** What the dialog shows. Each change replaces it. */
export interface FilterDialogView extends FilterDialogState {
  heading: string;
  /** Apply shows a star while there is something to apply. */
  pending: boolean;
}

/**
 * The filter dialog: a working copy of the applied filter and the saved presets, edited on the General, Tags, and
 * Presets tabs, which Apply makes the applied filter and saves.
 */
export interface FilterDialog {
  readonly isOpen: ReadonlySignal<boolean>;
  /** The tab shown, or null before the dialog first opens. */
  readonly tab: ReadonlySignal<FilterDialogTab | null>;
  /** The working copy, or null before the dialog first opens. It stays while the dialog is closed. */
  readonly view: ReadonlySignal<FilterDialogView | null>;

  /**
   * Loads the sources, tags, and presets, then shows the dialog on General with the applied filter. Unless the
   * server failed the compatibility check.
   */
  open(): Promise<void>;
  /** Hides the dialog without applying anything. */
  close(): void;
  showTab(tab: FilterDialogTab): void;
  /** Loads the sources, tags, and presets again, keeping the working filter. */
  refresh(): Promise<void>;
  /**
   * Saves a changed preset list, applies the working filter, closes the dialog, and starts the library over.
   * A duration that is not valid, or a save that fails, keeps the dialog open and applies nothing.
   */
  apply(): Promise<void>;
  /** Goes back to the default filter and the saved presets. */
  clearAll(): void;
  /** Takes General tab fields the user changed. Checking No minimum or No maximum clears its duration. */
  changeGeneral(change: Partial<Omit<GeneralDraft, "sourceChecked">>): void;
  checkSource(index: number, checked: boolean): void;
  /** Takes a duration's text while it is typed. The working filter takes it when the field changes. */
  typeDuration(which: "min" | "max", text: string): void;
  toggleTag(name: string, action: TagChipAction): void;
  /** True combines categories with AND, false with OR. */
  setGlobalMatch(and: boolean): void;
  /** Sets a category's match mode. The Uncategorized row's category id is empty. */
  setLocalMatch(categoryId: string, mode: TagMatchMode): void;
  toggleCategory(collapseKey: string): void;
  /** Loads a preset's filter by name. An empty name chooses None, which keeps the working filter. */
  choosePreset(name: string): void;
  /** Saves the working filter into the chosen preset, until Apply saves the list. */
  updatePreset(): void;
  typeNewPresetName(text: string): void;
  /** Adds the working filter as a preset with the typed name, until Apply saves the list. */
  addPreset(): void;
  movePreset(index: number, step: -1 | 1): void;
  /** Asks first. */
  deletePreset(index: number): void;
  /** Asks for the new name. */
  renamePreset(index: number): void;
}

export interface FilterDialogOptions {
  store: AppStore;
  api: AppApi;
  connection: Pick<ServerConnection, "loadPresets">;
  library: Pick<Library, "commitQuery">;
  /** Browser `sessionStorage`, for the collapsed tag categories. */
  storage: StorageLike;
  /** Defaults to `window.confirm`, looked up on each use. */
  confirm?: (message: string) => boolean;
  /** Defaults to `window.prompt`, looked up on each use. */
  prompt?: (message: string, value: string) => string | null;
}

function errorText(error: unknown): string {
  return (error as { message?: string } | null)?.message || String(error);
}

export function createFilterDialog(options: FilterDialogOptions): FilterDialog {
  const { store, api, connection, library, storage } = options;
  const confirm = options.confirm ?? ((message: string) => window.confirm(message));
  const prompt = options.prompt ?? ((message: string, value: string) => window.prompt(message, value));

  const isOpen = signal(false);
  const tab = signal<FilterDialogTab | null>(null);
  const view = signal<FilterDialogView | null>(null);

  /**
   * Works out the heading and Apply's star. The dialog's preset follows the working filter: a saved preset
   * with the same filter, None for the default filter, or else the last preset with a star.
   */
  function settled(state: FilterDialogState): FilterDialogView {
    const holdNone = state.holdNone && filterStatesEqualForPresetMatch(state.working, createDefaultFilterState());
    const presetName = holdNone ? null : dialogPresetBase(state.working, state.presets, state.presetName);
    return {
      ...state,
      holdNone,
      presetName,
      heading: presetHeading(presetAnchorForDisplay(state.working, state.presets, presetName, holdNone)),
      pending: filterDialogHasPendingChanges(state.working, state.original, state.presetsChanged)
    };
  }

  function update(change: Partial<FilterDialogState>): void {
    const current = view.peek();
    if (current) {
      view.value = settled({ ...current, ...change });
    }
  }

  /** The working filter with the General tab read into it. */
  function readGeneral(state: FilterDialogState): FilterState {
    return filterWithGeneralDraft(state.working, state.general, state.sources);
  }

  function readCollapsed(): Set<string> {
    try {
      const raw = storage.getItem(COLLAPSED_CATEGORIES_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? new Set(parsed.map((key) => String(key ?? ""))) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveCollapsed(collapsed: ReadonlySet<string>): void {
    try {
      storage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify(Array.from(collapsed)));
    } catch {
      // Best effort: the categories open expanded next time.
    }
  }

  async function loadRemote(): Promise<{ sources: FilterSource[]; tagModel: FilterTagModel | null; presets: PresetRow[] }> {
    const sources = await api.getJson("/api/sources");
    const response = await api.post("/api/tag-editor/model", { itemIds: [] });
    if (!response.ok) {
      throw new Error(`tag-editor model ${response.status}`);
    }
    const tagModel = (await response.json()) as FilterTagModel | null;
    await connection.loadPresets();
    return {
      sources: Array.isArray(sources) ? sources : [],
      tagModel,
      presets: presetRowsFromApi(store.presets.peek())
    };
  }

  /** Starts the dialog over from the applied filter and the header's preset. */
  function workingFromHeader(): Pick<FilterDialogState, "working" | "original" | "presetName" | "holdNone"> {
    const working = cloneFilterState(store.appliedFilter.peek());
    return {
      working,
      original: cloneFilterState(working),
      presetName: store.activePresetName.peek(),
      holdNone: store.headerExplicitNone.peek()
    };
  }

  const dialog: FilterDialog = {
    isOpen,
    tab,
    view,

    async open() {
      if (store.compatibilityBlocked.peek()) {
        return;
      }
      let remote: Awaited<ReturnType<typeof loadRemote>>;
      try {
        remote = await loadRemote();
      } catch (error) {
        store.setStatus(`Filter dialog load failed: ${errorText(error)}`);
        return;
      }
      const start = workingFromHeader();
      view.value = settled({
        ...start,
        general: generalDraftFromFilter(start.working, remote.sources),
        sources: remote.sources,
        tagModel: remote.tagModel,
        presets: remote.presets,
        presetsChanged: false,
        collapsed: readCollapsed(),
        newPresetName: ""
      });
      tab.value = "general";
      isOpen.value = true;
    },

    close() {
      isOpen.value = false;
    },

    showTab(next) {
      tab.value = next;
    },

    async refresh() {
      try {
        const remote = await loadRemote();
        const current = view.peek();
        if (current) {
          update({
            sources: remote.sources,
            tagModel: remote.tagModel,
            presets: remote.presets,
            general: generalDraftFromFilter(current.working, remote.sources)
          });
        }
        store.setStatus("Filter data refreshed.");
      } catch (error) {
        store.setStatus(`Filter refresh failed: ${errorText(error)}`);
      }
    },

    async apply() {
      const before = view.peek();
      if (!before) {
        return;
      }
      update({ working: readGeneral(before) });
      const error = generalDraftDurationError(before.general);
      if (error) {
        store.setStatus(error);
        tab.value = "general";
        return;
      }
      if (view.peek()!.presetsChanged) {
        try {
          const response = await api.post("/api/presets", presetsToPostBody(view.peek()!.presets));
          if (!response.ok) {
            store.setStatus(`Saving presets failed (${response.status}).`);
            return;
          }
          update({ presetsChanged: false });
          const presets = await api.getJson("/api/presets");
          store.presets.value = Array.isArray(presets) ? presets : [];
          update({ presets: presetRowsFromApi(store.presets.peek()) });
        } catch (saveError) {
          store.setStatus(`Saving presets failed: ${errorText(saveError)}`);
          return;
        }
      }

      const current = view.peek()!;
      const working = readGeneral(current);
      const appliedDefault = filterStatesEqualForPresetMatch(working, createDefaultFilterState());
      store.headerExplicitNone.value = current.holdNone && appliedDefault;
      store.activePresetName.value = store.headerExplicitNone.peek()
        ? null
        : dialogPresetBase(working, current.presets, current.presetName);
      store.appliedFilter.value = cloneFilterState(working);
      update({ working, original: cloneFilterState(working), presetName: store.activePresetName.peek() });
      await connection.loadPresets();
      dialog.close();
      store.setStatus("Filters applied.");
      await library.commitQuery();
    },

    clearAll() {
      const current = view.peek();
      if (!current) {
        return;
      }
      const working = createDefaultFilterState();
      update({
        working,
        original: cloneFilterState(working),
        general: generalDraftFromFilter(working, current.sources),
        presetName: null,
        presets: presetRowsFromApi(store.presets.peek()),
        presetsChanged: false
      });
    },

    changeGeneral(change) {
      const current = view.peek();
      if (!current) {
        return;
      }
      const general = { ...current.general, ...change };
      if (change.noMin) {
        general.minText = "";
      }
      if (change.noMax) {
        general.maxText = "";
      }
      update({ general, working: filterWithGeneralDraft(current.working, general, current.sources) });
    },

    checkSource(index, checked) {
      const current = view.peek();
      if (!current) {
        return;
      }
      const sourceChecked = current.general.sourceChecked.slice();
      sourceChecked[index] = checked;
      const general = { ...current.general, sourceChecked };
      update({ general, working: filterWithGeneralDraft(current.working, general, current.sources) });
    },

    typeDuration(which, text) {
      const current = view.peek();
      if (current) {
        const general = which === "min" ? { ...current.general, minText: text } : { ...current.general, maxText: text };
        update({ general });
      }
    },

    toggleTag(name, action) {
      const current = view.peek();
      if (current) {
        update({ working: toggleFilterTag(current.working, name, action) });
      }
    },

    setGlobalMatch(and) {
      const current = view.peek();
      if (current) {
        update({ working: { ...cloneFilterState(current.working), globalMatchMode: and } });
      }
    },

    setLocalMatch(categoryId, mode) {
      const current = view.peek();
      if (current) {
        const working = cloneFilterState(current.working);
        working.categoryLocalMatchModes = { ...working.categoryLocalMatchModes, [categoryId]: mode };
        update({ working });
      }
    },

    toggleCategory(collapseKey) {
      const current = view.peek();
      if (!current) {
        return;
      }
      const collapsed = new Set(current.collapsed);
      if (collapsed.has(collapseKey)) {
        collapsed.delete(collapseKey);
      } else {
        collapsed.add(collapseKey);
      }
      saveCollapsed(collapsed);
      update({ collapsed });
    },

    choosePreset(name) {
      const current = view.peek();
      if (!current) {
        return;
      }
      if (!name) {
        const stillDefault = filterStatesEqualForPresetMatch(current.working, createDefaultFilterState());
        update({ presetName: null, holdNone: current.holdNone && stillDefault });
        return;
      }
      const preset = current.presets.find((row) => row.name === name);
      if (preset) {
        const working = cloneFilterState(preset.filterState);
        update({ working, presetName: name, holdNone: false, general: generalDraftFromFilter(working, current.sources) });
      }
    },

    updatePreset() {
      const current = view.peek();
      if (!current) {
        return;
      }
      const name = current.presetName;
      if (!name) {
        store.setStatus("Select a preset to update.");
        return;
      }
      const index = current.presets.findIndex((row) => namesEqualIgnoringCase(row.name, name));
      if (index < 0) {
        store.setStatus("Preset not found.");
        return;
      }
      const working = readGeneral(current);
      const presets = current.presets.slice();
      presets[index] = { ...presets[index]!, filterState: cloneFilterState(working) };
      store.setStatus(`Updated preset "${name}" locally — Apply to save.`, "Updated preset locally — Apply to save.");
      update({ working, presets, presetsChanged: true });
    },

    typeNewPresetName(text) {
      update({ newPresetName: text });
    },

    addPreset() {
      const current = view.peek();
      if (!current) {
        return;
      }
      const name = current.newPresetName.trim();
      if (!name) {
        store.setStatus("Enter a preset name.");
        return;
      }
      if (current.presets.some((row) => namesEqualIgnoringCase(row.name, name))) {
        store.setStatus("A preset with that name already exists.");
        return;
      }
      const working = readGeneral(current);
      update({
        working,
        presets: [...current.presets, { name, filterState: cloneFilterState(working) }],
        presetsChanged: true,
        newPresetName: ""
      });
      tab.value = "presets";
    },

    movePreset(index, step) {
      const current = view.peek();
      const target = index + step;
      if (!current || !current.presets[index] || target < 0 || target >= current.presets.length) {
        return;
      }
      const presets = current.presets.slice();
      [presets[index], presets[target]] = [presets[target]!, presets[index]!];
      update({ presets, presetsChanged: true });
    },

    deletePreset(index) {
      const current = view.peek();
      const removed = current?.presets[index];
      if (!current || !removed || !confirm(`Delete preset "${removed.name}"?`)) {
        return;
      }
      const chosen = current.presetName && namesEqualIgnoringCase(current.presetName, removed.name);
      update({
        presets: current.presets.filter((_, rowIndex) => rowIndex !== index),
        presetsChanged: true,
        presetName: chosen ? null : current.presetName
      });
    },

    renamePreset(index) {
      const current = view.peek();
      const row = current?.presets[index];
      if (!current || !row) {
        return;
      }
      const name = String(prompt("Rename preset", row.name) ?? "").trim();
      if (!name) {
        return;
      }
      if (current.presets.some((other, otherIndex) => otherIndex !== index && namesEqualIgnoringCase(other.name, name))) {
        store.setStatus("That name is already in use.");
        return;
      }
      const presets = current.presets.slice();
      presets[index] = { ...row, name };
      const chosen = current.presetName && namesEqualIgnoringCase(current.presetName, row.name);
      update({ presets, presetsChanged: true, presetName: chosen ? name : current.presetName });
    }
  };

  // A header preset picked while the dialog is open starts it over from the new filter.
  store.on("headerFilterChanged", () => {
    const current = view.peek();
    if (!isOpen.peek() || !current) {
      return;
    }
    const start = workingFromHeader();
    update({ ...start, general: generalDraftFromFilter(start.working, current.sources) });
  });

  return dialog;
}
