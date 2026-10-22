// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import { REFRESH_GATHER_MS } from "../../stats/coalescedRefresh";
import { createFakePresets, type FakePresets } from "../fakePresetServer";
import { REMOTE_CONNECTIONS_OFF } from "../serverReasons";
import {
  closeNotices,
  COMPATIBLE_VERSION,
  DEFAULT_VIEWPORT,
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
  pressRatingKey,
  ratingRequests,
  resetPage,
  currentStyle,
  scrollOnFocus,
  selectedPresetLabel,
  setViewport,
  settle,
  sliderValue,
  status,
  stubStarLayout,
  stubRowLayout,
  stubReducedMotion,
  stubScroller,
  tapStars,
  unauthorizedLogLine,
  useStylesheet,
  xFor,
  type MountedPage
} from "./pageHarness";

const SOURCES = [
  { id: "source-1", displayName: "Movies", rootPath: "C:\\media\\movies", isEnabled: true },
  { id: "source-2", displayName: null, rootPath: "C:\\media\\photos", isEnabled: true },
  { id: "source-3", displayName: "Archive", rootPath: "D:\\archive", isEnabled: false }
];

const TAG_MODEL = {
  categories: [
    { id: "cat-people", name: "People", sortOrder: 1 },
    { id: "cat-places", name: "Places", sortOrder: 0 },
    { id: "cat-empty", name: "Empty", sortOrder: 2 },
    { id: "cat-mood", name: "Mood", sortOrder: 1 }
  ],
  tags: [
    { name: "Beach", categoryId: "cat-places" },
    { name: "alps", categoryId: "cat-places" },
    { name: "Bob", categoryId: "cat-people" },
    { name: "Alice", categoryId: "cat-people" },
    { name: "Calm", categoryId: "cat-mood" }
  ],
  items: []
};

const FAVORITES_PRESET = { id: "preset-favorites", name: "Favorites", filterState: { favoritesMode: "only" } };
const BEACH_PRESET = { id: "preset-beach", name: "Beach days", filterState: { selectedTags: ["Beach"] } };
const RECENT_PRESET = { id: "preset-recent", name: "Recent", filterState: { onlyNeverPlayed: true } };

