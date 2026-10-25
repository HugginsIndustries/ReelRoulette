import { batch, computed, effect, signal, type ReadonlySignal, type Signal } from "@preact/signals";
import type { RefreshProgress } from "../events/refreshStatusProjection";
import type { FilterSource } from "../filter/filterDialogModel";
import {
  createDefaultFilterState,
  filterStateForHeaderPresetSelection,
  filterStateFromApiObject,
  filterStatesEqualForPresetMatch,
  findPresetById,
  headerPresetListAfterPick,
  headerPresetListForFilter,
  isPresetOwnFilter,
  serializeFilterStateForApi,
  withoutAndLocalModes,
  type ApiFilterState,
  type FilterState,
  type HeaderPresetList,
  type PresetListEntry
} from "../filter/filterStateModel";
import { createItemStateCache, type ItemStateCache } from "../library/currentItemState";
import { statusLogLine } from "../logging/relayLogLines";
import { createLoadingHolds, type LoadingHolds } from "../playback/loadingHolds";
import { isRandomBehavior, readRandomOptions, type RandomBehavior, type RandomOptions } from "../random/randomOptions";
import type { components } from "../types/openapi.generated";
import { isBoolean, isRecord, type DeviceStore } from "./deviceStore";

/** The Settings tab's Advance after, the timer both autoplay modes use, in the per-device store. */
const ADVANCE_AFTER_KEY = "playback.advanceAfter";
const AUTOPLAY_MODE_KEY = "playback.autoplayMode";
const LOOP_STOPS_AUTOPLAY_KEY = "playback.loopStopsAutoplay";
const LOOP_KEY = "player.loop";
const AUTOPLAY_KEY = "player.autoplay";
const RANDOM_OPTIONS_KEY = "randomization.options";
const RANDOM_BEHAVIOR_KEY = "randomization.behavior";
const DEFAULT_ADVANCE_AFTER_SECONDS = 10;
export const MIN_ADVANCE_AFTER_SECONDS = 1;
export const MAX_ADVANCE_AFTER_SECONDS = 3600;
const APPLIED_FILTER_KEY = "filter.applied";
/** A repeated message is relayed to the server log at most once in this window. */
const STATUS_RELAY_REPEAT_MS = 1000;

export const PRESET_MENU_LOADING = "Loading…";
export const PRESET_MENU_LOAD_FAILED = "Error loading presets";
export const PRESET_MENU_BLOCKED = "Server compatibility check failed";
export const PRESET_MENU_NO_LIBRARY = "Running without a library";

/** The playing item, as the play response and a random pick's item describe it. */
export type PlayingItem = components["schemas"]["PlaybackItemResponse"];

/** This device's Shuffle cycle: the eligible files picked within the window, the eligible files, and those remaining. */
export type RandomCycle = components["schemas"]["RandomPickCycleResponse"];

/**
 * How autoplay moves on: Normal advances a photo after Advance after and a video at its end; Timer advances every item
 * after Advance after, a video that hasn't finished too.
 */
export type AutoplayMode = "normal" | "timer";

/** A saved preset as `GET /api/presets` returns it. */
export type ApiPreset = components["schemas"]["PresetResponse"];

/**
 * The applied filter and its preset, as remembered across a page refresh. Presets themselves stay on the server. A
 * record from before presets had ids, which names its preset in `preset`, isn't one, so it reads as None with the
 * default filter.
 */
interface RememberedFilter {
  /** The filter as the API takes it. */
  filter: ApiFilterState;
  /** The id of the preset it came from, or null for None. */
  presetId: string | null;
  /** The filter was the preset's own, unchanged, so the next page load applies the preset as the server has it then. */
  unchanged: boolean;
}

function isRememberedFilter(value: unknown): value is RememberedFilter {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    !!record.filter &&
    typeof record.filter === "object" &&
    !Array.isArray(record.filter) &&
    (record.presetId === null || typeof record.presetId === "string") &&
    typeof record.unchanged === "boolean"
  );
}

