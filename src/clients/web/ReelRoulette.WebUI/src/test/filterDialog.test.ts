import { describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "../dialogs/dialogs";
import { createFilterDialog } from "../filter/filterDialog";
import { DURATION_PROBLEM, FLAG_MODES_PROBLEM } from "../filter/filterDialogModel";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { EMPTY_FIELD } from "../validation/fieldValidation";

const FAVORITES: ApiPreset = { id: "preset-favorites", name: "Favorites", filterState: { favoritesOnly: true } };
const EVERYTHING: ApiPreset = { id: "preset-everything", name: "Everything", filterState: {} };
const RECENT: ApiPreset = { id: "preset-recent", name: "Recent", filterState: { onlyNeverPlayed: true } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(presets: ApiPreset[] = [FAVORITES]) {
  const server = {
    presets: presets.slice(),
    sourcesStatus: 200,
    /** The tag model's status, and its content type, for a proxy's page in place of JSON. */
    modelStatus: 200,
    modelType: "application/json",
    /** The preset save's status, or 0 for one that can't reach the server. */
    saveStatus: 200,
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
    if (path === "/api/presets" && method === "POST") {
      if (server.saveStatus === 0) {
        throw new TypeError("NetworkError when attempting to fetch resource.");
      }
      if (server.saveStatus !== 200) {
        return json({}, server.saveStatus);
      }
      server.presets = body.map((preset: any, index: number) => ({ id: `saved-${index + 1}`, ...preset }));
      return json(server.presets);
    }
    if (path === "/api/presets") {
      return json(server.presets);
    }
    return json({}, 404);
  }) as typeof fetch;

  const statuses: string[] = [];
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
  const setStatus = store.setStatus;
  store.setStatus = (message, logText) => {
    statuses.push(message);
    setStatus(message, logText);
  };
  const api = createAppApi("http://server", {
    onUnauthorized: () => {
      store.pairingRequired.value = true;
    },
    fetch: fetchImpl
  });
  const steps: string[] = [];
  const connection = {
    async loadPresets() {
      steps.push("loadPresets");
      store.presets.value = (await api.getJson("/api/presets")) as ApiPreset[];
      store.syncHeaderPresets();
    }
  };
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
  /** The messages shown in the in-app notice, in order. */
  const notices: string[] = [];
  const notice = async (message: string) => {
    notices.push(message);
  };
  /** The panel, which Apply and Cancel close as the overlay. */
  const panel = {
    closeIfOverlay: vi.fn(async () => {
      steps.push("closeIfOverlay");
    })
  };
  const dialog = createFilterDialog({ store, api, connection, library, panel, device, dialogs: { confirm, notice } });
  const view = () => dialog.view.value!;
  return { dialog, view, store, server, statuses, notices, steps, library, remembered, confirm, panel, deviceWrites };
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
    expect(view().pending).toBe(false);
  });

  it("shows but loads nothing while the server is incompatible, and says why when its data cannot load", async () => {
    const { dialog, store, server, statuses, notices } = setup();
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
    expect(statuses).toEqual([]);
    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.view.value).toBeNull();
    expect(dialog.tab.value).toBeNull();
  });

  it("Refresh before anything has loaded loads as showing the tab does, and says so", async () => {
    const { dialog, view, server, statuses, notices } = setup();
    server.sourcesStatus = 500;
    await dialog.open();
    expect(dialog.view.value).toBeNull();

    await dialog.refresh();
    expect(notices.at(-1)).toBe("Filter refresh failed: HTTP 500");
    expect(statuses).toEqual([]);
    expect(dialog.view.value).toBeNull();

    server.sourcesStatus = 200;
    await dialog.refresh();
    expect(statuses.at(-1)).toBe("Filter data refreshed.");
    expect(dialog.tab.value).toBe("general");
    expect(view().sources.map((source) => source.id)).toEqual(["source-1", "source-2"]);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
  });

  it("reads a failed tag model as HTTP and its status, on loading and on Refresh", async () => {
    const { dialog, server, statuses, notices } = setup();
    server.modelStatus = 503;
    await dialog.open();
    expect(notices).toEqual(["Filter load failed: HTTP 503"]);

    server.modelStatus = 200;
    await dialog.open();
    server.modelStatus = 503;
    await dialog.refresh();
    expect(notices).toEqual(["Filter load failed: HTTP 503", "Filter refresh failed: HTTP 503"]);
    expect(statuses).toEqual([]);
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
    const { dialog, store, server, statuses, notices } = setup();
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
    expect(statuses).toEqual(["Filter data refreshed."]);
  });

  it("keeps its changes and its section while it hides, and shows them again as it loads again", async () => {
    const { dialog, view, server } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);
    dialog.typeNewPresetName("Draft");
    dialog.showTab("presets");
    expect(view().pending).toBe(true);
    dialog.close();
    expect(dialog.isOpen.value).toBe(false);
    expect(view().pending).toBe(true);

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
      expect(view().pending).toBe(true);
    };
    kept();
    release();
    await opening;
    kept();
  });

  it("counts a duration still being typed as an unsaved change, without Apply's star, and keeps it while it hides, until Apply takes it", async () => {
    const { dialog, view, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.typeDuration("max", "10:00");
    expect(view().working.maxDurationSeconds).toBeNull();
    expect(view()).toMatchObject({ unsaved: true, pending: false });
    dialog.close();
    await dialog.open();
    expect(view().general.maxText).toBe("10:00");
    expect(view()).toMatchObject({ unsaved: true, pending: false });

    dialog.typeDuration("max", "1:7x");
    expect(view().unsaved).toBe(true);
    dialog.typeDuration("max", "");
    expect(view().unsaved).toBe(false);

    // Text that reads as the applied duration is no change, so the change is gone once Apply takes "90" as 01:30.
    dialog.typeDuration("min", "90");
    expect(view().unsaved).toBe(true);
    await dialog.apply();
    expect(store.appliedFilter.peek().minDurationSeconds).toBe(90);
    expect(view().general.minText).toBe("90");
    expect(view().unsaved).toBe(false);

    // Any other change is unsaved too.
    dialog.changeGeneral({ onlyNeverPlayed: true });
    expect(view()).toMatchObject({ unsaved: true, pending: true });
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
    expect(view().pending).toBe(false);
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
    server.presets = [FAVORITES, RECENT, EVERYTHING];
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
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Everything"]);
    expect(view().pending).toBe(true);
  });

  it("opens on None while the preset dropdown holds None, even when a saved preset has the default filter", async () => {
    const { dialog, view, store } = setup([EVERYTHING]);
    await dialog.open();
    expect(view().heading).toBe("Preset: Everything");

    store.pickHeaderPreset("");
    await dialog.open();
    expect(view().heading).toBe("Preset: None");
    dialog.choosePreset("Everything");
    expect(view().heading).toBe("Preset: Everything");
    dialog.choosePreset("");
    expect(view().heading).toBe("Preset: Everything");
  });
});

