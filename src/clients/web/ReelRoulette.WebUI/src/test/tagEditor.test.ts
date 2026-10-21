import { describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "../dialogs/dialogs";
import { createDefaultFilterState } from "../filter/filterStateModel";
import type { NotifyRequest } from "../notifications/notifications";
import { createAppApi } from "../state/appApi";
import { createAppStore, type ApiPreset, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { REFRESH_GATHER_MS } from "../stats/coalescedRefresh";
import { createTagEditor } from "../tags/tagEditor";
import type { TagEditorModel } from "../tags/tagEditorModel";
import { EMPTY_FIELD } from "../validation/fieldValidation";

/** A landed save's message, Auto Tag's Apply's too. */
const APPLIED: NotifyRequest = { kind: "actions", text: "Tag editor changes applied", key: "tags" };

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
const OTHER = { itemId: "item-2", id: "C:\\other.mp4", displayName: "other.mp4", mediaType: "video" } as PlayingItem;

const BEACH_PRESET: ApiPreset = {
  id: "preset-beach",
  name: "Beach days",
  filterState: { selectedTags: ["Beach"], excludedTags: [], includedSourceIds: [] }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  };
}

/** `scanFullLibrary` is what this browser stored for Scan full library before the page loaded. */
function setup(options: { scanFullLibrary?: string } = {}) {
  const steps: string[] = [];
  const server = {
    model: structuredClone(MODEL),
    modelStatus: 200,
    scan: { rows: [] as unknown[] } as unknown,
    /** The scan's status, or 0 for a scan that can't reach the server. */
    scanStatus: 200,
    /** The content type the tag model and the scan answer with, for a proxy's page in place of JSON. */
    replyType: "application/json",
    /** Paths that answer with a status, or throw as an unreachable server does when the status is 0. */
    failures: new Map<string, number>(),
    /** Paths whose replies wait, each until the test calls the function it puts in the list. */
    held: new Map<string, Array<() => void>>(),
    posts: [] as Array<{ path: string; body: any }>,
    /** The lines the editor sent to the log, as level and message. */
    relayed: [] as string[]
  };
  /** A success, as JSON or as the page `replyType` names. */
  const reply200 = (body: unknown) =>
    server.replyType === "application/json"
      ? json(body)
      : new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": server.replyType } });
  /** While set, tag model replies wait until the test answers them, oldest first. */
  const heldModels: Array<() => void> = [];
  let holdModels = false;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (path === "/api/logs/client") {
      server.relayed.push(`${body.level} ${body.message}`);
      return json({});
    }
    server.posts.push({ path, body });
    steps.push(`post ${path}`);
    if (path === "/api/tag-editor/model") {
      const ids: string[] = body?.itemIds ?? [];
      const reply = { ...server.model, items: server.model.items.filter((item) => ids.includes(item.itemId)) };
      if (holdModels) {
        await new Promise<void>((resolve) => heldModels.push(resolve));
      }
      return server.modelStatus === 200 ? reply200(reply) : json({}, server.modelStatus);
    }
    if (path === "/api/autotag/scan") {
      if (server.scanStatus === 0) {
        throw new TypeError("Load failed");
      }
      return server.scanStatus === 200 ? reply200(server.scan) : json({}, server.scanStatus);
    }
    const waiting = server.held.get(path);
    if (waiting) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    const failure = server.failures.get(path);
    if (failure === 0) {
      throw new TypeError("Failed to fetch");
    }
    return failure ? json({}, failure) : json({ applied: [] });
  }) as typeof fetch;

  /** The one-off messages, which pop up and which the list keeps. */
  const notified: NotifyRequest[] = [];
  const notifications = {
    notify(request: NotifyRequest) {
      notified.push(request);
    }
  };
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: () => {}
  });
  const api = createAppApi("http://server", {
    onUnauthorized: () => {
      store.pairingRequired.value = true;
    },
    fetch: fetchImpl
  });

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

  /** The editor's memory on this device. */
  const remembered = memoryStorage();
  const localStorage = memoryStorage();
  if (options.scanFullLibrary !== undefined) {
    localStorage.setItem("rr_autoTagScanFullLibrary", options.scanFullLibrary);
  }
  const confirm = vi.fn(async (_request: ConfirmRequest) => true);
  /** The messages shown in the in-app notice, in order. */
  const notices: string[] = [];
  const notice = async (message: string) => {
    notices.push(message);
  };
  const editor = createTagEditor({
    store,
    api,
    connection,
    library: { session } as never,
    filter: { reviseTags: vi.fn() },
    device: createDeviceStore(remembered),
    localStorage,
    dialogs: { confirm, notice },
    notifications,
    newId: () => "new-category"
  });
  const view = () => editor.view.value!;
  const titles = () => view().categories?.map((category) => category.name) ?? [];
  const models = {
    hold() {
      holdModels = true;
    },
    /** Answers the held tag model requests in the order given, by their place among those held. */
    async answer(...order: number[]) {
      holdModels = false;
      const held = heldModels.splice(0);
      for (const index of order) {
        held[index]!();
        await settle();
      }
    }
  };
  /** The item ids each tag model request asked for. */
  const modelRequests = () => server.posts.filter((post) => post.path === "/api/tag-editor/model").map((post) => post.body.itemIds);
  return { editor, view, titles, store, server, notified, notices, steps, listeners, tiles, storedFilter, session, remembered, localStorage, confirm, models, modelRequests };
}