/** What the preset dropdown lists and which entry it shows. */
export interface PresetMenu {
  entries: PresetListEntry[];
  selectedValue: string;
  /** It shows one message in place of the presets, so there is nothing to choose. */
  message: boolean;
}

export interface ClientIdentity {
  clientId: string;
  sessionId: string;
  clientType: string;
  deviceName: string;
}

/** The server's version and API version, as its last answered version check reported them. */
export interface ServerVersion {
  /** The release version, such as "0.15.0". */
  version: string;
  apiVersion: string;
}

/** Changes one screen makes that another screen acts on. */
export interface AppStoreEvents {
  /** A pick in the preset dropdown, which the header held before the Library tab, changed the applied filter. */
  headerFilterChanged: () => void;
  /**
   * Another device changed the filter of the active preset while it applied unchanged, and the applied filter took the
   * new filter, as `presetsReloaded` says.
   */
  appliedPresetFollowed: () => void;
  /** The Settings tab's Advance after changed. */
  advanceAfterChanged: () => void;
  /** The autoplay mode, or Loop stops autoplay, changed. */
  autoplaySettingsChanged: () => void;
}

/** State several screens use, and the actions that cross screens. */
export interface AppStore {
  readonly identity: ClientIdentity;
  readonly current: Signal<PlayingItem | null>;
  /** Counts playback attempts, so relayed lines from one attempt can be told apart. */
  readonly playAttemptId: Signal<number>;
  /** The items played, oldest first. Previous and Next move through it. */
  readonly history: Signal<PlayingItem[]>;
  /** The playing item's place in `history`, or -1 before anything plays. */
  readonly historyIndex: Signal<number>;
  /** The player's Loop, kept on this device. Change it with `setLoop`. */
  readonly loop: ReadonlySignal<boolean>;
  /** The player's Autoplay, kept on this device. Change it with `setAutoplay`. */
  readonly autoplay: ReadonlySignal<boolean>;
  /** Each item's favorite and blacklist as last seen, applied when an item plays again. */
  readonly itemStates: ItemStateCache;
  readonly presets: Signal<ApiPreset[]>;
  readonly presetMenu: Signal<PresetMenu>;
  /** Assign a new filter to change it, so the Library tab's Filters line and the device's memory follow. */
  readonly appliedFilter: Signal<FilterState>;
  /**
   * The id of the saved preset the applied filter came from, or null for None. It stays while a loaded list lacks the
   * preset, which the dropdown then shows as None*, until the filter becomes the default or another preset's.
   */
  readonly activePresetId: Signal<string | null>;
  /** The Randomization tab's options, kept on this device and sent with each random pick. Change them with `setRandomOptions`. */
  readonly randomOptions: ReadonlySignal<RandomOptions>;
  /**
   * The Randomization tab's Random behavior, Jump until set, kept on this device: where the player's Random button and
   * R put a pick in the history. Change it with `setRandomBehavior`.
   */
  readonly randomBehavior: ReadonlySignal<RandomBehavior>;
  /** This device's Shuffle cycle numbers, as the last random pick or cycle read answered them, or null before one has. */
  readonly randomCycle: Signal<RandomCycle | null>;
  /**
   * The Settings tab's Advance after, in seconds, kept on this device: how long a photo shows, and the timer of Timer
   * mode and of a short video Loop repeats. Change it with `setAdvanceAfter`.
   */
  readonly advanceAfterSeconds: ReadonlySignal<number>;
  /** The Settings tab's Autoplay mode, Normal until set, kept on this device. Change it with `setAutoplayMode`. */
  readonly autoplayMode: ReadonlySignal<AutoplayMode>;
  /**
   * The Settings tab's Loop stops autoplay, on until set, kept on this device: with Autoplay and Loop on, the item
   * repeats and nothing advances. Change it with `setLoopStopsAutoplay`.
   */
  readonly loopStopsAutoplay: ReadonlySignal<boolean>;
  /** The media sources as last loaded, or null before they have. The Library tab's Filters line counts them. */
  readonly sources: Signal<FilterSource[] | null>;
  readonly compatibilityBlocked: Signal<boolean>;
  /** Why the server failed the compatibility check, while it has. */
  readonly compatibilityMessage: Signal<string | null>;
  readonly pairingRequired: Signal<boolean>;
  /** The server's version from the last version check it answered, or null before one has. */
  readonly serverVersion: Signal<ServerVersion | null>;
  /**
   * The capabilities the last version check the server answered listed, or none before one has. Some depend on the
   * caller, such as whether the server opens its file manager for this browser.
   */
  readonly serverCapabilities: Signal<readonly string[]>;
  /**
   * The server can't be reached: the event stream isn't open, or the last version check didn't reach the server. False
   * while the last check found no library, since the server then refuses the stream.
   */
  readonly reconnecting: Signal<boolean>;
  /** The library state the last version check reported: "ready", or why there is no library. */
  readonly libraryState: Signal<string>;
  /** The server's message for its library state, while it has no library. */
  readonly libraryMessage: Signal<string | null>;
  /** The server runs without a library, so the page loads nothing, as while it fails the compatibility check. */
  readonly noLibrary: ReadonlySignal<boolean>;
  /** The server fails the compatibility check or runs without a library, so the page loads and sends nothing. */
  readonly heldBack: ReadonlySignal<boolean>;
  /** A running refresh's stage and percent, or null while none runs. */
  readonly refreshProgress: Signal<RefreshProgress | null>;
  /** What the player is waiting for, which shows Loading… once it has waited half a second. */
  readonly loading: LoadingHolds;

