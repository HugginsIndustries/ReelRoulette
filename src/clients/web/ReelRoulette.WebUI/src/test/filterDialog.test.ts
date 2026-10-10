import { describe, expect, it, vi } from "vitest";
import { createFilterDialog } from "../filter/filterDialog";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset } from "../state/appStore";

const FAVORITES: ApiPreset = { id: "preset-favorites", name: "Favorites", filterState: { favoritesOnly: true } };
const EVERYTHING: ApiPreset = { id: "preset-everything", name: "Everything", filterState: {} };
const RECENT: ApiPreset = { id: "preset-recent", name: "Recent", filterState: { onlyNeverPlayed: true } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(presets: ApiPreset[] = [FAVORITES]) {
  const server = {
    presets: presets.slice(),
    sourcesStatus: 200,
    saveStatus: 200,
    requests: [] as Array<{ method: string; path: string; body: any }>
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    server.requests.push({ method, path, body });
    if (path === "/api/sources") {
      return json([{ id: "source-1", displayName: "Movies" }, { id: "source-2", displayName: "Photos" }], server.sourcesStatus);
    }
    if (path === "/api/tag-editor/model") {
      return json({ categories: [{ id: "places", name: "Places", sortOrder: 0 }], tags: [{ name: "Beach", categoryId: "places" }] });
    }
    if (path === "/api/presets" && method === "POST") {
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
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    relay: () => {}
  });
  store.presets.value = presets.slice();
  store.syncHeaderPresets();
  const setStatus = store.setStatus;
  store.setStatus = (message, logText) => {
    statuses.push(message);
    setStatus(message, logText);
  };
  const api = createAppApi("http://server", { onUnauthorized: () => {}, fetch: fetchImpl });
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
  const session = new Map<string, string>();
  const storage = {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => void session.set(key, value)
  };
  const confirm = vi.fn((_message: string) => true);
  const prompt = vi.fn((_message: string, _value: string): string | null => null);
  const dialog = createFilterDialog({ store, api, connection, library, storage, confirm, prompt });
  const view = () => dialog.view.value!;
  return { dialog, view, store, server, statuses, steps, library, session, confirm, prompt };
}

describe("opening", () => {
  it("loads sources, tags, and presets, then starts on General from the applied filter and the header's preset", async () => {
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

  it("stays closed while the server is incompatible, and says why when its data cannot load", async () => {
    const { dialog, store, server, statuses } = setup();
    store.compatibilityBlocked.value = true;
    await dialog.open();
    expect(server.requests).toHaveLength(0);

    store.compatibilityBlocked.value = false;
    server.sourcesStatus = 500;
    await dialog.open();
    expect(statuses).toEqual(["Filter dialog load failed: HTTP 500"]);
    expect(dialog.isOpen.value).toBe(false);
    expect(dialog.view.value).toBeNull();
  });

  it("opens on None while the header holds None, even when a saved preset has the default filter", async () => {
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

    dialog.changeGeneral({ noMax: false });
    dialog.typeDuration("max", "2:00");
    expect(view().general.maxText).toBe("2:00");
    expect(view().working.maxDurationSeconds).toBeNull();
    expect(view().pending).toBe(false);

    dialog.changeGeneral({ maxText: "2:00" });
    expect(view().working.maxDurationSeconds).toBe(120);
    expect(view().pending).toBe(true);
  });

  it("keeps an unchecked No minimum and text that is not valid as the user left them", async () => {
    const { dialog, view } = setup();
    await dialog.open();

    dialog.changeGeneral({ noMin: false });
    expect(view().general).toMatchObject({ noMin: false, minText: "" });
    dialog.changeGeneral({ minText: "abc" });
    expect(view().general.minText).toBe("abc");
    expect(view().working.minDurationSeconds).toBeNull();

    dialog.changeGeneral({ noMin: true });
    expect(view().general).toMatchObject({ noMin: true, minText: "" });
  });

  it("refuses to apply a duration that is not valid and shows General", async () => {
    const { dialog, view, statuses, library } = setup();
    await dialog.open();
    dialog.changeGeneral({ noMin: false, minText: "abc" });
    dialog.showTab("tags");

    await dialog.apply();

    expect(statuses.at(-1)).toBe("Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.");
    expect(dialog.tab.value).toBe("general");
    expect(dialog.isOpen.value).toBe(true);
    expect(view().general.minText).toBe("abc");
    expect(library.commitQuery).not.toHaveBeenCalled();
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

  it("keeps collapsed categories for the session and ignores a stored value it cannot read", async () => {
    const { dialog, view, session } = setup();
    session.set("rr_filterDialogCollapsedCategories", "not json");
    await dialog.open();
    expect([...view().collapsed]).toEqual([]);

    dialog.toggleCategory("places");
    expect(session.get("rr_filterDialogCollapsedCategories")).toBe('["places"]');
    await dialog.open();
    expect([...view().collapsed]).toEqual(["places"]);
    dialog.toggleCategory("places");
    expect(session.get("rr_filterDialogCollapsedCategories")).toBe("[]");
  });
});

describe("Presets tab", () => {
  it("adds, moves, renames, and deletes presets in the working copy, and keeps a typed name meanwhile", async () => {
    const { dialog, view, statuses, confirm, prompt } = setup([FAVORITES, RECENT]);
    await dialog.open();

    dialog.typeNewPresetName("Draft name");
    dialog.movePreset(0, 1);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().newPresetName).toBe("Draft name");
    dialog.movePreset(0, -1);
    dialog.movePreset(1, 1);
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);

    dialog.typeNewPresetName("recent");
    dialog.addPreset();
    expect(statuses.at(-1)).toBe("A preset with that name already exists.");
    dialog.typeNewPresetName("  Mine ");
    dialog.addPreset();
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites", "Mine"]);
    expect(view().newPresetName).toBe("");
    expect(dialog.tab.value).toBe("presets");

    prompt.mockReturnValue("Ours");
    dialog.renamePreset(2);
    expect(prompt).toHaveBeenCalledWith("Rename preset", "Mine");
    expect(view().heading).toBe("Preset: Ours");

    confirm.mockReturnValue(false);
    dialog.deletePreset(2);
    expect(view().presets).toHaveLength(3);
    confirm.mockReturnValue(true);
    dialog.deletePreset(2);
    expect(confirm).toHaveBeenLastCalledWith('Delete preset "Ours"?');
    expect(view().presets.map((preset) => preset.name)).toEqual(["Recent", "Favorites"]);
    expect(view().presetsChanged).toBe(true);
  });

  it("leaves the General tab as the user left it when a preset is deleted", async () => {
    const { dialog, view } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.changeGeneral({ noMin: false, minText: "abc" });

    dialog.deletePreset(1);

    expect(view().general).toMatchObject({ noMin: false, minText: "abc" });
  });

  it("updates the chosen preset with the working filter", async () => {
    const { dialog, view, statuses } = setup([FAVORITES, RECENT]);
    await dialog.open();
    dialog.updatePreset();
    expect(statuses.at(-1)).toBe("Select a preset to update.");

    dialog.choosePreset("Recent");
    dialog.changeGeneral({ favoritesOn: true });
    expect(view().heading).toBe("Preset: Recent*");
    dialog.updatePreset();
    expect(statuses.at(-1)).toBe('Updated preset "Recent" locally — Apply to save.');
    expect(view().presets[1]!.filterState).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: true });
    expect(view().heading).toBe("Preset: Recent");
  });
});

describe("applying", () => {
  it("saves changed presets, applies the filter, reloads presets, closes, and then starts the library over", async () => {
    const { dialog, store, server, steps, statuses } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ favoritesOn: true, onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed favorites");
    dialog.addPreset();
    steps.length = 0;

    await dialog.apply();

    expect(server.requests.filter((request) => request.method === "POST" && request.path === "/api/presets")[0]!.body.map(
      (preset: any) => preset.name
    )).toEqual(["Favorites", "Unplayed favorites"]);
    expect(steps).toEqual(["loadPresets", "commitQuery favoritesMode=only"]);
    expect(store.appliedFilter.value).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: true });
    expect(store.activePresetName.value).toBe("Unplayed favorites");
    expect(store.presetMenu.value.selectedValue).toBe("saved-2");
    expect(dialog.isOpen.value).toBe(false);
    expect(statuses.at(-1)).toBe("Filters applied.");
  });

  it("keeps the header's None hold only while the applied filter is the default", async () => {
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
    const { dialog, view, store, server, statuses, library } = setup([FAVORITES]);
    server.saveStatus = 500;
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });
    dialog.typeNewPresetName("Unplayed");
    dialog.addPreset();

    await dialog.apply();

    expect(statuses.at(-1)).toBe("Saving presets failed (500).");
    expect(dialog.isOpen.value).toBe(true);
    expect(view().presetsChanged).toBe(true);
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
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
    expect(view().pending).toBe(false);
    expect(view().heading).toBe("Preset: None");
  });
});

describe("header changes", () => {
  it("start the open dialog over from the header's filter, and leave a closed one alone", async () => {
    const { dialog, view, store } = setup([FAVORITES]);
    await dialog.open();
    dialog.changeGeneral({ onlyNeverPlayed: true });

    store.pickHeaderPreset("preset-favorites");
    expect(view().working).toMatchObject({ favoritesMode: "only", onlyNeverPlayed: false });
    expect(view().general).toMatchObject({ favoritesOn: true, favoritesChoice: "only" });
    expect(view().pending).toBe(false);
    expect(view().heading).toBe("Preset: Favorites");

    dialog.close();
    store.pickHeaderPreset("");
    expect(view().working.favoritesMode).toBe("only");
  });
});
