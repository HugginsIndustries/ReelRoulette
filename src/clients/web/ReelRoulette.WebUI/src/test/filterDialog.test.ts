import { describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "../dialogs/dialogs";
import { createFilterDialog } from "../filter/filterDialog";
import { DEFAULT_FILTER_PRESET_REASON, DURATION_PROBLEM, FLAG_MODES_PROBLEM, NO_CHOSEN_PRESET_REASON } from "../filter/filterDialogModel";
import type { FilterDialog } from "../filter/filterDialog";
import { createDefaultFilterState, TAG_MATCH_MODE } from "../filter/filterStateModel";
import type { NotifyRequest } from "../notifications/notifications";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { createFakePresets, type FakePresets } from "./fakePresetServer";
import { EMPTY_FIELD } from "../validation/fieldValidation";

const FAVORITES: ApiPreset = { id: "preset-favorites", name: "Favorites", filterState: { favoritesMode: "only" } };
const LONG: ApiPreset = { id: "preset-long", name: "Long", filterState: { minDuration: "00:10:00" } };
const RECENT: ApiPreset = { id: "preset-recent", name: "Recent", filterState: { onlyNeverPlayed: true } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A device's Filter tab against a fake server, which keeps presets by id. Two devices can share `presets`. */
function setup(presets: ApiPreset[] = [FAVORITES], shared?: FakePresets) {
  const fakePresets = shared ?? createFakePresets(presets);
  const server = {
    /** The server's presets, kept by id, as `fakePresets` holds them; setting them stands for another device's change. */
    get presets(): ApiPreset[] {
      return fakePresets.list as ApiPreset[];
    },
    set presets(list: ApiPreset[]) {
      fakePresets.list = list.slice();
    },
    fakePresets,
    sourcesStatus: 200,
    /** The tag model's status, and its content type, for a proxy's page in place of JSON. */
    modelStatus: 200,
    modelType: "application/json",
    /** While set, the sources request waits for it, so a test can act while the dialog loads. */
    held: null as Promise<void> | null,
    requests: [] as Array<{ method: string; path: string; body: any }>,
    /** Holds the next loads until the returned function is called. */
    hold(): () => void {
      let release!: () => void;
      server.held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        server.held = null;
        release();
      };
    }
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    server.requests.push({ method, path, body });
    if (path === "/api/sources") {
      await server.held;
      return json([{ id: "source-1", displayName: "Movies" }, { id: "source-2", displayName: "Photos" }], server.sourcesStatus);
    }
    if (path === "/api/tag-editor/model") {
      const model = { categories: [{ id: "places", name: "Places", sortOrder: 0 }], tags: [{ name: "Beach", categoryId: "places" }] };
      const body = server.modelType === "application/json" ? JSON.stringify(model) : "<html>Bad gateway</html>";
      return new Response(body, { status: server.modelStatus, headers: { "Content-Type": server.modelType } });
    }
    return fakePresets.answer(method, path, body) ?? json({}, 404);
  }) as typeof fetch;

  /** The one-off messages' texts, in order, and the requests in full. */
  const messages: string[] = [];
  const notified: NotifyRequest[] = [];
  const notifications = {
    notify(request: NotifyRequest) {
      messages.push(request.text);
      notified.push(request);
    }
  };
  /** The keys the device store wrote, in order. */
  const deviceWrites: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore({ getItem: () => null, setItem: (key) => void deviceWrites.push(key) }),
    relay: () => {}
  });
  store.presets.value = presets.slice();
  store.syncHeaderPresets();
  const api = createAppApi("http://server", {
    onUnauthorized: () => {
      store.pairingRequired.value = true;
    },
    fetch: fetchImpl
  });
  const steps: string[] = [];
  const connectionListeners: Record<string, () => void> = {};
  const connection = {
    async loadPresets() {
      steps.push("loadPresets");
      store.presets.value = (await api.getJson("/api/presets")) as ApiPreset[];
      store.syncHeaderPresets();
      return true;
    },
    on(event: string, listener: () => void) {
      connectionListeners[event] = listener;
    }
  };
  /**
   * Reloads the presets for a preset event or a resync, as the connection does, with the server's list as it is now: the
   * store takes them, following the active preset when `activeChanged` says another device changed it, and the dialog
   * hears that they reloaded.
   */
  function presetEvent(options: { activeChanged?: boolean } = {}): void {
    const active = store.presets.peek().find((preset) => preset.id === store.activePresetId.peek()) ?? null;
    store.presetsReloaded(structuredClone(server.presets), options.activeChanged ? active : null);
    connectionListeners.presetsReloaded?.();
  }
  /** Tells the dialog the server is ready, as the connection does, and lets what it loads arrive. */
  async function serverReady(): Promise<void> {
    connectionListeners.serverReady?.();
    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  const library = {
    commitQuery: vi.fn(async () => {
      steps.push(`commitQuery favoritesMode=${store.appliedFilter.peek().favoritesMode}`);
    })
  };
  /** The dialog's own memory on this device, by key. */
  const remembered = new Map<string, string>();
  const device = createDeviceStore({
    getItem: (key: string) => remembered.get(key) ?? null,
    setItem: (key: string, value: string) => void remembered.set(key, value)
  });
  const confirm = vi.fn(async (_request: ConfirmRequest) => true);
  /** The messages shown in the in-app notice, in order, and the line each sent to the log. */
  const notices: string[] = [];
  const noticeLogs: string[] = [];
  const notice = async (message: string, logText = message) => {
    notices.push(message);
    noticeLogs.push(logText);
  };
  /** The panel, which Apply closes as the overlay. */
  const panel = {
    closeIfOverlay: vi.fn(async () => {
      steps.push("closeIfOverlay");
    })
  };
  const dialog = createFilterDialog({ store, api, connection, library, panel, device, dialogs: { confirm, notice }, notifications });
  const view = () => dialog.view.value!;
  /** The fields the dialog moved to, each with the section it showed as it did, as the fields' components move. */
  const moves: string[] = [];
  for (const field of ["flagModes", "minDuration", "maxDuration", "newPresetName"] as const) {
    dialog.reveal.attach(field, () => moves.push(`${field} on ${dialog.tab.peek()}`));
  }
  return {
    dialog,
    view,
    store,
    server,
    messages,
    notified,
    notices,
    noticeLogs,
    steps,
    library,
    remembered,
    confirm,
    panel,
    deviceWrites,
    serverReady,
    presetEvent,
    moves
  };
}

/** The id of the preset at `index` in the tab's list, or one no preset has past its end. */
function presetIdAt(dialog: FilterDialog, index: number): string {
  return dialog.view.value?.presets[index]?.id ?? "no-such-preset";
}

/** An action that is neither disabled nor held. */
const FREE = { disabled: false, heldBy: null };
const DISABLED = { disabled: true, heldBy: null };

function heldBy(field: string) {
  return { disabled: false, heldBy: field };
}

