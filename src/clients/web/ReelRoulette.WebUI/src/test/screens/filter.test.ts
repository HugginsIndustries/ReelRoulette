// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPATIBLE_VERSION,
  DEFAULT_VIEWPORT,
  FakeServer,
  json,
  mountPage,
  normalizedMarkup,
  pickPreset,
  pointerDown,
  pointerMove,
  pointerUp,
  pressKey,
  resetPage,
  scrollOnFocus,
  selectedPresetLabel,
  setViewport,
  settle,
  status,
  stubRowLayout,
  stubScroller,
  useStylesheet,
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

const FAVORITES_PRESET = { id: "preset-favorites", name: "Favorites", filterState: { favoritesOnly: true } };
const BEACH_PRESET = { id: "preset-beach", name: "Beach days", filterState: { selectedTags: ["Beach"] } };
const RECENT_PRESET = { id: "preset-recent", name: "Recent", filterState: { onlyNeverPlayed: true } };
const EVERYTHING_PRESET = { id: "preset-everything", name: "Everything", filterState: {} };

/** One filter as the desktop writes it, with Favorites excluded and Blacklisted only. The desktop's tests read it too. */
const DESKTOP_WRITTEN_FILTER = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../../shared/fixtures/filter-state-written.json"), "utf8")
).desktop as Record<string, unknown>;

