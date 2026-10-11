import { describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "../dialogs/dialogs";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset, type PlayingItem } from "../state/appStore";
import { createTagEditor } from "../tags/tagEditor";
import type { TagEditorModel } from "../tags/tagEditorModel";
import { EMPTY_FIELD } from "../validation/fieldValidation";

const MODEL: TagEditorModel = {
  categories: [
    { id: "places", name: "Places", sortOrder: 0 },
    { id: "people", name: "People", sortOrder: 1 }
  ],
  tags: [
    { name: "Beach", categoryId: "places" },
    { name: "Bob", categoryId: "people" }
  ],
  items: [{ itemId: "item-1", tags: ["Beach"] }]
};

const ITEM = { itemId: "item-1", id: "C:\\clip.mp4", displayName: "clip.mp4", mediaType: "video" } as PlayingItem;

const BEACH_PRESET: ApiPreset = {
  id: "preset-beach",
  name: "Beach days",
  filterState: { selectedTags: ["Beach"], excludedTags: [], includedSourceIds: [] }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  };
}

function setup() {
  const steps: string[] = [];
  const server = {
    model: structuredClone(MODEL),
    modelStatus: 200,
    scan: { rows: [] as unknown[] } as unknown,
    scanStatus: 200,
    /** Paths that answer with a status, or throw as an unreachable server does when the status is 0. */
    failures: new Map<string, number>(),
    posts: [] as Array<{ path: string; body: any }>
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (path === "/api/logs/client") {
      return json({});
    }
    server.posts.push({ path, body });
    steps.push(`post ${path}`);
    if (path === "/api/tag-editor/model") {
      return server.modelStatus === 200 ? json(server.model) : json({}, server.modelStatus);
    }
    if (path === "/api/autotag/scan") {
      return server.scanStatus === 200 ? json(server.scan) : json({}, server.scanStatus);
    }
    const failure = server.failures.get(path);
    if (failure === 0) {
      throw new TypeError("Failed to fetch");
    }
    return failure ? json({}, failure) : json({ applied: [] });
  }) as typeof fetch;

  const statuses: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    relay: () => {}
  });
  const setStatus = store.setStatus;
  store.setStatus = (message, logText) => {
    statuses.push(message);
    setStatus(message, logText);
  };
  const api = createAppApi("http://server", { onUnauthorized: () => {}, fetch: fetchImpl });

  const listeners: Record<string, (payload: any) => void> = {};
  const connection = {
    on(event: string, listener: (payload: any) => void) {
      listeners[event] = listener;
    }
  };

  const tiles = [{ id: "item-1", tags: ["Beach"] }];
  const storedFilter = { selectedTags: [] as string[], excludedTags: [] as string[] };
  const session = {
    snapshot: () => ({ items: tiles.map((tile) => ({ ...tile, tags: tile.tags.slice() })), inFlight: null }),
    writeTags: vi.fn((updates: readonly { itemId: string; tags: readonly string[] }[]) => {
      steps.push(`writeTags ${updates.map((update) => update.tags.join("+")).join(",")}`);
      for (const update of updates) {
        const tile = tiles.find((candidate) => candidate.id === update.itemId);
        if (tile) {
          tile.tags = update.tags.slice();
        }
      }
    }),
    reviseStoredFilter: vi.fn((revise: (selected: string[], excluded: string[]) => void) => {
      revise(storedFilter.selectedTags, storedFilter.excludedTags);
    }),
    reloadLoaded: vi.fn(async () => {
      steps.push("reloadLoaded");
    }),
    applyTags: vi.fn(async () => {
      steps.push("applyTags");
    })
  };

  const player = {
    pauseForTagEditor: vi.fn(() => steps.push(`pause open=${editor.isOpen.peek()}`)),
    resumeAfterTagEditor: vi.fn(() => steps.push(`resume open=${editor.isOpen.peek()}`))
  };
  const sessionStorage = memoryStorage();
  const localStorage = memoryStorage();
  const confirm = vi.fn(async (_request: ConfirmRequest) => true);
  const editor = createTagEditor({
    store,
    api,
    connection,
    library: { session } as never,
    player,
    sessionStorage,
    localStorage,
    dialogs: { confirm },
    newId: () => "new-category"
  });
  const view = () => editor.view.value!;
  const titles = () => view().categories?.map((category) => category.name) ?? [];
  return { editor, view, titles, store, server, statuses, steps, listeners, tiles, storedFilter, session, player, sessionStorage, localStorage, confirm };
}

