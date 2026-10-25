// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPATIBLE_VERSION,
  FakeServer,
  json,
  mountPage,
  openNotices,
  pageReady,
  popupsShown,
  randomAnswer,
  resetPage,
  settle,
  status,
  type MountedPage
} from "./pageHarness";

const VIDEO = {
  id: "C:\\media\\holiday clip.mp4",
  itemId: "item-video",
  displayName: "holiday clip.mp4",
  mediaType: "video",
  durationSeconds: 65,
  mediaUrl: "/api/media/item-video?token=t",
  isFavorite: false,
  isBlacklisted: false
};

/** A tag catalog with People and Places, each with a tag, and Moods, without one. */
const CATALOG = {
  categories: [
    { id: "places", name: "Places", sortOrder: 1 },
    { id: "people", name: "People", sortOrder: 0 },
    { id: "moods", name: "Moods", sortOrder: 2 }
  ],
  tags: [
    { name: "Beach", categoryId: "places" },
    { name: "Alice", categoryId: "people" }
  ],
  items: []
};

const DEFAULT_REQUEST_OPTIONS = {
  shuffle: true,
  rememberPlaysForDays: 30,
  spreadByFolder: true,
  spreadByTags: "off",
  favorLessPlayed: false,
  favorNewlyAdded: false,
  favorNewlyCreated: false,
  favorHigherRated: false
};

/** A server that picks the video, with these cycle numbers, and lists the catalog. */
function serverPicking(cycle = { picked: 1, eligible: 10, remaining: 9 }): FakeServer {
  const server = new FakeServer().playsItems(VIDEO);
  server.on("POST", "/api/random", () => randomAnswer(VIDEO, cycle));
  server.on("POST", "/api/tag-editor/model", () => json(CATALOG));
  return server;
}

async function mount(server: FakeServer): Promise<MountedPage> {
  const page = mountPage({ server });
  await pageReady(server);
  await settle();
  return page;
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

/** Opens the panel on the Randomization tab from the tab row. */
async function openTab(): Promise<void> {
  if (document.getElementById("panel")!.hidden) {
    await click(document.getElementById("panel-btn")!);
  }
  await click(document.getElementById("panel-tab-randomization")!);
}

function tab(): HTMLElement {
  return document.getElementById("randomization-tab")!;
}

function checkbox(label: string): HTMLInputElement {
  return within(tab()).getByRole("checkbox", { name: new RegExp(`^${label}`), hidden: true }) as HTMLInputElement;
}

function radio(label: string): HTMLInputElement {
  return within(tab()).getByRole("radio", { name: new RegExp(`^${label}`), hidden: true }) as HTMLInputElement;
}

function windowSelect(): HTMLSelectElement {
  return document.getElementById("randomization-window") as HTMLSelectElement;
}

function resetButton(): HTMLButtonElement {
  return document.getElementById("randomization-reset") as HTMLButtonElement;
}

function cycleCard(): HTMLDetailsElement {
  return document.getElementById("randomization-cycle") as HTMLDetailsElement;
}

function cycleBody(): HTMLElement {
  return document.getElementById("randomization-cycle-body")!;
}

function cards(): Array<[string, string]> {
  return [...cycleBody().querySelectorAll(".stat-card")].map((card) => [card.querySelector(".label")?.textContent ?? "", card.querySelector(".value")?.textContent ?? ""]);
}

function cycleHints(): string[] {
  return [...cycleBody().querySelectorAll(".setting-hint")].map((hint) => hint.textContent ?? "");
}

function cycleMessage(): string | null {
  return cycleBody().querySelector(".filter-hint")?.textContent ?? null;
}

function categoryLabels(): string[] {
  return [...document.querySelectorAll("#randomization-category-list label")].map((label) => label.textContent?.trim() ?? "");
}

function categoryBox(name: string): HTMLInputElement {
  return [...document.querySelectorAll<HTMLLabelElement>("#randomization-category-list label")].find((label) => label.textContent?.trim() === name)!.querySelector("input")!;
}

function byCategoryIcon(): HTMLElement | null {
  return radio("By category").closest(".vfield")?.querySelector<HTMLElement>(".vfield-icon:not(.is-fading-out)") ?? null;
}

function randomLine(): string {
  return document.querySelector("#library-random-line .library-line-text")?.textContent ?? "";
}

function cycleReads(server: FakeServer) {
  return server.requests("POST", "/api/random/cycle");
}

function picks(server: FakeServer) {
  return server.requests("POST", "/api/random");
}

/** Picks with the player's Random button and waits for the pick's answer. */
async function pickRandom(server: FakeServer): Promise<void> {
  const before = picks(server).length;
  await click(screen.getByRole("button", { name: "Random" }));
  await waitFor(() => expect(picks(server)).toHaveLength(before + 1));
  await settle();
}

function deviceKeys(): string[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith("rr_device."))
    .sort();
}

