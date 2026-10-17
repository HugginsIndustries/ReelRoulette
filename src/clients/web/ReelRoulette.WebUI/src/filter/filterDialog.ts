import { batch, signal, type ReadonlySignal } from "@preact/signals";
import { errorText, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Library } from "../library/library";
import type { Notifications } from "../notifications/notifications";
import type { PanelHost } from "../panel/panelHost";
import { moveEntry } from "../reorder/reorder";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { DeviceStore } from "../state/deviceStore";
import type { ServerConnection } from "../state/serverConnection";
import type { TagCatalog } from "../tags/tagCatalog";
import {
  actionBlock,
  createFieldReveal,
  isFlagged,
  type ActionBlock,
  type FieldProblem,
  type FieldReveal
} from "../validation/fieldValidation";
import {
  DEFAULT_FILTER_PRESET_REASON,
  FILTER_ACTION_BESIDE,
  FILTER_ACTION_FIELDS,
  FILTER_FIELD_SECTION,
  NO_CHOSEN_PRESET_REASON,
  editPresetNameProblem,
  filterFieldProblems,
  filterWithGeneralDraft,
  filterWithTypedDurations,
  generalDraftFromFilter,
  namesEqualIgnoringCase,
  presetRowsFromApi,
  sharedFilterReason,
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
  filterDialogHasUnsavedChanges,
  filterStatesEqualForPresetMatch,
  isDefaultFilter,
  presetAnchorForFilter,
  presetHeading,
  presetListsEqual,
  presetsToPostBody,
  withoutAndLocalModes,
  type FilterState,
  type PresetRow,
  type TagMatchMode
} from "./filterStateModel";

const EXPANDED_CATEGORIES_KEY = "filter.expandedTagCategories";

export type FilterDialogTab = "general" | "tags" | "presets";

/** The dialog's working copy, without what is worked out from it after each change. */
interface FilterDialogState {
  working: FilterState;
  general: GeneralDraft;
  sources: FilterSource[];
  tagModel: FilterTagModel | null;
  presets: PresetRow[];
  /**
   * The saved preset list the tab's list compares with: taken when the tab starts over, when Refresh takes the
   * server's list, and after Apply saves it.
   */
  savedPresets: PresetRow[];
  /** The preset the heading names, which Apply makes the active preset, or null for None. */
  headingPreset: string | null;
  /**
   * The preset Choose Preset has chosen, which Load and Update act on, or null for None. A choice lasts while the Presets
   * section stays in view, and Choose Preset starts over on the heading's preset each time the section comes into view,
   * and when the tab starts over or Apply applies.
   */
  chosenPreset: string | null;
  /** The tag categories expanded in the Tags section, which this device remembers; every other one is collapsed. */
  expanded: ReadonlySet<string>;
  newPresetName: string;
  /** Edit Preset: the preset it edits, by index, and the name typed in it, or null while it is closed. */
  presetEdit: { index: number; name: string } | null;
}

/**
 * An action's state, and why it is disabled when no field says why: Add Preset and Update while the filter is the
 * default one or a preset's, which no preset may hold, and Update while Choose Preset is on None.
 */
export interface FilterActionBlock extends ActionBlock<GeneralField> {
  reason?: string;
}

/** What the dialog shows. Each change replaces it. */
export interface FilterDialogView extends FilterDialogState {
  /**
   * The working filter's preset, as the preset dropdown will name it once applied, starred while the filter, with each
   * duration as its field reads, differs from that preset's.
   */
  heading: string;
  /** The preset list differs from the saved one, so Apply saves it. */
  presetsChanged: boolean;
  /** The applied filter, which the unsaved-changes dots compare the working filter against. */
  applied: FilterState;
  /**
   * The tab holds unsaved changes: a working filter, with its durations as their fields read, that differs from the
   * applied filter, as after Clear all, or a preset list that differs from the saved one. Its tab, the panel button, and
   * Apply show a dot, and it keeps them when it shows again. Apply and Discard changes work only while it does.
   */
  unsaved: boolean;
  /**
   * The working filter, with its durations as their fields read, is the default filter by the preset comparison, which
   * disables Clear all filters and the actions that save it as a preset. A duration whose text isn't valid isn't.
   */
  defaultFilter: boolean;
  /**
   * Load would leave the filter as it is: the working filter, with each duration as its field reads, is the chosen
   * preset's, or the default filter for None. Load is then disabled, saying nothing more.
   */
  loadDisabled: boolean;
  /** Each field's problem, or null while its value is valid. */
  problems: Record<FilterField, FieldProblem | null>;
  /** Whether each field shows its problem. */
  flagged: Record<FilterField, boolean>;
  /**
   * Whether each action is disabled, or the first General field that holds it. The new preset name sits beside Add
   * Preset, so it disables it rather than holding it.
   */
  actions: Record<FilterAction, FilterActionBlock>;
  /** The problem of the name typed in Edit Preset, or null while it is valid or closed. Any problem disables Save. */
  presetEditProblem: FieldProblem | null;
  presetEditFlagged: boolean;
}

