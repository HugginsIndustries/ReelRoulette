import { batch, signal, type ReadonlySignal } from "@preact/signals";
import type { Dialogs } from "../dialogs/dialogs";
import type { Library } from "../library/library";
import type { PanelHost } from "../panel/panelHost";
import { moveEntry } from "../reorder/reorder";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { DeviceStore } from "../state/deviceStore";
import type { ServerConnection } from "../state/serverConnection";
import {
  actionBlock,
  createFieldReveal,
  isFlagged,
  type ActionBlock,
  type FieldProblem,
  type FieldReveal
} from "../validation/fieldValidation";
import {
  FILTER_ACTION_BESIDE,
  FILTER_ACTION_FIELDS,
  FILTER_FIELD_SECTION,
  editPresetNameProblem,
  filterFieldProblems,
  filterWithGeneralDraft,
  generalDraftFromFilter,
  generalDurationsChanged,
  namesEqualIgnoringCase,
  presetRowsFromApi,
  toggleFilterTag,
  type FilterAction,
  type FilterField,
  type FilterSource,
  type FilterTagModel,
  type GeneralDraft,
  type GeneralField,
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

const EXPANDED_CATEGORIES_KEY = "filter.expandedTagCategories";

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
  /** A copy of the preset dropdown's None hold, which a preset chosen in the dialog ends. */
  holdNone: boolean;
  /** The tag categories expanded in the Tags section, which this device remembers; every other one is collapsed. */
  expanded: ReadonlySet<string>;
  newPresetName: string;
  /** Edit Preset: the preset it edits, by index, and the name typed in it, or null while it is closed. */
  presetEdit: { index: number; name: string } | null;
}

/** What the dialog shows. Each change replaces it. */
export interface FilterDialogView extends FilterDialogState {
  heading: string;
  /** Apply shows a star while there is something to apply. */
  pending: boolean;
  /** The applied filter, which the unsaved-changes dots compare the working filter against. */
  applied: FilterState;
  /**
   * The tab holds unsaved changes: a working filter or a duration still being typed that differs from the applied
   * filter, as after Clear all, or a changed preset list. Its tab and the panel button show a dot, and it keeps them
   * when it shows again.
   */
  unsaved: boolean;
  /** Each field's problem, or null while its value is valid. */
  problems: Record<FilterField, FieldProblem | null>;
  /** Whether each field shows its problem. */
  flagged: Record<FilterField, boolean>;
  /**
   * Whether each action is disabled, or the first General field that holds it. The new preset name sits beside Add
   * Preset, so it disables it rather than holding it.
   */
  actions: Record<FilterAction, ActionBlock<GeneralField>>;
  /** The problem of the name typed in Edit Preset, or null while it is valid or closed. Any problem disables Save. */
  presetEditProblem: FieldProblem | null;
  presetEditFlagged: boolean;
}

/**
 * The Filter tab: a working copy of the applied filter and the saved presets, edited on the General, Tags, and
 * Presets sections, which Apply makes the applied filter and saves. The panel shows and hides the tab, and the working
 * copy and its section stay while it is hidden, until Apply, Cancel, or a preset picked in the Library tab.
 */
export interface FilterDialog {
  /** Whether the Filter tab shows. */
  readonly isOpen: ReadonlySignal<boolean>;
  /** The tab shown, or null before the dialog first opens. */
  readonly tab: ReadonlySignal<FilterDialogTab | null>;
  /** The working copy, or null before the dialog first opens. It stays while the dialog is closed. */
  readonly view: ReadonlySignal<FilterDialogView | null>;
  /** Asks a field to scroll into view and take focus, when a held action moves to it. */
  readonly reveal: FieldReveal<FilterField>;

