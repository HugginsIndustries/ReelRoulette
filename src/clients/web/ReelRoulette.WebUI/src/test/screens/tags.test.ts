// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeServer, json, mountPage, normalizedMarkup, resetPage, settle, status, type MountedPage } from "./pageHarness";

interface TagModel {
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  tags: Array<{ name: string; categoryId: string }>;
  items: Array<{ itemId: string; tags: string[] }>;
}

/** Categories in the server's order. "Loose" has no category, so the editor shows Uncategorized last. */
const TAG_MODEL: TagModel = {
  categories: [
    { id: "cat-places", name: "Places", sortOrder: 0 },
    { id: "cat-mood", name: "Mood", sortOrder: 1 },
    { id: "cat-people", name: "People", sortOrder: 2 }
  ],
  tags: [
    { name: "Beach", categoryId: "cat-places" },
    { name: "alps", categoryId: "cat-places" },
    { name: "Bob", categoryId: "cat-people" },
    { name: "Alice", categoryId: "cat-people" },
    { name: "Calm", categoryId: "cat-mood" },
    { name: "Loose", categoryId: "" }
  ],
  items: [{ itemId: "item-video", tags: ["Beach", "Bob"] }]
};

const VIDEO_ITEM = {
  id: "C:\\media\\holiday clip.mp4",
  itemId: "item-video",
  displayName: "holiday clip.mp4",
  mediaType: "video",
  durationSeconds: 65,
  mediaUrl: "/api/media/item-video?token=t",
  isFavorite: false,
  isBlacklisted: false
};

/** "Empty" has no files and is dropped; "Alps" has nothing to change and shows only with View all. */
const SCAN = {
  rows: [
    {
      tagName: "Sunset",
      totalMatchedCount: 2,
      wouldChangeCount: 1,
      files: [
        { itemId: "item-3", fullPath: "C:\\media\\sunset 1.mp4", displayPath: "sunset 1.mp4", needsChange: true },
        { itemId: "item-4", fullPath: "C:\\media\\sunset 2.mp4", displayPath: "sunset 2.mp4", needsChange: false }
      ]
    },
    {
      tagName: "beach",
      totalMatchedCount: 3,
      wouldChangeCount: 2,
      files: [
        { itemId: "item-1", fullPath: "C:\\media\\beach a.mp4", displayPath: "beach a.mp4", needsChange: true },
        { itemId: "item-2", fullPath: "C:\\media\\beach b.mp4", displayPath: "beach b.mp4", needsChange: true },
        { itemId: "item-5", fullPath: "C:\\media\\beach c.mp4", displayPath: "beach c.mp4", needsChange: false }
      ]
    },
    {
      tagName: "Alps",
      totalMatchedCount: 1,
      wouldChangeCount: 0,
      files: [{ itemId: "item-6", fullPath: "C:\\media\\alps.mp4", displayPath: "alps.mp4", needsChange: false }]
    },
    { tagName: "Empty", totalMatchedCount: 0, wouldChangeCount: 0, files: [] }
  ]
};

const BEACH_PRESET = {
  id: "preset-beach",
  name: "Beach days",
  filterState: { selectedTags: ["Beach"], excludedTags: [], includedSourceIds: [] }
};

/** The requests a tag editor save sends, in the order the editor sends them. */
const SAVE_PATHS = [
  "/api/tag-editor/upsert-category",
  "/api/tag-editor/delete-category",
  "/api/tag-editor/upsert-tag",
  "/api/tag-editor/rename-tag",
  "/api/tag-editor/delete-tag",
  "/api/tag-editor/apply-item-tags",
  "/api/autotag/apply"
];

/** The fake server's tag catalog, scan, and save routes. Tests change them, fail them, and hold their replies. */
interface FakeTags {
  model: TagModel;
  modelStatus: number;
  scan: unknown;
  scanStatus: number;
  /** Save paths that answer with a status, or throw as an unreachable server does when the status is 0. */
  failures: Map<string, number>;
  /** While set, scan and save replies wait until `release`. */
  holding: boolean;
  release(): Promise<void>;
  modelRequests(): any[];
  scans(): any[];
  /** The save requests the page sent, oldest first. */
  saves(): Array<{ path: string; body: any }>;
}

function serveTags(server: FakeServer): FakeTags {
  const held: Array<() => void> = [];
  const tags: FakeTags = {
    model: structuredClone(TAG_MODEL),
    modelStatus: 200,
    scan: SCAN,
    scanStatus: 200,
    failures: new Map(),
    holding: false,
    async release() {
      tags.holding = false;
      for (const resolve of held.splice(0)) {
        resolve();
      }
      await settle();
    },
    modelRequests: () => server.requests("POST", "/api/tag-editor/model").map((call) => call.body),
    scans: () => server.requests("POST", "/api/autotag/scan").map((call) => call.body),
    saves: () =>
      server.calls.filter((call) => call.method === "POST" && SAVE_PATHS.includes(call.path)).map((call) => ({ path: call.path, body: call.body }))
  };
  const hold = async () => {
    if (tags.holding) {
      await new Promise<void>((resolve) => held.push(resolve));
    }
  };
  server.on("POST", "/api/tag-editor/model", (call) => {
    if (tags.modelStatus !== 200) {
      return status(tags.modelStatus);
    }
    const ids: string[] = call.body?.itemIds ?? [];
    return json({ ...tags.model, items: tags.model.items.filter((item) => ids.includes(item.itemId)) });
  });
  server.on("POST", "/api/autotag/scan", async () => {
    await hold();
    return tags.scanStatus === 200 ? json(tags.scan) : status(tags.scanStatus);
  });
  for (const path of SAVE_PATHS) {
    server.on("POST", path, async (call) => {
      await hold();
      const failure = tags.failures.get(path);
      if (failure === 0) {
        throw new TypeError("Failed to fetch");
      }
      if (failure) {
        return status(failure);
      }
      if (path === "/api/autotag/apply") {
        const assignments: Array<{ tagName: string; itemPaths: string[] }> = call.body?.assignments ?? [];
        return json({
          assignmentsAdded: assignments.length,
          changedItemPaths: [],
          changedItemIds: [],
          applied: assignments.map((assignment) => ({ tagName: assignment.tagName, changedItemPaths: assignment.itemPaths, changedItemIds: [] }))
        });
      }
      return json({});
    });
  }
  return tags;
}

interface TagPage {
  page: MountedPage;
  server: FakeServer;
  tags: FakeTags;
}