/** A preset that sets something in every part of the dialog, with "Ghost", a tag the catalog does not have. */
const RICH_PRESET = {
  id: "preset-rich",
  name: "Rich",
  filterState: {
    favoritesMode: "only",
    mediaTypeFilter: 1,
    audioFilter: 2,
    includedSourceIds: ["source-1"],
    minDuration: "00:01:30",
    maxDuration: "01:01:40",
    globalMatchMode: false,
    categoryLocalMatchModes: { "cat-people": 1 },
    selectedTags: ["Beach", "Ghost"],
    excludedTags: ["Bob"]
  }
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

/** The fake server keeps presets by id, answering the per-preset routes as the server does. */
function servePresets(server: FakeServer, initial: FakePresets["list"]): FakePresets {
  const presets = createFakePresets(initial);
  server.on("GET", "/api/presets", (call) => presets.answer("GET", call.path, call.body)!);
  server.fallback((call) => presets.answer(call.method, call.path, call.body));
  return presets;
}

interface FilterPage {
  page: MountedPage;
  server: FakeServer;
  presets: FakePresets;
}

/** Mounts the page against the sources, tags, and presets above, and waits for it to be ready. */
async function mountFilter(
  presetList: FakePresets["list"] = [],
  setup: (server: FakeServer) => void = () => {}
): Promise<FilterPage> {
  const server = new FakeServer();
  server.on("GET", "/api/sources", () => json(SOURCES));
  server.on("POST", "/api/tag-editor/model", () => json(TAG_MODEL));
  server.on("POST", "/api/random", () => json(VIDEO_ITEM));
  const presets = servePresets(server, presetList);
  setup(server);
  const page = mountPage({ server });
  await pageReady(server);
  await settle();
  return { page, server, presets };
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

/** Types `text` and leaves the field, as a user does before pressing a button. */
async function type(element: Element, text: string): Promise<void> {
  fireEvent.input(element, { target: { value: text } });
  fireEvent.change(element);
  await settle();
}

function dialog(): HTMLElement {
  return document.getElementById("filter-dialog") as HTMLElement;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function panel(): HTMLElement {
  return byId("panel");
}

/** Whether the panel is open on the Filter tab. */
function isOpen(): boolean {
  return !panel().hidden && !byId("panel-page-filter").hidden;
}

/** A tab of the panel's own tab row, apart from the Filter tab's section tabs. */
function panelTab(name: "Library" | "Filter" | "Tags"): HTMLButtonElement {
  // A tab's name says so while it holds unsaved changes.
  return within(panel().querySelector(".panel-tablist") as HTMLElement).getByRole("tab", { name: new RegExp(`^${name}(, unsaved changes)?$`), hidden: true }) as HTMLButtonElement;
}

/** Opens the panel with the panel button, unless it is open, and chooses the Filter tab. */
async function chooseFilterTab(): Promise<void> {
  if (panel().hidden) {
    await click(byId("panel-btn"));
  }
  await click(panelTab("Filter"));
}

async function openDialog(): Promise<void> {
  await chooseFilterTab();
  await waitFor(() => expect(isOpen()).toBe(true));
}

/** Closes the panel with its Close. */
async function closePanel(): Promise<void> {
  await click(byId("panel-close-btn"));
  expect(panel().hidden).toBe(true);
}

function dialogButton(name: string | RegExp): HTMLButtonElement {
  return within(dialog()).getByRole("button", { name }) as HTMLButtonElement;
}

function applyButton(): HTMLButtonElement {
  return dialogButton("Apply");
}

function discardButton(): HTMLButtonElement {
  return dialogButton("Discard changes");
}

function clearAllButton(): HTMLButtonElement {
  return dialogButton("Clear all filters");
}

/** Apply's unsaved-changes dot. */
function applyDot(): HTMLElement {
  return applyButton().querySelector<HTMLElement>(".unsaved-dot")!;
}

/**
 * Whether Apply shows that the tab has changes to apply: orange, with its unsaved-changes dot, and enabled, as Discard
 * changes is. Without changes, it shows neither, and both are disabled.
 */
function applyShowsChanges(): boolean {
  const changes = applyButton().classList.contains("has-pending");
  expect(applyDot().hidden).toBe(!changes);
  expect(applyButton().disabled).toBe(!changes);
  expect(discardButton().disabled).toBe(!changes);
  return changes;
}

async function apply(): Promise<void> {
  await click(applyButton());
}

async function showTab(name: "General" | "Tags" | "Presets"): Promise<void> {
  await click(within(dialog()).getByRole("tab", { name }));
}

/** The shown tab's name, without the red icon a flagged field adds. */
function selectedTab(): string {
  const tab = within(dialog()).getByRole("tab", { selected: true });
  return Array.from(tab.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join("");
}

/** Whether a section's tab shows the red icon of a flagged field, not counting one that is fading out. */
function tabMarked(name: "General" | "Tags" | "Presets"): boolean {
  const tab = within(dialog()).getByRole("tab", { name });
  const marked = tab.querySelector(".section-problem:not(.is-fading-out)") !== null;
  expect(tab.title).toBe(marked ? "A field here is not valid" : "");
  return marked;
}

/** A field's red icon, or null while it is not flagged, as while it fades out. */
function fieldIcon(field: HTMLElement): HTMLElement | null {
  return field.closest(".vfield")?.querySelector<HTMLElement>(".vfield-icon:not(.is-fading-out)") ?? null;
}

/** The tooltip that describes a flagged field. */
function tooltipOf(field: HTMLElement): HTMLElement | null {
  const id = field.getAttribute("aria-describedby");
  return id ? document.getElementById(id) : null;
}

/** Whether a flagged field's tooltip shows, not counting one that is fading out. */
function tooltipShown(field: HTMLElement): boolean {
  const tip = tooltipOf(field);
  return !!tip && tip.classList.contains("is-shown") && !tip.classList.contains("is-fading-out");
}

/**
 * Whether a field holds the action, and whether the action shows it: the red badge of a flagged field, or the red dot
 * Add Preset and Update show in its place, not one fading out, or, for Apply, which has no badge, its unsaved-changes
 * dot turned red.
 */
function heldState(button: HTMLButtonElement): { held: boolean; marked: boolean } {
  const held = button.getAttribute("aria-disabled") === "true";
  const dot = button.querySelector<HTMLElement>(".unsaved-dot");
  if (dot) {
    expect(button.querySelector(".btn-problem")).toBeNull();
    return { held, marked: !dot.hidden && button.classList.contains("shows-problem") };
  }
  return { held, marked: button.querySelector(".btn-problem:not(.is-fading-out), .held-dot:not(.is-fading-out)") !== null };
}

function heading(): string {
  return byId("filter-dialog-heading").textContent ?? "";
}

function box(label: string): HTMLInputElement {
  return within(dialog()).getByLabelText(label) as HTMLInputElement;
}

type FlagFilterName = "Favorites" | "Blacklisted";
type FlagMode = "off" | "only" | "excluded";

/** Found while its tab is hidden too, as `box` finds checkboxes. */
function flagSelect(name: FlagFilterName): HTMLSelectElement {
  return within(dialog()).getByRole("combobox", { name: `${name} filter`, hidden: true }) as HTMLSelectElement;
}

/** What a flag filter's row shows: its checkbox, its dropdown's choice, and whether the dropdown can be used. */
function flagRow(name: FlagFilterName): { checked: boolean; choice: string; disabled: boolean } {
  return { checked: box(name).checked, choice: flagSelect(name).value, disabled: flagSelect(name).disabled };
}

async function chooseFlag(name: FlagFilterName, choice: "only" | "excluded"): Promise<void> {
  fireEvent.change(flagSelect(name), { target: { value: choice } });
  await settle();
}

/** Sets a flag filter to a mode through its checkbox and dropdown. */
async function setFlag(name: FlagFilterName, mode: FlagMode): Promise<void> {
  if (box(name).checked !== (mode !== "off")) {
    await click(box(name));
  }
  if (mode !== "off") {
    await chooseFlag(name, mode);
  }
}

const FAVORITES_DEFAULT = { checked: false, choice: "only", disabled: true };
const BLACKLISTED_DEFAULT = { checked: true, choice: "excluded", disabled: false };

function chip(name: string): HTMLElement {
  const found = Array.from(dialog().querySelectorAll<HTMLElement>(".tag-chip")).find(
    (candidate) => candidate.querySelector(".tag-chip-label")?.textContent === name
  );
  if (!found) {
    throw new Error(`No tag chip named ${name}.`);
  }
  return found;
}

function chipState(name: string): string {
  const element = chip(name);
  const include = within(element).getByTitle("Include").classList.contains("is-selected");
  const exclude = within(element).getByTitle("Exclude").classList.contains("is-selected");
  if (element.classList.contains("state-all") && include && !exclude) {
    return "include";
  }
  if (element.classList.contains("state-none") && exclude && !include) {
    return "exclude";
  }
  if (!element.classList.contains("state-all") && !element.classList.contains("state-none") && !include && !exclude) {
    return "none";
  }
  throw new Error(`Tag chip ${name} shows a mixed state.`);
}

async function includeTag(name: string): Promise<void> {
  await click(within(chip(name)).getByTitle("Include"));
}

async function excludeTag(name: string): Promise<void> {
  await click(within(chip(name)).getByTitle("Exclude"));
}

function category(title: string): HTMLElement {
  const found = Array.from(dialog().querySelectorAll<HTMLElement>(".tag-category")).find(
    (candidate) => candidate.querySelector(".tag-category-name")?.textContent === title
  );
  if (!found) {
    throw new Error(`No tag category named ${title}.`);
  }
  return found;
}

function categoryTitles(): string[] {
  return Array.from(dialog().querySelectorAll(".tag-category-name")).map((node) => node.textContent ?? "");
}

function chipNames(title: string): string[] {
  return Array.from(category(title).querySelectorAll(".tag-chip-label")).map((node) => node.textContent ?? "");
}

function categoryGrid(title: string): HTMLElement {
  return category(title).querySelector(".tag-grid") as HTMLElement;
}

/** A category's match mode, by its accessible name. */
function matchMode(title: string): HTMLSelectElement {
  return within(category(title)).getByRole("combobox", { name: `Match mode for ${title}`, hidden: true }) as HTMLSelectElement;
}

function categoryToggle(title: string): HTMLButtonElement {
  return category(title).querySelector(".tag-category-toggle") as HTMLButtonElement;
}

function presetSelectInDialog(): HTMLSelectElement {
  return byId<HTMLSelectElement>("filter-dialog-preset-select");
}

/** Chooses the preset Choose Preset names `name`, or None for an empty name. Its options' values are ids. */
async function chooseInDialog(name: string): Promise<void> {
  const option = [...presetSelectInDialog().options].find((candidate) => (name ? candidate.textContent === name : candidate.value === ""));
  fireEvent.change(presetSelectInDialog(), { target: { value: option?.value ?? "no-such-preset" } });
  await settle();
}

/** The name of the preset Choose Preset has chosen, or empty for None. */
function chosenInDialog(): string {
  const select = presetSelectInDialog();
  return select.value === "" ? "" : ([...select.options].find((option) => option.value === select.value)?.textContent ?? "");
}

function loadButton(): HTMLButtonElement {
  return byId<HTMLButtonElement>("filter-load-preset-btn");
}

/** Chooses a preset, or None for an empty name, and loads its filter into the tab with Load. */
async function loadInDialog(name: string): Promise<void> {
  await chooseInDialog(name);
  await click(loadButton());
}

function presetRows(): string[] {
  return Array.from(dialog().querySelectorAll(".filter-preset-name")).map((node) => node.textContent ?? "");
}

function presetRow(name: string): HTMLElement {
  const found = Array.from(dialog().querySelectorAll<HTMLElement>(".filter-preset-row")).find(
    (candidate) => candidate.querySelector(".filter-preset-name")?.textContent === name
  );
  if (!found) {
    throw new Error(`No preset row named ${name}.`);
  }
  return found;
}

function rowButton(name: string, label: "Edit preset"): HTMLButtonElement {
  return within(presetRow(name)).getByRole("button", { name: `${label} ${name}` }) as HTMLButtonElement;
}

function presetHandle(name: string): HTMLButtonElement {
  return within(presetRow(name)).getByRole("button", { name: `Reorder ${name}` }) as HTMLButtonElement;
}

/** What screen readers last heard about a preset moving. */
function presetAnnouncement(): string {
  return byId("filter-panel-presets").querySelector("[aria-live]")?.textContent ?? "";
}

/** The in-app dialogs open, in document order: Edit Preset, inside the filter dialog, comes before a confirmation. */
function appDialogs(): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog"));
}

function topDialog(): HTMLDialogElement {
  return appDialogs().at(-1)!;
}

function buttonIn(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === text);
  if (!found) {
    throw new Error(`No ${text} button in the dialog.`);
  }
  return found;
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

/** Opens Edit Preset on a preset row and returns it. */
async function editPreset(name: string): Promise<HTMLDialogElement> {
  await press(rowButton(name, "Edit preset"));
  const edit = topDialog();
  expect(edit.querySelector("h3")?.textContent).toBe("Edit Preset");
  return edit;
}

/** Deletes a preset through Edit Preset, confirming. */
async function deletePreset(name: string): Promise<void> {
  const edit = await editPreset(name);
  await press(buttonIn(edit, "Delete"));
  await press(buttonIn(topDialog(), "Delete"));
  expect(appDialogs()).toEqual([]);
}

async function addPreset(name: string): Promise<void> {
  fireEvent.input(byId("filter-new-preset-name"), { target: { value: name } });
  await click(dialogButton("Add preset"));
}

/** Whether the page has relayed `text`, a message or a state with no message, whatever was playing. */
function relayed(server: FakeServer, text: string): boolean {
  return server.logLines().some((line) => line.startsWith(`status=${text} hasCurrent=`));
}

/** Expects the in-app notice to show `message`, alone, with the `last.log` line a message gets, then closes it. */
async function expectNotice(server: FakeServer, message: string, logText = message): Promise<void> {
  await waitFor(() => expect(openNotices()).toEqual([message]));
  await waitFor(() => expect(server.logLines()).toContain(statusLogLine(logText, null, 0)));
  await closeNotices();
  expect(openNotices()).toEqual([]);
}

/** The header's pairing prompt, found while it is hidden too. */
function pairingPrompt(): HTMLElement {
  return screen.getByRole("button", { name: "Pair", hidden: true }).closest(".pair-section") as HTMLElement;
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

/** Applies the Filter tab and waits for the library to start over with the new filter. Beside the player it stays open. */
async function applyAndWait(server: FakeServer): Promise<any> {
  const before = libraryQueries(server).length;
  await apply();
  await waitFor(() => expect(libraryQueries(server).length).toBe(before + 1));
  expect(isOpen()).toBe(true);
  // A second Apply within a second relays nothing more, as the relay holds back a repeat.
  await waitFor(() => expect(relayed(server, "Filters applied.")).toBe(true));
  return libraryQueries(server)[before].filterState;
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
  it("opens on General from the panel's Filter tab after loading sources, tags, and presets", async () => {
    const { server } = await mountFilter([FAVORITES_PRESET]);
    const presetLoads = server.requests("GET", "/api/presets").length;
    expect(isOpen()).toBe(false);

    await openDialog();

    expect(server.requests("GET", "/api/sources")).toHaveLength(1);
    expect(server.requests("POST", "/api/tag-editor/model").map((call) => call.body)).toEqual([{ itemIds: [] }]);
    expect(server.requests("GET", "/api/presets")).toHaveLength(presetLoads + 1);
    expect(heading()).toBe("Preset: None");
    expect(selectedTab()).toBe("General");
    expect(byId("filter-panel-general").style.display).toBe("block");
    expect(byId("filter-panel-tags").style.display).toBe("none");
    expect(byId("filter-panel-presets").style.display).toBe("none");
    expect(applyShowsChanges()).toBe(false);
  });

  it("has Clear all filters, Discard changes, and Apply as icon buttons, each with its tooltip", async () => {
    await mountFilter();
    await openDialog();
    const footer = dialog().querySelector(".filter-dialog-footer")!;
    expect(
      Array.from(footer.querySelectorAll("button")).map((button) => [
        button.id,
        button.className.split(" ").includes("icon-btn"),
        button.getAttribute("aria-label"),
        button.title,
        button.querySelector(".material-symbol-icon")?.textContent
      ])
    ).toEqual([
      ["filter-clear-all-btn", true, "Clear all filters", "Clear all filters", "filter_alt_off"],
      ["filter-discard-btn", true, "Discard changes", "Discard changes", "undo"],
      ["filter-apply-btn", true, "Apply", "Apply", "save"]
    ]);
    // Only Apply has a dot.
    expect(footer.querySelectorAll(".unsaved-dot")).toHaveLength(1);
    expect(applyDot().parentElement).toBe(applyButton());
  });

  it("has no Refresh: its heading row holds only the heading", async () => {
    await mountFilter();
    await openDialog();
    expect(within(dialog()).queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(byId("filter-dialog-refresh-btn")).toBeNull();
    expect(Array.from(dialog().querySelector(".filter-dialog-header")!.children).map((child) => child.id)).toEqual(["filter-dialog-heading"]);
  });

  it("its sections are text tabs in the shared tab look, marked active by aria-selected in orange, with no border", async () => {
    await mountFilter();
    await openDialog();
    useStylesheet();
    const tabs = within(dialog()).getAllByRole("tab");
    expect(tabs.map((tab) => tab.className)).toEqual(["tab text-tab filter-tab", "tab text-tab filter-tab", "tab text-tab filter-tab"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);

    const [general, tags] = tabs.map((tab) => currentStyle(tab));
    // The heading's size and weight, the 44 px touch height, and no border; the page's text color until active, then orange.
    expect([general!.fontSize, general!.fontWeight, general!.minHeight, general!.paddingLeft, general!.borderTopWidth]).toEqual(["18.4px", "700", "44px", "12px", "0px"]);
    expect(tags!.color).toBe("#e0e0e0");
    expect(general!.color).toBe("#ef7f22");
    expect(getComputedStyle(dialog().querySelector(".filter-dialog-tabstrip")!).gap).toBe("4px");
  });

  it("keeps Choose Preset's row on one line, the dropdown taking the room Load and Update leave, and spaces its footer as the Tags tab's", async () => {
    await mountFilter();
    await openDialog();
    useStylesheet();
    const select = dialog().querySelector("#filter-dialog-preset-select") as HTMLSelectElement;
    expect(getComputedStyle(select.parentElement!).flexWrap).toBe("nowrap");
    const chosen = getComputedStyle(select);
    expect([chosen.flexGrow, chosen.flexShrink, chosen.flexBasis, chosen.minWidth]).toEqual(["1", "1", "0px", "0"]);
    // The Tags tab's footer row has the same gap, so Discard changes and Apply sit where its Discard changes and Save do.
    expect(getComputedStyle(dialog().querySelector(".filter-dialog-footer")!).gap).toBe("8px");
    // Apply's label is a flex box, so its icon sits where the Tags tab's Save icon does, with no line of text lifting it.
    expect(getComputedStyle(dialog().querySelector("#filter-apply-btn > .btn-label")!).display).toBe("inline-flex");
  });

  it("its section tabs are reached with the keyboard and Enter shows each, keeping focus on it", async () => {
    await mountFilter();
    await openDialog();
    const tabs = within(dialog()).getAllByRole("tab") as HTMLButtonElement[];
    expect(tabs.map((tab) => [tab.tagName, tab.tabIndex])).toEqual([
      ["BUTTON", 0],
      ["BUTTON", 0],
      ["BUTTON", 0]
    ]);

    for (const [index, name, panel] of [
      [2, "Presets", "presets"],
      [1, "Tags", "tags"],
      [0, "General", "general"]
    ] as const) {
      await pressWithKeyboard(tabs[index]!);
      expect(selectedTab()).toBe(name);
      expect(byId(`filter-panel-${panel}`).style.display).not.toBe("none");
      expect(document.activeElement).toBe(tabs[index]);
    }
  });

  it("enables Apply and Discard changes, with Apply orange and its dot, only while there are changes, after a change put back and after Clear all too", async () => {
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    expect(applyShowsChanges()).toBe(false);

    await click(box("Only never played"));
    expect(applyShowsChanges()).toBe(true);
    await click(box("Only never played"));
    expect(applyShowsChanges()).toBe(false);

    // Rich is applied, so the default filter is a change.
    await click(clearAllButton());
    expect(applyShowsChanges()).toBe(true);
    await click(discardButton());
    expect(applyShowsChanges()).toBe(false);
    expect(heading()).toBe("Preset: Rich");
    expect(box("Videos only").checked).toBe(true);
  });

  it("disables Clear all filters while the filter is the default one, right after pressing it too, and not for a change to the preset list alone", async () => {
    await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await openDialog();
    expect(clearAllButton().disabled).toBe(true);

    // A duration counts as its field reads, before the field is left, and text that isn't valid is a change.
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    for (const [text, disabled] of [["1:30", false], ["1:7x", false], ["", true]] as const) {
      fireEvent.input(min, { target: { value: text } });
      await settle();
      expect(clearAllButton().disabled, text).toBe(disabled);
    }

    await click(box("Only never played"));
    expect(clearAllButton().disabled).toBe(false);
    await click(clearAllButton());
    expect(clearAllButton().disabled).toBe(true);
    expect(box("Only never played").checked).toBe(false);

    await showTab("Presets");
    await pressKey(presetHandle("Rich"), "ArrowDown");
    expect(applyShowsChanges()).toBe(true);
    expect(clearAllButton().disabled).toBe(true);
    await loadInDialog("Favorites");
    expect(clearAllButton().disabled).toBe(false);
  });

  it("switches tabs, showing the Presets panel as a flex column", async () => {
    await mountFilter();
    await openDialog();

    await showTab("Presets");
    expect(selectedTab()).toBe("Presets");
    expect(byId("filter-panel-general").style.display).toBe("none");
    expect(byId("filter-panel-presets").style.display).toBe("flex");
    await showTab("Tags");
    expect(selectedTab()).toBe("Tags");
    expect(byId("filter-panel-tags").style.display).toBe("block");
    expect(byId("filter-panel-presets").style.display).toBe("none");
  });

  it("the panel's Close and another tab keep its changes and its section, applying and saving nothing, and the changes show again", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    const queries = libraryQueries(server).length;
    await openDialog();
    // Favorites excluded, which no preset has, so Draft can take it.
    await click(box("Favorites"));
    await chooseFlag("Favorites", "excluded");
    await showTab("Presets");
    await addPreset("Draft");
    await pressKey(presetHandle("Favorites"), "ArrowDown");
    await deletePreset("Recent");
    expect(presetRows()).toEqual(["Beach days", "Favorites", "Draft"]);

    for (const [way, leaveTab] of [
      ["the panel's Close", closePanel],
      ["another tab", () => click(panelTab("Library"))]
    ] as Array<[string, () => Promise<void>]>) {
      await leaveTab();
      expect(appDialogs(), way).toEqual([]);
      await openDialog();
      expect(selectedTab(), way).toBe("Presets");
      expect(presetRows(), way).toEqual(["Beach days", "Favorites", "Draft"]);
      expect(applyShowsChanges(), way).toBe(true);
      await showTab("General");
      expect(flagRow("Favorites").checked, way).toBe(true);
      await showTab("Presets");
    }

    expect(presets.writes).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect((await nextPick(server)).filterState.favoritesMode).toBe("off");
  });

  it("Discard changes drops its changes at once, without asking, and stays open, beside the player and as the overlay, showing the applied filter and the saved presets again", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    const queries = libraryQueries(server).length;

    for (const [way, viewport] of [
      ["beside the player", DEFAULT_VIEWPORT],
      ["as the overlay", { width: 600, height: 800 }]
    ] as const) {
      await openDialog();
      await showTab("General");
      expect(discardButton().disabled, way).toBe(true);
      await click(box("Favorites"));
      await chooseFlag("Favorites", "excluded");
      expect(applyShowsChanges(), way).toBe(true);
      await showTab("Presets");
      expect(presetRows(), way).toEqual(["Favorites", "Beach days", "Recent"]);
      await addPreset("Draft");
      await pressKey(presetHandle("Favorites"), "ArrowDown");
      await deletePreset("Recent");
      expect(presetRows(), way).toEqual(["Beach days", "Favorites", "Draft"]);
      setViewport(viewport);
      await settle();

      await click(discardButton());
      expect(appDialogs(), way).toEqual([]);
      expect(isOpen(), way).toBe(true);
      expect(selectedTab(), way).toBe("Presets");
      expect(presetRows(), way).toEqual(presets.list.map((preset) => preset.name));
      expect(applyShowsChanges(), way).toBe(false);
      await showTab("General");
      expect(flagRow("Favorites"), way).toEqual(FAVORITES_DEFAULT);
      await closePanel();
      setViewport(DEFAULT_VIEWPORT);
      await settle();
    }

    expect(presets.writes).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect((await nextPick(server)).filterState.favoritesMode).toBe("off");
    await openDialog();
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(applyShowsChanges()).toBe(false);
    await showTab("Presets");
    expect(presetRows()).toEqual(presets.list.map((preset) => preset.name));
  });

  it("shows but loads nothing while the server is incompatible", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, capabilities: COMPATIBLE_VERSION.capabilities.filter((c) => c !== "api.presets.byId") })
    );
    mountPage({ server });
    await waitFor(() => expect(selectedPresetLabel()).toBe("Server compatibility check failed"));

    await chooseFilterTab();
    expect(isOpen()).toBe(true);
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
    expect(dialog().querySelector("input")).toBeNull();
    // Before the tab first loads, its footer has nothing to act on.
    expect([clearAllButton(), discardButton(), applyButton()].map((button) => button.disabled)).toEqual([true, true, true]);
    expect(applyDot().hidden).toBe(true);
  });

  it("shows but loads nothing while the server runs without a library, nor on a server event, with no notice", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/sources", () => json(SOURCES));
    server.on("POST", "/api/tag-editor/model", () => json(TAG_MODEL));
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, libraryState: "missing", libraryMessage: "The library file is missing." })
    );
    const page = mountPage({ server });
    await waitFor(() => expect(selectedPresetLabel()).toBe("Running without a library"));

    await chooseFilterTab();
    expect(isOpen()).toBe(true);
    page.stream().emit("tagCatalogChanged", 40, { categories: [], tags: [] });
    page.stream().emit("sourceStateChanged", 41, { sourceId: "source-1", isEnabled: false });
    await new Promise((resolve) => setTimeout(resolve, REFRESH_GATHER_MS + 50));
    await settle();
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
    expect(server.requests("GET", "/api/presets")).toHaveLength(0);
    expect(dialog().querySelector("input")).toBeNull();
    expect(openNotices()).toEqual([]);
  });

  it("says why when its sources or tags cannot load as it shows, and loads them when it shows again, while a server event's load that fails says nothing", async () => {
    let tagModelStatus = 200;
    let sourcesStatus = 500;
    const { page, server } = await mountFilter([], (server) => {
      server.on("GET", "/api/sources", () => (sourcesStatus === 200 ? json(SOURCES) : status(sourcesStatus)));
      server.on("POST", "/api/tag-editor/model", () =>
        tagModelStatus === 200 ? json(TAG_MODEL) : tagModelStatus === 403 ? json({ error: REMOTE_CONNECTIONS_OFF }, 403) : status(tagModelStatus)
      );
    });

    await chooseFilterTab();
    await expectNotice(server, "Filter load failed.", "Filter load failed (HTTP 500).");
    expect(isOpen()).toBe(true);
    expect(dialog().querySelector("input")).toBeNull();

    sourcesStatus = 200;
    tagModelStatus = 403;
    await click(panelTab("Library"));
    await chooseFilterTab();
    await expectNotice(server, `Filter load failed: ${REMOTE_CONNECTIONS_OFF}`, "Filter load failed (HTTP 403).");
    expect(dialog().querySelector("input")).toBeNull();

    tagModelStatus = 200;
    await click(panelTab("Library"));
    await chooseFilterTab();
    await waitFor(() => expect(dialog().querySelector("input")).not.toBeNull());
    expect(selectedTab()).toBe("General");
    expect(box("Movies (C:\\media\\movies)").checked).toBe(true);

    tagModelStatus = 503;
    page.stream().emit("tagCatalogChanged", 40, { categories: [], tags: [] });
    await waitFor(() => expect(server.logLines()).toContain("filter=event-load-failed status=503"));
    expect(openNotices()).toEqual([]);
    expect(box("Movies (C:\\media\\movies)").checked).toBe(true);
  });

  it("says a tag model that isn't JSON, such as a proxy's page, is an unexpected response, naming its content type only in the log", async () => {
    const { server } = await mountFilter([], (server) => {
      server.on("POST", "/api/tag-editor/model", () => new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    });
    await chooseFilterTab();
    await expectNotice(
      server,
      "Filter load failed: The server sent an unexpected response.",
      "Filter load failed: The server sent an unexpected response (text/html)."
    );
    expect(dialog().querySelector("input")).toBeNull();
  });

  it.each([
    ["tag model", "POST", "/api/tag-editor/model"],
    ["sources", "GET", "/api/sources"]
  ] as const)("shows only the pairing prompt when its %s answers 401, and logs it", async (_name, method, path) => {
    const { server } = await mountFilter([], (server) => {
      server.on(method, path, () => status(401));
    });
    expect(pairingPrompt().style.display).toBe("none");

    await chooseFilterTab();
    await waitFor(() => expect(pairingPrompt().style.display).toBe("flex"));
    await click(panelTab("Library"));
    await chooseFilterTab();
    expect(server.requests(method, path)).toHaveLength(2);
    expect(openNotices()).toEqual([]);
    expect(server.logLines().some((line) => /^status=Filter load failed|^filter=event-load-failed/.test(line))).toBe(false);
    expect(dialog().querySelector("input")).toBeNull();
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine(`${method} ${path}`)));
  });

  it("keeps its markup on each tab", async () => {
    await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await pickPreset("preset-rich");
    localStorage.setItem("rr_device.filter.expandedTagCategories", JSON.stringify(["cat-places", "cat-people", "__filter_uncategorized__"]));

    await openDialog();
    expect(normalizedMarkup(dialog(), { liveFormState: true })).toMatchSnapshot("general");
    await showTab("Tags");
    expect(normalizedMarkup(dialog(), { liveFormState: true })).toMatchSnapshot("tags");
    await showTab("Presets");
    expect(normalizedMarkup(dialog(), { liveFormState: true })).toMatchSnapshot("presets");
  });

  it("says when there are no sources, tags, or presets", async () => {
    await mountFilter([], (server) => {
      server.on("GET", "/api/sources", () => json([]));
      server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    });
    await openDialog();

    expect(within(dialog()).getByText("No sources returned from server.")).toBeTruthy();
    await showTab("Tags");
    expect(within(dialog()).getByText("No tags yet. Add them in the Tags tab.")).toBeTruthy();
    expect(byId("filter-global-match")).toBeNull();
    await showTab("Presets");
    expect(within(dialog()).getByText("No presets")).toBeTruthy();
  });
});

