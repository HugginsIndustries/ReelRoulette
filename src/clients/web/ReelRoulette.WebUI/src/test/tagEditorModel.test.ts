import { describe, expect, it } from "vitest";
import { EMPTY_FIELD } from "../validation/fieldValidation";
import {
  addCategoryToOrder,
  autoTagAppliedFromResponse,
  categoryNameProblem,
  categoryOptions,
  chipState,
  createPendingTagEdits,
  EVERY_ITEM_HAS_TAG_REASON,
  hasPendingTagEdits,
  ITEM_HAS_TAG_REASON,
  ITEM_LACKS_TAG_REASON,
  NO_ITEM_HAS_TAG_REASON,
  initialCategoryOrder,
  moveCategoryInOrder,
  newTagNameProblem,
  planAutoTagApply,
  planTagEdits,
  retargetHeldTag,
  savedTagModel,
  tagCategoryRows,
  tagEditorDisplay,
  tagSaveRequest,
  toggleTagSelection,
  type PendingTagEdits,
  type TagEditorModel
} from "../tags/tagEditorModel";

const MODEL: TagEditorModel = {
  categories: [
    { id: "places", name: "Places", sortOrder: 0 },
    { id: "mood", name: "Mood", sortOrder: 1 },
    { id: "people", name: "People", sortOrder: 2 }
  ],
  tags: [
    { name: "Beach", categoryId: "places" },
    { name: "alps", categoryId: "places" },
    { name: "Calm", categoryId: "mood" },
    { name: "Bob", categoryId: "people" },
    { name: "Loose", categoryId: "" }
  ],
  tagCounts: [
    { name: "Beach", itemCount: 1 },
    { name: "Bob", itemCount: 1 }
  ],
  itemCount: 1
};

/** The model's counts for three items: two hold Beach and all three hold Bob. */
const THREE: TagEditorModel = {
  ...MODEL,
  tagCounts: [
    { name: "beach", itemCount: 2 },
    { name: "Bob", itemCount: 3 }
  ],
  itemCount: 3
};

const ORDER = ["places", "mood", "people", "uncategorized"];

function pending(change: Partial<PendingTagEdits>): PendingTagEdits {
  return { ...createPendingTagEdits(), ...change };
}

function titles(model: TagEditorModel | null, edits: PendingTagEdits, order: readonly string[] = ORDER): string[] {
  return tagEditorDisplay(model, edits, order).categories.map((category) => category.name);
}