/** Mounts the page against the tag catalog above and, unless `play` is false, plays the video it tags. */
async function mountTags(
  options: { play?: boolean; setup?: (server: FakeServer, tags: FakeTags) => void } = {}
): Promise<TagPage> {
  const server = new FakeServer();
  const tags = serveTags(server);
  server.on("POST", "/api/random", () => json(VIDEO_ITEM));
  server.on("GET", "/api/sources", () => json([]));
  options.setup?.(server, tags);
  const page = mountPage({ server });
  await screen.findByText("Ready (API 1)");
  await settle();
  if (options.play !== false) {
    await click(screen.getByText("Click here to play (choose a preset or open Filter…)"));
    await waitFor(() => expect((document.getElementById("video") as HTMLVideoElement).src).toContain("/api/media/item-video"));
  }
  return { page, server, tags };
}

const dialogs = {
  confirm: vi.fn((_message: string): boolean => true),
  prompt: vi.fn((_message: string, _value?: string): string | null => null),
  alert: vi.fn((_message: string): void => {})
};

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

async function typeInto(element: Element, text: string): Promise<void> {
  fireEvent.input(element, { target: { value: text } });
  await settle();
}

async function choose(select: Element, value: string): Promise<void> {
  fireEvent.change(select, { target: { value } });
  await settle();
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function editor(): HTMLElement {
  return byId("tag-editor");
}

function isOpen(): boolean {
  return editor().style.display === "flex";
}

async function openEditor(): Promise<void> {
  await click(screen.getByRole("button", { name: "Edit Tags" }));
  expect(isOpen()).toBe(true);
}

function headerButton(name: "Refresh" | "Close"): HTMLButtonElement {
  return within(editor().querySelector(".tag-editor-header") as HTMLElement).getByRole("button", { name }) as HTMLButtonElement;
}

function saveButton(): HTMLButtonElement {
  return byId<HTMLButtonElement>("tag-editor-apply-btn");
}

/** Save is enabled and marked while there is something to save. */
function savePending(): boolean {
  const pending = saveButton().classList.contains("has-pending");
  if (pending === saveButton().disabled) {
    throw new Error("Save is marked pending but disabled, or the reverse.");
  }
  return pending;
}

async function save(): Promise<void> {
  await click(saveButton());
}

async function showTab(name: "Edit Tags" | "Auto Tag"): Promise<void> {
  await click(within(editor()).getByRole("tab", { name }));
}

function selectedTab(): string {
  return within(editor()).getByRole("tab", { selected: true }).textContent ?? "";
}

function body(): HTMLElement {
  return byId("tag-editor-body");
}

function category(title: string): HTMLElement {
  const found = Array.from(body().querySelectorAll<HTMLElement>(".tag-editor-category")).find(
    (candidate) => candidate.querySelector(".tag-editor-category-title")?.textContent === title
  );
  if (!found) {
    throw new Error(`No tag category named ${title}.`);
  }
  return found;
}

function categoryTitles(): string[] {
  return Array.from(body().querySelectorAll(".tag-editor-category-title")).map((node) => node.textContent ?? "");
}

function chipNames(title: string): string[] {
  return Array.from(category(title).querySelectorAll(".tag-chip-label")).map((node) => node.textContent ?? "");
}

function categoryButton(title: string, label: string): HTMLButtonElement {
  return within(category(title)).getAllByTitle(label)[0] as HTMLButtonElement;
}

function categoryGrid(title: string): HTMLElement {
  return category(title).querySelector(".tag-editor-tag-grid") as HTMLElement;
}

function chip(name: string): HTMLElement {
  const found = Array.from(body().querySelectorAll<HTMLElement>(".tag-chip")).find(
    (candidate) => candidate.querySelector(".tag-chip-label")?.textContent === name
  );
  if (!found) {
    throw new Error(`No tag chip named ${name}.`);
  }
  return found;
}

function chipButton(name: string, label: "Add tag" | "Remove tag" | "Edit tag" | "Delete tag"): HTMLButtonElement {
  return within(chip(name)).getByTitle(label) as HTMLButtonElement;
}

/** Whether the playing item has the tag, and the change the editor holds for it. */
function chipState(name: string): { has: "all" | "some" | "none"; pending: "add" | "remove" | null } {
  const element = chip(name);
  const has = element.classList.contains("state-all") ? "all" : element.classList.contains("state-some") ? "some" : "none";
  const add = chipButton(name, "Add tag").classList.contains("is-selected");
  const remove = chipButton(name, "Remove tag").classList.contains("is-selected");
  if (add && remove) {
    throw new Error(`Tag chip ${name} holds both changes.`);
  }
  return { has, pending: add ? "add" : remove ? "remove" : null };
}

function footerCategory(): HTMLSelectElement {
  return byId<HTMLSelectElement>("tag-editor-category-select");
}

function optionLabels(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.textContent ?? "");
}

function newTagField(): HTMLInputElement {
  return within(editor()).getByPlaceholderText("New tag name") as HTMLInputElement;
}

async function addTag(name: string, categoryId?: string): Promise<void> {
  if (categoryId) {
    await choose(footerCategory(), categoryId);
  }
  await typeInto(newTagField(), name);
  await click(within(editor()).getByRole("button", { name: "Add tag" }));
}

function modal(): HTMLElement {
  return byId("tag-edit-modal");
}

function modalOpen(): boolean {
  return modal().style.display === "flex";
}

function modalName(): HTMLInputElement {
  return within(modal()).getByLabelText("Tag Name") as HTMLInputElement;
}

function modalCategory(): HTMLSelectElement {
  return within(modal()).getByLabelText("Category") as HTMLSelectElement;
}

function modalButton(name: "Cancel" | "Save"): HTMLButtonElement {
  return within(modal()).getByRole("button", { name }) as HTMLButtonElement;
}

function statusLine(): string {
  return byId("status")?.textContent ?? "";
}

function autoTagStatus(): string {
  return byId("tag-autotag-status").textContent ?? "";
}

function results(): HTMLElement {
  return byId("tag-autotag-results");
}

function progressShown(): boolean {
  return byId("tag-autotag-progress").style.display === "block";
}

function scanButton(): HTMLButtonElement {
  return within(editor()).getByRole("button", { name: "Scan Files" }) as HTMLButtonElement;
}

async function scan(): Promise<void> {
  await click(scanButton());
}

function autoTagBox(label: "Scan full library" | "View all matches"): HTMLInputElement {
  return within(editor()).getByLabelText(label) as HTMLInputElement;
}

function row(tagName: string): HTMLElement {
  const found = Array.from(results().querySelectorAll<HTMLElement>(".tag-autotag-row")).find(
    (candidate) => rowCells(candidate)[0] === tagName
  );
  if (!found) {
    throw new Error(`No Auto Tag row for ${tagName}.`);
  }
  return found;
}

/** The tag name, total matched, and to-be-changed count a row shows. */
function rowCells(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll(".tag-autotag-row-main > span")).map((node) => node.textContent ?? "");
}

function rowNames(): string[] {
  return Array.from(results().querySelectorAll<HTMLElement>(".tag-autotag-row")).map((element) => rowCells(element)[0]!);
}