describe("General tab", () => {
  it("shows the applied filter", async () => {
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();

    expect(heading()).toBe("Preset: Rich");
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "only", disabled: false });
    expect(flagRow("Blacklisted")).toEqual(BLACKLISTED_DEFAULT);
    expect(box("Only never played").checked).toBe(false);
    expect(box("Videos only").checked).toBe(true);
    expect(box("All (Videos and Photos)").checked).toBe(false);
    expect(box("Only videos without audio").checked).toBe(true);
    expect(box("Movies (C:\\media\\movies)").checked).toBe(true);
    expect(box("C:\\media\\photos").checked).toBe(false);
    expect(box("Archive (D:\\archive)").checked).toBe(false);
    expect(box("Archive (D:\\archive)").disabled).toBe(true);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("01:30");
    expect(byId<HTMLInputElement>("filter-max-dur-text").value).toBe("01:01:40");
  });

  it("shows Apply's changes after a change, and not once the change is undone", async () => {
    await mountFilter();
    await openDialog();

    await click(box("Favorites"));
    expect(applyShowsChanges()).toBe(true);
    expect(heading()).toBe("Preset: None*");

    await click(box("Favorites"));
    expect(applyShowsChanges()).toBe(false);
    expect(heading()).toBe("Preset: None");
  });

  it("applies to the library, the next random pick, and the preset dropdown", async () => {
    const { server } = await mountFilter();
    await openDialog();

    await click(box("Favorites"));
    await click(box("Only never played"));
    await click(box("Photos only"));
    await click(box("Only videos with audio"));
    const applied = await applyAndWait(server);

    const expected = { favoritesMode: "only", onlyNeverPlayed: true, mediaTypeFilter: 2, audioFilter: 1 };
    expect(applied).toMatchObject(expected);
    expect(libraryQueries(server).at(-1)).toMatchObject({ offset: 0, search: "" });
    const pick = await nextPick(server);
    expect(pick.filterState).toMatchObject(expected);
    expect(pick.presetId).toBeUndefined();
    expect(selectedPresetLabel()).toBe("None*");
  });

  it("has no No minimum or No maximum boxes: an empty duration means no limit, as its placeholder says", async () => {
    const { server } = await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    const max = byId<HTMLInputElement>("filter-max-dur-text");
    expect(min.placeholder).toBe("No minimum");
    expect(max.placeholder).toBe("No maximum");
    expect(within(dialog()).queryByLabelText("No minimum")).toBeNull();
    expect(within(dialog()).queryByLabelText("No maximum")).toBeNull();
    for (const field of [min, max]) {
      expect(field.closest(".filter-row")?.querySelector('input[type="checkbox"]')).toBeNull();
    }

    await type(min, "");
    expect(min.hasAttribute("aria-invalid")).toBe(false);
    expect(heldState(applyButton()).held).toBe(false);
    expect(applyShowsChanges()).toBe(true);
    const applied = await applyAndWait(server);
    expect(applied.minDuration).toBeUndefined();
    expect(applied.maxDuration).toBe("01:01:40");

    await openDialog();
    expect(min.value).toBe("");
    await type(max, "");
    await type(max, "2:00");
    expect((await applyAndWait(server)).maxDuration).toBe("00:02:00");
  });

  it("flags a duration that is not valid as it is typed, with its tooltip as the field's description", async () => {
    await mountFilter();
    await openDialog();
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    expect(min.hasAttribute("aria-invalid")).toBe(false);
    expect(fieldIcon(min)).toBeNull();

    for (const text of ["1:7x", "12abc", "1:75"]) {
      fireEvent.input(min, { target: { value: text } });
      await settle();
      expect(min.getAttribute("aria-invalid"), text).toBe("true");
      expect(tooltipOf(min)?.textContent, text).toBe("Use MM:SS, HH:MM:SS, or seconds.");
      expect(tooltipOf(min)?.getAttribute("role")).toBe("tooltip");
      expect(fieldIcon(min)?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(min.closest(".vfield")?.contains(tooltipOf(min))).toBe(true);
    expect(within(dialog()).getAllByText("Use MM:SS, HH:MM:SS, or seconds.")).toHaveLength(1);
    expect(tabMarked("General")).toBe(true);

    fireEvent.input(min, { target: { value: "1:07" } });
    await settle();
    expect(min.hasAttribute("aria-invalid")).toBe(false);
    expect(min.hasAttribute("aria-describedby")).toBe(false);
    expect(fieldIcon(min)).toBeNull();
    expect(tabMarked("General")).toBe(false);
  });

  /** A red icon's or tooltip's state: shown, fading out while still rendered, or gone. */
  function fade(element: Element | null): "shown" | "fading" | "gone" {
    return !element ? "gone" : element.classList.contains("is-fading-out") ? "fading" : "shown";
  }

  /** The minimum duration's icon and shown tooltip, General's badge, and Add Preset's red dot. */
  function minimumMarks(min: HTMLInputElement): Array<"shown" | "fading" | "gone"> {
    const field = min.closest(".vfield")!;
    const general = within(dialog()).getByRole("tab", { name: "General" });
    const add = byId("filter-add-preset-btn");
    return [field.querySelector(".vfield-icon"), field.querySelector(".vfield-tip.is-shown"), general.querySelector(".section-problem"), add.querySelector(".held-dot")].map(fade);
  }

  it("fades a corrected duration's icon and tooltip, General's badge, and a held action's red dot out, rendered until they have faded", async () => {
    await mountFilter();
    await openDialog();
    // With a name, the duration holds Add Preset.
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    min.focus();
    await type(min, "abc");
    expect(minimumMarks(min)).toEqual(["shown", "shown", "shown", "shown"]);

    // Only the look lingers: the field and Apply change at once, and the tooltip keeps the problem it said.
    await type(min, "1:07");
    expect(minimumMarks(min)).toEqual(["fading", "fading", "fading", "fading"]);
    expect([min.hasAttribute("aria-invalid"), min.hasAttribute("aria-describedby"), heldState(byId<HTMLButtonElement>("filter-add-preset-btn")).held, tabMarked("General")]).toEqual([false, false, false, false]);
    expect(min.closest(".vfield")!.querySelector(".vfield-tip")!.textContent).toBe("Use MM:SS, HH:MM:SS, or seconds.");

    // Flagged again while they fade, they show again.
    await type(min, "1:7x");
    expect(minimumMarks(min)).toEqual(["shown", "shown", "shown", "shown"]);
    await type(min, "");
    await waitFor(() => expect(minimumMarks(min)).toEqual(["gone", "gone", "gone", "gone"]));
  });

  it("with reduced motion, takes a corrected duration's icon and tooltip, General's badge, and a held action's red dot away at once", async () => {
    stubReducedMotion();
    await mountFilter();
    await openDialog();
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    min.focus();
    await type(min, "abc");
    expect(minimumMarks(min)).toEqual(["shown", "shown", "shown", "shown"]);
    await type(min, "1:07");
    expect(minimumMarks(min)).toEqual(["gone", "gone", "gone", "gone"]);
  });

  it("shows the tooltip while the field has focus, while the pointer is on the icon, and after a tap on the icon", async () => {
    await mountFilter();
    await openDialog();
    const max = byId<HTMLInputElement>("filter-max-dur-text");
    fireEvent.input(max, { target: { value: "abc" } });
    await settle();
    expect(tooltipShown(max)).toBe(false);

    max.focus();
    await settle();
    expect(tooltipShown(max)).toBe(true);
    max.blur();
    await settle();
    expect(tooltipShown(max)).toBe(false);

    fireEvent.pointerEnter(fieldIcon(max)!, { pointerType: "mouse" });
    await settle();
    expect(tooltipShown(max)).toBe(true);
    fireEvent.pointerLeave(fieldIcon(max)!, { pointerType: "mouse" });
    await settle();
    expect(tooltipShown(max)).toBe(false);

    fireEvent.pointerDown(fieldIcon(max)!, { pointerType: "touch" });
    await settle();
    expect(document.activeElement).toBe(max);
    expect(tooltipShown(max)).toBe(true);
  });

  it("holds Apply while a duration is not valid, with or without other changes, and moves to it without a message or log line", async () => {
    const { server } = await mountFilter();
    await openDialog();
    const queries = libraryQueries(server).length;
    const logsBefore = server.logLines().length;
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    const max = byId<HTMLInputElement>("filter-max-dur-text");

    await type(min, "abc");
    // A duration that isn't valid is a change, which Apply holds.
    expect(applyShowsChanges()).toBe(true);
    expect(heldState(applyButton())).toEqual({ held: true, marked: true });
    expect(applyButton().title).toBe("Correct the minimum duration to apply.");
    expect(document.getElementById(applyButton().getAttribute("aria-describedby")!)?.textContent).toBe("Correct the minimum duration to apply.");
    await showTab("Tags");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(document.activeElement).toBe(min);
    expect(isOpen()).toBe(true);
    expect(min.value).toBe("abc");

    await click(box("Only never played"));
    expect(applyShowsChanges()).toBe(true);
    await type(max, "1:75");
    await type(min, "90");
    expect(applyButton().title).toBe("Correct the maximum duration to apply.");
    await showTab("Presets");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(document.activeElement).toBe(max);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    await type(max, "");
    expect(heldState(applyButton())).toEqual({ held: false, marked: false });
    expect(applyButton().title).toBe("Apply");
    expect(applyButton().hasAttribute("aria-describedby")).toBe(false);
    const applied = await applyAndWait(server);
    expect(applied.minDuration).toBe("00:01:30");
    expect(applied.maxDuration).toBeUndefined();
  });

  it("a held Apply shows its dot red, with no badge, and its reason as its tooltip and description", async () => {
    await mountFilter();
    await openDialog();
    useStylesheet();
    await type(byId("filter-min-dur-text"), "abc");

    expect(applyButton().classList.contains("shows-problem")).toBe(true);
    expect(applyButton().querySelector(".btn-problem")).toBeNull();
    expect(applyDot().hidden).toBe(false);
    expect(currentStyle(applyDot()).backgroundColor).toBe(currentStyle(document.documentElement).getPropertyValue("--error").trim());
    expect(applyButton().title).toBe("Correct the minimum duration to apply.");
    expect(applyButton().getAttribute("aria-label")).toBe("Apply");

    await type(byId("filter-min-dur-text"), "1:30");
    expect(applyButton().classList.contains("shows-problem")).toBe(false);
    expect(currentStyle(applyDot()).backgroundColor).toBe(currentStyle(document.documentElement).getPropertyValue("--huggins-orange").trim());
  });

  it("a held Apply moves to its field within the press, showing its section before it focuses the field, without preventScroll or a scroll first", async () => {
    await mountFilter();
    await openDialog();
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    await type(min, "abc");
    await showTab("Tags");
    expect(byId("filter-panel-general").style.display).toBe("none");

    /** Each focus call, with whether it asked not to scroll and how General's section showed at that moment. */
    const focuses: Array<{ element: HTMLElement; preventScroll: boolean; general: string }> = [];
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      focuses.push({ element: this, preventScroll: options?.preventScroll === true, general: byId("filter-panel-general").style.display });
      focus.call(this, options);
    });
    const scrolls = vi.spyOn(Element.prototype, "scrollIntoView");
    try {
      // A browser's click, which no test helper wraps, so nothing renders between the press and its focus.
      applyButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(document.activeElement).toBe(min);
      expect(focuses).toEqual([{ element: min, preventScroll: false, general: "block" }]);
      expect(scrolls).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }

    await settle();
    expect(selectedTab()).toBe("General");
    expect(byId("filter-panel-tags").style.display).toBe("none");
    expect(tooltipShown(min)).toBe(true);
  });

  it("marks a flagged section's tab with the badge at the top right of its name, without a disc, out of its flow, and nothing after its name", async () => {
    await mountFilter();
    await openDialog();
    useStylesheet();
    await type(byId("filter-min-dur-text"), "abc");
    await showTab("Tags");

    const tab = within(dialog()).getByRole("tab", { name: "General" });
    expect(tabMarked("General")).toBe(true);
    const badge = tab.querySelector<HTMLElement>(".section-problem")!;
    const style = currentStyle(badge);
    expect(currentStyle(tab).position).toBe("relative");
    expect([style.position, style.top, style.right, style.fontSize]).toEqual(["absolute", "2px", "-6px", "18px"]);
    expect(style.backgroundImage).toBe("none");
    expect(style.fontFamily).toContain("Material Symbols Outlined");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(selectedTab()).toBe("Tags");
  });

  it("loads a preset whose durations the server sends with fractional seconds as before", async () => {
    const fractional = {
      id: "preset-fraction",
      name: "Fraction",
      filterState: { minDuration: "00:01:30.5000000", maxDuration: "01:00:00.2500000" }
    };
    const { server } = await mountFilter([fractional]);
    await pickPreset("preset-fraction");
    await openDialog();
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("01:30");
    expect(byId<HTMLInputElement>("filter-max-dur-text").value).toBe("01:00:00");
    expect(byId("filter-min-dur-text").hasAttribute("aria-invalid")).toBe(false);
    expect(heldState(applyButton()).held).toBe(false);
    expect(heading()).toBe("Preset: Fraction");

    // Apply needs a change, and the durations go with it as they were loaded.
    await click(box("Only never played"));
    const applied = await applyAndWait(server);
    expect(applied).toMatchObject({ minDuration: "00:01:30", maxDuration: "01:00:00" });
  });

  it("applies a duration typed just before Apply", async () => {
    const { server } = await mountFilter();
    await openDialog();

    fireEvent.input(byId("filter-max-dur-text"), { target: { value: "1:00:00" } });
    expect((await applyAndWait(server)).maxDuration).toBe("01:00:00");
  });

  it("stores only the checked sources, and no sources once all are checked", async () => {
    const { server } = await mountFilter();
    await openDialog();
    expect(box("Movies (C:\\media\\movies)").checked).toBe(true);
    expect(box("C:\\media\\photos").checked).toBe(true);
    expect(box("Archive (D:\\archive)").checked).toBe(true);

    await click(box("Movies (C:\\media\\movies)"));
    expect((await applyAndWait(server)).includedSourceIds).toEqual(["source-2", "source-3"]);

    await openDialog();
    expect(box("Movies (C:\\media\\movies)").checked).toBe(false);
    await click(box("Movies (C:\\media\\movies)"));
    expect((await applyAndWait(server)).includedSourceIds).toEqual([]);
  });
});