/**
 * The Filter tab: a working copy of the applied filter and the saved presets, edited on the General, Tags, and
 * Presets sections, which Apply makes the applied filter and saves. The panel shows and hides the tab, and the working
 * copy and its section stay while it is hidden, until Apply, Discard changes, or a preset picked in the Library tab.
 */
export interface FilterDialog {
  /** Whether the Filter tab shows. */
  readonly isOpen: ReadonlySignal<boolean>;
  /** The tab shown, or null before the dialog first opens. */
  readonly tab: ReadonlySignal<FilterDialogTab | null>;
  /** The working copy, or null before the dialog first opens. It stays while the dialog is closed. */
  readonly view: ReadonlySignal<FilterDialogView | null>;
  /** Moves to a field, showing its section and focusing it, when a held action is pressed. */
  readonly reveal: FieldReveal<FilterField>;

  /**
   * The tab shows, on the section it was left on, General the first time. Without unsaved changes it starts over from
   * the applied filter and the saved presets. It then loads the sources, tags, and presets, keeping the working copy,
   * as Refresh does. Nothing loads while the server fails the compatibility check or runs without a library; a tab that
   * shows then loads once the server is ready. Showing on the Presets section starts Choose Preset over.
   */
  open(): Promise<void>;
  /** The tab hides without applying anything, keeping its changes. */
  close(): void;
  /** Shows a section. The Presets section coming into view starts Choose Preset over on the heading's preset. */
  showTab(tab: FilterDialogTab): void;
  /**
   * Loads the sources, tags, and presets again, keeping the working filter, and the preset list while it differs
   * from the saved one. Before they have loaded once, it loads them as showing the tab does. It does nothing
   * while the server fails the compatibility check or runs without a library.
   */
  refresh(): Promise<void>;
  /**
   * Saves a preset list that differs from the saved one, applies the working filter, closes the panel as the overlay,
   * and starts the library over. While a field it uses is not valid, it moves to that field instead. A save that fails
   * keeps the tab as it is and applies nothing.
   */
  apply(): Promise<void>;
  /** Puts back the applied filter and the saved presets at once, without asking, and the tab stays open. */
  discardChanges(): void;
  /** Goes back to the default filter and the saved presets, which Apply then applies. */
  clearAll(): void;
  /** Takes General tab fields the user changed. An empty duration means no limit. */
  changeGeneral(change: Partial<Omit<GeneralDraft, "sourceChecked" | "startSourceIds">>): void;
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
  /** Chooses the preset Load and Update act on, by name, or None for an empty name. It loads nothing. */
  choosePreset(name: string): void;
  /**
   * Loads the chosen preset's filter into the tab, or the default filter for None, keeping the preset list. Apply then
   * applies it.
   */
  loadPreset(): void;
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
   * A tag was renamed or deleted: `revise` changes the tag lists of the working copy, the preset list, which may hold
   * changes Apply hasn't made, so Apply doesn't put the old name back, and its saved copy.
   */
  reviseTags(revise: (selected: string[], excluded: string[]) => void): void;
}

export interface FilterDialogOptions {
  store: AppStore;
  api: AppApi;
  connection: Pick<ServerConnection, "loadPresets" | "on">;
  library: Pick<Library, "commitQuery">;
  /** Apply closes the panel as the overlay; beside the player it stays open. */
  panel: Pick<PanelHost, "closeIfOverlay">;
  /** This device's memory, for the tag categories expanded. */
  device: DeviceStore;
  /** The in-app dialogs, for the confirmations and the notices of what failed. */
  dialogs: Pick<Dialogs, "confirm" | "notice">;
  /** The one-off messages: Apply, Refresh, and Update preset say what they did. */
  notifications: Pick<Notifications, "notify">;
  /** The tag catalog the tabs share, which takes each catalog the dialog loads. */
  tagCatalog?: Pick<TagCatalog, "take">;
}