describe("opening", () => {
  it("loads sources, tags, and presets, then starts on General from the applied filter and the preset dropdown's preset", async () => {
    const { dialog, view, store, server } = setup();
    store.pickHeaderPreset("preset-favorites");
    expect(dialog.view.value).toBeNull();
    expect(dialog.tab.value).toBeNull();

    await dialog.open();

    expect(server.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /api/sources",
      "POST /api/tag-editor/model",
      "GET /api/presets"
    ]);
    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.tab.value).toBe("general");
    expect(view().working.favoritesMode).toBe("only");
    expect(view().general).toMatchObject({ favoritesOn: true, favoritesChoice: "only" });
    expect(view().sources.map((source) => source.id)).toEqual(["source-1", "source-2"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
    expect(view().heading).toBe("Preset: Favorites");
    expect(view().unsaved).toBe(false);
  });

  it("shows but loads nothing while the server is incompatible, and says why when its data cannot load", async () => {
    const { dialog, store, server, messages, notices } = setup();
    store.compatibilityBlocked.value = true;
    await dialog.open();
    expect(server.requests).toHaveLength(0);
    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.view.value).toBeNull();
    await dialog.refresh();
    expect(server.requests).toHaveLength(0);
    expect(dialog.view.value).toBeNull();
    dialog.close();

    store.compatibilityBlocked.value = false;
    server.sourcesStatus = 500;
    await dialog.open();
    expect(notices).toEqual(["Filter load failed: HTTP 500"]);
    expect(messages).toEqual([]);
    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.view.value).toBeNull();
    expect(dialog.tab.value).toBeNull();
  });

  it("loads, refreshes, and applies nothing while the server runs without a library, with no notice", async () => {
    const { dialog, view, store, server, messages, notices, steps, library, panel } = setup();
    store.libraryState.value = "damaged";
    await dialog.open();
    expect(server.requests).toHaveLength(0);
    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.view.value).toBeNull();
    await dialog.refresh();
    expect(server.requests).toHaveLength(0);
    expect(dialog.view.value).toBeNull();
    dialog.close();

    // The server restarted without its library after the tab loaded.
    store.libraryState.value = "ready";
    await dialog.open();
    const loaded = server.requests.length;
    steps.length = 0;
    dialog.changeGeneral({ onlyNeverPlayed: true });
    expect(view().unsaved).toBe(true);
    store.libraryState.value = "newer";
    await dialog.refresh();
    await dialog.apply();
    expect(server.requests).toHaveLength(loaded);
    expect(steps).toEqual([]);
    expect(library.commitQuery).not.toHaveBeenCalled();
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(store.appliedFilter.value.onlyNeverPlayed).toBe(false);
    expect(notices).toEqual([]);
    expect(messages).toEqual([]);
  });

  it("loads once the server is ready while it shows, keeping its changes, and not while it is hidden", async () => {
    const { dialog, view, store, server, notices, serverReady } = setup();
    // It showed while the server had no library, as a tab remembered open does, and loaded nothing.
    store.libraryState.value = "damaged";
    await dialog.open();
    expect(dialog.view.value).toBeNull();
    store.libraryState.value = "ready";
    await serverReady();
    expect(server.requests.map((request) => request.path)).toEqual(["/api/sources", "/api/tag-editor/model", "/api/presets"]);
    expect(view().sources.map((source) => source.id)).toEqual(["source-1", "source-2"]);
    expect(dialog.tab.value).toBe("general");

    // The server restarted without its library while the tab held changes, and came back with it.
    dialog.changeGeneral({ onlyNeverPlayed: true });
    store.libraryState.value = "newer";
    store.libraryState.value = "ready";
    await serverReady();
    expect(server.requests).toHaveLength(6);
    expect(view().general.onlyNeverPlayed).toBe(true);
    expect(view().unsaved).toBe(true);

    // Hidden, it loads as it shows again.
    dialog.close();
    await serverReady();
    expect(server.requests).toHaveLength(6);
    expect(notices).toEqual([]);
  });

  it("Refresh before anything has loaded loads as showing the tab does, and says so, as Refresh after it does", async () => {
    const { dialog, view, server, messages, notified, notices } = setup();
    server.sourcesStatus = 500;
    await dialog.open();
    expect(dialog.view.value).toBeNull();

    await dialog.refresh();
    expect(notices.at(-1)).toBe("Filter refresh failed: HTTP 500");
    expect(messages).toEqual([]);
    expect(dialog.view.value).toBeNull();

    server.sourcesStatus = 200;
    await dialog.refresh();
    expect(messages.at(-1)).toBe("Filter data refreshed.");
    expect(dialog.tab.value).toBe("general");
    expect(view().sources.map((source) => source.id)).toEqual(["source-1", "source-2"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);

    await dialog.refresh();
    const refreshed = { kind: "actions", text: "Filter data refreshed.", key: "filter" };
    expect(notified).toEqual([refreshed, refreshed]);
  });

  it("reads a failed tag model as HTTP and its status, on loading and on Refresh", async () => {
    const { dialog, server, messages, notices } = setup();
    server.modelStatus = 503;
    await dialog.open();
    expect(notices).toEqual(["Filter load failed: HTTP 503"]);

    server.modelStatus = 200;
    await dialog.open();
    server.modelStatus = 503;
    await dialog.refresh();
    expect(notices).toEqual(["Filter load failed: HTTP 503", "Filter refresh failed: HTTP 503"]);
    expect(messages).toEqual([]);
  });

  it("names the content type of a tag model that isn't JSON, such as a proxy's page", async () => {
    const { dialog, server, notices } = setup();
    server.modelType = "text/html";
    await dialog.open();
    expect(notices).toEqual(["Filter load failed: The server sent an unexpected response (text/html)."]);
    expect(dialog.view.value).toBeNull();
  });

  it.each([
    ["tag model", "modelStatus"],
    ["sources", "sourcesStatus"]
  ] as const)("shows only the pairing prompt when the %s answers 401, on loading and on Refresh", async (_name, field) => {
    const { dialog, store, server, messages, notices } = setup();
    server[field] = 401;
    await dialog.open();
    expect(store.pairingRequired.value).toBe(true);
    expect(notices).toEqual([]);
    expect(dialog.view.value).toBeNull();

    await dialog.refresh();
    server[field] = 200;
    await dialog.refresh();
    server[field] = 401;
    await dialog.refresh();
    expect(notices).toEqual([]);
    expect(messages).toEqual(["Filter data refreshed."]);
  });

  it("keeps its changes and its section while it hides, and shows them again as it loads again", async () => {
    const { dialog, view, server } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);
    dialog.typeNewPresetName("Draft");
    dialog.showTab("presets");
    expect(view().unsaved).toBe(true);
    dialog.close();
    expect(dialog.isOpen.value).toBe(false);
    expect(view().unsaved).toBe(true);

    const release = server.hold();
    const opening = dialog.open();
    const kept = () => {
      expect(dialog.isOpen.value).toBe(true);
      expect(dialog.tab.value).toBe("presets");
      expect(view().working.onlyNeverPlayed).toBe(true);
      expect(view().general.onlyNeverPlayed).toBe(true);
      expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
      expect(view().presetsChanged).toBe(true);
      expect(view().newPresetName).toBe("Draft");
      expect(view().unsaved).toBe(true);
    };
    kept();
    release();
    await opening;
    kept();
  });

  it("counts a duration still being typed as its field reads, as an unsaved change, and keeps it while it hides, until Apply takes it", async () => {
    const { dialog, view, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.typeDuration("max", "10:00");
    expect(view().working.maxDurationSeconds).toBeNull();
    expect(view()).toMatchObject({ unsaved: true });
    dialog.close();
    await dialog.open();
    expect(view().general.maxText).toBe("10:00");
    expect(view()).toMatchObject({ unsaved: true });

    dialog.typeDuration("max", "1:7x");
    expect(view()).toMatchObject({ unsaved: true });
    dialog.typeDuration("max", "");
    expect(view()).toMatchObject({ unsaved: false });

    // Text that reads as the applied duration is no change, so the change is gone once Apply takes "90" as 01:30.
    dialog.typeDuration("min", "90");
    expect(view().unsaved).toBe(true);
    await dialog.apply();
    expect(store.appliedFilter.peek().minDurationSeconds).toBe(90);
    expect(view().general.minText).toBe("90");
    expect(view().unsaved).toBe(false);

    // Any other change is unsaved too.
    dialog.changeGeneral({ onlyNeverPlayed: true });
    expect(view()).toMatchObject({ unsaved: true });
  });

  it("without unsaved changes, starts over from the applied filter when it shows, keeping its section", async () => {
    const { dialog, view, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.showTab("tags");
    dialog.close();
    store.appliedFilter.value = { ...createDefaultFilterState(), onlyNeverPlayed: true };

    await dialog.open();
    expect(dialog.tab.value).toBe("tags");
    expect(view().working.onlyNeverPlayed).toBe(true);
    expect(view().general.onlyNeverPlayed).toBe(true);
    expect(view().unsaved).toBe(false);
  });

  it("keeps changes made while it loads again, and the section they were made in, and takes what loaded", async () => {
    const { dialog, view, server } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.close();

    const release = server.hold();
    const opening = dialog.open();
    dialog.showTab("presets");
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.changeGeneral({ favoritesChoice: "excluded" });
    dialog.typeDuration("min", "1:30");
    dialog.typeNewPresetName("Draft");
    server.presets = [FAVORITES, RECENT, LONG];
    release();
    await opening;

    expect(dialog.tab.value).toBe("presets");
    expect(view().working.onlyNeverPlayed).toBe(true);
    expect(view().general.onlyNeverPlayed).toBe(true);
    expect(view().general.minText).toBe("1:30");
    expect(view().working.minDurationSeconds).toBeNull();
    expect(view().general.favoritesChoice).toBe("excluded");
    expect(view().working.favoritesMode).toBe("off");
    expect(view().general.sourceChecked).toEqual([true, true]);
    expect(view().newPresetName).toBe("Draft");
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Long"]);
    expect(view().unsaved).toBe(true);
  });
});