describe("tagEditorDisplay", () => {
  it("shows categories in the editor's order, with Uncategorized last only while a tag has no category", () => {
    const display = tagEditorDisplay(MODEL, createPendingTagEdits(), ["people", "places", "mood", "uncategorized"]);
    expect(display.categories.map((category) => [category.name, category.sortOrder])).toEqual([
      ["People", 0],
      ["Places", 1],
      ["Mood", 2],
      ["Uncategorized", Number.MAX_SAFE_INTEGER]
    ]);
    expect(display.tags.map((tag) => tag.name)).toEqual(["alps", "Beach", "Bob", "Calm", "Loose"]);

    const noLoose = { ...MODEL, tags: MODEL.tags.filter((tag) => tag.name !== "Loose") };
    expect(tagEditorDisplay(noLoose, createPendingTagEdits(), ORDER).order).toEqual(["places", "mood", "people"]);
  });

  it("uses the model's category order while the editor's order is empty, and adds categories missing from it", () => {
    const shuffled = { ...MODEL, categories: [MODEL.categories[2]!, MODEL.categories[0]!, MODEL.categories[1]!] };
    expect(tagEditorDisplay(shuffled, createPendingTagEdits(), []).order).toEqual(["people", "places", "mood", "uncategorized"]);
    expect(tagEditorDisplay(MODEL, createPendingTagEdits(), ["mood", "gone"]).order).toEqual(["mood", "places", "people", "uncategorized"]);
  });

  it("applies renamed, new, and deleted categories, with a deleted category's tags under Uncategorized", () => {
    const edits = pending({
      upsertCategories: new Map([
        ["places", { id: "places", name: "Scenery", sortOrder: 0 }],
        ["food", { id: "food", name: "Food", sortOrder: 4 }]
      ]),
      deleteCategoryIds: new Set(["people"])
    });
    const display = tagEditorDisplay(MODEL, edits, ["places", "mood", "people", "food", "uncategorized"]);
    expect(display.categories.map((category) => category.name)).toEqual(["Scenery", "Mood", "Food", "Uncategorized"]);
    expect(display.tags.find((tag) => tag.name === "Bob")?.categoryId).toBe("uncategorized");
    expect(display.order).toEqual(["places", "mood", "food", "uncategorized"]);
  });

  it("applies new, moved, renamed, and deleted tags, and moves a renamed tag's count to its new name", () => {
    const edits = pending({
      upsertTags: new Map([
        ["sunset", { name: "Sunset", categoryId: "mood" }],
        ["calm", { name: "Calm", categoryId: "people" }]
      ]),
      renameTags: new Map([["beach", { oldName: "Beach", newName: "Shore", newCategoryId: "mood" }]]),
      deleteTags: new Map([["bob", { name: "Bob" }]])
    });
    const display = tagEditorDisplay(MODEL, edits, ORDER);
    expect(display.tags).toEqual([
      { name: "alps", categoryId: "places" },
      { name: "Calm", categoryId: "people" },
      { name: "Loose", categoryId: "uncategorized" },
      { name: "Shore", categoryId: "mood" },
      { name: "Sunset", categoryId: "mood" }
    ]);
    expect([...display.counts]).toEqual([
      ["bob", 1],
      ["shore", 1]
    ]);
    expect(display.itemCount).toBe(1);
    expect(MODEL.tagCounts).toEqual([
      { name: "Beach", itemCount: 1 },
      { name: "Bob", itemCount: 1 }
    ]);
  });

  it("gives a tag renamed into another one's name the larger count, as many items as surely hold the merged tag", () => {
    const merged = tagEditorDisplay(
      THREE,
      pending({ renameTags: new Map([["beach", { oldName: "Beach", newName: "BOB", newCategoryId: null }]]) }),
      ORDER
    );
    expect([...merged.counts]).toEqual([["bob", 3]]);
    // The larger count is a lower bound: two items with Beach and one with Calm may be all three, but needn't be, so
    // the merged chip shows orange, not green.
    const lower = tagEditorDisplay(
      { ...THREE, tagCounts: [{ name: "Beach", itemCount: 2 }, { name: "Calm", itemCount: 1 }] },
      pending({ renameTags: new Map([["calm", { oldName: "Calm", newName: "Beach", newCategoryId: null }]]) }),
      ORDER
    );
    expect(lower.counts.get("beach")).toBe(2);
    const chips = tagCategoryRows(lower, new Set(), new Map(), THREE, true).flatMap((row) => row.chips);
    expect(chips.find((chip) => chip.name === "Beach")?.state).toBe("state-some");
  });

  it("reads a missing count or item count as none", () => {
    const bare = { categories: MODEL.categories, tags: MODEL.tags } as TagEditorModel;
    const display = tagEditorDisplay(bare, createPendingTagEdits(), ORDER);
    expect(display.counts.size).toBe(0);
    expect(display.itemCount).toBe(0);
  });

  it("shows nothing without a model but the pending categories", () => {
    const edits = pending({ upsertCategories: new Map([["food", { id: "food", name: "Food", sortOrder: 0 }]]) });
    expect(titles(null, createPendingTagEdits(), [])).toEqual([]);
    expect(titles(null, edits, [])).toEqual(["Food"]);
  });
});