beforeEach(() => {
  resetPage();
});

describe("Randomization tab", () => {
  it("sits between Filter and Settings with the dice icon, and lays out the cycle card, Shuffle, Spread, Favor, and Random behavior with their defaults", async () => {
    await mount(serverPicking());
    await openTab();

    const tabButton = document.getElementById("panel-tab-randomization")!;
    expect([tabButton.title, tabButton.textContent]).toEqual(["Randomization", "casino"]);
    expect(tab().querySelector("h2")!.textContent).toBe("Randomization");
    expect([...tab().querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual(["Shuffle cycle", "Shuffle", "Spread", "Favor", "Random behavior"]);
    expect(checkbox("Shuffle").checked).toBe(true);
    expect([...windowSelect().options].map((option) => option.textContent)).toEqual(["1 day", "7 days", "30 days", "90 days", "Until everything has played"]);
    expect(windowSelect().value).toBe("30");
    expect(resetButton().disabled).toBe(false);
    expect(checkbox("Spread by folder").checked).toBe(true);
    expect(checkbox("Spread by tags").checked).toBe(false);
    expect((document.getElementById("randomization-tag-fields") as HTMLFieldSetElement).disabled).toBe(true);
    expect([radio("All tags").checked, radio("By category").checked]).toEqual([true, false]);
    expect(document.getElementById("randomization-categories")!.hidden).toBe(true);
    expect(["Less played", "Newly added", "Newly created", "Higher rated"].map((label) => checkbox(label).checked)).toEqual([false, false, false, false]);
    expect([radio("Jump").checked, radio("Insert").checked]).toEqual([true, false]);
    expect(within(tab()).getByText("For the player's Random button and R.")).toBeTruthy();
    expect(tab().querySelector(".settings-body > p.setting-hint:last-child")!.textContent).toBe("Options apply at once and are kept on this device.");
  });

  it("applies each option at once, sends the options with each pick, names them on the Random line, and keeps them after a page refresh", async () => {
    const server = serverPicking();
    const page = await mount(server);
    await openTab();

    await click(checkbox("Shuffle"));
    fireEvent.change(windowSelect(), { target: { value: "all" } });
    await settle();
    await click(checkbox("Spread by folder"));
    await click(checkbox("Spread by tags"));
    await click(radio("By category"));
    await waitFor(() => expect(categoryLabels()).toEqual(["People", "Places"]));
    await click(categoryBox("Places"));
    await click(checkbox("Less played"));
    await click(checkbox("Higher rated"));
    await click(radio("Insert"));

    const sent = {
      shuffle: false,
      rememberPlaysForDays: null,
      spreadByFolder: false,
      spreadByTags: "byCategory",
      spreadCategoryIds: ["places"],
      favorLessPlayed: true,
      favorNewlyAdded: false,
      favorNewlyCreated: false,
      favorHigherRated: true
    };
    await pickRandom(server);
    expect(picks(server).at(-1)!.body.options).toEqual(sent);
    expect(randomLine()).toBe("Random: Spread by Places · Favor less played and higher rated");

    page.unmount();
    const again = serverPicking();
    await mount(again);
    await openTab();
    expect(checkbox("Shuffle").checked).toBe(false);
    expect(windowSelect().value).toBe("all");
    expect([checkbox("Spread by folder").checked, checkbox("Spread by tags").checked, radio("By category").checked]).toEqual([false, true, true]);
    await waitFor(() => expect(categoryBox("Places").checked).toBe(true));
    expect(categoryBox("People").checked).toBe(false);
    expect(["Less played", "Newly added", "Newly created", "Higher rated"].map((label) => checkbox(label).checked)).toEqual([true, false, false, true]);
    expect(radio("Insert").checked).toBe(true);
    await pickRandom(again);
    expect(picks(again).at(-1)!.body.options).toEqual(sent);
  });

  it("sends the defaults, and writes nothing on this device until an option changes", async () => {
    const server = serverPicking();
    await mount(server);
    const before = deviceKeys();
    await openTab();
    await pickRandom(server);
    expect(picks(server)[0]!.body.options).toEqual(DEFAULT_REQUEST_OPTIONS);
    expect(deviceKeys()).toEqual([...before, "rr_device.panel.open", "rr_device.panel.tab"].sort());

    await click(checkbox("Newly added"));
    expect(JSON.parse(localStorage.getItem("rr_device.randomization.options")!)).toMatchObject({ favorNewlyAdded: true });
  });
});

describe("cycle card", () => {
  it("reads the cycle once each time the tab opens, with the pick's filter and options, and shows its numbers as cards", async () => {
    const server = serverPicking();
    server.on("POST", "/api/random/cycle", () => json({ picked: 1234, eligible: 49402, remaining: 48168 }));
    await mount(server);
    await openTab();

    await waitFor(() => expect(cards()).toEqual([["Picked this cycle", "1,234"], ["Eligible now", "49,402"], ["Remaining", "48,168"]]));
    expect(cycleHints()).toEqual(["On this device. A server restart starts a new cycle."]);
    expect(cycleReads(server)).toHaveLength(1);
    expect(cycleReads(server)[0]!.body).toMatchObject({ clientId: expect.any(String), filterState: expect.any(Object), options: DEFAULT_REQUEST_OPTIONS });

    await click(document.getElementById("panel-tab-settings")!);
    await openTab();
    expect(cycleReads(server)).toHaveLength(2);
  });

  it("follows each pick's answer, says while Shuffle is off that files can repeat, and reads the cycle again when Remember plays for changes", async () => {
    const server = serverPicking({ picked: 5, eligible: 10, remaining: 5 });
    await mount(server);
    await openTab();
    await waitFor(() => expect(cards()).toEqual([["Picked this cycle", "0"], ["Eligible now", "0"], ["Remaining", "0"]]));

    await pickRandom(server);
    expect(cards()).toEqual([["Picked this cycle", "5"], ["Eligible now", "10"], ["Remaining", "5"]]);
    expect(cycleReads(server)).toHaveLength(1);

    await click(checkbox("Shuffle"));
    expect(cycleHints()).toEqual(["On this device. A server restart starts a new cycle.", "Shuffle is off, so files can repeat."]);
    expect(cycleReads(server)).toHaveLength(1);

    server.on("POST", "/api/random/cycle", () => json({ picked: 2, eligible: 10, remaining: 8 }));
    fireEvent.change(windowSelect(), { target: { value: "1" } });
    await waitFor(() => expect(cards()).toEqual([["Picked this cycle", "2"], ["Eligible now", "10"], ["Remaining", "8"]]));
    expect(cycleReads(server)).toHaveLength(2);
    expect(cycleReads(server)[1]!.body.options).toMatchObject({ shuffle: false, rememberPlaysForDays: 1 });
  });

  it("is open by default, and keeps on this device whether it is open", async () => {
    const page = await mount(serverPicking());
    await openTab();
    expect(cycleCard().open).toBe(true);
    expect(localStorage.getItem("rr_device.randomization.cycleOpen")).toBeNull();

    cycleCard().open = false;
    fireEvent(cycleCard(), new Event("toggle"));
    await settle();
    expect(localStorage.getItem("rr_device.randomization.cycleOpen")).toBe("false");

    page.unmount();
    await mount(serverPicking());
    await openTab();
    expect(cycleCard().open).toBe(false);
  });

  it("says so in place of the cards when the cycle can't be read, until a pick brings new numbers", async () => {
    const server = serverPicking();
    server.on("POST", "/api/random/cycle", () => status(500));
    await mount(server);
    await openTab();
    await waitFor(() => expect(cycleMessage()).toBe("Shuffle cycle load failed."));
    expect(cards()).toEqual([]);
    expect(server.logLines()).toContain("status=Shuffle cycle load failed (HTTP 500). hasCurrent=false attempt=0");

    server.on("POST", "/api/random/cycle", () => {
      throw new TypeError("Failed to fetch");
    });
    await click(document.getElementById("panel-tab-settings")!);
    await openTab();
    await waitFor(() => expect(cycleMessage()).toBe("Shuffle cycle load failed: Couldn't reach the server."));

    await pickRandom(server);
    expect(cycleMessage()).toBeNull();
    expect(cards()).toEqual([["Picked this cycle", "1"], ["Eligible now", "10"], ["Remaining", "9"]]);
  });

  it("reads the cycle and the tag catalog again when the server asks for a resync, as after a restart, while the tab shows", async () => {
    const server = serverPicking();
    server.on("POST", "/api/random/cycle", () => json({ picked: 5, eligible: 10, remaining: 5 }));
    const page = await mount(server);
    await openTab();
    await click(checkbox("Spread by tags"));
    await click(radio("By category"));
    await waitFor(() => expect(categoryLabels()).toEqual(["People", "Places"]));
    expect(cards()).toEqual([["Picked this cycle", "5"], ["Eligible now", "10"], ["Remaining", "5"]]);

    // A restart clears the server's memory, and the resync the stream then asks for drops the tag catalog.
    server.on("POST", "/api/random/cycle", () => json({ picked: 0, eligible: 10, remaining: 10 }));
    page.stream().emit("resyncRequired", 30, { reason: "gap" });
    await waitFor(() => expect(cards()).toEqual([["Picked this cycle", "0"], ["Eligible now", "10"], ["Remaining", "10"]]));
    await waitFor(() => expect(categoryLabels()).toEqual(["People", "Places"]));
    expect(cycleReads(server)).toHaveLength(2);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(2);
  });

  it("shows the server's message while it fails the compatibility check or runs without a library, reads nothing, and Reset now says why it can't reset", async () => {
    const incompatible = new FakeServer();
    incompatible.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, minimumCompatibleApiVersion: "3" }));
    const page = mountPage({ server: incompatible });
    await waitFor(() => expect(incompatible.requests("GET", "/api/version")).toHaveLength(1));
    await settle();
    await openTab();
    await waitFor(() => expect(cycleMessage()).toBe("Server requires client API version 3 or newer."));
    expect([resetButton().disabled, resetButton().title]).toEqual([true, "Cannot reset: server compatibility check failed."]);
    expect(cycleReads(incompatible)).toHaveLength(0);
    page.unmount();

    const message = "The catalog was saved by a newer version of ReelRoulette and was left unchanged.";
    const noLibrary = new FakeServer();
    noLibrary.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, libraryState: "newer", libraryMessage: message }));
    mountPage({ server: noLibrary });
    await waitFor(() => expect(noLibrary.requests("GET", "/api/version")).toHaveLength(1));
    await settle();
    await openTab();
    await waitFor(() => expect(cycleMessage()).toBe(`Running without a library. ${message}`));
    expect([resetButton().disabled, resetButton().title]).toEqual([true, "Cannot reset: the server is running without a library."]);
    await click(resetButton());
    expect(noLibrary.requests("POST", "/api/random/reset")).toHaveLength(0);
    expect(cycleReads(noLibrary)).toHaveLength(0);
  });

  it("reads the cycle once the server opens its library while the tab shows", async () => {
    const message = "The catalog was saved by a newer version of ReelRoulette and was left unchanged.";
    const server = serverPicking();
    let version: object = { ...COMPATIBLE_VERSION, libraryState: "newer", libraryMessage: message };
    server.on("GET", "/api/version", () => json(version));
    server.on("POST", "/api/random/cycle", () => json({ picked: 0, eligible: 10, remaining: 10 }));
    const page = mountPage({ server });
    await waitFor(() => expect(server.requests("GET", "/api/version")).toHaveLength(1));
    await settle();
    await openTab();
    await waitFor(() => expect(cycleMessage()).toBe(`Running without a library. ${message}`));
    expect(cycleReads(server)).toHaveLength(0);

    // The server opens its library; the event stream opening has the page check again.
    version = COMPATIBLE_VERSION;
    page.stream().open();
    await waitFor(() => expect(cards()).toEqual([["Picked this cycle", "0"], ["Eligible now", "10"], ["Remaining", "10"]]));
    expect(cycleMessage()).toBeNull();
    expect(cycleReads(server)).toHaveLength(1);
  });

  it("shows nothing while the server asks for pairing, and Reset now says why it can't reset", async () => {
    const server = serverPicking();
    server.on("POST", "/api/random/cycle", () => status(401));
    await mount(server);
    await openTab();
    await waitFor(() => expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex"));
    await settle();
    expect(cycleBody().textContent).toBe("");
    expect([resetButton().disabled, resetButton().title]).toEqual([true, "Cannot reset: this device isn't paired."]);
    expect(server.logLines().some((line) => line.startsWith("status=Shuffle cycle load failed"))).toBe(false);
  });
});