describe("Favorites and Blacklisted filters", () => {
  const MODES: readonly FlagMode[] = ["off", "only", "excluded"];
  const FILTERS: readonly FlagFilterName[] = ["Favorites", "Blacklisted"];

  /** The mode fields, as the WebUI writes them. */
  function written(favorites: FlagMode, blacklisted: FlagMode) {
    return { favoritesMode: favorites, blacklistedMode: blacklisted };
  }

  it("shows each as a checkbox and an only-or-excluded dropdown, Favorites off and Blacklisted excluded", async () => {
    await mountFilter();
    await openDialog();

    const stack = dialog().querySelector("#filter-panel-general .filter-stack") as HTMLElement;
    expect(Array.from(stack.children).slice(0, 2).map((row) => row.className)).toEqual(["mode-row", "mode-row"]);
    for (const [name, id] of [["Favorites", "filter-fav"], ["Blacklisted", "filter-bl"]] as const) {
      expect(box(name).id).toBe(id);
      expect(box(name).type).toBe("checkbox");
      expect(flagSelect(name).id).toBe(`${id}-mode`);
      expect(Array.from(flagSelect(name).options).map((option) => [option.value, option.textContent])).toEqual([
        ["only", "only"],
        ["excluded", "excluded"]
      ]);
    }
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(flagRow("Blacklisted")).toEqual(BLACKLISTED_DEFAULT);
  });

  it("turns each dropdown off with its checkbox, keeping its choice until the checkbox is on again", async () => {
    const { server } = await mountFilter();
    await openDialog();

    await click(box("Favorites"));
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "only", disabled: false });
    await chooseFlag("Favorites", "excluded");
    await click(box("Favorites"));
    expect(flagRow("Favorites")).toEqual({ checked: false, choice: "excluded", disabled: true });
    expect(applyShowsChanges()).toBe(false);

    await chooseFlag("Blacklisted", "only");
    await click(box("Blacklisted"));
    expect(flagRow("Blacklisted")).toEqual({ checked: false, choice: "only", disabled: true });
    expect(applyShowsChanges()).toBe(true);

    await click(box("Favorites"));
    await click(box("Blacklisted"));
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "excluded", disabled: false });
    expect(flagRow("Blacklisted")).toEqual({ checked: true, choice: "only", disabled: false });
    expect(await applyAndWait(server)).toMatchObject(written("excluded", "only"));
  });

  it.each(FILTERS.flatMap((name) => MODES.map((mode) => [name, mode] as const)))(
    "applies and saves %s %s",
    async (name, mode) => {
      const { server, presets } = await mountFilter();
      const expected = name === "Favorites" ? written(mode, "excluded") : written("off", mode);
      await openDialog();

      // Apply needs a change, and a preset a filter other than the default one, which Favorites off and Blacklisted
      // excluded are.
      await click(box("Only never played"));
      // Set another mode first, so each mode is reached from a different one.
      await setFlag(name, mode === "only" ? "excluded" : "only");
      await setFlag(name, mode);
      expect(await applyAndWait(server)).toMatchObject(expected);
      expect((await nextPick(server)).filterState).toMatchObject(expected);

      await openDialog();
      await showTab("Presets");
      await addPreset("Flags");
      await applyAndWait(server);
      expect(presets.summaries()).toEqual(["create Flags"]);
      expect(presets.writes[0]!.body).toMatchObject({ name: "Flags", filterState: expected });
    }
  );

  it("Clear all filters shows Favorites off with only and Blacklisted on with excluded", async () => {
    await mountFilter();
    await openDialog();
    await setFlag("Favorites", "excluded");
    await setFlag("Blacklisted", "only");

    await click(clearAllButton());
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(flagRow("Blacklisted")).toEqual(BLACKLISTED_DEFAULT);
    // The applied filter is the default, so there is nothing to apply.
    expect(applyShowsChanges()).toBe(false);
  });

  it("choosing a preset shows its modes, with the default choice for a filter that is off", async () => {
    const pairs = MODES.flatMap((favorites) => MODES.map((blacklisted) => [favorites, blacklisted] as const));
    const list = pairs.map(([favorites, blacklisted]) => ({
      id: `preset-${favorites}-${blacklisted}`,
      name: `Favorites ${favorites}, Blacklisted ${blacklisted}`,
      filterState: { favoritesMode: favorites, blacklistedMode: blacklisted }
    }));
    await mountFilter(list);
    await openDialog();

    for (const [favorites, blacklisted] of pairs) {
      // A choice left with its checkbox off is not kept when a preset loads.
      await setFlag("Favorites", "excluded");
      await click(box("Favorites"));
      await setFlag("Blacklisted", "only");
      await click(box("Blacklisted"));
      // A filter no preset has, so Load has a filter to load.
      await click(box("Only never played"));
      await showTab("Presets");
      await loadInDialog(`Favorites ${favorites}, Blacklisted ${blacklisted}`);
      await showTab("General");
      expect(box("Only never played").checked).toBe(false);
      expect(flagRow("Favorites")).toEqual(
        favorites === "off" ? FAVORITES_DEFAULT : { checked: true, choice: favorites, disabled: false }
      );
      expect(flagRow("Blacklisted")).toEqual(
        blacklisted === "off" ? { checked: false, choice: "excluded", disabled: true } : { checked: true, choice: blacklisted, disabled: false }
      );
    }
  });
});

describe("Favorites only with Blacklisted only", () => {
  it("is flagged on both dropdowns, with one icon after Blacklisted, and holds Apply, Add Preset, and Update", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await showTab("Presets");
    await loadInDialog("Favorites");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await showTab("General");
    const queries = libraryQueries(server).length;
    const logsBefore = server.logLines().length;

    expect(flagRow("Favorites")).toMatchObject({ checked: true, choice: "only" });
    expect(flagSelect("Blacklisted").hasAttribute("aria-invalid")).toBe(false);
    await chooseFlag("Blacklisted", "only");
    for (const name of ["Favorites", "Blacklisted"] as const) {
      expect(flagSelect(name).getAttribute("aria-invalid"), name).toBe("true");
      expect(tooltipOf(flagSelect(name))?.textContent, name).toBe("Nothing is both a favorite and blacklisted. Use excluded for one of them.");
    }
    expect(flagSelect("Blacklisted").nextElementSibling?.classList.contains("vfield-icon")).toBe(true);
    expect(dialog().querySelectorAll(".vfield-icon")).toHaveLength(1);
    expect(tabMarked("General")).toBe(true);
    const presetButton = (name: string) => within(dialog()).getByRole("button", { name, hidden: true }) as HTMLButtonElement;
    for (const button of [applyButton(), presetButton("Add preset"), presetButton("Update preset")]) {
      expect(heldState(button), button.id).toEqual({ held: true, marked: true });
    }
    // Add Preset and Update show the red dot where Apply's sits, in place of the badge.
    for (const button of [presetButton("Add preset"), presetButton("Update preset")]) {
      expect(button.querySelector(".held-dot"), button.id).not.toBeNull();
      expect(button.querySelector(".btn-problem"), button.id).toBeNull();
    }
    expect(presetButton("Update preset").title).toBe("Change Favorites or Blacklisted first.");

    flagSelect("Favorites").focus();
    await settle();
    expect(tooltipShown(flagSelect("Blacklisted"))).toBe(true);

    for (const button of ["Update preset", "Add preset"]) {
      await showTab("Presets");
      await click(dialogButton(button));
      expect(selectedTab(), button).toBe("General");
      expect(document.activeElement, button).toBe(flagSelect("Blacklisted"));
    }
    await showTab("Tags");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(presetRows()).toEqual(["Favorites"]);
    expect(presets.writes).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    // A field problem shows in its field, and isn't relayed.
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    await chooseFlag("Favorites", "excluded");
    expect(flagSelect("Favorites").hasAttribute("aria-invalid")).toBe(false);
    expect(flagSelect("Blacklisted").hasAttribute("aria-invalid")).toBe(false);
    expect(heldState(applyButton()).held).toBe(false);
    expect(await applyAndWait(server)).toMatchObject({ favoritesMode: "excluded", blacklistedMode: "only" });
  });

  it("is not flagged while either filter is off", async () => {
    await mountFilter();
    await openDialog();
    await setFlag("Favorites", "only");
    await chooseFlag("Blacklisted", "only");
    expect(flagSelect("Blacklisted").getAttribute("aria-invalid")).toBe("true");
    await setFlag("Blacklisted", "off");
    expect(flagSelect("Blacklisted").hasAttribute("aria-invalid")).toBe(false);
    expect(flagSelect("Favorites").hasAttribute("aria-invalid")).toBe(false);
    expect(heldState(applyButton()).held).toBe(false);
  });
});

/** Min Rating's stars, found while their tab is hidden too, as `box` finds checkboxes. */
function minRatingStars(): HTMLElement {
  return within(dialog()).getByRole("slider", { name: "Min Rating", hidden: true });
}

/** Sets Min Rating with a key on its stars, as from the keyboard. */
async function minRatingKey(key: string): Promise<void> {
  minRatingStars().focus();
  await pressRatingKey(minRatingStars(), key);
}

describe("Only unrated and Min Rating", () => {
  it("sit at the end of Basic Filters, Only unrated after the other options and Min Rating's stars below it, saying No minimum for none", async () => {
    await mountFilter();
    await openDialog();
    const stack = box("Only never played").closest(".filter-stack")!;
    const labels = [...stack.querySelectorAll("label")].map((label) => label.textContent!.trim());
    expect(labels.slice(-2)).toEqual(["Only files this browser can play", "Only unrated"]);
    const row = minRatingStars().closest(".min-rating-row")!;
    expect(row.parentElement).toBe(stack);
    expect(row.previousElementSibling).toBe(box("Only unrated").closest(".vfield"));
    expect(row.firstElementChild!.textContent).toBe("Min Rating");
    expect(row.lastElementChild).toBe(minRatingStars());
    expect(box("Only unrated").checked).toBe(false);
    expect(sliderValue(minRatingStars())).toEqual(["0", "No minimum"]);
  });

  it("the stars change only the tab's filter until Apply, never a rating, and Delete clears them", async () => {
    stubStarLayout();
    const { server } = await mountFilter();
    await openDialog();

    await tapStars(minRatingStars(), xFor(3.5));
    expect(sliderValue(minRatingStars())).toEqual(["3.5", "3.5 stars"]);
    expect(applyShowsChanges()).toBe(true);
    expect((await nextPick(server)).filterState).not.toHaveProperty("minRating");

    await minRatingKey("ArrowLeft");
    expect(sliderValue(minRatingStars())).toEqual(["3", "3 stars"]);
    expect(await applyAndWait(server)).toMatchObject({ minRating: 3, onlyUnrated: false });
    expect((await nextPick(server)).filterState).toMatchObject({ minRating: 3 });

    await minRatingKey("Delete");
    expect(sliderValue(minRatingStars())).toEqual(["0", "No minimum"]);
    minRatingStars().blur();
    await settle();
    expect(await applyAndWait(server)).not.toHaveProperty("minRating");
    expect(ratingRequests(server)).toEqual([]);
  });

  it("are flagged together on Only unrated with a minimum, marking the stars, and hold Apply, Add Preset, and Update", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await showTab("Presets");
    await loadInDialog("Favorites");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await showTab("General");
    const queries = libraryQueries(server).length;
    const unrated = box("Only unrated");

    await click(unrated);
    expect(unrated.hasAttribute("aria-invalid")).toBe(false);
    await minRatingKey("End");
    // After the first key, which starts the audio stage and logs it.
    const logsBefore = server.logLines().length;
    for (const field of [unrated, minRatingStars()]) {
      expect(field.getAttribute("aria-invalid"), field.id).toBe("true");
      expect(tooltipOf(field)?.textContent, field.id).toBe("Nothing unrated has a minimum rating. Clear one of them.");
    }
    expect(unrated.closest("label")!.nextElementSibling?.classList.contains("vfield-icon")).toBe(true);
    expect(dialog().querySelectorAll(".vfield-icon")).toHaveLength(1);
    expect(tabMarked("General")).toBe(true);
    const presetButton = (name: string) => within(dialog()).getByRole("button", { name, hidden: true }) as HTMLButtonElement;
    for (const button of [applyButton(), presetButton("Add preset"), presetButton("Update preset")]) {
      expect(heldState(button), button.id).toEqual({ held: true, marked: true });
    }
    expect(applyButton().title).toBe("Clear Only unrated or Min Rating to apply.");
    expect(presetButton("Update preset").title).toBe("Clear Only unrated or Min Rating first.");
    expect(presetButton("Add preset").title).toBe("Clear Only unrated or Min Rating first.");
    expect(tooltipShown(unrated)).toBe(true);

    for (const button of ["Update preset", "Add preset"]) {
      await showTab("Presets");
      await click(dialogButton(button));
      expect(selectedTab(), button).toBe("General");
      expect(document.activeElement, button).toBe(unrated);
    }
    await showTab("Tags");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(document.activeElement).toBe(unrated);
    expect(presets.writes).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    await minRatingKey("Backspace");
    expect(unrated.hasAttribute("aria-invalid")).toBe(false);
    expect(minRatingStars().hasAttribute("aria-invalid")).toBe(false);
    expect(heldState(applyButton()).held).toBe(false);
    const applied = await applyAndWait(server);
    expect(applied).toMatchObject({ onlyUnrated: true, favoritesMode: "only" });
    expect(applied).not.toHaveProperty("minRating");
  });

  it("are saved in a preset, and loading it shows them again", async () => {
    stubStarLayout();
    const { server, presets } = await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await tapStars(minRatingStars(), xFor(2.5));
    await showTab("Presets");
    await addPreset("Good ones");
    expect(await applyAndWait(server)).toMatchObject({ minRating: 2.5 });
    expect(presets.writes[0]!.body.filterState).toMatchObject({ minRating: 2.5, onlyUnrated: false });

    await click(clearAllButton());
    await showTab("General");
    expect(sliderValue(minRatingStars())).toEqual(["0", "No minimum"]);
    await showTab("Presets");
    await loadInDialog("Good ones");
    await showTab("General");
    expect(sliderValue(minRatingStars())).toEqual(["2.5", "2.5 stars"]);
    expect(heading()).toBe("Preset: Good ones");
  });
});