describe("General tab", () => {
  it("keeps a typed duration out of the working filter until the field changes", async () => {
    const { dialog, view } = setup();
    await dialog.open();

    dialog.typeDuration("max", "2:00");
    expect(view().general.maxText).toBe("2:00");
    expect(view().working.maxDurationSeconds).toBeNull();
    expect(view().pending).toBe(false);

    dialog.changeGeneral({ maxText: "2:00" });
    expect(view().working.maxDurationSeconds).toBe(120);
    expect(view().pending).toBe(true);
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
    expect(view().pending).toBe(false);
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
    const { dialog, view, statuses, library, server, store, panel } = setup();
    await dialog.open();
    dialog.typeDuration("min", "abc");
    expect(view().pending).toBe(false);
    expect(view().actions.apply).toEqual(heldBy("minDuration"));
    dialog.showTab("tags");

    await dialog.apply();
    expect(dialog.tab.value).toBe("general");
    expect(dialog.reveal.request.value).toEqual({ field: "minDuration", count: 1 });
    expect(dialog.isOpen.value).toBe(true);
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(view().general.minText).toBe("abc");

    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);
    expect(view().pending).toBe(true);
    dialog.showTab("presets");
    await dialog.apply();
    expect(dialog.tab.value).toBe("general");
    expect(dialog.reveal.request.value).toEqual({ field: "minDuration", count: 2 });
    expect(server.requests.filter((request) => request.method === "POST")).toEqual([
      expect.objectContaining({ path: "/api/tag-editor/model" })
    ]);
    expect(library.commitQuery).not.toHaveBeenCalled();
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);

    dialog.typeDuration("min", "1:30");
    expect(view().actions.apply).toEqual(FREE);
    await dialog.apply();
    expect(store.appliedFilter.peek()).toMatchObject({ minDurationSeconds: 90, onlyNeverPlayed: true });
    expect(library.commitQuery).toHaveBeenCalledTimes(1);
  });

  it("flags Favorites only with Blacklisted only, and no other pairing, and holds every action that uses it", async () => {
    const { dialog, view, statuses, library } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset("Recent");
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
    expect(dialog.reveal.request.value).toEqual({ field: "flagModes", count: 3 });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presets[1]!.filterState.favoritesMode).toBe("off");
    expect(view().presetsChanged).toBe(false);
    expect(library.commitQuery).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);

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
    const { dialog, view, statuses, confirm } = setup([FAVORITES, RECENT]);
    await dialog.open();

    dialog.typeNewPresetName("Draft name");
    dialog.movePreset(0, 1);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().newPresetName).toBe("Draft name");
    dialog.movePreset(0, -1);
    dialog.movePreset(1, 2);
    dialog.movePreset(1, 1);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);

    dialog.typeNewPresetName("  Mine ");
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites", "Mine"]);
    expect(view().newPresetName).toBe("");
    expect(dialog.tab.value).toBe("presets");

    dialog.editPreset(2);
    dialog.typePresetName("Ours");
    dialog.savePresetEdit();
    expect(view().heading).toBe("Preset: Ours");

    dialog.editPreset(2);
    confirm.mockResolvedValueOnce(false);
    await dialog.deleteEditedPreset();
    expect(view().presets).toHaveLength(3);
    await dialog.deleteEditedPreset();
    expect(confirm).toHaveBeenLastCalledWith({ message: 'Delete preset "Ours"?', confirmLabel: "Delete", danger: true });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().presetsChanged).toBe(true);
    expect(statuses).toEqual([]);
  });

  it("disables Add Preset while the new name is empty, without a flag or a move, even while a General field has a problem", async () => {
    const { dialog, view, statuses } = setup([FAVORITES]);
    await dialog.open();
    expect(view().problems.newPresetName).toBe(EMPTY_FIELD);
    expect(view().flagged.newPresetName).toBe(false);
    expect(view().actions.addPreset).toEqual(DISABLED);

    dialog.showTab("presets");
    expect(dialog.addPreset()).toBe(false);
    expect(dialog.tab.value).toBe("presets");
    expect(dialog.reveal.request.value).toBeNull();
    expect(view().presets).toHaveLength(1);

    dialog.typeNewPresetName("M");
    dialog.typeNewPresetName("  ");
    expect(view().flagged.newPresetName).toBe(false);
    expect(view().actions.addPreset).toEqual(DISABLED);

    dialog.typeDuration("min", "abc");
    expect(view().actions).toEqual({ apply: heldBy("minDuration"), addPreset: DISABLED, updatePreset: heldBy("minDuration") });
    expect(dialog.addPreset()).toBe(false);
    expect(dialog.tab.value).toBe("presets");
    expect(dialog.reveal.request.value).toBeNull();
    dialog.typeDuration("min", "");

    dialog.typeNewPresetName("Mine");
    expect(view().actions.addPreset).toEqual(FREE);
    expect(dialog.addPreset()).toBe(true);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Mine"]);
    expect(view().newPresetName).toBe("");
    expect(view().flagged.newPresetName).toBe(false);
    expect(statuses).toEqual([]);
  });

  it("flags a new name another preset has, ignoring case, and disables Add Preset without a move, even while a General field has a problem", async () => {
    const { dialog, view, statuses } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.showTab("presets");

    dialog.typeNewPresetName("recent");
    expect(view().problems.newPresetName).toEqual({ message: "Use a name no other preset has." });
    expect(view().flagged.newPresetName).toBe(true);
    expect(view().actions.addPreset).toEqual(DISABLED);
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(dialog.tab.value).toBe("presets");
    expect(dialog.reveal.request.value).toBeNull();

    dialog.typeDuration("max", "1:75");
    expect(view().actions.addPreset).toEqual(DISABLED);
    dialog.addPreset();
    expect(dialog.tab.value).toBe("presets");
    expect(dialog.reveal.request.value).toBeNull();
    expect(view().presetsChanged).toBe(false);
    expect(statuses).toEqual([]);
  });

  it("holds Add Preset and Update Preset on a duration that is not valid", async () => {
    const { dialog, view, statuses } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset("Recent");
    dialog.typeNewPresetName("Mine");
    dialog.typeDuration("max", "1:75");
    expect(view().actions).toEqual({ apply: heldBy("maxDuration"), addPreset: heldBy("maxDuration"), updatePreset: heldBy("maxDuration") });

    dialog.showTab("presets");
    dialog.addPreset();
    expect(dialog.tab.value).toBe("general");
    expect(dialog.reveal.request.value).toEqual({ field: "maxDuration", count: 1 });
    dialog.showTab("presets");
    dialog.updatePreset();
    expect(dialog.tab.value).toBe("general");
    expect(dialog.reveal.request.value).toEqual({ field: "maxDuration", count: 2 });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(statuses).toEqual([]);

    dialog.typeDuration("max", "2:00");
    dialog.updatePreset();
    expect(view().presets[1]!.filterState.maxDurationSeconds).toBe(120);
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Mine"]);
  });

  it("leaves the General tab as the user left it when a preset is deleted", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ minText: "abc" });

    dialog.editPreset(1);
    await dialog.deleteEditedPreset();

    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
    expect(view().general).toMatchObject({ minText: "abc" });
  });

  it("updates the chosen preset with the working filter", async () => {
    const { dialog, view, statuses, notices } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.updatePreset();
    expect(notices).toEqual(["Select a preset to update."]);
    expect(statuses).toEqual([]);

    dialog.choosePreset("Recent");
    dialog.changeGeneral({ favoritesOn: true });
    expect(view().heading).toBe("Preset: Recent*");
    dialog.updatePreset();
    expect(statuses.at(-1)).toBe('Updated preset "Recent" locally — Apply to save.');
    expect(view().presets[1]!.filterState).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: true });
    expect(view().heading).toBe("Preset: Recent");
  });
});