describe("General tab", () => {
  it("keeps a typed duration out of the working filter until the field changes", async () => {
    const { dialog, view } = setup();
    await dialog.open();

    dialog.typeDuration("max", "2:00");
    expect(view().general.maxText).toBe("2:00");
    expect(view().working.maxDurationSeconds).toBeNull();
    // The unsaved changes read the field as it is typed.
    expect(view().unsaved).toBe(true);

    dialog.changeGeneral({ maxText: "2:00" });
    expect(view().working.maxDurationSeconds).toBe(120);
    expect(view().unsaved).toBe(true);
  });

  it("keeps text that is not valid as the user left it, and reads an emptied duration as no limit", async () => {
    const { dialog, view } = setup();
    await dialog.open();
    expect(view().general).toMatchObject({ minText: "", maxText: "" });

    dialog.changeGeneral({ minText: "abc" });
    expect(view().general.minText).toBe("abc");
    expect(view().working.minDurationSeconds).toBeNull();

    dialog.changeGeneral({ minText: "1:30" });
    expect(view().working.minDurationSeconds).toBe(90);
    dialog.changeGeneral({ minText: "" });
    expect(view().working.minDurationSeconds).toBeNull();
    expect(view().unsaved).toBe(false);
  });

  it("flags a duration that is not valid as it is typed, and not an empty one", async () => {
    const { dialog, view } = setup();
    await dialog.open();
    expect(view().problems).toMatchObject({ minDuration: null, maxDuration: null });

    dialog.typeDuration("min", "1:7x");
    expect(view().problems.minDuration).toEqual({ message: DURATION_PROBLEM });
    expect(view().flagged.minDuration).toBe(true);
    dialog.typeDuration("min", "1:07");
    expect(view().problems.minDuration).toBeNull();
    expect(view().flagged.minDuration).toBe(false);

    dialog.typeDuration("max", "12abc");
    expect(view().flagged.maxDuration).toBe(true);
    dialog.typeDuration("max", "");
    expect(view().problems.maxDuration).toBeNull();
    expect(view().flagged.maxDuration).toBe(false);
  });

  it("holds Apply on a duration that is not valid, with or without other changes, and moves to it without a status", async () => {
    const { dialog, view, messages, library, server, store, panel, moves } = setup();
    await dialog.open();
    dialog.typeDuration("min", "abc");
    expect(view().unsaved).toBe(true);
    expect(view().actions.apply).toEqual(heldBy("minDuration"));
    dialog.showTab("tags");

    await dialog.apply();
    expect(dialog.tab.value).toBe("general");
    expect(moves).toEqual(["minDuration on general"]);
    expect(dialog.isOpen.value).toBe(true);
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(view().general.minText).toBe("abc");

    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);
    expect(view().unsaved).toBe(true);
    dialog.showTab("presets");
    await dialog.apply();
    expect(dialog.tab.value).toBe("general");
    expect(moves).toEqual(["minDuration on general", "minDuration on general"]);
    expect(server.requests.filter((request) => request.method === "POST")).toEqual([
      expect.objectContaining({ path: "/api/tag-editor/model" })
    ]);
    expect(library.commitQuery).not.toHaveBeenCalled();
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(messages).toEqual([]);

    dialog.typeDuration("min", "1:30");
    expect(view().actions.apply).toEqual(FREE);
    await dialog.apply();
    expect(store.appliedFilter.peek()).toMatchObject({ minDurationSeconds: 90, onlyNeverPlayed: true });
    expect(library.commitQuery).toHaveBeenCalledTimes(1);
  });

  it("flags Favorites only with Blacklisted only, and no other pairing, and holds every action that uses it", async () => {
    const { dialog, view, messages, library, moves } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.typeNewPresetName("Mine");

    dialog.changeGeneral({ favoritesOn: true, favoritesChoice: "only", blacklistedOn: true, blacklistedChoice: "excluded" });
    expect(view().problems.flagModes).toBeNull();
    dialog.changeGeneral({ blacklistedChoice: "only" });
    expect(view().problems.flagModes).toEqual({ message: FLAG_MODES_PROBLEM });
    expect(view().flagged.flagModes).toBe(true);
    expect(view().actions).toEqual({ apply: heldBy("flagModes"), addPreset: heldBy("flagModes"), updatePreset: heldBy("flagModes") });

    dialog.showTab("presets");
    dialog.addPreset();
    expect(dialog.tab.value).toBe("general");
    dialog.showTab("presets");
    dialog.updatePreset();
    expect(dialog.tab.value).toBe("general");
    await dialog.apply();
    expect(moves).toEqual(["flagModes on general", "flagModes on general", "flagModes on general"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presets[1]!.filterState.favoritesMode).toBe("off");
    expect(view().presetsChanged).toBe(false);
    expect(library.commitQuery).not.toHaveBeenCalled();
    expect(messages).toEqual([]);

    dialog.changeGeneral({ favoritesOn: false });
    expect(view().actions).toEqual({ apply: FREE, addPreset: FREE, updatePreset: FREE });
  });

  it("stores the checked sources", async () => {
    const { dialog, view } = setup();
    await dialog.open();
    dialog.checkSource(0, false);
    expect(view().working.includedSourceIds).toEqual(["source-2"]);
    dialog.checkSource(0, true);
    expect(view().working.includedSourceIds).toEqual([]);
  });
});

describe("Tags tab", () => {
  it("toggles tags and match modes into the working filter", async () => {
    const { dialog, view } = setup();
    await dialog.open();

    dialog.toggleTag("Beach", "include");
    dialog.setGlobalMatch(false);
    dialog.setLocalMatch("places", 1);
    expect(view().working).toMatchObject({ selectedTags: ["Beach"], globalMatchMode: false, categoryLocalMatchModes: { places: 1 } });
    expect(view().heading).toBe("Preset: None*");
  });

  it("remembers on this device which categories are expanded, starting with none, and ignores a value it cannot read", async () => {
    const { dialog, view, remembered } = setup();
    remembered.set("rr_device.filter.expandedTagCategories", "not json");
    await dialog.open();
    expect([...view().expanded]).toEqual([]);

    dialog.toggleCategory("places");
    expect(remembered.get("rr_device.filter.expandedTagCategories")).toBe('["places"]');
    await dialog.open();
    expect([...view().expanded]).toEqual(["places"]);
    dialog.toggleCategory("places");
    expect(remembered.get("rr_device.filter.expandedTagCategories")).toBe("[]");
  });
});

describe("Presets tab", () => {
  it("adds, moves, renames, and deletes presets in the working copy, and keeps a typed name meanwhile", async () => {
    const { dialog, view, messages, confirm } = setup([FAVORITES, RECENT]);
    await dialog.open();

    dialog.typeNewPresetName("Draft name");
    dialog.movePreset(0, 1);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().newPresetName).toBe("Draft name");
    dialog.movePreset(0, -1);
    dialog.movePreset(1, 2);
    dialog.movePreset(1, 1);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);

    dialog.changeGeneral({ maxText: "10:00" });
    dialog.typeNewPresetName("  Mine ");
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites", "Mine"]);
    expect(view().newPresetName).toBe("");
    expect(dialog.tab.value).toBe("presets");

    dialog.editPreset(presetIdAt(dialog, 2));
    dialog.typePresetName("Ours");
    dialog.savePresetEdit();
    expect(view().heading).toBe("Preset: Ours");

    dialog.editPreset(presetIdAt(dialog, 2));
    confirm.mockResolvedValueOnce(false);
    await dialog.deleteEditedPreset();
    expect(view().presets).toHaveLength(3);
    await dialog.deleteEditedPreset();
    expect(confirm).toHaveBeenLastCalledWith({ message: 'Delete preset "Ours"?', confirmLabel: "Delete", danger: true });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().presetsChanged).toBe(true);
    expect(messages).toEqual([]);
  });

  it("disables Add Preset while the new name is empty, without a flag or a move, even while a General field has a problem", async () => {
    const { dialog, view, messages, moves } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ maxText: "10:00" });
    expect(view().problems.newPresetName).toBe(EMPTY_FIELD);
    expect(view().flagged.newPresetName).toBe(false);
    expect(view().actions.addPreset).toEqual(DISABLED);

    dialog.showTab("presets");
    expect(dialog.addPreset()).toBe(false);
    expect(dialog.tab.value).toBe("presets");
    expect(moves).toEqual([]);
    expect(view().presets).toHaveLength(1);

    dialog.typeNewPresetName("M");
    dialog.typeNewPresetName("  ");
    expect(view().flagged.newPresetName).toBe(false);
    expect(view().actions.addPreset).toEqual(DISABLED);

    dialog.typeDuration("min", "abc");
    expect(view().actions).toEqual({
      apply: heldBy("minDuration"),
      addPreset: DISABLED,
      updatePreset: { ...DISABLED, reason: NO_CHOSEN_PRESET_REASON }
    });
    expect(dialog.addPreset()).toBe(false);
    expect(dialog.tab.value).toBe("presets");
    expect(moves).toEqual([]);
    dialog.typeDuration("min", "");

    dialog.typeNewPresetName("Mine");
    expect(view().actions.addPreset).toEqual(FREE);
    expect(dialog.addPreset()).toBe(true);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Mine"]);
    expect(view().newPresetName).toBe("");
    expect(view().flagged.newPresetName).toBe(false);
    expect(messages).toEqual([]);
  });

  it("flags a new name another preset has, ignoring case, and disables Add Preset without a move, even while a General field has a problem", async () => {
    const { dialog, view, messages, moves } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ maxText: "10:00" });
    dialog.showTab("presets");

    dialog.typeNewPresetName("recent");
    expect(view().problems.newPresetName).toEqual({ message: "Use a name no other preset has." });
    expect(view().flagged.newPresetName).toBe(true);
    expect(view().actions.addPreset).toEqual(DISABLED);
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(dialog.tab.value).toBe("presets");
    expect(moves).toEqual([]);

    dialog.typeDuration("max", "1:75");
    expect(view().actions.addPreset).toEqual(DISABLED);
    dialog.addPreset();
    expect(dialog.tab.value).toBe("presets");
    expect(moves).toEqual([]);
    expect(view().presetsChanged).toBe(false);
    expect(messages).toEqual([]);
  });

  it("holds Add Preset and Update on a duration that is not valid", async () => {
    const { dialog, view, messages, moves } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    dialog.typeNewPresetName("Mine");
    dialog.typeDuration("max", "1:75");
    expect(view().actions).toEqual({ apply: heldBy("maxDuration"), addPreset: heldBy("maxDuration"), updatePreset: heldBy("maxDuration") });

    dialog.showTab("presets");
    dialog.addPreset();
    expect(dialog.tab.value).toBe("general");
    expect(moves).toEqual(["maxDuration on general"]);
    dialog.showTab("presets");
    dialog.updatePreset();
    expect(dialog.tab.value).toBe("general");
    expect(moves).toEqual(["maxDuration on general", "maxDuration on general"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(messages).toEqual([]);

    dialog.typeDuration("max", "2:00");
    dialog.updatePreset();
    expect(view().presets[1]!.filterState.maxDurationSeconds).toBe(120);
    // Recent now has this filter, so Mine takes one of its own.
    dialog.typeDuration("max", "3:00");
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Mine"]);
  });

  it("leaves the General tab as the user left it when a preset is deleted", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ minText: "abc" });

    dialog.editPreset(presetIdAt(dialog, 1));
    await dialog.deleteEditedPreset();

    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
    expect(view().general).toMatchObject({ minText: "abc" });
  });

  it("updates the chosen preset with the working filter", async () => {
    const { dialog, view, messages, notified, notices } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ maxText: "10:00" });
    expect(view().actions.updatePreset).toEqual({ ...DISABLED, reason: NO_CHOSEN_PRESET_REASON });
    dialog.updatePreset();
    expect(notices).toEqual([]);
    expect(messages).toEqual([]);

    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    dialog.changeGeneral({ favoritesOn: true });
    expect(view().heading).toBe("Preset: Recent*");
    dialog.updatePreset();
    // The log leaves the preset's name out.
    expect(notified).toEqual([
      {
        kind: "actions",
        text: 'Updated preset "Recent" locally — Apply to save.',
        key: "filter",
        logText: "Updated preset locally — Apply to save."
      }
    ]);
    expect(view().presets[1]!.filterState).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: true });
    expect(view().heading).toBe("Preset: Recent");
  });

  it("updates the preset Choose Preset has chosen, not the one the heading names", async () => {
    const { dialog, view, notified } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    dialog.changeGeneral({ maxText: "10:00" });
    expect(view().heading).toBe("Preset: Recent*");
    const recent = structuredClone(view().presets[1]!.filterState);

    dialog.choosePreset(FAVORITES.id);
    dialog.updatePreset();
    expect(notified.at(-1)?.text).toBe('Updated preset "Favorites" locally — Apply to save.');
    expect(view().presets[0]!.filterState).toEqual(view().working);
    expect(view().presets[1]!.filterState).toEqual(recent);
    expect(view().heading).toBe("Preset: Favorites");
  });
});