describe("Tags tab", () => {
  it("lists categories by sort order and name, each with its tags by name", async () => {
    await mountFilter();
    await openDialog();
    await showTab("Tags");

    expect(categoryTitles()).toEqual(["Places", "Mood", "People"]);
    expect(chipNames("Places")).toEqual(["alps", "Beach"]);
    expect(chipNames("People")).toEqual(["Alice", "Bob"]);
    expect((byId<HTMLSelectElement>("filter-global-match")).value).toBe("and");
  });

  it("include and exclude chips toggle and replace each other, and apply", async () => {
    const { server } = await mountFilter();
    await openDialog();
    await showTab("Tags");

    await includeTag("Beach");
    expect(chipState("Beach")).toBe("include");
    expect(applyShowsChanges()).toBe(true);
    await excludeTag("Beach");
    expect(chipState("Beach")).toBe("exclude");
    await excludeTag("Beach");
    expect(chipState("Beach")).toBe("none");
    expect(applyShowsChanges()).toBe(false);

    await includeTag("Alice");
    await excludeTag("Calm");
    await includeTag("Calm");
    await excludeTag("Bob");
    expect(chipState("Calm")).toBe("include");
    const applied = await applyAndWait(server);
    expect(applied.selectedTags).toEqual(["Alice", "Calm"]);
    expect(applied.excludedTags).toEqual(["Bob"]);
  });

  it("applies the category combination and each category's match mode", async () => {
    const { server } = await mountFilter();
    await openDialog();
    await showTab("Tags");

    fireEvent.change(byId("filter-global-match"), { target: { value: "or" } });
    await settle();
    expect(applyShowsChanges()).toBe(true);
    fireEvent.change(matchMode("People"), { target: { value: "1" } });
    await settle();

    const applied = await applyAndWait(server);
    expect(applied.globalMatchMode).toBe(false);
    expect(applied.categoryLocalMatchModes).toEqual({ "cat-people": 1 });

    await openDialog();
    await showTab("Tags");
    expect(byId<HTMLSelectElement>("filter-global-match").value).toBe("or");
    expect(matchMode("People").value).toBe("1");
    expect(matchMode("Places").value).toBe("0");
  });

  it("shows filter tags missing from the catalog under Uncategorized", async () => {
    const { server } = await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");

    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    expect(chipNames("Uncategorized")).toEqual(["Ghost"]);
    expect(chipState("Ghost")).toBe("include");
    expect(chipState("Beach")).toBe("include");
    expect(chipState("Bob")).toBe("exclude");

    fireEvent.change(matchMode("Uncategorized"), { target: { value: "1" } });
    await settle();
    await excludeTag("Ghost");
    expect(chipState("Ghost")).toBe("exclude");
    const applied = await applyAndWait(server);
    expect(applied.categoryLocalMatchModes).toEqual({ "cat-people": 1, "": 1 });
    expect(applied.excludedTags).toEqual(["Bob", "Ghost"]);

    await openDialog();
    await showTab("Tags");
    await excludeTag("Ghost");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People"]);
  });

  it("start collapsed, and the header's name or padding expands and collapses one, with no arrows, while its match mode keeps its own action", async () => {
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");
    for (const title of categoryTitles()) {
      expect(categoryGrid(title).hidden, title).toBe(true);
      expect(categoryToggle(title).getAttribute("aria-expanded"), title).toBe("false");
    }
    expect(categoryToggle("Places").getAttribute("aria-controls")).toBe(categoryGrid("Places").id);
    expect(categoryToggle("Places").title).toBe("Expand category");
    expect(dialog().querySelector(".tag-category-header .material-symbol-icon")).toBeNull();

    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryToggle("Places").getAttribute("aria-expanded")).toBe("true");
    expect(categoryToggle("Places").title).toBe("Collapse category");
    await click(category("Places").querySelector(".tag-category-header")!);
    expect(categoryGrid("Places").hidden).toBe(true);

    const mode = matchMode("People");
    await click(mode);
    fireEvent.change(mode, { target: { value: "0" } });
    await settle();
    expect(categoryGrid("People").hidden).toBe(true);
    expect(applyShowsChanges()).toBe(true);
  });

  it("remember on this device which are expanded, apart from the Tags tab's, after a page refresh too", async () => {
    const { page } = await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");
    await click(categoryToggle("Places"));
    await click(categoryToggle("Uncategorized"));
    expect(JSON.parse(localStorage.getItem("rr_device.filter.expandedTagCategories") ?? "")).toEqual(["cat-places", "__filter_uncategorized__"]);
    expect(localStorage.getItem("rr_device.tags.expandedCategories")).toBeNull();

    await closePanel();
    await openDialog();
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryGrid("People").hidden).toBe(true);

    page.unmount();
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");
    expect(categoryGrid("Places").hidden).toBe(false);
    expect(categoryGrid("Uncategorized").hidden).toBe(false);
    expect(categoryGrid("Mood").hidden).toBe(true);
  });

  /** A category's count of its tags in use, and its unsaved-changes dot. */
  const count = (title: string) => category(title).querySelector<HTMLElement>(".category-count")!;
  const dot = (title: string) => category(title).querySelector<HTMLElement>(".category-dot")!;

  it("show, expanded and collapsed, how many of their tags the filter uses, and the dot while that differs from the applied filter", async () => {
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");
    // Rich includes Beach and excludes Bob.
    expect([count("Places").hidden, count("Places").textContent, count("Places").title]).toEqual([false, "1", "1 tag in the filter"]);
    expect(count("Mood").hidden).toBe(true);
    expect(dot("Places").hidden).toBe(true);
    expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 1 tag in the filter");

    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").hidden).toBe(false);
    expect([count("Places").hidden, count("Places").textContent]).toEqual([false, "1"]);
    expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 1 tag in the filter");
    await includeTag("alps");
    expect([count("Places").hidden, count("Places").textContent, count("Places").title]).toEqual([false, "2", "2 tags in the filter"]);
    expect(dot("Places").hidden).toBe(false);
    expect(dot("Places").title).toBe("Unsaved changes");
    expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 2 tags in the filter, unsaved changes");

    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").hidden).toBe(true);
    expect([count("Places").hidden, count("Places").textContent]).toEqual([false, "2"]);
    expect(dot("Places").hidden).toBe(false);
    expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 2 tags in the filter, unsaved changes");
    expect(dot("People").hidden).toBe(true);

    // A count of 0 stays hidden, and out of the toggle's name, expanded too.
    await click(categoryToggle("Mood"));
    expect(categoryGrid("Mood").hidden).toBe(false);
    expect(count("Mood").hidden).toBe(true);
    expect(categoryToggle("Mood").getAttribute("aria-label")).toBe("Mood");
  });

  for (const state of ["collapsed", "expanded"] as const) {
    it(`clear a category's dot once Apply applies its change, with the category ${state}`, async () => {
      const { server } = await mountFilter();
      await openDialog();
      await showTab("Tags");
      await click(categoryToggle("Places"));
      await includeTag("Beach");
      if (state === "collapsed") {
        await click(categoryToggle("Places"));
      }
      expect(categoryGrid("Places").hidden).toBe(state === "collapsed");
      expect(dot("Places").hidden).toBe(false);

      await applyAndWait(server);
      expect(categoryGrid("Places").hidden).toBe(state === "collapsed");
      expect(dot("Places").hidden).toBe(true);
      expect([count("Places").hidden, count("Places").textContent]).toEqual([false, "1"]);
      expect(categoryToggle("Places").getAttribute("aria-label")).toBe("Places, 1 tag in the filter");
    });
  }

  it("name each category's match mode for its category, with Match mode as its tooltip, and no Local label", async () => {
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People", "Uncategorized"]);
    for (const title of categoryTitles()) {
      const mode = matchMode(title);
      expect(mode.title, title).toBe("Match mode");
      expect(mode.closest("label"), title).toBeNull();
      expect(mode.classList.contains("filter-local-mode"), title).toBe(true);
    }
    expect(dialog().textContent).not.toContain("Local");
  });
});

