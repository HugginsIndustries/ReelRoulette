// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPATIBLE_VERSION,
  FakeServer,
  json,
  mountPage,
  normalizedMarkup,
  resetPage,
  settle,
  status,
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

function isOpen(): boolean {
  return dialog().style.display === "flex";
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

async function openDialog(): Promise<void> {
  await click(screen.getByRole("button", { name: "Select filters" }));
  await waitFor(() => expect(isOpen()).toBe(true));
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

function selectedTab(): string {
  return within(dialog()).getByRole("tab", { selected: true }).textContent ?? "";
}

function heading(): string {
  return byId("filter-dialog-heading").textContent ?? "";
}

function box(label: string): HTMLInputElement {
  return within(dialog()).getByLabelText(label) as HTMLInputElement;
}

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

function rowButton(name: string, label: "Move up" | "Move down" | "Rename" | "Delete"): HTMLButtonElement {
  return within(presetRow(name)).getByRole("button", { name: label }) as HTMLButtonElement;
}

async function addPreset(name: string): Promise<void> {
  fireEvent.input(byId("filter-new-preset-name"), { target: { value: name } });
  await click(dialogButton("Add Preset"));
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

/** Applies the dialog and waits for the library to start over with the new filter. */
async function applyAndWait(server: FakeServer): Promise<any> {
  const before = libraryQueries(server).length;
  await apply();
  await waitFor(() => expect(libraryQueries(server).length).toBe(before + 1));
  expect(isOpen()).toBe(false);
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
  it("opens on General from Select filters after loading sources, tags, and presets", async () => {
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

  it("Close and Cancel hide it without applying or saving presets, and it opens again from the applied filter and the saved presets", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    const queries = libraryQueries(server).length;

    for (const button of ["Close", "Cancel"]) {
      await openDialog();
      await click(box("Favorites only"));
      expect(applyButton().textContent).toBe("Apply*");
      await showTab("Presets");
      expect(presetRows()).toEqual(["Favorites", "Beach days", "Recent"]);
      await addPreset("Draft");
      await click(rowButton("Favorites", "Move down"));
      await click(rowButton("Recent", "Delete"));
      expect(presetRows()).toEqual(["Beach days", "Favorites", "Draft"]);
      await click(dialogButton(button));
      expect(isOpen()).toBe(false);
    }

    expect(presets.saves()).toHaveLength(0);
    expect(libraryQueries(server)).toHaveLength(queries);
    expect((await nextPick(server)).filterState.favoritesOnly).toBe(false);
    await openDialog();
    expect(box("Favorites only").checked).toBe(false);
    expect(applyButton().textContent).toBe("Apply");
    await showTab("Presets");
    expect(presetRows()).toEqual(presets.list.map((preset) => preset.name));
  });

  it("does not open while the server is incompatible", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, capabilities: COMPATIBLE_VERSION.capabilities.filter((c) => c !== "api.presets.match") })
    );
    mountPage({ server });
    await screen.findByText("Server missing required capabilities: api.presets.match.");

    await click(screen.getByRole("button", { name: "Select filters" }));
    expect(isOpen()).toBe(false);
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
  });

  it("stays closed and says why when its sources or tags cannot load", async () => {
    let tagModelStatus = 200;
    let sourcesStatus = 500;
    await mountFilter([], (server) => {
      server.on("GET", "/api/sources", () => (sourcesStatus === 200 ? json(SOURCES) : status(sourcesStatus)));
      server.on("POST", "/api/tag-editor/model", () => (tagModelStatus === 200 ? json(TAG_MODEL) : status(tagModelStatus)));
    });

    await click(screen.getByRole("button", { name: "Select filters" }));
    expect(statusLine()).toBe("Filter dialog load failed: HTTP 500");
    expect(isOpen()).toBe(false);

    sourcesStatus = 200;
    tagModelStatus = 503;
    await click(screen.getByRole("button", { name: "Select filters" }));
    expect(statusLine()).toBe("Filter dialog load failed: tag-editor model 503");
    expect(isOpen()).toBe(false);
  });

  it("keeps its markup on each tab", async () => {
    await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await pickHeaderPreset("preset-rich");
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
    await pickHeaderPreset("preset-rich");
    await openDialog();

    expect(heading()).toBe("Preset: Rich");
    expect(box("Favorites only").checked).toBe(true);
    expect(box("Exclude blacklisted").checked).toBe(true);
    expect(box("Only never played").checked).toBe(false);
    expect(box("Videos only").checked).toBe(true);
    expect(box("All (Videos and Photos)").checked).toBe(false);
    expect(box("Only videos without audio").checked).toBe(true);
    expect(box("Movies").checked).toBe(true);
    expect(box("C:\\media\\photos").checked).toBe(false);
    expect(box("Archive").checked).toBe(false);
    expect(box("Archive").disabled).toBe(true);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("01:30");
    expect(byId<HTMLInputElement>("filter-min-dur-text").disabled).toBe(false);
    expect(box("No minimum").checked).toBe(false);
    expect(byId<HTMLInputElement>("filter-max-dur-text").value).toBe("01:01:40");
    expect(box("No maximum").checked).toBe(false);
  });

  it("marks Apply as pending after a change, and not once the change is undone", async () => {
    await mountFilter();
    await openDialog();

    await click(box("Favorites only"));
    expect(applyButton().textContent).toBe("Apply*");
    expect(applyButton().classList.contains("has-pending")).toBe(true);
    expect(heading()).toBe("Preset: None*");

    await click(box("Favorites only"));
    expect(applyButton().textContent).toBe("Apply");
    expect(applyButton().classList.contains("has-pending")).toBe(false);
    expect(heading()).toBe("Preset: None");
  });

  it("applies to the library, the next random pick, and the header", async () => {
    const { server } = await mountFilter();
    await openDialog();

    await click(box("Favorites only"));
    await click(box("Only never played"));
    await click(box("Photos only"));
    await click(box("Only videos with audio"));
    const applied = await applyAndWait(server);

    const expected = { favoritesOnly: true, onlyNeverPlayed: true, mediaTypeFilter: 2, audioFilter: 1 };
    expect(applied).toMatchObject(expected);
    expect(libraryQueries(server).at(-1)).toMatchObject({ offset: 0, search: "" });
    const pick = await nextPick(server);
    expect(pick.filterState).toMatchObject(expected);
    expect(pick.presetId).toBeUndefined();
    expect(headerSelectedLabel()).toBe("None*");
  });

  it("No minimum and No maximum clear and turn off their duration", async () => {
    const { server } = await mountFilter([RICH_PRESET]);
    await pickHeaderPreset("preset-rich");
    await openDialog();

    await click(box("No minimum"));
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("");
    expect(byId<HTMLInputElement>("filter-min-dur-text").disabled).toBe(true);
    expect(applyButton().textContent).toBe("Apply*");
    const applied = await applyAndWait(server);
    expect(applied.minDuration).toBeUndefined();
    expect(applied.maxDuration).toBe("01:01:40");

    await openDialog();
    await click(box("No maximum"));
    await click(box("No maximum"));
    expect(byId<HTMLInputElement>("filter-max-dur-text").value).toBe("");
    expect(byId<HTMLInputElement>("filter-max-dur-text").disabled).toBe(false);
    expect(box("No maximum").checked).toBe(false);
    await type(byId("filter-max-dur-text"), "2:00");
    expect((await applyAndWait(server)).maxDuration).toBe("00:02:00");
  });

  it("stops Apply on the General tab when a duration is not valid", async () => {
    const { server } = await mountFilter();
    await openDialog();
    const queries = libraryQueries(server).length;

    await click(box("No minimum"));
    await type(byId("filter-min-dur-text"), "abc");
    await showTab("Tags");
    await apply();
    expect(statusLine()).toBe("Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.");
    expect(selectedTab()).toBe("General");
    expect(isOpen()).toBe(true);
    expect(byId<HTMLInputElement>("filter-min-dur-text").value).toBe("abc");

    await type(byId("filter-min-dur-text"), "90");
    await click(box("No maximum"));
    await type(byId("filter-max-dur-text"), "1:75");
    await apply();
    expect(statusLine()).toBe("Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.");
    expect(libraryQueries(server)).toHaveLength(queries);

    await type(byId("filter-max-dur-text"), "");
    const applied = await applyAndWait(server);
    expect(applied.minDuration).toBe("00:01:30");
    expect(applied.maxDuration).toBeUndefined();
  });

  it("applies a duration typed just before Apply", async () => {
    const { server } = await mountFilter();
    await openDialog();

    await click(box("No maximum"));
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
    await pickHeaderPreset("preset-rich");
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
    await pickHeaderPreset("preset-rich");
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

    await click(dialogButton("Close"));
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
    expect(box("Favorites only").checked).toBe(false);
    expect(chipState("Beach")).toBe("include");
    expect(applyButton().textContent).toBe("Apply*");

    await click(box("Favorites only"));
    expect(heading()).toBe("Preset: Beach days*");
    expect(presetSelectInDialog().value).toBe("Beach days");
    await click(box("Favorites only"));
    expect(heading()).toBe("Preset: Beach days");

    await chooseInDialog("");
    expect(heading()).toBe("Preset: Beach days");
    expect(presetSelectInDialog().value).toBe("Beach days");

    await click(box("Favorites only"));
    await chooseInDialog("");
    expect(heading()).toBe("Preset: None*");
    expect(presetSelectInDialog().value).toBe("");
    expect(box("Favorites only").checked).toBe(true);
    expect(chipState("Beach")).toBe("include");
  });

  it("a chosen preset applies as that preset in the header and in random picks", async () => {
    const { server } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    await chooseInDialog("Beach days");
    const applied = await applyAndWait(server);
    expect(applied.selectedTags).toEqual(["Beach"]);
    expect(headerSelectedLabel()).toBe("Beach days");
    expect((await nextPick(server)).presetId).toBe("preset-beach");
    expect(server.requests("POST", "/api/presets")).toHaveLength(0);
  });

  it("Add Preset needs a new name, adds the working filter, and Apply saves the list", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    await showTab("Presets");

    await addPreset("");
    expect(statusLine()).toBe("Enter a preset name.");
    await addPreset("FAVORITES");
    expect(statusLine()).toBe("A preset with that name already exists.");
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(byId<HTMLInputElement>("filter-new-preset-name").value).toBe("FAVORITES");

    await addPreset("  Unplayed  ");
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
    await waitFor(() => expect(headerSelectedLabel()).toBe("Unplayed"));
    expect((await nextPick(server)).presetId).toBe("saved-3");
  });

  it("Update Preset saves the working filter into the chosen preset", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");

    await click(dialogButton("Update Preset"));
    expect(statusLine()).toBe("Select a preset to update.");

    await chooseInDialog("Favorites");
    await click(box("Exclude blacklisted"));
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
    expect(presets.saves()[0][0]).toMatchObject({ name: "Favorites", filterState: { favoritesOnly: true, excludeBlacklisted: false } });
    expect(presets.saves()[0][1]).toMatchObject({ name: "Beach days", filterState: { selectedTags: ["Beach"] } });
    await waitFor(() => expect(headerSelectedLabel()).toBe("Favorites"));
  });

  it("Move up and Move down reorder the presets, with the ends turned off", async () => {
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET, RECENT_PRESET]);
    await openDialog();
    await showTab("Presets");

    expect(rowButton("Favorites", "Move up").disabled).toBe(true);
    expect(rowButton("Favorites", "Move down").disabled).toBe(false);
    expect(rowButton("Recent", "Move down").disabled).toBe(true);

    await click(rowButton("Favorites", "Move down"));
    expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]);
    expect(rowButton("Beach days", "Move up").disabled).toBe(true);
    expect(rowButton("Favorites", "Move up").disabled).toBe(false);
    expect(applyButton().textContent).toBe("Apply*");
    await click(rowButton("Recent", "Move up"));
    expect(presetRows()).toEqual(["Beach days", "Recent", "Favorites"]);
    expect(Array.from(presetSelectInDialog().options).map((option) => option.textContent)).toEqual([
      "None",
      "Beach days",
      "Recent",
      "Favorites"
    ]);

    await applyAndWait(server);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Beach days", "Recent", "Favorites"]);
  });

  it("Delete asks first, and deleting the chosen preset leaves the heading on None", async () => {
    const confirmDelete = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmDelete);
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await chooseInDialog("Beach days");
    await click(box("Favorites only"));
    await click(box("Favorites only"));

    await click(rowButton("Beach days", "Delete"));
    expect(confirmDelete).toHaveBeenCalledWith('Delete preset "Beach days"?');
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);
    expect(heading()).toBe("Preset: Beach days");

    confirmDelete.mockReturnValue(true);
    await click(rowButton("Beach days", "Delete"));
    expect(presetRows()).toEqual(["Favorites"]);
    expect(heading()).toBe("Preset: None*");
    expect(presetSelectInDialog().value).toBe("");
    expect(chipState("Beach")).toBe("include");
    expect(applyButton().textContent).toBe("Apply*");

    await applyAndWait(server);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Favorites"]);
    await waitFor(() => expect(headerSelectedLabel()).toBe("None*"));
  });

  it("Rename asks for the new name and keeps the heading on the renamed preset", async () => {
    const promptName = vi.fn((): string | null => "favorites ");
    vi.stubGlobal("prompt", promptName);
    const { server, presets } = await mountFilter([FAVORITES_PRESET, BEACH_PRESET]);
    await openDialog();
    await showTab("Presets");
    await chooseInDialog("Beach days");

    await click(rowButton("Beach days", "Rename"));
    expect(promptName).toHaveBeenCalledWith("Rename preset", "Beach days");
    expect(statusLine()).toBe("That name is already in use.");
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);

    promptName.mockReturnValue(null);
    await click(rowButton("Beach days", "Rename"));
    promptName.mockReturnValue("   ");
    await click(rowButton("Beach days", "Rename"));
    expect(presetRows()).toEqual(["Favorites", "Beach days"]);

    promptName.mockReturnValue("  Sunny days ");
    await click(rowButton("Beach days", "Rename"));
    expect(presetRows()).toEqual(["Favorites", "Sunny days"]);
    expect(heading()).toBe("Preset: Sunny days");
    expect(presetSelectInDialog().value).toBe("Sunny days");

    await applyAndWait(server);
    expect(presets.saves()[0].map((preset: any) => preset.name)).toEqual(["Favorites", "Sunny days"]);
    await waitFor(() => expect(headerSelectedLabel()).toBe("Sunny days"));
  });

  it("keeps the dialog open and applies nothing when the presets cannot be saved", async () => {
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
    await applyAndWait(server);
    expect(presets.list.map((preset) => preset.name)).toEqual(["Favorites", "Unplayed"]);
  });
});