/** A preset that sets something in every part of the dialog, with "Ghost", a tag the catalog does not have. */
const RICH_PRESET = {
  id: "preset-rich",
  name: "Rich",
  filterState: {
    favoritesOnly: true,
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

/** The presets the fake server keeps. A saved list replaces them, with new ids. */
interface FakePresets {
  list: Array<{ id: string; name: string; filterState: unknown }>;
  /** A status to answer the next saves with, in place of saving. */
  saveFailure: number | null;
  saves(): any[];
}

function servePresets(server: FakeServer, initial: FakePresets["list"]): FakePresets {
  const presets: FakePresets = {
    list: initial.slice(),
    saveFailure: null,
    saves: () => server.requests("POST", "/api/presets").map((call) => call.body)
  };
  server.on("GET", "/api/presets", () => json(presets.list));
  server.on("POST", "/api/presets", (call) => {
    if (presets.saveFailure) {
      return status(presets.saveFailure);
    }
    presets.list = (call.body as Array<{ name: string; filterState: unknown }>).map((preset, index) => ({
      id: `saved-${index + 1}`,
      name: preset.name,
      filterState: preset.filterState
    }));
    return json(presets.list);
  });
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
  await screen.findByText("Ready (API 1)");
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
  return within(panel().querySelector(".panel-tablist") as HTMLElement).getByRole("tab", { name, hidden: true }) as HTMLButtonElement;
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
  return dialogButton(/^Apply\*?$/);
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

/** Whether a section's tab shows the red icon of a flagged field. */
function tabMarked(name: "General" | "Tags" | "Presets"): boolean {
  const tab = within(dialog()).getByRole("tab", { name });
  const marked = tab.querySelector(".section-problem") !== null;
  expect(tab.title).toBe(marked ? "A field here is not valid" : "");
  return marked;
}

/** A field's red icon, or null while it is not flagged. */
function fieldIcon(field: HTMLElement): HTMLElement | null {
  return field.closest(".vfield")?.querySelector<HTMLElement>(".vfield-icon") ?? null;
}

/** The tooltip that describes a flagged field. */
function tooltipOf(field: HTMLElement): HTMLElement | null {
  const id = field.getAttribute("aria-describedby");
  return id ? document.getElementById(id) : null;
}

function tooltipShown(field: HTMLElement): boolean {
  return tooltipOf(field)?.classList.contains("is-shown") ?? false;
}

/** An action's label, without its red icon. */
function label(button: HTMLButtonElement): string {
  return button.querySelector(".btn-label")?.textContent ?? "";
}

/** Whether a field holds the action, and whether the action shows the red icon of a flagged field. */
function heldState(button: HTMLButtonElement): { held: boolean; icon: boolean } {
  return { held: button.getAttribute("aria-disabled") === "true", icon: button.querySelector(".btn-problem") !== null };
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
  const found = Array.from(dialog().querySelectorAll<HTMLElement>(".tag-editor-category")).find(
    (candidate) => candidate.querySelector(".tag-editor-category-title")?.textContent === title
  );
  if (!found) {
    throw new Error(`No tag category named ${title}.`);
  }
  return found;
}

function categoryTitles(): string[] {
  return Array.from(dialog().querySelectorAll(".tag-editor-category-title")).map((node) => node.textContent ?? "");
}

function chipNames(title: string): string[] {
  return Array.from(category(title).querySelectorAll(".tag-chip-label")).map((node) => node.textContent ?? "");
}

function categoryGrid(title: string): HTMLElement {
  return category(title).querySelector(".tag-editor-tag-grid") as HTMLElement;
}

function categoryToggle(title: string): HTMLButtonElement {
  return category(title).querySelector(".tag-editor-category-toggle") as HTMLButtonElement;
}

function presetSelectInDialog(): HTMLSelectElement {
  return byId<HTMLSelectElement>("filter-dialog-preset-select");
}

async function chooseInDialog(name: string): Promise<void> {
  fireEvent.change(presetSelectInDialog(), { target: { value: name } });
  await settle();
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
  await click(dialogButton("Add Preset"));
}

function statusLine(): string {
  return document.getElementById("status")?.textContent ?? "";
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
  expect(statusLine()).toBe("Filters applied.");
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
    expect(applyButton().textContent).toBe("Apply");
    expect(applyButton().classList.contains("has-pending")).toBe(false);
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

  it("the panel's Close, another tab, and Cancel drop its changes without applying or saving presets, and it shows the applied filter and the saved presets again", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    const queries = libraryQueries(server).length;
    const leave: Array<[string, () => Promise<void>]> = [
      ["the panel's Close", closePanel],
      ["another tab", () => click(panelTab("Library"))],
      [
        "Cancel beside the player",
        async () => {
          await click(dialogButton("Cancel"));
          expect(isOpen()).toBe(true);
          expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
          expect(presetRows()).toEqual(presets.list.map((preset) => preset.name));
          expect(applyButton().textContent).toBe("Apply");
          await closePanel();
        }
      ],
      [
        "Cancel as the overlay",
        async () => {
          setViewport({ width: 600, height: 800 });
          await settle();
          await click(dialogButton("Cancel"));
          expect(panel().hidden).toBe(true);
          setViewport(DEFAULT_VIEWPORT);
          await settle();
        }
      ]
    ];

    for (const [way, leaveTab] of leave) {
      await openDialog();
      await click(box("Favorites"));
      expect(applyButton().textContent, way).toBe("Apply*");
      await showTab("Presets");
      expect(presetRows(), way).toEqual(["Favorites", "Beach days", "Recent"]);
      await addPreset("Draft");
      await pressKey(presetHandle("Favorites"), "ArrowDown");
      await deletePreset("Recent");
      expect(presetRows()).toEqual(["Beach days", "Favorites", "Draft"]);
      await leaveTab();
      expect(isOpen(), way).toBe(false);
    }

    expect(presets.saves()).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect((await nextPick(server)).filterState.favoritesOnly).toBe(false);
    await openDialog();
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(applyButton().textContent).toBe("Apply");
    await showTab("Presets");
    expect(presetRows()).toEqual(presets.list.map((preset) => preset.name));
  });

  it("shows but loads nothing while the server is incompatible", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, capabilities: COMPATIBLE_VERSION.capabilities.filter((c) => c !== "api.presets.match") })
    );
    mountPage({ server });
    await screen.findByText("Server missing required capabilities: api.presets.match.");

    await chooseFilterTab();
    expect(isOpen()).toBe(true);
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
    expect(dialog().querySelector("input")).toBeNull();
  });

  it("says why when its sources or tags cannot load, and loads them when it shows again or on Refresh", async () => {
    let tagModelStatus = 200;
    let sourcesStatus = 500;
    await mountFilter([], (server) => {
      server.on("GET", "/api/sources", () => (sourcesStatus === 200 ? json(SOURCES) : status(sourcesStatus)));
      server.on("POST", "/api/tag-editor/model", () => (tagModelStatus === 200 ? json(TAG_MODEL) : status(tagModelStatus)));
    });

    await chooseFilterTab();
    expect(statusLine()).toBe("Filter load failed: HTTP 500");
    expect(isOpen()).toBe(true);
    expect(dialog().querySelector("input")).toBeNull();

    sourcesStatus = 200;
    tagModelStatus = 503;
    await click(panelTab("Library"));
    await chooseFilterTab();
    expect(statusLine()).toBe("Filter load failed: tag-editor model 503");
    expect(dialog().querySelector("input")).toBeNull();

    await click(dialogButton("Refresh"));
    expect(statusLine()).toBe("Filter refresh failed: tag-editor model 503");
    expect(dialog().querySelector("input")).toBeNull();

    tagModelStatus = 200;
    await click(dialogButton("Refresh"));
    expect(statusLine()).toBe("Filter data refreshed.");
    expect(selectedTab()).toBe("General");
    expect(box("Movies").checked).toBe(true);
  });

  it("keeps its markup on each tab", async () => {
    await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await pickPreset("preset-rich");
    sessionStorage.setItem("rr_filterDialogCollapsedCategories", JSON.stringify(["cat-mood"]));

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
    expect(within(dialog()).getByText("No tags available. Use Edit tags to create tags.")).toBeTruthy();
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
    expect(box("Movies").checked).toBe(true);
    expect(box("C:\\media\\photos").checked).toBe(false);
    expect(box("Archive").checked).toBe(false);
    expect(box("Archive").disabled).toBe(true);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("01:30");
    expect(byId<HTMLInputElement>("filter-max-dur-text").value).toBe("01:01:40");
  });

  it("marks Apply as pending after a change, and not once the change is undone", async () => {
    await mountFilter();
    await openDialog();

    await click(box("Favorites"));
    expect(applyButton().textContent).toBe("Apply*");
    expect(applyButton().classList.contains("has-pending")).toBe(true);
    expect(heading()).toBe("Preset: None*");

    await click(box("Favorites"));
    expect(applyButton().textContent).toBe("Apply");
    expect(applyButton().classList.contains("has-pending")).toBe(false);
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

    const expected = { favoritesMode: "only", favoritesOnly: true, onlyNeverPlayed: true, mediaTypeFilter: 2, audioFilter: 1 };
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
    expect(label(applyButton())).toBe("Apply*");
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

  it("holds Apply while a duration is not valid, with or without other changes, and moves to it without a status or log line", async () => {
    const { server } = await mountFilter();
    await openDialog();
    const queries = libraryQueries(server).length;
    const statusBefore = statusLine();
    const logsBefore = server.logLines().length;
    const min = byId<HTMLInputElement>("filter-min-dur-text");
    const max = byId<HTMLInputElement>("filter-max-dur-text");

    await type(min, "abc");
    expect(label(applyButton())).toBe("Apply");
    expect(heldState(applyButton())).toEqual({ held: true, icon: true });
    expect(applyButton().title).toBe("Correct the minimum duration to apply.");
    expect(document.getElementById(applyButton().getAttribute("aria-describedby")!)?.textContent).toBe("Correct the minimum duration to apply.");
    await showTab("Tags");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(document.activeElement).toBe(min);
    expect(isOpen()).toBe(true);
    expect(min.value).toBe("abc");

    await click(box("Only never played"));
    expect(label(applyButton())).toBe("Apply*");
    await type(max, "1:75");
    await type(min, "90");
    expect(applyButton().title).toBe("Correct the maximum duration to apply.");
    await showTab("Presets");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(document.activeElement).toBe(max);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(statusLine()).toBe(statusBefore);
    expect(server.logLines().slice(logsBefore)).toEqual([]);

    await type(max, "");
    expect(heldState(applyButton())).toEqual({ held: false, icon: false });
    expect(applyButton().title).toBe("");
    const applied = await applyAndWait(server);
    expect(applied.minDuration).toBe("00:01:30");
    expect(applied.maxDuration).toBeUndefined();
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
    expect(box("Movies").checked).toBe(true);
    expect(box("C:\\media\\photos").checked).toBe(true);
    expect(box("Archive").checked).toBe(true);

    await click(box("Movies"));
    expect((await applyAndWait(server)).includedSourceIds).toEqual(["source-2", "source-3"]);

    await openDialog();
    expect(box("Movies").checked).toBe(false);
    await click(box("Movies"));
    expect((await applyAndWait(server)).includedSourceIds).toEqual([]);
  });
});

