import { computed, effect, type ReadonlySignal } from "@preact/signals";
import type { AppStore } from "./appStore";

/** The lasting states, in their precedence order: the player's indicator shows the first active one. */
export type LastingStateId = "reconnecting" | "incompatible" | "nolibrary" | "loading" | "refresh";

export const LASTING_STATE_ORDER: readonly LastingStateId[] = ["reconnecting", "incompatible", "nolibrary", "loading", "refresh"];

/** What the Library tab says in place of the grid while the server runs without a library. */
export function noLibraryText(libraryMessage: string | null): string {
  return libraryMessage ? `Running without a library. ${libraryMessage}` : "Running without a library.";
}

/**
 * Why the page loads nothing from the server, which the Library, Stats, and Randomization tabs say in place of what
 * they show: the compatibility message while the server fails the check, or its message for its library state while it
 * runs without a library. Null otherwise. It reads the store's signals, so a computed follows them.
 */
export function heldBackText(store: Pick<AppStore, "compatibilityBlocked" | "compatibilityMessage" | "noLibrary" | "libraryMessage">): string | null {
  if (store.compatibilityBlocked.value) {
    return store.compatibilityMessage.value;
  }
  return store.noLibrary.value ? noLibraryText(store.libraryMessage.value) : null;
}

/** The notice for Play, or a tile's play, while the server fails the compatibility check. */
export const INCOMPATIBLE_PLAY_NOTICE = "Cannot play: server compatibility check failed.";

/** The notice for Play, or a tile's play, while the server runs without a library. */
export const NO_LIBRARY_PLAY_NOTICE = "Cannot play: the server is running without a library.";

/** The notice Play, or a tile's play, shows while the server is held back, or null while it can play. */
export function playRefusalNotice(store: Pick<AppStore, "compatibilityBlocked" | "noLibrary">): string | null {
  if (store.compatibilityBlocked.peek()) {
    return INCOMPATIBLE_PLAY_NOTICE;
  }
  return store.noLibrary.peek() ? NO_LIBRARY_PLAY_NOTICE : null;
}

/** A lasting state as the player's indicator shows it. */
export interface LastingState {
  id: LastingStateId;
  /** The Material Symbols icon. */
  icon: string;
  /** The text, which ends in an ellipsis when the indicator is too narrow for it. */
  title: string;
  /** A percentage after the text, hidden from screen readers so each step isn't announced, or null. */
  progress: string | null;
  /** A state the server is in that keeps the page from working, whose icon is orange. */
  warning: boolean;
  /** Its icon spins, for something under way. */
  spins: boolean;
  /** It shows only while the player's controls show, as a refresh, which can run for hours, does. */
  followsControls: boolean;
  /** A second line the list behind the bell shows under it in Now, or null. */
  detail: string | null;
}

/** Reconnecting…'s second line in the list's Now. */
export const RECONNECTING_DETAIL = "The connection to the server was lost. ReelRoulette keeps trying.";

/** Every active lasting state, in the precedence order. */
export function activeLastingStates(store: AppStore): LastingState[] {
  const active: LastingState[] = [];
  if (store.reconnecting.value) {
    active.push({ id: "reconnecting", icon: "sync", title: "Reconnecting…", progress: null, warning: false, spins: true, followsControls: false, detail: RECONNECTING_DETAIL });
  }
  if (store.compatibilityBlocked.value) {
    active.push({
      id: "incompatible",
      icon: "sync_problem",
      title: "Server not compatible",
      progress: null,
      warning: true,
      spins: false,
      followsControls: false,
      detail: store.compatibilityMessage.value
    });
  }
  if (store.noLibrary.value) {
    active.push({
      id: "nolibrary",
      icon: "warning",
      title: "Running without a library",
      progress: null,
      warning: true,
      spins: false,
      followsControls: false,
      detail: store.libraryMessage.value
    });
  }
  if (store.loading.shown.value) {
    active.push({ id: "loading", icon: "progress_activity", title: "Loading…", progress: null, warning: false, spins: true, followsControls: false, detail: null });
  }
  const refresh = store.refreshProgress.value;
  if (refresh) {
    active.push({
      id: "refresh",
      icon: "autorenew",
      title: `Library refresh: ${refresh.stage}`,
      progress: `(${refresh.percent}%)`,
      warning: false,
      spins: true,
      followsControls: true,
      detail: null
    });
  }
  return active;
}

/** The text a lasting state relays to `last.log`. */
export function lastingStateText(state: LastingState): string {
  return state.progress ? `${state.title} ${state.progress}` : state.title;
}

/**
 * The player's indicator: the first active lasting state, so it never alternates, or nothing while the server asks
 * for pairing, whose prompt is the thing to act on. Each state relays its text to `last.log` once, when it starts
 * showing, and a refresh once per stage.
 */
export function createPlayerIndicator(store: AppStore): ReadonlySignal<LastingState | null> {
  const indicator = computed(() => (store.pairingRequired.value ? null : activeLastingStates(store)[0] ?? null));
  let relayed: string | null = null;
  effect(() => {
    const state = indicator.value;
    const key = state ? `${state.id}|${state.title}` : null;
    if (key !== relayed) {
      relayed = key;
      if (state) {
        store.relayStatus(lastingStateText(state));
      }
    }
  });
  return indicator;
}