  /**
   * Relays a message's text to the server log as a `status=` line: a popup's, a notice's, a lasting state's, and the
   * texts that show nothing, such as "Ready (API 2)". A repeat within a second is relayed once.
   */
  relayStatus(logText: string): void;
  /** Rebuilds the preset dropdown from the presets and the applied filter. */
  syncHeaderPresets(): void;
  /**
   * The saved presets have loaded. The first time, a preset remembered from before the page loaded, whose filter
   * applied unchanged, applies again as the server has it now, so tag renames and deletions made elsewhere since
   * reach the filter, as they do while the page is open. Then the preset dropdown is rebuilt.
   */
  presetsLoaded(): void;
  /**
   * Presets reloaded for a preset event or a resync have loaded, and the store takes them as `presetsLoaded` does. When
   * another device changed the active preset, `activeBefore` is that preset as this device held it before the change,
   * otherwise null. While the applied filter was its filter, unchanged, and the reloaded preset has another, the applied
   * filter takes the new filter, the preset dropdown follows, and `appliedPresetFollowed` is sent once the device's
   * memory has the result. A deleted preset's filter stays applied, shown as modified. Says whether it followed.
   */
  presetsReloaded(presets: ApiPreset[], activeBefore: ApiPreset | null): boolean;
  /** Shows one message in the preset dropdown in place of the presets. */
  showPresetMenuMessage(text: string): void;
  /** Applies a preset dropdown pick: None, a saved preset, or the starred row that keeps the filter. */
  pickHeaderPreset(value: string): void;
  /** The value of the preset dropdown's selected entry: a preset id, empty for None, or the starred row. */
  selectedPresetValue(): string;
  /** Sets the random pick options and keeps them on this device. */
  setRandomOptions(options: RandomOptions): void;
  setRandomBehavior(behavior: RandomBehavior): void;
  /** Sets Advance after and keeps it on this device. Anything but a whole number from 1 to 3600 seconds is ignored. */
  setAdvanceAfter(seconds: number): void;
  setAutoplayMode(mode: AutoplayMode): void;
  setLoopStopsAutoplay(on: boolean): void;
  setLoop(on: boolean): void;
  setAutoplay(on: boolean): void;
  /**
   * Makes `item` the playing item, with its last-seen favorite and blacklist, and the newest history entry. The
   * entries after the playing one are dropped.
   */
  pushHistory(item: PlayingItem): void;
  /**
   * Makes `item` the playing item, with its last-seen favorite and blacklist, and adds it at the end of the history,
   * keeping every entry, as a random pick goes there from anywhere in it.
   */
  appendHistory(item: PlayingItem): void;
  /**
   * Makes `item` the playing item, with its last-seen favorite and blacklist, and puts it in the history right after
   * the playing entry, keeping the entries after it, as Insert puts a Random pick.
   */
  insertHistory(item: PlayingItem): void;
  /** Makes the previous or next history entry the playing item. Returns false at either end of history. */
  stepHistory(step: -1 | 1): boolean;
  on<K extends keyof AppStoreEvents>(event: K, listener: AppStoreEvents[K]): void;
}