describe("Favorites and Blacklisted filters", () => {
  const MODES: readonly FlagMode[] = ["off", "only", "excluded"];
  const FILTERS: readonly FlagFilterName[] = ["Favorites", "Blacklisted"];

  /** The mode fields and their older booleans, as both clients write them. */
  function written(favorites: FlagMode, blacklisted: FlagMode) {
    return {
      favoritesMode: favorites,
      favoritesOnly: favorites === "only",
      blacklistedMode: blacklisted,
      excludeBlacklisted: blacklisted === "excluded"
    };
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
    expect(applyButton().textContent).toBe("Apply");

    await chooseFlag("Blacklisted", "only");
    await click(box("Blacklisted"));
    expect(flagRow("Blacklisted")).toEqual({ checked: false, choice: "only", disabled: true });
    expect(applyButton().textContent).toBe("Apply*");

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

      // Set another mode first, so each mode is reached from a different one.
      await setFlag(name, mode === "only" ? "excluded" : "only");
      await setFlag(name, mode);
      expect(await applyAndWait(server)).toMatchObject(expected);
      expect((await nextPick(server)).filterState).toMatchObject(expected);

      await openDialog();
      await showTab("Presets");
      await addPreset("Flags");
      await applyAndWait(server);
      expect(presets.saves()).toHaveLength(1);
      expect(presets.saves()[0][0]).toMatchObject({ name: "Flags", filterState: expected });
    }
  );

  it("Clear all filters shows Favorites off with only and Blacklisted on with excluded", async () => {
    await mountFilter();
    await openDialog();
    await setFlag("Favorites", "excluded");
    await setFlag("Blacklisted", "only");

    await click(dialogButton("Clear all filters"));
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(flagRow("Blacklisted")).toEqual(BLACKLISTED_DEFAULT);
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
      await showTab("Presets");
      await chooseInDialog(`Favorites ${favorites}, Blacklisted ${blacklisted}`);
      await showTab("General");
      expect(flagRow("Favorites")).toEqual(
        favorites === "off" ? FAVORITES_DEFAULT : { checked: true, choice: favorites, disabled: false }
      );
      expect(flagRow("Blacklisted")).toEqual(
        blacklisted === "off" ? { checked: false, choice: "excluded", disabled: true } : { checked: true, choice: blacklisted, disabled: false }
      );
    }
  });

  it("shows a preset the desktop saved with Favorites excluded and Blacklisted only", async () => {
    await mountFilter([{ id: "preset-desktop", name: "Desktop", filterState: DESKTOP_WRITTEN_FILTER }]);
    await pickPreset("preset-desktop");
    await openDialog();

    expect(heading()).toBe("Preset: Desktop");
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "excluded", disabled: false });
    expect(flagRow("Blacklisted")).toEqual({ checked: true, choice: "only", disabled: false });
    expect(box("Only never played").checked).toBe(true);
    expect(applyButton().textContent).toBe("Apply");
  });
});

