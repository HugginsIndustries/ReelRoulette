// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import {
  closeNotices,
  FakeServer,
  json,
  mountPage,
  normalizedMarkup,
  openNotices,
  pageReady,
  pickPreset,
  pointerDown,
  pointerMove,
  pointerUp,
  pressKey,
  resetPage,
  scrollOnFocus,
  selectedPresetLabel,
  settle,
  unauthorizedLogLine,
  status,
  stubRowLayout,
  stubScroller,
  useStylesheet,
  type MountedPage
} from "./pageHarness";

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
      // The catalog takes item tag changes, so the tags the tab loads again once a save lands show them.
      if (path === "/api/tag-editor/apply-item-tags") {
        const ids: string[] = call.body?.itemIds ?? [];
        for (const item of tags.model.items.filter((candidate) => ids.includes(candidate.itemId))) {
          const removed = new Set((call.body?.removeTags ?? []).map((tag: string) => tag.toLowerCase()));
          item.tags = item.tags.filter((tag) => !removed.has(tag.toLowerCase()));
          for (const tag of call.body?.addTags ?? []) {
            if (!item.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
              item.tags.push(tag);
            }
          }
        }
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

/** The server the page `mountTags` mounted last talks to. */
let mountedServer: FakeServer | null = null;

/** Mounts the page against the tag catalog above and, unless `play` is false, plays the video it tags. */
async function mountTags(
  options: { play?: boolean; setup?: (server: FakeServer, tags: FakeTags) => void } = {}
): Promise<TagPage> {
  const server = new FakeServer();
  const tags = serveTags(server);
  server.on("POST", "/api/random", () => json(VIDEO_ITEM));
  server.on("GET", "/api/sources", () => json([]));
  options.setup?.(server, tags);
  mountedServer = server;
  const page = mountPage({ server });
  await pageReady(server);
  await settle();
  if (options.play !== false) {
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect((document.getElementById("video") as HTMLVideoElement).src).toContain("/api/media/item-video"));
  }
  return { page, server, tags };
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

/** Presses a button the way a browser does: it takes focus, then it is clicked. */
async function press(button: HTMLElement): Promise<void> {
  button.focus();
  fireEvent.click(button);
  await settle();
}

/** Presses a focused button with Enter the way a browser does: the key goes down, then it is clicked with no pointer. */
async function pressWithKeyboard(button: HTMLElement): Promise<void> {
  button.focus();
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.click(button, { detail: 0 });
  fireEvent.keyUp(button, { key: "Enter" });
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

function panel(): HTMLElement {
  return byId("panel");
}

/** Whether the panel is open on the Tags tab. */
function isOpen(): boolean {
  return !panel().hidden && !byId("panel-page-tags").hidden;
}

/** A tab of the panel's own tab row. */
function panelTab(name: "Library" | "Filter" | "Tags"): HTMLButtonElement {
  // A tab's name says so while it holds unsaved changes.
  return within(panel().querySelector(".panel-tablist") as HTMLElement).getByRole("tab", { name: new RegExp(`^${name}(, unsaved changes)?$`), hidden: true }) as HTMLButtonElement;
}

/** Opens the panel with the panel button, unless it is open, and chooses the Tags tab. */
async function openEditor(): Promise<void> {
  if (panel().hidden) {
    await click(byId("panel-btn"));
  }
  await click(panelTab("Tags"));
  expect(isOpen()).toBe(true);
}

/** The panel's Close, which leaves the Tags tab as the tag editor's Close closed the editor. */
function closeButton(): HTMLButtonElement {
  return byId<HTMLButtonElement>("panel-close-btn");
}

function headerButton(name: "Refresh" | "Auto Tag"): HTMLButtonElement {
  return within(editor().querySelector(".tag-editor-header") as HTMLElement).getByRole("button", { name }) as HTMLButtonElement;
}

function saveButton(): HTMLButtonElement {
  return byId<HTMLButtonElement>("tag-editor-apply-btn");
}

/** Save is enabled, orange, and shows its unsaved-changes dot while there is something to save. */
function savePending(): boolean {
  const pending = saveButton().classList.contains("has-pending");
  if (pending === saveButton().disabled) {
    throw new Error("Save is marked pending but disabled, or the reverse.");
  }
  if (pending === saveButton().querySelector<HTMLElement>(".unsaved-dot")!.hidden) {
    throw new Error("Save is marked pending without its dot, or the reverse.");
  }
  return pending;
}

async function save(): Promise<void> {
  await click(saveButton());
}

function body(): HTMLElement {
  return byId("tag-editor-body");
}

function category(title: string): HTMLElement {
  const found = Array.from(body().querySelectorAll<HTMLElement>(".tag-category")).find(
    (candidate) => candidate.querySelector(".tag-category-name")?.textContent === title
  );
  if (!found) {
    throw new Error(`No tag category named ${title}.`);
  }
  return found;
}

function categoryTitles(): string[] {
  return Array.from(body().querySelectorAll(".tag-category-name")).map((node) => node.textContent ?? "");
}

function chipNames(title: string): string[] {
  return Array.from(category(title).querySelectorAll(".tag-chip-label")).map((node) => node.textContent ?? "");
}

function categoryButton(title: string, label: string): HTMLButtonElement {
  return within(category(title)).getAllByTitle(label)[0] as HTMLButtonElement;
}

/** The button in a category's header that expands and collapses it. */
function categoryToggle(title: string): HTMLButtonElement {
  return category(title).querySelector(".tag-category-toggle") as HTMLButtonElement;
}

/** The category's drag handle, which is Uncategorized's dimmed one for Uncategorized. */
function handle(title: string): HTMLButtonElement {
  return category(title).querySelector(".drag-handle") as HTMLButtonElement;
}

/** What screen readers last heard about a category moving. */
function reorderAnnouncement(): string {
  return editor().querySelector(".visually-hidden[aria-live]")?.textContent ?? "";
}

function categoryGrid(title: string): HTMLElement {
  return category(title).querySelector(".tag-grid") as HTMLElement;
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

function chipButton(name: string, label: "Add tag" | "Remove tag" | "Edit tag"): HTMLButtonElement {
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

function addTagButton(): HTMLButtonElement {
  return byId<HTMLButtonElement>("tag-editor-add-tag-btn");
}

/** The in-app dialogs open. The tag editor's render before the confirmations, so the last one is on top. */
function appDialogs(): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog"));
}

type NameDialogTitle = "Edit Tag" | "Edit Category" | "New Category";

function findNameDialog(title: NameDialogTitle): HTMLDialogElement | null {
  return appDialogs().find((dialog) => dialog.querySelector("h3")?.textContent === title) ?? null;
}

function nameDialog(title: NameDialogTitle): HTMLDialogElement {
  const found = findNameDialog(title);
  if (!found) {
    throw new Error(`The ${title} dialog is not open.`);
  }
  return found;
}

function nameField(title: NameDialogTitle): HTMLInputElement {
  return within(nameDialog(title)).getByLabelText(title === "Edit Tag" ? "Tag Name" : "Category Name") as HTMLInputElement;
}

function dialogButton(dialog: HTMLElement, label: string): HTMLButtonElement {
  return within(dialog).getByRole("button", { name: label }) as HTMLButtonElement;
}

/** The field shows its problem: marked invalid and described by the problem's tooltip. */
function fieldProblem(field: HTMLInputElement): string | null {
  if (field.getAttribute("aria-invalid") !== "true") {
    return null;
  }
  return document.getElementById(field.getAttribute("aria-describedby")!)?.textContent ?? "";
}

/** Disabled without the icon a held action shows. */
function disabledWithoutIcon(button: HTMLButtonElement): boolean {
  return (
    button.disabled &&
    !button.hasAttribute("aria-disabled") &&
    !button.classList.contains("shows-problem") &&
    button.querySelector(".btn-problem") === null
  );
}

async function pressEnter(field: HTMLInputElement): Promise<void> {
  fireEvent.keyDown(field, { key: "Enter" });
  await settle();
}

function modal(): HTMLDialogElement {
  return nameDialog("Edit Tag");
}

function modalOpen(): boolean {
  return findNameDialog("Edit Tag") !== null;
}

function modalName(): HTMLInputElement {
  return nameField("Edit Tag");
}

function modalCategory(): HTMLSelectElement {
  return within(modal()).getByLabelText("Category") as HTMLSelectElement;
}

function modalButton(name: "Cancel" | "Save" | "Delete"): HTMLButtonElement {
  return dialogButton(modal(), name);
}

/** The confirmation on top, which asks before an action. */
function confirmation(): HTMLDialogElement {
  const top = appDialogs().at(-1);
  if (!top || top.getAttribute("role") !== "alertdialog") {
    throw new Error("No confirmation is open.");
  }
  return top;
}

function confirmMessage(): string {
  const dialog = confirmation();
  return document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent ?? "";
}

async function answer(label: "Cancel" | "Discard" | "Delete"): Promise<void> {
  await press(dialogButton(confirmation(), label));
}

/** Opens Edit Tag on a tag, deletes it, and confirms. */
async function deleteTag(name: string): Promise<void> {
  await press(chipButton(name, "Edit tag"));
  await press(modalButton("Delete"));
  await answer("Delete");
}

async function editCategory(title: string): Promise<void> {
  await press(within(category(title)).getByRole("button", { name: `Edit category ${title}` }));
}

async function newCategory(): Promise<void> {
  await press(within(editor()).getByRole("button", { name: "Add category" }));
}

/** The lines the mounted page relayed starting with `text`, a message or a state with no message, whatever was playing. */
function relayedLines(text: string): string[] {
  return mountedServer!.logLines().filter((line) => line.startsWith(`status=${text}`));
}

/**
 * Waits until a save that landed has said so, which pops up and relays its text. The relay holds back a repeat within
 * a second, so a second save soon after relays nothing more.
 */
async function expectSaved(): Promise<void> {
  await waitFor(() => expect(relayedLines("Tag editor changes applied hasCurrent=")).not.toEqual([]));
}

/**
 * Expects the in-app notice to show `message`, alone, with the `last.log` line a message gets while the video
 * `mountTags` plays is current, then closes it.
 */
async function expectNotice(server: FakeServer, message: string): Promise<void> {
  await waitFor(() => expect(openNotices()).toEqual([message]));
  await waitFor(() => expect(server.logLines()).toContain(statusLogLine(message, { id: VIDEO_ITEM.id }, 1)));
  await closeNotices();
  expect(openNotices()).toEqual([]);
}

/** The header's pairing prompt, found while it is hidden too. */
function pairingPrompt(): HTMLElement {
  return screen.getByRole("button", { name: "Pair", hidden: true }).closest(".pair-section") as HTMLElement;
}

/** A success whose body is a proxy's page in place of JSON. */
function htmlPage(): Response {
  return new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } });
}

