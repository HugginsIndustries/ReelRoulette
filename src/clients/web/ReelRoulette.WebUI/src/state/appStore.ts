import { batch, computed, effect, signal, type ReadonlySignal, type Signal } from "@preact/signals";
import type { RefreshProgress } from "../events/refreshStatusProjection";
import type { FilterSource } from "../filter/filterDialogModel";
import {
  createDefaultFilterState,
  filterStateFromApiObject,
  filterStatesEqualForPresetMatch,
  findPresetByName,
  headerPresetListAfterPick,
  headerPresetListForFilter,
  headerPresetPick,
  isPresetOwnFilter,
  serializeFilterStateForApi,
  type ApiFilterState,
  type FilterState,
  type HeaderPresetList,
  type PresetListEntry
} from "../filter/filterStateModel";
import { createItemStateCache, type ItemStateCache } from "../library/currentItemState";
import { statusLogLine } from "../logging/relayLogLines";
import { createLoadingHolds, type LoadingHolds } from "../playback/loadingHolds";
import type { components } from "../types/openapi.generated";
import type { DeviceStore } from "./deviceStore";

/** The Settings tab's Advance after, the photo duration, in the per-device store. */
const ADVANCE_AFTER_KEY = "playback.advanceAfter";
const LOOP_KEY = "player.loop";
const AUTOPLAY_KEY = "player.autoplay";
const RANDOMIZATION_MODE_KEY = "rr_randomizationMode";
const DEFAULT_PHOTO_DURATION_SECONDS = 10;
export const MIN_PHOTO_DURATION_SECONDS = 1;
export const MAX_PHOTO_DURATION_SECONDS = 300;
const DEFAULT_RANDOMIZATION_MODE = "SmartShuffle";
const APPLIED_FILTER_KEY = "filter.applied";
/** A repeated message is relayed to the server log at most once in this window. */
const STATUS_RELAY_REPEAT_MS = 1000;

export const RANDOMIZATION_MODES: readonly { value: string; label: string }[] = [
  { value: "SmartShuffle", label: "Smart Shuffle" },
  { value: "PureRandom", label: "Pure Random" },
  { value: "WeightedRandom", label: "Weighted Random" },
  { value: "SpreadMode", label: "Spread Mode" },
  { value: "WeightedWithSpread", label: "Weighted with Spread" }
];

export const PRESET_MENU_LOADING = "Loading...";
export const PRESET_MENU_LOAD_FAILED = "Error loading presets";
export const PRESET_MENU_BLOCKED = "Server compatibility check failed";
export const PRESET_MENU_NO_LIBRARY = "Running without a library";

/** The playing item, as the random and play responses describe it. */
export type PlayingItem = components["schemas"]["RandomResponse"];

/** A saved preset as `GET /api/presets` returns it. */
export type ApiPreset = components["schemas"]["PresetResponse"];