describe("Favorites only with Blacklisted only", () => {
  it("is flagged on both dropdowns, with one icon after Blacklisted, and holds Apply, Add Preset, and Update Preset", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await showTab("Presets");
    await chooseInDialog("Favorites");
    fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Mine" } });
    await showTab("General");
    const queries = libraryQueries(server).length;
    const statusBefore = statusLine();

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
    for (const button of [applyButton(), presetButton("Add Preset"), presetButton("Update Preset")]) {
      expect(heldState(button), label(button)).toEqual({ held: true, icon: true });
    }
    expect(presetButton("Update Preset").title).toBe("Change Favorites or Blacklisted first.");

    flagSelect("Favorites").focus();
    await settle();
    expect(tooltipShown(flagSelect("Blacklisted"))).toBe(true);

    for (const button of ["Update Preset", "Add Preset"]) {
      await showTab("Presets");
      await click(dialogButton(button));
      expect(selectedTab(), button).toBe("General");
      expect(document.activeElement, button).toBe(flagSelect("Blacklisted"));
    }
    await showTab("Tags");
    await apply();
    expect(selectedTab()).toBe("General");
    expect(presetRows()).toEqual(["Favorites"]);
    expect(presets.saves()).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(statusLine()).toBe(statusBefore);

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
    expect(applyButton().textContent).toBe("Apply*");
    await excludeTag("Beach");
    expect(chipState("Beach")).toBe("exclude");
    await excludeTag("Beach");
    expect(chipState("Beach")).toBe("none");
    expect(applyButton().textContent).toBe("Apply");

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
    expect(applyButton().textContent).toBe("Apply*");
    fireEvent.change(category("People").querySelector("select.filter-local-mode")!, { target: { value: "1" } });
    await settle();

    const applied = await applyAndWait(server);
    expect(applied.globalMatchMode).toBe(false);
    expect(applied.categoryLocalMatchModes).toEqual({ "cat-people": 1 });

    await openDialog();
    await showTab("Tags");
    expect(byId<HTMLSelectElement>("filter-global-match").value).toBe("or");
    expect(category("People").querySelector<HTMLSelectElement>("select.filter-local-mode")!.value).toBe("1");
    expect(category("Places").querySelector<HTMLSelectElement>("select.filter-local-mode")!.value).toBe("0");
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

    fireEvent.change(category("Uncategorized").querySelector("select.filter-local-mode")!, { target: { value: "1" } });
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

  it("keeps a collapsed category collapsed when the dialog opens again, for this session", async () => {
    await mountFilter([RICH_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Tags");

    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").style.display).toBe("none");
    expect(categoryToggle("Places").title).toBe("Expand category");
    expect(categoryToggle("Places").textContent).toBe("keyboard_arrow_right");
    await click(categoryToggle("Uncategorized"));
    expect(categoryGrid("Uncategorized").style.display).toBe("none");
    expect(JSON.parse(sessionStorage.getItem("rr_filterDialogCollapsedCategories") ?? "")).toEqual([
      "cat-places",
      "__filter_uncategorized__"
    ]);
    expect(applyButton().textContent).toBe("Apply");

    await closePanel();
    await openDialog();
    await showTab("Tags");
    expect(categoryGrid("Places").style.display).toBe("none");
    expect(categoryGrid("Mood").style.display).toBe("");
    await click(categoryToggle("Places"));
    expect(categoryGrid("Places").style.display).toBe("");
    expect(categoryToggle("Places").title).toBe("Collapse category");
    expect(categoryToggle("Places").textContent).toBe("keyboard_arrow_down");
    expect(JSON.parse(sessionStorage.getItem("rr_filterDialogCollapsedCategories") ?? "")).toEqual([
      "__filter_uncategorized__"
    ]);
  });
});

describe("Presets tab", () => {
  it("choosing a preset loads its filter, and the heading follows the working filter", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    expect(Array.from(presetSelectInDialog().options).map((option) => option.textContent)).toEqual([
      "None",
      "Favorites",
      "Beach days"
    ]);

    await chooseInDialog("Beach days");
    expect(heading()).toBe("Preset: Beach days");
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(chipState("Beach")).toBe("include");
    expect(applyButton().textContent).toBe("Apply*");

    await click(box("Favorites"));
    expect(heading()).toBe("Preset: Beach days*");
    expect(presetSelectInDialog().value).toBe("Beach days");
    await click(box("Favorites"));
    expect(heading()).toBe("Preset: Beach days");

    await chooseInDialog("");
    expect(heading()).toBe("Preset: Beach days");
    expect(presetSelectInDialog().value).toBe("Beach days");

    await click(box("Favorites"));
    await chooseInDialog("");
    expect(heading()).toBe("Preset: None*");
    expect(presetSelectInDialog().value).toBe("");
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "only", disabled: false });
    expect(chipState("Beach")).toBe("include");
  });

  it("a chosen preset applies as that preset in the preset dropdown and in random picks", async () => {
    const { server } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    await chooseInDialog("Beach days");
    const applied = await applyAndWait(server);
    expect(applied.selectedTags).toEqual(["Beach"]);
    expect(selectedPresetLabel()).toBe("Beach days");
    expect((await nextPick(server)).presetId).toBe("preset-beach");
    expect(server.requests("POST", "/api/presets")).toHaveLength(0);
  });

  it("Add Preset needs a new name, adds the working filter, and Apply saves the list", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");
    const statusBefore = statusLine();
    const name = byId<HTMLInputElement>("filter-new-preset-name");
    const addButton = () => dialogButton("Add Preset");
    const disabledWithoutIcon = () => {
      expect(addButton().disabled).toBe(true);
      expect(heldState(addButton())).toEqual({ held: false, icon: false });
      expect(addButton().classList.contains("shows-problem")).toBe(false);
      expect(addButton().title).toBe("");
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
    expect(statusLine()).toBe(statusBefore);

    const max = byId<HTMLInputElement>("filter-max-dur-text");
    fireEvent.input(name, { target: { value: "  Unplayed  " } });
    await showTab("General");
    await type(max, "1:75");
    await showTab("Presets");
    expect(addButton().disabled).toBe(false);
    expect(heldState(addButton())).toEqual({ held: true, icon: true });
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
    expect(presetSelectInDialog().value).toBe("Unplayed");

    const applied = await applyAndWait(server);
    expect(applied.onlyNeverPlayed).toBe(true);
    expect(presets.saves()).toHaveLength(1);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Favorites", "Beach days", "Unplayed"]);
    expect(presets.saves()[0][2].filterState).toMatchObject({ onlyNeverPlayed: true, favoritesOnly: false });
    expect(presets.saves()[0][0].filterState).toMatchObject({ favoritesOnly: true });
    await waitFor(() => expect(selectedPresetLabel()).toBe("Unplayed"));
    expect((await nextPick(server)).presetId).toBe("saved-3");
  });

  it("Update Preset saves the working filter into the chosen preset", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    await click(dialogButton("Update Preset"));
    expect(statusLine()).toBe("Select a preset to update.");

    await chooseInDialog("Favorites");
    await click(box("Blacklisted"));
    expect(heading()).toBe("Preset: Favorites*");
    await click(dialogButton("Update Preset"));
    expect(statusLine()).toBe('Updated preset "Favorites" locally — Apply to save.');
    await waitFor(() =>
      expect(server.logLines()).toContain("status=Updated preset locally — Apply to save. hasCurrent=false attempt=0")
    );
    expect(server.logLines().some((line) => line.includes("Favorites"))).toBe(false);
    expect(heading()).toBe("Preset: Favorites");
    expect(applyButton().textContent).toBe("Apply*");

    await applyAndWait(server);
    expect(presets.saves()[0][0]).toMatchObject({
      name: "Favorites",
      filterState: { favoritesMode: "only", favoritesOnly: true, blacklistedMode: "off", excludeBlacklisted: false }
    });
    expect(presets.saves()[0][1]).toMatchObject({ name: "Beach days", filterState: { selectedTags: ["Beach"] } });
    await waitFor(() => expect(selectedPresetLabel()).toBe("Favorites"));
  });

  for (const [how, activate] of [
    ["the pointer", press],
    ["the keyboard", pressWithKeyboard]
  ] as const) {
    it(`Add Preset pressed with ${how} moves to the new preset's drag handle`, async () => {
      await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
      await openDialog();
      await showTab("Presets");
      fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Draft" } });
      await activate(dialogButton("Add Preset"));
      expect(presetRows()).toEqual(["Favorites", "Beach days", "Draft"]);
      expect(document.activeElement).toBe(presetHandle("Draft"));
    });

    it(`Add Preset pressed with ${how} moves to the new preset's drag handle when it is the only preset`, async () => {
      await mountFilter();
      await openDialog();
      await showTab("Presets");
      fireEvent.input(byId("filter-new-preset-name"), { target: { value: "Draft" } });
      await activate(dialogButton("Add Preset"));
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
    expect(applyButton().textContent).toBe("Apply*");
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
    expect(presets.saves()).toHaveLength(0);

    await applyAndWait(server);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Beach days", "Recent", "Favorites"]);
  });

  it("each preset row has a drag handle, its name, and Edit preset, and nothing else", async () => {
    await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    for (const name of ["Favorites", "Beach days"]) {
      const row = presetRow(name);
      expect(Array.from(row.children).map((child) => child.className), name).toEqual([
        "drag-handle icon-glyph-base icon-glyph-button",
        "filter-preset-name",
        "icon-glyph-base icon-glyph-button"
      ]);
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
      expect(applyButton().textContent).toBe("Apply");

      await pointerUp();
      expect(presetRows()).toEqual(["Recent", "Favorites", "Beach days"]);
      expect(transforms()).toEqual(["", "", ""]);
      expect(presetRow("Recent").classList.contains("is-dragging")).toBe(false);
      expect(document.activeElement).toBe(presetHandle("Recent"));
      expect(presetAnnouncement()).toBe("Recent moved to position 1 of 3.");
      expect(applyButton().textContent).toBe("Apply*");
      expect(presets.saves()).toHaveLength(0);

      await applyAndWait(server);
      expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Recent", "Favorites", "Beach days"]);
    });

    it("stays under the pointer while the list scrolls, and lands where the pointer is", async () => {
      await mountLaidOut();
      const list = dialog().querySelector<HTMLElement>(".filter-preset-list")!;
      // A list reaching well past the presets, so the pointer stays away from its edges and it scrolls only when told to.
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
      const list = dialog().querySelector<HTMLElement>(".filter-preset-list")!;
      // A list reaching well past the presets, so the pointer stays away from its edges and it scrolls only when told to.
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
      expect(applyButton().textContent).toBe("Apply");
    });
  });

  it("Edit Preset's Delete asks first in a dialog above it, and deleting the chosen preset leaves the heading on None", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await chooseInDialog("Beach days");
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
    expect(presetSelectInDialog().value).toBe("");
    expect(chipState("Beach")).toBe("include");
    expect(applyButton().textContent).toBe("Apply*");

    await applyAndWait(server);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Favorites"]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("None*"));
  });

  it("Edit Preset flags a name another preset has, disables Save for it and an empty name, and renames, keeping the heading on the renamed preset", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    let edit = await editPreset("Beach days");
    await press(byId("filter-preset-edit-save-btn"));
    expect(appDialogs()).toEqual([]);
    expect(label(applyButton())).toBe("Apply");
    edit = await editPreset("Beach days");
    fireEvent.input(byId("filter-preset-edit-name"), { target: { value: "Other" } });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await settle();
    expect(appDialogs()).toEqual([]);
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);

    await chooseInDialog("Beach days");
    const statusBefore = statusLine();
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
    expect(statusLine()).toBe(statusBefore);
    expect(statusLine()).not.toBe("That name is already in use.");

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
    expect(presetSelectInDialog().value).toBe("Sunny days");
    expect(statusLine()).toBe(statusBefore);

    await applyAndWait(server);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Favorites", "Sunny days"]);
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
    presets.saveFailure = 500;
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");
    await addPreset("Unplayed");
    const queries = libraryQueries(server).length;

    await apply();
    expect(statusLine()).toBe("Saving presets failed (500).");
    expect(isOpen()).toBe(true);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect(presetRows()).toEqual(["Favorites", "Unplayed"]);
    expect((await nextPick(server)).filterState.onlyNeverPlayed).toBe(false);

    presets.saveFailure = null;
    await apply();
    await waitFor(() => expect(libraryQueries(server)).toHaveLength(queries + 1));
    expect(statusLine()).toBe("Filters applied.");
    expect(panel().hidden).toBe(true);
    expect(presets.list.map((preset) => preset.name)).toEqual(["Favorites", "Unplayed"]);
  });
});