  /**
   * The tab shows, on the section it was left on, General the first time. Without unsaved changes it starts over from
   * the applied filter and the saved presets. It then loads the sources, tags, and presets, keeping the working copy,
   * as Refresh does. Nothing loads while the server fails the compatibility check.
   */
  open(): Promise<void>;
  /** The tab hides without applying anything, keeping its changes. */
  close(): void;
  showTab(tab: FilterDialogTab): void;
  /**
   * Loads the sources, tags, and presets again, keeping the working filter, and the preset list while it has
   * changes Apply hasn't saved. Before they have loaded once, it loads them as showing the tab does, which it doesn't
   * while the server fails the compatibility check.
   */
  refresh(): Promise<void>;
  /**
   * Saves a changed preset list, applies the working filter, closes the panel as the overlay, and starts the library
   * over. While a field it uses is not valid, it moves to that field instead. A save that fails keeps the tab as it is
   * and applies nothing.
   */
  apply(): Promise<void>;
  /** Puts back the applied filter and the saved presets, and closes the panel as the overlay. */
  cancel(): void;
  /** Goes back to the default filter and the saved presets, which Apply then applies. */
  clearAll(): void;
  /** Takes General tab fields the user changed. An empty duration means no limit. */
  changeGeneral(change: Partial<Omit<GeneralDraft, "sourceChecked">>): void;
  checkSource(index: number, checked: boolean): void;
  /** Takes a duration's text while it is typed. The working filter takes it when the field changes. */
  typeDuration(which: "min" | "max", text: string): void;
  toggleTag(name: string, action: TagChipAction): void;
  /** True combines categories with AND, false with OR. */
  setGlobalMatch(and: boolean): void;
  /** Sets a category's match mode. The Uncategorized row's category id is empty. */
  setLocalMatch(categoryId: string, mode: TagMatchMode): void;
  /** Expands or collapses a tag category, which this device remembers. */
  toggleCategory(collapseKey: string): void;
  /** Loads a preset's filter by name. An empty name chooses None, which keeps the working filter. */
  choosePreset(name: string): void;
  /** Saves the working filter into the chosen preset, until Apply saves the list. Held like Apply. */
  updatePreset(): void;
  typeNewPresetName(text: string): void;
  /**
   * Adds the working filter as the last preset, with the typed name, until Apply saves the list, and says whether it
   * did. Disabled while the name is empty or taken, and held like Apply.
   */
  addPreset(): boolean;
  /** Moves the preset at `from` to `to`, until Apply saves the list. */
  movePreset(from: number, to: number): void;
  /** Opens Edit Preset on a preset, with its name. */
  editPreset(index: number): void;
  /** Takes the name typed in Edit Preset. */
  typePresetName(text: string): void;
  /**
   * Renames the preset to the typed name, until Apply saves the list, and closes Edit Preset. Does nothing while the
   * name is empty or another preset's. An unchanged name just closes it.
   */
  savePresetEdit(): void;
  /** Closes Edit Preset without a change. */
  cancelPresetEdit(): void;
  /**
   * Asks first, then deletes the preset Edit Preset is on, until Apply saves the list, and closes it. Cancel keeps it
   * open with the typed name.
   */
  deleteEditedPreset(): Promise<void>;
  /**
   * A tag was renamed or deleted: `revise` changes the tag lists of the working copy, the filter it started from, and
   * the preset list, which may hold changes Apply hasn't made, so Apply doesn't put the old name back.
   */
  reviseTags(revise: (selected: string[], excluded: string[]) => void): void;
}

export interface FilterDialogOptions {
  store: AppStore;
  api: AppApi;
  connection: Pick<ServerConnection, "loadPresets">;
  library: Pick<Library, "commitQuery">;
  /** Apply and Cancel close the panel as the overlay; beside the player it stays open. */
  panel: Pick<PanelHost, "closeIfOverlay">;
  /** This device's memory, for the tag categories expanded. */
  device: DeviceStore;
  /** The in-app dialogs, for the confirmations. */
  dialogs: Pick<Dialogs, "confirm">;
}

function errorText(error: unknown): string {
  return (error as { message?: string } | null)?.message || String(error);
}