function rowCheck(tagName: string): HTMLInputElement {
  return row(tagName).querySelector(".tag-autotag-row-main input[type=checkbox]") as HTMLInputElement;
}

function rowFiles(tagName: string): HTMLElement {
  return row(tagName).querySelector(".tag-autotag-row-files") as HTMLElement;
}

function fileNames(tagName: string): string[] {
  return Array.from(rowFiles(tagName).querySelectorAll(".tag-autotag-file-path")).map((node) => node.textContent ?? "");
}

function fileCheck(tagName: string, displayPath: string): HTMLInputElement {
  const found = Array.from(rowFiles(tagName).querySelectorAll<HTMLElement>(".tag-autotag-file-row")).find(
    (candidate) => candidate.querySelector(".tag-autotag-file-path")?.textContent === displayPath
  );
  if (!found) {
    throw new Error(`No file ${displayPath} under ${tagName}.`);
  }
  return found.querySelector("input") as HTMLInputElement;
}

async function expand(tagName: string): Promise<void> {
  await click(within(row(tagName)).getByRole("button", { name: "Expand" }));
}

function libraryQueries(server: FakeServer): any[] {
  return server.requests("POST", "/api/library/query").map((call) => call.body);
}

/** Asks for a random pick with Next and returns what it sent. */
async function nextPick(server: FakeServer): Promise<any> {
  await click(screen.getByRole("button", { name: "Next" }));
  const picks = server.requests("POST", "/api/random");
  return picks[picks.length - 1]!.body;
}

function headerPresetSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Choose preset" }) as HTMLSelectElement;
}

function headerSelectedLabel(): string {
  const select = headerPresetSelect();
  return select.options[select.selectedIndex]?.textContent ?? "";
}

async function pickHeaderPreset(id: string): Promise<void> {
  await waitFor(() => expect(Array.from(headerPresetSelect().options).map((option) => option.value)).toContain(id));
  fireEvent.change(headerPresetSelect(), { target: { value: id } });
  await settle();
}

/** A library of the playing item and one more, so tag saves have loaded tiles. */
function serveLibrary(server: FakeServer): void {
  const tile = (id: string, tags: string[]) => ({
    id,
    sourceId: "source-1",
    fileName: `${id}.mp4`,
    fullPath: `C:\\media\\${id}.mp4`,
    relativePath: `${id}.mp4`,
    mediaType: 0,
    durationSeconds: 60,
    playCount: 0,
    isFavorite: false,
    isBlacklisted: false,
    tags,
    hasThumbnail: false,
    thumbnailWidth: 1920,
    thumbnailHeight: 1080
  });
  server.on("POST", "/api/library/query", () =>
    json({ items: [tile("item-video", ["Beach", "Bob"]), tile("item-2", ["Beach"])], totalCount: 2, searchBaselineCount: 2 })
  );
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    keys.push(storage.key(i) ?? "");
  }
  return keys.sort();
}

beforeEach(() => {
  resetPage();
  dialogs.confirm.mockReset().mockReturnValue(true);
  dialogs.prompt.mockReset().mockReturnValue(null);
  dialogs.alert.mockReset();
  vi.stubGlobal("confirm", dialogs.confirm);
  vi.stubGlobal("prompt", dialogs.prompt);
  vi.stubGlobal("alert", dialogs.alert);
});

describe("opening and closing", () => {
  it("opens on Edit Tags after loading the tags of the playing item, or of no item when nothing plays", async () => {
    const { tags } = await mountTags({ play: false });
    expect(isOpen()).toBe(false);

    await openEditor();
    expect(tags.modelRequests()).toEqual([{ itemIds: [] }]);
    expect(selectedTab()).toBe("Edit Tags");
    expect(byId("tag-editor-panel-edit").style.display).toBe("flex");
    expect(byId("tag-editor-panel-autotag").style.display).toBe("none");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    expect(savePending()).toBe(false);

    await click(headerButton("Close"));
    expect(isOpen()).toBe(false);
    await click(screen.getByText("Click here to play (choose a preset or open Filter…)"));
    await openEditor();
    expect(tags.modelRequests()[1]).toEqual({ itemIds: ["item-video"] });
    expect(chipState("Beach").has).toBe("all");
  });

  it("closes without asking when nothing changed, and asks before dropping changes", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(headerButton("Close"));
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(isOpen()).toBe(false);

    await openEditor();
    await click(chipButton("Calm", "Add tag"));
    dialogs.confirm.mockReturnValue(false);
    await click(headerButton("Close"));
    expect(dialogs.confirm).toHaveBeenCalledWith("Discard changes?");
    expect(isOpen()).toBe(true);
    expect(chipState("Calm").pending).toBe("add");

    dialogs.confirm.mockReturnValue(true);
    await click(headerButton("Close"));
    expect(isOpen()).toBe(false);
    expect(tags.saves()).toEqual([]);
    await openEditor();
    expect(chipState("Calm").pending).toBe(null);
    expect(savePending()).toBe(false);
    expect(tags.modelRequests()).toHaveLength(3);
  });

  it("opens on Edit Tags each time, with Scan full library as last set and View all matches off", async () => {
    await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    expect(selectedTab()).toBe("Auto Tag");
    expect(byId("tag-editor-panel-edit").style.display).toBe("none");
    expect(byId("tag-editor-panel-autotag").style.display).toBe("flex");
    await click(autoTagBox("Scan full library"));
    await click(autoTagBox("View all matches"));
    await click(headerButton("Close"));

    await openEditor();
    expect(selectedTab()).toBe("Edit Tags");
    expect(byId("tag-editor-panel-edit").style.display).toBe("flex");
    expect(byId("tag-editor-panel-autotag").style.display).toBe("none");
    expect(autoTagBox("Scan full library").checked).toBe(true);
    expect(autoTagBox("View all matches").checked).toBe(false);
  });

  it("stays open and says why when the tags cannot load", async () => {
    const { tags } = await mountTags({ setup: (_server, fake) => (fake.modelStatus = 500) });
    await openEditor();
    expect(statusLine()).toBe("Tag editor unavailable: tag-model:500");
    expect(body().textContent).toBe("");

    tags.modelStatus = 200;
    await click(headerButton("Refresh"));
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    tags.modelStatus = 503;
    await click(headerButton("Refresh"));
    expect(statusLine()).toBe("Tag refresh failed: tag-model:503");
    expect(isOpen()).toBe(true);
  });

  it("keeps its markup on each tab and in the Edit Tag dialog", async () => {
    sessionStorage.setItem("rr_tagEditorCollapsed", JSON.stringify(["cat-mood"]));
    await mountTags();
    await openEditor();
    await click(chipButton("alps", "Add tag"));
    await click(chipButton("Bob", "Remove tag"));
    expect(normalizedMarkup(editor(), { liveFormState: true })).toMatchSnapshot("edit tags");

    await click(chipButton("Beach", "Edit tag"));
    expect(normalizedMarkup(modal(), { liveFormState: true })).toMatchSnapshot("edit tag dialog");
    await click(modalButton("Cancel"));

    await showTab("Auto Tag");
    await scan();
    await expand("beach");
    await click(fileCheck("beach", "beach a.mp4"));
    expect(normalizedMarkup(editor(), { liveFormState: true })).toMatchSnapshot("auto tag");
  });

  it("shows category, tag, and file names as text", async () => {
    await mountTags({
      setup: (_server, tags) => {
        tags.model = {
          categories: [{ id: "cat-x", name: "<em>Places</em>", sortOrder: 0 }],
          tags: [{ name: "<i>Beach</i>", categoryId: "cat-x" }],
          items: []
        };
        tags.scan = {
          rows: [
            {
              tagName: "<u>Sun</u>",
              totalMatchedCount: 1,
              wouldChangeCount: 1,
              files: [{ itemId: "item-1", fullPath: "C:\\<s>sun</s>.mp4", displayPath: "<b>sun</b>.mp4", needsChange: true }]
            }
          ]
        };
      }
    });
    await openEditor();
    expect(within(body()).getByText("<em>Places</em>")).toBeTruthy();
    expect(within(body()).getByText("<i>Beach</i>")).toBeTruthy();
    expect(optionLabels(footerCategory())).toContain("<em>Places</em>");
    await showTab("Auto Tag");
    await scan();
    await expand("<u>Sun</u>");
    expect(fileNames("<u>Sun</u>")).toEqual(["<b>sun</b>.mp4"]);
    expect((rowFiles("<u>Sun</u>").querySelector(".tag-autotag-file-path") as HTMLElement).title).toBe("C:\\<s>sun</s>.mp4");
    expect(editor().querySelector("b, em, i, u, s")).toBeNull();
  });
});

