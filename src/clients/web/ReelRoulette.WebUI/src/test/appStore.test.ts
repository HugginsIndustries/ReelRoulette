import { describe, expect, it, vi } from "vitest";
import { createDefaultFilterState, HEADER_PRESET_STARRED_VALUE } from "../filter/filterStateModel";
import { createAppStore, type AppStoreOptions, type PlayingItem } from "../state/appStore";

const FAVORITES = {
  id: "preset-favorites",
  name: "Favorites",
  filterState: { ...createDefaultFilterState(), favoritesOnly: true }
};
const EVERYTHING = { id: "preset-everything", name: "Everything", filterState: createDefaultFilterState() };

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
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
    ...options
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
    expect(empty.presetMenu.value).toEqual({ entries: [{ label: "Loading...", value: "" }], selectedValue: "" });
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

  it("lists None and the presets, and selects the preset that matches the applied filter", () => {
    const { store } = setup();
    store.presets.value = [FAVORITES];
    store.syncHeaderPresets();
    expect(store.presetMenu.value).toEqual({
      entries: [
        { label: "None", value: "" },
        { label: "Favorites", value: "preset-favorites" }
      ],
      selectedValue: ""
    });
    expect(store.activePresetName.value).toBeNull();

    store.appliedFilter.value = { ...createDefaultFilterState(), favoritesOnly: true };
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
    expect(store.appliedFilter.value.favoritesOnly).toBe(true);
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

    store.appliedFilter.value = { ...createDefaultFilterState(), favoritesOnly: true };
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
    expect(store.presetMenu.value).toEqual({ entries: [{ label: "Error loading presets", value: "" }], selectedValue: "" });
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
