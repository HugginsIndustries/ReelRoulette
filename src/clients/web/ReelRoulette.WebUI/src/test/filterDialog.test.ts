import { describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "../dialogs/dialogs";
import { createFilterDialog } from "../filter/filterDialog";
import { DURATION_PROBLEM, FLAG_MODES_PROBLEM } from "../filter/filterDialogModel";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset } from "../state/appStore";
import { EMPTY_FIELD } from "../validation/fieldValidation";

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
  const confirm = vi.fn(async (_request: ConfirmRequest) => true);
  const dialog = createFilterDialog({ store, api, connection, library, storage, dialogs: { confirm } });
  const view = () => dialog.view.value!;
  return { dialog, view, store, server, statuses, steps, library, session, confirm };
}

/** An action that is neither disabled nor held. */
const FREE = { disabled: false, heldBy: null };
const DISABLED = { disabled: true, heldBy: null };

function heldBy(field: string) {
  return { disabled: false, heldBy: field };
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
    const { dialog, view, statuses, library, server, store } = setup();
    await dialog.open();
    dialog.typeDuration("min", "abc");
    expect(view().pending).toBe(false);
    expect(view().actions.apply).toEqual(heldBy("minDuration"));
    dialog.showTab("tags");

    await dialog.apply();
    expect(dialog.tab.value).toBe("general");
    expect(dialog.reveal.request.value).toEqual({ field: "minDuration", count: 1 });
    expect(dialog.isOpen.value).toBe(true);
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