describe("Edit Tags", () => {
  it("lists categories by sort order and name with Uncategorized last, and each category's tags by name", async () => {
    await mountTags({
      setup: (_server, tags) => {
        tags.model = {
          categories: [
            { id: "cat-z", name: "Zoo", sortOrder: 1 },
            { id: "cat-a", name: "Animals", sortOrder: 1 },
            { id: "cat-first", name: "First", sortOrder: 0 }
          ],
          tags: [
            { name: "lion", categoryId: "cat-a" },
            { name: "Bear", categoryId: "cat-a" },
            { name: "_Cub", categoryId: "cat-a" },
            { name: "Stray", categoryId: "cat-gone" }
          ],
          items: []
        };
      }
    });
    await openEditor();

    expect(categoryTitles()).toEqual(["First", "Animals", "Zoo", "Uncategorized"]);
    expect(chipNames("Animals")).toEqual(["_Cub", "Bear", "lion"]);
    expect(chipNames("Uncategorized")).toEqual(["Stray"]);
    expect(optionLabels(footerCategory())).toEqual(["First", "Animals", "Zoo", "Uncategorized"]);
  });

  it("leaves out Uncategorized while no tag is uncategorized, but still offers it for new tags", async () => {
    await mountTags({
      setup: (_server, tags) => {
        tags.model = { ...tags.model, tags: tags.model.tags.filter((tag) => tag.categoryId) };
      }
    });
    await openEditor();
    expect(categoryTitles()).toEqual(["Places", "Mood", "People"]);
    expect(optionLabels(footerCategory())).toEqual(["Places", "Mood", "People", "Uncategorized"]);
  });

  it("shows which tags the playing item has, and turns off adding and removing when nothing plays", async () => {
    await mountTags({ play: false });
    await openEditor();
    expect(chipState("Beach")).toEqual({ has: "none", pending: null });
    expect(chipButton("Beach", "Add tag").disabled).toBe(true);
    expect(chipButton("Beach", "Remove tag").disabled).toBe(true);
    expect(chipButton("Beach", "Edit tag").disabled).toBe(false);
    expect(chipButton("Beach", "Delete tag").disabled).toBe(false);
    await click(headerButton("Close"));

    await click(screen.getByText("Click here to play (choose a preset or open Filter…)"));
    await openEditor();
    expect(chipState("Beach").has).toBe("all");
    expect(chipState("Bob").has).toBe("all");
    expect(chipState("Alice").has).toBe("none");
    expect(chipButton("Beach", "Add tag").disabled).toBe(false);
  });

  it("add and remove toggle and replace each other, and Save applies them to the playing item", async () => {
    const { tags } = await mountTags();
    await openEditor();

    await click(chipButton("Calm", "Add tag"));
    expect(chipState("Calm")).toEqual({ has: "none", pending: "add" });
    expect(savePending()).toBe(true);
    await click(chipButton("Calm", "Remove tag"));
    expect(chipState("Calm").pending).toBe("remove");
    await click(chipButton("Calm", "Remove tag"));
    expect(chipState("Calm").pending).toBe(null);
    expect(savePending()).toBe(false);

    await click(chipButton("Calm", "Add tag"));
    await click(chipButton("Bob", "Remove tag"));
    await save();
    expect(isOpen()).toBe(false);
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-video"], addTags: ["Calm"], removeTags: ["Bob"] } }
    ]);
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));
  });

  it("keeps collapsed categories collapsed when it opens again, for this session", async () => {
    await mountTags();
    await openEditor();

    await click(categoryButton("Places", "Collapse category"));
    expect(categoryGrid("Places").style.display).toBe("none");
    expect(categoryButton("Places", "Expand category").textContent).toBe("keyboard_arrow_right");
    await click(categoryButton("Uncategorized", "Collapse category"));
    expect(JSON.parse(sessionStorage.getItem("rr_tagEditorCollapsed") ?? "")).toEqual(["cat-places", "uncategorized"]);
    expect(savePending()).toBe(false);

    await click(headerButton("Close"));
    await openEditor();
    expect(categoryGrid("Places").style.display).toBe("none");
    expect(categoryGrid("Mood").style.display).toBe("");
    await click(categoryButton("Places", "Expand category"));
    expect(categoryGrid("Places").style.display).toBe("");
    expect(categoryButton("Places", "Collapse category").textContent).toBe("keyboard_arrow_down");
    expect(JSON.parse(sessionStorage.getItem("rr_tagEditorCollapsed") ?? "")).toEqual(["uncategorized"]);
  });

  it("moves categories up and down, with the ends and Uncategorized turned off, and saves the new order", async () => {
    const { tags } = await mountTags();
    await openEditor();

    expect(categoryButton("Places", "Move category up").disabled).toBe(true);
    expect(categoryButton("Places", "Move category down").disabled).toBe(false);
    expect(categoryButton("People", "Move category down").disabled).toBe(true);
    for (const label of ["Move category up", "Move category down", "Rename category", "Delete category"]) {
      expect(categoryButton("Uncategorized", label).disabled).toBe(true);
    }

    await click(categoryButton("People", "Move category up"));
    expect(categoryTitles()).toEqual(["Places", "People", "Mood", "Uncategorized"]);
    expect(categoryButton("People", "Move category down").disabled).toBe(false);
    expect(categoryButton("Mood", "Move category down").disabled).toBe(true);
    expect(optionLabels(footerCategory())).toEqual(["Places", "People", "Mood", "Uncategorized"]);
    expect(savePending()).toBe(true);

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-people", name: "People", sortOrder: 1 } },
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-mood", name: "Mood", sortOrder: 2 } }
    ]);
  });

  it("says there is nothing to save when categories moved back, and stays open", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(categoryButton("Mood", "Move category down"));
    await click(categoryButton("Mood", "Move category up"));
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    expect(savePending()).toBe(true);

    await save();
    expect(statusLine()).toBe("No tag changes to save.");
    expect(isOpen()).toBe(true);
    expect(tags.saves()).toEqual([]);
  });

  it("renames a category, refusing a name another category has", async () => {
    const { tags } = await mountTags();
    await openEditor();

    for (const answer of [null, "   "]) {
      dialogs.prompt.mockReturnValue(answer);
      await click(categoryButton("Places", "Rename category"));
    }
    expect(dialogs.prompt).toHaveBeenCalledWith("Rename Category", "Places");
    expect(savePending()).toBe(false);

    dialogs.prompt.mockReturnValue("mood");
    await click(categoryButton("Places", "Rename category"));
    expect(dialogs.alert).toHaveBeenCalledWith("Category already exists.");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);

    dialogs.prompt.mockReturnValue("  Scenery ");
    await click(categoryButton("Places", "Rename category"));
    expect(categoryTitles()).toEqual(["Scenery", "Mood", "People", "Uncategorized"]);
    expect(optionLabels(footerCategory())[0]).toBe("Scenery");
    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-places", name: "Scenery", sortOrder: 0 } }
    ]);
  });

  it("deletes a category after asking, and its tags become Uncategorized", async () => {
    const { tags } = await mountTags();
    await openEditor();

    dialogs.confirm.mockReturnValue(false);
    await click(categoryButton("People", "Delete category"));
    expect(dialogs.confirm).toHaveBeenCalledWith('Delete category "People"? Tags will become Uncategorized.');
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);

    dialogs.confirm.mockReturnValue(true);
    await click(categoryButton("People", "Delete category"));
    expect(categoryTitles()).toEqual(["Places", "Mood", "Uncategorized"]);
    expect(chipNames("Uncategorized")).toEqual(["Alice", "Bob", "Loose"]);
    expect(optionLabels(footerCategory())).toEqual(["Places", "Mood", "Uncategorized"]);
    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/delete-category", body: { categoryId: "cat-people", newCategoryId: null } }
    ]);
  });

  it("adds a category before Uncategorized", async () => {
    const { tags } = await mountTags();
    await openEditor();

    for (const answer of [null, "  "]) {
      dialogs.prompt.mockReturnValue(answer);
      await click(within(editor()).getByRole("button", { name: "Add category" }));
    }
    expect(dialogs.prompt).toHaveBeenCalledWith("New category name");
    expect(savePending()).toBe(false);

    dialogs.prompt.mockReturnValue(" Food ");
    await click(within(editor()).getByRole("button", { name: "Add category" }));
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Food", "Uncategorized"]);
    expect(chipNames("Food")).toEqual([]);
    expect(optionLabels(footerCategory())).toEqual(["Places", "Mood", "People", "Food", "Uncategorized"]);
    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: expect.any(String), name: "Food", sortOrder: 3 } }
    ]);
    expect(tags.saves()[0]!.body.id).not.toBe("");
  });

  it("adds a tag to the chosen category and to the playing item, and clears the name", async () => {
    const { tags } = await mountTags();
    await openEditor();
    expect(footerCategory().value).toBe("cat-places");

    await click(within(editor()).getByRole("button", { name: "Add tag" }));
    expect(savePending()).toBe(false);

    await addTag("  Sunset ", "cat-mood");
    expect(chipNames("Mood")).toEqual(["Calm", "Sunset"]);
    expect(chipState("Sunset")).toEqual({ has: "none", pending: "add" });
    expect(newTagField().value).toBe("");
    expect(footerCategory().value).toBe("cat-mood");

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-tag", body: { name: "Sunset", categoryId: "cat-mood" } },
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-video"], addTags: ["Sunset"], removeTags: [] } }
    ]);
  });

  it("adds a tag only to the catalog when nothing plays", async () => {
    const { tags } = await mountTags({ play: false });
    await openEditor();
    await addTag("Sunset", "uncategorized");
    expect(chipNames("Uncategorized")).toEqual(["Loose", "Sunset"]);
    expect(chipState("Sunset").pending).toBe(null);

    await save();
    expect(tags.saves()).toEqual([{ path: "/api/tag-editor/upsert-tag", body: { name: "Sunset", categoryId: "uncategorized" } }]);
  });

  it("keeps a typed tag name and the chosen category when it closes and opens again", async () => {
    await mountTags();
    await openEditor();
    await choose(footerCategory(), "cat-people");
    await typeInto(newTagField(), "Sun");
    await click(headerButton("Close"));
    expect(dialogs.confirm).not.toHaveBeenCalled();

    await openEditor();
    expect(newTagField().value).toBe("Sun");
    expect(footerCategory().value).toBe("cat-people");
  });

  it("the Edit Tag dialog opens on the tag's name and category, and Cancel or a click outside closes it", async () => {
    await mountTags();
    await openEditor();
    expect(modalOpen()).toBe(false);

    await click(chipButton("Beach", "Edit tag"));
    expect(modalOpen()).toBe(true);
    expect(modalName().value).toBe("Beach");
    expect(document.activeElement).toBe(modalName());
    expect(modalCategory().value).toBe("cat-places");
    expect(optionLabels(modalCategory())).toEqual(["Places", "Mood", "People", "Uncategorized"]);

    await typeInto(modalName(), "Shore");
    await click(modalButton("Cancel"));
    expect(modalOpen()).toBe(false);
    expect(chipNames("Places")).toEqual(["alps", "Beach"]);

    await click(chipButton("Loose", "Edit tag"));
    expect(modalCategory().value).toBe("uncategorized");
    await click(modal().querySelector(".tag-edit-modal-card") as HTMLElement);
    expect(modalOpen()).toBe(true);
    await click(modal());
    expect(modalOpen()).toBe(false);
    expect(savePending()).toBe(false);
  });

  it("the Edit Tag dialog renames a tag and moves it to another category", async () => {
    const { tags } = await mountTags();
    await openEditor();

    await click(chipButton("Beach", "Edit tag"));
    await click(modalButton("Save"));
    expect(modalOpen()).toBe(false);
    expect(savePending()).toBe(false);

    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "   ");
    await click(modalButton("Save"));
    expect(statusLine()).toBe("Tag name is required.");
    expect(modalOpen()).toBe(true);

    await typeInto(modalName(), " Shore ");
    await click(modalButton("Save"));
    expect(modalOpen()).toBe(false);
    expect(chipNames("Places")).toEqual(["alps", "Shore"]);
    expect(chipState("Shore").has).toBe("all");

    await click(chipButton("Calm", "Edit tag"));
    await choose(modalCategory(), "cat-people");
    await click(modalButton("Save"));
    expect(chipNames("Mood")).toEqual([]);
    expect(chipNames("People")).toEqual(["Alice", "Bob", "Calm"]);

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/rename-tag", body: { oldName: "Beach", newName: "Shore", newCategoryId: null } },
      { path: "/api/tag-editor/rename-tag", body: { oldName: "Calm", newName: "Calm", newCategoryId: "cat-people" } }
    ]);
  });

  it("deletes a tag after asking, with any change held for it", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(chipButton("Bob", "Remove tag"));

    dialogs.confirm.mockReturnValue(false);
    await click(chipButton("Bob", "Delete tag"));
    expect(dialogs.confirm).toHaveBeenCalledWith('Delete tag "Bob"?');
    expect(chipNames("People")).toEqual(["Alice", "Bob"]);

    dialogs.confirm.mockReturnValue(true);
    await click(chipButton("Bob", "Delete tag"));
    expect(chipNames("People")).toEqual(["Alice"]);
    await save();
    expect(tags.saves()).toEqual([{ path: "/api/tag-editor/delete-tag", body: { name: "Bob" } }]);
  });

  it("Refresh loads the tags again, asking first when there are changes to drop", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(headerButton("Refresh"));
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(tags.modelRequests()).toHaveLength(2);

    await click(chipButton("Calm", "Add tag"));
    dialogs.confirm.mockReturnValue(false);
    await click(headerButton("Refresh"));
    expect(dialogs.confirm).toHaveBeenCalledWith("Discard changes?");
    expect(tags.modelRequests()).toHaveLength(2);
    expect(chipState("Calm").pending).toBe("add");

    tags.model.tags.push({ name: "Snow", categoryId: "cat-places" });
    dialogs.confirm.mockReturnValue(true);
    await click(headerButton("Refresh"));
    expect(tags.modelRequests()).toHaveLength(3);
    expect(chipNames("Places")).toEqual(["alps", "Beach", "Snow"]);
    expect(chipState("Calm").pending).toBe(null);
    expect(savePending()).toBe(false);
  });
});

