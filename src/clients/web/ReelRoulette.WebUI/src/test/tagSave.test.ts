import { describe, expect, it } from "vitest";
import {
  applyTagSaveLocally,
  createTagSaveSession,
  handleIncomingItemTags,
  planTagEditorSave,
  replaceWithLiveTags,
  retargetTagFilter,
  rollbackTagSave,
  runTagEditorSave,
  snapshotTags,
  type IncomingItemTags,
  type TaggedItem,
  type TagSaveStep
} from "../library/tagSave";

const people = { id: "people", name: "People", sortOrder: 0 };
const places = { id: "places", name: "Places", sortOrder: 1 };
const years = { id: "years", name: "Years", sortOrder: 2 };

function item(id: string, tags: string[]): TaggedItem {
  return { id, tags: tags.slice() };
}

describe("planTagEditorSave", () => {
  it("sends an item-tag edit without upserting unchanged categories or fetching the model", async () => {
    const steps = planTagEditorSave({
      baselineCategories: [people, places],
      displayCategories: [people, places],
      deleteCategoryIds: [],
      upsertTags: [],
      renameTags: [],
      deleteTags: [],
      itemIds: ["item-1"],
      addTags: ["Night"],
      removeTags: [],
      autoTagAssignments: []
    });

    expect(steps).toEqual([
      { kind: "apply-item-tags", itemIds: ["item-1"], addTags: ["Night"], removeTags: [] }
    ]);
    const posted: TagSaveStep[] = [];
    const result = await runTagEditorSave(steps, {
      post: async (step) => {
        posted.push(step);
        return true;
      }
    });
    expect(result.ok).toBe(true);
    expect(posted).toEqual(steps);
    expect(posted.some((step) => step.kind === "upsert-category")).toBe(false);
  });

  it("upserts a reordered category and leaves an unchanged category out", () => {
    const steps = planTagEditorSave({
      baselineCategories: [people, places, years],
      displayCategories: [
        { ...places, sortOrder: 0 },
        { ...people, sortOrder: 1 },
        years
      ],
      deleteCategoryIds: [],
      upsertTags: [],
      renameTags: [],
      deleteTags: [],
      itemIds: [],
      addTags: [],
      removeTags: [],
      autoTagAssignments: []
    });

    expect(steps.map((step) => step.kind === "upsert-category" ? step.id : step.kind)).toEqual(["places", "people"]);
  });

  it("leaves categories alone when stored sort numbers are not their display indexes", () => {
    const steps = planTagEditorSave({
      baselineCategories: [
        { id: "people", name: "People", sortOrder: 10 },
        { id: "places", name: "Places", sortOrder: 20 }
      ],
      displayCategories: [
        { id: "people", name: "People", sortOrder: 0 },
        { id: "places", name: "Places", sortOrder: 1 }
      ],
      deleteCategoryIds: [],
      upsertTags: [],
      renameTags: [],
      deleteTags: [],
      itemIds: ["item-1"],
      addTags: ["Night"],
      removeTags: [],
      autoTagAssignments: []
    });

    expect(steps).toEqual([
      { kind: "apply-item-tags", itemIds: ["item-1"], addTags: ["Night"], removeTags: [] }
    ]);
  });

  it("upserts a category whose name changed only in case", () => {
    const steps = planTagEditorSave({
      baselineCategories: [people],
      displayCategories: [{ id: "people", name: "people", sortOrder: 0 }],
      deleteCategoryIds: [],
      upsertTags: [],
      renameTags: [],
      deleteTags: [],
      itemIds: [],
      addTags: [],
      removeTags: [],
      autoTagAssignments: []
    });

    expect(steps).toEqual([
      { kind: "upsert-category", id: "people", name: "people", sortOrder: 0 }
    ]);
  });
});