describe("Presets tab", () => {
  it("choosing a preset loads nothing, Load loads its filter, and the heading follows the working filter", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    expect(Array.from(presetSelectInDialog().options).map((option) => option.textContent)).toEqual([
      "None",
      "Favorites",
      "Beach days"
    ]);
    // On None with the default filter, Load has nothing to load.
    expect(chosenInDialog()).toBe("");
    expect(loadButton().disabled).toBe(true);

    await chooseInDialog("Beach days");
    expect(chosenInDialog()).toBe("Beach days");
    expect(heading()).toBe("Preset: None");
    expect(chipState("Beach")).toBe("none");
    expect(applyShowsChanges()).toBe(false);
    expect(loadButton().disabled).toBe(false);

    await click(loadButton());
    expect(heading()).toBe("Preset: Beach days");
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(chipState("Beach")).toBe("include");
    expect(applyShowsChanges()).toBe(true);
    expect(loadButton().disabled).toBe(true);

    await click(box("Favorites"));
    expect(heading()).toBe("Preset: Beach days*");
    expect(chosenInDialog()).toBe("Beach days");
    expect(loadButton().disabled).toBe(false);
    await click(box("Favorites"));
    expect(heading()).toBe("Preset: Beach days");

    // None loads the default filter, and keeps the preset list's changes.
    await chooseInDialog("");
    expect(heading()).toBe("Preset: Beach days");
    await pressKey(presetHandle("Beach days"), "ArrowUp");
    await click(loadButton());
    expect(heading()).toBe("Preset: None");
    expect(chipState("Beach")).toBe("none");
    expect(presetRows()).toEqual(["Beach days", "Favorites"]);
    expect(chosenInDialog()).toBe("");
    expect(applyShowsChanges()).toBe(true);
  });

  it("a preset loaded with Load applies as that preset in the preset dropdown and in random picks", async () => {
    const { server } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    await loadInDialog("Beach days");
    const applied = await applyAndWait(server);
    expect(applied.selectedTags).toEqual(["Beach"]);
    expect(selectedPresetLabel()).toBe("Beach days");
    expect((await nextPick(server)).presetId).toBe("preset-beach");
    expect(server.requests("POST", "/api/presets")).toHaveLength(0);
  });

  it("Add Preset needs a new name, adds the working filter, and Apply creates it", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");
    const logsBefore = server.logLines().length;
    const name = byId<HTMLInputElement>("filter-new-preset-name");
    const addButton = () => dialogButton("Add preset");
    const disabledWithoutIcon = () => {
      expect(addButton().disabled).toBe(true);
      expect(heldState(addButton())).toEqual({ held: false, marked: false });
      expect(addButton().classList.contains("shows-problem")).toBe(false);
      expect(addButton().title).toBe("Add preset");
    };

    expect(name.hasAttribute("aria-invalid")).toBe(false);
    disabledWithoutIcon();
    await click(addButton());
    expect(document.activeElement).not.toBe(name);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(tabMarked("Presets")).toBe(false);

    fireEvent.input(name, { target: { value: "x" } });
    fireEvent.input(name, { target: { value: "" } });
    await settle();
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    disabledWithoutIcon();
    expect(tabMarked("Presets")).toBe(false);

    await addPreset("FAVORITES");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(tooltipOf(name)?.textContent).toBe("Use a name no other preset has.");
    disabledWithoutIcon();
    expect(tabMarked("Presets")).toBe(true);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(name.value).toBe("FAVORITES");
    expect(selectedTab()).toBe("Presets");
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    const max = byId<HTMLInputElement>("filter-max-dur-text");
    fireEvent.input(name, { target: { value: "  Unplayed  " } });
    await showTab("General");
    await type(max, "1:75");
    await showTab("Presets");
    expect(addButton().disabled).toBe(false);
    expect(heldState(addButton())).toEqual({ held: true, marked: true });
    expect(addButton().title).toBe("Correct the maximum duration first.");
    expect(tabMarked("Presets")).toBe(false);
    await click(addButton());
    expect(selectedTab()).toBe("General");
    expect(document.activeElement).toBe(max);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    await type(max, "");
    await showTab("Presets");

    await click(addButton());
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    expect(presetRows()).toEqual(["Favorites", "Beach days", "Unplayed"]);
    expect(Array.from(presetSelectInDialog().options).map((option) => option.textContent)).toContain("Unplayed");
    expect(byId<HTMLInputElement>("filter-new-preset-name").value).toBe("");
    expect(selectedTab()).toBe("Presets");
    expect(heading()).toBe("Preset: Unplayed");
    // Choose Preset stays where it was, while the section stays in view.
    expect(chosenInDialog()).toBe("");

    const applied = await applyAndWait(server);
    expect(applied.onlyNeverPlayed).toBe(true);
    expect(presets.summaries()).toEqual(["create Unplayed"]);
    expect(presets.writes[0]!.body.filterState).toMatchObject({ onlyNeverPlayed: true, favoritesMode: "off" });
    expect(presets.list.map((preset) => preset.name)).toEqual(["Favorites", "Beach days", "Unplayed"]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Unplayed"));
    // The new preset goes by the id the server gave it.
    expect((await nextPick(server)).presetId).toBe("preset-3");
  });

  it("Update saves the working filter into the chosen preset", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");

    // On None it has nothing to write into, which it says, whatever the filter.
    expect(dialogButton("Update preset").disabled).toBe(true);
    expect(dialogButton("Update preset").title).toBe("Choose a preset to update.");

    await loadInDialog("Favorites");
    expect(dialogButton("Update preset").title).toBe('Preset "Favorites" already has this filter.');
    await click(box("Blacklisted"));
    expect(heading()).toBe("Preset: Favorites*");
    await click(dialogButton("Update preset"));
    await waitFor(() =>
      expect(server.logLines()).toContain("status=Updated preset locally — Apply to save. hasCurrent=false attempt=0")
    );
    expect(server.logLines().some((line) => line.includes("Favorites"))).toBe(false);
    expect(heading()).toBe("Preset: Favorites");
    expect(applyShowsChanges()).toBe(true);

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["update preset-favorites"]);
    expect(presets.list[0]).toMatchObject({ name: "Favorites", filterState: { favoritesMode: "only", blacklistedMode: "off" } });
    expect(presets.list[1]).toEqual(BEACH_PRESET);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Favorites"));
  });

  it("Update saves the working filter into the preset Choose Preset has chosen, while the heading names another", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await loadInDialog("Beach days");
    await click(box("Only never played"));
    expect(heading()).toBe("Preset: Beach days*");

    await chooseInDialog("Favorites");
    await click(dialogButton("Update preset"));
    expect(heading()).toBe("Preset: Favorites");

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["update preset-favorites"]);
    expect(presets.list[0]).toMatchObject({
      name: "Favorites",
      filterState: { favoritesMode: "off", selectedTags: ["Beach"], onlyNeverPlayed: true }
    });
    expect(presets.list[1]).toEqual(BEACH_PRESET);
  });

  for (const [how, activate] of [
    ["the pointer", press],
    ["the keyboard", pressWithKeyboard]
  ] as const) {
    it(`Add Preset pressed with ${how} moves to the new preset's drag handle`, async () => {
      await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
      await openDialog();
      await click(box("Only never played"));
      await showTab("Presets");
      fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Draft" } });
      await activate(dialogButton("Add preset"));
      expect(presetRows()).toEqual(["Favorites", "Beach days", "Draft"]);
      expect(document.activeElement).toBe(presetHandle("Draft"));
    });

    it(`Add Preset pressed with ${how} moves to the new preset's drag handle when it is the only preset`, async () => {
      await mountFilter();
      await openDialog();
      await click(box("Only never played"));
      await showTab("Presets");
      fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Draft" } });
      await activate(dialogButton("Add preset"));
      expect(presetHandle("Draft").disabled).toBe(false);
      expect(document.activeElement).toBe(presetHandle("Draft"));
    });
  }

  it("the arrow keys on a preset's handle move it, keeping focus there and saying where it went, until Apply saves them", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    await openDialog();
    await showTab("Presets");

    expect(await pressKey(presetHandle("Favorites"), "ArrowDown")).toBe(false);
    expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]);
    expect(document.activeElement).toBe(presetHandle("Favorites"));
    expect(presetAnnouncement()).toBe("Favorites moved to position 2 of 3.");
    expect(applyShowsChanges()).toBe(true);
    expect(await pressKey(presetHandle("Recent"), "ArrowUp")).toBe(false);
    expect(presetRows()).toEqual(["Beach days", "Recent", "Favorites"]);
    expect(presetAnnouncement()).toBe("Recent moved to position 2 of 3.");
    expect(Array.from(presetSelectInDialog().options).map((option) => option.textContent)).toEqual([
      "None",
      "Beach days",
      "Recent",
      "Favorites"
    ]);

    expect(await pressKey(presetHandle("Beach days"), "ArrowUp")).toBe(false);
    expect(await pressKey(presetHandle("Favorites"), "ArrowDown")).toBe(false);
    expect(presetRows()).toEqual(["Beach days", "Recent", "Favorites"]);
    expect(presets.writes).toHaveLength(0);

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["reorder preset-beach,preset-recent,preset-favorites"]);
  });

  it("each preset row has a drag handle, its name, and Edit preset, and nothing else", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    for (const name of ["Favorites", "Beach days"]) {
      const row = presetRow(name);
      expect(Array.from(row.children).map((child) => child.className), name).toEqual(["drag-handle", "filter-preset-name", "icon-btn"]);
      const buttons = Array.from(row.querySelectorAll("button"));
      expect(buttons.map((button) => button.getAttribute("aria-label")), name).toEqual([`Reorder ${name}`, `Edit preset ${name}`]);
      expect(buttons.map((button) => button.title), name).toEqual(["Drag to reorder", "Edit preset"]);
    }
    const help = byId(presetHandle("Favorites").getAttribute("aria-describedby") ?? "");
    expect(help.textContent).toBe("Drag to reorder, or press the up and down arrow keys.");
  });

  describe("dragging a preset", () => {
    async function mountLaidOut() {
      const page = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
      await openDialog();
      await showTab("Presets");
      useStylesheet();
      // Preset rows 40 px tall, one under another.
      stubRowLayout("#filter-dialog .filter-preset-row", () => 40);
      return page;
    }

    const transforms = () => Array.from(dialog().querySelectorAll<HTMLElement>(".filter-preset-row")).map((row) => row.style.transform);

    it("follows the pointer past each preset its middle crosses, and moves there until Apply saves it", async () => {
      const { server, presets } = await mountLaidOut();

      pointerDown(presetHandle("Recent"), 90);
      await pointerMove(80);
      expect(presetRow("Recent").classList.contains("is-dragging")).toBe(true);
      // Its middle, at 25, is past Beach days' at 60 but not Favorites' at 20.
      await pointerMove(15);
      expect(transforms()).toEqual(["", "translateY(40px)", "translateY(-75px)"]);
      // Past Favorites' middle too, it stops at the top of the list, though the pointer goes on.
      await pointerMove(5);
      expect(transforms()).toEqual(["translateY(40px)", "translateY(40px)", "translateY(-80px)"]);
      expect(presetRows()).toEqual(["Favorites", "Beach days", "Recent"]);
      expect(applyShowsChanges()).toBe(false);

      await pointerUp();
      expect(presetRows()).toEqual(["Recent", "Favorites", "Beach days"]);
      expect(transforms()).toEqual(["", "", ""]);
      expect(presetRow("Recent").classList.contains("is-dragging")).toBe(false);
      expect(document.activeElement).toBe(presetHandle("Recent"));
      expect(presetAnnouncement()).toBe("Recent moved to position 1 of 3.");
      expect(applyShowsChanges()).toBe(true);
      expect(presets.writes).toHaveLength(0);

      await applyAndWait(server);
      expect(presets.summaries()).toEqual(["reorder preset-recent,preset-favorites,preset-beach"]);
    });

    it("stays under the pointer while the list scrolls, and lands where the pointer is", async () => {
      await mountLaidOut();
      // The tab's body scrolls the preset list with the rest of its section. It reaches well past the presets, so the
      // pointer stays away from its edges and it scrolls only when told to.
      const list = dialog().querySelector<HTMLElement>(".filter-dialog-body")!;
      stubScroller(list, -200, 600, 1200);

      pointerDown(presetHandle("Favorites"), 20);
      await pointerMove(30);
      expect(transforms()).toEqual(["translateY(10px)", "", ""]);
      // Scrolled 50 px with the pointer still, its middle, at 80 in the list, is past Beach days' at 60.
      list.scrollTop = 50;
      fireEvent.scroll(list);
      expect(transforms()).toEqual(["translateY(60px)", "translateY(-40px)", ""]);

      await pointerUp();
      expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]);
      expect(presetAnnouncement()).toBe("Favorites moved to position 2 of 3.");
    });

    it("keeps the list where it was scrolled after a drop, and focuses the dropped handle without scrolling", async () => {
      await mountLaidOut();
      // The tab's body scrolls the preset list with the rest of its section. It reaches well past the presets, so the
      // pointer stays away from its edges and it scrolls only when told to.
      const list = dialog().querySelector<HTMLElement>(".filter-dialog-body")!;
      stubScroller(list, -200, 600, 1200);
      list.scrollTop = 30;
      const focusCalls = scrollOnFocus(list);

      pointerDown(presetHandle("Favorites"), 20);
      await pointerMove(30);
      // Its middle, at 100 in the list, is past Beach days' at 90.
      await pointerMove(70);
      expect(transforms()).toEqual(["translateY(50px)", "translateY(-40px)", ""]);
      // As the transforms go and the presets move, the browser may scroll the list, before the page renders.
      await pointerUp(() => {
        list.scrollTop = 0;
      });
      expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]);
      expect(list.scrollTop).toBe(30);
      expect(document.activeElement).toBe(presetHandle("Favorites"));
      expect(focusCalls.map((call) => [call.element.getAttribute("aria-label"), call.preventScroll])).toEqual([["Reorder Favorites", true]]);
    });

    it("leaves the order for a tap on a handle, and starts only on the handle, so a drag on a preset's name scrolls", async () => {
      await mountLaidOut();
      expect(getComputedStyle(presetHandle("Favorites")).touchAction).toBe("none");
      expect(getComputedStyle(presetRow("Favorites")).touchAction).not.toBe("none");

      pointerDown(presetHandle("Favorites"), 10);
      await pointerMove(14);
      expect(presetRow("Favorites").classList.contains("is-dragging")).toBe(false);
      await pointerUp();
      expect(document.activeElement).toBe(presetHandle("Favorites"));

      pointerDown(presetRow("Favorites").querySelector(".filter-preset-name")!, 10);
      await pointerMove(100);
      expect(presetRow("Favorites").classList.contains("is-dragging")).toBe(false);
      await pointerUp();
      expect(presetRows()).toEqual(["Favorites", "Beach days", "Recent"]);
      expect(transforms()).toEqual(["", "", ""]);
      expect(presetAnnouncement()).toBe("");
      expect(applyShowsChanges()).toBe(false);
    });
  });

  it("Edit Preset's Delete asks first in a dialog above it, and deleting the chosen preset leaves the heading on None", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await loadInDialog("Beach days");
    await click(box("Favorites"));
    await click(box("Favorites"));

    const edit = await editPreset("Beach days");
    const name = byId<HTMLInputElement>("filter-preset-edit-name");
    expect(edit.contains(name)).toBe(true);
    expect(name.value).toBe("Beach days");
    expect(document.activeElement).toBe(name);
    fireEvent.input(name, { target: { value: "Shore" } });
    const remove = buttonIn(edit, "Delete");
    expect(remove.classList.contains("btn-danger")).toBe(true);
    await press(remove);

    const confirm = topDialog();
    expect(appDialogs()).toEqual([edit, confirm]);
    expect(confirm.getAttribute("role")).toBe("alertdialog");
    expect(document.getElementById(confirm.getAttribute("aria-labelledby")!)?.textContent).toBe('Delete preset "Beach days"?');
    expect(document.activeElement).toBe(buttonIn(confirm, "Cancel"));
    expect(buttonIn(confirm, "Delete").classList.contains("btn-danger")).toBe(true);

    await press(buttonIn(confirm, "Cancel"));
    expect(appDialogs()).toEqual([edit]);
    expect(document.activeElement).toBe(remove);
    expect(name.value).toBe("Shore");
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(heading()).toBe("Preset: Beach days");

    await press(remove);
    await press(buttonIn(topDialog(), "Delete"));
    expect(appDialogs()).toEqual([]);
    expect(presetRows()).toEqual(["Favorites"]);
    expect(heading()).toBe("Preset: None*");
    expect(chosenInDialog()).toBe("");
    expect(chipState("Beach")).toBe("include");
    expect(applyShowsChanges()).toBe(true);

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["delete preset-beach"]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("None*"));
  });

  it("Edit Preset flags a name another preset has, disables Save for it and an empty name, and renames, keeping the heading on the renamed preset", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    let edit = await editPreset("Beach days");
    await press(byId("filter-preset-edit-save-btn"));
    expect(appDialogs()).toEqual([]);
    expect(applyShowsChanges()).toBe(false);
    edit = await editPreset("Beach days");
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: "Other" } });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await settle();
    expect(appDialogs()).toEqual([]);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);

    await loadInDialog("Beach days");
    const logsBefore = server.logLines().length;
    edit = await editPreset("Beach days");
    const name = byId<HTMLInputElement>("filter-preset-edit-name");
    const save = byId<HTMLButtonElement>("filter-preset-edit-save-btn");
    expect(edit.contains(save)).toBe(true);

    fireEvent.input(name, { target: { value: "favorites " } });
    await settle();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(tooltipOf(name)?.textContent).toBe("Use a name no other preset has.");
    expect(save.disabled).toBe(true);
    expect(save.hasAttribute("aria-disabled")).toBe(false);
    expect(save.classList.contains("shows-problem")).toBe(false);
    await press(save);
    fireEvent.keyDown(name, { key: "Enter" });
    await settle();
    expect(appDialogs()).toEqual([edit]);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    fireEvent.input(name, { target: { value: "   " } });
    await settle();
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    expect(save.disabled).toBe(true);
    await press(save);
    expect(appDialogs()).toEqual([edit]);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);

    fireEvent.input(name, { target: { value: "  Sunny days " } });
    await settle();
    expect(save.disabled).toBe(false);
    await press(save);
    expect(appDialogs()).toEqual([]);
    expect(presetRows()).toEqual(["Favorites", "Sunny days"]);
    expect(heading()).toBe("Preset: Sunny days");
    expect(chosenInDialog()).toBe("Sunny days");
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["rename preset-beach Sunny days"]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Sunny days"));
  });

  it("after Save renames a preset, focus goes to its row's Edit, and after Delete to the next row's, or the previous one's", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    await openDialog();
    await showTab("Presets");

    await editPreset("Beach days");
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: " Sunny days " } });
    await press(byId("filter-preset-edit-save-btn"));
    expect(presetRows()).toEqual(["Favorites", "Sunny days", "Recent"]);
    expect(document.activeElement).toBe(rowButton("Sunny days", "Edit preset"));

    await deletePreset("Sunny days");
    expect(document.activeElement).toBe(rowButton("Recent", "Edit preset"));
    await deletePreset("Recent");
    expect(document.activeElement).toBe(rowButton("Favorites", "Edit preset"));
    await deletePreset("Favorites");
    expect(presetRows()).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps the dialog open and applies nothing when the presets cannot be saved", async () => {
    // As the overlay, which a successful Apply closes.
    setViewport({ width: 600, height: 800 });
    const { server, presets } = await mountFilter([FAVORITES_PRESET]);
    // A refusal without a reason, as for a body the server can't read.
    presets.writeFailure = { status: 500 };
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");
    await addPreset("Unplayed");
    const queries = libraryQueries(server).length;

    await apply();
    await expectNotice(server, "Saving presets failed.", "Saving presets failed (HTTP 500).");
    expect(isOpen()).toBe(true);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(presetRows()).toEqual(["Favorites", "Unplayed"]);
    expect((await nextPick(server)).filterState.onlyNeverPlayed).toBe(false);

    presets.writeFailure = null;
    await apply();
    await waitFor(() => expect(libraryQueries(server)).toHaveLength(queries + 1));
    await waitFor(() => expect(relayed(server, "Filters applied.")).toBe(true));
    expect(panel().hidden).toBe(true);
    expect(presets.list.map((preset) => preset.name)).toEqual(["Favorites", "Unplayed"]);
  });
});