describe("category order and options", () => {
  it("starts by sort order, then name", () => {
    const model = {
      ...MODEL,
      categories: [
        { id: "z", name: "Zoo", sortOrder: 1 },
        { id: "a", name: "Animals", sortOrder: 1 },
        { id: "f", name: "First", sortOrder: 0 }
      ]
    };
    expect(initialCategoryOrder(model)).toEqual(["f", "a", "z"]);
  });

  it("offers Uncategorized for new tags even when no tag is uncategorized", () => {
    const options = categoryOptions([
      { id: "b", name: "B", sortOrder: 1 },
      { id: "a", name: "A", sortOrder: 0 }
    ]);
    expect(options.map((option) => option.id)).toEqual(["a", "b", "uncategorized"]);
  });

  it("moves a category to a place among those that can move, keeping Uncategorized last, and refuses other moves", () => {
    expect(moveCategoryInOrder(ORDER, "people", 1)).toEqual(["places", "people", "mood", "uncategorized"]);
    expect(moveCategoryInOrder(ORDER, "people", 0)).toEqual(["people", "places", "mood", "uncategorized"]);
    expect(moveCategoryInOrder(ORDER, "places", 2)).toEqual(["mood", "people", "places", "uncategorized"]);
    expect(moveCategoryInOrder(["places", "mood"], "places", 1)).toEqual(["mood", "places"]);
    expect(moveCategoryInOrder(ORDER, "places", 0)).toBeNull();
    expect(moveCategoryInOrder(ORDER, "places", -1)).toBeNull();
    expect(moveCategoryInOrder(ORDER, "people", 3)).toBeNull();
    expect(moveCategoryInOrder(ORDER, "uncategorized", 0)).toBeNull();
    expect(moveCategoryInOrder(ORDER, "food", 0)).toBeNull();
  });

  it("adds a category before Uncategorized, or last", () => {
    expect(addCategoryToOrder(ORDER, "food")).toEqual(["places", "mood", "people", "food", "uncategorized"]);
    expect(addCategoryToOrder(["places"], "food")).toEqual(["places", "food"]);
  });
});