/** Auto Tag, over the whole page, or null while it is closed. */
function findAutoTag(): HTMLDialogElement | null {
  return document.getElementById("autotag") as HTMLDialogElement | null;
}

function autoTag(): HTMLDialogElement {
  const found = findAutoTag();
  if (!found) {
    throw new Error("Auto Tag is not open.");
  }
  return found;
}

/** Opens Auto Tag with the Tags tab's Auto Tag button. */
async function openAutoTag(): Promise<void> {
  await press(headerButton("Auto Tag"));
  autoTag();
}

function autoTagButton(name: "Close" | "Cancel" | "Apply" | "Select all" | "Deselect all" | "Scan Files"): HTMLButtonElement {
  return within(autoTag()).getByRole("button", { name }) as HTMLButtonElement;
}

function autoTagStatus(): string {
  return byId("autotag-status").textContent ?? "";
}

function results(): HTMLElement {
  return byId("autotag-results");
}

function progressShown(): boolean {
  return !byId("autotag-progress").hidden;
}

function scanButton(): HTMLButtonElement {
  return autoTagButton("Scan Files");
}

async function scan(): Promise<void> {
  await click(scanButton());
}

function autoTagBox(label: "Scan full library" | "View all matches"): HTMLInputElement {
  return within(autoTag()).getByLabelText(label) as HTMLInputElement;
}

function row(tagName: string): HTMLElement {
  const found = Array.from(results().querySelectorAll<HTMLElement>(".autotag-result")).find(
    (candidate) => rowCells(candidate)[0] === tagName
  );
  if (!found) {
    throw new Error(`No Auto Tag row for ${tagName}.`);
  }
  return found;
}

/** The tag name, total matched, and to-be-changed count a row shows. */
function rowCells(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll(".autotag-row-main > span")).map((node) => node.textContent ?? "");
}

function rowNames(): string[] {
  return Array.from(results().querySelectorAll<HTMLElement>(".autotag-result")).map((element) => rowCells(element)[0]!);
}

function rowCheck(tagName: string): HTMLInputElement {
  return row(tagName).querySelector(".autotag-row-main input[type=checkbox]") as HTMLInputElement;
}

/** A row's files, or null while it is collapsed. */
function rowFiles(tagName: string): HTMLElement | null {
  return row(tagName).querySelector(".autotag-files");
}

function fileNames(tagName: string): string[] {
  return Array.from(rowFiles(tagName)?.querySelectorAll(".autotag-file span") ?? []).map((node) => node.textContent ?? "");
}

function fileCheck(tagName: string, displayPath: string): HTMLInputElement {
  const found = Array.from(rowFiles(tagName)?.querySelectorAll<HTMLElement>(".autotag-file") ?? []).find(
    (candidate) => candidate.querySelector("span")?.textContent === displayPath
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
});

describe("opening and closing", () => {
  it("opens after loading the tags of the playing item, or of no item when nothing plays", async () => {
    const { tags } = await mountTags({ play: false });
    expect(isOpen()).toBe(false);

    await openEditor();
    expect(tags.modelRequests()).toEqual([{ itemIds: [] }]);
    expect(within(editor()).queryAllByRole("tab")).toEqual([]);
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    expect(savePending()).toBe(false);

    await click(closeButton());
    expect(isOpen()).toBe(false);
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await openEditor();
    expect(tags.modelRequests()[1]).toEqual({ itemIds: ["item-video"] });
    expect(chipState("Beach").has).toBe("all");
  });

  it("keeps its changes without asking when the panel closes or another tab shows, until Refresh drops them after asking", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(chipButton("Calm", "Add tag"));
    await editCategory("Places");
    await typeInto(nameField("Edit Category"), "Scenery");
    await press(dialogButton(nameDialog("Edit Category"), "Save"));
    await click(closeButton());
    expect(appDialogs()).toEqual([]);
    expect(isOpen()).toBe(false);

    await openEditor();
    expect(chipState("Calm").pending).toBe("add");
    expect(categoryTitles()).toContain("Scenery");
    expect(savePending()).toBe(true);
    await click(panelTab("Library"));
    expect(appDialogs()).toEqual([]);
    await click(panelTab("Tags"));
    expect(chipState("Calm").pending).toBe("add");

    await press(headerButton("Refresh"));
    expect(confirmMessage()).toBe("Discard changes?");
    expect(document.activeElement).toBe(dialogButton(confirmation(), "Cancel"));
    expect(dialogButton(confirmation(), "Discard").classList.contains("btn-danger")).toBe(true);
    expect(dialogButton(confirmation(), "Cancel").classList.contains("btn-danger")).toBe(false);
    await answer("Cancel");
    expect(appDialogs()).toEqual([]);
    expect(chipState("Calm").pending).toBe("add");
    expect(document.activeElement).toBe(headerButton("Refresh"));

    await press(headerButton("Refresh"));
    await answer("Discard");
    expect(appDialogs()).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(tags.saves()).toEqual([]);
    expect(chipState("Calm").pending).toBe(null);
    expect(categoryTitles()).toContain("Places");
    expect(savePending()).toBe(false);
    expect(tags.modelRequests()).toHaveLength(4);
  });

  it("Save shows the unsaved-changes dot, as the panel's tabs do, only while there are changes", async () => {
    await mountTags();
    await openEditor();
    const saveDot = () => saveButton().querySelector<HTMLElement>(".unsaved-dot")!;
    expect(saveButton().getAttribute("aria-label")).toBe("Save");
    expect(saveDot().hidden).toBe(true);

    await click(chipButton("Calm", "Add tag"));
    expect(saveDot().hidden).toBe(false);
    await click(chipButton("Calm", "Add tag"));
    expect(chipState("Calm").pending).toBe(null);
    expect(saveDot().hidden).toBe(true);

    await click(chipButton("Calm", "Add tag"));
    await save();
    await expectSaved();
    expect(saveDot().hidden).toBe(true);
  });

  it("stays open and says why when the tags cannot load", async () => {
    const { server, tags } = await mountTags({ setup: (_server, fake) => (fake.modelStatus = 500) });
    await openEditor();
    await expectNotice(server, "Tag editor unavailable: HTTP 500");
    expect(body().textContent).toBe("");

    tags.modelStatus = 200;
    await click(headerButton("Refresh"));
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    tags.modelStatus = 503;
    await click(headerButton("Refresh"));
    await expectNotice(server, "Tag refresh failed: HTTP 503");
    expect(isOpen()).toBe(true);
  });

  it("names the content type of tags that aren't JSON, such as a proxy's page", async () => {
    const { server } = await mountTags({ setup: (fake) => fake.on("POST", "/api/tag-editor/model", () => htmlPage()) });
    await openEditor();
    await expectNotice(server, "Tag editor unavailable: The server sent an unexpected response (text/html).");
    expect(body().textContent).toBe("");
  });

  it("shows only the pairing prompt when the tags answer 401, and logs it", async () => {
    const { server, tags } = await mountTags({ setup: (_server, fake) => (fake.modelStatus = 401) });
    expect(pairingPrompt().style.display).toBe("none");
    await openEditor();
    await waitFor(() => expect(pairingPrompt().style.display).toBe("flex"));
    await click(headerButton("Refresh"));
    expect(tags.modelRequests()).toHaveLength(2);
    expect(openNotices()).toEqual([]);
    expect([...relayedLines("Tag editor unavailable"), ...relayedLines("Tag refresh failed")]).toEqual([]);
    expect(body().textContent).toBe("");
    await waitFor(() =>
      expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/tag-editor/model", { id: VIDEO_ITEM.id }, 1))
    );
  });

  it("keeps its markup, and Auto Tag's and the Edit Tag dialog's", async () => {
    localStorage.setItem("rr_device.tags.expandedCategories", JSON.stringify(["cat-places", "cat-people", "uncategorized"]));
    await mountTags();
    await openEditor();
    await click(chipButton("alps", "Add tag"));
    await click(chipButton("Bob", "Remove tag"));
    expect(normalizedMarkup(editor(), { liveFormState: true })).toMatchSnapshot("edit tags");

    await click(chipButton("Beach", "Edit tag"));
    expect(normalizedMarkup(modal(), { liveFormState: true })).toMatchSnapshot("edit tag dialog");
    await click(modalButton("Cancel"));

    await openAutoTag();
    await scan();
    await expand("beach");
    await click(fileCheck("beach", "beach a.mp4"));
    expect(normalizedMarkup(autoTag(), { liveFormState: true })).toMatchSnapshot("auto tag");
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
    await openAutoTag();
    await scan();
    await expand("<u>Sun</u>");
    expect(fileNames("<u>Sun</u>")).toEqual(["<b>sun</b>.mp4"]);
    expect((rowFiles("<u>Sun</u>")!.querySelector(".autotag-file span") as HTMLElement).title).toBe("C:\\<s>sun</s>.mp4");
    expect(editor().querySelector("b, em, i, u, s")).toBeNull();
    expect(autoTag().querySelector("b, em, i, u, s")).toBeNull();
  });
});