describe("saving", () => {
  it("sends each kind of change in order, Auto Tag last, and closes before the server answers", async () => {
    const { tags } = await mountTags();
    await openEditor();
    dialogs.prompt.mockReturnValue("Scenery");
    await click(categoryButton("Places", "Rename category"));
    await click(categoryButton("Mood", "Delete category"));
    await addTag("Sunset", "cat-people");
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));
    await click(chipButton("Bob", "Delete tag"));
    await click(chipButton("Alice", "Add tag"));
    await showTab("Auto Tag");
    await scan();
    await click(rowCheck("Sunset"));

    tags.holding = true;
    await save();
    expect(isOpen()).toBe(false);
    expect(statusLine()).not.toBe("Tag editor changes applied");
    await tags.release();
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));

    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-places", name: "Scenery", sortOrder: 0 } },
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-people", name: "People", sortOrder: 1 } },
      { path: "/api/tag-editor/delete-category", body: { categoryId: "cat-mood", newCategoryId: null } },
      { path: "/api/tag-editor/upsert-tag", body: { name: "Sunset", categoryId: "cat-people" } },
      { path: "/api/tag-editor/rename-tag", body: { oldName: "Beach", newName: "Shore", newCategoryId: null } },
      { path: "/api/tag-editor/delete-tag", body: { name: "Bob" } },
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-video"], addTags: ["Sunset", "Alice"], removeTags: [] } },
      { path: "/api/autotag/apply", body: { assignments: [{ tagName: "Sunset", itemPaths: ["C:\\media\\sunset 1.mp4"] }] } }
    ]);
  });

  it("stops at a step the server refuses, says which, and does not load the tags again", async () => {
    const { tags } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/tag-editor/rename-tag", 500) });
    await openEditor();
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));
    await click(chipButton("Calm", "Delete tag"));
    await click(chipButton("Alice", "Add tag"));

    await save();
    await waitFor(() => expect(statusLine()).toBe("Tag rename failed (500)"));
    expect(isOpen()).toBe(false);
    expect(tags.saves().map((call) => call.path)).toEqual(["/api/tag-editor/rename-tag"]);
    expect(tags.modelRequests()).toHaveLength(1);
  });

  // Kept as it was before the tag editor moved to Preact, and recorded in WebUI Status Line Overhaul: a save that
  // cannot reach the server shows the message of the last refused save on this page.
  it("a save that cannot reach the server says it failed, with the last refused save's message once there is one", async () => {
    const { tags } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/tag-editor/delete-tag", 0) });
    const deleteAndSave = async (name: string) => {
      await openEditor();
      await click(chipButton(name, "Delete tag"));
      await save();
      await settle();
    };

    await deleteAndSave("Bob");
    expect(statusLine()).toBe("Tag apply failed");
    tags.failures.set("/api/tag-editor/delete-tag", 500);
    await deleteAndSave("Bob");
    expect(statusLine()).toBe("Tag delete failed (500)");
    tags.failures.set("/api/tag-editor/delete-tag", 0);
    await deleteAndSave("Alice");
    expect(statusLine()).toBe("Tag delete failed (500)");
  });

  it("reloads the library once under a tag filter, and not for its own event", async () => {
    const { page, server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
      }
    });
    const queriesWithoutFilter = libraryQueries(server).length;
    await openEditor();
    await click(chipButton("Calm", "Add tag"));
    await save();
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));
    const echo = { itemIds: ["item-video"], resolvedItemIds: ["item-video"], addedTags: ["Calm"], removedTags: [] };
    page.stream().emit("itemTagsChanged", 2, echo);
    await settle();
    expect(libraryQueries(server)).toHaveLength(queriesWithoutFilter);

    await pickHeaderPreset("preset-beach");
    const before = libraryQueries(server).length;
    await openEditor();
    await click(chipButton("Alice", "Add tag"));
    await save();
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));
    expect(libraryQueries(server)).toHaveLength(before + 1);
    expect(libraryQueries(server)[before]).toMatchObject({ filterState: { selectedTags: ["Beach"] }, offset: 0 });
    page.stream().emit("itemTagsChanged", 3, { ...echo, addedTags: ["Alice"] });
    await settle();
    expect(libraryQueries(server)).toHaveLength(before + 1);
  });

  it("a renamed tag is renamed in the applied filter, its preset, the library, and random picks", async () => {
    const { server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
      }
    });
    await pickHeaderPreset("preset-beach");
    const before = libraryQueries(server).length;
    await openEditor();
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));

    await save();
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));
    expect(libraryQueries(server)).toHaveLength(before + 1);
    expect(libraryQueries(server)[before].filterState.selectedTags).toEqual(["Shore"]);
    expect(headerSelectedLabel()).toBe("Beach days");
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual(["Shore"]);
    expect(pick.presetId).toBe("preset-beach");
  });

  it("a deleted tag leaves the applied filter and its preset", async () => {
    const { server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
      }
    });
    await pickHeaderPreset("preset-beach");
    const before = libraryQueries(server).length;
    await openEditor();
    await click(chipButton("Beach", "Delete tag"));

    await save();
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));
    expect(libraryQueries(server)).toHaveLength(before + 1);
    expect(libraryQueries(server)[before].filterState.selectedTags).toEqual([]);
    expect(headerSelectedLabel()).toBe("Beach days");
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual([]);
    expect(pick.presetId).toBe("preset-beach");
  });

  it("another client's rename is applied to the filter, its preset, and the library", async () => {
    const { page, server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
      }
    });
    await pickHeaderPreset("preset-beach");
    const before = libraryQueries(server).length;

    page.stream().emit("itemTagsChanged", 2, {
      itemIds: ["item-video", "item-2"],
      resolvedItemIds: ["item-video", "item-2"],
      addedTags: ["Shore"],
      removedTags: ["Beach"],
      catalogReplacedTag: "Beach",
      catalogReplacementTag: "Shore"
    });
    await settle();

    expect(libraryQueries(server)).toHaveLength(before + 1);
    expect(libraryQueries(server)[before].filterState.selectedTags).toEqual(["Shore"]);
    expect(headerSelectedLabel()).toBe("Beach days");
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual(["Shore"]);
    expect(pick.presetId).toBe("preset-beach");
  });
});