describe("preset dropdown, refresh, and clear all", () => {
  it("opens on None while the preset dropdown holds None, and a preset chosen in the dialog ends the hold", async () => {
    const { server } = await mountFilter([EVERYTHING_PRESET, FAVORITES_PRESET]);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Everything"));
    await openDialog();
    expect(heading()).toBe("Preset: Everything");
    await closePanel();

    await pickPreset("");
    expect(selectedPresetLabel()).toBe("None");
    await openDialog();
    expect(heading()).toBe("Preset: None");
    await showTab("Presets");
    expect(presetSelectInDialog().value).toBe("");
    await apply();
    expect(isOpen()).toBe(true);
    await waitFor(() => expect(statusLine()).toBe("Filters applied."));
    expect(selectedPresetLabel()).toBe("None");

    await closePanel();
    await openDialog();
    expect(heading()).toBe("Preset: None");
    await showTab("Presets");
    await chooseInDialog("Everything");
    expect(heading()).toBe("Preset: Everything");
    await chooseInDialog("");
    expect(heading()).toBe("Preset: Everything");
    await applyAndWait(server);
    await waitFor(() => expect(selectedPresetLabel()).toBe("Everything"));
  });

  // The tab shows the applied filter again after a preset is picked in the Library tab, which it leaves for that.
  it("shows a preset picked in the Library tab when it shows again, without the changes it was left with", async () => {
    await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    expect(applyButton().textContent).toBe("Apply*");

    await pickPreset("preset-favorites");
    expect(isOpen()).toBe(true);
    expect(flagRow("Favorites")).toEqual({ checked: true, choice: "only", disabled: false });
    expect(box("Only never played").checked).toBe(false);
    expect(heading()).toBe("Preset: Favorites");
    expect(applyButton().textContent).toBe("Apply");
    await showTab("Presets");
    expect(presetSelectInDialog().value).toBe("Favorites");
  });

  it("Refresh loads sources, tags, and presets again and keeps the working filter", async () => {
    let sources = SOURCES;
    let tagModel = TAG_MODEL;
    let sourcesStatus = 200;
    const { presets } = await mountFilter([FAVORITES_PRESET], (server) => {
      server.on("GET", "/api/sources", () => (sourcesStatus === 200 ? json(sources) : status(sourcesStatus)));
      server.on("POST", "/api/tag-editor/model", () => json(tagModel));
    });
    await openDialog();
    await click(box("Only never played"));

    sources = [...SOURCES, { id: "source-4", displayName: "Phone", rootPath: "E:\\phone", isEnabled: true }];
    tagModel = { ...TAG_MODEL, tags: [...TAG_MODEL.tags, { name: "Snow", categoryId: "cat-places" }] };
    presets.list = [...presets.list, RECENT_PRESET];
    await click(dialogButton("Refresh"));

    expect(statusLine()).toBe("Filter data refreshed.");
    expect(box("Phone").checked).toBe(true);
    expect(box("Only never played").checked).toBe(true);
    expect(applyButton().textContent).toBe("Apply*");
    await showTab("Tags");
    expect(chipNames("Places")).toEqual(["alps", "Beach", "Snow"]);
    await showTab("Presets");
    expect(presetRows()).toEqual(["Favorites", "Recent"]);
    expect(heading()).toBe("Preset: Recent");

    sourcesStatus = 500;
    await click(dialogButton("Refresh"));
    expect(statusLine()).toBe("Filter refresh failed: HTTP 500");
    expect(isOpen()).toBe(true);
  });

  it("Refresh keeps unsaved preset changes and Apply's star, and Apply then saves them", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await pressKey(presetHandle("Favorites"), "ArrowDown");
    expect(presetRows()).toEqual(["Beach days", "Favorites"]);

    presets.list = [...presets.list, RECENT_PRESET];
    await click(dialogButton("Refresh"));
    expect(statusLine()).toBe("Filter data refreshed.");
    expect(presetRows()).toEqual(["Beach days", "Favorites"]);
    expect(label(applyButton())).toBe("Apply*");

    await applyAndWait(server);
    expect(presets.saves()).toHaveLength(1);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Beach days", "Favorites"]);
  });

  it("Clear all filters goes back to the default filter and drops unsaved preset changes", async () => {
    const { server, presets } = await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await pickPreset("preset-rich");
    await openDialog();
    await showTab("Presets");
    await addPreset("Temporary");

    await click(dialogButton("Clear all filters"));
    expect(heading()).toBe("Preset: None");
    expect(applyButton().textContent).toBe("Apply");
    expect(presetRows()).toEqual(["Rich", "Favorites"]);
    expect(presetSelectInDialog().value).toBe("");
    expect(flagRow("Favorites")).toEqual(FAVORITES_DEFAULT);
    expect(box("All (Videos and Photos)").checked).toBe(true);
    expect(box("Movies").checked && box("C:\\media\\photos").checked && box("Archive").checked).toBe(true);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("");
    await showTab("Tags");
    expect(chipState("Beach")).toBe("none");
    expect(chipState("Bob")).toBe("none");
    expect(categoryTitles()).toEqual(["Places", "Mood", "People"]);
    expect(byId<HTMLSelectElement>("filter-global-match").value).toBe("and");

    const applied = await applyAndWait(server);
    expect(applied).toMatchObject({ favoritesOnly: false, mediaTypeFilter: 0, selectedTags: [], includedSourceIds: [] });
    expect(applied.minDuration).toBeUndefined();
    expect(presets.saves()).toHaveLength(0);
    await waitFor(() => expect(selectedPresetLabel()).toBe("None"));
  });
});