describe("following the playing item", () => {
  const OTHER_ITEM = {
    ...VIDEO_ITEM,
    id: "C:\\media\\other clip.mp4",
    itemId: "item-other",
    displayName: "other clip.mp4",
    mediaUrl: "/api/media/item-other?token=t"
  };

  /** Plays `item` as the next random pick, with Next beside the open panel. */
  async function playNext(server: FakeServer, item: typeof VIDEO_ITEM): Promise<void> {
    server.on("POST", "/api/random", () => json(item));
    await click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect((document.getElementById("video") as HTMLVideoElement).src).toContain(item.mediaUrl.split("?")[0]));
    await settle();
  }

  function targetLine(): HTMLElement {
    return byId("tag-editor-target");
  }

  function withOtherItem(_server: FakeServer, tags: FakeTags): void {
    tags.model.items.push({ itemId: "item-other", tags: ["Calm"] });
  }

  it("shows the new item's tags when the playing item changes", async () => {
    const { server, tags } = await mountTags({ setup: withOtherItem });
    await openEditor();
    expect(chipState("Beach").has).toBe("all");
    expect(targetLine().hidden).toBe(true);

    await playNext(server, OTHER_ITEM);
    expect(tags.modelRequests().at(-1)).toEqual({ itemIds: ["item-other"] });
    expect(chipState("Beach").has).toBe("none");
    expect(chipState("Calm").has).toBe("all");
    expect(targetLine().hidden).toBe(true);
    expect(targetLine().textContent).toBe("");
  });

  it("follows the playing item while the panel is closed, and shows its tags when the tab shows again", async () => {
    const { server, tags } = await mountTags({ setup: withOtherItem });
    await openEditor();
    await click(closeButton());
    await playNext(server, OTHER_ITEM);
    expect(tags.modelRequests()).toHaveLength(1);
    await openEditor();
    expect(tags.modelRequests().at(-1)).toEqual({ itemIds: ["item-other"] });
    expect(chipState("Calm").has).toBe("all");
  });

  it("stays on its item with an Editing tags for line while it has adds or removes, and follows once they are saved", async () => {
    const { server, tags } = await mountTags({ setup: withOtherItem });
    await openEditor();
    await click(chipButton("Calm", "Add tag"));

    await playNext(server, OTHER_ITEM);
    expect(tags.modelRequests()).toHaveLength(1);
    expect(targetLine().hidden).toBe(false);
    expect(targetLine().textContent).toBe("Editing tags for holiday clip.mp4");
    expect(targetLine().querySelector("b")?.textContent).toBe("holiday clip.mp4");
    expect(targetLine().title).toBe("holiday clip.mp4");
    expect(targetLine().getAttribute("aria-live")).toBe("polite");
    expect(chipState("Beach").has).toBe("all");
    expect(chipState("Calm").pending).toBe("add");

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-video"], addTags: ["Calm"], removeTags: [] } }
    ]);
    await waitFor(() => expect(targetLine().hidden).toBe(true));
    expect(tags.modelRequests().at(-1)).toEqual({ itemIds: ["item-other"] });
    expect(chipState("Beach").has).toBe("none");
    expect(chipState("Calm")).toEqual({ has: "all", pending: null });
  });

  it("follows the playing item once Refresh discards its adds or removes", async () => {
    const { server, tags } = await mountTags({ setup: withOtherItem });
    await openEditor();
    await click(chipButton("Bob", "Remove tag"));
    await playNext(server, OTHER_ITEM);
    expect(targetLine().hidden).toBe(false);

    await press(headerButton("Refresh"));
    await answer("Discard");
    expect(targetLine().hidden).toBe(true);
    expect(tags.modelRequests().at(-1)).toEqual({ itemIds: ["item-other"] });
    expect(chipState("Bob")).toEqual({ has: "none", pending: null });
    expect(tags.saves()).toEqual([]);
  });

  it("isn't held by a category rename or reorder, which it keeps", async () => {
    const { server, tags } = await mountTags({ setup: withOtherItem });
    await openEditor();
    await editCategory("Places");
    await typeInto(nameField("Edit Category"), "Scenery");
    await press(dialogButton(nameDialog("Edit Category"), "Save"));
    await press(handle("People"));
    await pressKey(handle("People"), "ArrowUp");

    await playNext(server, OTHER_ITEM);
    expect(targetLine().hidden).toBe(true);
    expect(tags.modelRequests().at(-1)).toEqual({ itemIds: ["item-other"] });
    expect(categoryTitles()).toEqual(["Scenery", "People", "Mood", "Uncategorized"]);
    expect(chipState("Calm").has).toBe("all");
    expect(savePending()).toBe(true);
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
    await click(closeButton());

    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
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
    // It stays open, showing the changes as saved.
    expect(isOpen()).toBe(true);
    expect(chipState("Calm")).toEqual({ has: "all", pending: null });
    expect(chipState("Bob")).toEqual({ has: "none", pending: null });
    expect(savePending()).toBe(false);
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-video"], addTags: ["Calm"], removeTags: ["Bob"] } }
    ]);
    await expectSaved();
  });

  it("start collapsed, and the header's name or padding expands and collapses one, with no arrows, while its drag handle and Edit keep their own actions", async () => {
    await mountTags();
    await openEditor();
    for (const title of categoryTitles()) {
      expect(categoryGrid(title).hidden, title).toBe(true);
      expect(categoryToggle(title).getAttribute("aria-expanded"), title).toBe("false");
    }
    expect(categoryToggle("Places").getAttribute("aria-controls")).toBe(categoryGrid("Places").id);
    expect(categoryToggle("Places").title).toBe("Expand category");
    expect(body().querySelector(".tag-category-toggle .material-symbol-icon")).toBeNull();

    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryToggle("Places").getAttribute("aria-expanded")).toBe("true");
    expect(categoryToggle("Places").title).toBe("Collapse category");
    expect(savePending()).toBe(false);
    await click(category("Places").querySelector(".tag-category-header")!);
    expect(categoryGrid("Places").hidden).toBe(true);

    await click(handle("Mood"));
    await click(handle("Mood").querySelector(".material-symbol-icon")!);
    await click(handle("Uncategorized"));
    expect(categoryGrid("Mood").hidden).toBe(true);
    expect(categoryGrid("Uncategorized").hidden).toBe(true);
    await press(within(category("Mood")).getByRole("button", { name: "Edit category Mood" }));
    expect(findNameDialog("Edit Category")).not.toBeNull();
    await click(dialogButton(nameDialog("Edit Category"), "Cancel"));
    expect(categoryGrid("Mood").hidden).toBe(true);
  });

  it("remember on this device which are expanded, apart from the Filter tab's, after a page refresh too", async () => {
    const { page } = await mountTags();
    await openEditor();
    await click(categoryToggle("Places"));
    await click(categoryToggle("Uncategorized"));
    expect(JSON.parse(localStorage.getItem("rr_device.tags.expandedCategories") ?? "")).toEqual(["cat-places", "uncategorized"]);
    expect(localStorage.getItem("rr_device.filter.expandedTagCategories")).toBeNull();

    await click(closeButton());
    await openEditor();
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryGrid("Mood").hidden).toBe(true);

    page.unmount();
    await mountTags();
    await openEditor();
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryGrid("Uncategorized").hidden).toBe(false);
    expect(categoryGrid("People").hidden).toBe(true);
    // A new category starts collapsed too.
    await newCategory();
    await typeInto(nameField("New Category"), "Food");
    await press(dialogButton(nameDialog("New Category"), "Save"));
    expect(categoryGrid("Food").hidden).toBe(true);
  });

  it("expand when a tag is added to one or moved into one, and Uncategorized when a deleted category's tags move into it", async () => {
    await mountTags();
    await openEditor();
    await addTag("Sunset", "cat-mood");
    expect(categoryGrid("Mood").hidden).toBe(false);

    await click(chipButton("Bob", "Edit tag"));
    await choose(modalCategory(), "cat-places");
    await click(modalButton("Save"));
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryGrid("People").hidden).toBe(true);

    // A rename that keeps the tag where it is expands nothing.
    await click(chipButton("Alice", "Edit tag"));
    await typeInto(modalName(), "Alicia");
    await click(modalButton("Save"));
    expect(categoryGrid("People").hidden).toBe(true);

    await editCategory("People");
    await press(dialogButton(nameDialog("Edit Category"), "Delete"));
    await answer("Delete");
    expect(chipNames("Uncategorized")).toEqual(["Alicia", "Loose"]);
    expect(categoryGrid("Uncategorized").hidden).toBe(false);
  });

  it("show, expanded and collapsed, how many of their tags the item has, and the dot while they hold unsaved changes", async () => {
    await mountTags();
    await openEditor();
    const count = (title: string) => category(title).querySelector<HTMLElement>(".category-count")!;
    const dot = (title: string) => category(title).querySelector<HTMLElement>(".category-dot")!;
    // The playing item has Beach and Bob.
    expect([count("Places").hidden, count("Places").textContent, count("Places").title]).toEqual([false, "1", "1 tag on this item"]);
    expect([count("People").hidden, count("People").textContent]).toEqual([false, "1"]);
    expect(count("Mood").hidden).toBe(true);
    expect(dot("Mood").hidden).toBe(true);
    expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 1 tag on this item");
    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").hidden).toBe(false);
    expect([count("Places").hidden, count("Places").textContent]).toEqual([false, "1"]);
    expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 1 tag on this item");
    await click(categoryToggle("Places"));

    // A held add marks its category with the dot, which shows expanded and collapsed, and a count of 0 stays hidden.
    await click(chipButton("Calm", "Add tag"));
    expect(dot("Mood").hidden).toBe(false);
    expect(dot("Mood").title).toBe("Unsaved changes");
    expect(count("Mood").hidden).toBe(true);
    expect(categoryToggle("Mood").getAttribute("aria-label")).toBe("Mood, unsaved changes");
    await click(categoryToggle("Mood"));
    expect(categoryGrid("Mood").hidden).toBe(false);
    expect(dot("Mood").hidden).toBe(false);
    expect(count("Mood").hidden).toBe(true);
    expect(categoryToggle("Mood").getAttribute("aria-label")).toBe("Mood, unsaved changes");
    await click(categoryToggle("Mood"));

    // A renamed category, and the categories a tag moves between, hold unsaved changes too; a new order alone doesn't.
    await editCategory("Places");
    await typeInto(nameField("Edit Category"), "Scenery");
    await press(dialogButton(nameDialog("Edit Category"), "Save"));
    expect(dot("Scenery").hidden).toBe(false);
    await press(handle("People"));
    await pressKey(handle("People"), "ArrowUp");
    expect(dot("People").hidden).toBe(true);
    expect(savePending()).toBe(true);

    await save();
    await expectSaved();
    for (const title of categoryTitles()) {
      expect(dot(title).hidden, title).toBe(true);
    }
    expect(count("Mood").textContent).toBe("1");
  });

  it("each chip has add, remove, and edit, and each category a drag handle and Edit, except Uncategorized", async () => {
    await mountTags();
    await openEditor();
    const titles = (element: HTMLElement) => Array.from(element.querySelectorAll("button")).map((button) => button.title);
    expect(titles(chip("Beach"))).toEqual(["Add tag", "Remove tag", "Edit tag"]);
    expect(within(chip("Beach")).queryByTitle("Delete tag")).toBeNull();
    const header = (title: string) => category(title).querySelector(".tag-category-header") as HTMLElement;
    expect(titles(header("Places"))).toEqual(["Drag to reorder", "Expand category", "Edit category"]);
    const places = handle("Places");
    expect(places.getAttribute("aria-label")).toBe("Reorder Places");
    expect(places.textContent).toBe("drag_indicator");
    expect(places.disabled).toBe(false);
    expect(byId(places.getAttribute("aria-describedby") ?? "").textContent).toBe("Drag to reorder, or press the up and down arrow keys.");
    expect(within(category("Places")).getByRole("button", { name: "Edit category Places" }).textContent).toBe("edit_note");
    expect(titles(header("Uncategorized"))).toEqual(["Uncategorized stays last", "Expand category"]);
    expect(handle("Uncategorized").disabled).toBe(true);
    expect(handle("Uncategorized").getAttribute("aria-label")).toBe("Uncategorized stays last");
    expect(handle("Uncategorized").hasAttribute("aria-describedby")).toBe(false);
    for (const title of ["Move category up", "Move category down", "Delete category", "Rename category"]) {
      expect(within(editor()).queryByTitle(title), title).toBeNull();
    }
  });

  it("moves a category with the arrow keys on its handle, keeping focus there and saying where it went, and saves the order", async () => {
    const { tags } = await mountTags();
    await openEditor();

    expect(await pressKey(handle("People"), "ArrowUp")).toBe(false);
    expect(categoryTitles()).toEqual(["Places", "People", "Mood", "Uncategorized"]);
    expect(document.activeElement).toBe(handle("People"));
    expect(reorderAnnouncement()).toBe("People moved to position 2 of 3.");
    expect(optionLabels(footerCategory())).toEqual(["Places", "People", "Mood", "Uncategorized"]);
    expect(savePending()).toBe(true);

    expect(await pressKey(handle("Places"), "ArrowUp")).toBe(false);
    expect(await pressKey(handle("Mood"), "ArrowDown")).toBe(false);
    expect(await pressKey(handle("Uncategorized"), "ArrowUp")).toBe(true);
    expect(categoryTitles()).toEqual(["Places", "People", "Mood", "Uncategorized"]);
    expect(reorderAnnouncement()).toBe("People moved to position 2 of 3.");

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-people", name: "People", sortOrder: 1 } },
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-mood", name: "Mood", sortOrder: 2 } }
    ]);
  });

  it("says there is nothing to save when categories moved back, and stays open", async () => {
    const { server, tags } = await mountTags();
    await openEditor();
    await pressKey(handle("Mood"), "ArrowDown");
    await pressKey(handle("Mood"), "ArrowUp");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    expect(savePending()).toBe(true);

    await save();
    await expectNotice(server, "No tag changes to save.");
    expect(isOpen()).toBe(true);
    expect(tags.saves()).toEqual([]);
  });

  describe("dragging a category", () => {
    async function mountLaidOut(): Promise<TagPage> {
      // Every category expanded, so their tags show until one is dragged.
      localStorage.setItem("rr_device.tags.expandedCategories", JSON.stringify(["cat-places", "cat-mood", "cat-people", "uncategorized"]));
      const page = await mountTags();
      await openEditor();
      useStylesheet();
      // Categories 100 px tall, or 40 px while one is dragged and hides its tags, 12 px apart.
      stubRowLayout("#tag-editor-body .tag-category", (row) => (row.classList.contains("is-dragging") ? 40 : 100), 12);
      return page;
    }

    const transforms = () => Array.from(body().querySelectorAll<HTMLElement>(".tag-category")).map((section) => section.style.transform);

    it("hides its tags, follows the pointer past each category its middle crosses, and saves the new order", async () => {
      const { tags } = await mountLaidOut();

      pointerDown(handle("Places"), 20);
      await pointerMove(30);
      expect(category("Places").classList.contains("is-dragging")).toBe(true);
      expect(getComputedStyle(categoryGrid("Places")).display).toBe("none");
      expect(getComputedStyle(categoryGrid("Mood")).display).toBe("flex");
      // Its middle, at 100, is short of Mood's, at 102: it follows the pointer and nothing makes way.
      await pointerMove(100);
      expect(transforms()).toEqual(["translateY(80px)", "", "", ""]);
      // Past Mood's middle, Mood slides up into its place, by its 40 px and the 12 px gap.
      await pointerMove(110);
      expect(transforms()).toEqual(["translateY(90px)", "translateY(-52px)", "", ""]);
      expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
      expect(savePending()).toBe(false);

      await pointerUp();
      expect(categoryTitles()).toEqual(["Mood", "Places", "People", "Uncategorized"]);
      expect(transforms()).toEqual(["", "", "", ""]);
      expect(category("Places").classList.contains("is-dragging")).toBe(false);
      expect(getComputedStyle(categoryGrid("Places")).display).toBe("flex");
      expect(document.activeElement).toBe(handle("Places"));
      expect(reorderAnnouncement()).toBe("Places moved to position 2 of 3.");
      expect(savePending()).toBe(true);

      await save();
      expect(tags.saves()).toEqual([
        { path: "/api/tag-editor/upsert-category", body: { id: "cat-mood", name: "Mood", sortOrder: 0 } },
        { path: "/api/tag-editor/upsert-category", body: { id: "cat-places", name: "Places", sortOrder: 1 } }
      ]);
    });

    it("stays above Uncategorized, and inside the list, however far down it is dragged", async () => {
      await mountLaidOut();
      pointerDown(handle("Places"), 20);
      await pointerMove(30);
      await pointerMove(2000);
      // It stops with its bottom at People's, at 264, so the list grows no longer under it.
      expect(transforms()).toEqual(["translateY(224px)", "translateY(-52px)", "translateY(-52px)", ""]);
      await pointerUp();
      expect(categoryTitles()).toEqual(["Mood", "People", "Places", "Uncategorized"]);
      expect(reorderAnnouncement()).toBe("Places moved to position 3 of 3.");
    });

    it("keeps the list where it was scrolled after a drop, and focuses the dropped handle without scrolling", async () => {
      await mountLaidOut();
      // A list reaching well past the categories, so the pointer stays away from its edges and it scrolls only when told to.
      stubScroller(body(), -200, 600, 1200);
      body().scrollTop = 30;
      const focusCalls = scrollOnFocus(body());

      pointerDown(handle("Places"), 20);
      await pointerMove(30);
      // Its middle, at 160 in the list, is past Mood's at 132.
      await pointerMove(130);
      expect(transforms()).toEqual(["translateY(110px)", "translateY(-52px)", "", ""]);
      // As the transforms go, the tags show again, and the categories move, the browser may scroll the list, before the
      // page renders.
      await pointerUp(() => {
        body().scrollTop = 0;
      });
      expect(categoryTitles()).toEqual(["Mood", "Places", "People", "Uncategorized"]);
      expect(body().scrollTop).toBe(30);
      expect(document.activeElement).toBe(handle("Places"));
      expect(focusCalls.map((call) => [call.element.getAttribute("aria-label"), call.preventScroll])).toEqual([["Reorder Places", true]]);
    });

    it("leaves the order for a tap on a handle, and for a drop where it started", async () => {
      await mountLaidOut();
      pointerDown(handle("Mood"), 130);
      await pointerMove(134);
      expect(category("Mood").classList.contains("is-dragging")).toBe(false);
      await pointerUp();
      expect(document.activeElement).toBe(handle("Mood"));

      pointerDown(handle("Mood"), 130);
      await pointerMove(160);
      expect(category("Mood").classList.contains("is-dragging")).toBe(true);
      await pointerMove(131);
      await pointerUp();
      expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
      expect(transforms()).toEqual(["", "", "", ""]);
      expect(reorderAnnouncement()).toBe("");
      expect(savePending()).toBe(false);
    });

    it("leaves a category expanded after a drop, or a press on Edit, let go elsewhere on its header, which the browser then clicks", async () => {
      await mountLaidOut();
      const header = (title: string) => category(title).querySelector(".tag-category-header")!;

      // The pointer drifted onto the name as it dragged, so the browser clicks the header, which holds both.
      pointerDown(handle("Places"), 20);
      await pointerMove(30);
      await pointerMove(110);
      await pointerUp();
      await click(header("Places"));
      expect(categoryTitles()).toEqual(["Mood", "Places", "People", "Uncategorized"]);
      expect(categoryGrid("Places").hidden).toBe(false);

      fireEvent.pointerDown(within(category("Mood")).getByRole("button", { name: "Edit category Mood" }));
      await click(header("Mood"));
      expect(categoryGrid("Mood").hidden).toBe(false);
      expect(findNameDialog("Edit Category")).toBeNull();

      // A press on the header's own padding still toggles it.
      fireEvent.pointerDown(header("Mood"));
      await click(header("Mood"));
      expect(categoryGrid("Mood").hidden).toBe(true);
    });

    it("starts only on the handle, so a drag anywhere else on a category scrolls", async () => {
      await mountLaidOut();
      expect(getComputedStyle(handle("Places")).touchAction).toBe("none");
      for (const part of [category("Places"), category("Places").querySelector(".tag-category-header")!, chip("Beach")]) {
        expect(getComputedStyle(part).touchAction).not.toBe("none");
      }

      for (const start of [category("Places").querySelector(".tag-category-name")!, chip("Beach")]) {
        pointerDown(start, 20);
        await pointerMove(200);
        expect(category("Places").classList.contains("is-dragging")).toBe(false);
        await pointerUp();
      }
      expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
      expect(transforms()).toEqual(["", "", "", ""]);
      expect(savePending()).toBe(false);
    });
  });

  it("Edit Category opens on the name, flags a name another category has, and renames", async () => {
    const { tags } = await mountTags();
    await openEditor();
    const logsBefore = mountedServer!.logLines().length;

    await editCategory("Places");
    const field = nameField("Edit Category");
    const dialogSave = dialogButton(nameDialog("Edit Category"), "Save");
    expect(field.value).toBe("Places");
    expect(document.activeElement).toBe(field);
    expect(dialogSave.disabled).toBe(false);

    await typeInto(field, " MOOD ");
    expect(fieldProblem(field)).toBe("Use a name no other category has.");
    expect(disabledWithoutIcon(dialogSave)).toBe(true);
    await pressEnter(field);
    expect(appDialogs()).toEqual([nameDialog("Edit Category")]);
    // A field problem shows in its field, and isn't relayed.
    expect(mountedServer!.logLines().slice(logsBefore)).toEqual([]);

    await typeInto(field, "  ");
    expect(fieldProblem(field)).toBeNull();
    expect(disabledWithoutIcon(dialogSave)).toBe(true);

    await typeInto(field, "  Scenery ");
    expect(fieldProblem(field)).toBeNull();
    expect(dialogSave.disabled).toBe(false);
    await pressEnter(field);
    expect(appDialogs()).toEqual([]);
    expect(categoryTitles()).toEqual(["Scenery", "Mood", "People", "Uncategorized"]);
    expect(optionLabels(footerCategory())[0]).toBe("Scenery");

    await editCategory("Mood");
    await typeInto(nameField("Edit Category"), "Feelings");
    await press(dialogButton(nameDialog("Edit Category"), "Save"));
    expect(appDialogs()).toEqual([]);
    expect(categoryTitles()).toEqual(["Scenery", "Feelings", "People", "Uncategorized"]);
    expect(mountedServer!.logLines().slice(logsBefore)).toEqual([]);

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-places", name: "Scenery", sortOrder: 0 } },
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-mood", name: "Feelings", sortOrder: 1 } }
    ]);
  });

  it("Edit Category's Cancel, or Save with the name unchanged, changes nothing", async () => {
    await mountTags();
    await openEditor();
    await editCategory("People");
    await typeInto(nameField("Edit Category"), "Folks");
    await press(dialogButton(nameDialog("Edit Category"), "Cancel"));
    expect(appDialogs()).toEqual([]);
    expect(document.activeElement).toBe(within(category("People")).getByRole("button", { name: "Edit category People" }));

    await editCategory("People");
    await press(dialogButton(nameDialog("Edit Category"), "Save"));
    expect(appDialogs()).toEqual([]);
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    expect(savePending()).toBe(false);
  });

  it("Delete in Edit Category asks first, and its tags become Uncategorized", async () => {
    const { tags } = await mountTags();
    await openEditor();

    await editCategory("People");
    const remove = dialogButton(nameDialog("Edit Category"), "Delete");
    expect(remove.classList.contains("btn-danger")).toBe(true);
    await press(remove);
    expect(confirmMessage()).toBe('Delete category "People"? Tags will become Uncategorized.');
    expect(appDialogs()).toEqual([nameDialog("Edit Category"), confirmation()]);
    expect(dialogButton(confirmation(), "Delete").classList.contains("btn-danger")).toBe(true);
    await answer("Cancel");
    expect(appDialogs()).toEqual([nameDialog("Edit Category")]);
    expect(document.activeElement).toBe(remove);
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);

    await press(remove);
    await answer("Delete");
    expect(appDialogs()).toEqual([]);
    expect(categoryTitles()).toEqual(["Places", "Mood", "Uncategorized"]);
    expect(chipNames("Uncategorized")).toEqual(["Alice", "Bob", "Loose"]);
    expect(optionLabels(footerCategory())).toEqual(["Places", "Mood", "Uncategorized"]);
    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/delete-category", body: { categoryId: "cat-people", newCategoryId: null } }
    ]);
  });

  it("New Category disables Save while the name is empty or another category's, and adds before Uncategorized", async () => {
    const { tags } = await mountTags();
    await openEditor();

    await newCategory();
    const field = nameField("New Category");
    const dialogSave = dialogButton(nameDialog("New Category"), "Save");
    expect(within(nameDialog("New Category")).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
    expect(fieldProblem(field)).toBeNull();
    expect(disabledWithoutIcon(dialogSave)).toBe(true);

    await typeInto(field, "people");
    expect(fieldProblem(field)).toBe("Use a name no other category has.");
    expect(disabledWithoutIcon(dialogSave)).toBe(true);
    await pressEnter(field);
    expect(findNameDialog("New Category")).not.toBeNull();

    await press(dialogButton(nameDialog("New Category"), "Cancel"));
    expect(appDialogs()).toEqual([]);
    expect(savePending()).toBe(false);

    await newCategory();
    expect(nameField("New Category").value).toBe("");
    await typeInto(nameField("New Category"), " Food ");
    await press(dialogButton(nameDialog("New Category"), "Save"));
    expect(appDialogs()).toEqual([]);
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Food", "Uncategorized"]);
    expect(chipNames("Food")).toEqual([]);
    expect(optionLabels(footerCategory())).toEqual(["Places", "Mood", "People", "Food", "Uncategorized"]);
    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: expect.any(String), name: "Food", sortOrder: 3 } }
    ]);
    expect(tags.saves()[0]!.body.id).not.toBe("");
  });

  it("Enter in New tag name adds the tag while Add tag is enabled, and does nothing while the name is empty or another tag's", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await choose(footerCategory(), "cat-people");

    await pressEnter(newTagField());
    await typeInto(newTagField(), "beach");
    expect(addTagButton().disabled).toBe(true);
    await pressEnter(newTagField());
    expect(chipNames("People")).toEqual(["Alice", "Bob"]);
    expect(newTagField().value).toBe("beach");
    expect(savePending()).toBe(false);

    await typeInto(newTagField(), "Sunset");
    newTagField().focus();
    await pressEnter(newTagField());
    expect(chipNames("People")).toEqual(["Alice", "Bob", "Sunset"]);
    expect(newTagField().value).toBe("");
    expect(chipState("Sunset")).toEqual({ has: "none", pending: null });
    expect(document.activeElement).toBe(chipButton("Sunset", "Add tag"));
    expect(tags.saves()).toEqual([]);
  });

  it("adds a tag to the chosen category, not to the playing item, and clears the name", async () => {
    const { tags } = await mountTags();
    await openEditor();
    expect(footerCategory().value).toBe("cat-places");
    expect(disabledWithoutIcon(addTagButton())).toBe(true);

    await addTag("  Sunset ", "cat-mood");
    expect(chipNames("Mood")).toEqual(["Calm", "Sunset"]);
    expect(chipState("Sunset")).toEqual({ has: "none", pending: null });
    expect(newTagField().value).toBe("");
    expect(footerCategory().value).toBe("cat-mood");

    await save();
    expect(tags.saves()).toEqual([{ path: "/api/tag-editor/upsert-tag", body: { name: "Sunset", categoryId: "cat-mood" } }]);
  });

  for (const [how, activate] of [
    ["the pointer", press],
    ["the keyboard", pressWithKeyboard]
  ] as const) {
    it(`Add tag pressed with ${how} moves to the new chip's add, opening its category, and one more press puts it on the item`, async () => {
      await mountTags();
      await openEditor();
      expect(categoryGrid("Mood").hidden).toBe(true);
      await choose(footerCategory(), "cat-mood");
      await typeInto(newTagField(), "Sunset");
      await activate(addTagButton());
      expect(categoryGrid("Mood").hidden).toBe(false);
      expect(document.activeElement).toBe(chipButton("Sunset", "Add tag"));

      await activate(chipButton("Sunset", "Add tag"));
      expect(chipState("Sunset")).toEqual({ has: "none", pending: "add" });
    });

    it(`Add tag pressed with ${how} moves to the new chip's Edit while nothing plays`, async () => {
      await mountTags({ play: false });
      await openEditor();
      await typeInto(newTagField(), "Sunset");
      await activate(addTagButton());
      expect(chipButton("Sunset", "Add tag").disabled).toBe(true);
      expect(document.activeElement).toBe(chipButton("Sunset", "Edit tag"));
    });
  }

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
    await click(closeButton());
    expect(appDialogs()).toEqual([]);

    await openEditor();
    expect(newTagField().value).toBe("Sun");
    expect(footerCategory().value).toBe("cat-people");
  });

  it("the new tag name flags another tag's name, and Add tag is disabled while the name is empty or taken", async () => {
    await mountTags();
    await openEditor();
    const field = newTagField();
    expect(field.closest(".vfield")?.parentElement?.classList.contains("tag-editor-footer-row")).toBe(true);
    expect(fieldProblem(field)).toBeNull();
    expect(disabledWithoutIcon(addTagButton())).toBe(true);
    expect(addTagButton().title).toBe("Add tag");
    expect(addTagButton().getAttribute("aria-label")).toBe("Add tag");

    await typeInto(field, "  ");
    expect(fieldProblem(field)).toBeNull();
    expect(disabledWithoutIcon(addTagButton())).toBe(true);

    await typeInto(field, " CALM ");
    expect(fieldProblem(field)).toBe("Use a name no other tag has.");
    expect(disabledWithoutIcon(addTagButton())).toBe(true);
    await click(addTagButton());
    expect(field.value).toBe(" CALM ");
    expect(savePending()).toBe(false);

    await typeInto(field, "Sunset");
    expect(fieldProblem(field)).toBeNull();
    expect(addTagButton().disabled).toBe(false);
  });

  it("the new tag name's red icon fades out once the name is free, rendered until it has faded", async () => {
    await mountTags();
    await openEditor();
    const field = newTagField();
    const icon = () => field.closest(".vfield")!.querySelector(".vfield-icon");
    await typeInto(field, "Calm");
    expect(icon()?.classList.contains("is-fading-out")).toBe(false);

    await typeInto(field, "Sunset");
    expect(fieldProblem(field)).toBeNull();
    expect(icon()?.classList.contains("is-fading-out")).toBe(true);
    await waitFor(() => expect(icon()).toBeNull());
  });

  it("the Edit Tag dialog opens on the tag's name and category, and Cancel or a click outside closes it", async () => {
    await mountTags();
    await openEditor();
    expect(modalOpen()).toBe(false);

    const edit = chipButton("Beach", "Edit tag");
    await press(edit);
    expect(modalOpen()).toBe(true);
    expect(editor().contains(modal())).toBe(false);
    expect(modalName().value).toBe("Beach");
    expect(document.activeElement).toBe(modalName());
    expect(modalCategory().value).toBe("cat-places");
    expect(optionLabels(modalCategory())).toEqual(["Places", "Mood", "People", "Uncategorized"]);

    await typeInto(modalName(), "Shore");
    await press(modalButton("Cancel"));
    expect(modalOpen()).toBe(false);
    expect(document.activeElement).toBe(edit);
    expect(chipNames("Places")).toEqual(["alps", "Beach"]);

    await press(chipButton("Loose", "Edit tag"));
    expect(modalCategory().value).toBe("uncategorized");
    await click(modal().querySelector(".dialog-body") as HTMLElement);
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
    const logsBefore = mountedServer!.logLines().length;
    await typeInto(modalName(), "   ");
    expect(fieldProblem(modalName())).toBeNull();
    expect(disabledWithoutIcon(modalButton("Save"))).toBe(true);
    await pressEnter(modalName());
    expect(mountedServer!.logLines().slice(logsBefore)).toEqual([]);
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

  it("after Save renames a tag, focus goes to its chip's Edit, and after Delete to the next chip's in its category, or the previous one's", async () => {
    await mountTags();
    await openEditor();

    await press(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), " Shore ");
    await press(modalButton("Save"));
    expect(document.activeElement).toBe(chipButton("Shore", "Edit tag"));

    await press(chipButton("Calm", "Edit tag"));
    await choose(modalCategory(), "cat-people");
    await press(modalButton("Save"));
    expect(chipNames("People")).toEqual(["Alice", "Bob", "Calm"]);
    expect(document.activeElement).toBe(chipButton("Calm", "Edit tag"));

    await deleteTag("Alice");
    expect(document.activeElement).toBe(chipButton("Bob", "Edit tag"));
    await deleteTag("Calm");
    expect(document.activeElement).toBe(chipButton("Bob", "Edit tag"));
    await deleteTag("Bob");
    expect(chipNames("People")).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it("after Delete removes a category, focus goes to the next category's Edit, or the previous one's", async () => {
    await mountTags();
    await openEditor();
    const categoryEdit = (title: string) => within(category(title)).getByRole("button", { name: `Edit category ${title}` });

    await editCategory("Mood");
    await press(dialogButton(nameDialog("Edit Category"), "Delete"));
    await answer("Delete");
    expect(categoryTitles()).toEqual(["Places", "People", "Uncategorized"]);
    expect(document.activeElement).toBe(categoryEdit("People"));

    await editCategory("People");
    await press(dialogButton(nameDialog("Edit Category"), "Delete"));
    await answer("Delete");
    expect(categoryTitles()).toEqual(["Places", "Uncategorized"]);
    expect(document.activeElement).toBe(categoryEdit("Places"));

    await editCategory("Places");
    await press(dialogButton(nameDialog("Edit Category"), "Delete"));
    await answer("Delete");
    expect(categoryTitles()).toEqual(["Uncategorized"]);
    expect(document.activeElement).toBe(document.body);
  });

  it("the Edit Tag dialog takes another tag's name without flagging it, and Save sends the rename", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(chipButton("Alice", "Edit tag"));
    await typeInto(modalName(), "BOB");
    expect(fieldProblem(modalName())).toBeNull();
    expect(modalButton("Save").disabled).toBe(false);
    await pressEnter(modalName());
    expect(modalOpen()).toBe(false);

    await save();
    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/rename-tag", body: { oldName: "Alice", newName: "BOB", newCategoryId: null } }
    ]);
  });

  it("Delete in Edit Tag asks above it, Cancel goes back to it, and confirming deletes the tag with any change held for it", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(chipButton("Bob", "Remove tag"));

    await press(chipButton("Bob", "Edit tag"));
    await typeInto(modalName(), "Robert");
    const remove = modalButton("Delete");
    expect(remove.classList.contains("btn-danger")).toBe(true);
    await press(remove);
    expect(appDialogs()).toEqual([modal(), confirmation()]);
    expect(confirmMessage()).toBe('Delete tag "Bob"?');
    expect(document.activeElement).toBe(dialogButton(confirmation(), "Cancel"));
    expect(dialogButton(confirmation(), "Delete").classList.contains("btn-danger")).toBe(true);

    await answer("Cancel");
    expect(appDialogs()).toEqual([modal()]);
    expect(document.activeElement).toBe(remove);
    expect(modalName().value).toBe("Robert");
    expect(chipNames("People")).toEqual(["Alice", "Bob"]);

    await press(remove);
    await answer("Delete");
    expect(appDialogs()).toEqual([]);
    expect(chipNames("People")).toEqual(["Alice"]);
    await save();
    expect(tags.saves()).toEqual([{ path: "/api/tag-editor/delete-tag", body: { name: "Bob" } }]);
  });

  it("Refresh loads the tags again, asking first when there are changes to drop", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await click(headerButton("Refresh"));
    expect(appDialogs()).toEqual([]);
    expect(tags.modelRequests()).toHaveLength(2);

    await click(chipButton("Calm", "Add tag"));
    await press(headerButton("Refresh"));
    expect(confirmMessage()).toBe("Discard changes?");
    expect(document.activeElement).toBe(dialogButton(confirmation(), "Cancel"));
    expect(dialogButton(confirmation(), "Discard").classList.contains("btn-danger")).toBe(true);
    await answer("Cancel");
    expect(appDialogs()).toEqual([]);
    expect(tags.modelRequests()).toHaveLength(2);
    expect(chipState("Calm").pending).toBe("add");

    tags.model.tags.push({ name: "Snow", categoryId: "cat-places" });
    await press(headerButton("Refresh"));
    await answer("Discard");
    expect(appDialogs()).toEqual([]);
    expect(tags.modelRequests()).toHaveLength(3);
    expect(chipNames("Places")).toEqual(["alps", "Beach", "Snow"]);
    expect(chipState("Calm").pending).toBe(null);
    expect(savePending()).toBe(false);
  });
});

