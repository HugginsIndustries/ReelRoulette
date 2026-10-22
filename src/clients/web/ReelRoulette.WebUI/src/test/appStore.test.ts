import { describe, expect, it, vi } from "vitest";
import { createDefaultFilterState, HEADER_PRESET_STARRED_VALUE, serializeFilterStateForApi } from "../filter/filterStateModel";
import { createAppStore, type AppStoreOptions, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";

const FAVORITES = {
  id: "preset-favorites",
  name: "Favorites",
  filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const }
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
  it("starts with the saved Advance after, autoplay settings, and randomization mode, and the defaults when they are missing or invalid", () => {
    const saved = setup({
      saved: {
        "rr_device.playback.advanceAfter": "3600",
        "rr_device.playback.autoplayMode": '"timer"',
        "rr_device.playback.loopStopsAutoplay": "false",
        rr_randomizationMode: "SpreadMode"
      }
    }).store;
    expect(saved.advanceAfterSeconds.value).toBe(3600);
    expect(saved.autoplayMode.value).toBe("timer");
    expect(saved.loopStopsAutoplay.value).toBe(false);
    expect(saved.randomizationMode.value).toBe("SpreadMode");

    const invalid = setup({
      saved: {
        "rr_device.playback.advanceAfter": "3601",
        "rr_device.playback.autoplayMode": '"keep"',
        "rr_device.playback.loopStopsAutoplay": '"no"',
        rr_randomizationMode: "Shuffle"
      }
    }).store;
    expect(invalid.advanceAfterSeconds.value).toBe(10);
    expect(invalid.autoplayMode.value).toBe("normal");
    expect(invalid.loopStopsAutoplay.value).toBe(true);
    expect(invalid.randomizationMode.value).toBe("SmartShuffle");

    const empty = setup().store;
    expect(empty.advanceAfterSeconds.value).toBe(10);
    expect(empty.autoplayMode.value).toBe("normal");
    expect(empty.loopStopsAutoplay.value).toBe(true);
    expect(empty.presetMenu.value).toEqual({ entries: [{ label: "Loading...", value: "" }], selectedValue: "", message: true });
  });

  it("saves Advance after from 1 to 3600 seconds on this device, tells listeners, and ignores anything else", () => {
    const { store, storage } = setup();
    const changed = vi.fn();
    store.on("advanceAfterChanged", changed);

    store.setAdvanceAfter(1);
    store.setAdvanceAfter(3600);
    expect(store.advanceAfterSeconds.value).toBe(3600);
    expect(storage.values.get("rr_device.playback.advanceAfter")).toBe("3600");
    expect(changed).toHaveBeenCalledTimes(2);

    for (const invalid of [0, 3601, 1.5, Number.NaN]) {
      store.setAdvanceAfter(invalid);
    }
    expect(store.advanceAfterSeconds.value).toBe(3600);
    expect(storage.values.get("rr_device.playback.advanceAfter")).toBe("3600");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("saves the autoplay mode and Loop stops autoplay on this device, and tells listeners", () => {
    const { store, storage } = setup();
    const changed = vi.fn();
    store.on("autoplaySettingsChanged", changed);

    store.setAutoplayMode("timer");
    store.setLoopStopsAutoplay(false);
    expect([store.autoplayMode.value, store.loopStopsAutoplay.value]).toEqual(["timer", false]);
    expect(storage.values.get("rr_device.playback.autoplayMode")).toBe('"timer"');
    expect(storage.values.get("rr_device.playback.loopStopsAutoplay")).toBe("false");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("starts Loop and Autoplay as kept on this device, off by default, and keeps each change", () => {
    const fresh = setup();
    expect(fresh.store.loop.value).toBe(false);
    expect(fresh.store.autoplay.value).toBe(false);

    fresh.store.setLoop(true);
    fresh.store.setAutoplay(true);
    expect(fresh.storage.values.get("rr_device.player.loop")).toBe("true");
    expect(fresh.storage.values.get("rr_device.player.autoplay")).toBe("true");

    const kept = setup({ saved: Object.fromEntries(fresh.storage.values) }).store;
    expect(kept.loop.value).toBe(true);
    expect(kept.autoplay.value).toBe(true);

    kept.setLoop(false);
    expect(kept.loop.value).toBe(false);
  });

  it("saves the randomization mode, and an empty one as Smart Shuffle", () => {
    const { store, storage } = setup();
    store.setRandomizationMode("PureRandom");
    expect(storage.values.get("rr_randomizationMode")).toBe("PureRandom");

    store.setRandomizationMode("");
    expect(store.randomizationMode.value).toBe("SmartShuffle");
    expect(storage.values.get("rr_randomizationMode")).toBe("SmartShuffle");
  });

  it("relays a message's text with the playing state, and relays a repeat once a second", () => {
    const { store, relayed, advance } = setup();
    store.relayStatus("Ready");
    store.current.value = { id: "C:\\clip.mp4", itemId: "item-1" } as PlayingItem;
    store.playAttemptId.value = 3;
    store.relayStatus("Blacklisted on another device");
    expect(relayed).toEqual([
      "status=Ready hasCurrent=false attempt=0",
      "status=Blacklisted on another device hasCurrent=true attempt=3"
    ]);

    store.relayStatus("Blacklisted on another device");
    advance(1_000);
    store.relayStatus("Blacklisted on another device");
    expect(relayed).toHaveLength(2);
    advance(1);
    store.relayStatus("Blacklisted on another device");
    expect(relayed).toHaveLength(3);
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
    expect(store.activePresetId.value).toBeNull();

    store.appliedFilter.value = { ...createDefaultFilterState(), favoritesMode: "only" };
    store.syncHeaderPresets();
    expect(store.selectedPresetValue()).toBe("preset-favorites");
    expect(store.activePresetId.value).toBe("preset-favorites");
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
      isBlacklisted: false,
      rating: null
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

  it("adds a random pick at the end of history from anywhere in it, keeping every entry, with its last-seen favorite and blacklist", () => {
    const { store } = setup();
    const item = (itemId: string): PlayingItem => ({
      id: `/media/${itemId}.mp4`,
      itemId,
      displayName: `${itemId}.mp4`,
      mediaType: "video",
      mediaUrl: `/api/media/${itemId}`,
      isFavorite: false,
      isBlacklisted: false,
      rating: null
    });
    store.itemStates.remember("d", { isFavorite: false, isBlacklisted: true });

    store.appendHistory(item("a"));
    store.appendHistory(item("b"));
    store.appendHistory(item("c"));
    expect(store.stepHistory(-1)).toBe(true);
    expect(store.stepHistory(-1)).toBe(true);
    expect(store.current.value?.itemId).toBe("a");

    store.appendHistory(item("d"));
    expect(store.history.value.map((entry) => entry.itemId)).toEqual(["a", "b", "c", "d"]);
    expect(store.historyIndex.value).toBe(3);
    expect(store.current.value?.itemId).toBe("d");
    expect(store.current.value?.isBlacklisted).toBe(true);
    expect(store.stepHistory(-1)).toBe(true);
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
    id: "preset-beach",
    name: "Beach",
    filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Beach"] })
  };

  function remembered(storage: { values: Map<string, string> }): any {
    const raw = storage.values.get(KEY);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  function record(filter: Partial<ReturnType<typeof createDefaultFilterState>>, presetId: string | null, unchanged: boolean) {
    return JSON.stringify({
      filter: serializeFilterStateForApi({ ...createDefaultFilterState(), ...filter }),
      presetId,
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
      onlyBrowserPlayable: true,
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
    expect(remembered(first.storage)).toMatchObject({ presetId: null, unchanged: false });

    const again = setup({ saved: Object.fromEntries(first.storage.values) });
    expect(again.store.appliedFilter.value).toEqual(full);
    expect(again.store.activePresetId.value).toBeNull();

    // Nothing is written while presets load, nor when they bring back the remembered preset unchanged.
    const quiet = setup({ saved: { [KEY]: record({ favoritesMode: "only" }, "preset-favorites", true) } });
    expect(quiet.storage.writtenKeys).toEqual([]);
    quiet.store.presets.value = [FAVORITES];
    quiet.store.presetsLoaded();
    expect(quiet.storage.writtenKeys).toEqual([]);
    expect(quiet.storage.values.get(KEY)).toBe(record({ favoritesMode: "only" }, "preset-favorites", true));
  });

  it("writes one record for each preset pick", () => {
    const { store, storage } = setup();
    store.presets.value = [FAVORITES];
    store.presetsLoaded();
    const writes = () => storage.writtenKeys.filter((key) => key === KEY).length;

    store.pickHeaderPreset(FAVORITES.id);
    expect(writes()).toBe(1);
    expect(remembered(storage)).toMatchObject({ presetId: "preset-favorites", unchanged: true });

    store.pickHeaderPreset("");
    expect(writes()).toBe(2);
    expect(remembered(storage)).toMatchObject({ presetId: null, unchanged: false });
  });

  it("keeps the remembered preset to apply again on a later load when presets never load", () => {
    const first = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "preset-beach", true) } });
    first.store.showPresetMenuMessage("Error loading presets");
    expect(first.storage.writtenKeys).toEqual([]);

    const again = setup({ saved: Object.fromEntries(first.storage.values) });
    again.store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    again.store.presetsLoaded();
    expect(again.store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(again.store.selectedPresetValue()).toBe("preset-beach");
  });

  it("reads a record it can't use as the default filter on None", () => {
    for (const raw of ["{", "[]", JSON.stringify({ filter: {}, preset: 3, unchanged: true })]) {
      const { store } = setup({ saved: { [KEY]: raw } });
      expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
      expect(store.activePresetId.value).toBeNull();
    }
  });

  it("reads a record from before presets had ids, which names its preset in preset, as None with the default filter", () => {
    const before = JSON.stringify({ filter: serializeFilterStateForApi({ ...createDefaultFilterState(), favoritesMode: "only" }), preset: "Favorites", unchanged: true });
    const { store } = setup({ saved: { [KEY]: before } });
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(store.activePresetId.value).toBeNull();
    store.presets.value = [FAVORITES];
    store.presetsLoaded();
    expect(store.appliedFilter.value).toEqual(createDefaultFilterState());
    expect(store.selectedPresetValue()).toBe("");
  });

  it("reads a remembered filter and a picked preset without AND match modes, so a preset saved with a leftover one shows unchanged", () => {
    const { store } = setup({
      saved: { [KEY]: record({ selectedTags: ["Beach"], categoryLocalMatchModes: { "cat-places": 0, "cat-mood": 1 } }, null, false) }
    });
    expect(store.appliedFilter.value.categoryLocalMatchModes).toEqual({ "cat-mood": 1 });

    const leftover = {
      ...BEACH,
      filterState: { ...BEACH.filterState, categoryLocalMatchModes: { "cat-places": 0 } }
    };
    store.presets.value = [leftover];
    store.presetsLoaded();
    store.pickHeaderPreset("preset-beach");
    expect(store.appliedFilter.value.categoryLocalMatchModes).toBeNull();
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Beach"]);
    expect(store.selectedPresetValue()).toBe("preset-beach");
  });

  it("applies a remembered preset's own filter again as the server has it now, so a tag renamed elsewhere follows", () => {
    const { store, storage } = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "preset-beach", true) } });
    const changed = vi.fn();
    store.on("headerFilterChanged", changed);
    expect(store.appliedFilter.value.selectedTags).toEqual(["Beach"]);

    store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    store.presetsLoaded();
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Beach"]);
    expect(store.selectedPresetValue()).toBe("preset-beach");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(remembered(storage)).toMatchObject({ presetId: "preset-beach", unchanged: true, filter: { selectedTags: ["Shore"] } });

    // Only the first load applies it again; later loads leave the filter to the user.
    store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Coast"] }) }];
    store.presetsLoaded();
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(store.presetMenu.value.entries[0]!.label).toBe("Beach*");
  });

  it("keeps a remembered changed filter as it was, starred, and shows a deleted preset as None*, keeping its id", () => {
    const starred = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"], onlyNeverPlayed: true }, "preset-beach", false) } });
    starred.store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    starred.store.presetsLoaded();
    expect(starred.store.appliedFilter.value.selectedTags).toEqual(["Beach"]);
    expect(starred.store.presetMenu.value.entries[0]!.label).toBe("Beach*");

    const deleted = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "preset-beach", true) } });
    deleted.store.presets.value = [FAVORITES];
    deleted.store.presetsLoaded();
    expect(deleted.store.appliedFilter.value.selectedTags).toEqual(["Beach"]);
    expect(deleted.store.presetMenu.value.entries[0]!.label).toBe("None*");
    expect(deleted.store.activePresetId.value).toBe("preset-beach");
  });

  it("keeps the active preset through a list that lacks it, so a modified preset shows starred once a list has it again", () => {
    const { store } = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"], onlyNeverPlayed: true }, "preset-beach", false) } });
    store.presets.value = [];
    store.presetsLoaded();
    expect(store.presetMenu.value.entries[0]!.label).toBe("None*");

    store.presets.value = [BEACH];
    store.presetsLoaded();
    expect(store.presetMenu.value.entries[0]!.label).toBe("Beach*");
    expect(store.activePresetId.value).toBe("preset-beach");
  });

  it("finds a remembered preset renamed elsewhere by its id", () => {
    const { store } = setup({ saved: { [KEY]: record({ favoritesMode: "only" }, "preset-favorites", true) } });
    store.presets.value = [{ ...FAVORITES, name: "Starred" }];
    store.presetsLoaded();
    expect(store.selectedPresetValue()).toBe("preset-favorites");
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Starred"]);
    expect(store.activePresetId.value).toBe("preset-favorites");
  });

  it("doesn't apply the remembered preset again once another filter applied before presets loaded", () => {
    const { store } = setup({ saved: { [KEY]: record({ selectedTags: ["Beach"] }, "preset-beach", true) } });
    store.appliedFilter.value = { ...createDefaultFilterState(), onlyNeverPlayed: true };
    store.activePresetId.value = null;
    store.presets.value = [{ ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) }];
    store.presetsLoaded();
    expect(store.appliedFilter.value).toEqual({ ...createDefaultFilterState(), onlyNeverPlayed: true });
  });

  it("follows the active preset's new filter from reloaded presets, writing one record, and tells listeners without a pick", () => {
    const { store, storage } = setup();
    store.presets.value = [BEACH];
    store.presetsLoaded();
    store.pickHeaderPreset(BEACH.id);
    const writes = () => storage.writtenKeys.filter((key) => key === KEY).length;
    expect(writes()).toBe(1);
    const picked = vi.fn();
    const followed = vi.fn();
    store.on("headerFilterChanged", picked);
    store.on("appliedPresetFollowed", followed);

    const shore = { ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Shore"] }) };
    expect(store.presetsReloaded([shore], BEACH)).toBe(true);
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(store.selectedPresetValue()).toBe("preset-beach");
    expect(writes()).toBe(2);
    expect(remembered(storage)).toMatchObject({ presetId: "preset-beach", unchanged: true, filter: { selectedTags: ["Shore"] } });
    expect(followed).toHaveBeenCalledTimes(1);
    expect(picked).not.toHaveBeenCalled();

    // Without another device's change to the active preset, or while the applied filter isn't the preset's own as
    // it was, the filter stays, shown as modified.
    const coast = { ...BEACH, filterState: serializeFilterStateForApi({ ...createDefaultFilterState(), selectedTags: ["Coast"] }) };
    expect(store.presetsReloaded([coast], null)).toBe(false);
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(store.presetMenu.value.entries[0]!.label).toBe("Beach*");
    expect(store.presetsReloaded([coast], BEACH)).toBe(false);
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect(followed).toHaveBeenCalledTimes(1);
  });
});