describe("Auto Tag", () => {
  it("scans enabled sources, or the full library once that is checked, which it remembers", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    expect(autoTagBox("Scan full library").checked).toBe(false);

    await scan();
    expect(tags.scans()).toEqual([{ scanFullLibrary: false, itemIds: [] }]);
    await click(autoTagBox("Scan full library"));
    expect(localStorage.getItem("rr_autoTagScanFullLibrary")).toBe("true");
    await scan();
    expect(tags.scans()[1]).toEqual({ scanFullLibrary: true, itemIds: [] });
    await click(autoTagBox("Scan full library"));
    expect(localStorage.getItem("rr_autoTagScanFullLibrary")).toBe("false");
  });

  it("shows progress and turns off Scan Files, Close, Refresh, and Save while it scans", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(chipButton("Calm", "Add tag"));
    await showTab("Auto Tag");
    expect(progressShown()).toBe(false);

    tags.holding = true;
    await scan();
    expect(progressShown()).toBe(true);
    expect(autoTagStatus()).toBe("Scanning…");
    expect(scanButton().disabled).toBe(true);
    expect(headerButton("Close").disabled).toBe(true);
    expect(headerButton("Refresh").disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);

    await tags.release();
    expect(progressShown()).toBe(false);
    expect(scanButton().disabled).toBe(false);
    expect(headerButton("Close").disabled).toBe(false);
    expect(headerButton("Refresh").disabled).toBe(false);
    expect(savePending()).toBe(true);
    expect(tags.scans()).toHaveLength(1);
  });

  it("lists the tags with files to change by name, each collapsed, with a summary", async () => {
    await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    await scan();

    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 0/3 selected changes.");
    expect(Array.from(results().querySelectorAll(".tag-autotag-table-head span")).map((node) => node.textContent)).toEqual([
      "",
      "Apply",
      "Tag / File",
      "Total matched",
      "To be changed"
    ]);
    expect(rowNames()).toEqual(["beach", "Sunset"]);
    expect(rowCells(row("beach"))).toEqual(["beach", "3", "2"]);
    expect(rowFiles("beach").style.display).toBe("none");
    expect(rowCheck("beach").checked).toBe(false);
    expect(savePending()).toBe(false);

    await expand("beach");
    expect(rowFiles("beach").style.display).toBe("block");
    expect(within(row("beach")).getByRole("button", { name: "Collapse" }).textContent).toBe("expand_more");
    expect(fileNames("beach")).toEqual(["beach a.mp4", "beach b.mp4"]);
    expect((rowFiles("beach").querySelector(".tag-autotag-file-path") as HTMLElement).title).toBe("C:\\media\\beach a.mp4");
    await click(within(row("beach")).getByRole("button", { name: "Collapse" }));
    expect(rowFiles("beach").style.display).toBe("none");
    expect(within(row("beach")).getByRole("button", { name: "Expand" }).textContent).toBe("chevron_right");
  });

  it("a row's box selects its files, and shows when only some are selected", async () => {
    await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    await scan();
    await expand("beach");

    await click(rowCheck("beach"));
    expect(fileCheck("beach", "beach a.mp4").checked).toBe(true);
    expect(fileCheck("beach", "beach b.mp4").checked).toBe(true);
    expect(rowCheck("beach").checked).toBe(true);
    expect(rowCheck("beach").indeterminate).toBe(false);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 2/3 selected changes.");
    expect(savePending()).toBe(true);

    await click(fileCheck("beach", "beach b.mp4"));
    expect(rowCheck("beach").checked).toBe(false);
    expect(rowCheck("beach").indeterminate).toBe(true);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 1/3 selected changes.");

    await click(rowCheck("beach"));
    expect(rowCheck("beach").checked).toBe(true);
    expect(rowCheck("beach").indeterminate).toBe(false);
    await click(rowCheck("beach"));
    expect(fileCheck("beach", "beach a.mp4").checked).toBe(false);
    expect(savePending()).toBe(false);
  });

  it("View all matches shows tags and files with nothing to change, and only changes count", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    await scan();
    await expand("beach");
    await click(fileCheck("beach", "beach a.mp4"));

    await click(autoTagBox("View all matches"));
    expect(rowNames()).toEqual(["Alps", "beach", "Sunset"]);
    expect(fileNames("beach")).toEqual(["beach a.mp4", "beach b.mp4", "beach c.mp4"]);
    expect(rowCheck("beach").indeterminate).toBe(true);
    await expand("Alps");
    await click(fileCheck("Alps", "alps.mp4"));
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 1/3 selected changes.");

    await click(fileCheck("beach", "beach a.mp4"));
    expect(savePending()).toBe(false);
    await click(fileCheck("beach", "beach a.mp4"));
    await click(fileCheck("beach", "beach c.mp4"));

    await click(autoTagBox("View all matches"));
    expect(rowNames()).toEqual(["beach", "Sunset"]);
    expect(fileNames("beach")).toEqual(["beach a.mp4", "beach b.mp4"]);
    await click(autoTagBox("View all matches"));
    expect(rowFiles("Alps").style.display).toBe("none");
    expect(rowFiles("beach").style.display).toBe("block");

    await save();
    expect(tags.saves()).toEqual([
      {
        path: "/api/autotag/apply",
        body: {
          assignments: [
            { tagName: "beach", itemPaths: ["C:\\media\\beach a.mp4", "C:\\media\\beach c.mp4"] },
            { tagName: "Alps", itemPaths: ["C:\\media\\alps.mp4"] }
          ]
        }
      }
    ]);
  });

  it("Select all and Deselect all change every file shown", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    await scan();

    await click(within(editor()).getByRole("button", { name: "Select all" }));
    expect(rowCheck("beach").checked).toBe(true);
    expect(rowCheck("Sunset").checked).toBe(true);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 3/3 selected changes.");
    await click(within(editor()).getByRole("button", { name: "Deselect all" }));
    expect(rowCheck("beach").checked).toBe(false);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 0/3 selected changes.");
    expect(savePending()).toBe(false);

    await click(within(editor()).getByRole("button", { name: "Select all" }));
    await save();
    expect(isOpen()).toBe(false);
    expect(tags.saves()).toEqual([
      {
        path: "/api/autotag/apply",
        body: {
          assignments: [
            { tagName: "Sunset", itemPaths: ["C:\\media\\sunset 1.mp4"] },
            { tagName: "beach", itemPaths: ["C:\\media\\beach a.mp4", "C:\\media\\beach b.mp4"] }
          ]
        }
      }
    ]);
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));
  });

  it("Close and Refresh ask before dropping selected files, and Refresh clears the results", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await showTab("Auto Tag");
    await scan();
    await click(rowCheck("Sunset"));

    dialogs.confirm.mockReturnValue(false);
    await click(headerButton("Close"));
    expect(dialogs.confirm).toHaveBeenCalledWith("Discard changes?");
    expect(isOpen()).toBe(true);

    dialogs.confirm.mockReturnValue(true);
    await click(headerButton("Refresh"));
    expect(dialogs.confirm).toHaveBeenCalledTimes(2);
    expect(selectedTab()).toBe("Auto Tag");
    expect(autoTagStatus()).toBe("");
    expect(results().textContent).toBe("");
    expect(tags.modelRequests()).toHaveLength(2);

    await click(headerButton("Close"));
    expect(dialogs.confirm).toHaveBeenCalledTimes(2);
    expect(isOpen()).toBe(false);
    await openEditor();
    await showTab("Auto Tag");
    expect(autoTagStatus()).toBe("");
    expect(results().textContent).toBe("");
  });

  it("says when no tags match", async () => {
    await mountTags({ setup: (_server, tags) => (tags.scan = { rows: [] }) });
    await openEditor();
    await showTab("Auto Tag");
    await scan();
    expect(autoTagStatus()).toBe("Scan complete: no matching tags found.");
    expect(results().querySelector(".tag-autotag-hint")?.textContent).toBe("Scan complete: no matching tags found.");
  });

  // Kept as it was before the tag editor moved to Preact, and recorded in WebUI Status Line Overhaul: the status
  // keeps "Scanning…" when every match already has its tag.
  it("shows no rows when every match already has its tag, and leaves the status on Scanning…", async () => {
    await mountTags({ setup: (_server, tags) => (tags.scan = { rows: [SCAN.rows[2]] }) });
    await openEditor();
    await showTab("Auto Tag");
    await scan();
    expect(results().querySelector(".tag-autotag-hint")?.textContent).toBe("No rows to show.");
    expect(autoTagStatus()).toBe("Scanning…");
    expect(progressShown()).toBe(false);

    await click(autoTagBox("View all matches"));
    expect(rowNames()).toEqual(["Alps"]);
    expect(autoTagStatus()).toBe("Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.");
  });

  // Kept as it was before the tag editor moved to Preact, and recorded in WebUI Status Line Overhaul: a failed scan
  // reads as a scan that found nothing.
  it("a failed scan shows that no tags matched", async () => {
    await mountTags({ setup: (_server, tags) => (tags.scanStatus = 500) });
    await openEditor();
    await showTab("Auto Tag");
    await scan();
    expect(autoTagStatus()).toBe("Scan complete: no matching tags found.");
    expect(results().querySelector(".tag-autotag-hint")?.textContent).toBe("Scan complete: no matching tags found.");
    expect(progressShown()).toBe(false);
    expect(scanButton().disabled).toBe(false);
  });
});