/** Lets fetch replies finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Sends the editor server events, as the connection does, each with `payload`, and lets the load they ask for gather
 * and arrive.
 */
async function serverEvents(context: ReturnType<typeof setup>, events: string[], payload: unknown = {}): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    for (const event of events) {
      context.listeners[event]?.(payload);
    }
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS);
  } finally {
    vi.useRealTimers();
  }
  await settle();
}

/** The confirmation asked, as the dialogs service gets it. */
function asked(message: string, confirmLabel: string): ConfirmRequest {
  return { message, confirmLabel, danger: true };
}

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
  it("loads the playing item's tags as it shows, and hides on close", async () => {
    const context = setup();
    const { editor, steps, server } = context;
    expect(editor.view.value).toBeNull();

    await openOn(context);
    expect(steps[0]).toBe("post /api/tag-editor/model");
    expect(editor.isOpen.value).toBe(true);
    expect(server.posts[0]!.body).toEqual({ itemIds: ["item-1"] });
    expect(context.titles()).toEqual(["Places", "People"]);

    editor.close();
    expect(editor.isOpen.value).toBe(false);
    editor.close();
    expect(editor.isOpen.value).toBe(false);
  });

  it("loads once the server is ready while it shows, keeping its changes, and not while it is hidden", async () => {
    const context = setup();
    const { editor, server, listeners } = context;
    // It showed while the server had no library, as a tab remembered open does, and loaded nothing.
    context.store.libraryState.value = "missing";
    await openOn(context);
    expect(server.posts).toEqual([]);
    context.store.libraryState.value = "ready";
    listeners.serverReady!(undefined);
    await settle();
    expect(context.modelRequests()).toEqual([["item-1"]]);
    expect(context.titles()).toEqual(["Places", "People"]);

    // The server restarted without its library while the tab held changes, and came back with it.
    editor.toggleTag("Bob", "add");
    context.store.libraryState.value = "newer";
    context.store.libraryState.value = "ready";
    listeners.serverReady!(undefined);
    await settle();
    expect(context.modelRequests()).toEqual([["item-1"], ["item-1"]]);
    expect(context.view().selections.get("bob")).toEqual({ action: "add", name: "Bob" });
    expect(context.view().savePending).toBe(true);

    // Hidden, it loads as it shows again.
    editor.close();
    listeners.serverReady!(undefined);
    await settle();
    expect(context.modelRequests()).toHaveLength(2);
    expect(context.notices).toEqual([]);
  });

  it("says why when the tags cannot load, and stays open", async () => {
    const context = setup();
    context.server.modelStatus = 500;
    await openOn(context);
    expect(context.notices).toEqual(["Tag editor unavailable: HTTP 500"]);
    expect(context.notified).toEqual([]);
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

  it("says Discard changes' load failed, and names the content type of tags that aren't JSON", async () => {
    const context = setup();
    await openOn(context);
    context.server.modelStatus = 503;
    context.editor.discardChanges();
    await settle();
    context.server.modelStatus = 200;
    context.server.replyType = "text/html";
    context.editor.discardChanges();
    await settle();
    expect(context.notices).toEqual([
      "Tag load failed: HTTP 503",
      "Tag load failed: The server sent an unexpected response (text/html)."
    ]);
    expect(context.notified).toEqual([]);
  });

  it("shows only the pairing prompt when the tags answer 401", async () => {
    const context = setup();
    context.server.modelStatus = 401;
    await openOn(context);
    context.editor.discardChanges();
    await serverEvents(context, ["tagCatalogChanged"]);
    expect(context.store.pairingRequired.value).toBe(true);
    expect(context.notices).toEqual([]);
    expect(context.notified).toEqual([]);
    expect(context.server.relayed).toEqual([]);
    expect(context.view().categories).toBeNull();
  });

  it("loads, saves, and scans nothing while the server fails the compatibility check", async () => {
    const context = setup();
    const { editor, server } = context;
    context.store.compatibilityBlocked.value = true;
    await openOn(context);
    expect(editor.isOpen.value).toBe(true);
    editor.discardChanges();
    await serverEvents(context, ["tagCatalogChanged", "resyncRequired"]);

    editor.addCategory();
    editor.typeNewCategoryName("Food");
    editor.saveNewCategory();
    expect(context.view().savePending).toBe(true);
    editor.save();
    await editor.scan();
    await settle();

    expect(server.posts).toEqual([]);
    expect(editor.isOpen.value).toBe(true);
  });

  it("keeps its changes, the new tag fields, the Edit Tag dialog's, Auto Tag's, and the categories expanded while it hides", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    editor.moveCategory("people", 0);
    editor.setViewAll(true);
    editor.typeNewTag("Sun");
    editor.chooseNewTagCategory("people");
    editor.editTag("Beach");
    editor.typeEditName("Shore");
    editor.cancelEdit();
    editor.toggleCategory("places");
    editor.close();
    expect(confirm).not.toHaveBeenCalled();

    await openOn(context);
    expect(context.view().selections.get("bob")).toEqual({ action: "add", name: "Bob" });
    expect(context.view().savePending).toBe(true);
    expect(context.titles()).toEqual(["People", "Places"]);
    expect(context.view().categories?.map((category) => [category.id, category.collapsed])).toEqual([
      ["people", true],
      ["places", false]
    ]);
    expect(context.view().autoTag).toMatchObject({ scanFull: false, viewAll: true, hasRun: false, status: "" });
    expect(context.view()).toMatchObject({ newTagName: "Sun", newTagCategoryId: "people", editing: false });
    expect(context.view().edit).toMatchObject({ name: "Shore", categoryId: "places" });
  });

  it("orders categories by the newest tags' sort order on each open and Discard changes, unless a category moved", async () => {
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
    context.editor.discardChanges();
    await settle();
    expect(context.titles()).toEqual(["Places", "People"]);

    context.editor.moveCategory("people", 0);
    context.editor.close();
    await openOn(context);
    expect(context.titles()).toEqual(["People", "Places"]);
  });

  it("Discard changes drops the changes at once, without asking, and loads the tags again", async () => {
    const context = setup();
    const { editor, confirm } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    editor.moveCategory("people", 0);
    editor.addCategory();
    editor.typeNewCategoryName("Food");
    editor.saveNewCategory();
    expect(context.view().savePending).toBe(true);
    expect(context.server.posts).toHaveLength(1);

    editor.discardChanges();
    expect(context.server.posts.at(-1)?.path).toBe("/api/tag-editor/model");
    expect(context.server.posts).toHaveLength(2);
    expect(context.view().selections.size).toBe(0);
    expect(context.view().savePending).toBe(false);
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(context.titles()).toEqual(["Places", "People"]);
    expect(context.view().savePending).toBe(false);
  });

  it("closing the editor or Discard changes closes its dialogs", async () => {
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
    editor.discardChanges();
    expect(context.view()).toMatchObject({ editing: false, categoryEdit: null, newCategory: null });
    await settle();

    openDialogs();
    editor.close();
    expect(context.view()).toMatchObject({ editing: false, categoryEdit: null, newCategory: null });
    expect(context.view().edit?.name).toBe("Bob");
  });
});