describe("Edit Preset", () => {
  it("opens on a preset with its name, and Cancel, Close, or opening the dialog again closes it without a change", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    expect(view().presetEdit).toBeNull();

    dialog.editPreset(presetIdAt(dialog, 1));
    expect(view().presetEdit).toEqual({ id: RECENT.id, name: "Recent" });
    expect(view().presetEditProblem).toBeNull();
    expect(view().presetEditFlagged).toBe(false);
    dialog.typePresetName("Fresh");
    expect(view().presetEdit).toEqual({ id: RECENT.id, name: "Fresh" });
    dialog.cancelPresetEdit();
    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);

    dialog.editPreset(presetIdAt(dialog, 2));
    expect(view().presetEdit).toBeNull();

    dialog.editPreset(presetIdAt(dialog, 0));
    dialog.close();
    expect(view().presetEdit).toBeNull();
    await dialog.open();
    dialog.editPreset(presetIdAt(dialog, 0));
    await dialog.open();
    expect(view().presetEdit).toBeNull();
  });

  it("flags another preset's name, ignoring case, finds an empty name required without a flag, and saves neither", async () => {
    const { dialog, view, messages } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.editPreset(presetIdAt(dialog, 1));

    dialog.typePresetName("favorites ");
    expect(view().presetEditProblem).toEqual({ message: "Use a name no other preset has." });
    expect(view().presetEditFlagged).toBe(true);
    dialog.savePresetEdit();
    expect(view().presetEdit).toEqual({ id: RECENT.id, name: "favorites " });

    dialog.typePresetName("   ");
    expect(view().presetEditProblem).toBe(EMPTY_FIELD);
    expect(view().presetEditFlagged).toBe(false);
    dialog.savePresetEdit();
    expect(view().presetEdit).toEqual({ id: RECENT.id, name: "   " });

    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(messages).toEqual([]);

    dialog.typePresetName("RECENT");
    expect(view().presetEditProblem).toBeNull();
    dialog.savePresetEdit();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "RECENT"]);
  });

  it("just closes on Save with the name unchanged, without a change", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.editPreset(presetIdAt(dialog, 1));
    dialog.typePresetName("  Recent ");

    dialog.savePresetEdit();

    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(view().unsaved).toBe(false);
  });

  it("renames to the trimmed name, the heading and chosen preset follow, and Apply saves the rename", async () => {
    const { dialog, view, server } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    dialog.editPreset(presetIdAt(dialog, 1));
    dialog.typePresetName("  Fresh ");

    dialog.savePresetEdit();

    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Fresh"]);
    expect(view()).toMatchObject({ headingPreset: RECENT.id, chosenPreset: RECENT.id });
    expect(view().heading).toBe("Preset: Fresh");
    expect(view().presetsChanged).toBe(true);
    expect(view().unsaved).toBe(true);

    await dialog.apply();
    expect(server.fakePresets.summaries()).toEqual(["rename preset-recent Fresh"]);
    expect(server.presets.map((preset) => preset.name)).toEqual(["Favorites", "Fresh"]);
  });

  it("asks before Delete about the preset as it opened, stays open with the typed name on Cancel, and deletes it on confirm", async () => {
    const { dialog, view, confirm } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    dialog.editPreset(presetIdAt(dialog, 1));
    dialog.typePresetName("Other");

    confirm.mockResolvedValueOnce(false);
    await dialog.deleteEditedPreset();
    expect(confirm).toHaveBeenCalledWith({ message: 'Delete preset "Recent"?', confirmLabel: "Delete", danger: true });
    expect(view().presetEdit).toEqual({ id: RECENT.id, name: "Other" });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);

    await dialog.deleteEditedPreset();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
    expect(view()).toMatchObject({ headingPreset: null, chosenPreset: null });
    expect(view().heading).toBe("Preset: None*");
    expect(view().presetsChanged).toBe(true);
  });
});