describe("presets that would take each other's names or filters", () => {
  async function renamePreset(name: string, to: string): Promise<void> {
    await editPreset(name);
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: to } });
    await press(byId("filter-preset-edit-save-btn"));
  }

  /** Apply shows as unavailable, as a held Apply does, with its dot red, and `reason` as its tooltip and description. */
  function blockedSaying(reason: string): void {
    const button = applyButton();
    expect(button.disabled).toBe(false);
    expect(heldState(button)).toEqual({ held: true, marked: true });
    expect(button.title).toBe(reason);
    expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(reason);
  }

  /** Pressing Apply shows `reason` in a notice, whose log line is `logText`, and saves and applies nothing. */
  async function pressShows(server: FakeServer, presets: FakePresets, reason: string, logText: string): Promise<void> {
    const queries = libraryQueries(server).length;
    await apply();
    await waitFor(() => expect(openNotices()).toEqual([reason]));
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine(logText, null, 0)));
    expect(server.logLines().some((line) => line.includes("Favorites"))).toBe(false);
    await closeNotices();
    expect(presets.writes).toEqual([]);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(isOpen()).toBe(true);
  }

  it("Apply shows as unavailable while two swap names or three rotate them, saying why in a notice when pressed, and a chain applies", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    await openDialog();
    await showTab("Presets");
    await renamePreset("Favorites", "Spare");
    await renamePreset("Beach days", "Favorites");
    await renamePreset("Spare", "Beach days");
    const swap = 'Presets "Beach days" and "Favorites" would take each other\'s names. Apply in two steps: give one of them another name, apply, then rename it.';
    blockedSaying(swap);
    await pressShows(server, presets, swap, "Presets would take each other's names. Apply in two steps.");

    await click(discardButton());
    await renamePreset("Recent", "Spare");
    await renamePreset("Beach days", "Recent");
    await renamePreset("Favorites", "Beach days");
    await renamePreset("Spare", "Favorites");
    blockedSaying('Presets "Beach days", "Recent", and "Favorites" would take each other\'s names. Apply in two steps: give one of them another name, apply, then rename it.');

    await click(discardButton());
    await renamePreset("Recent", "Latest");
    await renamePreset("Beach days", "Recent");
    await renamePreset("Favorites", "Beach days");
    expect(applyButton().hasAttribute("aria-disabled")).toBe(false);
    expect(applyShowsChanges()).toBe(true);
    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["rename preset-recent Latest", "rename preset-beach Recent", "rename preset-favorites Beach days"]);
  });

  it("Apply shows as unavailable while two presets swap filters, saying why in a notice when pressed", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, RECENT_PRESET]);
    await openDialog();
    await showTab("Presets");
    // Through a filter of Favorites' own on the way, since no two presets may share one.
    await loadInDialog("Favorites");
    await click(box("Only videos with known duration"));
    await click(dialogButton("Update preset"));
    await click(box("Only videos with known duration"));
    await chooseInDialog("Recent");
    await click(dialogButton("Update preset"));
    await loadInDialog("");
    await click(box("Only never played"));
    await chooseInDialog("Favorites");
    await click(dialogButton("Update preset"));
    const swap = 'Presets "Favorites" and "Recent" would take each other\'s filters. Apply in two steps: give one of them another filter, apply, then update it.';
    blockedSaying(swap);
    await pressShows(server, presets, swap, "Presets would take each other's filters. Apply in two steps.");
  });
});

describe("a preset save the server refuses", () => {
  it("shows the server's reason, logs only the status, keeps the changes that didn't land, and applies nothing", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await editPreset("Beach days");
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: "Sunny days" } });
    await press(byId("filter-preset-edit-save-btn"));
    await loadInDialog("Favorites");
    await click(box("Only never played"));
    await click(dialogButton("Update preset"));
    // Another device saves that filter in a preset of its own first.
    presets.list = [...presets.list, { id: "preset-other", name: "Other", filterState: { favoritesMode: "only", onlyNeverPlayed: true } }];
    const queries = libraryQueries(server).length;

    await apply();

    const reason = 'Saving presets failed: Preset "Other" already has this filter.';
    await waitFor(() => expect(openNotices()).toEqual([reason]));
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Saving presets failed (HTTP 409).", null, 0)));
    expect(server.logLines().some((line) => line.includes("Other"))).toBe(false);
    await closeNotices();
    expect(presets.summaries()).toEqual(["rename preset-beach Sunny days", "update preset-favorites (409)"]);
    // The rename landed; Favorites' filter didn't, and stays unsaved, with the other device's preset taken in.
    expect(presetRows()).toEqual(["Favorites", "Sunny days", "Other"]);
    expect(applyShowsChanges()).toBe(true);
    expect(isOpen()).toBe(true);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect((await nextPick(server)).filterState.onlyNeverPlayed).toBe(false);
  });
});

describe("presets save answered with 401", () => {
  it("shows only the pairing prompt, applies nothing, and logs it", async () => {
    setViewport({ width: 600, height: 800 });
    const { server, presets } = await mountFilter([FAVORITES_PRESET]);
    presets.writeFailure = { status: 401 };
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");
    await addPreset("Unplayed");
    const queries = libraryQueries(server).length;
    expect(pairingPrompt().style.display).toBe("none");

    await apply();
    await waitFor(() => expect(pairingPrompt().style.display).toBe("flex"));
    await settle();
    expect(openNotices()).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(presetRows()).toEqual(["Favorites", "Unplayed"]);
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/presets/create")));
  });
});

describe("preset dropdown, server events, and clear all", () => {

  // The tab shows the applied filter again after a preset is picked in the Library tab, which it leaves for that.
  it("shows a preset picked in the Library tab when it shows again, without the changes it was left with", async () => {
    await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    expect(applyShowsChanges()).toBe(true);
    expect(panelTab("Filter").getAttribute("aria-label")).toBe("Filter, unsaved changes");

    // The pick is made on the Library tab, while the Filter tab is hidden, and drops its changes then.
    await pickPreset("preset-favorites");
    expect(panelTab("Filter").getAttribute("aria-label")).toBe("Filter");
    expect(isOpen()).toBe(true);
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "only", disabled: false });
    expect(box("Only never played").checked).toBe(false);
    expect(heading()).toBe("Preset: Favorites");
    expect(applyShowsChanges()).toBe(false);
    await showTab("Presets");
    expect(chosenInDialog()).toBe("Favorites");
  });

  it("a source enabled or disabled loads sources, tags, and presets again and keeps the working filter, and a load that fails says nothing", async () => {
    let sources = SOURCES;
    let tagModel = TAG_MODEL;
    let sourcesStatus = 200;
    const { page, server, presets } = await mountFilter([FAVORITES_PRESET], (server) => {
      server.on("GET", "/api/sources", () => (sourcesStatus === 200 ? json(sources) : status(sourcesStatus)));
      server.on("POST", "/api/tag-editor/model", () => json(tagModel));
    });
    await openDialog();
    await click(box("Only never played"));

    sources = [...SOURCES, { id: "source-4", displayName: "Phone", rootPath: "E:\\phone", isEnabled: true }];
    tagModel = { ...TAG_MODEL, tags: [...TAG_MODEL.tags, { name: "Snow", categoryId: "cat-places" }] };
    presets.list = [...presets.list, RECENT_PRESET];
    page.stream().emit("sourceStateChanged", 40, { sourceId: "source-4", isEnabled: true });

    await waitFor(() => expect(box("Phone (E:\\phone)").checked).toBe(true));
    expect(box("Only never played").checked).toBe(true);
    expect(applyShowsChanges()).toBe(true);
    await showTab("Tags");
    expect(chipNames("Places")).toEqual(["alps", "Beach", "Snow"]);
    await showTab("Presets");
    expect(presetRows()).toEqual(["Favorites", "Recent"]);
    expect(heading()).toBe("Preset: Recent");

    sourcesStatus = 500;
    page.stream().emit("sourceStateChanged", 41, { sourceId: "source-4", isEnabled: false });
    await waitFor(() => expect(server.logLines()).toContain("filter=event-load-failed status=500"));
    expect(openNotices()).toEqual([]);
    expect(isOpen()).toBe(true);
    expect(presetRows()).toEqual(["Favorites", "Recent"]);
  });

  it("a tag catalog change's load keeps unsaved preset changes and Apply's changes, with a preset another device added at the end, and Apply then saves them", async () => {
    const { page, server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await pressKey(presetHandle("Favorites"), "ArrowDown");
    expect(presetRows()).toEqual(["Beach days", "Favorites"]);

    presets.list = [...presets.list, RECENT_PRESET];
    page.stream().emit("tagCatalogChanged", 40, { categories: [], tags: [] });
    await waitFor(() => expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]));
    expect(applyShowsChanges()).toBe(true);

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["reorder preset-beach,preset-favorites,preset-recent"]);
  });

  it("takes another device's preset change while it shows, keeping an unsaved rename, as the preset dropdown does", async () => {
    const { page, server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await editPreset("Beach days");
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: "Shore" } });
    await press(byId("filter-preset-edit-save-btn"));
    expect(presetRows()).toEqual(["Favorites", "Shore"]);

    presets.list = [...presets.list, RECENT_PRESET];
    page.stream().emit("presetCatalogChanged", 50, { presetId: RECENT_PRESET.id, clientId: "another-client" });
    await waitFor(() => expect(presetRows()).toEqual(["Favorites", "Shore", "Recent"]));
    expect(applyShowsChanges()).toBe(true);
    expect(Array.from(document.querySelectorAll<HTMLOptionElement>("#preset-select option")).map((option) => option.textContent)).toEqual([
      "None",
      "Favorites",
      "Beach days",
      "Recent"
    ]);

    await applyAndWait(server);
    expect(presets.summaries()).toEqual(["rename preset-beach Shore"]);
  });

  it("Clear all filters goes back to the default filter and drops unsaved preset changes", async () => {
    const { server, presets } = await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Presets");
    await addPreset("Temporary");

    await click(clearAllButton());
    expect(heading()).toBe("Preset: None");
    // Rich is applied, so Apply has the default filter to apply, and Clear all has nothing more to clear.
    expect(applyShowsChanges()).toBe(true);
    expect(clearAllButton().disabled).toBe(true);
    expect(presetRows()).toEqual(["Rich", "Favorites"]);
    // Choose Preset keeps its choice while the saved presets have it.
    expect(chosenInDialog()).toBe("Rich");
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(box("All (Videos and Photos)").checked).toBe(true);
    expect(box("Movies (C:\\media\\movies)").checked && box("C:\\media\\photos").checked && box("Archive (D:\\archive)").checked).toBe(true);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("");
    await showTab("Tags");
    expect(chipState("Beach")).toBe("none");
    expect(chipState("Bob")).toBe("none");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People"]);
    expect(byId<HTMLSelectElement>("filter-global-match").value).toBe("and");

    const applied = await applyAndWait(server);
    expect(applied).toMatchObject({ favoritesMode: "off", mediaTypeFilter: 0, selectedTags: [], includedSourceIds: [] });
    expect(applied.minDuration).toBeUndefined();
    expect(presets.writes).toHaveLength(0);
    await waitFor(() => expect(selectedPresetLabel()).toBe("None"));
  });

  it("Clear all is kept, with its dots and Apply's changes, through another tab until Apply", async () => {
    const { server } = await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await click(clearAllButton());
    expect(applyShowsChanges()).toBe(true);
    expect(panelTab("Filter").getAttribute("aria-label")).toBe("Filter, unsaved changes");
    await showTab("Tags");
    // Rich includes Beach, which Clear all took out.
    expect(category("Places").querySelector<HTMLElement>(".category-dot")!.hidden).toBe(false);

    await click(panelTab("Library"));
    await openDialog();
    expect(applyShowsChanges()).toBe(true);
    expect(chipState("Beach")).toBe("none");
    await showTab("General");
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("");

    const applied = await applyAndWait(server);
    expect(applied).toMatchObject({ favoritesMode: "off", selectedTags: [] });
    expect(panelTab("Filter").getAttribute("aria-label")).toBe("Filter");
  });
});