describe("following the playing item", () => {
  it("follows the playing item, loading its tags while it shows and when it next shows while hidden", async () => {
    const context = setup();
    const { editor, store } = context;
    context.server.model.items.push({ itemId: "item-2", tags: ["Bob"] });
    await openOn(context);
    expect(context.view().itemIds).toEqual(["item-1"]);

    store.current.value = OTHER;
    await settle();
    expect(context.modelRequests().at(-1)).toEqual(["item-2"]);
    expect(context.view().itemIds).toEqual(["item-2"]);
    expect(context.view().model?.items).toEqual([{ itemId: "item-2", tags: ["Bob"] }]);
    expect(context.view().heldName).toBeNull();

    // The same item again, as a replay, loads nothing.
    store.current.value = { ...OTHER };
    await settle();
    expect(context.modelRequests()).toHaveLength(2);

    editor.close();
    store.current.value = ITEM;
    await settle();
    expect(context.modelRequests()).toHaveLength(2);
    expect(context.view().itemIds).toEqual(["item-1"]);
    editor.open();
    await settle();
    expect(context.modelRequests().at(-1)).toEqual(["item-1"]);
  });

  it("takes the playing item at its first open, after items played before it", async () => {
    const context = setup();
    context.store.current.value = ITEM;
    context.store.current.value = OTHER;
    expect(context.editor.view.value).toBeNull();
    context.editor.open();
    await settle();
    expect(context.modelRequests()).toEqual([["item-2"]]);
  });

  it("holds its item while it has adds or removes, naming it, and follows once they are discarded", async () => {
    const context = setup();
    const { editor, store } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    store.current.value = OTHER;
    await settle();
    expect(context.view().itemIds).toEqual(["item-1"]);
    expect(context.view().heldName).toBe("clip.mp4");
    expect(context.modelRequests()).toHaveLength(1);

    // Playing the held item again ends the line, and playing another brings it back.
    store.current.value = ITEM;
    await settle();
    expect(context.view().heldName).toBeNull();
    store.current.value = OTHER;
    await settle();
    expect(context.view().heldName).toBe("clip.mp4");

    editor.discardChanges();
    await settle();
    expect(context.view().itemIds).toEqual(["item-2"]);
    expect(context.view().heldName).toBeNull();
    expect(context.modelRequests().at(-1)).toEqual(["item-2"]);
  });

  it("follows the playing item once its last add or remove is undone, or its tag deleted", async () => {
    const context = setup();
    const { editor, store } = context;
    context.server.model.items.push({ itemId: "item-2", tags: [] });
    await openOn(context);
    editor.toggleTag("Bob", "add");
    store.current.value = OTHER;
    await settle();
    expect(context.view().heldName).toBe("clip.mp4");

    editor.toggleTag("Bob", "add");
    await settle();
    expect(context.view().itemIds).toEqual(["item-2"]);
    expect(context.view().heldName).toBeNull();
    expect(context.modelRequests().at(-1)).toEqual(["item-2"]);

    editor.toggleTag("Bob", "add");
    store.current.value = ITEM;
    await settle();
    expect(context.view().heldName).toBe("other.mp4");
    editor.editTag("Bob");
    await editor.deleteEditedTag();
    await settle();
    expect(context.view().itemIds).toEqual(["item-1"]);
    expect(context.view().heldName).toBeNull();
    expect(context.modelRequests().at(-1)).toEqual(["item-1"]);
  });

  it("moves its held changes to a tag another client renamed, drops those on a tag it deleted, and loads the tags again", async () => {
    const context = setup();
    const { editor, server, store, listeners } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    editor.editTag("Bob");
    editor.chooseEditCategory("places");
    editor.saveEdit();
    editor.toggleTag("Beach", "remove");
    store.current.value = OTHER;
    await settle();
    const loads = context.modelRequests().length;
    const places = () => context.view().categories?.find((category) => category.id === "places")?.chips.map((chip) => [chip.name, chip.pending]);

    server.model.tags = [
      { name: "Beach", categoryId: "places" },
      { name: "Robert", categoryId: "people" }
    ];
    listeners.itemTagsChanged!({ resolvedItemIds: [], addedTags: ["Robert"], removedTags: ["Bob"], catalogReplacedTag: "Bob", catalogReplacementTag: "Robert" });
    await settle();
    expect(context.modelRequests()).toHaveLength(loads + 1);
    expect(context.modelRequests().at(-1)).toEqual(["item-1"]);
    expect(places()).toEqual([
      ["Beach", "remove"],
      ["Robert", "add"]
    ]);

    server.model.tags = [{ name: "Robert", categoryId: "people" }];
    server.model.items = [{ itemId: "item-1", tags: [] }];
    listeners.itemTagsChanged!({ resolvedItemIds: ["item-1"], addedTags: [], removedTags: ["Beach"], catalogReplacedTag: "Beach" });
    await settle();
    expect(places()).toEqual([["Robert", "add"]]);
    expect(context.view().heldName).toBe("clip.mp4");

    editor.save();
    await settle();
    const sent = server.posts.filter((post) => post.path !== "/api/tag-editor/model");
    expect(sent).toEqual([
      { path: "/api/tag-editor/rename-tag", body: { oldName: "Robert", newName: "Robert", newCategoryId: "places" } },
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-1"], addTags: ["Robert"], removeTags: [] } }
    ]);
  });

  it("holds its item until a save of its adds or removes lands, then follows and loads the tags again", async () => {
    const context = setup();
    const { editor, store, server } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    store.current.value = OTHER;
    await settle();

    editor.save();
    expect(context.view().selections.size).toBe(0);
    // Until the save lands, the editor stays on its item.
    expect(context.view().itemIds).toEqual(["item-1"]);
    expect(context.view().heldName).toBe("clip.mp4");
    await settle();
    const applyAt = server.posts.findIndex((post) => post.path === "/api/tag-editor/apply-item-tags");
    expect(server.posts[applyAt]!.body.itemIds).toEqual(["item-1"]);
    expect(server.posts.slice(applyAt + 1).map((post) => post.body.itemIds)).toEqual([["item-2"]]);
    expect(context.view().itemIds).toEqual(["item-2"]);
    expect(context.view().heldName).toBeNull();
  });

  it("isn't held by catalog changes or a category reorder", async () => {
    const context = setup();
    const { editor, store } = context;
    await openOn(context);
    editor.moveCategory("people", 0);
    editor.editCategory("places");
    editor.typeCategoryName("Spots");
    editor.saveCategoryEdit();
    store.current.value = OTHER;
    await settle();
    expect(context.view().itemIds).toEqual(["item-2"]);
    expect(context.view().heldName).toBeNull();
    expect(context.titles()).toEqual(["People", "Spots"]);
    expect(context.view().savePending).toBe(true);
  });

  it("takes only the latest tag load, so a slow reply for an earlier item can't land on a later one", async () => {
    const context = setup();
    const { store, models } = context;
    context.server.model.items.push({ itemId: "item-2", tags: ["Bob"] });
    await openOn(context);
    models.hold();
    store.current.value = OTHER;
    await settle();
    store.current.value = ITEM;
    await settle();
    // The later load answers first, then the earlier one.
    await models.answer(1, 0);
    expect(context.view().itemIds).toEqual(["item-1"]);
    expect(context.view().model?.items).toEqual([{ itemId: "item-1", tags: ["Beach"] }]);
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
    editor.discardChanges();
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
    expect(context.notified).toEqual([]);
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
  it("Add tag only creates the tag, expanding its category, and says which tag it created", async () => {
    const context = setup();
    const { editor, remembered } = context;
    await openOn(context);
    expect(context.view().categories?.find((category) => category.id === "people")?.collapsed).toBe(true);
    editor.chooseNewTagCategory("people");
    editor.typeNewTag("  Sunset ");
    expect(editor.addTag()).toBe("Sunset");
    expect(context.view().pending.upsertTags.get("sunset")).toEqual({ name: "Sunset", categoryId: "people" });
    expect(context.view().selections.size).toBe(0);
    expect(context.view().categories?.find((category) => category.id === "people")?.collapsed).toBe(false);
    expect(remembered.values.get("rr_device.tags.expandedCategories")).toBe('["people"]');
    expect(editor.addTag()).toBeNull();
  });
});

describe("saving", () => {
  it("updates the loaded tiles, stays open showing the changes as saved, sends the steps in order, says it applied, then loads the tags again", async () => {
    const context = setup();
    const { editor, steps, server, notified } = context;
    await openOn(context);
    editor.editTag("Bob");
    await editor.deleteEditedTag();
    editor.toggleTag("Beach", "remove");
    editor.toggleTag("Bob", "add");
    editor.toggleTag("Bob", "add");
    steps.length = 0;

    editor.save();
    expect(editor.isOpen.value).toBe(true);
    expect(steps).toEqual(["writeTags ", "post /api/tag-editor/delete-tag"]);
    // Before the server answers, the editor shows the changes as saved, with nothing left to save.
    expect(context.view().savePending).toBe(false);
    expect(context.titles()).toEqual(["Places", "People"]);
    expect(context.view().categories?.map((category) => category.chips)).toEqual([
      [{ name: "Beach", state: "state-none", pending: null, canChangeItems: true }],
      []
    ]);
    await settle();
    expect(server.posts.slice(1).map((post) => post.path)).toEqual([
      "/api/tag-editor/delete-tag",
      "/api/tag-editor/apply-item-tags",
      "/api/tag-editor/model"
    ]);
    expect(server.posts[2]!.body).toEqual({ itemIds: ["item-1"], addTags: [], removeTags: ["Beach"] });
    expect(notified).toEqual([APPLIED]);
    expect(context.session.reloadLoaded).not.toHaveBeenCalled();
  });

  it("loads the tags again after a save that fails, and only once the save lands", async () => {
    const context = setup();
    context.server.failures.set("/api/tag-editor/apply-item-tags", 500);
    await openOn(context);
    context.editor.toggleTag("Bob", "add");
    context.editor.save();
    expect(context.view().categories?.find((category) => category.id === "people")?.chips[0]?.state).toBe("state-all");
    expect(context.modelRequests()).toHaveLength(1);
    await settle();
    expect(context.modelRequests()).toHaveLength(2);
    expect(context.view().categories?.find((category) => category.id === "people")?.chips[0]?.state).toBe("state-none");
  });

  it("shows the tags as they were when a save fails and they can't load again", async () => {
    const context = setup();
    const bob = () => context.view().categories?.find((category) => category.id === "people")?.chips[0]?.state;
    context.server.failures.set("/api/tag-editor/apply-item-tags", 0);
    await openOn(context);
    context.editor.toggleTag("Bob", "add");
    context.server.modelStatus = 503;
    context.editor.save();
    expect(bob()).toBe("state-all");
    await settle();
    expect(context.modelRequests()).toHaveLength(2);
    expect(bob()).toBe("state-none");
  });

  it("drops a tag load sent before Save, so its reply can't show the changes undone", async () => {
    const context = setup();
    const { editor, store, models } = context;
    const places = () => context.view().categories?.find((category) => category.id === "places")?.chips.map((chip) => chip.name);
    await openOn(context);
    editor.editTag("Beach");
    editor.typeEditName("Shore");
    editor.saveEdit();
    models.hold();
    store.current.value = OTHER;
    await settle();
    editor.save();
    // Hidden, the editor doesn't load the tags again once the save lands, so only the earlier load's reply could change them.
    editor.close();
    await models.answer(0);
    expect(places()).toEqual(["Shore"]);
  });

  it("sends no tag load while a save is on its way, when the tab shows again, Discard changes runs, or a server event comes, and loads once it lands", async () => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.editTag("Beach");
    editor.typeEditName("Shore");
    editor.saveEdit();
    const loads = context.modelRequests().length;
    editor.save();
    editor.close();
    editor.open();
    editor.discardChanges();
    expect(context.view().categories?.find((category) => category.id === "places")?.chips.map((chip) => chip.name)).toEqual(["Shore"]);
    expect(context.modelRequests()).toHaveLength(loads);
    await serverEvents(context, ["tagCatalogChanged", "resyncRequired"]);
    expect(context.modelRequests()).toHaveLength(loads + 1);
  });

  it("says there is nothing to save when the changes cancel out, stays open, and drops them", async () => {
    const context = setup();
    await openOn(context);
    context.editor.moveCategory("people", 0);
    context.editor.moveCategory("people", 1);
    context.editor.editCategory("places");
    context.editor.typeCategoryName("Sights");
    context.editor.saveCategoryEdit();
    context.editor.editCategory("places");
    context.editor.typeCategoryName("Places");
    context.editor.saveCategoryEdit();
    expect(context.view().savePending).toBe(true);
    const posts = context.server.posts.length;
    context.editor.save();
    expect(context.notices).toEqual(["No tag changes to save."]);
    expect(context.notified).toEqual([]);
    expect(context.editor.isOpen.value).toBe(true);
    expect(context.view().savePending).toBe(false);
    expect(context.titles()).toEqual(["Places", "People"]);
    await settle();
    expect(context.server.posts).toHaveLength(posts);
  });

  it("puts the tiles back and names the step the server refused", async () => {
    const context = setup();
    context.server.failures.set("/api/tag-editor/apply-item-tags", 500);
    await openOn(context);
    context.editor.toggleTag("Beach", "remove");
    context.editor.save();
    expect(context.tiles[0]!.tags).toEqual([]);
    await settle();
    expect(context.notices).toEqual(["Tag apply failed (500)"]);
    expect(context.notified).toEqual([]);
    expect(context.tiles[0]!.tags).toEqual(["Beach"]);
  });

  it("shows each failed save's own error, whether the server refused it or couldn't be reached", async () => {
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
    expect(context.notices).toEqual([
      "Tag delete failed: Couldn't reach the server.",
      "Tag delete failed (409)",
      "Tag delete failed: Couldn't reach the server."
    ]);
    expect(context.notified).toEqual([]);
  });

  it("says a landed save applied even when the library's reload after it fails", async () => {
    const context = setup();
    const { editor, store, session } = context;
    store.appliedFilter.value = { ...createDefaultFilterState(), selectedTags: ["Beach"] };
    await openOn(context);
    session.reloadLoaded.mockRejectedValueOnce(new Error("Library load failed: HTTP 500"));
    editor.toggleTag("Bob", "add");
    editor.save();
    await settle();
    expect(session.reloadLoaded).toHaveBeenCalledTimes(1);
    expect(context.notified).toEqual([APPLIED]);
    expect(context.notices).toEqual([]);
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
    expect(store.activePresetId.value).toBe("preset-beach");
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

  it("loads, saves, scans, and applies Auto Tag's rows nothing while the server runs without a library, with no notice", async () => {
    const context = setup();
    const { editor, server } = context;
    server.scan = SCAN;
    context.store.libraryState.value = "unreadable";
    await openOn(context);
    expect(editor.isOpen.value).toBe(true);
    editor.discardChanges();
    await serverEvents(context, ["tagCatalogChanged", "resyncRequired"]);
    expect(server.posts).toEqual([]);
    expect(context.view().categories).toBeNull();

    // The server restarted without its library after the tab loaded and Auto Tag scanned.
    context.store.libraryState.value = "ready";
    editor.discardChanges();
    await settle();
    await editor.scan();
    editor.checkRow(0, true);
    editor.addCategory();
    editor.typeNewCategoryName("Food");
    editor.saveNewCategory();
    expect(context.view().savePending).toBe(true);
    expect(context.view().autoTagApplyPending).toBe(true);
    const posted = server.posts.length;
    context.store.libraryState.value = "unreadable";
    editor.save();
    editor.applyAutoTag();
    await editor.scan();
    await settle();

    expect(server.posts).toHaveLength(posted);
    expect(context.notices).toEqual([]);
    expect(context.notified).toEqual([]);
  });

  it("scans with Scan full library, stores the box, and applies the selected files with its own Apply, not Save", async () => {
    const context = setup();
    const { editor, server, localStorage, notified } = context;
    context.server.scan = SCAN;
    await openOn(context);
    editor.openAutoTag();
    expect(editor.autoTagOpen.value).toBe(true);
    editor.setScanFullLibrary(true);
    expect(localStorage.values.get("rr_autoTagScanFullLibrary")).toBe("true");
    await editor.scan();
    expect(server.posts.at(-1)).toEqual({ path: "/api/autotag/scan", body: { scanFullLibrary: true } });
    expect(context.view().autoTag.status).toBe("Scan complete: 1 matching tags, 1 matches, 0/1 selected changes.");
    expect(context.view().autoTagApplyPending).toBe(false);

    editor.checkRow(0, true);
    expect(context.view().autoTagApplyPending).toBe(true);
    expect(context.view().savePending).toBe(false);
    editor.applyAutoTag();
    // The file shows as having its tag at once, and Auto Tag stays open.
    expect(context.view().autoTag.rows[0]!.files[0]).toMatchObject({ needsChange: false, selected: false });
    expect(context.view().autoTag.status).toBe("Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.");
    expect(context.view().autoTagApplyPending).toBe(false);
    expect(editor.autoTagOpen.value).toBe(true);
    await settle();
    expect(server.posts.slice(-2)).toEqual([
      { path: "/api/autotag/apply", body: { assignments: [{ tagName: "Sunset", itemPaths: ["C:\\sunset.mp4"] }] } },
      // The item playing may have taken the tag, so the editor loads the tags again.
      { path: "/api/tag-editor/model", body: { itemIds: ["item-1"] } }
    ]);
    expect(notified).toEqual([APPLIED]);
  });

  it("starts with Scan full library as this browser last stored it, and scans with it", async () => {
    const context = setup({ scanFullLibrary: "true" });
    context.server.scan = SCAN;
    await openOn(context);
    expect(context.view().autoTag.scanFull).toBe(true);
    await context.editor.scan();
    expect(context.server.posts.at(-1)).toEqual({ path: "/api/autotag/scan", body: { scanFullLibrary: true } });
  });

  it("puts the rows back when the server refuses Apply, unless a new scan replaced them", async () => {
    const context = setup();
    const { editor, server } = context;
    server.scan = SCAN;
    server.failures.set("/api/autotag/apply", 500);
    await openOn(context);
    await editor.scan();
    editor.checkRow(0, true);
    editor.applyAutoTag();
    expect(context.view().autoTag.rows[0]!.files[0]!.needsChange).toBe(false);
    await settle();
    expect(context.notices).toEqual(["Auto-tag apply failed (500)"]);
    expect(context.notified).toEqual([]);
    expect(context.view().autoTag.rows[0]!.files[0]).toMatchObject({ needsChange: true, selected: true });
    expect(context.view().autoTagApplyPending).toBe(true);

    // A refusal that lands after a new scan leaves its rows alone, even a row in the same place listing the same file
    // as already tagged, which the refusal would otherwise mark as needing its tag, selected.
    const replies: Array<() => void> = [];
    server.held.set("/api/autotag/apply", replies);
    editor.applyAutoTag();
    server.scan = {
      rows: [{ ...SCAN.rows[0]!, tagName: "Sun", wouldChangeCount: 0, files: [{ ...SCAN.rows[0]!.files[0]!, needsChange: false }] }]
    };
    await editor.scan();
    replies.forEach((reply) => reply());
    await settle();
    expect(context.notices).toEqual(["Auto-tag apply failed (500)", "Auto-tag apply failed (500)"]);
    expect(context.view().autoTag.rows[0]).toMatchObject({ tagName: "Sun", wouldChangeCount: 0 });
    expect(context.view().autoTag.rows[0]!.files[0]).toMatchObject({ needsChange: false, selected: false });
    expect(context.view().autoTagApplyPending).toBe(false);
  });

  it("puts the rows back when the server refuses Apply after a row changed meanwhile, keeping that change", async () => {
    const context = setup();
    const { editor, server } = context;
    server.scan = SCAN;
    server.failures.set("/api/autotag/apply", 500);
    await openOn(context);
    await editor.scan();
    editor.checkRow(0, true);
    editor.applyAutoTag();
    editor.toggleRowExpanded(0);
    await settle();
    expect(context.view().autoTag.rows[0]).toMatchObject({ expanded: true, wouldChangeCount: 1 });
    expect(context.view().autoTag.rows[0]!.files[0]).toMatchObject({ needsChange: true, selected: true });
    expect(context.view().autoTagApplyPending).toBe(true);
  });

  it("clears a kept scan once a tag is renamed or deleted, by a save here or by another client", async () => {
    const context = setup();
    const { editor, server, listeners } = context;
    server.scan = SCAN;
    await openOn(context);
    editor.openAutoTag();
    await editor.scan();
    editor.closeAutoTag();

    // A save of item tags alone keeps it.
    editor.toggleTag("Bob", "add");
    editor.save();
    await settle();
    expect(context.view().autoTag.hasRun).toBe(true);

    editor.editTag("Beach");
    editor.typeEditName("Shore");
    editor.saveEdit();
    editor.save();
    await settle();
    expect(context.view().autoTag).toMatchObject({ hasRun: false, rows: [], status: "" });
    expect(context.view().results).toEqual({ kind: "placeholder", text: "Scan to find files whose names contain a tag's name." });

    await editor.scan();
    expect(context.view().autoTag.hasRun).toBe(true);
    listeners.itemTagsChanged!({ resolvedItemIds: ["s1"], addedTags: [], removedTags: ["Sunset"], catalogReplacedTag: "Sunset" });
    expect(context.view().autoTag).toMatchObject({ hasRun: false, rows: [] });
  });

  it("keeps a kept scan when a save only moves a tag to another category", async () => {
    const context = setup();
    const { editor, server } = context;
    server.scan = SCAN;
    await openOn(context);
    await editor.scan();

    editor.editTag("Beach");
    editor.chooseEditCategory("people");
    editor.saveEdit();
    editor.save();
    await settle();
    expect(server.posts.some((post) => post.path === "/api/tag-editor/rename-tag")).toBe(true);
    expect(context.view().autoTag).toMatchObject({ hasRun: true, rows: [expect.objectContaining({ tagName: "Sunset" })] });
  });

  it("clears a kept scan when another client's catalog change drops one of its tags, by name ignoring case", async () => {
    const context = setup();
    const { editor, server, listeners } = context;
    server.scan = SCAN;
    await openOn(context);
    await editor.scan();
    const tags = (...names: string[]) => names.map((name) => ({ name, categoryId: "" }));

    // A change that keeps its tags, such as a rename of another tag or one that only changes the case, keeps it.
    listeners.tagCatalogChanged!({ reason: "renameTag", categories: [], tags: tags("Beach", "Bob", "sunset") });
    expect(context.view().autoTag.hasRun).toBe(true);
    // A reply it can't read keeps it too.
    listeners.tagCatalogChanged!({ reason: "renameTag" });
    expect(context.view().autoTag.hasRun).toBe(true);

    listeners.tagCatalogChanged!({ reason: "deleteTag", categories: [], tags: tags("Beach", "Bob") });
    expect(context.view().autoTag).toMatchObject({ hasRun: false, rows: [] });
  });

  it("X closes and keeps the scan, Cancel clears it and closes, and neither does anything while a scan runs", async () => {
    const context = setup();
    const { editor, server } = context;
    server.scan = SCAN;
    await openOn(context);
    editor.openAutoTag();
    await editor.scan();
    editor.closeAutoTag();
    expect(editor.autoTagOpen.value).toBe(false);
    editor.openAutoTag();
    expect(context.view().autoTag).toMatchObject({ hasRun: true, rows: [expect.objectContaining({ tagName: "Sunset" })] });

    const scan = editor.scan();
    editor.closeAutoTag();
    editor.cancelAutoTag();
    expect(editor.autoTagOpen.value).toBe(true);
    expect(context.view().autoTag.scanning).toBe(true);
    await scan;

    editor.cancelAutoTag();
    expect(editor.autoTagOpen.value).toBe(false);
    expect(context.view().autoTag).toMatchObject({ hasRun: false, rows: [], status: "" });
    expect(context.view().results).toEqual({ kind: "placeholder", text: "Scan to find files whose names contain a tag's name." });
  });

  it.each([
    ["the server refuses it", 500, "application/json", "Scan failed: HTTP 500"],
    ["it can't reach the server", 0, "application/json", "Scan failed: Couldn't reach the server."],
    // A 401 shows nothing in place, since the pairing prompt is the only thing to show.
    ["the server answers 401", 401, "application/json", ""],
    ["the reply isn't JSON", 200, "text/html", "Scan failed: The server sent an unexpected response (text/html)."]
  ])("shows a failed scan's error in place, with nothing to apply, when %s", async (_name, status, type, error) => {
    const context = setup();
    const { editor, server } = context;
    server.scan = SCAN;
    await openOn(context);
    editor.openAutoTag();
    await editor.scan();
    editor.checkRow(0, true);
    expect(context.view().autoTagApplyPending).toBe(true);

    server.scanStatus = status;
    server.replyType = type;
    await editor.scan();
    expect(context.view().autoTag).toMatchObject({ scanning: false, hasRun: false, rows: [], status: error });
    expect(context.view().results).toEqual({ kind: "placeholder", text: "Scan to find files whose names contain a tag's name." });
    expect(context.view().autoTagApplyPending).toBe(false);
    expect(context.store.pairingRequired.value).toBe(status === 401);
    expect(context.notices).toEqual([]);
    expect(context.notified).toEqual([]);

    // A selection change keeps the error, and Cancel clears it.
    editor.setViewAll(true);
    editor.selectAll();
    expect(context.view().autoTag.status).toBe(error);
    editor.cancelAutoTag();
    expect(context.view().autoTag.status).toBe("");
  });

  it("clears a failed scan's error with the next scan", async () => {
    const context = setup();
    const { editor, server } = context;
    server.scanStatus = 500;
    await openOn(context);
    await editor.scan();
    expect(context.view().autoTag.status).toBe("Scan failed: HTTP 500");

    server.scanStatus = 200;
    server.scan = SCAN;
    const scan = editor.scan();
    expect(context.view().autoTag.status).toBe("Scanning…");
    await scan;
    expect(context.view().autoTag.status).toMatch(/^Scan complete: 1 matching tags/);
    expect(context.view().autoTag.hasRun).toBe(true);
  });

  it("shows the scan's summary in place of Scanning… when every match already has its tag", async () => {
    const context = setup();
    context.server.scan = { rows: [{ ...SCAN.rows[0], wouldChangeCount: 0, files: [{ ...SCAN.rows[0]!.files[0], needsChange: false }] }] };
    await openOn(context);
    await context.editor.scan();
    expect(context.view().autoTag.status).toBe("Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.");
    expect(context.view().results).toEqual({ kind: "hint", text: "No rows to show." });

    // A selection change while no row shows keeps the summary.
    context.editor.selectAll();
    expect(context.view().autoTag.status).toBe("Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.");
  });
});

describe("server events", () => {
  it.each(["tagCatalogChanged", "resyncRequired"])("%s loads the tags again while it shows without changes", async (event) => {
    const context = setup();
    await openOn(context);
    context.server.model.tags.push({ name: "Alice", categoryId: "people" });
    const loads = context.modelRequests().length;

    await serverEvents(context, [event]);

    expect(context.modelRequests()).toHaveLength(loads + 1);
    expect(context.modelRequests().at(-1)).toEqual(["item-1"]);
    expect(context.view().categories?.find((category) => category.id === "people")?.chips.map((chip) => chip.name)).toEqual(["Alice", "Bob"]);
    expect(context.notices).toEqual([]);
  });

  it.each(["tagCatalogChanged", "resyncRequired"])("%s keeps the changes and loads nothing while it has some", async (event) => {
    const context = setup();
    const { editor } = context;
    await openOn(context);
    editor.toggleTag("Bob", "add");
    editor.moveCategory("people", 0);
    context.server.model.tags.push({ name: "Alice", categoryId: "people" });
    const loads = context.modelRequests().length;

    await serverEvents(context, [event]);

    expect(context.modelRequests()).toHaveLength(loads);
    expect(context.view().selections.get("bob")).toEqual({ action: "add", name: "Bob" });
    expect(context.titles()).toEqual(["People", "Places"]);
    expect(context.view().savePending).toBe(true);
    expect(context.view().categories?.find((category) => category.id === "people")?.chips.map((chip) => chip.name)).toEqual(["Bob"]);
  });

  it("loads nothing while hidden, and loads as it shows again", async () => {
    const context = setup();
    await openOn(context);
    context.editor.close();
    const loads = context.modelRequests().length;

    await serverEvents(context, ["tagCatalogChanged", "resyncRequired"]);
    expect(context.modelRequests()).toHaveLength(loads);

    await openOn(context);
    expect(context.modelRequests()).toHaveLength(loads + 1);
  });

  it("loads once for a burst of events", async () => {
    const context = setup();
    await openOn(context);
    const loads = context.modelRequests().length;

    await serverEvents(context, ["tagCatalogChanged", "resyncRequired", "tagCatalogChanged", "tagCatalogChanged"]);

    expect(context.modelRequests()).toHaveLength(loads + 1);
  });

  it("a load that fails keeps what the tab shows, says nothing, and logs one line with only the status or the error's kind", async () => {
    const context = setup();
    await openOn(context);
    context.server.modelStatus = 503;

    await serverEvents(context, ["tagCatalogChanged"]);
    expect(context.server.relayed).toEqual(["warn tags=event-load-failed status=503"]);

    context.server.modelStatus = 200;
    context.server.replyType = "text/html";
    await serverEvents(context, ["resyncRequired"]);
    expect(context.server.relayed).toEqual(["warn tags=event-load-failed status=503", "warn tags=event-load-failed error=UnexpectedResponseError"]);

    expect(context.notices).toEqual([]);
    expect(context.notified).toEqual([]);
    expect(context.titles()).toEqual(["Places", "People"]);
  });
});