describe("rows and chips", () => {
  it("gives each category its controls and its tags with what the items have and what is held", () => {
    const display = tagEditorDisplay(MODEL, createPendingTagEdits(), ORDER);
    const rows = tagCategoryRows(display, new Set(["mood"]), new Map([["calm", { action: "add" as const, name: "Calm" }]]), MODEL, false);
    // Only the categories expanded show their tags.
    expect(rows.map((row) => [row.name, row.collapsed, row.uncategorized])).toEqual([
      ["Places", true, false],
      ["Mood", false, false],
      ["People", true, false],
      ["Uncategorized", true, true]
    ]);
    expect(rows[0]!.chips).toEqual([
      {
        name: "alps",
        state: "state-none",
        pending: null,
        canChangeItems: true,
        addDisabledReason: null,
        removeDisabledReason: ITEM_LACKS_TAG_REASON
      },
      {
        name: "Beach",
        state: "state-all",
        pending: null,
        canChangeItems: true,
        addDisabledReason: ITEM_HAS_TAG_REASON,
        removeDisabledReason: null
      }
    ]);
    expect(rows[1]!.chips[0]!.pending).toBe("add");
    expect(rows[3]!.chips.map((chip) => chip.name)).toEqual(["Loose"]);
  });

  it("changes no item's tags while no item being edited is in the library, with no reason on either button", () => {
    const alone = tagEditorDisplay({ ...MODEL, tagCounts: [], itemCount: 0 }, createPendingTagEdits(), ["places"]);
    expect(tagCategoryRows(alone, new Set(), new Map(), MODEL, false)[0]!.chips[0]).toMatchObject({
      canChangeItems: false,
      addDisabledReason: null,
      removeDisabledReason: null
    });
  });

  it("disables Add on a tag every item has and Remove on one none has, naming the item or the selected items", () => {
    const chip = (model: TagEditorModel, several: boolean, name: string) =>
      tagCategoryRows(tagEditorDisplay(model, createPendingTagEdits(), ORDER), new Set(), new Map(), model, several)
        .flatMap((row) => row.chips)
        .find((candidate) => candidate.name === name)!;
    expect(chip(MODEL, false, "Bob")).toMatchObject({ addDisabledReason: ITEM_HAS_TAG_REASON, removeDisabledReason: null });
    expect(chip(MODEL, false, "Calm")).toMatchObject({ addDisabledReason: null, removeDisabledReason: ITEM_LACKS_TAG_REASON });
    expect(chip(THREE, true, "Bob")).toMatchObject({ addDisabledReason: EVERY_ITEM_HAS_TAG_REASON, removeDisabledReason: null });
    expect(chip(THREE, true, "Calm")).toMatchObject({ addDisabledReason: null, removeDisabledReason: NO_ITEM_HAS_TAG_REASON });
    // A tag only some have can be added to the rest or removed from those that have it.
    expect(chip(THREE, true, "Beach")).toMatchObject({ state: "state-some", addDisabledReason: null, removeDisabledReason: null });
  });

  it("keeps a held change's button enabled, so it can be undone", () => {
    const chip = (selections: Map<string, { action: "add" | "remove"; name: string }>, name: string) =>
      tagCategoryRows(tagEditorDisplay(THREE, createPendingTagEdits(), ORDER), new Set(), selections, THREE, true)
        .flatMap((row) => row.chips)
        .find((candidate) => candidate.name === name)!;
    expect(chip(new Map([["bob", { action: "add", name: "Bob" }]]), "Bob").addDisabledReason).toBeNull();
    expect(chip(new Map([["calm", { action: "remove", name: "Calm" }]]), "Calm").removeDisabledReason).toBeNull();
  });

  it("counts each category's tags the items have, and marks one with a held change or a name or tags unlike the saved ones", () => {
    const rows = (edits: PendingTagEdits, selections = new Map<string, { action: "add" | "remove"; name: string }>()) =>
      tagCategoryRows(tagEditorDisplay(MODEL, edits, ORDER), new Set(), selections, MODEL, false).map((row) => [row.name, row.inUse, row.unsaved]);
    expect(rows(createPendingTagEdits())).toEqual([
      ["Places", 1, false],
      ["Mood", 0, false],
      ["People", 1, false],
      ["Uncategorized", 0, false]
    ]);
    // A held add marks its category; it counts what the items have now.
    expect(rows(createPendingTagEdits(), new Map([["calm", { action: "add", name: "Calm" }]]))[1]).toEqual(["Mood", 0, true]);
    // A renamed category, and a tag moved from Places to People, mark those categories.
    expect(
      rows(
        pending({
          upsertCategories: new Map([["mood", { id: "mood", name: "Feel", sortOrder: 1 }]]),
          renameTags: new Map([["beach", { oldName: "Beach", newName: "Beach", newCategoryId: "people" }]])
        })
      )
    ).toEqual([
      ["Places", 0, true],
      ["Feel", 0, true],
      ["People", 2, true],
      ["Uncategorized", 0, false]
    ]);
    // A new category always holds unsaved changes; a new order alone doesn't count.
    const added = tagEditorDisplay(
      MODEL,
      pending({ upsertCategories: new Map([["food", { id: "food", name: "Food", sortOrder: 3 }]]) }),
      ["people", "mood", "places", "food", "uncategorized"]
    );
    expect(tagCategoryRows(added, new Set(), new Map(), MODEL, false).map((row) => [row.name, row.unsaved])).toEqual([
      ["People", false],
      ["Mood", false],
      ["Places", false],
      ["Food", true],
      ["Uncategorized", false]
    ]);
  });

  it("says whether all, some, or none of the items have a tag from how many hold it", () => {
    expect(chipState(1, 2)).toBe("state-some");
    expect(chipState(2, 2)).toBe("state-all");
    expect(chipState(0, 2)).toBe("state-none");
    expect(chipState(0, 0)).toBe("state-none");
    // Counts by tag name ignore case, as the server counts them.
    const rows = tagCategoryRows(tagEditorDisplay(THREE, createPendingTagEdits(), ORDER), new Set(), new Map(), THREE, true);
    expect(rows.flatMap((row) => row.chips).map((chip) => [chip.name, chip.state])).toEqual([
      ["alps", "state-none"],
      ["Beach", "state-some"],
      ["Calm", "state-none"],
      ["Bob", "state-all"],
      ["Loose", "state-none"]
    ]);
  });

  it("toggles a held change off when chosen again, and replaces the other", () => {
    let selections = toggleTagSelection(new Map(), "Calm", "add");
    expect([...selections.values()]).toEqual([{ action: "add", name: "Calm" }]);
    selections = toggleTagSelection(selections, "calm", "remove");
    expect([...selections.values()]).toEqual([{ action: "remove", name: "calm" }]);
    expect(toggleTagSelection(selections, "CALM", "remove").size).toBe(0);
    expect(hasPendingTagEdits(createPendingTagEdits())).toBe(false);
    expect(hasPendingTagEdits(pending({ deleteTags: new Map([["bob", { name: "Bob" }]]) }))).toBe(true);
  });

  it("moves held changes to a tag renamed elsewhere, keeps one already held for the new name, and drops them for a deleted tag", () => {
    const selections = new Map([
      ["bob", { action: "add" as const, name: "Bob" }],
      ["robert", { action: "remove" as const, name: "Robert" }],
      ["beach", { action: "remove" as const, name: "Beach" }]
    ]);
    const held = pending({
      upsertTags: new Map([["beach", { name: "Beach", categoryId: "people" }]]),
      renameTags: new Map([
        ["bob", { oldName: "Bob", newName: "Bobby", newCategoryId: null }],
        ["sunset", { oldName: "Sunset", newName: "sunset", newCategoryId: "places" }]
      ]),
      deleteTags: new Map([["calm", { name: "Calm" }]])
    });

    const renamed = retargetHeldTag(selections, held, { kind: "rename-tag", oldName: "Bob", newName: "Robert", newCategoryId: null });
    expect([...renamed.selections]).toEqual([
      ["robert", { action: "remove", name: "Robert" }],
      ["beach", { action: "remove", name: "Beach" }]
    ]);
    expect([...renamed.pending.renameTags.values()]).toEqual([
      { oldName: "Sunset", newName: "sunset", newCategoryId: "places" },
      { oldName: "Robert", newName: "Bobby", newCategoryId: null }
    ]);

    // A held rename that only moved the tag's category takes the new name.
    const moved = retargetHeldTag(selections, held, { kind: "rename-tag", oldName: "sunset", newName: "Dusk", newCategoryId: null });
    expect(moved.pending.renameTags.get("dusk")).toEqual({ oldName: "Dusk", newName: "Dusk", newCategoryId: "places" });

    const deleted = retargetHeldTag(renamed.selections, held, { kind: "delete-tag", name: "BEACH" });
    expect([...deleted.selections.keys()]).toEqual(["robert"]);
    expect(deleted.pending.upsertTags.size).toBe(0);
    expect(retargetHeldTag(selections, held, { kind: "delete-tag", name: "Calm" }).pending.deleteTags.size).toBe(0);

    const untouched = retargetHeldTag(selections, held, { kind: "rename-tag", oldName: "Nobody", newName: "Someone", newCategoryId: null });
    expect(untouched.selections).toBe(selections);
    expect(untouched.pending).toBe(held);
  });
});