describe("header, refresh, and clear all", () => {
  it("opens on None while the header holds None, and a preset chosen in the dialog ends the hold", async () => {
    const { server } = await mountFilter([EVERYTHING_PRESET, FAVORITES_PRESET]);
    await waitFor(() => expect(headerSelectedLabel()).toBe("Everything"));
    await openDialog();
    expect(heading()).toBe("Preset: Everything");
    await click(dialogButton("Close"));

    await pickHeaderPreset("");
    expect(headerSelectedLabel()).toBe("None");
    await openDialog();
    expect(heading()).toBe("Preset: None");
    await showTab("Presets");
    expect(presetSelectInDialog().value).toBe("");
    await apply();
    expect(isOpen()).toBe(false);
    await waitFor(() => expect(statusLine()).toBe("Filters applied."));
    expect(headerSelectedLabel()).toBe("None");

    await openDialog();
    expect(heading()).toBe("Preset: None");
    await showTab("Presets");
    await chooseInDialog("Everything");
    expect(heading()).toBe("Preset: Everything");
    await chooseInDialog("");
    expect(heading()).toBe("Preset: Everything");
    await applyAndWait(server);
    await waitFor(() => expect(headerSelectedLabel()).toBe("Everything"));
  });

  it("starts the open dialog over from a header preset picked meanwhile", async () => {
    await mountFilter([FAVORITES_PRESET]);
    await openDialog();
    await click(box("Only never played"));
    expect(applyButton().textContent).toBe("Apply*");

    await pickHeaderPreset("preset-favorites");
    expect(isOpen()).toBe(true);
    expect(box("Favorites only").checked).toBe(true);
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

  it("Clear all filters goes back to the default filter and drops unsaved preset changes", async () => {
    const { server, presets } = await mountFilter([RICH_PRESET, FAVORITES_PRESET]);
    await pickHeaderPreset("preset-rich");
    await openDialog();
    await showTab("Presets");
    await addPreset("Temporary");

    await click(dialogButton("Clear all filters"));
    expect(heading()).toBe("Preset: None");
    expect(applyButton().textContent).toBe("Apply");
    expect(presetRows()).toEqual(["Rich", "Favorites"]);
    expect(presetSelectInDialog().value).toBe("");
    expect(box("Favorites only").checked).toBe(false);
    expect(box("All (Videos and Photos)").checked).toBe(true);
    expect(box("Movies").checked && box("C:\\media\\photos").checked && box("Archive").checked).toBe(true);
    expect(box("No minimum").checked).toBe(true);
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
    await waitFor(() => expect(headerSelectedLabel()).toBe("None"));
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
    await click(box("Favorites only"));
    await showTab("Tags");
    await includeTag("Beach");
    await click(categoryToggle("Mood"));
    await showTab("Presets");
    await addPreset("Beach favorites");
    await applyAndWait(server);

    expect(storageKeys(localStorage)).toEqual(["rr_clientId"]);
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
    await click(rowButton("Favorites", "Move down"));
    expect(presetRows()).toEqual(["Beach days", "Favorites", "Recent"]);
    expect(dialog().querySelector(".filter-preset-list")).toBe(list);
    expect(byId<HTMLInputElement>("filter-new-preset-name").value).toBe("Draft");
  });
});