describe("unsaved state", () => {
  /** Beach days, saved with an AND entry for its category, which says nothing. */
  const BEACH_LEFTOVER_PRESET = {
    id: "preset-beach",
    name: "Beach days",
    filterState: { selectedTags: ["Beach"], categoryLocalMatchModes: { "cat-places": 0 } }
  };
  const EVERY_SOURCE_PRESET = {
    id: "preset-every",
    name: "Every source",
    filterState: { includedSourceIds: ["source-1", "source-2", "source-3"] }
  };

  /** Whether the Filter tab shows its unsaved-changes dot. */
  function dotted(): boolean {
    return panelTab("Filter").getAttribute("aria-label") === "Filter, unsaved changes";
  }

  /** Whether the panel button shows its unsaved-changes dot, which follows the Filter tab's while the Tags tab has none. */
  function panelDotted(): boolean {
    return byId("panel-btn").getAttribute("aria-label")!.endsWith(", unsaved changes");
  }

  /** The heading, whether Apply shows changes to apply, and the Filter tab's and the panel button's dots. */
  function marks(): { heading: string; apply: boolean; dot: boolean; panelDot: boolean } {
    return { heading: heading(), apply: applyShowsChanges(), dot: dotted(), panelDot: panelDotted() };
  }

  async function setLocalMode(title: string, value: "0" | "1"): Promise<void> {
    fireEvent.change(matchMode(title), { target: { value } });
    await settle();
  }

  it("a Local match mode set back to ALL matches the preset again, a preset saved with a leftover AND entry included, and once applied too", async () => {
    const { server } = await mountFilter([BEACH_LEFTOVER_PRESET]);
    await pickPreset("preset-beach");
    expect(selectedPresetLabel()).toBe("Beach days");
    expect((await nextPick(server)).presetId).toBe("preset-beach");
    await openDialog();
    await showTab("Tags");
    expect(marks()).toEqual({ heading: "Preset: Beach days", apply: false, dot: false, panelDot: false });

    await setLocalMode("Places", "1");
    expect(marks()).toEqual({ heading: "Preset: Beach days*", apply: true, dot: true, panelDot: true });
    await setLocalMode("Places", "0");
    expect(marks()).toEqual({ heading: "Preset: Beach days", apply: false, dot: false, panelDot: false });

    await setLocalMode("People", "1");
    expect((await applyAndWait(server)).categoryLocalMatchModes).toEqual({ "cat-people": 1 });
    await waitFor(() => expect(selectedPresetLabel()).toBe("Beach days*"));
    await setLocalMode("People", "0");
    expect(marks()).toEqual({ heading: "Preset: Beach days", apply: true, dot: true, panelDot: true });
    expect((await applyAndWait(server)).categoryLocalMatchModes).toBeUndefined();
    await waitFor(() => expect(selectedPresetLabel()).toBe("Beach days"));
    expect(marks()).toEqual({ heading: "Preset: Beach days", apply: false, dot: false, panelDot: false });
    expect((await nextPick(server)).presetId).toBe("preset-beach");
  });

  it("sources checked back as they were match a preset that names every source again, and once applied too", async () => {
    const { server } = await mountFilter([EVERY_SOURCE_PRESET]);
    await pickPreset("preset-every");
    await openDialog();
    expect(marks()).toEqual({ heading: "Preset: Every source", apply: false, dot: false, panelDot: false });

    await click(box("Movies (C:\\media\\movies)"));
    expect(marks()).toEqual({ heading: "Preset: Every source*", apply: true, dot: true, panelDot: true });
    await click(box("Movies (C:\\media\\movies)"));
    expect(marks()).toEqual({ heading: "Preset: Every source", apply: false, dot: false, panelDot: false });
    await click(box("Only never played"));
    await click(box("Only never played"));
    expect(marks()).toEqual({ heading: "Preset: Every source", apply: false, dot: false, panelDot: false });

    await click(box("C:\\media\\photos"));
    expect((await applyAndWait(server)).includedSourceIds).toEqual(["source-1", "source-3"]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Every source*"));
    await click(box("C:\\media\\photos"));
    expect((await applyAndWait(server)).includedSourceIds).toEqual(["source-1", "source-2", "source-3"]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Every source"));
    expect(marks()).toEqual({ heading: "Preset: Every source", apply: false, dot: false, panelDot: false });
  });

  it("each change put back clears the dot and Apply's changes, and a real change still shows them", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    const clear = { heading: "Preset: None", apply: false, dot: false, panelDot: false };

    await showTab("Tags");
    await includeTag("Beach");
    expect(marks()).toEqual({ heading: "Preset: Beach days", apply: true, dot: true, panelDot: true });
    await includeTag("Beach");
    expect(marks()).toEqual(clear);
    await excludeTag("Bob");
    await includeTag("Bob");
    expect(dotted()).toBe(true);
    await includeTag("Bob");
    expect(marks()).toEqual(clear);
    fireEvent.change(byId("filter-global-match"), { target: { value: "or" } });
    await settle();
    expect(dotted()).toBe(true);
    fireEvent.change(byId("filter-global-match"), { target: { value: "and" } });
    await settle();
    expect(marks()).toEqual(clear);
    await setLocalMode("People", "1");
    expect(dotted()).toBe(true);
    await setLocalMode("People", "0");
    expect(marks()).toEqual(clear);

    await showTab("Presets");
    await pressKey(presetHandle("Favorites"), "ArrowDown");
    expect(presetRows()).toEqual(["Beach days", "Favorites"]);
    expect(marks()).toEqual({ ...clear, apply: true, dot: true, panelDot: true });
    await pressKey(presetHandle("Favorites"), "ArrowUp");
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(marks()).toEqual(clear);

    // The server keeps a name's case, so a rename that changes only case is a change.
    await editPreset("Favorites");
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: "favorites" } });
    await settle();
    await press(byId("filter-preset-edit-save-btn"));
    expect(presetRows()).toEqual(["favorites", "Beach days"]);
    expect(marks()).toEqual({ ...clear, apply: true, dot: true, panelDot: true });
  });

  for (const which of ["min", "max"] as const) {
    it(`a ${which}imum typed, left, and emptied clears the heading's star, the dot, and Apply's changes before the field is left again`, async () => {
      await mountFilter();
      await openDialog();
      const field = byId<HTMLInputElement>(`filter-${which}-dur-text`);

      await type(field, "1:30");
      expect(marks()).toEqual({ heading: "Preset: None*", apply: true, dot: true, panelDot: true });
      field.focus();
      fireEvent.input(field, { target: { value: "" } });
      await settle();
      expect(document.activeElement).toBe(field);
      expect(marks()).toEqual({ heading: "Preset: None", apply: false, dot: false, panelDot: false });
    });
  }

  /**
   * The events a browser fires as the user types into a focused field, one input event per keystroke, each in a task
   * of its own, with nothing wrapping them.
   */
  async function keystrokes(field: HTMLInputElement, texts: readonly string[]): Promise<void> {
    for (const text of texts) {
      field.value = text;
      field.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await settle();
    }
  }

  /** Each shorter text as the user erases `text` a character at a time, down to empty. */
  function erasing(text: string): string[] {
    return Array.from({ length: text.length }, (_, index) => text.slice(0, text.length - index - 1));
  }

  /** Each longer text as the user types `text` a character at a time. */
  function typing(text: string): string[] {
    return Array.from({ length: text.length }, (_, index) => text.slice(0, index + 1));
  }

  /** Leaving a field the user changed, as a browser does: its change event, then blur. */
  async function leave(field: HTMLInputElement): Promise<void> {
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.blur();
    await settle();
  }

  for (const which of ["min", "max"] as const) {
    for (const text of ["1:00", "abc"]) {
      it(`a ${which}imum of "${text}" typed, left, and erased with a browser's events has no changes, in the field and after leaving it`, async () => {
        await mountFilter();
        await openDialog();
        const field = byId<HTMLInputElement>(`filter-${which}-dur-text`);
        const clear = { heading: "Preset: None", apply: false, dot: false, panelDot: false };

        field.focus();
        await keystrokes(field, typing(text));
        await leave(field);
        expect(marks()).toEqual({ heading: "Preset: None*", apply: true, dot: true, panelDot: true });

        field.focus();
        await keystrokes(field, erasing(text));
        expect(document.activeElement).toBe(field);
        expect(field.value).toBe("");
        expect(marks()).toEqual(clear);

        await leave(field);
        expect(field.value).toBe("");
        expect(marks()).toEqual(clear);
      });
    }
  }

  it("a resync's load takes the server's list for a preset list put back as it was, and Apply saves none", async () => {
    const { page, server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await pressKey(presetHandle("Favorites"), "ArrowDown");
    await pressKey(presetHandle("Favorites"), "ArrowUp");

    presets.list = [...presets.list, RECENT_PRESET];
    page.stream().emit("resyncRequired", 40, { reason: "gap" });
    await waitFor(() => expect(presetRows()).toEqual(["Favorites", "Beach days", "Recent"]));
    expect(applyShowsChanges()).toBe(false);
    expect(dotted()).toBe(false);

    await showTab("General");
    await click(box("Only never played"));
    await applyAndWait(server);
    expect(presets.writes).toHaveLength(0);
  });
});

describe("presets need a filter of their own", () => {
  const DEFAULT_REASON = "Choose a filter to save as a preset.";
  const addButton = () => byId<HTMLButtonElement>("filter-add-preset-btn");
  const updateButton = () => byId<HTMLButtonElement>("filter-update-preset-btn");
  const shared = (name: string) => `Preset "${name}" already has this filter.`;

  /** The button is disabled, with `reason` as its tooltip and description, and no field holds it. */
  function expectReason(button: HTMLButtonElement, reason: string): void {
    expect(button.disabled, button.id).toBe(true);
    expect(button.title, button.id).toBe(reason);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent, button.id).toBe(reason);
    expect(heldState(button), button.id).toEqual({ held: false, marked: false });
  }

  /** The button can be pressed, with its own tooltip and no description. */
  function expectAvailable(button: HTMLButtonElement, title: string): void {
    expect(button.disabled, button.id).toBe(false);
    expect(button.title, button.id).toBe(title);
    expect(button.hasAttribute("aria-describedby"), button.id).toBe(false);
  }

  it("Add Preset and Update are unavailable while the filter is the default, with why as their tooltip, and Update on None says it needs a preset", async () => {
    await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await showTab("Presets");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await settle();
    expectReason(addButton(), DEFAULT_REASON);
    // On None, Update says first that it has nothing to write into.
    expectReason(updateButton(), "Choose a preset to update.");
    await chooseInDialog("Favorites");
    expectReason(updateButton(), DEFAULT_REASON);

    await showTab("General");
    await click(box("Only never played"));
    expectAvailable(addButton(), "Add preset");
    expectAvailable(updateButton(), "Update preset");
    await chooseInDialog("");
    expectReason(updateButton(), "Choose a preset to update.");
  });

  it("Add Preset and Update are unavailable while a preset has the filter, the chosen one included, naming it", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await chooseInDialog("Beach days");

    // Another preset's filter.
    await click(box("Favorites"));
    expectReason(addButton(), shared("Favorites"));
    expectReason(updateButton(), shared("Favorites"));

    // The chosen preset's own filter, which updating it would leave as it is.
    await click(loadButton());
    expect(heading()).toBe("Preset: Beach days");
    expectReason(addButton(), shared("Beach days"));
    expectReason(updateButton(), shared("Beach days"));

    await click(box("Only never played"));
    expectAvailable(addButton(), "Add preset");
    expectAvailable(updateButton(), "Update preset");
  });

  it("a duration that reads as another preset's filter disables them before its field is left", async () => {
    const short = { id: "preset-short", name: "Short", filterState: { maxDuration: "00:02:00" } };
    await mountFilter([FAVORITES_PRESET, short]);
    await openDialog();
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await chooseInDialog("Favorites");
    const max = byId<HTMLInputElement>("filter-max-dur-text");
    fireEvent.input(max, { target: { value: "2:00" } });
    await settle();
    expect(heading()).toBe("Preset: None*");
    expectReason(addButton(), shared("Short"));
    expectReason(updateButton(), shared("Short"));

    fireEvent.change(max);
    await settle();
    expect(heading()).toBe("Preset: Short");
    expect(chosenInDialog()).toBe("Favorites");
    expectReason(updateButton(), shared("Short"));
  });

  it("gives the default filter's reason before naming a preset that holds the default filter", async () => {
    const everything = { id: "preset-everything", name: "Everything", filterState: {} };
    await mountFilter([everything, FAVORITES_PRESET]);
    await openDialog();
    await showTab("Presets");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await chooseInDialog("Favorites");
    await settle();
    expectReason(addButton(), DEFAULT_REASON);
    expectReason(updateButton(), DEFAULT_REASON);
  });

  it("Load, Update, and Add Preset are icon buttons, named and titled Load preset, Update preset, and Add preset", async () => {
    await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");
    await chooseInDialog("Favorites");
    expect(presetSelectInDialog().nextElementSibling).toBe(loadButton());
    expect(loadButton().nextElementSibling).toBe(updateButton());
    for (const [button, label, icon] of [
      [loadButton(), "Load preset", "sync"],
      [updateButton(), "Update preset", "save"],
      [addButton(), "Add preset", "add"]
    ] as const) {
      expect(button.classList.contains("icon-btn"), label).toBe(true);
      expect(button.getAttribute("aria-label"), label).toBe(label);
      expect(button.title, label).toBe(label);
      expect(button.querySelector(".material-symbol-icon")?.textContent?.trim(), label).toBe(icon);
    }
  });
});

describe("Choose Preset", () => {
  it("starts over on the heading's preset, its base while starred, each time the Presets section comes into view, with or without unsaved changes, and a choice lasts while it stays in view", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await loadInDialog("Beach days");
    await click(box("Favorites"));
    expect(heading()).toBe("Preset: Beach days*");

    for (const [way, comeBack] of [
      ["its sub-tab", async () => {
        await showTab("General");
        await showTab("Presets");
      }],
      ["the panel's Close", async () => {
        await closePanel();
        await openDialog();
      }],
      ["another panel tab", async () => {
        await click(panelTab("Library"));
        await openDialog();
      }]
    ] as Array<[string, () => Promise<void>]>) {
      await chooseInDialog("Favorites");
      await settle();
      expect(chosenInDialog(), way).toBe("Favorites");
      await comeBack();
      expect(selectedTab(), way).toBe("Presets");
      expect(applyShowsChanges(), way).toBe(true);
      expect(chosenInDialog(), way).toBe("Beach days");
    }

    // Without unsaved changes, on None.
    await click(discardButton());
    expect(applyShowsChanges()).toBe(false);
    await chooseInDialog("Favorites");
    await showTab("Tags");
    await showTab("Presets");
    expect(chosenInDialog()).toBe("");
  });
});

describe("names and storage", () => {
  it("shows source, tag, and preset names as text", async () => {
    await mountFilter([{ id: "preset-mine", name: "<u>Mine</u>", filterState: { favoritesMode: "only" } }], (server) => {
      server.on("GET", "/api/sources", () => json([{ id: "source-x", displayName: "<b>Movies</b>", rootPath: "C:\\m", isEnabled: true }]));
      server.on("POST", "/api/tag-editor/model", () =>
        json({ categories: [{ id: "cat-x", name: "<em>Places</em>", sortOrder: 0 }], tags: [{ name: "<i>Beach</i>", categoryId: "cat-x" }], items: [] })
      );
    });
    await openDialog();

    expect(within(dialog()).getByText("<b>Movies</b> (C:\\m)")).toBeTruthy();
    expect(within(dialog()).getByText("<em>Places</em>")).toBeTruthy();
    expect(within(dialog()).getByText("<i>Beach</i>")).toBeTruthy();
    expect(within(dialog()).getByText("<u>Mine</u>", { selector: ".filter-preset-name" })).toBeTruthy();
    expect(dialog().querySelector("b, em, i, u")).toBeNull();
  });

  it("adds only its expanded categories to the device's memory, and nothing to browser storage of its own", async () => {
    const { server } = await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await click(box("Favorites"));
    await showTab("Tags");
    await includeTag("Beach");
    await click(categoryToggle("Mood"));
    await showTab("Presets");
    await addPreset("Beach favorites");
    await applyAndWait(server);

    // The panel and the Library tab remember their state on this device, which their own tests cover.
    expect(storageKeys(localStorage).filter((key) => !key.startsWith("rr_device."))).toEqual(["rr_clientId"]);
    expect(storageKeys(localStorage)).toContain("rr_device.filter.expandedTagCategories");
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId"]);
  });
});

describe("controls kept in place", () => {
  // Added after the dialog moved to a component. `app.js` rebuilt a panel on each change, which dropped focus, the
  // preset list's scroll position, and a typed preset name; keeping them is intended.
  it("keeps the clicked controls, the preset list, and a typed preset name while a panel changes", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    await openDialog();
    await showTab("Tags");

    const include = within(chip("Beach")).getByTitle("Include");
    include.focus();
    await click(include);
    expect(chipState("Beach")).toBe("include");
    expect(within(chip("Beach")).getByTitle("Include")).toBe(include);
    expect(document.activeElement).toBe(include);
    const toggle = categoryToggle("Places");
    await click(toggle);
    expect(categoryToggle("Places")).toBe(toggle);

    await showTab("Presets");
    const list = dialog().querySelector(".filter-preset-list");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Draft" } });
    await pressKey(presetHandle("Favorites"), "ArrowDown");
    expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]);
    expect(dialog().querySelector(".filter-preset-list")).toBe(list);
    expect(byId<HTMLInputElement>("filter-new-preset-name").value).toBe("Draft");
  });
});
