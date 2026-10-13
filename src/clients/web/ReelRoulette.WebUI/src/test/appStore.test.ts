import { describe, expect, it, vi } from "vitest";
import { createDefaultFilterState, HEADER_PRESET_STARRED_VALUE, serializeFilterStateForApi } from "../filter/filterStateModel";
import { createAppStore, type AppStoreOptions, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";

const FAVORITES = {
  id: "preset-favorites",
  name: "Favorites",
  filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const }
};
const EVERYTHING = {
  id: "preset-everything",
  name: "Everything",
  filterState: serializeFilterStateForApi(createDefaultFilterState())
};

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writtenKeys: string[] = [];
  return {
    values,
    writtenKeys,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writtenKeys.push(key);
      values.set(key, value);
    }
  };
}

function setup(options: Partial<AppStoreOptions> & { saved?: Record<string, string> } = {}) {
  const storage = memoryStorage(options.saved);
  const relayed: string[] = [];
  let now = 1_000;
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage,
    relay: (_level, message) => relayed.push(message),
    now: () => now,
    ...options,
    device: options.device ?? createDeviceStore(storage)
  });
  return {
    store,
    storage,
    relayed,
    advance(ms: number) {
      now += ms;
    }
  };
}

describe("createAppStore", () => {
  it("starts with the saved photo duration and randomization mode, and the defaults when they are missing or invalid", () => {
    const saved = setup({ saved: { rr_photoDuration: "42", rr_randomizationMode: "SpreadMode" } }).store;
    expect(saved.photoDurationSeconds.value).toBe(42);
    expect(saved.randomizationMode.value).toBe("SpreadMode");

    const invalid = setup({ saved: { rr_photoDuration: "301", rr_randomizationMode: "Shuffle" } }).store;
    expect(invalid.photoDurationSeconds.value).toBe(15);
    expect(invalid.randomizationMode.value).toBe("SmartShuffle");

    const empty = setup().store;
    expect(empty.photoDurationSeconds.value).toBe(15);
    expect(empty.presetMenu.value).toEqual({ entries: [{ label: "Loading...", value: "" }], selectedValue: "", message: true });
  });

  it("saves a photo duration from 1 to 300 seconds, tells listeners, and ignores anything else", () => {
    const { store, storage } = setup();
    const changed = vi.fn();
    store.on("photoDurationChanged", changed);

    store.setPhotoDuration("1");
    store.setPhotoDuration("300");
    expect(store.photoDurationSeconds.value).toBe(300);
    expect(storage.values.get("rr_photoDuration")).toBe("300");
    expect(changed).toHaveBeenCalledTimes(2);

    for (const invalid of ["0", "301", "", "abc"]) {
      store.setPhotoDuration(invalid);
    }
    expect(store.photoDurationSeconds.value).toBe(300);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("saves the randomization mode, and an empty one as Smart Shuffle", () => {
    const { store, storage } = setup();
    store.setRandomizationMode("PureRandom");
    expect(storage.values.get("rr_randomizationMode")).toBe("PureRandom");

    store.setRandomizationMode("");
    expect(store.randomizationMode.value).toBe("SmartShuffle");
    expect(storage.values.get("rr_randomizationMode")).toBe("SmartShuffle");
  });

  it("relays a status change with the playing state, uses the log text when given, and relays a repeat once a second", () => {
    const { store, relayed, advance } = setup();
    store.setStatus("Ready");
    store.current.value = { id: "C:\\clip.mp4", itemId: "item-1" } as PlayingItem;
    store.playAttemptId.value = 3;
    store.setStatus("Synced: Blacklisted: clip.mp4", "Synced: Blacklisted");
    expect(store.status.value).toBe("Synced: Blacklisted: clip.mp4");
    expect(relayed).toEqual([
      "status=Ready hasCurrent=false attempt=0",
      "status=Synced: Blacklisted hasCurrent=true attempt=3"
    ]);

    store.setStatus("Synced: Blacklisted: other.mp4", "Synced: Blacklisted");
    advance(1_000);
    store.setStatus("Synced: Blacklisted: other.mp4", "Synced: Blacklisted");
    expect(relayed).toHaveLength(2);
    advance(1);
    store.setStatus("Synced: Blacklisted: other.mp4", "Synced: Blacklisted");
    expect(relayed).toHaveLength(3);
  });

  it("empties the status line only while it still shows the message, and relays nothing", () => {
    const { store, relayed } = setup();
    store.setStatus("Loading...");
    store.clearStatus("Loading...");
    expect(store.status.value).toBe("");

    store.setStatus("Loading...");
    store.setStatus("SSE connected");
    store.clearStatus("Loading...");
    expect(store.status.value).toBe("SSE connected");
    expect(relayed.map((line) => line.split(" hasCurrent")[0])).toEqual(["status=Loading...", "status=SSE connected"]);
  });

  it("lists None and the presets, and selects the preset that matches the applied filter", () => {
    const { store } = setup();
    store.presets.value = [FAVORITES];
    store.syncHeaderPresets();
    expect(store.presetMenu.value).toEqual({
      entries: [
        { label: "None", value: "" },
        { label: "Favorites", value: "preset-favorites" }
      ],
      selectedValue: "",
      message: false
    });
    expect(store.activePresetName.value).toBeNull();

    store.appliedFilter.value = { ...createDefaultFilterState(), favoritesMode: "only" };
    store.syncHeaderPresets();
    expect(store.selectedPresetValue()).toBe("preset-favorites");
    expect(store.activePresetName.value).toBe("Favorites");
  });

  it("applies a picked preset and tells listeners only when the filter changes", () => {
    const { store } = setup();
    const changed = vi.fn();
    store.on("headerFilterChanged", changed);
    store.presets.value = [FAVORITES];
    store.syncHeaderPresets();

    store.pickHeaderPreset("preset-favorites");
    expect(store.appliedFilter.value.favoritesMode).toBe("only");
    expect(store.selectedPresetValue()).toBe("preset-favorites");
    expect(changed).toHaveBeenCalledTimes(1);

    store.pickHeaderPreset("preset-favorites");
    expect(changed).toHaveBeenCalledTimes(1);

    store.pickHeaderPreset("");
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("keeps the filter on the starred row and shows it while the filter matches no preset", () => {
    const { store } = setup();
    const changed = vi.fn();
    store.on("headerFilterChanged", changed);
    store.presets.value = [FAVORITES];
    store.appliedFilter.value = { ...createDefaultFilterState(), onlyNeverPlayed: true };
    store.syncHeaderPresets();
    expect(store.presetMenu.value.entries[0]).toEqual({ label: "None*", value: HEADER_PRESET_STARRED_VALUE });

    store.pickHeaderPreset(HEADER_PRESET_STARRED_VALUE);
    expect(store.appliedFilter.value.onlyNeverPlayed).toBe(true);
    expect(store.selectedPresetValue()).toBe(HEADER_PRESET_STARRED_VALUE);
    expect(changed).not.toHaveBeenCalled();
  });

  it("holds None after it is picked, even when a preset has the default filter, until the filter changes", () => {
    const { store } = setup();
    store.presets.value = [EVERYTHING];
    store.syncHeaderPresets();
    expect(store.selectedPresetValue()).toBe("preset-everything");

    store.pickHeaderPreset("");
    expect(store.headerExplicitNone.value).toBe(true);
    expect(store.selectedPresetValue()).toBe("");
    store.syncHeaderPresets();
    expect(store.selectedPresetValue()).toBe("");

    store.appliedFilter.value = { ...createDefaultFilterState(), favoritesMode: "only" };
    store.syncHeaderPresets();
    expect(store.headerExplicitNone.value).toBe(false);
    store.appliedFilter.value = createDefaultFilterState();
    store.syncHeaderPresets();
    expect(store.selectedPresetValue()).toBe("preset-everything");
  });

  it("shows one message in place of the presets", () => {
    const { store } = setup();
    store.presets.value = [FAVORITES];
    store.syncHeaderPresets();
    store.showPresetMenuMessage("Error loading presets");
    expect(store.presetMenu.value).toEqual({ entries: [{ label: "Error loading presets", value: "" }], selectedValue: "", message: true });
    expect(store.selectedPresetValue()).toBe("");
  });

  it("adds a played item to history after the playing one, dropping the rest, with its last-seen favorite and blacklist", () => {
    const { store } = setup();
    const item = (itemId: string): PlayingItem => ({
      id: `/media/${itemId}.mp4`,
      itemId,
      displayName: `${itemId}.mp4`,
      mediaType: "video",
      mediaUrl: `/api/media/${itemId}`,
      isFavorite: false,
      isBlacklisted: false
    });
    store.itemStates.remember("c", { isFavorite: true, isBlacklisted: false });

    store.pushHistory(item("a"));
    store.pushHistory(item("b"));
    expect(store.stepHistory(1)).toBe(false);
    expect(store.stepHistory(-1)).toBe(true);
    expect(store.current.value?.itemId).toBe("a");
    expect(store.stepHistory(-1)).toBe(false);

    store.pushHistory(item("c"));
    expect(store.history.value.map((entry) => entry.itemId)).toEqual(["a", "c"]);
    expect(store.historyIndex.value).toBe(1);
    expect(store.current.value?.isFavorite).toBe(true);
    expect(store.stepHistory(-1)).toBe(true);
    expect(store.stepHistory(1)).toBe(true);
    expect(store.current.value?.itemId).toBe("c");
  });

  it("does not step through history before anything plays", () => {
    const { store } = setup();
    expect(store.stepHistory(1)).toBe(false);
    expect(store.stepHistory(-1)).toBe(false);
    expect(store.current.value).toBeNull();
  });
});

describe("remembered filter", () => {
  const KEY = "rr_device.filter.applied";
  const BEACH = {
    id: "Beach",
    name: "Beach",
    filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Beach"] })
  };

  function remembered(storage: { values: Map<string, string> }): any {
    const raw = storage.values.get(KEY);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  function record(filter: Partial<ReturnType<typeof createDefaultFilterState>>, preset: string | null, unchanged: boolean) {
    return JSON.stringify({
      filter: serializeFilterStateForApi({ ...createDefaultFilterState(), ...filter }),
      preset,
      holdNone: false,
      unchanged
    });
  }

  it("keeps the applied filter and its preset, round trip, and writes only when they change", () => {
    const first = setup();
    first.store.presets.value = [FAVORITES];
    first.store.presetsLoaded();
    expect(remembered(first.storage)).toBeUndefined();

    const full = {
      ...createDefaultFilterState(),
      favoritesMode: "excluded" as const,
      blacklistedMode: "only" as const,
      onlyNeverPlayed: true,
      onlyKnownLoudness: true,
      audioFilter: 2 as const,
      mediaTypeFilter: 1 as const,
      globalMatchMode: false,
      categoryLocalMatchModes: { "cat-mood": 1 as const },
      selectedTags: ["Beach", "Sunset"],
      excludedTags: ["Rain"],
      includedSourceIds: ["source-1"],
      minDurationSeconds: 90,
      maxDurationSeconds: 3600
    };
    first.store.appliedFilter.value = full;
    first.store.syncHeaderPresets();
    expect(remembered(first.storage)).toMatchObject({ preset: null, holdNone: false, unchanged: false });

    const again = setup({ saved: Object.fromEntries(first.storage.values) });
    expect(again.store.appliedFilter.value).toEqual(full);
    expect(again.store.activePresetName.value).toBeNull();

    // Nothing is written while presets load, nor when they bring back the remembered preset unchanged.
    const quiet = setup({ saved: { [KEY]: record({ favoritesMode: "only" }, "Favorites", true) } });
    expect(quiet.storage.writtenKeys).toEqual([]);
    quiet.store.presets.value = [FAVORITES];
    quiet.store.presetsLoaded();
    expect(quiet.storage.writtenKeys).toEqual([]);
    expect(quiet.storage.values.get(KEY)).toBe(record({ favoritesMode: "only" }, "Favorites", true));
  });

  it("writes one record for each preset pick", () => {
    const { store, storage } = setup();
    store.presets.value = [FAVORITES];
    store.presetsLoaded();
    const writes = () => storage.writtenKeys.filter((key) => key === KEY).length;

    store.pickHeaderPreset(FAVORITES.id);
    expect(writes()).toBe(1);
    expect(remembered(storage)).toMatchObject({ preset: "Favorites", holdNone: false, unchanged: true });

    store.pickHeaderPreset("");
    expect(writes()).toBe(2);
    expect(remembered(storage)).toMatchObject({ preset: null, holdNone: true, unchanged: false });
  });

  it("keeps the remembered preset to apply again on a later load when presets never load", () => {
    const first = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "Beach", true) } });
    first.store.showPresetMenuMessage("Error loading presets");
    expect(first.storage.writtenKeys).toEqual([]);

    const again = setup({ saved: Object.fromEntries(first.storage.values) });
    again.store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    again.store.presetsLoaded();
    expect(again.store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(again.store.selectedPresetValue()).toBe("Beach");
  });

  it("restores a held None, and reads a record it can't use as the default filter on None", () => {
    const held = setup({ saved: { [KEY]: JSON.stringify({ ...JSON.parse(record({}, null, false)), holdNone: true }) } });
    held.store.presets.value = [EVERYTHING];
    held.store.presetsLoaded();
    expect(held.store.selectedPresetValue()).toBe("");

    for (const raw of ["{", "[]", JSON.stringify({ filter: {}, preset: 3, holdNone: false, unchanged: true })]) {
      const { store } = setup({ saved: { [KEY]: raw } });
      expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
      expect(store.activePresetName.value).toBeNull();
    }
  });

  it("applies a remembered preset's own filter again as the server has it now, so a tag renamed elsewhere follows", () => {
    const { store, storage } = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "Beach", true) } });
    const changed = vi.fn();
    store.on("headerFilterChanged", changed);
    expect(store.appliedFilter.value.selectedTags).toEqual(["Beach"]);

    store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    store.presetsLoaded();
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Beach"]);
    expect(store.selectedPresetValue()).toBe("Beach");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(remembered(storage)).toMatchObject({ preset: "Beach", unchanged: true, filter: { selectedTags: ["Shore"] } });

    // Only the first load applies it again; later loads leave the filter to the user.
    store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Coast"] }) }];
    store.presetsLoaded();
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(store.presetMenu.value.entries[0]!.label).toBe("Beach*");
  });

  it("keeps a remembered changed filter as it was, starred, and drops a deleted preset to None*", () => {
    const starred = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"], onlyNeverPlayed: true }, "Beach", false) } });
    starred.store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    starred.store.presetsLoaded();
    expect(starred.store.appliedFilter.value.selectedTags).toEqual(["Beach"]);
    expect(starred.store.presetMenu.value.entries[0]!.label).toBe("Beach*");

    const deleted = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "Beach", true) } });
    deleted.store.presets.value = [FAVORITES];
    deleted.store.presetsLoaded();
    expect(deleted.store.appliedFilter.value.selectedTags).toEqual(["Beach"]);
    expect(deleted.store.presetMenu.value.entries[0]!.label).toBe("None*");
    expect(deleted.store.activePresetName.value).toBeNull();
  });

  it("finds a remembered preset renamed elsewhere by its filter", () => {
    const { store } = setup({ saved: { [KEY]: record({ favoritesMode: "only" }, "Old favorites", true) } });
    store.presets.value = [FAVORITES];
    store.presetsLoaded();
    expect(store.selectedPresetValue()).toBe("preset-favorites");
    expect(store.activePresetName.value).toBe("Favorites");
  });

  it("doesn't apply the remembered preset again once another filter applied before presets loaded", () => {
    const { store } = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "Beach", true) } });
    store.appliedFilter.value = { ...createDefaultFilterState(), onlyNeverPlayed: true };
    store.activePresetName.value = null;
    store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    store.presetsLoaded();
    expect(store.appliedFilter.value).toEqual({ ...createDefaultFilterState(), onlyNeverPlayed: true });
  });
});