describe("two devices", () => {
  it("keep a preset one saved while the other, with its preset list open, saves a different one", async () => {
    const shared = createFakePresets([FAVORITES]);
    const first = setup([FAVORITES], shared);
    const second = setup([FAVORITES], shared);
    await first.dialog.open();
    await second.dialog.open();

    first.dialog.changeGeneral({ onlyNeverPlayed: true });
    first.dialog.typeNewPresetName("Unplayed");
    first.dialog.addPreset();
    await first.dialog.apply();
    second.dialog.changeGeneral({ onlyKnownDuration: true });
    second.dialog.typeNewPresetName("Known duration");
    second.dialog.addPreset();
    await second.dialog.apply();

    expect(shared.list.map((preset) => preset.name)).toEqual(["Favorites", "Unplayed", "Known duration"]);
    expect(second.view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Unplayed", "Known duration"]);
  });
});

describe("per-preset writes", () => {
  /** A device's tab on Favorites, Recent, and Long. */
  async function opened() {
    const device = setup([FAVORITES, RECENT, LONG]);
    await device.dialog.open();
    return device;
  }

  function rename(dialog: FilterDialog, id: string, name: string): void {
    dialog.editPreset(id);
    dialog.typePresetName(name);
    dialog.savePresetEdit();
  }

  /** The default filter with `change` made, as Load on None and the General fields give it. */
  function filterTo(dialog: FilterDialog, change: Parameters<FilterDialog["changeGeneral"]>[0]): void {
    dialog.choosePreset("");
    dialog.loadPreset();
    dialog.changeGeneral(change);
  }

  /** Writes that filter into the preset with `id`, as Update does. */
  function update(dialog: FilterDialog, id: string, change: Parameters<FilterDialog["changeGeneral"]>[0]): void {
    filterTo(dialog, change);
    dialog.choosePreset(id);
    dialog.updatePreset();
  }

  /** Adds a preset with that filter, as Add Preset does. */
  function add(dialog: FilterDialog, name: string, change: Parameters<FilterDialog["changeGeneral"]>[0]): void {
    filterTo(dialog, change);
    dialog.typeNewPresetName(name);
    dialog.addPreset();
  }

  it("sends one write for each change, in order, and the server's list becomes the tab's", async () => {
    const { dialog, view, server, notices } = await opened();
    dialog.editPreset(LONG.id);
    await dialog.deleteEditedPreset();
    rename(dialog, RECENT.id, "Fresh");
    update(dialog, FAVORITES.id, { onlyKnownDuration: true });
    add(dialog, "Mine", { onlyKnownLoudness: true });
    dialog.movePreset(2, 0);

    await dialog.apply();

    expect(notices).toEqual([]);
    expect(server.fakePresets.summaries()).toEqual([
      "delete preset-long",
      "rename preset-recent Fresh",
      "update preset-favorites",
      "create Mine",
      "reorder preset-4,preset-favorites,preset-recent"
    ]);
    expect(server.fakePresets.writes.every((write) => write.body.clientId === "client-1")).toBe(true);
    expect(server.presets.map((preset) => [preset.id, preset.name])).toEqual([
      ["preset-4", "Mine"],
      ["preset-favorites", "Favorites"],
      ["preset-recent", "Fresh"]
    ]);
    expect(view().presets.map((preset) => preset.id)).toEqual(["preset-4", "preset-favorites", "preset-recent"]);
    expect(view().presetsChanged).toBe(false);
  });

  it("saves a delete then an add of one name, a rename then an add of the old name, and a filter moved to a new preset", async () => {
    const deleted = await opened();
    deleted.dialog.editPreset(RECENT.id);
    await deleted.dialog.deleteEditedPreset();
    add(deleted.dialog, "Recent", { onlyKnownDuration: true });
    await deleted.dialog.apply();
    expect(deleted.server.fakePresets.summaries()).toEqual(["delete preset-recent", "create Recent"]);

    const renamedAway = await opened();
    rename(renamedAway.dialog, RECENT.id, "Fresh");
    add(renamedAway.dialog, "Recent", { onlyKnownDuration: true });
    await renamedAway.dialog.apply();
    expect(renamedAway.server.fakePresets.summaries()).toEqual(["rename preset-recent Fresh", "create Recent"]);

    const moved = await opened();
    update(moved.dialog, FAVORITES.id, { onlyKnownDuration: true });
    add(moved.dialog, "Mine", { favoritesOn: true });
    await moved.dialog.apply();
    expect(moved.server.fakePresets.summaries()).toEqual(["update preset-favorites", "create Mine"]);

    expect([...deleted.notices, ...renamedAway.notices, ...moved.notices]).toEqual([]);
  });

  it("saves a chain of renames, each after the one that frees its name, though the list has them the other way round", async () => {
    const { dialog, server, notices } = await opened();
    rename(dialog, LONG.id, "Longest");
    rename(dialog, RECENT.id, "Long");
    rename(dialog, FAVORITES.id, "Recent");

    await dialog.apply();

    expect(notices).toEqual([]);
    expect(server.fakePresets.summaries()).toEqual([
      "rename preset-long Longest",
      "rename preset-recent Long",
      "rename preset-favorites Recent"
    ]);
  });

  it("blocks Apply while presets would take each other's names or filters, saying why in a notice whose log leaves their names out", async () => {
    const swapped = await opened();
    rename(swapped.dialog, FAVORITES.id, "Spare");
    rename(swapped.dialog, RECENT.id, "Favorites");
    rename(swapped.dialog, FAVORITES.id, "Recent");
    const names = 'Presets "Recent" and "Favorites" would take each other\'s names. Apply in two steps: give one of them another name, apply, then rename it.';
    expect(swapped.view().actions.apply).toEqual({
      ...FREE,
      reason: names,
      blocked: { logText: "Presets would take each other's names. Apply in two steps." }
    });
    await swapped.dialog.apply();
    expect(swapped.notices).toEqual([names]);
    expect(swapped.noticeLogs).toEqual(["Presets would take each other's names. Apply in two steps."]);
    expect(swapped.server.fakePresets.writes).toEqual([]);
    expect(swapped.store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(swapped.library.commitQuery).not.toHaveBeenCalled();

    const rotated = await opened();
    rename(rotated.dialog, LONG.id, "Spare");
    rename(rotated.dialog, RECENT.id, "Long");
    rename(rotated.dialog, FAVORITES.id, "Recent");
    rename(rotated.dialog, LONG.id, "Favorites");
    expect(rotated.view().actions.apply.reason).toBe(
      'Presets "Recent", "Long", and "Favorites" would take each other\'s names. Apply in two steps: give one of them another name, apply, then rename it.'
    );

    const filters = await opened();
    update(filters.dialog, FAVORITES.id, { onlyKnownDuration: true });
    update(filters.dialog, RECENT.id, { favoritesOn: true });
    update(filters.dialog, FAVORITES.id, { onlyNeverPlayed: true });
    await filters.dialog.apply();
    expect(filters.notices).toEqual([
      'Presets "Favorites" and "Recent" would take each other\'s filters. Apply in two steps: give one of them another filter, apply, then update it.'
    ]);
    expect(filters.noticeLogs).toEqual(["Presets would take each other's filters. Apply in two steps."]);
    expect(filters.server.fakePresets.writes).toEqual([]);
  });

  it("stops at the first write the server refuses, saying why, and keeps only what didn't land as unsaved, applying nothing", async () => {
    const { dialog, view, server, store, notices, noticeLogs, library } = await opened();
    rename(dialog, RECENT.id, "Fresh");
    update(dialog, FAVORITES.id, { onlyKnownDuration: true });
    // Another device saves that filter in a preset of its own first.
    server.presets = [...server.presets, { id: "preset-other", name: "Other", filterState: { onlyKnownDuration: true } }];

    await dialog.apply();

    expect(server.fakePresets.summaries()).toEqual(["rename preset-recent Fresh", "update preset-favorites (409)"]);
    expect(notices).toEqual(['Saving presets failed: Preset "Other" already has this filter.']);
    expect(noticeLogs).toEqual(["Saving presets failed (409)."]);
    // The rename landed, so the saved list has it; the update didn't, so the tab still holds it.
    expect(view().savedPresets.map((preset) => preset.name)).toEqual(["Favorites", "Fresh", "Long", "Other"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Fresh", "Long", "Other"]);
    expect(view().presets[0]!.filterState.onlyKnownDuration).toBe(true);
    expect(view().presetsChanged).toBe(true);
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(library.commitQuery).not.toHaveBeenCalled();
  });

  it("keeps the writes that landed as saved when a later one can't reach the server, so the next Apply doesn't send them again", async () => {
    const { dialog, view, server, notices } = await opened();
    dialog.editPreset(LONG.id);
    await dialog.deleteEditedPreset();
    rename(dialog, RECENT.id, "Fresh");
    update(dialog, FAVORITES.id, { onlyKnownDuration: true });
    server.fakePresets.writeFailure = "unreachable";
    server.fakePresets.writesBeforeFailure = 2;

    await dialog.apply();

    expect(notices).toEqual(["Saving presets failed: Couldn't reach the server."]);
    expect(view().savedPresets.map((preset) => [preset.name, preset.filterState.favoritesMode])).toEqual([
      ["Favorites", "only"],
      ["Fresh", "off"]
    ]);
    expect(view().presetsChanged).toBe(true);
    server.fakePresets.writeFailure = null;
    await dialog.apply();
    expect(server.fakePresets.summaries()).toEqual(["delete preset-long", "rename preset-recent Fresh", "update preset-favorites"]);
  });

  it("keeps the id the server gave a new preset when a later write is refused, so the reload doesn't add it twice", async () => {
    const { dialog, view, server, notices } = await opened();
    add(dialog, "Mine", { onlyKnownDuration: true });
    dialog.movePreset(3, 0);
    server.presets = [...server.presets, { id: "preset-other", name: "Other", filterState: { onlyKnownLoudness: true } }];

    await dialog.apply();

    expect(server.fakePresets.summaries()).toEqual(["create Mine", "reorder preset-4,preset-favorites,preset-recent,preset-long (409)"]);
    expect(notices).toEqual(["Saving presets failed: The order must name every preset once."]);
    expect(view().presets.map((preset) => preset.id)).toEqual(["preset-4", "preset-favorites", "preset-recent", "preset-long", "preset-other"]);
    expect(view().headingPreset).toBe("preset-4");

    await dialog.apply();
    expect(server.fakePresets.summaries().at(-1)).toBe("reorder preset-4,preset-favorites,preset-recent,preset-long,preset-other");
    expect(server.presets.map((preset) => preset.name)).toEqual(["Mine", "Favorites", "Recent", "Long", "Other"]);
  });

  it("does nothing on a second Apply or a Refresh while Apply's writes are being sent", async () => {
    const { dialog, view, server, notices } = await opened();
    dialog.editPreset(LONG.id);
    await dialog.deleteEditedPreset();
    add(dialog, "Mine", { onlyKnownDuration: true });
    const sourceLoads = () => server.requests.filter((request) => request.path === "/api/sources").length;
    const loadsBefore = sourceLoads();

    // A double press, and a Refresh, while the first Apply's delete is on its way.
    const first = dialog.apply();
    const second = dialog.apply();
    const refreshed = dialog.refresh();
    await Promise.all([first, second, refreshed]);

    expect(server.fakePresets.summaries()).toEqual(["delete preset-long", "create Mine"]);
    expect(notices).toEqual([]);
    expect(sourceLoads()).toBe(loadsBefore);
    expect(view().presets.map((preset) => preset.id)).toEqual(["preset-favorites", "preset-recent", "preset-4"]);
    expect(view().presetsChanged).toBe(false);
  });

  it("Refresh keeps the tab's preset changes and takes the server's version of every other preset", async () => {
    const { dialog, view, server } = await opened();
    rename(dialog, RECENT.id, "Fresh");
    // Another device changes Favorites' and Recent's filters and deletes Long.
    server.presets = [
      { ...FAVORITES, filterState: { onlyKnownLoudness: true } },
      { ...RECENT, filterState: { mediaTypeFilter: 1 } }
    ];

    await dialog.refresh();

    expect(view().presets.map((preset) => [preset.name, preset.filterState.onlyKnownLoudness, preset.filterState.mediaTypeFilter])).toEqual([
      ["Favorites", true, 0],
      ["Fresh", false, 1]
    ]);
    expect(view().presetsChanged).toBe(true);
    await dialog.apply();
    expect(server.fakePresets.summaries()).toEqual(["rename preset-recent Fresh"]);
    expect(server.presets.map((preset) => preset.name)).toEqual(["Favorites", "Fresh"]);
  });
});

describe("applying", () => {
  it("saves each changed preset, never the whole list, applies the filter, reloads presets, closes the panel as the overlay, and then starts the library over", async () => {
    const { dialog, store, server, steps, notified, panel } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ favoritesOn: true, onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed favorites");
    dialog.addPreset();
    steps.length = 0;

    await dialog.apply();

    expect(server.fakePresets.summaries()).toEqual(["create Unplayed favorites"]);
    expect(server.fakePresets.writes[0]!.body).toMatchObject({ clientId: "client-1", filterState: { favoritesMode: "only", onlyNeverPlayed: true } });
    expect(server.requests.some((request) => request.method === "POST" && request.path === "/api/presets")).toBe(false);
    expect(steps).toEqual(["loadPresets", "closeIfOverlay", "commitQuery favoritesMode=only"]);
    expect(store.appliedFilter.value).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: true });
    // The new preset takes the id the server gave it.
    expect(store.activePresetId.value).toBe("preset-2");
    expect(store.presetMenu.value.selectedValue).toBe("preset-2");
    expect(panel.closeIfOverlay).toHaveBeenCalledTimes(1);
    expect(notified.at(-1)).toEqual({ kind: "actions", text: "Filters applied.", key: "filter" });
  });

  it("writes the remembered filter once for an Apply that changes the filter and its preset", async () => {
    const { dialog, store, deviceWrites } = setup([FAVORITES]);
    store.presetsLoaded();
    await dialog.open();
    dialog.choosePreset(FAVORITES.id);
    dialog.loadPreset();

    await dialog.apply();

    expect(store.activePresetId.value).toBe(FAVORITES.id);
    expect(deviceWrites).toEqual(["rr_device.filter.applied"]);
  });
  it("keeps the dialog open and applies nothing when the presets cannot be saved", async () => {
    const { dialog, view, store, server, messages, notices, library, panel } = setup([FAVORITES]);
    // A refusal without a reason, as for a body the server can't read.
    server.fakePresets.writeFailure = { status: 500 };
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed");
    dialog.addPreset();

    await dialog.apply();

    expect(notices).toEqual(["Saving presets failed (500)."]);
    expect(messages).toEqual([]);
    expect(dialog.isOpen.value).toBe(true);
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(view().presetsChanged).toBe(true);
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(library.commitQuery).not.toHaveBeenCalled();
  });

  it("says a preset save that couldn't reach the server failed, and applies nothing", async () => {
    const { dialog, view, store, server, messages, notices, library } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed");
    dialog.addPreset();
    server.fakePresets.writeFailure = "unreachable";

    await dialog.apply();

    expect(notices).toEqual(["Saving presets failed: Couldn't reach the server."]);
    expect(messages).toEqual([]);
    expect(view().presetsChanged).toBe(true);
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(library.commitQuery).not.toHaveBeenCalled();
  });

  it("Refresh keeps the tab's order, with a preset another device added at the end, and Apply then sends one reorder", async () => {
    const { dialog, view, server, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.movePreset(0, 1);
    server.presets = [FAVORITES, RECENT, LONG];

    await dialog.refresh();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites", "Long"]);
    expect(view().presetsChanged).toBe(true);
    expect(view().unsaved).toBe(true);
    expect(store.presets.peek().map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Long"]);

    await dialog.apply();
    expect(server.fakePresets.summaries()).toEqual(["reorder preset-recent,preset-favorites,preset-long"]);
    expect(server.presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites", "Long"]);
  });

  it("Refresh takes the server's preset list while there are no preset changes", async () => {
    const { dialog, view, server } = setup([FAVORITES]);
    await dialog.open();
    server.presets = [FAVORITES, RECENT];
    await dialog.refresh();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
  });

  it("Discard changes puts back the applied filter and the saved presets at once, applies and saves nothing, and leaves the panel open", async () => {
    const { dialog, view, store, server, library, panel, confirm } = setup([FAVORITES, RECENT]);
    store.pickHeaderPreset("preset-favorites");
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);
    dialog.typeNewPresetName("Draft");
    dialog.editPreset(presetIdAt(dialog, 0));
    expect(view().unsaved).toBe(true);

    dialog.discardChanges();

    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(dialog.isOpen.value).toBe(true);
    expect(view().working).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: false });
    expect(view().general).toMatchObject({ favoritesOn: true, onlyNeverPlayed: false });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(view().newPresetName).toBe("");
    expect(view().presetEdit).toBeNull();
    expect(view().heading).toBe("Preset: Favorites");
    expect(view().unsaved).toBe(false);
    expect(server.fakePresets.writes).toHaveLength(0);
    expect(store.appliedFilter.value).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: false });
    expect(library.commitQuery).not.toHaveBeenCalled();
  });

  it("goes back to the default filter and the saved presets on Clear all", async () => {
    const { dialog, view, store } = setup([FAVORITES]);
    store.pickHeaderPreset("preset-favorites");
    await dialog.open();
    dialog.typeNewPresetName("Extra");
    dialog.addPreset();

    dialog.clearAll();

    expect(view().working).toEqual(createDefaultFilterState());
    expect(view().general).toMatchObject({ favoritesOn: false, favoritesChoice: "only" });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
    expect(view().heading).toBe("Preset: None");

    // It differs from the applied filter, so Apply has something to apply, and it is an unsaved change, which the tab
    // keeps while it hides. It is the default filter, so Clear all filters is disabled.
    expect(view().unsaved).toBe(true);
    expect(view().defaultFilter).toBe(true);
    dialog.close();
    await dialog.open();
    expect(view().working).toEqual(createDefaultFilterState());
    expect(view()).toMatchObject({ unsaved: true });
  });

  it("has nothing to apply after Clear all while the applied filter is the default", async () => {
    const { dialog, view } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    expect(view().unsaved).toBe(true);

    dialog.clearAll();
    expect(view()).toMatchObject({ unsaved: false });
  });

  it("says whether the filter, with each duration as its field reads, is the default one, whatever the preset list", async () => {
    const { dialog, view, store } = setup([FAVORITES, RECENT]);
    store.pickHeaderPreset("preset-recent");
    await dialog.open();
    expect(view().defaultFilter).toBe(false);
    dialog.clearAll();
    expect(view()).toMatchObject({ defaultFilter: true, unsaved: true });

    // A duration counts as its field reads, before the field is left, and text that isn't valid is no filter.
    dialog.typeDuration("min", "1:30");
    expect(view().defaultFilter).toBe(false);
    dialog.typeDuration("min", "1:7x");
    expect(view().defaultFilter).toBe(false);
    dialog.typeDuration("min", "");
    expect(view().defaultFilter).toBe(true);

    // A change to the preset list alone leaves it the default filter.
    dialog.movePreset(0, 1);
    expect(view()).toMatchObject({ defaultFilter: true, presetsChanged: true });
    dialog.toggleTag("Beach", "include");
    expect(view().defaultFilter).toBe(false);
  });
});

