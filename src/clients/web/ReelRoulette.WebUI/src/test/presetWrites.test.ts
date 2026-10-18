import { describe, expect, it } from "vitest";
import { createDefaultFilterState, type FilterState, type PresetRow } from "../filter/filterStateModel";
import { mergePresetLists, planPresetWrites, presetsReordered, type PresetWrite } from "../filter/presetWrites";

function filter(change: Partial<FilterState>): FilterState {
  return { ...createDefaultFilterState(), ...change };
}

const FAV = filter({ favoritesMode: "only" });
const UNPLAYED = filter({ onlyNeverPlayed: true });
const PHOTOS = filter({ mediaTypeFilter: 2 });
const KNOWN = filter({ onlyKnownDuration: true });

function row(id: string, name: string, filterState: FilterState): PresetRow {
  return { id, name, filterState };
}

const SAVED = [row("a", "Cats", FAV), row("b", "Dogs", UNPLAYED), row("c", "Birds", PHOTOS)];

/** Each write as a line: its kind, its preset, and what it takes. */
function lines(writes: PresetWrite[] | null): string[] | null {
  return (
    writes?.map((write) => {
      switch (write.kind) {
        case "delete":
          return `delete ${write.id}`;
        case "rename":
          return `rename ${write.id} ${write.name}`;
        case "update":
          return `update ${write.id}`;
        case "create":
          return `create ${write.id} ${write.name}`;
        case "reorder":
          return "reorder";
      }
    }) ?? null
  );
}

/** The saved list with some presets renamed, by id. */
function renamed(names: Record<string, string>): PresetRow[] {
  return SAVED.map((preset) => (names[preset.id] ? { ...preset, name: names[preset.id]! } : preset));
}

describe("planPresetWrites", () => {
  it("sends nothing for a list that matches the saved one", () => {
    expect(planPresetWrites(SAVED, SAVED)).toEqual({ writes: [], loop: null });
  });

  it("sends deletes, then renames, then filter updates, then new presets in the tab's order, then one reorder", () => {
    const tab = [row("new-2", "Fish", KNOWN), row("b", "Puppies", filter({ audioFilter: 1 })), row("a", "Kittens", FAV), row("new-1", "Mice", filter({ audioFilter: 2 }))];
    expect(lines(planPresetWrites(SAVED, tab).writes)).toEqual([
      "delete c",
      "rename b Puppies",
      "rename a Kittens",
      "update b",
      "create new-2 Fish",
      "create new-1 Mice",
      "reorder"
    ]);
  });

  it("puts each rename after the rename that gives up its name, ignoring case, whatever order the list has them in", () => {
    // Cats takes Dogs' name, Dogs takes Birds', and Birds takes a name no preset had.
    expect(lines(planPresetWrites(SAVED, renamed({ a: "dogs", b: "Birds", c: "Fish" })).writes)).toEqual([
      "rename c Fish",
      "rename b Birds",
      "rename a dogs"
    ]);
  });

  it("sends a rename that changes only case, which waits on no other", () => {
    expect(lines(planPresetWrites(SAVED, renamed({ a: "cats", b: "Cats2" })).writes)).toEqual(["rename a cats", "rename b Cats2"]);
  });

  it("puts each filter update after the update that gives up its filter", () => {
    const tab = [row("a", "Cats", UNPLAYED), row("b", "Dogs", KNOWN), row("c", "Birds", PHOTOS)];
    expect(lines(planPresetWrites(SAVED, tab).writes)).toEqual(["update b", "update a"]);
  });

  it("puts a new preset after the delete, rename, or update that gives up its name or filter", () => {
    expect(lines(planPresetWrites(SAVED, [row("b", "Dogs", UNPLAYED), row("c", "Birds", PHOTOS), row("new", "Cats", KNOWN)]).writes)).toEqual([
      "delete a",
      "create new Cats"
    ]);
    expect(lines(planPresetWrites(SAVED, [...renamed({ a: "Kittens" }), row("new", "Cats", KNOWN)]).writes)).toEqual([
      "rename a Kittens",
      "create new Cats"
    ]);
    expect(lines(planPresetWrites(SAVED, [row("a", "Cats", KNOWN), ...SAVED.slice(1), row("new", "Mine", FAV)]).writes)).toEqual([
      "update a",
      "create new Mine"
    ]);
  });

  it("finds two presets swapping names, and three rotating them, as one loop each, by id in the tab's order", () => {
    expect(planPresetWrites(SAVED, renamed({ a: "Dogs", b: "Cats" }))).toEqual({ writes: null, loop: { kind: "names", ids: ["a", "b"] } });
    expect(planPresetWrites(SAVED, renamed({ a: "Dogs", b: "Birds", c: "cats" }))).toEqual({
      writes: null,
      loop: { kind: "names", ids: ["a", "b", "c"] }
    });
  });

  it("finds two presets swapping filters, and names a loop of names before one of filters", () => {
    const filters = [row("a", "Cats", UNPLAYED), row("b", "Dogs", FAV), SAVED[2]!];
    expect(planPresetWrites(SAVED, filters)).toEqual({ writes: null, loop: { kind: "filters", ids: ["a", "b"] } });
    const both = [row("a", "Dogs", UNPLAYED), row("b", "Cats", FAV), SAVED[2]!];
    expect(planPresetWrites(SAVED, both).loop).toEqual({ kind: "names", ids: ["a", "b"] });
  });

  it("finds no loop in two separate chains, and the first loop of two", () => {
    const chains = [row("a", "Dogs", FAV), row("b", "Fish", UNPLAYED), SAVED[2]!];
    expect(planPresetWrites(SAVED, chains).loop).toBeNull();
    const four = [...SAVED, row("d", "Mice", KNOWN)];
    const twoSwaps = [row("a", "Dogs", FAV), row("b", "Cats", UNPLAYED), row("c", "Mice", PHOTOS), row("d", "Birds", KNOWN)];
    expect(planPresetWrites(four, twoSwaps).loop).toEqual({ kind: "names", ids: ["a", "b"] });
  });
});