export interface AppStoreOptions {
  identity: ClientIdentity;
  /**
   * Remembers the applied filter and its preset, Advance after, the autoplay settings, Loop, Autoplay, and the random
   * pick options and Random behavior on this device.
   */
  device: DeviceStore;
  /** Sends one line to the server log. */
  relay: (level: string, message: string) => void;
  now?: () => number;
}

function isAdvanceAfter(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_ADVANCE_AFTER_SECONDS && (value as number) <= MAX_ADVANCE_AFTER_SECONDS;
}

function isAutoplayMode(value: unknown): value is AutoplayMode {
  return value === "normal" || value === "timer";
}

/** The applied filter and its preset as the store has them, read so an effect follows each. */
function rememberedFilterOf(store: AppStore): RememberedFilter {
  const filter = store.appliedFilter.value;
  const presetId = store.activePresetId.value;
  return {
    filter: serializeFilterStateForApi(filter),
    presetId,
    unchanged: isPresetOwnFilter(filter, store.presets.value, presetId)
  };
}

export function createAppStore(options: AppStoreOptions): AppStore {
  const now = options.now ?? (() => Date.now());
  const listeners: { [K in keyof AppStoreEvents]: AppStoreEvents[K][] } = {
    headerFilterChanged: [],
    appliedPresetFollowed: [],
    advanceAfterChanged: [],
    autoplaySettingsChanged: []
  };
  let lastRelayedStatus = "";
  let lastRelayedStatusAtMs = 0;
  const remembered = options.device.read<RememberedFilter | null>(APPLIED_FILTER_KEY, null, isRememberedFilter);
  const restoredFilter = remembered ? withoutAndLocalModes(filterStateFromApiObject(remembered.filter)) : createDefaultFilterState();
  /** The remembered preset that applies again once presets load, unless the filter changes first. */
  let reapplyPreset = remembered?.unchanged ? remembered.presetId : null;
  /** Presets have loaded once, so whether the filter is a preset's own can be told, and the filter is remembered. */
  const presetsLoadedOnce = signal(false);

  const compatibilityBlocked = signal(false);
  const libraryState = signal("ready");
  const loop = signal(options.device.read(LOOP_KEY, false, isBoolean));
  const autoplay = signal(options.device.read(AUTOPLAY_KEY, false, isBoolean));
  const advanceAfterSeconds = signal(options.device.read(ADVANCE_AFTER_KEY, DEFAULT_ADVANCE_AFTER_SECONDS, isAdvanceAfter));
  const autoplayMode = signal(options.device.read<AutoplayMode>(AUTOPLAY_MODE_KEY, "normal", isAutoplayMode));
  const loopStopsAutoplay = signal(options.device.read(LOOP_STOPS_AUTOPLAY_KEY, true, isBoolean));
  const randomOptions = signal(readRandomOptions(options.device.read<Record<string, unknown> | null>(RANDOM_OPTIONS_KEY, null, isRecord)));
  const randomBehavior = signal(options.device.read<RandomBehavior>(RANDOM_BEHAVIOR_KEY, "jump", isRandomBehavior));
  const noLibrary = computed(() => libraryState.value !== "ready");

  const store: AppStore = {
    identity: options.identity,
    current: signal<PlayingItem | null>(null),
    playAttemptId: signal(0),
    history: signal<PlayingItem[]>([]),
    historyIndex: signal(-1),
    loop,
    autoplay,
    itemStates: createItemStateCache(),
    presets: signal<ApiPreset[]>([]),
    presetMenu: signal<PresetMenu>({ entries: [{ label: PRESET_MENU_LOADING, value: "" }], selectedValue: "", message: true }),
    appliedFilter: signal(restoredFilter),
    activePresetId: signal<string | null>(remembered?.presetId ?? null),
    randomOptions,
    randomBehavior,
    randomCycle: signal<RandomCycle | null>(null),
    advanceAfterSeconds,
    autoplayMode,
    loopStopsAutoplay,
    sources: signal<FilterSource[] | null>(null),
    compatibilityBlocked,
    compatibilityMessage: signal<string | null>(null),
    pairingRequired: signal(false),
    serverVersion: signal<ServerVersion | null>(null),
    serverCapabilities: signal<readonly string[]>([]),
    reconnecting: signal(false),
    libraryState,
    libraryMessage: signal<string | null>(null),
    noLibrary,
    heldBack: computed(() => compatibilityBlocked.value || noLibrary.value),
    refreshProgress: signal<RefreshProgress | null>(null),
    loading: createLoadingHolds(),

    relayStatus(logText) {
      const at = now();
      const line = String(logText || "");
      if (line !== lastRelayedStatus || at - lastRelayedStatusAtMs > STATUS_RELAY_REPEAT_MS) {
        lastRelayedStatus = line;
        lastRelayedStatusAtMs = at;
        options.relay("info", statusLogLine(line, store.current.peek(), store.playAttemptId.peek()));
      }
    },

    syncHeaderPresets() {
      showPresetList(headerPresetListForFilter(store.appliedFilter.peek(), store.presets.peek(), store.activePresetId.peek()));
    },

    presetsLoaded() {
      const id = reapplyPreset;
      reapplyPreset = null;
      // A filter applied since the page loaded replaces the remembered one, which then no longer applies again.
      const unchangedSinceLoad = store.appliedFilter.peek() === restoredFilter;
      const preset = id !== null && unchangedSinceLoad ? findPresetById(store.presets.peek(), id) : undefined;
      if (preset) {
        store.pickHeaderPreset(preset.id);
      } else {
        store.syncHeaderPresets();
      }
      // After the preset applies again, so only what results is remembered.
      presetsLoadedOnce.value = true;
    },

    presetsReloaded(presets, activeBefore) {
      // One batch, so the device's memory takes the list and the followed filter once, not each step on the way.
      const followed = batch(() => {
        const applied = store.appliedFilter.peek();
        const before = activeBefore?.id === store.activePresetId.peek() ? activeBefore : null;
        const reloaded = before ? findPresetById(presets, before.id) : undefined;
        const wasOwn = !!before && isPresetOwnFilter(applied, [before], before.id);
        const next = wasOwn && reloaded ? filterStateForHeaderPresetSelection(reloaded) : null;
        const follows = !!next && !filterStatesEqualForPresetMatch(next, applied);
        store.presets.value = presets;
        if (follows) {
          store.appliedFilter.value = next;
        }
        store.presetsLoaded();
        return follows;
      });
      if (followed) {
        emit("appliedPresetFollowed");
      }
      return followed;
    },

    showPresetMenuMessage(text) {
      store.presetMenu.value = { entries: [{ label: text, value: "" }], selectedValue: "", message: true };
    },

    pickHeaderPreset(value) {
      // One batch, so the device's memory takes the pick's result once, not each step on the way.
      const changed = batch(() => {
        const applied = store.appliedFilter.peek();
        const list = headerPresetListAfterPick(applied, store.presets.peek(), store.activePresetId.peek(), value);
        const filterChanged = !filterStatesEqualForPresetMatch(list.filter, applied);
        if (filterChanged) {
          store.appliedFilter.value = list.filter;
        }
        showPresetList(list);
        return filterChanged;
      });
      if (changed) {
        emit("headerFilterChanged");
      }
    },

    selectedPresetValue() {
      return store.presetMenu.peek().selectedValue;
    },

    setRandomOptions(next) {
      randomOptions.value = next;
      options.device.write(RANDOM_OPTIONS_KEY, next);
    },

    setRandomBehavior(behavior) {
      randomBehavior.value = behavior;
      options.device.write(RANDOM_BEHAVIOR_KEY, behavior);
    },

    setAdvanceAfter(seconds) {
      if (!isAdvanceAfter(seconds)) {
        return;
      }
      advanceAfterSeconds.value = seconds;
      options.device.write(ADVANCE_AFTER_KEY, seconds);
      emit("advanceAfterChanged");
    },

    setAutoplayMode(mode) {
      autoplayMode.value = mode;
      options.device.write(AUTOPLAY_MODE_KEY, mode);
      emit("autoplaySettingsChanged");
    },

    setLoopStopsAutoplay(on) {
      loopStopsAutoplay.value = on;
      options.device.write(LOOP_STOPS_AUTOPLAY_KEY, on);
      emit("autoplaySettingsChanged");
    },

    setLoop(on) {
      loop.value = on;
      options.device.write(LOOP_KEY, on);
    },

    setAutoplay(on) {
      autoplay.value = on;
      options.device.write(AUTOPLAY_KEY, on);
    },

    pushHistory(item) {
      store.itemStates.applyTo(item);
      store.current.value = item;
      const history = store.history.peek().slice(0, store.historyIndex.peek() + 1);
      history.push(item);
      store.history.value = history;
      store.historyIndex.value = history.length - 1;
    },

    appendHistory(item) {
      store.itemStates.applyTo(item);
      store.current.value = item;
      const history = [...store.history.peek(), item];
      store.history.value = history;
      store.historyIndex.value = history.length - 1;
    },

    insertHistory(item) {
      store.itemStates.applyTo(item);
      store.current.value = item;
      const index = store.historyIndex.peek() + 1;
      const history = [...store.history.peek()];
      history.splice(index, 0, item);
      store.history.value = history;
      store.historyIndex.value = index;
    },

    stepHistory(step) {
      const history = store.history.peek();
      const index = store.historyIndex.peek() + step;
      if (store.historyIndex.peek() < 0 || index < 0 || index >= history.length) {
        return false;
      }
      store.historyIndex.value = index;
      store.current.value = history[index]!;
      return true;
    },

    on(event, listener) {
      listeners[event].push(listener);
    }
  };

  // Remembers the applied filter and its preset as either changes, from any screen, and whether the filter is still the
  // preset's own as presets load. Nothing is written until presets have loaded once, since before then no filter reads
  // as a preset's own, and a page whose presets never load keeps the record as it was. Only a record that differs from
  // the one kept is written, so a page load that changes nothing writes nothing.
  let kept = JSON.stringify(remembered ?? rememberedFilterOf(store));
  effect(() => {
    if (!presetsLoadedOnce.value) {
      return;
    }
    const record = JSON.stringify(rememberedFilterOf(store));
    if (record !== kept) {
      kept = record;
      options.device.write(APPLIED_FILTER_KEY, JSON.parse(record));
    }
  });

  function showPresetList(list: HeaderPresetList): void {
    store.activePresetId.value = list.baseId;
    store.presetMenu.value = { entries: list.entries, selectedValue: list.selectedValue, message: false };
  }

  function emit<K extends keyof AppStoreEvents>(event: K, ...args: Parameters<AppStoreEvents[K]>): void {
    for (const listener of listeners[event]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  return store;
}