describe("preset dropdown changes", () => {
  it("start the dialog over from the preset dropdown's filter and the saved presets, whether or not it shows, dropping its changes", async () => {
    const { dialog, view, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);

    store.pickHeaderPreset("preset-favorites");
    expect(view().working).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: false });
    expect(view().general).toMatchObject({ favoritesOn: true, favoritesChoice: "only" });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().unsaved).toBe(false);
    expect(view().heading).toBe("Preset: Favorites");

    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.close();
    expect(view().unsaved).toBe(true);
    store.pickHeaderPreset("");
    expect(view().working).toMatchObject({ favoritesMode: "off", onlyNeverPlayed: false });
    expect(view().unsaved).toBe(false);
  });
});

describe("unsaved state", () => {
  /** Beach, saved with an AND entry for its category, which says nothing. */
  const BEACH_LEFTOVER: ApiPreset = {
    id: "preset-beach",
    name: "Beach",
    filterState: { selectedTags: ["Beach"], categoryLocalMatchModes: { places: 0 } }
  };
  const EVERY_SOURCE: ApiPreset = { id: "preset-every", name: "Every source", filterState: { includedSourceIds: ["source-1", "source-2"] } };

  const presetSaves = (server: ReturnType<typeof setup>["server"]) => server.fakePresets.writes;

  it("a Local match mode set back to AND leaves no entry, so the filter matches its preset again, and once applied too", async () => {
    const { dialog, view, store } = setup([BEACH_LEFTOVER]);
    store.pickHeaderPreset("preset-beach");
    await dialog.open();
    expect(view().working.categoryLocalMatchModes).toBeNull();
    expect(view().heading).toBe("Preset: Beach");

    dialog.setLocalMatch("places", TAG_MATCH_MODE.Or);
    expect(view().working.categoryLocalMatchModes).toEqual({ places: TAG_MATCH_MODE.Or });
    expect(view()).toMatchObject({ heading: "Preset: Beach*", unsaved: true });
    dialog.setLocalMatch("places", TAG_MATCH_MODE.And);
    expect(view().working.categoryLocalMatchModes).toBeNull();
    expect(view()).toMatchObject({ heading: "Preset: Beach", unsaved: false });

    dialog.setLocalMatch("places", TAG_MATCH_MODE.Or);
    await dialog.apply();
    expect(store.presetMenu.value.entries[0]!.label).toBe("Beach*");
    dialog.setLocalMatch("places", TAG_MATCH_MODE.And);
    expect(view()).toMatchObject({ heading: "Preset: Beach", unsaved: true });
    await dialog.apply();
    expect(store.appliedFilter.peek().categoryLocalMatchModes).toBeNull();
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Beach"]);
    expect(view()).toMatchObject({ unsaved: false });
  });

  it("sources checked back as they were keep the preset's source list, through other General changes too", async () => {
    const { dialog, view, store } = setup([EVERY_SOURCE]);
    store.pickHeaderPreset("preset-every");
    await dialog.open();
    expect(view().heading).toBe("Preset: Every source");

    dialog.checkSource(0, false);
    expect(view().working.includedSourceIds).toEqual(["source-2"]);
    expect(view()).toMatchObject({ heading: "Preset: Every source*", unsaved: true });
    dialog.checkSource(0, true);
    expect(view().working.includedSourceIds).toEqual(["source-1", "source-2"]);
    expect(view()).toMatchObject({ heading: "Preset: Every source", unsaved: false });

    // So do closing and opening the tab, and Refresh, between unchecking and checking.
    dialog.checkSource(0, false);
    dialog.close();
    await dialog.open();
    await dialog.refresh();
    dialog.checkSource(0, true);
    expect(view().working.includedSourceIds).toEqual(["source-1", "source-2"]);
    expect(view()).toMatchObject({ heading: "Preset: Every source", unsaved: false });

    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.changeGeneral({ onlyNeverPlayed: false });
    expect(view()).toMatchObject({ heading: "Preset: Every source", unsaved: false });

    dialog.checkSource(1, false);
    await dialog.apply();
    expect(store.presetMenu.value.entries[0]!.label).toBe("Every source*");
    dialog.checkSource(1, true);
    await dialog.apply();
    expect(store.appliedFilter.peek().includedSourceIds).toEqual(["source-1", "source-2"]);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Every source"]);
  });

  it("compares the preset list with the saved one, so a list put back as it was has no changes, and a rename that changes only case does", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    const unchanged = { presetsChanged: false, unsaved: false };

    dialog.movePreset(0, 1);
    expect(view()).toMatchObject({ presetsChanged: true, unsaved: true });
    dialog.movePreset(1, 0);
    expect(view()).toMatchObject(unchanged);

    dialog.editPreset(presetIdAt(dialog, 0));
    dialog.typePresetName("favorites");
    dialog.savePresetEdit();
    expect(view()).toMatchObject({ presetsChanged: true, unsaved: true });
    dialog.editPreset(presetIdAt(dialog, 0));
    dialog.typePresetName("Favorites");
    dialog.savePresetEdit();
    expect(view()).toMatchObject(unchanged);

    dialog.changeGeneral({ maxText: "10:00" });
    dialog.typeNewPresetName("Draft");
    dialog.addPreset();
    expect(view()).toMatchObject({ presetsChanged: true, unsaved: true });
    dialog.editPreset(presetIdAt(dialog, 2));
    await dialog.deleteEditedPreset();
    dialog.changeGeneral({ maxText: "" });
    expect(view()).toMatchObject(unchanged);
  });

  it("Refresh takes the server's list for a list put back as it was, and Apply saves none, and after Apply saves a list it is the saved one", async () => {
    const { dialog, view, server } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.movePreset(0, 1);
    dialog.movePreset(1, 0);
    server.presets = [FAVORITES, RECENT, LONG];

    await dialog.refresh();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Long"]);
    expect(view()).toMatchObject({ presetsChanged: false, unsaved: false });
    await dialog.apply();
    expect(presetSaves(server)).toHaveLength(0);

    dialog.movePreset(2, 0);
    await dialog.apply();
    expect(presetSaves(server)).toHaveLength(1);
    expect(view()).toMatchObject({ presetsChanged: false, unsaved: false });
    // The list Apply saved is the one a move then puts back to.
    dialog.movePreset(0, 1);
    dialog.movePreset(1, 0);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Long", "Favorites", "Recent"]);
    expect(view()).toMatchObject({ presetsChanged: false, unsaved: false });
  });

  it("a tag renamed or deleted in a saved preset changes the saved copy too, so the list has no changes and Apply saves none", async () => {
    const beach: ApiPreset = { id: "preset-beach", name: "Beach", filterState: { selectedTags: ["Beach", "Sunset"] } };
    const { dialog, view, server } = setup([FAVORITES, beach]);
    await dialog.open();
    const unchanged = { presetsChanged: false, unsaved: false };
    /** Renames a tag, or deletes it without a new name, as the tag editor's revision does. */
    const revision = (name: string, renamed?: string) => (selected: string[]) => {
      const at = selected.indexOf(name);
      if (at >= 0) {
        selected.splice(at, 1, ...(renamed ? [renamed] : []));
      }
    };

    dialog.reviseTags(revision("Beach", "Shore"));
    expect(view().presets[1]!.filterState.selectedTags).toEqual(["Shore", "Sunset"]);
    expect(view()).toMatchObject(unchanged);
    dialog.reviseTags(revision("Sunset"));
    expect(view().presets[1]!.filterState.selectedTags).toEqual(["Shore"]);
    expect(view()).toMatchObject(unchanged);

    await dialog.apply();
    expect(presetSaves(server)).toHaveLength(0);
  });

  it("Clear all puts the preset list back to the saved copy, not to a list loaded since", async () => {
    const { dialog, view, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.movePreset(0, 1);
    // A preset load the tab doesn't take, as when the server asks the page to sync again.
    store.presets.value = [FAVORITES, RECENT, LONG];

    dialog.clearAll();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view()).toMatchObject({ presetsChanged: false, unsaved: false });
  });

  for (const which of ["min", "max"] as const) {
    it(`a ${which}imum typed, left, and then emptied is no limit again before the field is left`, async () => {
      const { dialog, view } = setup();
      await dialog.open();
      const text = which === "min" ? "minText" : "maxText";
      const seconds = which === "min" ? "minDurationSeconds" : "maxDurationSeconds";

      dialog.typeDuration(which, "1:30");
      dialog.changeGeneral({ [text]: "1:30" });
      expect(view().working[seconds]).toBe(90);
      expect(view()).toMatchObject({ unsaved: true });

      dialog.typeDuration(which, "");
      expect(view().working[seconds]).toBe(90);
      expect(view()).toMatchObject({ unsaved: false });
    });
  }
});