export function createFilterDialog(options: FilterDialogOptions): FilterDialog {
  const { store, api, connection, library, panel, device, dialogs } = options;

  const isOpen = signal(false);
  const tab = signal<FilterDialogTab | null>(null);
  const view = signal<FilterDialogView | null>(null);
  const reveal = createFieldReveal<FilterField>();

  /**
   * Works out the heading, Apply's star, and the fields' problems. The dialog's preset follows the working filter:
   * a saved preset with the same filter, None for the default filter, or else the last preset with a star.
   */
  function settled(state: FilterDialogState): FilterDialogView {
    const holdNone = state.holdNone && filterStatesEqualForPresetMatch(state.working, createDefaultFilterState());
    const presetName = holdNone ? null : dialogPresetBase(state.working, state.presets, state.presetName);
    const problems = filterFieldProblems(state.general, state.newPresetName, state.presets);
    const edit = state.presetEdit;
    const presetEditProblem = edit ? editPresetNameProblem(edit.name, state.presets, edit.index) : null;
    const applied = store.appliedFilter.peek();
    return {
      ...state,
      holdNone,
      presetName,
      heading: presetHeading(presetAnchorForDisplay(state.working, state.presets, presetName, holdNone)),
      pending: filterDialogHasPendingChanges(state.working, state.original, state.presetsChanged),
      applied,
      // A duration still being typed isn't in the working filter yet, so its text counts as an unsaved change too.
      unsaved: filterDialogHasPendingChanges(state.working, applied, state.presetsChanged) || generalDurationsChanged(state.general, applied),
      problems,
      flagged: {
        flagModes: isFlagged(problems.flagModes),
        minDuration: isFlagged(problems.minDuration),
        maxDuration: isFlagged(problems.maxDuration),
        newPresetName: isFlagged(problems.newPresetName)
      },
      actions: {
        apply: blockOf("apply", problems),
        addPreset: blockOf("addPreset", problems),
        updatePreset: blockOf("updatePreset", problems)
      },
      presetEditProblem,
      presetEditFlagged: isFlagged(presetEditProblem)
    };
  }

  function blockOf(action: FilterAction, problems: Record<FilterField, FieldProblem | null>): ActionBlock<GeneralField> {
    const block = actionBlock(FILTER_ACTION_FIELDS[action], problems, FILTER_ACTION_BESIDE[action]);
    // A field beside the action disables it, so only a General field can hold it.
    return { disabled: block.disabled, heldBy: block.heldBy as GeneralField | null };
  }

  /**
   * Says whether the action can't proceed. A disabled action does nothing; a held one moves to the first field that
   * holds it, showing its section. Nothing goes to the status line: the field's icon and tooltip say what it expects.
   */
  function blocked(action: FilterAction): boolean {
    const block = view.peek()?.actions[action];
    if (!block) {
      return false;
    }
    if (block.heldBy) {
      tab.value = FILTER_FIELD_SECTION[block.heldBy];
      reveal.reveal(block.heldBy);
    }
    return block.disabled || block.heldBy !== null;
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

  function readExpanded(): Set<string> {
    const isKeyList = (value: unknown): value is string[] => Array.isArray(value) && value.every((key) => typeof key === "string");
    return new Set(device.read(EXPANDED_CATEGORIES_KEY, [] as string[], isKeyList));
  }

  async function loadRemote(): Promise<{ sources: FilterSource[]; tagModel: FilterTagModel | null; presets: PresetRow[] }> {
    const sources = await api.getJson("/api/sources");
    const response = await api.post("/api/tag-editor/model", { itemIds: [] });
    if (!response.ok) {
      throw new Error(`tag-editor model ${response.status}`);
    }
    const tagModel = (await response.json()) as FilterTagModel | null;
    await connection.loadPresets();
    const sourceList: FilterSource[] = Array.isArray(sources) ? sources : [];
    // The Library tab's Filters line counts the sources the Filter tab shows.
    store.sources.value = sourceList;
    return {
      sources: sourceList,
      tagModel,
      presets: presetRowsFromApi(store.presets.peek())
    };
  }

  /** Starts the dialog over from the applied filter and the preset dropdown's preset. */
  function workingFromHeader(): Pick<FilterDialogState, "working" | "original" | "presetName" | "holdNone"> {
    const working = cloneFilterState(store.appliedFilter.peek());
    return {
      working,
      original: cloneFilterState(working),
      presetName: store.activePresetName.peek(),
      holdNone: store.headerExplicitNone.peek()
    };
  }

  /**
   * Takes loaded sources, tags, and presets, keeping the working filter, the General fields as they are, such as a
   * duration still being typed, with only their sources checked again, and the preset list while Apply hasn't saved it.
   */
  function takeRemote(current: FilterDialogView, remote: Awaited<ReturnType<typeof loadRemote>>): void {
    update({
      sources: remote.sources,
      tagModel: remote.tagModel,
      presets: current.presetsChanged ? current.presets : remote.presets,
      general: { ...current.general, sourceChecked: generalDraftFromFilter(current.working, remote.sources).sourceChecked }
    });
  }

  /**
   * Loads the sources, tags, and presets. The first time, it starts the working copy from the applied filter, on
   * General; after that it keeps the working copy and only takes what loaded, as Refresh does. Says whether it loaded;
   * a failure goes to the status line with `failure` before the reason. Nothing loads while the server fails the
   * compatibility check.
   */
  async function start(failure: string): Promise<boolean> {
    if (store.compatibilityBlocked.peek()) {
      return false;
    }
    let remote: Awaited<ReturnType<typeof loadRemote>>;
    try {
      remote = await loadRemote();
    } catch (error) {
      store.setStatus(`${failure}: ${errorText(error)}`);
      return false;
    }
    const current = view.peek();
    if (current) {
      takeRemote(current, remote);
      return true;
    }
    const begin = workingFromHeader();
    view.value = settled({
      ...begin,
      general: generalDraftFromFilter(begin.working, remote.sources),
      sources: remote.sources,
      tagModel: remote.tagModel,
      presets: remote.presets,
      presetsChanged: false,
      expanded: readExpanded(),
      newPresetName: "",
      presetEdit: null
    });
    if (tab.peek() === null) {
      tab.value = "general";
    }
    return true;
  }

  /** Puts back the applied filter and the saved presets, with the sources and tags already loaded. */
  function restart(): void {
    const current = view.peek();
    if (!current) {
      return;
    }
    const begin = workingFromHeader();
    update({
      ...begin,
      general: generalDraftFromFilter(begin.working, current.sources),
      presets: presetRowsFromApi(store.presets.peek()),
      presetsChanged: false,
      newPresetName: "",
      presetEdit: null
    });
  }

  const dialog: FilterDialog = {
    isOpen,
    tab,
    view,
    reveal,

    // Without unsaved changes it starts over at once, so a filter applied elsewhere shows while it loads again.
    async open() {
      isOpen.value = true;
      if (view.peek() && !view.peek()!.unsaved) {
        restart();
      }
      await start("Filter load failed");
    },

    close() {
      isOpen.value = false;
      update({ presetEdit: null });
    },

    showTab(next) {
      tab.value = next;
    },

    async refresh() {
      if (!view.peek()) {
        if (await start("Filter refresh failed")) {
          store.setStatus("Filter data refreshed.");
        }
        return;
      }
      try {
        const remote = await loadRemote();
        const current = view.peek();
        if (current) {
          takeRemote(current, remote);
        }
        store.setStatus("Filter data refreshed.");
      } catch (error) {
        store.setStatus(`Filter refresh failed: ${errorText(error)}`);
      }
    },

    async apply() {
      const before = view.peek();
      if (!before || blocked("apply")) {
        return;
      }
      update({ working: readGeneral(before) });
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
      // One batch, so the device's memory takes the applied filter and its preset once.
      batch(() => {
        store.headerExplicitNone.value = current.holdNone && appliedDefault;
        store.activePresetName.value = store.headerExplicitNone.peek()
          ? null
          : dialogPresetBase(working, current.presets, current.presetName);
        store.appliedFilter.value = cloneFilterState(working);
      });
      update({ working, original: cloneFilterState(working), presetName: store.activePresetName.peek() });
      await connection.loadPresets();
      void panel.closeIfOverlay();
      store.setStatus("Filters applied.");
      await library.commitQuery();
    },

    cancel() {
      restart();
      void panel.closeIfOverlay();
    },

    clearAll() {
      const current = view.peek();
      if (!current) {
        return;
      }
      const working = createDefaultFilterState();
      // The filter it started from stays, so Apply's star shows while the applied filter isn't the default.
      update({
        working,
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
      const expanded = new Set(current.expanded);
      if (!expanded.delete(collapseKey)) {
        expanded.add(collapseKey);
      }
      device.write(EXPANDED_CATEGORIES_KEY, Array.from(expanded));
      update({ expanded });
    },

    reviseTags(revise) {
      const current = view.peek();
      if (!current) {
        return;
      }
      const revised = (filter: FilterState): FilterState => {
        const next = cloneFilterState(filter);
        revise(next.selectedTags, next.excludedTags);
        return next;
      };
      update({
        working: revised(current.working),
        original: revised(current.original),
        presets: current.presets.map((preset) => ({ ...preset, filterState: revised(preset.filterState) }))
      });
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
      if (!current || blocked("updatePreset")) {
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
      if (!current || blocked("addPreset")) {
        return false;
      }
      const name = current.newPresetName.trim();
      const working = readGeneral(current);
      update({
        working,
        presets: [...current.presets, { name, filterState: cloneFilterState(working) }],
        presetsChanged: true,
        newPresetName: ""
      });
      tab.value = "presets";
      return true;
    },

    movePreset(from, to) {
      const current = view.peek();
      const count = current?.presets.length ?? 0;
      if (!current || from === to || from < 0 || from >= count || to < 0 || to >= count) {
        return;
      }
      update({ presets: moveEntry(current.presets, from, to), presetsChanged: true });
    },

    editPreset(index) {
      const row = view.peek()?.presets[index];
      if (row) {
        update({ presetEdit: { index, name: row.name } });
      }
    },

    typePresetName(text) {
      const edit = view.peek()?.presetEdit;
      if (edit) {
        update({ presetEdit: { ...edit, name: text } });
      }
    },

    savePresetEdit() {
      const current = view.peek();
      const edit = current?.presetEdit;
      const row = edit ? current.presets[edit.index] : undefined;
      if (!current || !edit || !row || current.presetEditProblem) {
        return;
      }
      const name = edit.name.trim();
      if (name === row.name) {
        update({ presetEdit: null });
        return;
      }
      const presets = current.presets.slice();
      presets[edit.index] = { ...row, name };
      const chosen = current.presetName && namesEqualIgnoringCase(current.presetName, row.name);
      update({ presets, presetsChanged: true, presetName: chosen ? name : current.presetName, presetEdit: null });
    },

    cancelPresetEdit() {
      update({ presetEdit: null });
    },

    async deleteEditedPreset() {
      const before = view.peek();
      const edit = before?.presetEdit;
      const removed = edit ? before.presets[edit.index] : undefined;
      if (!edit || !removed) {
        return;
      }
      const confirmed = await dialogs.confirm({ message: `Delete preset "${removed.name}"?`, confirmLabel: "Delete", danger: true });
      const current = view.peek();
      if (!confirmed || !current?.presetEdit) {
        return;
      }
      const chosen = current.presetName && namesEqualIgnoringCase(current.presetName, removed.name);
      update({
        presets: current.presets.filter((_, rowIndex) => rowIndex !== edit.index),
        presetsChanged: true,
        presetName: chosen ? null : current.presetName,
        presetEdit: null
      });
    }
  };

  // A preset picked in the Library tab's preset dropdown starts the tab over from the new filter and the saved presets,
  // dropping its unsaved changes, whether or not it shows.
  store.on("headerFilterChanged", restart);

  return dialog;
}
