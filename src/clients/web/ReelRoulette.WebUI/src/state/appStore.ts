import { signal, type Signal } from "@preact/signals";
import {
  createDefaultFilterState,
  filterStatesEqualForPresetMatch,
  headerPresetListAfterPick,
  headerPresetListForFilter,
  headerPresetPick,
  type FilterState,
  type HeaderPresetList,
  type PresetListEntry
} from "../filter/filterStateModel";
import { createItemStateCache, type ItemStateCache } from "../library/currentItemState";
import { statusLogLine } from "../logging/relayLogLines";
import type { components } from "../types/openapi.generated";

const PHOTO_DURATION_KEY = "rr_photoDuration";
const RANDOMIZATION_MODE_KEY = "rr_randomizationMode";
const DEFAULT_PHOTO_DURATION_SECONDS = 15;
const MIN_PHOTO_DURATION_SECONDS = 1;
const MAX_PHOTO_DURATION_SECONDS = 300;
const DEFAULT_RANDOMIZATION_MODE = "SmartShuffle";
/** A repeated status is relayed to the server log at most once in this window. */
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

/** The playing item, as the random and play responses describe it. */
export type PlayingItem = components["schemas"]["RandomResponse"];

/** A saved preset as `GET /api/presets` returns it. */
export interface ApiPreset {
  id: string;
  name: string;
  filterState?: unknown;
}

/** What the header preset dropdown lists and which entry it shows. */
export interface PresetMenu {
  entries: PresetListEntry[];
  selectedValue: string;
}

export interface ClientIdentity {
  clientId: string;
  sessionId: string;
  clientType: string;
  deviceName: string;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The screens still in `app.js` that the player's buttons open. */
export type OverlayName = "filter" | "tagEditor";

/** Changes one screen makes that another screen acts on. */
export interface AppStoreEvents {
  /** A header preset pick changed the applied filter. */
  headerFilterChanged: () => void;
  /** The photo duration changed from the header. */
  photoDurationChanged: () => void;
  /** A player button asked to open a screen still in `app.js`. */
  overlayRequested: (overlay: OverlayName) => void;
}

/**
 * State several screens use, and the actions that cross screens. `app.js` reads and writes these signals
 * through its `state` object until each screen it owns moves to a component.
 */
export interface AppStore {
  readonly identity: ClientIdentity;
  /** The status line. Write it through `setStatus`, which also relays it to the server log. */
  readonly status: Signal<string>;
  readonly current: Signal<PlayingItem | null>;
  /** Counts playback attempts, so relayed lines from one attempt can be told apart. */
  readonly playAttemptId: Signal<number>;
  /** The items played, oldest first. Previous and Next move through it. */
  readonly history: Signal<PlayingItem[]>;
  /** The playing item's place in `history`, or -1 before anything plays. */
  readonly historyIndex: Signal<number>;
  readonly loop: Signal<boolean>;
  readonly autoplay: Signal<boolean>;
  /** Each item's favorite and blacklist as last seen, applied when an item plays again. */
  readonly itemStates: ItemStateCache;
  readonly presets: Signal<ApiPreset[]>;
  readonly presetMenu: Signal<PresetMenu>;
  readonly appliedFilter: Signal<FilterState>;
  /** The saved preset the applied filter came from, or null for None. */
  readonly activePresetName: Signal<string | null>;
  /** The header stays on None until the applied filter changes, even when a saved preset has the default filter. */
  readonly headerExplicitNone: Signal<boolean>;
  readonly randomizationMode: Signal<string>;
  readonly photoDurationSeconds: Signal<number>;
  readonly compatibilityBlocked: Signal<boolean>;
  readonly pairingRequired: Signal<boolean>;