/** Lets fetch replies finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** The confirmation asked, as the dialogs service gets it. */
function asked(message: string, confirmLabel: string): ConfirmRequest {
  return { message, confirmLabel, danger: true };
}

const DISCARD = asked("Discard changes?", "Discard");

/** A confirmation the test answers later. */
function held(): { promise: Promise<boolean>; answer: (confirmed: boolean) => void } {
  let answer!: (confirmed: boolean) => void;
  const promise = new Promise<boolean>((resolve) => (answer = resolve));
  return { promise, answer };
}

async function openOn(context: ReturnType<typeof setup>, item: PlayingItem | null = ITEM): Promise<void> {
  context.store.current.value = item;
  context.editor.open();
  await settle();
}

describe("opening and closing", () => {
  it("pauses before it shows and loads the playing item's tags, and resumes after it hides", async () => {
    const context = setup();
    const { editor, steps, server } = context;
    expect(editor.view.value).toBeNull();
    expect(editor.tab.value).toBeNull();

    await openOn(context);
    expect(steps.slice(0, 2)).toEqual(["pause open=false", "post /api/tag-editor/model"]);
    expect(editor.isOpen.value).toBe(true);
    expect(editor.tab.value).toBe("edit");
    expect(server.posts[0]!.body).toEqual({ itemIds: ["item-1"] });
    expect(context.titles()).toEqual(["Places", "People"]);

    editor.close();
    expect(editor.isOpen.value).toBe(false);
    expect(steps.at(-1)).toBe("resume open=false");
  });

  it("says why when the tags cannot load, and stays open", async () => {
    const context = setup();
    context.server.modelStatus = 500;
    await openOn(context);
    expect(context.statuses).toEqual(["Tag editor unavailable: tag-model:500"]);
    expect(context.editor.isOpen.value).toBe(true);
    expect(context.view().categories).toBeNull();
    expect(context.view().noModel).toBe(false);

    context.editor.addCategory();
    context.editor.saveNewCategory();
    expect(context.view().noModel).toBe(false);
    context.editor.typeNewCategoryName("Food");
    context.editor.saveNewCategory();
    expect(context.view().noModel).toBe(true);
  });

  it("starts over on each open from storage, and keeps the new tag fields and the Edit Tag dialog's", async () => {
    const context = setup();
    const { editor, sessionStorage, localStorage } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    editor.showTab("autotag");
    editor.setViewAll(true);
    editor.typeNewTag("Sun");
    editor.chooseNewTagCategory("people");
    editor.editTag("Beach");
    editor.typeEditName("Shore");
    editor.cancelEdit();
    await editor.close();

    sessionStorage.values.set("rr_tagEditorCollapsed", JSON.stringify(["people"]));
    localStorage.values.set("rr_autoTagScanFullLibrary", "true");
    await openOn(context);
    expect(editor.tab.value).toBe("edit");
    expect(context.view().selections.size).toBe(0);
    expect(context.view().categories?.map((category) => category.collapsed)).toEqual([false, true]);
    expect(context.view().autoTag).toMatchObject({ scanFull: true, viewAll: false, hasRun: false, status: "" });
    expect(context.view()).toMatchObject({ newTagName: "Sun", newTagCategoryId: "people", editing: false });
    expect(context.view().edit).toMatchObject({ name: "Shore", categoryId: "places" });
  });

  it("orders categories by the newest tags' sort order on each open and Refresh", async () => {
    const context = setup();
    await openOn(context);
    context.editor.close();
    context.server.model.categories = [
      { id: "places", name: "Places", sortOrder: 1 },
      { id: "people", name: "People", sortOrder: 0 }
    ];
    await openOn(context);
    expect(context.titles()).toEqual(["People", "Places"]);

    context.server.model.categories[1]!.sortOrder = 2;
    context.editor.refresh();
    await settle();
    expect(context.titles()).toEqual(["Places", "People"]);
  });

  it("asks before dropping changes, and neither closes nor refreshes while a scan runs", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");

    confirm.mockResolvedValue(false);
    await editor.close();
    await editor.refresh();
    expect(confirm.mock.calls).toEqual([[DISCARD], [DISCARD]]);
    expect(editor.isOpen.value).toBe(true);
    expect(context.view().selections.size).toBe(1);
    expect(context.server.posts).toHaveLength(1);

    const scan = editor.scan();
    expect(context.view().autoTag).toMatchObject({ scanning: true, status: "Scanning…" });
    confirm.mockResolvedValue(true);
    await editor.close();
    await editor.refresh();
    editor.save();
    expect(editor.isOpen.value).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    await scan;
    expect(context.view().autoTag.scanning).toBe(false);
  });

  it("closes and refreshes at once without asking when nothing changed", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    void editor.refresh();
    expect(context.server.posts.at(-1)?.path).toBe("/api/tag-editor/model");
    expect(context.server.posts).toHaveLength(2);
    await settle();
    void editor.close();
    expect(editor.isOpen.value).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("Discard closes, or drops the changes and loads the tags again", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    await editor.refresh();
    await settle();
    expect(confirm.mock.calls).toEqual([[DISCARD]]);
    expect(context.server.posts).toHaveLength(2);
    expect(context.view().selections.size).toBe(0);
    expect(context.view().savePending).toBe(false);

    editor.toggleTag("Bob", "add");
    await editor.close();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(editor.isOpen.value).toBe(false);
    expect(context.player.resumeAfterTagEditor).toHaveBeenCalledTimes(1);
  });

  it("does nothing after Discard when the editor closed or a scan started while it asked", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    const closing = held();
    confirm.mockReturnValueOnce(closing.promise);
    const close = editor.close();
    editor.save();
    expect(editor.isOpen.value).toBe(false);
    closing.answer(true);
    await close;
    expect(context.player.resumeAfterTagEditor).toHaveBeenCalledTimes(1);
    await settle();

    await openOn(context);
    editor.toggleTag("Bob", "add");
    const refreshing = held();
    confirm.mockReturnValueOnce(refreshing.promise);
    const refresh = editor.refresh();
    const scan = editor.scan();
    refreshing.answer(true);
    await refresh;
    expect(context.view().selections.size).toBe(1);
    await scan;
  });

  it("closing or refreshing the editor closes its dialogs", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    const openDialogs = () => {
      editor.editTag("Bob");
      editor.editCategory("people");
      editor.addCategory();
      expect(context.view()).toMatchObject({ editing: true, categoryEdit: { categoryId: "people" }, newCategory: { name: "" } });
    };
    openDialogs();
    await editor.refresh();
    expect(context.view()).toMatchObject({ editing: false, categoryEdit: null, newCategory: null });
    await settle();

    openDialogs();
    await editor.close();
    expect(context.view()).toMatchObject({ editing: false, categoryEdit: null, newCategory: null });
    expect(context.view().edit?.name).toBe("Bob");
  });
});

