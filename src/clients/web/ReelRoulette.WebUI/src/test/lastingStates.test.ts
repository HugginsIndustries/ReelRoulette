import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { activeLastingStates, createPlayerIndicator, LASTING_STATE_ORDER, NO_LIBRARY_PLAY_NOTICE, noLibraryText, UPDATE_DETAIL } from "../state/lastingStates";

function setup() {
  const relayed: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message.split(" hasCurrent")[0]!)
  });
  const indicator = createPlayerIndicator(store);
  return { store, indicator, relayed };
}

/** Turns on what every lasting state shows for, though the update notice is off while Reconnecting… shows. */
function activateAll(store: ReturnType<typeof setup>["store"]): void {
  store.reconnecting.value = true;
  store.differentBuild.value = true;
  store.compatibilityBlocked.value = true;
  store.libraryState.value = "newer";
  store.loading.hold("pick");
  vi.advanceTimersByTime(500);
  store.refreshProgress.value = { stage: "Scanning durations", percent: 40, line: "16 of 40 videos" };
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
    ["update", (store: ReturnType<typeof setup>["store"]) => (store.differentBuild.value = true), "ReelRoulette updated · Tap to reload", "refresh"],
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
      (store: ReturnType<typeof setup>["store"]) => (store.refreshProgress.value = { stage: "Refreshing sources", percent: 10, line: null }),
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
    expect(activeLastingStates(store).map((state) => state.id)).toEqual(["reconnecting", "incompatible", "nolibrary", "loading", "refresh"]);
    expect(LASTING_STATE_ORDER).toEqual(["reconnecting", "update", "incompatible", "nolibrary", "loading", "refresh"]);

    const shown: string[] = [];
    for (const id of LASTING_STATE_ORDER) {
      shown.push(indicator.value!.id);
      if (id === "reconnecting") store.reconnecting.value = false;
      if (id === "update") store.differentBuild.value = false;
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

  it("shows the update notice while the server serves a different build, not while Reconnecting… shows, and before Server not compatible", () => {
    const { store, indicator } = setup();
    store.differentBuild.value = true;
    expect(activeLastingStates(store)).toEqual([
      {
        id: "update",
        icon: "refresh",
        title: "ReelRoulette updated · Tap to reload",
        progress: null,
        warning: false,
        spins: false,
        followsControls: false,
        detail: "The server has a newer version. Reloading the page loads it.",
        reloads: true
      }
    ]);
    expect(UPDATE_DETAIL).toBe("The server has a newer version. Reloading the page loads it.");

    store.reconnecting.value = true;
    expect(activeLastingStates(store).map((state) => state.id)).toEqual(["reconnecting"]);
    store.reconnecting.value = false;
    expect(indicator.value!.id).toBe("update");

    // While the server also fails the compatibility check, the list shows both and the indicator the notice.
    store.compatibilityBlocked.value = true;
    expect(activeLastingStates(store).map((state) => state.id)).toEqual(["update", "incompatible"]);
    expect(indicator.value!.id).toBe("update");
  });

  it("lets only the update notice reload the page with a tap", () => {
    const { store } = setup();
    activateAll(store);
    store.reconnecting.value = false;
    expect(activeLastingStates(store).filter((state) => state.reloads).map((state) => state.id)).toEqual(["update"]);
  });

  it("gives the server's states and a refresh a second line for the list's Now: the reconnect's, the server's own messages, and the refresh's progress", () => {
    const { store } = setup();
    store.reconnecting.value = true;
    store.compatibilityBlocked.value = true;
    store.compatibilityMessage.value = "Unsupported server API version: 2.";
    store.libraryState.value = "newer";
    store.libraryMessage.value = "The library was saved by a newer version.";
    store.refreshProgress.value = { stage: "Scanning durations", percent: 40, line: "16 of 40 videos" };
    expect(activeLastingStates(store).map((state) => state.detail)).toEqual([
      "The connection to the server was lost. ReelRoulette keeps trying.",
      "Unsupported server API version: 2.",
      "The library was saved by a newer version.",
      "16 of 40 videos"
    ]);

    // A refresh before its first stage has no second line.
    store.refreshProgress.value = { stage: "Starting", percent: 0, line: null };
    expect(activeLastingStates(store).find((state) => state.id === "refresh")!.detail).toBeNull();
  });

  it("shows nothing while the server asks for pairing", () => {
    const { store, indicator } = setup();
    store.reconnecting.value = true;
    store.pairingRequired.value = true;
    expect(indicator.value).toBeNull();
    store.pairingRequired.value = false;
    expect(indicator.value!.id).toBe("reconnecting");
  });

  it("relays a state's text once when it starts showing, and a refresh once per stage whatever its second line", () => {
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
    store.refreshProgress.value = { stage: "Refreshing sources", percent: 0, line: null };
    store.refreshProgress.value = { stage: "Refreshing sources", percent: 50, line: "Source 1 of 2" };
    store.refreshProgress.value = { stage: "Refreshing sources", percent: 75, line: "Source 2 of 2 · 10 of 20 new files" };
    store.refreshProgress.value = { stage: "Scanning durations", percent: 0, line: null };
    store.refreshProgress.value = { stage: "Scanning durations", percent: 50, line: "20 of 40 videos" };
    // The second line, which the indicator never shows, relays nothing either.
    expect(relayed).toEqual(["status=Library refresh: Refreshing sources (0%)", "status=Library refresh: Scanning durations (0%)"]);
  });

  it("words the server without a library's message and Play's notice", () => {
    expect(noLibraryText("The library was saved by a newer version.")).toBe("Running without a library. The library was saved by a newer version.");
    expect(noLibraryText(null)).toBe("Running without a library.");
    expect(NO_LIBRARY_PLAY_NOTICE).toBe("Cannot play: the server is running without a library.");
  });
});
