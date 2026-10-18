import { describe, expect, it } from "vitest";
import { presetChanges, presetPopups, type PresetChange, type PresetEventRecord } from "../filter/presetEvents";
import type { ApiPreset } from "../state/appStore";

const DOGS: ApiPreset = { id: "preset-dogs", name: "Dogs", filterState: { selectedTags: ["Dogs"] } };
const CATS: ApiPreset = { id: "preset-cats", name: "Cats", filterState: { selectedTags: ["Cats"] } };
const BIRDS: ApiPreset = { id: "preset-birds", name: "Birds", filterState: { selectedTags: ["Birds"] } };

/** Records for presets another device changed, each as the page held it before, or null for one it didn't have. */
function fromAnotherDevice(...entries: Array<[string, ApiPreset | null]>): Map<string, PresetEventRecord> {
  return new Map(entries.map(([id, before]) => [id, { before, anotherDevice: true }]));
}

describe("presetChanges", () => {
  it("tells an add, a rename, an update, and a delete apart by comparing the reloaded list with the one before", () => {
    const puppies = { ...DOGS, name: "Puppies" };
    const longCats = { ...CATS, filterState: { selectedTags: ["Cats"], minDuration: "00:01:00" } };
    expect(presetChanges(fromAnotherDevice([DOGS.id, null]), [DOGS])).toEqual([{ kind: "added", id: DOGS.id, name: "Dogs" }]);
    expect(presetChanges(fromAnotherDevice([DOGS.id, DOGS]), [puppies])).toEqual([
      { kind: "renamed", id: DOGS.id, name: "Dogs", to: "Puppies" }
    ]);
    expect(presetChanges(fromAnotherDevice([CATS.id, CATS]), [longCats])).toEqual([{ kind: "updated", id: CATS.id, name: "Cats" }]);
    expect(presetChanges(fromAnotherDevice([BIRDS.id, BIRDS]), [DOGS])).toEqual([{ kind: "deleted", id: BIRDS.id, name: "Birds" }]);
  });

  it("reads a rename and a filter change in one burst as an update, by the new name", () => {
    const changed = { ...DOGS, name: "Puppies", filterState: { selectedTags: ["Puppies"] } };
    expect(presetChanges(fromAnotherDevice([DOGS.id, DOGS]), [changed])).toEqual([{ kind: "updated", id: DOGS.id, name: "Puppies" }]);
  });

  it("compares filters by the preset rule, so a category's AND mode left in a stored filter changes nothing", () => {
    const withAnd = { ...DOGS, filterState: { selectedTags: ["Dogs"], categoryLocalMatchModes: { animals: 0 } } };
    expect(presetChanges(fromAnotherDevice([DOGS.id, DOGS]), [withAnd])).toEqual([]);
  });

  it("gives nothing for a preset added and deleted within one burst, a reorder, or this device's own changes", () => {
    expect(presetChanges(fromAnotherDevice([DOGS.id, null]), [CATS])).toEqual([]);
    // A reorder names no preset, and the presets that are named kept their names and filters.
    expect(presetChanges(fromAnotherDevice([DOGS.id, DOGS], [CATS.id, CATS]), [CATS, DOGS])).toEqual([]);
    const own = new Map<string, PresetEventRecord>([
      [DOGS.id, { before: null, anotherDevice: false }],
      [CATS.id, { before: CATS, anotherDevice: false }]
    ]);
    expect(presetChanges(own, [DOGS])).toEqual([]);
  });
});

describe("presetPopups", () => {
  const added: PresetChange = { kind: "added", id: DOGS.id, name: "Dogs" };
  const renamed: PresetChange = { kind: "renamed", id: DOGS.id, name: "Dogs", to: "Puppies" };
  const updated: PresetChange = { kind: "updated", id: DOGS.id, name: "Dogs" };
  const deleted: PresetChange = { kind: "deleted", id: DOGS.id, name: "Dogs" };

  it("names one change, under the shared key, and logs it without the preset's names", () => {
    expect([added, renamed, updated, deleted].map((change) => presetPopups([change], null, false)).flat()).toEqual([
      { kind: "devices", text: 'Preset "Dogs" added on another device', key: "presets", logText: "Preset added on another device" },
      {
        kind: "devices",
        text: 'Preset "Dogs" renamed to "Puppies" on another device',
        key: "presets",
        logText: "Preset renamed on another device"
      },
      { kind: "devices", text: 'Preset "Dogs" updated on another device', key: "presets", logText: "Preset updated on another device" },
      { kind: "devices", text: 'Preset "Dogs" deleted on another device', key: "presets", logText: "Preset deleted on another device" }
    ]);
    expect(presetPopups([], null, false)).toEqual([]);
  });

  it("collapses several changes into one popup, keeping the active preset's own beside it", () => {
    const others: PresetChange[] = [
      { kind: "added", id: "preset-new", name: "Horses" },
      { kind: "renamed", id: BIRDS.id, name: "Birds", to: "Parrots" },
      { kind: "deleted", id: "preset-old", name: "Boats" }
    ];
    expect(presetPopups(others, null, false)).toEqual([
      { kind: "devices", text: "3 presets changed on another device", key: "presets", logText: "3 presets changed on another device" }
    ]);
    const yours: PresetChange = { kind: "updated", id: CATS.id, name: "Cats" };
    expect(presetPopups([...others, yours], CATS.id, true)).toEqual([
      { kind: "devices", text: "3 presets changed on another device", key: "presets", logText: "3 presets changed on another device" },
      {
        kind: "devices",
        text: 'Your preset "Cats" was updated on another device. The library has been updated.',
        key: "your-preset",
        logText: "Your preset was updated on another device. The library has been updated."
      }
    ]);
  });

  it("gives the active preset its own popup for an update it followed or a delete, which keeps its filter", () => {
    expect(presetPopups([updated], DOGS.id, true)).toEqual([
      {
        kind: "devices",
        text: 'Your preset "Dogs" was updated on another device. The library has been updated.',
        key: "your-preset",
        logText: "Your preset was updated on another device. The library has been updated."
      }
    ]);
    expect(presetPopups([deleted], DOGS.id, false)).toEqual([
      {
        kind: "devices",
        text: 'Your preset "Dogs" was deleted on another device. Its filter is still applied.',
        key: "your-preset",
        logText: "Your preset was deleted on another device. Its filter is still applied."
      }
    ]);
  });

  it("counts the active preset's rename, and its update while its filter shows as modified, as ordinary changes", () => {
    const others: PresetChange[] = [{ kind: "added", id: "preset-new", name: "Horses" }];
    expect(presetPopups([renamed], DOGS.id, false)).toEqual(presetPopups([renamed], null, false));
    expect(presetPopups([updated], DOGS.id, false)).toEqual(presetPopups([updated], null, false));
    expect(presetPopups([...others, updated], DOGS.id, false)).toEqual([
      { kind: "devices", text: "2 presets changed on another device", key: "presets", logText: "2 presets changed on another device" }
    ]);
  });

  it("shows only the active preset's own popup for a resync", () => {
    const others: PresetChange[] = [{ kind: "added", id: "preset-new", name: "Horses" }];
    expect(presetPopups([...others, updated], DOGS.id, true, true)).toEqual([
      expect.objectContaining({ key: "your-preset", text: 'Your preset "Dogs" was updated on another device. The library has been updated.' })
    ]);
    expect(presetPopups([...others, renamed], DOGS.id, false, true)).toEqual([]);
  });
});