describe("Edit Preset", () => {
  it("opens on a preset with its name, and Cancel, Close, or opening the dialog again closes it without a change", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    expect(view().presetEdit).toBeNull();

    dialog.editPreset(1);
    expect(view().presetEdit).toEqual({ index: 1, name: "Recent" });
    expect(view().presetEditProblem).toBeNull();
    expect(view().presetEditFlagged).toBe(false);
    dialog.typePresetName("Fresh");
    expect(view().presetEdit).toEqual({ index: 1, name: "Fresh" });
    dialog.cancelPresetEdit();
    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);

    dialog.editPreset(2);
    expect(view().presetEdit).toBeNull();

    dialog.editPreset(0);
    dialog.close();
    expect(view().presetEdit).toBeNull();
    await dialog.open();
    dialog.editPreset(0);
    await dialog.open();
    expect(view().presetEdit).toBeNull();
  });

  it("flags another preset's name, ignoring case, finds an empty name required without a flag, and saves neither", async () => {
    const { dialog, view, statuses } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.editPreset(1);

    dialog.typePresetName("favorites ");
    expect(view().presetEditProblem).toEqual({ message: "Use a name no other preset has." });
    expect(view().presetEditFlagged).toBe(true);
    dialog.savePresetEdit();
    expect(view().presetEdit).toEqual({ index: 1, name: "favorites " });

    dialog.typePresetName("   ");
    expect(view().presetEditProblem).toBe(EMPTY_FIELD);
    expect(view().presetEditFlagged).toBe(false);
    dialog.savePresetEdit();
    expect(view().presetEdit).toEqual({ index: 1, name: "   " });

    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(statuses).toEqual([]);

    dialog.typePresetName("RECENT");
    expect(view().presetEditProblem).toBeNull();
    dialog.savePresetEdit();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "RECENT"]);
  });

  it("just closes on Save with the name unchanged, without a change or a star", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.editPreset(1);
    dialog.typePresetName("  Recent ");

    dialog.savePresetEdit();

    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(view().pending).toBe(false);
  });

  it("renames to the trimmed name, the heading and chosen preset follow, and Apply saves the list", async () => {
    const { dialog, view, server } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset("Recent");
    dialog.editPreset(1);
    dialog.typePresetName("  Fresh ");

    dialog.savePresetEdit();

    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Fresh"]);
    expect(view().presetName).toBe("Fresh");
    expect(view().heading).toBe("Preset: Fresh");
    expect(view().presetsChanged).toBe(true);
    expect(view().pending).toBe(true);

    await dialog.apply();
    const saves = server.requests.filter((request) => request.method === "POST" && request.path === "/api/presets");
    expect(saves.map((save) => save.body.map((preset: any) => preset.name))).toEqual([["Favorites", "Fresh"]]);
  });

  it("asks before Delete about the preset as it opened, stays open with the typed name on Cancel, and deletes it on confirm", async () => {
    const { dialog, view, confirm } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.choosePreset("Recent");
    dialog.editPreset(1);
    dialog.typePresetName("Other");

    confirm.mockResolvedValueOnce(false);
    await dialog.deleteEditedPreset();
    expect(confirm).toHaveBeenCalledWith({ message: 'Delete preset "Recent"?', confirmLabel: "Delete", danger: true });
    expect(view().presetEdit).toEqual({ index: 1, name: "Other" });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);

    await dialog.deleteEditedPreset();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(view().presetEdit).toBeNull();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites"]);
    expect(view().presetName).toBeNull();
    expect(view().heading).toBe("Preset: None*");
    expect(view().presetsChanged).toBe(true);
  });
});

