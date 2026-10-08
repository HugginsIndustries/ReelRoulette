import { describe, expect, it, vi } from "vitest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset, type PlayingItem } from "../state/appStore";
import { createTagEditor } from "../tags/tagEditor";
import type { TagEditorModel } from "../tags/tagEditorModel";

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
  const confirm = vi.fn((_message: string) => true);
  const prompt = vi.fn((_message: string, _value?: string): string | null => null);
  const alert = vi.fn();
  const editor = createTagEditor({
    store,
    api,
    connection,
    library: { session } as never,
    player,
    sessionStorage,
    localStorage,
    confirm,
    prompt,
    alert,
    newId: () => "new-category"
  });
  const view = () => editor.view.value!;
  const titles = () => view().categories?.map((category) => category.name) ?? [];
  return { editor, view, titles, store, server, statuses, steps, listeners, tiles, storedFilter, session, player, sessionStorage, localStorage, confirm, prompt };
}

/** Lets fetch replies finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
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
    context.prompt.mockReturnValue("Food");
    context.editor.addCategory();
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
    editor.close();

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

    confirm.mockReturnValue(false);
    editor.close();
    editor.refresh();
    expect(confirm.mock.calls).toEqual([["Discard changes?"], ["Discard changes?"]]);
    expect(editor.isOpen.value).toBe(true);
    expect(context.view().selections.size).toBe(1);

    const scan = editor.scan();
    expect(context.view().autoTag).toMatchObject({ scanning: true, status: "Scanning…" });
    confirm.mockReturnValue(true);
    editor.close();
    editor.refresh();
    editor.save();
    expect(editor.isOpen.value).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    await scan;
    expect(context.view().autoTag.scanning).toBe(false);
  });
});

describe("Edit Tags", () => {
  it("keeps the new tag's category while it shows, and otherwise uses the first", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    expect(context.view().newTagCategoryId).toBe("places");
    editor.chooseNewTagCategory("people");
    editor.deleteCategory("people");
    expect(context.view().newTagCategoryId).toBe("places");
    editor.refresh();
    await settle();
    expect(context.view().newTagCategoryId).toBe("places");
  });

  it("adds a category before Uncategorized with the next sort order", async () => {
    const context = setup();
    context.server.model.tags.push({ name: "Loose", categoryId: "" });
    await openOn(context);
    context.prompt.mockReturnValue(" Food ");
    context.editor.addCategory();
    expect(context.titles()).toEqual(["Places", "People", "Food", "Uncategorized"]);
    expect(context.view().pending.upsertCategories.get("new-category")).toEqual({ id: "new-category", name: "Food", sortOrder: 3 });
  });

  it("the Edit Tag dialog asks for a name, and keeps its fields after it closes", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.editTag("Bob");
    expect(context.view()).toMatchObject({ editing: true, edit: { oldName: "Bob", oldCategoryId: "people", name: "Bob", categoryId: "people" } });
    editor.typeEditName("  ");
    editor.saveEdit();
    expect(context.statuses).toEqual(["Tag name is required."]);
    expect(context.view().editing).toBe(true);

    editor.typeEditName("Robert");
    editor.saveEdit();
    expect(context.view().editing).toBe(false);
    expect(context.view().edit?.name).toBe("Robert");
    expect(context.view().categories?.[1]?.chips.map((chip) => chip.name)).toEqual(["Robert"]);
    editor.typeEditName("ignored while closed");
    expect(context.view().edit?.name).toBe("Robert");
  });
});

describe("saving", () => {
  it("updates the loaded tiles, closes, sends the steps in order, then says it applied", async () => {
    const context = setup();
    const { editor, steps, server, statuses } = context;
    await openOn(context);
    editor.deleteTag("Bob");
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
    context.editor.moveCategory("people", -1);
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
      context.editor.deleteTag(name);
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