describe("Edit Tags", () => {
  it("keeps the new tag's category while it shows, and otherwise uses the first", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    expect(context.view().newTagCategoryId).toBe("places");
    editor.chooseNewTagCategory("people");
    editor.editCategory("people");
    await editor.deleteEditedCategory();
    expect(context.view().newTagCategoryId).toBe("places");
    await editor.refresh();
    await settle();
    expect(context.view().newTagCategoryId).toBe("places");
  });

  it("adds a category before Uncategorized with the next sort order", async () => {
    const context = setup();
    context.server.model.tags.push({ name: "Loose", categoryId: "" });
    await openOn(context);
    context.editor.addCategory();
    context.editor.typeNewCategoryName(" Food ");
    context.editor.saveNewCategory();
    expect(context.titles()).toEqual(["Places", "People", "Food", "Uncategorized"]);
    expect(context.view().pending.upsertCategories.get("new-category")).toEqual({ id: "new-category", name: "Food", sortOrder: 3 });
  });

  it("the Edit Tag dialog disables Save while the name is empty, and keeps its fields after it closes", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.editTag("Bob");
    expect(context.view()).toMatchObject({ editing: true, edit: { oldName: "Bob", oldCategoryId: "people", name: "Bob", categoryId: "people" } });
    expect(context.view()).toMatchObject({ editNameProblem: null, editNameFlagged: false });
    editor.typeEditName("  ");
    expect(context.view()).toMatchObject({ editNameProblem: EMPTY_FIELD, editNameFlagged: false });
    editor.saveEdit();
    expect(context.statuses).toEqual([]);
    expect(context.view().editing).toBe(true);
    expect(context.view().pending.renameTags.size).toBe(0);

    editor.typeEditName("Robert");
    editor.saveEdit();
    expect(context.view().editing).toBe(false);
    expect(context.view().edit?.name).toBe("Robert");
    expect(context.view().categories?.[1]?.chips.map((chip) => chip.name)).toEqual(["Robert"]);
    editor.typeEditName("ignored while closed");
    expect(context.view().edit?.name).toBe("Robert");
  });
});