describe("name problems", () => {
  const CATEGORIES = [
    { id: "places", name: "Places" },
    { id: "people", name: " People " },
    { id: "uncategorized", name: "Uncategorized" }
  ];

  it("a category name is empty, or taken when another category has it, ignoring case and spaces", () => {
    expect(categoryNameProblem("", CATEGORIES, null)).toBe(EMPTY_FIELD);
    expect(categoryNameProblem("   ", CATEGORIES, "places")).toBe(EMPTY_FIELD);
    expect(categoryNameProblem(" people", CATEGORIES, null)).toEqual({ message: "Use a name no other category has." });
    expect(categoryNameProblem("PLACES", CATEGORIES, "people")).toEqual({ message: "Use a name no other category has." });
    expect(categoryNameProblem("uncategorized", CATEGORIES, "places")).toEqual({ message: "Use a name no other category has." });
    expect(categoryNameProblem(" Food ", CATEGORIES, null)).toBeNull();
  });

  it("Uncategorized is always taken, in any case, even while its row isn't showing", () => {
    const shown = CATEGORIES.filter((category) => category.id !== "uncategorized");
    expect(categoryNameProblem(" UNCATEGORIZED ", shown, null)).toEqual({ message: "Use a name no other category has." });
    expect(categoryNameProblem("uncategorized", shown, "places")).toEqual({ message: "Use a name no other category has." });
  });

  it("a category may keep its own name, in any case", () => {
    expect(categoryNameProblem("places", CATEGORIES, "places")).toBeNull();
    expect(categoryNameProblem("People", CATEGORIES, "people")).toBeNull();
  });

  it("a new tag name is empty, or taken when a tag shown in any category has it, ignoring case and spaces", () => {
    const tags = tagEditorDisplay(MODEL, createPendingTagEdits(), ORDER).tags;
    expect(newTagNameProblem("", tags)).toBe(EMPTY_FIELD);
    expect(newTagNameProblem("  ", tags)).toBe(EMPTY_FIELD);
    expect(newTagNameProblem(" ALPS ", tags)).toEqual({ message: "Use a name no other tag has." });
    expect(newTagNameProblem("loose", tags)).toEqual({ message: "Use a name no other tag has." });
    expect(newTagNameProblem("Sunset", tags)).toBeNull();
  });

  it("a new tag may take the name of a tag waiting to be deleted, and not a renamed tag's new name", () => {
    const edits = pending({
      deleteTags: new Map([["bob", { name: "Bob" }]]),
      renameTags: new Map([["calm", { oldName: "Calm", newName: "Shore", newCategoryId: null }]])
    });
    const tags = tagEditorDisplay(MODEL, edits, ORDER).tags;
    expect(newTagNameProblem("bob", tags)).toBeNull();
    expect(newTagNameProblem("shore", tags)).toEqual({ message: "Use a name no other tag has." });
  });
});

