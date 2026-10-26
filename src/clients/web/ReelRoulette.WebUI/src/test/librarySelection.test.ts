import { describe, expect, it } from "vitest";
import { createLibrarySelection } from "../library/librarySelection";

const ORDER = ["a", "b", "c", "d", "e", "f"];

describe("library selection", () => {
  it("starts with a tile picked, takes it out again, and ends when the last one goes", () => {
    const selection = createLibrarySelection();
    expect([selection.active.value, selection.count.value]).toEqual([false, 0]);

    selection.toggle("b");
    selection.toggle("d");
    expect([selection.active.value, selection.count.value, selection.ids()]).toEqual([true, 2, ["b", "d"]]);
    expect([selection.has("b"), selection.has("c")]).toEqual([true, false]);

    selection.toggle("b");
    expect([selection.active.value, selection.ids()]).toEqual([true, ["d"]]);
    selection.toggle("d");
    expect([selection.active.value, selection.count.value]).toEqual([false, 0]);
  });

  it("adds a range from the last tile clicked to the one clicked, in either direction, picked or not", () => {
    const selection = createLibrarySelection();
    selection.toggle("b");
    selection.addRange("e", ORDER);
    expect(selection.ids().sort()).toEqual(["b", "c", "d", "e"]);

    // Taking out a tile starts the next range from it, which picks it again.
    selection.toggle("d");
    selection.addRange("a", ORDER);
    expect(selection.ids().sort()).toEqual(["a", "b", "c", "d", "e"]);

    // The range just added starts the next one.
    selection.addRange("f", ORDER);
    expect(selection.ids().sort()).toEqual(ORDER);
  });

  it("adds only the tile clicked when there is no last tile, or it isn't in the order", () => {
    const selection = createLibrarySelection();
    selection.addRange("c", ORDER);
    expect([selection.active.value, selection.ids()]).toEqual([true, ["c"]]);

    selection.toggle("z");
    selection.addRange("e", ORDER);
    expect(selection.ids().sort()).toEqual(["c", "e", "z"]);
  });

  it("adds all, leaving where the next range starts, and only while selecting", () => {
    const selection = createLibrarySelection();
    selection.addAll(["a", "b"]);
    expect(selection.active.value).toBe(false);

    selection.toggle("b");
    selection.addAll(["e", "f", "b"]);
    expect(selection.ids().sort()).toEqual(["b", "e", "f"]);
    selection.addRange("d", ORDER);
    expect(selection.ids().sort()).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("drops removed items, and ends when none are left", () => {
    const selection = createLibrarySelection();
    selection.toggle("a");
    selection.toggle("b");
    const version = selection.version.value;

    selection.remove(["x"]);
    expect(selection.version.value).toBe(version);
    selection.remove(["a"]);
    expect([selection.active.value, selection.ids()]).toEqual([true, ["b"]]);
    selection.remove(["b", "c"]);
    expect([selection.active.value, selection.count.value]).toEqual([false, 0]);
  });

  it("clearing ends selection, closes the menu, and forgets where a range starts", () => {
    const selection = createLibrarySelection();
    selection.toggle("b");
    selection.openMenu();
    expect(selection.menuOpen.value).toBe(true);

    selection.clear();
    expect([selection.active.value, selection.count.value, selection.menuOpen.value]).toEqual([false, 0, false]);
    selection.addRange("e", ORDER);
    expect(selection.ids()).toEqual(["e"]);
  });

  it("opens the menu only while selecting, and taking out the last tile closes it", () => {
    const selection = createLibrarySelection();
    selection.openMenu();
    expect(selection.menuOpen.value).toBe(false);

    selection.toggle("a");
    selection.openMenu();
    expect(selection.menuOpen.value).toBe(true);
    selection.closeMenu();
    expect(selection.menuOpen.value).toBe(false);
    selection.openMenu();
    selection.toggle("a");
    expect(selection.menuOpen.value).toBe(false);
  });
});