describe("presetsReordered", () => {
  it("counts a move, a moved new preset too, but not a delete or a new preset at the end", () => {
    expect(presetsReordered(SAVED, [SAVED[1]!, SAVED[0]!, SAVED[2]!])).toBe(true);
    expect(presetsReordered(SAVED, [SAVED[0]!, SAVED[2]!])).toBe(false);
    expect(presetsReordered(SAVED, [...SAVED, row("new", "Fish", KNOWN)])).toBe(false);
    expect(presetsReordered(SAVED, [row("new", "Fish", KNOWN), ...SAVED])).toBe(true);
  });
});

describe("mergePresetLists", () => {
  it("is the server's list while the tab has no changes", () => {
    const server = [row("b", "Puppies", KNOWN), row("a", "Cats", FAV), row("d", "Mice", PHOTOS)];
    expect(mergePresetLists(SAVED, SAVED, server)).toEqual(server);
  });

  it("keeps the tab's renames, filter changes, deletes, and new presets, and takes the server's version of the rest", () => {
    const tab = [row("a", "Kittens", FAV), row("b", "Dogs", KNOWN), row("new", "Fish", filter({ audioFilter: 1 }))];
    // Another device gave Cats a filter, renamed Dogs, renamed the preset this tab deleted, and added Mice.
    const server = [row("a", "Cats", PHOTOS), row("b", "Hounds", UNPLAYED), row("c", "Robins", PHOTOS), row("d", "Mice", filter({ audioFilter: 2 }))];
    expect(mergePresetLists(tab, SAVED, server)).toEqual([
      row("a", "Kittens", PHOTOS),
      row("b", "Hounds", KNOWN),
      row("d", "Mice", filter({ audioFilter: 2 })),
      row("new", "Fish", filter({ audioFilter: 1 }))
    ]);
  });

  it("drops a preset another device deleted, with the tab's change to it", () => {
    const tab = renamed({ b: "Puppies" });
    expect(mergePresetLists(tab, SAVED, [SAVED[0]!, SAVED[2]!])).toEqual([SAVED[0], SAVED[2]]);
  });

  it("keeps the server's order unless the tab reordered, which keeps the tab's, with the server's new presets at the end", () => {
    const server = [SAVED[2]!, SAVED[0]!, SAVED[1]!, row("d", "Mice", KNOWN)];
    expect(mergePresetLists(SAVED, SAVED, server).map((preset) => preset.id)).toEqual(["c", "a", "b", "d"]);
    const moved = [SAVED[1]!, SAVED[0]!, SAVED[2]!];
    expect(mergePresetLists(moved, SAVED, server).map((preset) => preset.id)).toEqual(["b", "a", "c", "d"]);
  });
});