export function createFilterDialog(options: FilterDialogOptions): FilterDialog {
  const { store, api, connection, library, panel, device, dialogs, notifications } = options;

  const isOpen = signal(false);
  const tab = signal<FilterDialogTab | null>(null);
  const view = signal<FilterDialogView | null>(null);
  const reveal = createFieldReveal<FilterField>();

  /**
   * Works out the heading, the unsaved changes, whether the filter is the default one, and the fields' and actions'
   * problems. The heading's preset follows the working filter: None for the default filter, a saved preset with the
   * same filter, or else the last preset. The heading stars it while the filter, with each duration as its field reads,
   * differs from its filter, as while a duration's text isn't valid. The chosen preset stays where it was put, or None
   * once the list no longer has it.
   */
  function settled(state: FilterDialogState): FilterDialogView {
    const problems = filterFieldProblems(state.general, state.newPresetName, state.presets);
    const edit = state.presetEdit;
    const presetEditProblem = edit ? editPresetNameProblem(edit.name, state.presets, edit.index) : null;
    const applied = store.appliedFilter.peek();
    const presetsChanged = !presetListsEqual(state.presets, state.savedPresets);
    // A duration still being typed isn't in the working filter yet, so it counts as its field reads. Text that isn't
    // valid differs from every filter.
    const typed = filterWithTypedDurations(state.working, state.general);
    // The preset follows the working filter, so text passed through while typing, such as an emptied field, doesn't
    // change it; only the heading's star follows the text.
    const headingPreset = dialogPresetBase(state.working, state.presets, state.headingPreset);
    const chosen = state.presets.find((row) => row.name === state.chosenPreset);
    const defaultFilter = !!typed && isDefaultFilter(typed);
    // No preset may hold the default filter or another preset's, so Add Preset and Update check every preset, the
    // chosen one too, since updating a preset with the filter it has changes nothing.
    const holder = typed ? state.presets.find((row) => filterStatesEqualForPresetMatch(row.filterState, typed)) : undefined;
    const filterReason = defaultFilter ? DEFAULT_FILTER_PRESET_REASON : holder ? sharedFilterReason(holder.name) : null;
    return {
      ...state,
      headingPreset,
      chosenPreset: chosen?.name ?? null,
      heading: presetHeading(presetAnchorForFilter(typed, state.presets, headingPreset)),
      presetsChanged,
      applied,
      unsaved: !typed || filterDialogHasUnsavedChanges(typed, applied, presetsChanged),
      defaultFilter,
      loadDisabled: !!typed && filterStatesEqualForPresetMatch(typed, chosen?.filterState ?? createDefaultFilterState()),
      problems,
      flagged: {
        flagModes: isFlagged(problems.flagModes),
        minDuration: isFlagged(problems.minDuration),
        maxDuration: isFlagged(problems.maxDuration),
        newPresetName: isFlagged(problems.newPresetName)
      },
      actions: {
        apply: blockOf("apply", problems, null),
        addPreset: blockOf("addPreset", problems, filterReason),
        // Update has nothing to write into on None, which it says before the filter's reasons.
        updatePreset: blockOf("updatePreset", problems, chosen ? filterReason : NO_CHOSEN_PRESET_REASON)
      },
      presetEditProblem,
      presetEditFlagged: isFlagged(presetEditProblem)
    };
  }

  /** An action's state. It is disabled, saying why, while `reason` says it can't be used, before any field holds it. */
  function blockOf(action: FilterAction, problems: Record<FilterField, FieldProblem | null>, reason: string | null): FilterActionBlock {
    if (reason) {
      return { disabled: true, heldBy: null, reason };
    }
    const block = actionBlock(FILTER_ACTION_FIELDS[action], problems, FILTER_ACTION_BESIDE[action]);
    // A field beside the action disables it, so only a General field can hold it.
    return { disabled: block.disabled, heldBy: block.heldBy as GeneralField | null };
  }

  /**
   * Says whether the action can't proceed. A disabled action does nothing; a held one moves to the first field that
   * holds it, showing its section. Nothing pops up or is relayed: the field's icon and tooltip say what it expects.
   */
  function blocked(action: FilterAction): boolean {
    const block = view.peek()?.actions[action];
    if (!block) {
      return false;
    }
    if (block.heldBy) {
      // The section is chosen before the move, which shows it and focuses the field at once, within the press.
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
    const tagModel = (await api.postJson("/api/tag-editor/model", { itemIds: [] })) as FilterTagModel | null;
    options.tagCatalog?.take(tagModel);
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
  function workingFromHeader(): Pick<FilterDialogState, "working" | "headingPreset"> {
    return {
      working: cloneFilterState(store.appliedFilter.peek()),
      headingPreset: store.activePresetName.peek()
    };
  }

  /**
   * Takes loaded sources, tags, and presets, keeping the working filter, the General fields as they are, such as a
   * duration still being typed, with only their sources checked again for the loaded sources, and the source list they
   * were filled from, and the preset list while it differs from the saved one. Otherwise the loaded list is the saved
   * one.
   */
  function takeRemote(current: FilterDialogView, remote: Awaited<ReturnType<typeof loadRemote>>): void {
    update({
      sources: remote.sources,
      tagModel: remote.tagModel,
      presets: current.presetsChanged ? current.presets : remote.presets,
      savedPresets: current.presetsChanged ? current.savedPresets : remote.presets,
      general: { ...current.general, sourceChecked: generalDraftFromFilter(current.working, remote.sources).sourceChecked }
    });
  }

  /**
   * Loads the sources, tags, and presets. The first time, it starts the working copy from the applied filter, on
   * General; after that it keeps the working copy and only takes what loaded, as Refresh does. Says whether it loaded;
   * a failure shows in the in-app notice with `failure` before the reason, except a 401, whose pairing prompt is the
   * thing to act on. Nothing loads while the server fails the compatibility check or runs without a library.
   */
  async function start(failure: string): Promise<boolean> {
    if (store.heldBack.peek()) {
      return false;
    }
    let remote: Awaited<ReturnType<typeof loadRemote>>;
    try {
      remote = await loadRemote();
    } catch (error) {
      showLoadFailure(failure, error);
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
      chosenPreset: null,
      general: generalDraftFromFilter(begin.working, remote.sources),
      sources: remote.sources,
      tagModel: remote.tagModel,
      presets: remote.presets,
      savedPresets: remote.presets,
      expanded: readExpanded(),
      newPresetName: "",
      presetEdit: null
    });
    startChoiceOver();
    if (tab.peek() === null) {
      tab.value = "general";
    }
    return true;
  }

  /** Shows a failed load in the in-app notice, except a 401, which shows only the pairing prompt. */
  function showLoadFailure(failure: string, error: unknown): void {
    if (!(error instanceof UnauthorizedError)) {
      void dialogs.notice(`${failure}: ${errorText(error)}`);
    }
  }

  /** Puts back the applied filter and the saved presets, with the sources and tags already loaded. */
  function restart(): void {
    const current = view.peek();
    if (!current) {
      return;
    }
    const begin = workingFromHeader();
    const presets = presetRowsFromApi(store.presets.peek());
    update({
      ...begin,
      general: generalDraftFromFilter(begin.working, current.sources),
      presets,
      savedPresets: presets,
      newPresetName: "",
      presetEdit: null
    });
    startChoiceOver();
  }

  /** Choose Preset starts over on the preset the heading names, its base while starred. */
  function startChoiceOver(): void {
    const current = view.peek();
    if (current) {
      update({ chosenPreset: current.headingPreset });
    }
  }

  // A tab that showed while the server had no library loaded nothing, so while it shows it loads once the server is
  // ready, keeping its changes, as Refresh does.
  connection.on("serverReady", () => {
    if (isOpen.peek()) {
      void start("Filter load failed");
    }
  });

  const dialog: FilterDialog = {
    isOpen,
    tab,
    view,
    reveal,

    // Without unsaved changes it starts over at once, so a filter applied elsewhere shows while it loads again. The
    // Presets section comes into view when the tab shows on it, however the tab came to show.
    async open() {
      isOpen.value = true;
      if (view.peek() && !view.peek()!.unsaved) {
        restart();
      }
      if (tab.peek() === "presets") {
        startChoiceOver();
      }
      await start("Filter load failed");
    },

    close() {
      isOpen.value = false;
      update({ presetEdit: null });
    },

    showTab(next) {
      const comesIntoView = next === "presets" && tab.peek() !== "presets" && isOpen.peek();
      tab.value = next;
      if (comesIntoView) {
        startChoiceOver();
      }
    },

    async refresh() {
      if (store.heldBack.peek()) {
        return;
      }
      if (!view.peek()) {
        if (await start("Filter refresh failed")) {
          notifications.notify({ kind: "actions", text: "Filter data refreshed.", key: "filter" });
        }
        return;
      }
      try {
        const remote = await loadRemote();
        const current = view.peek();
        if (current) {
          takeRemote(current, remote);
        }
        notifications.notify({ kind: "actions", text: "Filter data refreshed.", key: "filter" });
      } catch (error) {
        showLoadFailure("Filter refresh failed", error);
      }
    },

    async apply() {
      const before = view.peek();
      if (!before || store.heldBack.peek() || blocked("apply")) {
        return;
      }
      update({ working: readGeneral(before) });
      if (view.peek()!.presetsChanged) {
        try {
          const response = await api.post("/api/presets", presetsToPostBody(view.peek()!.presets));
          if (!response.ok) {
            void dialogs.notice(`Saving presets failed (${response.status}).`);
            return;
          }
          const presets = await api.getJson("/api/presets");
          store.presets.value = Array.isArray(presets) ? presets : [];
          const saved = presetRowsFromApi(store.presets.peek());
          update({ presets: saved, savedPresets: saved });
        } catch (saveError) {
          // A 401 shows only the pairing prompt, which the request has asked for.
          if (!(saveError instanceof UnauthorizedError)) {
            void dialogs.notice(`Saving presets failed: ${errorText(saveError)}`);
          }
          return;
        }
      }

      const current = view.peek()!;
      const working = readGeneral(current);
      // One batch, so the device's memory takes the applied filter and its preset once.
      batch(() => {
        store.activePresetName.value = dialogPresetBase(working, current.presets, current.headingPreset);
        store.appliedFilter.value = cloneFilterState(working);
      });
      // Choose Preset starts over on the applied preset, as the tab does.
      update({ working, headingPreset: store.activePresetName.peek(), chosenPreset: store.activePresetName.peek() });
      await connection.loadPresets();
      void panel.closeIfOverlay();
      notifications.notify({ kind: "actions", text: "Filters applied.", key: "filter" });
      await library.commitQuery();
    },

    discardChanges() {
      restart();
    },

    clearAll() {
      const current = view.peek();
      if (!current) {
        return;
      }
      const working = createDefaultFilterState();
      // It is a change while the applied filter isn't the default, which Apply then applies.
      update({
        working,
        general: generalDraftFromFilter(working, current.sources),
        headingPreset: null,
        presets: current.savedPresets
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
        // A category without a mode filters as AND, so AND leaves no entry, and the filter can match its preset again.
        const working = withoutAndLocalModes({
          ...cloneFilterState(current.working),
          categoryLocalMatchModes: { ...current.working.categoryLocalMatchModes, [categoryId]: mode }
        });
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
        presets: current.presets.map((preset) => ({ ...preset, filterState: revised(preset.filterState) })),
        savedPresets: current.savedPresets.map((preset) => ({ ...preset, filterState: revised(preset.filterState) }))
      });
    },

    choosePreset(name) {
      update({ chosenPreset: name || null });
    },

    loadPreset() {
      const current = view.peek();
      if (!current || current.loadDisabled) {
        return;
      }
      const chosen = current.presets.find((row) => row.name === current.chosenPreset);
      const working = chosen ? cloneFilterState(chosen.filterState) : createDefaultFilterState();
      update({ working, headingPreset: chosen?.name ?? null, general: generalDraftFromFilter(working, current.sources) });
    },

    updatePreset() {
      const current = view.peek();
      if (!current || blocked("updatePreset")) {
        return;
      }
      const index = current.presets.findIndex((row) => row.name === current.chosenPreset);
      if (index < 0) {
        return;
      }
      const name = current.presets[index]!.name;
      const working = readGeneral(current);
      const presets = current.presets.slice();
      presets[index] = { ...presets[index]!, filterState: cloneFilterState(working) };
      // The log leaves the preset's name out.
      notifications.notify({
        kind: "actions",
        text: `Updated preset "${name}" locally — Apply to save.`,
        key: "filter",
        logText: "Updated preset locally — Apply to save."
      });
      update({ working, presets });
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
      update({ presets: moveEntry(current.presets, from, to) });
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
      // The heading's preset and the chosen one keep naming the renamed preset.
      const renamed = (preset: string | null) => (preset !== null && namesEqualIgnoringCase(preset, row.name) ? name : preset);
      update({ presets, headingPreset: renamed(current.headingPreset), chosenPreset: renamed(current.chosenPreset), presetEdit: null });
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
      // The heading's preset goes to None, and the chosen one does once the list no longer has it.
      const named = current.headingPreset && namesEqualIgnoringCase(current.headingPreset, removed.name);
      update({
        presets: current.presets.filter((_, rowIndex) => rowIndex !== edit.index),
        headingPreset: named ? null : current.headingPreset,
        presetEdit: null
      });
    }
  };

  // A preset picked in the Library tab's preset dropdown starts the tab over from the new filter and the saved presets,
  // dropping its unsaved changes, whether or not it shows.
  store.on("headerFilterChanged", restart);

  return dialog;
}