describe("Reset now", () => {
  it("clears this device's memory at once, says so in a popup, and reads the cycle again", async () => {
    const server = serverPicking();
    const page = await mount(server);
    await openTab();
    await waitFor(() => expect(cycleReads(server)).toHaveLength(1));

    await click(resetButton());
    await waitFor(() => expect(popupsShown()).toEqual(["Shuffle memory cleared."]));
    expect(server.requests("POST", "/api/random/reset").map((call) => call.body)).toEqual([{ clientId: page.clientId() }]);
    expect(openNotices()).toEqual([]);
    await waitFor(() => expect(cycleReads(server)).toHaveLength(2));
  });

  it("says what failed when the reset does", async () => {
    const server = serverPicking();
    server.on("POST", "/api/random/reset", () => {
      throw new TypeError("Failed to fetch");
    });
    await mount(server);
    await openTab();

    await click(resetButton());
    await waitFor(() => expect(openNotices()).toEqual(["Shuffle reset failed: Couldn't reach the server."]));
    expect(popupsShown()).toEqual([]);
  });
});

describe("Spread by tags", () => {
  it("disables All tags and By category while it is off, and shows By category's list only while By category is chosen", async () => {
    await mount(serverPicking());
    await openTab();
    const fields = document.getElementById("randomization-tag-fields") as HTMLFieldSetElement;
    expect(fields.disabled).toBe(true);

    await click(checkbox("Spread by tags"));
    expect(fields.disabled).toBe(false);
    expect(document.getElementById("randomization-categories")!.hidden).toBe(true);
    await click(radio("By category"));
    expect(document.getElementById("randomization-categories")!.hidden).toBe(false);
    await click(checkbox("Spread by tags"));
    expect(fields.disabled).toBe(true);
  });

  it("lists the categories with tags in the tag catalog's order, loading the catalog once, and keeps a chosen one by id when it is renamed", async () => {
    const server = serverPicking();
    const page = await mount(server);
    await openTab();
    await click(checkbox("Spread by tags"));
    await click(radio("By category"));
    await waitFor(() => expect(categoryLabels()).toEqual(["People", "Places"]));
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1);

    await click(categoryBox("People"));
    expect(randomLine()).toBe("Random: Shuffle · Spread by folder and People");
    const renamed = { ...CATALOG, categories: CATALOG.categories.map((category) => (category.id === "people" ? { ...category, name: "Friends" } : category)) };
    page.stream().emit("tagCatalogChanged", 1, renamed);
    await settle();
    expect(categoryLabels()).toEqual(["Friends", "Places"]);
    expect(categoryBox("Friends").checked).toBe(true);
    expect(randomLine()).toBe("Random: Shuffle · Spread by folder and Friends");
  });

  it("flags By category with no category chosen, and lets it be once one is", async () => {
    await mount(serverPicking());
    await openTab();
    await click(checkbox("Spread by tags"));
    expect(byCategoryIcon()).toBeNull();

    await click(radio("By category"));
    await waitFor(() => expect(categoryLabels()).toEqual(["People", "Places"]));
    expect(byCategoryIcon()).not.toBeNull();
    fireEvent.focus(radio("By category"));
    await settle();
    expect(document.body.textContent).toContain("Choose at least one category.");

    await click(categoryBox("Places"));
    await waitFor(() => expect(byCategoryIcon()).toBeNull());
  });

  it("says when there are no tags yet, and what failed when the tags can't load", async () => {
    const empty = serverPicking();
    empty.on("POST", "/api/tag-editor/model", () => json({ categories: [{ id: "moods", name: "Moods", sortOrder: 0 }], tags: [], items: [] }));
    const page = await mount(empty);
    await openTab();
    await click(checkbox("Spread by tags"));
    await click(radio("By category"));
    await waitFor(() => expect(document.getElementById("randomization-categories")!.textContent).toBe("No tags yet. Add them in the Tags tab."));
    page.unmount();

    const failing = serverPicking();
    failing.on("POST", "/api/tag-editor/model", () => status(500));
    await mount(failing);
    await openTab();
    await waitFor(() => expect(document.getElementById("randomization-categories")!.textContent).toBe("Tag load failed."));
    expect(failing.logLines()).toContain("status=Tag load failed (HTTP 500). hasCurrent=false attempt=0");
  });
});