describe("Edit Tags dialogs", () => {
  const TAKEN_CATEGORY = { message: "Use a name no other category has." };

  it("the Edit Tag dialog takes another tag's name without a problem, and Save renames onto it", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.editTag("Bob");
    editor.typeEditName("beach");
    expect(context.view()).toMatchObject({ editNameProblem: null, editNameFlagged: false });
    editor.saveEdit();
    expect(context.view().editing).toBe(false);
    expect([...context.view().pending.renameTags.values()]).toEqual([{ oldName: "Bob", newName: "beach", newCategoryId: null }]);
  });

  it("Delete in Edit Tag asks about the tag as it opened, and Cancel keeps the dialog and the typed name", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    editor.editTag("Bob");
    editor.typeEditName("Robert");

    confirm.mockResolvedValueOnce(false);
    await editor.deleteEditedTag();
    expect(confirm.mock.calls).toEqual([[asked('Delete tag "Bob"?', "Delete")]]);
    expect(context.view()).toMatchObject({ editing: true, edit: { name: "Robert" } });
    expect(context.view().pending.deleteTags.size).toBe(0);

    await editor.deleteEditedTag();
    expect(context.view().editing).toBe(false);
    expect([...context.view().pending.deleteTags.values()]).toEqual([{ name: "Bob" }]);
    expect(context.view().selections.size).toBe(0);
    expect(context.view().categories?.[1]?.chips).toEqual([]);
  });

  it("New Category disables Save while the name is empty or another category's, and Cancel adds nothing", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.addCategory();
    expect(context.view()).toMatchObject({ newCategory: { name: "" }, newCategoryProblem: EMPTY_FIELD, newCategoryFlagged: false });
    editor.saveNewCategory();
    expect(context.view().newCategory).toEqual({ name: "" });

    editor.typeNewCategoryName(" PEOPLE ");
    expect(context.view()).toMatchObject({ newCategoryProblem: TAKEN_CATEGORY, newCategoryFlagged: true });
    editor.saveNewCategory();
    expect(context.view().newCategory).toEqual({ name: " PEOPLE " });
    expect(context.view().savePending).toBe(false);

    editor.cancelNewCategory();
    expect(context.view()).toMatchObject({ newCategory: null, newCategoryProblem: null, newCategoryFlagged: false });
    expect(context.titles()).toEqual(["Places", "People"]);
    editor.typeNewCategoryName("ignored while closed");
    expect(context.view().newCategory).toBeNull();
  });

  it("Edit Category opens on the trimmed name, and not for Uncategorized", async () => {
    const context = setup();
    context.server.model.categories[1]!.name = " People ";
    context.server.model.tags.push({ name: "Loose", categoryId: "" });
    await openOn(context);
    context.editor.editCategory("uncategorized");
    expect(context.view().categoryEdit).toBeNull();
    context.editor.editCategory("people");
    expect(context.view()).toMatchObject({ categoryEdit: { categoryId: "people", name: "People" }, categoryEditProblem: null });

    context.editor.saveCategoryEdit();
    expect(context.view().categoryEdit).toBeNull();
    expect(context.view().pending.upsertCategories.size).toBe(0);
    expect(context.view().savePending).toBe(false);
  });

  it("Edit Category disables Save while the name is empty or another category's, and renames otherwise", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.editCategory("people");
    editor.typeCategoryName("  ");
    expect(context.view()).toMatchObject({ categoryEditProblem: EMPTY_FIELD, categoryEditFlagged: false });
    editor.saveCategoryEdit();
    editor.typeCategoryName("places");
    expect(context.view()).toMatchObject({ categoryEditProblem: TAKEN_CATEGORY, categoryEditFlagged: true });
    editor.saveCategoryEdit();
    expect(context.view().categoryEdit).toEqual({ categoryId: "people", name: "places" });
    expect(context.view().pending.upsertCategories.size).toBe(0);

    editor.typeCategoryName(" PEOPLE ");
    expect(context.view().categoryEditProblem).toBeNull();
    editor.saveCategoryEdit();
    expect(context.view().categoryEdit).toBeNull();
    expect(context.titles()).toEqual(["Places", "PEOPLE"]);
    expect(context.view().pending.upsertCategories.get("people")).toEqual({ id: "people", name: "PEOPLE", sortOrder: 1 });

    editor.editCategory("places");
    editor.typeCategoryName("Scenery");
    editor.cancelCategoryEdit();
    expect(context.view().categoryEdit).toBeNull();
    expect(context.titles()).toEqual(["Places", "PEOPLE"]);
  });

  it("Delete in Edit Category asks first, and Cancel keeps the dialog open", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.editCategory("people");
    editor.typeCategoryName("Folks");

    confirm.mockResolvedValueOnce(false);
    await editor.deleteEditedCategory();
    expect(confirm.mock.calls).toEqual([[asked('Delete category "People"? Tags will become Uncategorized.', "Delete")]]);
    expect(context.view().categoryEdit).toEqual({ categoryId: "people", name: "Folks" });
    expect(context.titles()).toEqual(["Places", "People"]);

    await editor.deleteEditedCategory();
    expect(context.view().categoryEdit).toBeNull();
    expect(context.titles()).toEqual(["Places", "Uncategorized"]);
    expect(context.view().categories?.[1]?.chips.map((chip) => chip.name)).toEqual(["Bob"]);
    expect([...context.view().pending.deleteCategoryIds]).toEqual(["people"]);
  });

  it("the new tag name disables Add tag while it is empty or another tag's, and a deleted tag's name is free", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    expect(context.view()).toMatchObject({ newTagProblem: EMPTY_FIELD, newTagFlagged: false, addTagDisabled: true });
    editor.addTag();
    expect(context.view().savePending).toBe(false);

    editor.typeNewTag(" bob ");
    expect(context.view()).toMatchObject({
      newTagProblem: { message: "Use a name no other tag has." },
      newTagFlagged: true,
      addTagDisabled: true
    });
    editor.addTag();
    expect(context.view().newTagName).toBe(" bob ");
    expect(context.view().savePending).toBe(false);

    editor.editTag("Bob");
    await editor.deleteEditedTag();
    expect(context.view()).toMatchObject({ newTagProblem: null, newTagFlagged: false, addTagDisabled: false });
    editor.chooseNewTagCategory("places");
    editor.addTag();
    expect(context.view().newTagName).toBe("");
    expect(context.view().pending.deleteTags.size).toBe(0);
    expect(context.view().categories?.[0]?.chips.map((chip) => chip.name)).toEqual(["Beach", "Bob"]);
  });
  it("Add tag only creates the tag, opening its category, and says which tag it created", async () => {
    const context = setup();
    const { editor, sessionStorage } = context;
    await openOn(context);
    editor.toggleCategory("people");
    editor.chooseNewTagCategory("people");
    editor.typeNewTag("  Sunset ");
    expect(editor.addTag()).toBe("Sunset");
    expect(context.view().pending.upsertTags.get("sunset")).toEqual({ name: "Sunset", categoryId: "people" });
    expect(context.view().selections.size).toBe(0);
    expect(context.view().categories?.find((category) => category.id === "people")?.collapsed).toBe(false);
    expect(sessionStorage.values.get("rr_tagEditorCollapsed")).toBe("[]");
    expect(editor.addTag()).toBeNull();
  });
});