describe("saving", () => {
  it("sends each kind of change in order, staying open and showing them as saved before the server answers", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await editCategory("Places");
    await typeInto(nameField("Edit Category"), "Scenery");
    await press(dialogButton(nameDialog("Edit Category"), "Save"));
    await editCategory("Mood");
    await press(dialogButton(nameDialog("Edit Category"), "Delete"));
    await answer("Delete");
    await addTag("Sunset", "cat-people");
    await click(chipButton("Sunset", "Add tag"));
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));
    await deleteTag("Bob");
    await click(chipButton("Alice", "Add tag"));

    tags.holding = true;
    await save();
    expect(isOpen()).toBe(true);
    expect(relayedLines("Tag editor changes applied")).toEqual([]);
    expect(categoryTitles()).toEqual(["Scenery", "People", "Uncategorized"]);
    expect(chipNames("People")).toEqual(["Alice", "Sunset"]);
    expect(chipState("Shore").has).toBe("all");
    expect(chipState("Sunset").has).toBe("all");
    expect(savePending()).toBe(false);
    expect(tags.modelRequests()).toHaveLength(1);
    await tags.release();
    await expectSaved();

    expect(tags.saves()).toEqual([
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-places", name: "Scenery", sortOrder: 0 } },
      { path: "/api/tag-editor/upsert-category", body: { id: "cat-people", name: "People", sortOrder: 1 } },
      { path: "/api/tag-editor/delete-category", body: { categoryId: "cat-mood", newCategoryId: null } },
      { path: "/api/tag-editor/upsert-tag", body: { name: "Sunset", categoryId: "cat-people" } },
      { path: "/api/tag-editor/rename-tag", body: { oldName: "Beach", newName: "Shore", newCategoryId: null } },
      { path: "/api/tag-editor/delete-tag", body: { name: "Bob" } },
      { path: "/api/tag-editor/apply-item-tags", body: { itemIds: ["item-video"], addTags: ["Sunset", "Alice"], removeTags: [] } }
    ]);
  });

  it("stops at a step the server refuses, says which, and loads the tags again", async () => {
    const { server, tags } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/tag-editor/rename-tag", 500) });
    await openEditor();
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));
    await deleteTag("Calm");
    await click(chipButton("Alice", "Add tag"));

    await save();
    await expectNotice(server, "Tag rename failed (500)");
    expect(isOpen()).toBe(true);
    expect(tags.saves().map((call) => call.path)).toEqual(["/api/tag-editor/rename-tag"]);
    // The tags load again, so the tab shows the server's tags in place of the changes it showed as saved.
    expect(tags.modelRequests()).toHaveLength(2);
    expect(chipNames("Places")).toEqual(["alps", "Beach"]);
    expect(chipState("Alice").has).toBe("none");
  });

  it("a failed save shows its own error, whether the server couldn't be reached or refused it", async () => {
    const { server, tags } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/tag-editor/delete-tag", 0) });
    const deleteAndSave = async (name: string) => {
      await openEditor();
      await deleteTag(name);
      await save();
      await settle();
    };

    await deleteAndSave("Bob");
    await expectNotice(server, "Tag delete failed: Couldn't reach the server.");
    tags.failures.set("/api/tag-editor/delete-tag", 500);
    await deleteAndSave("Bob");
    await expectNotice(server, "Tag delete failed (500)");
    tags.failures.set("/api/tag-editor/delete-tag", 0);
    await deleteAndSave("Alice");
    await expectNotice(server, "Tag delete failed: Couldn't reach the server.");
  });

  it("a tag apply that can't reach the server says so", async () => {
    const { server } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/tag-editor/apply-item-tags", 0) });
    await openEditor();
    await click(chipButton("Alice", "Add tag"));
    await save();
    await expectNotice(server, "Tag apply failed: Couldn't reach the server.");
    expect(chipState("Alice").has).toBe("none");
  });

  it("a tag save the server answers with 401 shows only the pairing prompt, puts the tags back, and logs it", async () => {
    const { server } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/tag-editor/apply-item-tags", 401) });
    await openEditor();
    expect(pairingPrompt().style.display).toBe("none");
    await click(chipButton("Alice", "Add tag"));
    await save();
    await waitFor(() => expect(pairingPrompt().style.display).toBe("flex"));
    await settle();
    expect(openNotices()).toEqual([]);
    expect(chipState("Alice").has).toBe("none");
    await waitFor(() =>
      expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/tag-editor/apply-item-tags", { id: VIDEO_ITEM.id }, 1))
    );
  });

  it("an Auto Tag Apply the server answers with 401 shows only the pairing prompt, puts its rows back, and logs it", async () => {
    const { server } = await mountTags({ setup: (_server, fake) => fake.failures.set("/api/autotag/apply", 401) });
    await openEditor();
    await openAutoTag();
    await scan();
    await click(autoTagButton("Select all"));
    const selected = autoTagStatus();
    expect(pairingPrompt().style.display).toBe("none");

    await click(autoTagButton("Apply"));
    await waitFor(() => expect(pairingPrompt().style.display).toBe("flex"));
    await settle();
    expect(openNotices()).toEqual([]);
    expect(autoTagStatus()).toBe(selected);
    expect(autoTagButton("Apply").disabled).toBe(false);
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/autotag/apply", { id: VIDEO_ITEM.id }, 1)));
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
    await expectSaved();
    const echo = { itemIds: ["item-video"], resolvedItemIds: ["item-video"], addedTags: ["Calm"], removedTags: [] };
    page.stream().emit("itemTagsChanged", 2, echo);
    await settle();
    expect(libraryQueries(server)).toHaveLength(queriesWithoutFilter);

    await pickPreset("preset-beach");
    const before = libraryQueries(server).length;
    await openEditor();
    await click(chipButton("Alice", "Add tag"));
    await save();
    await expectSaved();
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
    await pickPreset("preset-beach");
    const before = libraryQueries(server).length;
    await openEditor();
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));

    await save();
    await expectSaved();
    expect(libraryQueries(server)).toHaveLength(before + 1);
    expect(libraryQueries(server)[before].filterState.selectedTags).toEqual(["Shore"]);
    expect(selectedPresetLabel()).toBe("Beach days");
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual(["Shore"]);
    expect(pick.presetId).toBe("preset-beach");
  });

  it("a renamed tag reaches the Filter tab's unsaved changes and preset list, so its Apply doesn't put the old name back", async () => {
    const { server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
        fake.on("POST", "/api/presets", () => json({}));
      }
    });
    await pickPreset("preset-beach");
    await click(panelTab("Filter"));
    await click(within(byId("filter-dialog")).getByRole("tab", { name: /^Presets/ }));
    await typeInto(byId("filter-new-preset-name"), "Mine");
    await click(byId("filter-add-preset-btn"));

    await openEditor();
    await click(chipButton("Beach", "Edit tag"));
    await typeInto(modalName(), "Shore");
    await click(modalButton("Save"));
    await save();
    await expectSaved();

    await click(panelTab("Filter"));
    await click(byId("filter-apply-btn"));
    const posted = server.requests("POST", "/api/presets").at(-1)!.body;
    expect(posted.map((preset: any) => [preset.name, preset.filterState.selectedTags])).toEqual([
      ["Beach days", ["Shore"]],
      ["Mine", ["Shore"]]
    ]);
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual(["Shore"]);
  });

  it("a deleted tag leaves the applied filter, its preset, the Filters line, and the device's memory", async () => {
    const { server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
      }
    });
    await pickPreset("preset-beach");
    expect(document.getElementById("library-filter-summary")!.textContent).toBe("Filters: 1 tag");
    const before = libraryQueries(server).length;
    await openEditor();
    await deleteTag("Beach");

    await save();
    await expectSaved();
    expect(libraryQueries(server)).toHaveLength(before + 1);
    expect(libraryQueries(server)[before].filterState.selectedTags).toEqual([]);
    // The preset is left with the default filter, which is None.
    expect(selectedPresetLabel()).toBe("None");
    expect((document.getElementById("library-filter-summary") as HTMLElement).hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem("rr_device.filter.applied")!).filter.selectedTags).toEqual([]);
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual([]);
    expect(pick.presetId).toBeUndefined();
  });

  it("another client's rename is applied to the filter, its preset, and the library", async () => {
    const { page, server } = await mountTags({
      setup: (fake) => {
        serveLibrary(fake);
        fake.on("GET", "/api/presets", () => json([BEACH_PRESET]));
      }
    });
    await pickPreset("preset-beach");
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
    expect(selectedPresetLabel()).toBe("Beach days");
    expect(JSON.parse(localStorage.getItem("rr_device.filter.applied")!)).toMatchObject({
      filter: { selectedTags: ["Shore"] },
      preset: "Beach days",
      unchanged: true
    });
    const pick = await nextPick(server);
    expect(pick.filterState.selectedTags).toEqual(["Shore"]);
    expect(pick.presetId).toBe("preset-beach");
  });
});