  /** `logText` replaces `message` in the server log when `message` shows a file, preset, or server error text. */
  setStatus(message: string, logText?: string): void;
  /** Rebuilds the header preset dropdown from the presets and the applied filter. */
  syncHeaderPresets(): void;
  /** Shows one message in the header preset dropdown in place of the presets. */
  showPresetMenuMessage(text: string): void;
  /** Applies a header preset pick: None, a saved preset, or the starred row that keeps the filter. */
  pickHeaderPreset(value: string): void;
  /** The value of the header dropdown's selected entry: a preset id, empty for None, or the starred row. */
  selectedPresetValue(): string;
  setRandomizationMode(mode: string): void;
  /** Takes the text of the photo duration field. A value outside 1 to 300 seconds is ignored. */
  setPhotoDuration(text: string): void;
  /**
   * Makes `item` the playing item, with its last-seen favorite and blacklist, and the newest history entry. The
   * entries after the playing one are dropped.
   */
  pushHistory(item: PlayingItem): void;
  /** Makes the previous or next history entry the playing item. Returns false at either end of history. */
  stepHistory(step: -1 | 1): boolean;
  openOverlay(overlay: OverlayName): void;
  on<K extends keyof AppStoreEvents>(event: K, listener: AppStoreEvents[K]): void;
}

export interface AppStoreOptions {
  identity: ClientIdentity;
  /** Browser `localStorage`, for the per-device photo duration and randomization mode. */
  storage: StorageLike;
  /** Sends one line to the server log. */
  relay: (level: string, message: string) => void;
  now?: () => number;
}

function readPhotoDuration(storage: StorageLike): number {
  const saved = Number.parseInt(storage.getItem(PHOTO_DURATION_KEY) || "", 10);
  return isPhotoDuration(saved) ? saved : DEFAULT_PHOTO_DURATION_SECONDS;
}

function isPhotoDuration(value: number): boolean {
  return !Number.isNaN(value) && value >= MIN_PHOTO_DURATION_SECONDS && value <= MAX_PHOTO_DURATION_SECONDS;
}

function readRandomizationMode(storage: StorageLike): string {
  const saved = storage.getItem(RANDOMIZATION_MODE_KEY);
  return saved && RANDOMIZATION_MODES.some((mode) => mode.value === saved) ? saved : DEFAULT_RANDOMIZATION_MODE;
}

export function createAppStore(options: AppStoreOptions): AppStore {
  const now = options.now ?? (() => Date.now());
  const listeners: { [K in keyof AppStoreEvents]: AppStoreEvents[K][] } = {
    headerFilterChanged: [],
    photoDurationChanged: [],
    overlayRequested: []
  };
  let lastRelayedStatus = "";
  let lastRelayedStatusAtMs = 0;

  const store: AppStore = {
    identity: options.identity,
    status: signal(""),
    current: signal<PlayingItem | null>(null),
    playAttemptId: signal(0),
    history: signal<PlayingItem[]>([]),
    historyIndex: signal(-1),
    loop: signal(false),
    autoplay: signal(false),
    itemStates: createItemStateCache(),
    presets: signal<ApiPreset[]>([]),
    presetMenu: signal<PresetMenu>({ entries: [{ label: PRESET_MENU_LOADING, value: "" }], selectedValue: "" }),
    appliedFilter: signal(createDefaultFilterState()),
    activePresetName: signal<string | null>(null),
    headerExplicitNone: signal(false),
    randomizationMode: signal(readRandomizationMode(options.storage)),
    photoDurationSeconds: signal(readPhotoDuration(options.storage)),
    compatibilityBlocked: signal(false),
    pairingRequired: signal(false),

    setStatus(message, logText = message) {
      store.status.value = message;
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

    showPresetMenuMessage(text) {
      store.presetMenu.value = { entries: [{ label: text, value: "" }], selectedValue: "" };
    },

    pickHeaderPreset(value) {
      const pick = headerPresetPick(value);
      if (pick === "default") {
        store.headerExplicitNone.value = true;
      } else if (pick === "named") {
        store.headerExplicitNone.value = false;
      }
      const applied = store.appliedFilter.peek();
      const list = headerPresetListAfterPick(applied, store.presets.peek(), store.activePresetName.peek(), value);
      const changed = !filterStatesEqualForPresetMatch(list.filter, applied);
      if (changed) {
        store.appliedFilter.value = list.filter;
      }
      showPresetList(list);
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

    setPhotoDuration(text) {
      const next = Number.parseInt(text || "", 10);
      if (!isPhotoDuration(next)) {
        return;
      }
      store.photoDurationSeconds.value = next;
      options.storage.setItem(PHOTO_DURATION_KEY, String(next));
      emit("photoDurationChanged");
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

    openOverlay(overlay) {
      emit("overlayRequested", overlay);
    },

    on(event, listener) {
      listeners[event].push(listener);
    }
  };

  function showPresetList(list: HeaderPresetList): void {
    store.activePresetName.value = list.baseName;
    store.presetMenu.value = { entries: list.entries, selectedValue: list.selectedValue };
  }

  function emit<K extends keyof AppStoreEvents>(event: K, ...args: Parameters<AppStoreEvents[K]>): void {
    for (const listener of listeners[event]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  return store;
}