describe("tag save apply", () => {
  it("closes over an immediate tile update, rolls a failed tail back, and ignores the save's own echo", () => {
    const items = [item("a", ["Day"])];
    const steps: TagSaveStep[] = [
      { kind: "rename-tag", oldName: "Day", newName: "Evening", newCategoryId: null },
      { kind: "apply-item-tags", itemIds: ["a"], addTags: ["Night"], removeTags: [] }
    ];
    const session = createTagSaveSession();
    const handle = session.begin(items, steps, false);
    expect(items[0]?.tags).toEqual(["Evening", "Night"]);

    let reloads = 0;
    const ownEcho = { itemIds: ["a"], addedTags: ["Night"], removedTags: [] };
    const echoed = session.onEcho(ownEcho, true);
    if (!echoed.skipPatch) {
      items[0]!.tags = items[0]!.tags.concat(ownEcho.addedTags);
    }
    if (echoed.reload) {
      reloads += 1;
    }
    const landed = session.succeed(handle, true);
    if (landed.reload) {
      reloads += 1;
    }
    expect(echoed).toEqual({ skipPatch: true, reload: true });
    expect(landed.reload).toBe(false);
    expect(reloads).toBe(1);
    expect(items[0]?.tags).toEqual(["Evening", "Night"]);

    const failed = [item("a", ["Day"])];
    const failedSnapshot = snapshotTags(failed);
    applyTagSaveLocally(failed, steps);
    rollbackTagSave(failed, failedSnapshot, [steps[0]!]);
    expect(failed[0]?.tags).toEqual(["Evening"]);
    expect(failedSnapshot[0]?.tags).toEqual(["Day"]);
  });

  it("reloads once when a rename has no item-tag echo and a tag filter can change membership", () => {
    const session = createTagSaveSession();
    const items: TaggedItem[] = [];
    const handle = session.begin(items, [], false);
    const landed = session.succeed(handle, true);
    const again = session.succeed(handle, true);
    expect(landed).toEqual({ skipPatch: true, reload: true });
    expect(again.reload).toBe(false);
  });

  it("keeps the accepted prefix when a later step throws", async () => {
    const steps: TagSaveStep[] = [
      { kind: "rename-tag", oldName: "Day", newName: "Evening", newCategoryId: null },
      { kind: "apply-item-tags", itemIds: ["a"], addTags: ["Night"], removeTags: [] }
    ];
    const result = await runTagEditorSave(steps, {
      post: async (step) => {
        if (step.kind === "apply-item-tags") {
          throw new Error("network down");
        }
        return true;
      }
    });
    expect(result.ok).toBe(false);
    expect(result.accepted).toEqual([steps[0]]);
    expect(result.failed).toEqual(steps[1]);

    const items = [item("a", ["Day"])];
    const snapshot = snapshotTags(items);
    applyTagSaveLocally(items, steps);
    rollbackTagSave(items, snapshot, result.accepted);
    expect(items[0]?.tags).toEqual(["Evening"]);
  });

  it("still applies an echo from another client", () => {
    const session = createTagSaveSession();
    const decision = session.onEcho(
      { itemIds: ["other"], addedTags: ["Night"], removedTags: [] },
      true
    );
    expect(decision).toEqual({ skipPatch: false, reload: false });
  });

  it("keeps the older echo when the newer save finishes first", () => {
    const items = [item("a", ["Day"])];
    const session = createTagSaveSession();
    const older = session.begin(items, [add("Night")], false);
    const newer = session.begin(items, [add("Evening")], true);
    const landed = session.succeed(newer, false);
    const olderEcho = session.onEcho({ itemIds: ["a"], addedTags: ["Night"], removedTags: [] }, false);
    const olderLanded = session.succeed(older, false);
    expect(landed.reload).toBe(true);
    expect(olderEcho).toEqual({ skipPatch: true, reload: false });
    expect(olderLanded.reload).toBe(false);
    expect(items[0]?.tags).toEqual(["Day", "Night", "Evening"]);
  });

  it("keeps the older echo when the newer save fails", () => {
    const items = [item("a", ["Day"])];
    const session = createTagSaveSession();
    session.begin(items, [add("Night")], false);
    const newer = session.begin(items, [add("Evening")], false);
    session.fail(newer, items, []);
    const olderEcho = session.onEcho({ itemIds: ["a"], addedTags: ["Night"], removedTags: [] }, false);
    expect(items[0]?.tags).toEqual(["Day", "Night"]);
    expect(olderEcho).toEqual({ skipPatch: true, reload: false });
  });

  it("keeps the newer tags when the older save fails", () => {
    const items = [item("a", ["Day"])];
    const session = createTagSaveSession();
    const older = session.begin(items, [add("Night")], false);
    session.begin(items, [add("Evening")], false);
    session.fail(older, items, []);
    expect(items[0]?.tags).toEqual(["Day", "Evening"]);
  });

  it("keeps a tag that arrived after the save started", () => {
    const items = [item("a", ["Day"])];
    const session = createTagSaveSession();
    const handle = session.begin(items, [add("Night")], false);
    items[0]?.tags.push("Bonus");
    session.fail(handle, items, []);
    expect(items[0]?.tags).toEqual(["Day", "Bonus"]);
  });

  it("keeps an accepted rename and a tag that arrived during the save when the tail fails", () => {
    const items = [item("a", ["Day"])];
    const rename: TagSaveStep = { kind: "rename-tag", oldName: "Day", newName: "Evening", newCategoryId: null };
    const session = createTagSaveSession();
    const handle = session.begin(items, [rename, add("Night")], false);
    items[0]?.tags.push("Bonus");
    session.fail(handle, items, [rename]);
    expect(items[0]?.tags).toEqual(["Evening", "Bonus"]);
  });

  it("puts a renamed tag back and keeps a name that was already there", () => {
    const items = [item("a", ["Day", "Evening"])];
    const session = createTagSaveSession();
    const handle = session.begin(items, [
      { kind: "rename-tag", oldName: "Day", newName: "Evening", newCategoryId: null }
    ], false);
    items[0]?.tags.push("Bonus");
    session.fail(handle, items, []);
    expect(items[0]?.tags).toEqual(["Evening", "Bonus", "Day"]);
  });

  it("reloads once when the save started under a tag filter that is now empty", () => {
    const session = createTagSaveSession();
    const handle = session.begin([item("a", ["Day"])], [], false, true);
    const landed = session.succeed(handle, false);
    const again = session.succeed(handle, false);
    expect(landed).toEqual({ skipPatch: true, reload: true });
    expect(again.reload).toBe(false);
  });

  it("does not reload when the save did not start under a tag filter", () => {
    const session = createTagSaveSession();
    const handle = session.begin([item("a", ["Day"])], [], false, false);
    expect(session.succeed(handle, false).reload).toBe(false);
  });

  it("treats a per-tag auto-tag event for a subset of items as its own and leaves another item tag alone", () => {
    const session = createTagSaveSession();
    session.begin([item("a", ["Day"])], [autoTags([
      ["Cat", ["a", "b"]],
      ["Dog", ["c", "d"]]
    ])], false);
    const cat = session.onEcho({ itemIds: ["a"], addedTags: ["Cat"], removedTags: [] }, false);
    const other = session.onEcho({ itemIds: ["a"], addedTags: ["Night"], removedTags: [] }, false);
    expect(cat).toEqual({ skipPatch: true, reload: false });
    expect(other).toEqual({ skipPatch: false, reload: false });
  });

  it("does not treat a subset of an item-tag echo as that save", () => {
    const session = createTagSaveSession();
    session.begin([item("a", ["Day"])], [{
      kind: "apply-item-tags",
      itemIds: ["a", "b"],
      addTags: ["Night"],
      removeTags: []
    }], false);
    const decision = session.onEcho({ itemIds: ["a"], addedTags: ["Night"], removedTags: [] }, false);
    expect(decision).toEqual({ skipPatch: false, reload: false });
  });

  it("lets the smaller auto-tag save take the matching event", () => {
    const session = createTagSaveSession();
    session.begin([item("a", ["Day"])], [auto("Cat", ["a", "b", "c"])], false);
    session.begin([item("a", ["Day"])], [auto("Cat", ["a"])], true);
    const decision = session.onEcho({ itemIds: ["a"], addedTags: ["Cat"], removedTags: [] }, false);
    expect(decision).toEqual({ skipPatch: true, reload: true });
  });

  it("retires an auto-tag assignment with no changed items and applies a later event for that tag", () => {
    const session = createTagSaveSession();
    const handle = session.begin([item("a", ["Day"])], [autoTags([
      ["Cat", ["a", "b"]],
      ["Dog", ["c"]]
    ])], false);
    session.noteAutoTagResult(handle, [{ tagName: "Dog", changedItemIds: ["c"] }]);
    const cat = session.onEcho({ itemIds: ["a"], addedTags: ["Cat"], removedTags: [] }, false);
    const dog = session.onEcho({ itemIds: ["c"], addedTags: ["Dog"], removedTags: [] }, false);
    expect(cat).toEqual({ skipPatch: false, reload: false });
    expect(dog).toEqual({ skipPatch: true, reload: false });
  });

  it("retires an auto-tag whose tag was not written when another tag changed the same item", () => {
    const session = createTagSaveSession();
    const handle = session.begin([item("a", ["Day"])], [autoTags([
      ["Cat", ["a"]],
      ["Dog", ["a"]]
    ])], false);
    session.noteAutoTagResult(handle, [{ tagName: "Dog", changedItemIds: ["a"] }]);
    const cat = session.onEcho({ itemIds: ["a"], addedTags: ["Cat"], removedTags: [] }, false);
    const dog = session.onEcho({ itemIds: ["a"], addedTags: ["Dog"], removedTags: [] }, false);
    expect(cat).toEqual({ skipPatch: false, reload: false });
    expect(dog).toEqual({ skipPatch: true, reload: false });
  });

  it("keeps a confirmed tag when the save then fails", () => {
    const items = [item("a", ["Day"])];
    const session = createTagSaveSession();
    const handle = session.begin(items, [add("Night")], false);
    const echoed = session.onEcho({ itemIds: ["a"], addedTags: ["Night"], removedTags: [] }, false);
    expect(echoed).toEqual({ skipPatch: true, reload: false });

    items[0]!.tags = ["Day"];
    expect(session.fail(handle, items, [])).toBe(false);
    expect(items[0]?.tags).toEqual(["Day", "Night"]);
  });

  it("keeps a confirmed rename when a later step rolls back", () => {
    const items = [item("a", ["Day"])];
    const rename: TagSaveStep = { kind: "rename-tag", oldName: "Day", newName: "Evening", newCategoryId: null };
    const session = createTagSaveSession();
    const handle = session.begin(items, [rename, add("Night")], false);
    const echoed = session.onEcho({
      itemIds: ["a", "library-other"],
      addedTags: ["Evening"],
      removedTags: ["Day"]
    }, false);
    expect(echoed).toEqual({ skipPatch: false, reload: false });

    items[0]!.tags = ["Day"];
    expect(session.fail(handle, items, [])).toBe(true);
    expect(items[0]?.tags).toEqual(["Evening"]);
  });

  it("projects an in-flight save onto items that were replaced", () => {
    const session = createTagSaveSession();
    session.begin([item("a", ["Day"])], [add("Night")], false);
    const current = [item("a", ["Day"])];
    session.project(current);
    expect(current[0]?.tags).toEqual(["Day", "Night"]);
  });

  it("keeps a confirmed auto-tag assignment when the other one rolls back", () => {
    const items = [item("a", ["Day"]), item("c", ["Day"])];
    const session = createTagSaveSession();
    const handle = session.begin(items, [autoTags([
      ["Cat", ["a"]],
      ["Dog", ["c"]]
    ])], false);
    const dog = session.onEcho({ itemIds: ["c"], addedTags: ["Dog"], removedTags: [] }, false);
    expect(dog).toEqual({ skipPatch: true, reload: false });

    items[0]!.tags = ["Day"];
    items[1]!.tags = ["Day"];
    expect(session.fail(handle, items, [])).toBe(true);
    expect(items[0]?.tags).toEqual(["Day"]);
    expect(items[1]?.tags).toEqual(["Day", "Dog"]);
  });

  it("rolls back an auto-tag the server did not newly write", () => {
    const items = [item("a", ["Day"])];
    const session = createTagSaveSession();
    const handle = session.begin(items, [auto("Cat", ["a"])], false);
    session.noteAutoTagResult(handle, []);
    expect(session.fail(handle, items, [])).toBe(true);
    expect(items[0]?.tags).toEqual(["Day"]);
  });

  it("applies an item-tag save to the tile with that item id, not to one whose path differs only in case", () => {
    const items = [item("id-upper", ["Day"]), item("id-lower", ["Day"])];
    applyTagSaveLocally(items, [{ kind: "apply-item-tags", itemIds: ["id-lower"], addTags: ["Night"], removeTags: [] }]);
    expect(items.map((entry) => entry.tags)).toEqual([["Day"], ["Day", "Night"]]);
  });

  it("applies an auto-tag save by the scan rows' item ids, not by the paths it sends", () => {
    const items = [item("id-upper", ["Day"]), item("id-lower", ["Day"])];
    applyTagSaveLocally(items, [{
      kind: "apply-auto-tag",
      assignments: [{ tagName: "Cat", itemPaths: ["/media/Clip.mp4"], itemIds: ["id-lower"] }]
    }]);
    expect(items.map((entry) => entry.tags)).toEqual([["Day"], ["Day", "Cat"]]);
  });

  it("does not treat an auto-tag event for another item id as that save", () => {
    const session = createTagSaveSession();
    session.begin([item("id-lower", ["Day"])], [auto("Cat", ["id-lower"])], false);
    const other = session.onEcho({ itemIds: ["id-upper"], addedTags: ["Cat"], removedTags: [] }, false);
    const own = session.onEcho({ itemIds: ["id-lower"], addedTags: ["Cat"], removedTags: [] }, false);
    expect(other).toEqual({ skipPatch: false, reload: false });
    expect(own).toEqual({ skipPatch: true, reload: false });
  });

  it("copies a live empty tag list over the optimistic tags", () => {
    const loaded = [item("a", ["Day", "Night"])];
    replaceWithLiveTags(loaded, [item("a", [])]);
    expect(loaded[0]?.tags).toEqual([]);
  });
});