describe("storage", () => {
  it("adds only the collapsed categories and Scan full library keys to browser storage", async () => {
    await mountTags();
    await openEditor();
    await click(categoryButton("Mood", "Collapse category"));
    await click(chipButton("Calm", "Add tag"));
    await showTab("Auto Tag");
    await click(autoTagBox("Scan full library"));
    await scan();
    await click(rowCheck("beach"));
    await save();
    await waitFor(() => expect(statusLine()).toBe("Tag editor changes applied"));

    expect(storageKeys(localStorage)).toEqual(["rr_autoTagScanFullLibrary", "rr_clientId"]);
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId", "rr_tagEditorCollapsed"]);
  });
});

describe("controls kept in place", () => {
  // Added after the editor moved to a component. `app.js` rebuilt the Edit Tags body and the Auto Tag results on
  // each change, which dropped focus from the control just used; keeping it is intended.
  it("keeps the clicked chip, category, and Auto Tag controls while the editor changes", async () => {
    await mountTags();
    await openEditor();

    const add = chipButton("Calm", "Add tag");
    add.focus();
    await click(add);
    expect(chipState("Calm").pending).toBe("add");
    expect(chipButton("Calm", "Add tag")).toBe(add);
    expect(document.activeElement).toBe(add);
    const toggle = categoryButton("Places", "Collapse category");
    toggle.focus();
    await click(toggle);
    expect(categoryButton("Places", "Expand category")).toBe(toggle);
    expect(document.activeElement).toBe(toggle);

    await showTab("Auto Tag");
    await scan();
    const expandButton = within(row("beach")).getByRole("button", { name: "Expand" });
    expandButton.focus();
    await click(expandButton);
    expect(within(row("beach")).getByRole("button", { name: "Collapse" })).toBe(expandButton);
    expect(document.activeElement).toBe(expandButton);
    const box = rowCheck("beach");
    box.focus();
    await click(box);
    expect(rowCheck("beach")).toBe(box);
    expect(document.activeElement).toBe(box);
  });
});