describe("names and storage", () => {
  it("shows source, tag, and preset names as text", async () => {
    await mountFilter([{ id: "preset-mine", name: "<u>Mine</u>", filterState: { favoritesOnly: true } }], (server) => {
      server.on("GET", "/api/sources", () => json([{ id: "source-x", displayName: "<b>Movies</b>", rootPath: "C:\\m", isEnabled: true }]));
      server.on("POST", "/api/tag-editor/model", () =>
        json({ categories: [{ id: "cat-x", name: "<em>Places</em>", sortOrder: 0 }], tags: [{ name: "<i>Beach</i>", categoryId: "cat-x" }], items: [] })
      );
    });
    await openDialog();

    expect(within(dialog()).getByText("<b>Movies</b>")).toBeTruthy();
    expect(within(dialog()).getByText("<em>Places</em>")).toBeTruthy();
    expect(within(dialog()).getByText("<i>Beach</i>")).toBeTruthy();
    expect(within(dialog()).getByText("<u>Mine</u>", { selector: ".filter-preset-name" })).toBeTruthy();
    expect(dialog().querySelector("b, em, i, u")).toBeNull();
  });

  it("adds only the collapsed categories key to browser storage", async () => {
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
    expect(storageKeys(sessionStorage)).toEqual(["rr_filterDialogCollapsedCategories", "rr_sessionId"]);
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