describe("Auto Tag", () => {
  it("opens over the whole page from the Tags tab, with focus on its X, and gives focus back to its button when it closes", async () => {
    await mountTags();
    await openEditor();
    expect(findAutoTag()).toBeNull();
    await openAutoTag();
    expect(byId("fullscreen-stage").contains(autoTag())).toBe(true);
    expect(panel().contains(autoTag())).toBe(false);
    expect(autoTag().open).toBe(true);
    expect(autoTag().getAttribute("aria-labelledby")).toBe("autotag-title");
    expect(byId("autotag-title").textContent).toBe("Auto Tag");
    expect(document.activeElement).toBe(autoTagButton("Close"));
    // Its footer has Cancel, then Apply at its right.
    expect(Array.from(autoTag().querySelectorAll(".autotag-footer button")).map((button) => button.textContent)).toEqual(["Cancel", "Apply"]);
    expect(autoTagButton("Apply").disabled).toBe(true);

    await press(autoTagButton("Close"));
    expect(findAutoTag()).toBeNull();
    await settle();
    expect(document.activeElement).toBe(headerButton("Auto Tag"));
    expect(isOpen()).toBe(true);

    // Escape closes Auto Tag, not the panel.
    await openAutoTag();
    fireEvent.keyDown(autoTag(), { key: "Escape" });
    await settle();
    expect(findAutoTag()).toBeNull();
    expect(isOpen()).toBe(true);
  });

  it("shows a placeholder before any scan, and another when a scan finds nothing", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("Scan to find files whose names contain a tag's name.");
    expect(autoTagStatus()).toBe("");

    tags.scan = { rows: [] };
    await scan();
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("No file names contain any tag's name.");
    expect(autoTagStatus()).toBe("Scan complete: no matching tags found.");
  });

  it("scans enabled sources, or the full library once that is checked, which it remembers", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
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

  it("shows progress and turns off Scan Files, Apply, the X, Cancel, and Escape while it scans", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();
    await click(rowCheck("beach"));
    expect(autoTagButton("Apply").disabled).toBe(false);
    expect(progressShown()).toBe(false);

    tags.holding = true;
    await scan();
    expect(progressShown()).toBe(true);
    expect(autoTagStatus()).toBe("Scanning…");
    expect(scanButton().disabled).toBe(true);
    expect(autoTagButton("Apply").disabled).toBe(true);
    expect(autoTagButton("Close").disabled).toBe(true);
    expect(autoTagButton("Cancel").disabled).toBe(true);
    fireEvent.keyDown(autoTag(), { key: "Escape" });
    await settle();
    expect(findAutoTag()).not.toBeNull();
    // The browser cancelling or closing it, as Android's back gesture does, waits too: a close opens it again.
    const cancel = new Event("cancel", { cancelable: true });
    autoTag().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    autoTag().close();
    await settle();
    expect(autoTag().open).toBe(true);

    await tags.release();
    expect(progressShown()).toBe(false);
    expect(scanButton().disabled).toBe(false);
    expect(autoTagButton("Close").disabled).toBe(false);
    expect(autoTagButton("Cancel").disabled).toBe(false);
    expect(tags.scans()).toHaveLength(2);
    // It covers the page, so a click on its own padding isn't a click outside it.
    await click(autoTag());
    expect(findAutoTag()).not.toBeNull();
  });

  it("lists the tags with files to change by name, each collapsed, with a summary", async () => {
    await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();

    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 0/3 selected changes.");
    expect(Array.from(results().querySelectorAll(".autotag-table-head span")).map((node) => node.textContent)).toEqual([
      "",
      "Apply",
      "Tag / File",
      "Total matched",
      "To be changed"
    ]);
    expect(rowNames()).toEqual(["beach", "Sunset"]);
    expect(rowCells(row("beach"))).toEqual(["beach", "3", "2"]);
    expect(rowFiles("beach")).toBeNull();
    expect(rowCheck("beach").checked).toBe(false);
    expect(rowCheck("beach").getAttribute("aria-label")).toBe("Apply beach");
    expect(autoTagButton("Apply").disabled).toBe(true);

    await expand("beach");
    expect(within(row("beach")).getByRole("button", { name: "Collapse" }).textContent).toBe("expand_more");
    expect(fileNames("beach")).toEqual(["beach a.mp4", "beach b.mp4"]);
    expect((rowFiles("beach")!.querySelector(".autotag-file span") as HTMLElement).title).toBe("C:\\media\\beach a.mp4");
    await click(within(row("beach")).getByRole("button", { name: "Collapse" }));
    expect(rowFiles("beach")).toBeNull();
    expect(within(row("beach")).getByRole("button", { name: "Expand" }).textContent).toBe("chevron_right");
  });

  it("lines each count up under its header: the header and every row share one column template", async () => {
    useStylesheet();
    await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();
    const head = results().querySelector(".autotag-table-head") as HTMLElement;
    const columns = getComputedStyle(head).gridTemplateColumns;
    // Both counts take a fixed width rather than their own content's.
    expect(columns).toBe("40px 40px minmax(0, 1fr) 7rem 7rem");
    for (const name of rowNames()) {
      expect(getComputedStyle(row(name).querySelector(".autotag-row-main") as HTMLElement).gridTemplateColumns).toBe(columns);
    }
    expect(getComputedStyle(head).columnGap).toBe("12px");
    for (const cell of results().querySelectorAll(".autotag-count")) {
      expect(getComputedStyle(cell).textAlign).toBe("center");
    }
  });

  it("a row's box selects its files, and shows when only some are selected", async () => {
    await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();
    await expand("beach");

    await click(rowCheck("beach"));
    expect(fileCheck("beach", "beach a.mp4").checked).toBe(true);
    expect(fileCheck("beach", "beach b.mp4").checked).toBe(true);
    expect(rowCheck("beach").checked).toBe(true);
    expect(rowCheck("beach").indeterminate).toBe(false);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 2/3 selected changes.");
    expect(autoTagButton("Apply").disabled).toBe(false);
    expect(savePending()).toBe(false);

    await click(fileCheck("beach", "beach b.mp4"));
    expect(rowCheck("beach").checked).toBe(false);
    expect(rowCheck("beach").indeterminate).toBe(true);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 1/3 selected changes.");

    await click(rowCheck("beach"));
    expect(rowCheck("beach").checked).toBe(true);
    expect(rowCheck("beach").indeterminate).toBe(false);
    await click(rowCheck("beach"));
    expect(fileCheck("beach", "beach a.mp4").checked).toBe(false);
    expect(autoTagButton("Apply").disabled).toBe(true);
  });

  it("View all matches shows files that have the tag checked and disabled, which are never sent", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();
    await expand("beach");
    await click(fileCheck("beach", "beach a.mp4"));

    await click(autoTagBox("View all matches"));
    expect(rowNames()).toEqual(["Alps", "beach", "Sunset"]);
    expect(fileNames("beach")).toEqual(["beach a.mp4", "beach b.mp4", "beach c.mp4"]);
    const tagged = fileCheck("beach", "beach c.mp4");
    expect(tagged.checked).toBe(true);
    expect(tagged.disabled).toBe(true);
    expect(tagged.title).toBe("Already has this tag");
    expect(fileCheck("beach", "beach b.mp4").disabled).toBe(false);
    // Two of beach's three files show checked: the one selected and the one that has the tag.
    expect(rowCheck("beach").indeterminate).toBe(true);
    // Alps has nothing to change: its file shows checked, and so does its box, which can't change anything.
    expect(rowCheck("Alps").checked).toBe(true);
    expect(rowCheck("Alps").disabled).toBe(true);
    await expand("Alps");
    expect(fileCheck("Alps", "alps.mp4")).toMatchObject({ checked: true, disabled: true });
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 1/3 selected changes.");

    await click(fileCheck("beach", "beach b.mp4"));
    expect(rowCheck("beach").checked).toBe(true);
    await click(autoTagBox("View all matches"));
    expect(rowNames()).toEqual(["beach", "Sunset"]);
    expect(fileNames("beach")).toEqual(["beach a.mp4", "beach b.mp4"]);
    // Alps showed no files without View all, so it collapsed.
    await click(autoTagBox("View all matches"));
    expect(rowFiles("Alps")).toBeNull();
    expect(rowFiles("beach")).not.toBeNull();

    await click(autoTagButton("Apply"));
    expect(tags.saves()).toEqual([
      {
        path: "/api/autotag/apply",
        body: { assignments: [{ tagName: "beach", itemPaths: ["C:\\media\\beach a.mp4", "C:\\media\\beach b.mp4"] }] }
      }
    ]);
  });

  it("Select all checks every file without its tag, and Apply sends them, keeps Auto Tag open, and shows them as tagged", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();

    await click(autoTagButton("Select all"));
    expect(rowCheck("beach").checked).toBe(true);
    expect(rowCheck("Sunset").checked).toBe(true);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 3/3 selected changes.");
    await click(autoTagButton("Deselect all"));
    expect(rowCheck("beach").checked).toBe(false);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 0/3 selected changes.");
    expect(autoTagButton("Apply").disabled).toBe(true);

    await click(autoTagButton("Select all"));
    tags.holding = true;
    await click(autoTagButton("Apply"));
    // Before the server answers, the files show as having their tag, and nothing is left to change.
    expect(findAutoTag()).not.toBeNull();
    expect(isOpen()).toBe(true);
    expect(results().querySelector(".filter-hint")?.textContent).toBe("No rows to show.");
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 0/0 selected changes.");
    expect(autoTagButton("Apply").disabled).toBe(true);
    await click(autoTagBox("View all matches"));
    await expand("beach");
    expect(fileCheck("beach", "beach a.mp4")).toMatchObject({ checked: true, disabled: true });
    expect(rowCells(row("beach"))).toEqual(["beach", "3", "0"]);
    await tags.release();
    await expectSaved();
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
  });

  it("Cancel clears the scan and closes; the X closes and keeps it; the Tags tab's Refresh and Save leave it", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();
    await click(rowCheck("Sunset"));

    await press(autoTagButton("Close"));
    expect(findAutoTag()).toBeNull();
    await click(headerButton("Refresh"));
    expect(appDialogs()).toEqual([]);
    expect(tags.modelRequests()).toHaveLength(2);
    await openAutoTag();
    expect(rowCheck("Sunset").checked).toBe(true);
    expect(autoTagStatus()).toBe("Scan complete: 3 matching tags, 6 matches, 1/3 selected changes.");
    expect(savePending()).toBe(false);

    await press(autoTagButton("Cancel"));
    expect(findAutoTag()).toBeNull();
    expect(appDialogs()).toEqual([]);
    expect(tags.saves()).toEqual([]);
    await openAutoTag();
    expect(autoTagStatus()).toBe("");
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("Scan to find files whose names contain a tag's name.");
  });

  it("shows no rows when every match already has its tag, with the scan's summary in place of Scanning…", async () => {
    await mountTags({ setup: (_server, tags) => (tags.scan = { rows: [SCAN.rows[2]] }) });
    await openEditor();
    await openAutoTag();
    await scan();
    expect(results().querySelector(".filter-hint")?.textContent).toBe("No rows to show.");
    expect(autoTagStatus()).toBe("Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.");
    expect(progressShown()).toBe(false);

    await click(autoTagBox("View all matches"));
    expect(rowNames()).toEqual(["Alps"]);
    expect(autoTagStatus()).toBe("Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.");
  });

  it("a failed scan shows its error beside Scan Files, with the results as before any scan, until the next scan", async () => {
    const { tags } = await mountTags();
    await openEditor();
    await openAutoTag();
    await scan();
    await click(rowCheck("beach"));
    expect(autoTagButton("Apply").disabled).toBe(false);

    tags.scanStatus = 500;
    await scan();
    expect(autoTagStatus()).toBe("Scan failed: HTTP 500");
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("Scan to find files whose names contain a tag's name.");
    expect(autoTagButton("Apply").disabled).toBe(true);
    expect(progressShown()).toBe(false);
    expect(scanButton().disabled).toBe(false);
    expect(openNotices()).toEqual([]);
    expect(relayedLines("Scan")).toEqual([]);

    tags.scanStatus = 200;
    await scan();
    expect(autoTagStatus()).toMatch(/^Scan complete: 3 matching tags/);
    expect(rowNames().length).toBeGreaterThan(0);
  });

  it("a scan that can't reach the server says so, and Cancel clears it", async () => {
    await mountTags({ setup: (fake) => fake.on("POST", "/api/autotag/scan", () => Promise.reject(new TypeError("NetworkError when attempting to fetch resource."))) });
    await openEditor();
    await openAutoTag();
    await scan();
    expect(autoTagStatus()).toBe("Scan failed: Couldn't reach the server.");
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("Scan to find files whose names contain a tag's name.");
    expect(openNotices()).toEqual([]);

    await press(autoTagButton("Cancel"));
    await openAutoTag();
    expect(autoTagStatus()).toBe("");
  });

  it("a scan answered with a page that isn't JSON names its content type", async () => {
    await mountTags({ setup: (fake) => fake.on("POST", "/api/autotag/scan", () => htmlPage()) });
    await openEditor();
    await openAutoTag();
    await scan();
    expect(autoTagStatus()).toBe("Scan failed: The server sent an unexpected response (text/html).");
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("Scan to find files whose names contain a tag's name.");
  });

  it("a scan answered 401 shows only the pairing prompt, nothing in place or as a message, and logs it", async () => {
    const { server } = await mountTags({ setup: (_server, tags) => (tags.scanStatus = 401) });
    await openEditor();
    await openAutoTag();
    await scan();
    await waitFor(() => expect(pairingPrompt().style.display).toBe("flex"));
    expect(autoTagStatus()).toBe("");
    expect(results().querySelector(".autotag-empty")?.textContent).toBe("Scan to find files whose names contain a tag's name.");
    expect(openNotices()).toEqual([]);
    expect(relayedLines("Scan")).toEqual([]);
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/autotag/scan", { id: VIDEO_ITEM.id }, 1)));
  });
});

describe("storage", () => {
  it("adds only its expanded categories to the device's memory, and Scan full library to browser storage", async () => {
    await mountTags();
    await openEditor();
    await click(categoryToggle("Mood"));
    await click(chipButton("Calm", "Add tag"));
    await openAutoTag();
    await click(autoTagBox("Scan full library"));
    await scan();
    await click(rowCheck("beach"));
    await click(autoTagButton("Apply"));
    await click(autoTagButton("Close"));
    await save();
    await expectSaved();

    // The panel and the Library tab remember their state on this device, which their own tests cover.
    expect(storageKeys(localStorage).filter((key) => !key.startsWith("rr_device."))).toEqual(["rr_autoTagScanFullLibrary", "rr_clientId"]);
    expect(storageKeys(localStorage)).toContain("rr_device.tags.expandedCategories");
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId"]);
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
    const toggle = categoryToggle("Places");
    toggle.focus();
    await click(toggle);
    expect(categoryButton("Places", "Collapse category")).toBe(toggle);
    expect(document.activeElement).toBe(toggle);

    await openAutoTag();
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
