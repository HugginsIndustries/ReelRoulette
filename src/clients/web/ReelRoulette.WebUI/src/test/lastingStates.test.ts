import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { activeLastingStates, createPlayerIndicator, LASTING_STATE_ORDER, NO_LIBRARY_PLAY_NOTICE, noLibraryText } from "../state/lastingStates";

function setup() {
  const relayed: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message.split(" hasCurrent")[0]!)
  });
  const indicator = createPlayerIndicator(store);
  return { store, indicator, relayed };
}

/** Turns on every lasting state but the ones named. */
function activateAll(store: ReturnType<typeof setup>["store"]): void {
  store.reconnecting.value = true;
  store.compatibilityBlocked.value = true;
  store.libraryState.value = "newer";
  store.loading.hold("pick");
  vi.advanceTimersByTime(500);
  store.refreshProgress.value = { stage: "Scanning durations", percent: 40 };
}

describe("lasting states", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["reconnecting", (store: ReturnType<typeof setup>["store"]) => (store.reconnecting.value = true), "Reconnecting…", "sync"],
    ["incompatible", (store: ReturnType<typeof setup>["store"]) => (store.compatibilityBlocked.value = true), "Server not compatible", "sync_problem"],
    ["nolibrary", (store: ReturnType<typeof setup>["store"]) => (store.libraryState.value = "damaged"), "Running without a library", "warning"],
    [
      "loading",
      (store: ReturnType<typeof setup>["store"]) => {
        store.loading.hold("media");
        vi.advanceTimersByTime(500);
      },
      "Loading…",
      "progress_activity"
    ],
    [
      "refresh",
      (store: ReturnType<typeof setup>["store"]) => (store.refreshProgress.value = { stage: "Refreshing sources", percent: 10 }),
      "Library refresh: Refreshing sources",
      "autorenew"
    ]
  ])("shows %s alone", (id, activate, title, icon) => {
    const { store, indicator } = setup();
    expect(indicator.value).toBeNull();
    activate(store);
    expect(indicator.value).toMatchObject({ id, title, icon });
  });

  it("shows the first active state in the precedence order, so it never alternates", () => {
    const { store, indicator } = setup();
    activateAll(store);
    expect(activeLastingStates(store).map((state) => state.id)).toEqual(LASTING_STATE_ORDER);
    expect(LASTING_STATE_ORDER).toEqual(["reconnecting", "incompatible", "nolibrary", "loading", "refresh"]);

    const shown: string[] = [];
    for (const id of LASTING_STATE_ORDER) {
      shown.push(indicator.value!.id);
      if (id === "reconnecting") store.reconnecting.value = false;
      if (id === "incompatible") store.compatibilityBlocked.value = false;
      if (id === "nolibrary") store.libraryState.value = "ready";
      if (id === "loading") store.loading.release("pick");
      if (id === "refresh") store.refreshProgress.value = null;
    }
    expect(shown).toEqual(LASTING_STATE_ORDER);
    expect(indicator.value).toBeNull();
  });

  it("marks the server's states as warnings, spins what is under way, and lets only a refresh follow the controls", () => {
    const { store } = setup();
    activateAll(store);
    expect(activeLastingStates(store).map((state) => [state.id, state.warning, state.spins, state.followsControls])).toEqual([
      ["reconnecting", false, true, false],
      ["incompatible", true, false, false],
      ["nolibrary", true, false, false],
      ["loading", false, true, false],
      ["refresh", false, true, true]
    ]);
    expect(activeLastingStates(store).at(-1)!.progress).toBe("(40%)");
  });

  it("gives the server's states a second line for the list's Now: the reconnect's, and the server's own messages", () => {
    const { store } = setup();
    store.reconnecting.value = true;
    store.compatibilityBlocked.value = true;
    store.compatibilityMessage.value = "Unsupported server API version: 2.";
    store.libraryState.value = "newer";
    store.libraryMessage.value = "The library was saved by a newer version.";
    store.refreshProgress.value = { stage: "Scanning durations", percent: 40 };
    expect(activeLastingStates(store).map((state) => state.detail)).toEqual([
      "The connection to the server was lost. ReelRoulette keeps trying.",
      "Unsupported server API version: 2.",
      "The library was saved by a newer version.",
      null
    ]);
  });

  it("shows nothing while the server asks for pairing", () => {
    const { store, indicator } = setup();
    store.reconnecting.value = true;
    store.pairingRequired.value = true;
    expect(indicator.value).toBeNull();
    store.pairingRequired.value = false;
    expect(indicator.value!.id).toBe("reconnecting");
  });

  it("relays a state's text once when it starts showing, and a refresh once per stage", () => {
    const { store, relayed } = setup();
    store.reconnecting.value = true;
    // Still showing, so a change of something it doesn't show relays nothing.
    store.loading.hold("pick");
    vi.advanceTimersByTime(2_000);
    store.loading.release("pick");
    expect(relayed).toEqual(["status=Reconnecting…"]);
    store.reconnecting.value = false;
    vi.advanceTimersByTime(2_000);
    store.reconnecting.value = true;
    expect(relayed).toEqual(["status=Reconnecting…", "status=Reconnecting…"]);

    vi.advanceTimersByTime(2_000);
    relayed.length = 0;
    store.reconnecting.value = false;
    store.refreshProgress.value = { stage: "Refreshing sources", percent: 0 };
    store.refreshProgress.value = { stage: "Refreshing sources", percent: 50 };
    store.refreshProgress.value = { stage: "Scanning durations", percent: 0 };
    expect(relayed).toEqual(["status=Library refresh: Refreshing sources (0%)", "status=Library refresh: Scanning durations (0%)"]);
  });

  it("words the server without a library's message and Play's notice", () => {
    expect(noLibraryText("The library was saved by a newer version.")).toBe("Running without a library. The library was saved by a newer version.");
    expect(noLibraryText(null)).toBe("Running without a library.");
    expect(NO_LIBRARY_PLAY_NOTICE).toBe("Cannot play: the server is running without a library.");
  });
});