describe("saving", () => {
  it("updates the loaded tiles, closes, sends the steps in order, then says it applied", async () => {
    const context = setup();
    const { editor, steps, server, statuses } = context;
    await openOn(context);
    editor.editTag("Bob");
    await editor.deleteEditedTag();
    editor.toggleTag("Beach", "remove");
    steps.length = 0;

    editor.save();
    expect(editor.isOpen.value).toBe(false);
    expect(steps.slice(0, 2)).toEqual(["writeTags ", "resume open=false"]);
    await settle();
    expect(server.posts.slice(1).map((post) => post.path)).toEqual(["/api/tag-editor/delete-tag", "/api/tag-editor/apply-item-tags"]);
    expect(server.posts[2]!.body).toEqual({ itemIds: ["item-1"], addTags: [], removeTags: ["Beach"] });
    expect(statuses).toEqual(["Tag editor changes applied"]);
    expect(context.session.reloadLoaded).not.toHaveBeenCalled();
  });

  it("says there is nothing to save when the changes cancel out, and stays open", async () => {
    const context = setup();
    await openOn(context);
    context.editor.moveCategory("people", 0);
    context.editor.moveCategory("people", 1);
    expect(context.view().savePending).toBe(true);
    context.editor.save();
    expect(context.statuses).toEqual(["No tag changes to save."]);
    expect(context.editor.isOpen.value).toBe(true);
  });

  it("puts the tiles back and names the step the server refused", async () => {
    const context = setup();
    context.server.failures.set("/api/tag-editor/apply-item-tags", 500);
    await openOn(context);
    context.editor.toggleTag("Beach", "remove");
    context.editor.save();
    expect(context.tiles[0]!.tags).toEqual([]);
    await settle();
    expect(context.statuses).toEqual(["Tag apply failed (500)"]);
    expect(context.tiles[0]!.tags).toEqual(["Beach"]);
  });

  // Kept as it was before the tag editor moved to Preact, and recorded in WebUI Status Line Overhaul.
  it("reports a save that cannot reach the server with the last refused step's message", async () => {
    const context = setup();
    const save = async (name: string) => {
      await openOn(context);
      context.editor.editTag(name);
      await context.editor.deleteEditedTag();
      context.editor.save();
      await settle();
    };
    context.server.failures.set("/api/tag-editor/delete-tag", 0);
    await save("Bob");
    context.server.failures.set("/api/tag-editor/delete-tag", 409);
    await save("Bob");
    context.server.failures.set("/api/tag-editor/delete-tag", 0);
    await save("Beach");
    expect(context.statuses).toEqual(["Tag apply failed", "Tag delete failed (409)", "Tag delete failed (409)"]);
  });

  it("renames a saved tag in the applied filter, presets with tag lists, and the library's filter, then reloads once", async () => {
    const context = setup();
    const { editor, store, storedFilter, session } = context;
    store.presets.value = [structuredClone(BEACH_PRESET), { id: "preset-bare", name: "Bare", filterState: { selectedTags: ["Beach"] } }];
    store.appliedFilter.value = { ...createDefaultFilterState(), selectedTags: ["Beach"] };
    storedFilter.selectedTags.push("Beach");
    store.syncHeaderPresets();
    await openOn(context);
    editor.editTag("Beach");
    editor.typeEditName("Shore");
    editor.saveEdit();

    editor.save();
    await settle();
    expect(store.appliedFilter.value.selectedTags).toEqual(["Shore"]);
    expect((store.presets.value[0]!.filterState as any).selectedTags).toEqual(["Shore"]);
    expect((store.presets.value[1]!.filterState as any).selectedTags).toEqual(["Beach"]);
    expect(storedFilter.selectedTags).toEqual(["Shore"]);
    expect(store.activePresetName.value).toBe("Beach days");
    expect(session.reloadLoaded).toHaveBeenCalledTimes(1);

    context.listeners.itemTagsChanged!({ resolvedItemIds: ["item-1"], addedTags: ["Shore"], removedTags: ["Beach"] });
    await settle();
    expect(session.reloadLoaded).toHaveBeenCalledTimes(1);
  });

  it("does not patch tiles again for its own item-tags event, but does for another client's", async () => {
    const context = setup();
    await openOn(context);
    context.editor.toggleTag("Bob", "add");
    context.editor.save();
    await settle();
    context.listeners.itemTagsChanged!({ resolvedItemIds: ["item-1"], addedTags: ["Bob"], removedTags: [] });
    expect(context.session.applyTags).not.toHaveBeenCalled();

    context.listeners.itemTagsChanged!({ resolvedItemIds: ["item-1"], addedTags: ["Bob"], removedTags: [] });
    expect(context.session.applyTags).toHaveBeenCalledWith({
      resolvedItemIds: ["item-1"],
      addedTags: ["Bob"],
      removedTags: [],
      catalogReplacedTag: null
    });
  });

  it("applies another client's tag delete to the applied filter, and reloads once the filter has no tags left", async () => {
    const context = setup();
    const { store, session } = context;
    store.appliedFilter.value = { ...createDefaultFilterState(), selectedTags: ["Beach"] };
    context.listeners.itemTagsChanged!({
      resolvedItemIds: ["item-1"],
      addedTags: [],
      removedTags: ["Beach"],
      catalogReplacedTag: "Beach",
      catalogReplacementTag: null
    });
    await settle();
    expect(store.appliedFilter.value.selectedTags).toEqual([]);
    expect(session.applyTags).toHaveBeenCalledWith(expect.objectContaining({ catalogReplacedTag: "Beach" }));
    expect(session.reloadLoaded).toHaveBeenCalledTimes(1);
  });
});