describe("handleIncomingItemTags", () => {
  function applyIncoming(payload: IncomingItemTags) {
    const selected = ["Night"];
    const excluded = ["Night"];
    let seen: { selected: string[]; excluded: string[]; reloadBecauseFilterCleared: boolean } | null = null;
    handleIncomingItemTags(payload, {
      tagFilterCanChangeMembership: () => selected.length > 0 || excluded.length > 0,
      retarget(step) {
        retargetTagFilter(selected, excluded, step);
      },
      afterRetarget(handling) {
        seen = {
          selected: selected.slice(),
          excluded: excluded.slice(),
          reloadBecauseFilterCleared: handling.reloadBecauseFilterCleared
        };
      }
    });
    return seen;
  }

  it("renames the filter before the other client reloads", () => {
    expect(applyIncoming({
      resolvedItemIds: ["a"],
      addedTags: ["Late"],
      removedTags: ["Night"],
      catalogReplacedTag: "Night",
      catalogReplacementTag: "Late"
    })).toEqual({
      selected: ["Late"],
      excluded: ["Late"],
      reloadBecauseFilterCleared: false
    });
  });

  it("leaves the filter in place when a per-item edit adds and removes tags", () => {
    expect(applyIncoming({
      resolvedItemIds: ["a"],
      addedTags: ["Late"],
      removedTags: ["Night"]
    })).toEqual({
      selected: ["Night"],
      excluded: ["Night"],
      reloadBecauseFilterCleared: false
    });
  });

  it("removes a deleted tag before the other client reloads", () => {
    expect(applyIncoming({
      resolvedItemIds: ["a"],
      addedTags: [],
      removedTags: ["Night"],
      catalogReplacedTag: "Night"
    })).toEqual({
      selected: [],
      excluded: [],
      reloadBecauseFilterCleared: true
    });
  });
});

