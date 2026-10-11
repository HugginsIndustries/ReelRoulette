import { describe, expect, it } from "vitest";
import { EMPTY_FIELD } from "../validation/fieldValidation";
import {
  addCategoryToOrder,
  autoTagAppliedFromResponse,
  categoryNameProblem,
  categoryOptions,
  chipState,
  createPendingTagEdits,
  hasPendingTagEdits,
  initialCategoryOrder,
  moveCategoryInOrder,
  newTagNameProblem,
  planTagEdits,
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
  items: [{ itemId: "item-1", tags: ["Beach", "Bob"] }]
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

  it("applies new, moved, renamed, and deleted tags, and renames a tag on the items that have it", () => {
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
    expect(display.items).toEqual([{ itemId: "item-1", tags: ["Bob", "Shore"] }]);
    expect(MODEL.items[0]!.tags).toEqual(["Beach", "Bob"]);
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
    const rows = tagCategoryRows(display, new Set(["mood"]), new Map([["calm", { action: "add" as const, name: "Calm" }]]));
    expect(rows.map((row) => [row.name, row.collapsed, row.uncategorized])).toEqual([
      ["Places", false, false],
      ["Mood", true, false],
      ["People", false, false],
      ["Uncategorized", false, true]
    ]);
    expect(rows[0]!.chips).toEqual([
      { name: "alps", state: "state-none", pending: null, canChangeItems: true },
      { name: "Beach", state: "state-all", pending: null, canChangeItems: true }
    ]);
    expect(rows[1]!.chips[0]!.pending).toBe("add");
    expect(rows[3]!.chips.map((chip) => chip.name)).toEqual(["Loose"]);

    const alone = tagEditorDisplay({ ...MODEL, items: [] }, createPendingTagEdits(), ["places"]);
    expect(tagCategoryRows(alone, new Set(), new Map())[0]!.chips[0]!.canChangeItems).toBe(false);
  });

  it("says whether all, some, or none of the items have a tag, ignoring case", () => {
    const items = [
      { itemId: "a", tags: ["beach"] },
      { itemId: "b", tags: [] }
    ];
    expect(chipState("Beach", items)).toBe("state-some");
    expect(chipState("Beach", items.slice(0, 1))).toBe("state-all");
    expect(chipState("Calm", items)).toBe("state-none");
    expect(chipState("Beach", [])).toBe("state-none");
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
  it("plans only changed categories, then deletes, tags, renames, item tags, and Auto Tag", () => {
    const steps = planTagEdits({
      model: MODEL,
      pending: pending({ deleteCategoryIds: new Set(["mood"]), deleteTags: new Map([["bob", { name: "Bob" }]]) }),
      order: ["places", "people", "mood", "uncategorized"],
      selections: new Map([
        ["calm", { action: "add" as const, name: "Calm" }],
        ["beach", { action: "remove" as const, name: "Beach" }]
      ]),
      itemIds: ["item-1"],
      autoTagAssignments: [{ tagName: "Sunset", itemPaths: ["C:\\sunset.mp4"], itemIds: ["item-2"] }]
    });
    expect(steps).toEqual([
      { kind: "upsert-category", id: "people", name: "People", sortOrder: 1 },
      { kind: "delete-category", categoryId: "mood" },
      { kind: "delete-tag", name: "Bob" },
      { kind: "apply-item-tags", itemIds: ["item-1"], addTags: ["Calm"], removeTags: ["Beach"] },
      { kind: "apply-auto-tag", assignments: [{ tagName: "Sunset", itemPaths: ["C:\\sunset.mp4"], itemIds: ["item-2"] }] }
    ]);
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