describe("Auto Tag", () => {
  const SCAN = {
    rows: [
      {
        tagName: "Sunset",
        totalMatchedCount: 1,
        wouldChangeCount: 1,
        files: [{ itemId: "s1", fullPath: "C:\\sunset.mp4", displayPath: "sunset.mp4", needsChange: true }]
      }
    ]
  };

  it("scans with Scan full library, stores the box, and adds the selected files to Save", async () => {
    const context = setup();
    const { editor, server, localStorage } = context;
    context.server.scan = SCAN;
    await openOn(context);
    editor.setScanFullLibrary(true);
    expect(localStorage.values.get("rr_autoTagScanFullLibrary")).toBe("true");
    await editor.scan();
    expect(server.posts.at(-1)).toEqual({ path: "/api/autotag/scan", body: { scanFullLibrary: true, itemIds: [] } });
    expect(context.view().autoTag.status).toBe("Scan complete: 1 matching tags, 1 matches, 0/1 selected changes.");
    expect(context.view().savePending).toBe(false);

    editor.checkRow(0, true);
    expect(context.view().savePending).toBe(true);
    editor.save();
    await settle();
    expect(server.posts.at(-1)).toEqual({ path: "/api/autotag/apply", body: { assignments: [{ tagName: "Sunset", itemPaths: ["C:\\sunset.mp4"] }] } });
  });

  // Both kept as they were before the tag editor moved to Preact, and recorded in WebUI Status Line Overhaul.
  it("reads a failed scan as one with no matches, and keeps Scanning… when no row shows", async () => {
    const context = setup();
    context.server.scanStatus = 500;
    await openOn(context);
    await context.editor.scan();
    expect(context.view().autoTag.status).toBe("Scan complete: no matching tags found.");
    expect(context.view().results).toEqual({ kind: "hint", text: "Scan complete: no matching tags found." });

    context.server.scanStatus = 200;
    context.server.scan = { rows: [{ ...SCAN.rows[0], wouldChangeCount: 0, files: [{ ...SCAN.rows[0]!.files[0], needsChange: false }] }] };
    await context.editor.scan();
    expect(context.view().autoTag.status).toBe("Scanning…");
    expect(context.view().results).toEqual({ kind: "hint", text: "No rows to show." });
  });
});