describe("applying", () => {
  it("saves changed presets, applies the filter, reloads presets, closes the panel as the overlay, and then starts the library over", async () => {
    const { dialog, store, server, steps, statuses, panel } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ favoritesOn: true, onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed favorites");
    dialog.addPreset();
    steps.length = 0;

    await dialog.apply();

    expect(server.requests.filter((request) => request.method === "POST" && request.path === "/api/presets")[0]!.body.map(
      (preset: any) => preset.name
    )).toEqual(["Favorites", "Unplayed favorites"]);
    expect(steps).toEqual(["loadPresets", "closeIfOverlay", "commitQuery favoritesMode=only"]);
    expect(store.appliedFilter.value).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: true });
    expect(store.activePresetName.value).toBe("Unplayed favorites");
    expect(store.presetMenu.value.selectedValue).toBe("saved-2");
    expect(panel.closeIfOverlay).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("Filters applied.");
  });

  it("writes the remembered filter once for an Apply that changes the filter and its preset", async () => {
    const { dialog, store, deviceWrites } = setup([FAVORITES]);
    store.presetsLoaded();
    await dialog.open();
    dialog.choosePreset("Favorites");

    await dialog.apply();

    expect(store.activePresetName.value).toBe("Favorites");
    expect(deviceWrites).toEqual(["rr_device.filter.applied"]);
  });

  it("keeps the preset dropdown's None hold only while the applied filter is the default", async () => {
    const { dialog, store } = setup([EVERYTHING]);
    store.pickHeaderPreset("");
    await dialog.open();
    await dialog.apply();
    expect(store.headerExplicitNone.value).toBe(true);
    expect(store.activePresetName.value).toBeNull();

    await dialog.open();
    dialog.changeGeneral({ favoritesOn: true });
    await dialog.apply();
    expect(store.headerExplicitNone.value).toBe(false);
  });

  it("keeps the dialog open and applies nothing when the presets cannot be saved", async () => {
    const { dialog, view, store, server, statuses, notices, library, panel } = setup([FAVORITES]);
    server.saveStatus = 500;
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed");
    dialog.addPreset();

    await dialog.apply();

    expect(notices).toEqual(["Saving presets failed (500)."]);
    expect(statuses).toEqual([]);
    expect(dialog.isOpen.value).toBe(true);
    expect(panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(view().presetsChanged).toBe(true);
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(library.commitQuery).not.toHaveBeenCalled();
  });

  it("says a preset save that couldn't reach the server failed, and applies nothing", async () => {
    const { dialog, view, store, server, statuses, notices, library } = setup([FAVORITES]);
    await dialog.open();
    dialog.typeNewPresetName("Unplayed");
    dialog.addPreset();
    server.saveStatus = 0;

    await dialog.apply();

    expect(notices).toEqual(["Saving presets failed: Couldn't reach the server."]);
    expect(statuses).toEqual([]);
    expect(view().presetsChanged).toBe(true);
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(library.commitQuery).not.toHaveBeenCalled();
  });

  it("Refresh keeps a preset list Apply hasn't saved, and Apply's star, and Apply then saves it", async () => {
    const { dialog, view, server, store } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.movePreset(0, 1);
    server.presets = [FAVORITES, RECENT, EVERYTHING];

    await dialog.refresh();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().presetsChanged).toBe(true);
    expect(view().pending).toBe(true);
    expect(store.presets.peek().map((preset) => preset.name)).toEqual(["Favorites", "Recent", "Everything"]);

    await dialog.apply();
    const saves = server.requests.filter((request) => request.method === "POST" && request.path === "/api/presets");
    expect(saves).toHaveLength(1);
    expect(saves[0]!.body.map((preset: any) => preset.name)).toEqual(["Recent", "Favorites"]);
  });

  it("Refresh takes the server's preset list while there are no preset changes", async () => {
    const { dialog, view, server } = setup([FAVORITES]);
    await dialog.open();
    server.presets = [FAVORITES, RECENT];
    await dialog.refresh();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
  });

  it("Cancel puts back the applied filter and the saved presets, applies and saves nothing, and closes the panel as the overlay", async () => {
    const { dialog, view, store, server, library, panel } = setup([FAVORITES, RECENT]);
    store.pickHeaderPreset("preset-favorites");
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.movePreset(0, 1);
    dialog.typeNewPresetName("Draft");
    dialog.editPreset(0);
    expect(view().pending).toBe(true);

    dialog.cancel();

    expect(panel.closeIfOverlay).toHaveBeenCalledTimes(1);
    expect(view().working).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: false });
    expect(view().general).toMatchObject({ favoritesOn: true, onlyNeverPlayed: false });
    expect(view().presets.map((preset) => preset.name)).toEqual(["Favorites", "Recent"]);
    expect(view().presetsChanged).toBe(false);
    expect(view().newPresetName).toBe("");
    expect(view().presetEdit).toBeNull();
    expect(view().heading).toBe("Preset: Favorites");
    expect(view().pending).toBe(false);
    expect(server.requests.filter((request) => request.method === "POST" && request.path === "/api/presets")).toHaveLength(0);
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
    // keeps while it hides.
    expect(view().pending).toBe(true);
    expect(view().unsaved).toBe(true);
    dialog.close();
    await dialog.open();
    expect(view().working).toEqual(createDefaultFilterState());
    expect(view()).toMatchObject({ pending: true, unsaved: true });
  });

  it("has nothing to apply after Clear all while the applied filter is the default", async () => {
    const { dialog, view } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    expect(view().pending).toBe(true);

    dialog.clearAll();
    expect(view()).toMatchObject({ pending: false, unsaved: false });
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
    expect(view().pending).toBe(false);
    expect(view().heading).toBe("Preset: Favorites");

    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.close();
    expect(view().pending).toBe(true);
    store.pickHeaderPreset("");
    expect(view().working).toMatchObject({ favoritesMode: "off", onlyNeverPlayed: false });
    expect(view().pending).toBe(false);
  });
});