describe("presets need a filter of their own", () => {
  it("disables Add Preset and Update while the filter, as typed, is the default or a preset's, the chosen one's too, and Update on None, and says why", async () => {
    const { dialog, view, notices } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.typeNewPresetName("Mine");
    const unavailable = (reason: string) => ({ disabled: true, heldBy: null, reason });
    const noDefault = unavailable(DEFAULT_FILTER_PRESET_REASON);
    // On None, Update says first that it has nothing to write into.
    expect(view().actions).toMatchObject({ addPreset: noDefault, updatePreset: unavailable(NO_CHOSEN_PRESET_REASON) });
    expect(dialog.addPreset()).toBe(false);
    dialog.updatePreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(notices).toEqual([]);

    dialog.choosePreset(FAVORITES.id);
    expect(view().actions).toMatchObject({ addPreset: noDefault, updatePreset: noDefault });

    // A duration counts as its field reads, before the field is left.
    dialog.typeDuration("min", "1:30");
    expect(view().actions).toMatchObject({ addPreset: FREE, updatePreset: FREE });
    expect(view().actions.addPreset.reason).toBeUndefined();
    dialog.typeDuration("min", "");
    expect(view().actions).toMatchObject({ addPreset: noDefault, updatePreset: noDefault });

    // Another preset's filter, and then the chosen preset's own, which updating it would leave as it is.
    dialog.changeGeneral({ onlyNeverPlayed: true });
    const recentHasIt = unavailable('Preset "Recent" already has this filter.');
    expect(view().actions).toMatchObject({ addPreset: recentHasIt, updatePreset: recentHasIt });
    dialog.loadPreset();
    const favoritesHasIt = unavailable('Preset "Favorites" already has this filter.');
    expect(view().actions).toMatchObject({ addPreset: favoritesHasIt, updatePreset: favoritesHasIt });
    expect(dialog.addPreset()).toBe(false);
    dialog.updatePreset();
    expect(view().presetsChanged).toBe(false);
    expect(notices).toEqual([]);
  });
});