describe("saving", () => {
  it("shows the model as a save of the changes leaves it: the catalog edited, in the editor's order, and the counts' adds and removes applied", () => {
    const saved = savedTagModel(
      MODEL,
      pending({
        upsertCategories: new Map([["food", { id: "food", name: "Food", sortOrder: 9 }]]),
        deleteCategoryIds: new Set(["mood"]),
        renameTags: new Map([["beach", { oldName: "Beach", newName: "Shore", newCategoryId: null }]]),
        deleteTags: new Map([["bob", { name: "Bob" }]])
      }),
      ["people", "places", "food", "uncategorized"],
      new Map([
        ["calm", { action: "add" as const, name: "Calm" }],
        ["shore", { action: "remove" as const, name: "Shore" }]
      ])
    );
    expect(saved.categories.map((category) => [category.id, category.name, category.sortOrder])).toEqual([
      ["people", "People", 0],
      ["places", "Places", 1],
      ["food", "Food", 2]
    ]);
    expect(saved.tags.find((tag) => tag.name === "Calm")).toEqual({ name: "Calm", categoryId: "" });
    expect(saved.tags.some((tag) => tag.name === "Bob" || tag.name === "Beach")).toBe(false);
    expect(saved.tagCounts).toEqual([{ name: "Calm", itemCount: 1 }]);
    expect(saved.itemCount).toBe(1);
    // Shown again with nothing pending, it reads as the save leaves it.
    expect(tagEditorDisplay(saved, createPendingTagEdits(), []).categories.map((category) => category.id)).toEqual([
      "people",
      "places",
      "food",
      "uncategorized"
    ]);
  });

  it("counts a held add on every item and a held remove on none, keeping the other counts", () => {
    const saved = savedTagModel(
      THREE,
      createPendingTagEdits(),
      ORDER,
      new Map([
        ["beach", { action: "add" as const, name: "Beach" }],
        ["bob", { action: "remove" as const, name: "Bob" }],
        ["calm", { action: "add" as const, name: "Calm" }]
      ])
    );
    expect(saved.tagCounts).toEqual([
      { name: "Beach", itemCount: 3 },
      { name: "Calm", itemCount: 3 }
    ]);
    expect(saved.itemCount).toBe(3);
    const kept = savedTagModel(THREE, createPendingTagEdits(), ORDER, new Map([["calm", { action: "add" as const, name: "Calm" }]]));
    expect(kept.tagCounts).toEqual([
      { name: "Beach", itemCount: 2 },
      { name: "Bob", itemCount: 3 },
      { name: "Calm", itemCount: 3 }
    ]);
  });

  it("plans only changed categories, then deletes, tags, renames, and item tags", () => {
    const steps = planTagEdits({
      model: MODEL,
      pending: pending({ deleteCategoryIds: new Set(["mood"]), deleteTags: new Map([["bob", { name: "Bob" }]]) }),
      order: ["places", "people", "mood", "uncategorized"],
      selections: new Map([
        ["calm", { action: "add" as const, name: "Calm" }],
        ["beach", { action: "remove" as const, name: "Beach" }]
      ]),
      itemIds: ["item-1"]
    });
    expect(steps).toEqual([
      { kind: "upsert-category", id: "people", name: "People", sortOrder: 1 },
      { kind: "delete-category", categoryId: "mood" },
      { kind: "delete-tag", name: "Bob" },
      { kind: "apply-item-tags", itemIds: ["item-1"], addTags: ["Calm"], removeTags: ["Beach"] }
    ]);
  });

  it("plans Auto Tag's Apply as one step of its trimmed assignments, and none without files", () => {
    expect(planAutoTagApply([{ tagName: " Sunset ", itemPaths: ["C:\\sunset.mp4 "], itemIds: ["item-2"] }])).toEqual([
      { kind: "apply-auto-tag", assignments: [{ tagName: "Sunset", itemPaths: ["C:\\sunset.mp4"], itemIds: ["item-2"] }] }
    ]);
    expect(planAutoTagApply([{ tagName: "Sunset", itemPaths: [], itemIds: [] }])).toEqual([]);
  });

  it("sends each step to its route, and Auto Tag files by path", () => {
    expect(tagSaveRequest({ kind: "upsert-category", id: "c", name: "C", sortOrder: 2 })).toEqual({
      path: "/api/tag-editor/upsert-category",
      body: { id: "c", name: "C", sortOrder: 2 },
      label: "Category update"
    });
    expect(tagSaveRequest({ kind: "delete-category", categoryId: "c" }).body).toEqual({ categoryId: "c", newCategoryId: null });
    expect(tagSaveRequest({ kind: "upsert-tag", name: "T", categoryId: "" }).body).toEqual({ name: "T", categoryId: "" });
    expect(tagSaveRequest({ kind: "rename-tag", oldName: "A", newName: "B", newCategoryId: null })).toMatchObject({
      path: "/api/tag-editor/rename-tag",
      label: "Tag rename"
    });
    expect(tagSaveRequest({ kind: "delete-tag", name: "T" })).toMatchObject({ body: { name: "T" }, label: "Tag delete" });
    expect(tagSaveRequest({ kind: "apply-item-tags", itemIds: ["i"], addTags: ["A"], removeTags: [] }).label).toBe("Tag apply");
    expect(
      tagSaveRequest({ kind: "apply-auto-tag", assignments: [{ tagName: "S", itemPaths: ["C:\\s.mp4"], itemIds: ["i"] }] })
    ).toEqual({ path: "/api/autotag/apply", body: { assignments: [{ tagName: "S", itemPaths: ["C:\\s.mp4"] }] }, label: "Auto-tag apply" });
  });

  it("reads which files each Auto Tag assignment changed", () => {
    expect(autoTagAppliedFromResponse({ applied: [{ tagName: "S", changedItemIds: ["i"] }] })).toEqual([{ tagName: "S", changedItemIds: ["i"] }]);
    expect(autoTagAppliedFromResponse({ Applied: [{ TagName: "S", ChangedItemIds: ["i"] }] })).toEqual([{ tagName: "S", changedItemIds: ["i"] }]);
    expect(autoTagAppliedFromResponse(null)).toEqual([]);
  });
});