/** The applied filter and its preset, as remembered across a page refresh. Presets themselves stay on the server. */
interface RememberedFilter {
  /** The filter as the API takes it. */
  filter: ApiFilterState;
  /** The preset it came from, or null for None. */
  preset: string | null;
  /** None held while the filter is the default, even when a saved preset has the default filter. */
  holdNone: boolean;
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
    (record.preset === null || typeof record.preset === "string") &&
    typeof record.holdNone === "boolean" &&
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

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Changes one screen makes that another screen acts on. */
export interface AppStoreEvents {
  /** A pick in the preset dropdown, which the header held before the Library tab, changed the applied filter. */
  headerFilterChanged: () => void;
  /** The photo duration, the Settings tab's Advance after, changed. */
  photoDurationChanged: () => void;
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
  /** The saved preset the applied filter came from, or null for None. */
  readonly activePresetName: Signal<string | null>;
  /** The preset dropdown stays on None until the applied filter changes, even when a saved preset has the default filter. */
  readonly headerExplicitNone: Signal<boolean>;
  readonly randomizationMode: Signal<string>;
  /** How long a photo shows, the Settings tab's Advance after, kept on this device. Change it with `setPhotoDuration`. */
  readonly photoDurationSeconds: ReadonlySignal<number>;
  /** The media sources as last loaded, or null before they have. The Library tab's Filters line counts them. */
  readonly sources: Signal<FilterSource[] | null>;
  readonly compatibilityBlocked: Signal<boolean>;
  /** Why the server failed the compatibility check, while it has. */
  readonly compatibilityMessage: Signal<string | null>;
  readonly pairingRequired: Signal<boolean>;
  /** The server's version from the last version check it answered, or null before one has. */
  readonly serverVersion: Signal<ServerVersion | null>;
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
   * texts that show nothing, such as "Ready (API 1)". A repeat within a second is relayed once.
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
  /** Shows one message in the preset dropdown in place of the presets. */
  showPresetMenuMessage(text: string): void;
  /** Applies a preset dropdown pick: None, a saved preset, or the starred row that keeps the filter. */
  pickHeaderPreset(value: string): void;
  /** The value of the preset dropdown's selected entry: a preset id, empty for None, or the starred row. */
  selectedPresetValue(): string;
  setRandomizationMode(mode: string): void;
  /** Sets the photo duration and keeps it on this device. Anything but a whole number from 1 to 300 seconds is ignored. */
  setPhotoDuration(seconds: number): void;
  setLoop(on: boolean): void;
  setAutoplay(on: boolean): void;
  /**
   * Makes `item` the playing item, with its last-seen favorite and blacklist, and the newest history entry. The
   * entries after the playing one are dropped.
   */
  pushHistory(item: PlayingItem): void;
  /** Makes the previous or next history entry the playing item. Returns false at either end of history. */
  stepHistory(step: -1 | 1): boolean;
  on<K extends keyof AppStoreEvents>(event: K, listener: AppStoreEvents[K]): void;
}

export interface AppStoreOptions {
  identity: ClientIdentity;
  /** Browser `localStorage`, for the per-device randomization mode. */
  storage: StorageLike;
  /** Remembers the applied filter and its preset, the photo duration, Loop, and Autoplay on this device. */
  device: DeviceStore;
  /** Sends one line to the server log. */
  relay: (level: string, message: string) => void;
  now?: () => number;
}

function isPhotoDuration(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_PHOTO_DURATION_SECONDS && (value as number) <= MAX_PHOTO_DURATION_SECONDS;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function readRandomizationMode(storage: StorageLike): string {
  const saved = storage.getItem(RANDOMIZATION_MODE_KEY);
  return saved && RANDOMIZATION_MODES.some((mode) => mode.value === saved) ? saved : DEFAULT_RANDOMIZATION_MODE;
}

/** The applied filter and its preset as the store has them, read so an effect follows each. */
function rememberedFilterOf(store: AppStore): RememberedFilter {
  const filter = store.appliedFilter.value;
  const preset = store.activePresetName.value;
  return {
    filter: serializeFilterStateForApi(filter),
    preset,
    holdNone: store.headerExplicitNone.value,
    unchanged: isPresetOwnFilter(filter, store.presets.value, preset)
  };
}

export function createAppStore(options: AppStoreOptions): AppStore {
  const now = options.now ?? (() => Date.now());
  const listeners: { [K in keyof AppStoreEvents]: AppStoreEvents[K][] } = {
    headerFilterChanged: [],
    photoDurationChanged: []
  };
  let lastRelayedStatus = "";
  let lastRelayedStatusAtMs = 0;
  const remembered = options.device.read<RememberedFilter | null>(APPLIED_FILTER_KEY, null, isRememberedFilter);
  const restoredFilter = remembered ? filterStateFromApiObject(remembered.filter) : createDefaultFilterState();
  /** The remembered preset that applies again once presets load, unless the filter changes first. */
  let reapplyPreset = remembered?.unchanged ? remembered.preset : null;
  /** Presets have loaded once, so whether the filter is a preset's own can be told, and the filter is remembered. */
  const presetsLoadedOnce = signal(false);

  const compatibilityBlocked = signal(false);
  const libraryState = signal("ready");
  const loop = signal(options.device.read(LOOP_KEY, false, isBoolean));
  const autoplay = signal(options.device.read(AUTOPLAY_KEY, false, isBoolean));
  const photoDurationSeconds = signal(options.device.read(ADVANCE_AFTER_KEY, DEFAULT_PHOTO_DURATION_SECONDS, isPhotoDuration));
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
    activePresetName: signal<string | null>(remembered?.preset ?? null),
    headerExplicitNone: signal(remembered?.holdNone ?? false),
    randomizationMode: signal(readRandomizationMode(options.storage)),
    photoDurationSeconds,
    sources: signal<FilterSource[] | null>(null),
    compatibilityBlocked,
    compatibilityMessage: signal<string | null>(null),
    pairingRequired: signal(false),
    serverVersion: signal<ServerVersion | null>(null),
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
      const applied = store.appliedFilter.peek();
      const stillDefault = filterStatesEqualForPresetMatch(applied, createDefaultFilterState());
      if (store.headerExplicitNone.peek() && !stillDefault) {
        store.headerExplicitNone.value = false;
      }
      showPresetList(
        headerPresetListForFilter(
          applied,
          store.presets.peek(),
          store.activePresetName.peek(),
          store.headerExplicitNone.peek() && stillDefault
        )
      );
    },

    presetsLoaded() {
      const name = reapplyPreset;
      reapplyPreset = null;
      // A filter applied since the page loaded replaces the remembered one, which then no longer applies again.
      const unchangedSinceLoad = store.appliedFilter.peek() === restoredFilter;
      const preset = name !== null && unchangedSinceLoad ? findPresetByName(store.presets.peek(), name) : undefined;
      if (preset) {
        store.pickHeaderPreset(preset.id);
      } else {
        store.syncHeaderPresets();
      }
      // After the preset applies again, so only what results is remembered.
      presetsLoadedOnce.value = true;
    },

    showPresetMenuMessage(text) {
      store.presetMenu.value = { entries: [{ label: text, value: "" }], selectedValue: "", message: true };
    },

    pickHeaderPreset(value) {
      // One batch, so the device's memory takes the pick's result once, not each step on the way.
      const changed = batch(() => {
        const pick = headerPresetPick(value);
        if (pick === "default") {
          store.headerExplicitNone.value = true;
        } else if (pick === "named") {
          store.headerExplicitNone.value = false;
        }
        const applied = store.appliedFilter.peek();
        const list = headerPresetListAfterPick(applied, store.presets.peek(), store.activePresetName.peek(), value);
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

    setRandomizationMode(mode) {
      store.randomizationMode.value = mode || DEFAULT_RANDOMIZATION_MODE;
      options.storage.setItem(RANDOMIZATION_MODE_KEY, store.randomizationMode.peek());
    },

    setPhotoDuration(seconds) {
      if (!isPhotoDuration(seconds)) {
        return;
      }
      photoDurationSeconds.value = seconds;
      options.device.write(ADVANCE_AFTER_KEY, seconds);
      emit("photoDurationChanged");
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
    store.activePresetName.value = list.baseName;
    store.presetMenu.value = { entries: list.entries, selectedValue: list.selectedValue, message: false };
  }

  function emit<K extends keyof AppStoreEvents>(event: K, ...args: Parameters<AppStoreEvents[K]>): void {
    for (const listener of listeners[event]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  return store;
}