describe("retargetTagFilter", () => {
  it("renames and deletes include and exclude tags", () => {
    const selected = ["Day", "Night"];
    const excluded = ["day"];
    const rename: TagSaveStep = { kind: "rename-tag", oldName: "Day", newName: "Evening", newCategoryId: null };
    expect(retargetTagFilter(selected, excluded, rename)).toBe(true);
    expect(selected).toEqual(["Evening", "Night"]);
    expect(excluded).toEqual(["Evening"]);

    const remove: TagSaveStep = { kind: "delete-tag", name: "Night" };
    expect(retargetTagFilter(selected, excluded, remove)).toBe(true);
    expect(selected).toEqual(["Evening"]);
    expect(excluded).toEqual(["Evening"]);
  });
});

function add(tag: string): TagSaveStep {
  return { kind: "apply-item-tags", itemIds: ["a"], addTags: [tag], removeTags: [] };
}

function auto(tag: string, itemIds: string[]): TagSaveStep {
  return autoTags([[tag, itemIds]]);
}

function autoTags(assignments: Array<[string, string[]]>): TagSaveStep {
  return {
    kind: "apply-auto-tag",
    assignments: assignments.map(([tagName, itemIds]) => ({
      tagName,
      itemPaths: itemIds.map((id) => `/media/${id}.mp4`),
      itemIds
    }))
  };
}