describe("Choose Preset and Load", () => {
  it("choosing loads nothing, and Load loads the chosen preset's filter, or the default filter for None, keeping the preset list, and is disabled while the filter already is that one", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    expect(view()).toMatchObject({ chosenPreset: null, loadDisabled: true });

    dialog.choosePreset(RECENT.id);
    expect(view()).toMatchObject({ chosenPreset: RECENT.id, headingPreset: null, loadDisabled: false, unsaved: false });
    dialog.loadPreset();
    expect(view()).toMatchObject({ headingPreset: RECENT.id, heading: "Preset: Recent", loadDisabled: true, unsaved: true });
    expect(view().general.onlyNeverPlayed).toBe(true);

    // A duration counts as its field reads.
    dialog.typeDuration("max", "1:00");
    expect(view().loadDisabled).toBe(false);
    dialog.typeDuration("max", "");
    expect(view().loadDisabled).toBe(true);

    dialog.movePreset(1, 0);
    dialog.choosePreset("");
    expect(view().loadDisabled).toBe(false);
    dialog.loadPreset();
    expect(view().working).toEqual(createDefaultFilterState());
    expect(view()).toMatchObject({ headingPreset: null, chosenPreset: null, loadDisabled: true, presetsChanged: true });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
  });

  it("starts Choose Preset over on the heading's preset each time the Presets section comes into view, and when Apply applies", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    dialog.changeGeneral({ favoritesOn: true });
    expect(view().heading).toBe("Preset: Recent*");

    dialog.showTab("presets");
    dialog.choosePreset(FAVORITES.id);
    // Showing the section it is on keeps the choice.
    dialog.showTab("presets");
    expect(view().chosenPreset).toBe(FAVORITES.id);
    dialog.showTab("tags");
    dialog.showTab("presets");
    expect(view().chosenPreset).toBe(RECENT.id);

    // The tab showing on the section, with unsaved changes too.
    dialog.choosePreset(FAVORITES.id);
    dialog.close();
    await dialog.open();
    expect(view()).toMatchObject({ unsaved: true, chosenPreset: RECENT.id });

    dialog.showTab("general");
    dialog.choosePreset(FAVORITES.id);
    await dialog.apply();
    expect(view().chosenPreset).toBe(RECENT.id);
  });
});

describe("the heading while a duration is typed", () => {
  it("keeps the working filter's preset, so backspacing Long's minimum to empty and typing a new one ends as Long*", async () => {
    const { dialog, view, store } = setup([LONG]);
    store.pickHeaderPreset("preset-long");
    await dialog.open();
    expect(view().heading).toBe("Preset: Long");

    // Each text on the way stars Long, the empty one included, though it reads as the default filter.
    for (const text of ["10:", "10", "1", "", "2", "20", "20:", "20:0", "20:00"]) {
      dialog.typeDuration("min", text);
      expect(view()).toMatchObject({ heading: "Preset: Long*", headingPreset: LONG.id });
    }
    dialog.changeGeneral({ minText: "20:00" });
    expect(view()).toMatchObject({ heading: "Preset: Long*", headingPreset: LONG.id });
    await dialog.apply();
    expect(store.activePresetId.value).toBe(LONG.id);
    expect(store.presetMenu.value.entries[0]!.label).toBe("Long*");
  });

  it("stars the heading as the duration's field reads, as the unsaved changes follow it, and for text that isn't valid", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset(RECENT.id);
    dialog.loadPreset();
    await dialog.apply();
    expect(view()).toMatchObject({ heading: "Preset: Recent", unsaved: false });

    dialog.typeDuration("min", "1:30");
    expect(view()).toMatchObject({ heading: "Preset: Recent*", unsaved: true });
    dialog.typeDuration("min", "1:7x");
    expect(view()).toMatchObject({ heading: "Preset: Recent*", unsaved: true });
    dialog.typeDuration("min", "");
    expect(view()).toMatchObject({ heading: "Preset: Recent", unsaved: false });

    // Typed, left, and emptied, the heading clears with the unsaved changes, before the field is left again.
    dialog.typeDuration("max", "10:00");
    dialog.changeGeneral({ maxText: "10:00" });
    expect(view()).toMatchObject({ heading: "Preset: Recent*", unsaved: true });
    dialog.typeDuration("max", "");
    expect(view().working.maxDurationSeconds).toBe(600);
    expect(view()).toMatchObject({ heading: "Preset: Recent", unsaved: false });
  });
});

describe("preset events", () => {
  function rename(dialog: FilterDialog, id: string, name: string): void {
    dialog.editPreset(id);
    dialog.typePresetName(name);
    dialog.savePresetEdit();
  }

  it("takes another device's changes by the merge, shown or hidden, keeping an unsaved rename and a typed name", async () => {
    const { dialog, view, server, presetEvent } = setup([FAVORITES, LONG, RECENT]);
    await dialog.open();
    rename(dialog, LONG.id, "Longer");
    dialog.typeNewPresetName("Typed");

    // Another device renames Recent.
    server.presets = [FAVORITES, LONG, { ...RECENT, name: "Fresh" }];
    presetEvent();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Longer", "Fresh"]);
    expect(view().savedPresets.map((preset) => preset.name)).toEqual(["Favorites", "Long", "Fresh"]);
    expect(view().newPresetName).toBe("Typed");
    expect(view().presetsChanged).toBe(true);

    // Hidden, it takes another device's new preset, and delete, all the same.
    dialog.close();
    server.presets = [FAVORITES, LONG, { id: "preset-new", name: "Birds", filterState: { onlyKnownLoudness: true } }];
    presetEvent();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Longer", "Birds"]);
    expect(view().presetsChanged).toBe(true);
  });

  it("does nothing before it has loaded once", () => {
    const { dialog, server, presetEvent } = setup([FAVORITES]);
    server.presets = [FAVORITES, LONG];
    presetEvent();
    expect(dialog.view.value).toBeNull();
  });

  it("doesn't take a reload while Apply's writes are being sent, and Apply's own reload brings the change in", async () => {
    const { dialog, view, server, presetEvent } = setup([FAVORITES, LONG, RECENT]);
    await dialog.open();
    rename(dialog, LONG.id, "Longer");
    dialog.editPreset(RECENT.id);
    await dialog.deleteEditedPreset();

    const applied = dialog.apply();
    // Another device renames Favorites while the writes are on their way.
    server.fakePresets.list = server.fakePresets.list.map((preset) => (preset.id === FAVORITES.id ? { ...preset, name: "Starred" } : preset));
    presetEvent();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Longer"]);
    expect(view().savedPresets.map((preset) => preset.name)).toEqual(["Favorites", "Long", "Recent"]);
    await applied;

    expect(server.fakePresets.summaries()).toEqual(["delete preset-recent", "rename preset-long Longer"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Starred", "Longer"]);
    expect(view().presetsChanged).toBe(false);
  });

  it("takes the applied preset's new filter into the working filter while it is the applied filter, keeping the tab's other changes", async () => {
    const { dialog, view, store, server, presetEvent } = setup([FAVORITES, LONG, RECENT]);
    store.pickHeaderPreset(FAVORITES.id);
    await dialog.open();
    rename(dialog, RECENT.id, "Fresh");
    dialog.typeNewPresetName("Typed");
    dialog.editPreset(LONG.id);
    dialog.typePresetName("Lo");

    server.presets = [{ ...FAVORITES, filterState: { favoritesMode: "only", onlyKnownDuration: true } }, LONG, RECENT];
    presetEvent({ activeChanged: true });
    expect(store.appliedFilter.peek()).toMatchObject({ favoritesMode: "only", onlyKnownDuration: true });
    expect(view().working).toMatchObject({ favoritesMode: "only", onlyKnownDuration: true });
    expect(view().general).toMatchObject({ favoritesOn: true, onlyKnownDuration: true });
    expect(view().heading).toBe("Preset: Favorites");
    expect(view().headingPreset).toBe(FAVORITES.id);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Long", "Fresh"]);
    expect(view().newPresetName).toBe("Typed");
    expect(view().presetEdit).toEqual({ id: LONG.id, name: "Lo" });
    expect(view().unsaved).toBe(true);
    expect(view().presetsChanged).toBe(true);
  });

  it("keeps a working filter that differs from the applied filter, a typed duration too, as the user left it", async () => {
    const { dialog, view, store, server, presetEvent } = setup([FAVORITES, LONG]);
    store.pickHeaderPreset(FAVORITES.id);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });

    server.presets = [{ ...FAVORITES, filterState: { favoritesMode: "only", onlyKnownDuration: true } }, LONG];
    presetEvent({ activeChanged: true });
    expect(store.appliedFilter.peek()).toMatchObject({ onlyKnownDuration: true, onlyNeverPlayed: false });
    expect(view().working).toMatchObject({ onlyKnownDuration: false, onlyNeverPlayed: true });
    expect(view().general).toMatchObject({ onlyKnownDuration: false, onlyNeverPlayed: true });
    // The dots now compare the working filter with the new applied filter.
    expect(view().applied).toMatchObject({ onlyKnownDuration: true });

    // A duration typed but not yet taken into the working filter is a change too.
    dialog.discardChanges();
    dialog.typeDuration("min", "00:05");
    server.presets = [{ ...FAVORITES, filterState: { favoritesMode: "only", mediaTypeFilter: 1 } }, LONG];
    presetEvent({ activeChanged: true });
    expect(store.appliedFilter.peek().mediaTypeFilter).toBe(1);
    expect(view().working.mediaTypeFilter).toBe(0);
    expect(view().general.minText).toBe("00:05");
  });
});
