// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { COMPATIBLE_VERSION, FakeServer, json, mountPage, pageReady, resetPage, settle, status, type MountedPage } from "./pageHarness";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

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

const OTHER_VIDEO = {
  ...VIDEO,
  id: "C:\\media\\beach day.mp4",
  itemId: "item-other",
  displayName: "beach day.mp4",
  mediaUrl: "/api/media/item-other?token=t"
};

const STATS = {
  global: {
    totalVideos: 1200,
    totalPhotos: 30,
    totalMedia: 1230,
    favorites: 4,
    blacklisted: 2,
    uniquePlayedMedia: 900,
    neverPlayedMedia: 330,
    totalPlays: 15000,
    videosWithAudio: 1100,
    videosWithoutAudio: 90,
    baselineLoudnessLufs: -20.44
  },
  sources: []
};

/** Categories in their saved order: Places, Mood, then People. "Loose" has no category. */
const CATALOG = {
  categories: [
    { id: "cat-people", name: "People", sortOrder: 2 },
    { id: "cat-places", name: "Places", sortOrder: 0 },
    { id: "cat-mood", name: "Mood", sortOrder: 1 }
  ],
  tags: [
    { name: "Bob", categoryId: "cat-people" },
    { name: "Beach", categoryId: "cat-places" },
    { name: "Calm", categoryId: "cat-mood" },
    { name: "Loose", categoryId: "" }
  ],
  items: []
};

/** The server's item read for `played`, as the server keeps it once this play is recorded. */
function itemRow(played: typeof VIDEO, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: played.itemId,
    sourceId: "s1",
    fileName: played.displayName,
    fullPath: played.id,
    relativePath: played.displayName,
    mediaType: 0,
    durationSeconds: 65,
    playCount: 1,
    lastPlayedUtc: new Date().toISOString(),
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: true,
    integratedLoudness: -23.4,
    peakDb: -1.2,
    tags: [],
    ...fields
  };
}

interface StatsPage {
  page: MountedPage;
  server: FakeServer;
  /** The server's item reads by item id, which a test changes as the server would. */
  items: Map<string, Record<string, unknown>>;
  /** The random picks still to answer, in order; the last one repeats. */
  picks: (typeof VIDEO)[];
}

async function mountStats(
  options: { play?: boolean; items?: Record<string, unknown>[]; picks?: (typeof VIDEO)[]; setup?: (server: FakeServer) => void } = {}
): Promise<StatsPage> {
  const server = new FakeServer();
  const items = new Map((options.items ?? [itemRow(VIDEO)]).map((row) => [String(row.id), row]));
  const picks = [...(options.picks ?? [VIDEO])];
  server.on("POST", "/api/random", () => json(picks.length > 1 ? picks.shift()! : picks[0]!));
  server.on("GET", "/api/library/stats", () => json(STATS));
  server.on("POST", "/api/library/item", (call) => {
    const row = items.get(String(call.body?.id));
    return row ? json(row) : status(404);
  });
  server.on("POST", "/api/tag-editor/model", () => json(CATALOG));
  server.on("GET", "/api/sources", () => json([]));
  options.setup?.(server);
  const page = mountPage({ server });
  await pageReady(server);
  await settle();
  if (options.play !== false) {
    await playNext(picks[0]!, "Tap to play, or open the panel to choose a preset or filter.");
  }
  return { page, server, items, picks };
}

/** Plays the next pick, from the idle prompt or the player's Next, and waits for it to load. */
async function playNext(played: typeof VIDEO, from = "Next"): Promise<void> {
  fireEvent.click(from === "Next" ? screen.getByRole("button", { name: "Next" }) : screen.getByText(from));
  await waitFor(() => expect((document.getElementById("video") as HTMLVideoElement).src).toContain(played.mediaUrl.split("?")[0]));
  await settle();
}

/** Opens the panel's Stats tab from the panel button and the tab row. */
async function openStatsTab(): Promise<void> {
  fireEvent.click(document.getElementById("panel-btn")!);
  await settle();
  fireEvent.click(document.getElementById("panel-tab-stats")!);
  await settle();
}

function statsBody(): HTMLElement {
  return document.getElementById("stats-body")!;
}

function sections(): HTMLElement[] {
  return [...statsBody().querySelectorAll<HTMLElement>(".stats-section")];
}

function rows(): Record<string, string> {
  return Object.fromEntries([...statsBody().querySelectorAll("dt")].map((dt) => [dt.textContent ?? "", dt.nextElementSibling?.textContent ?? ""]));
}

function cards(): Array<[string, string]> {
  return [...statsBody().querySelectorAll(".stat-card")].map((card) => [
    card.querySelector(".label")?.textContent ?? "",
    card.querySelector(".value")?.textContent ?? ""
  ]);
}

function tagChips(): string[] {
  return [...statsBody().querySelectorAll(".stats-tag")].map((chip) => chip.textContent ?? "");
}

function emit(page: MountedPage, eventType: string, payload: unknown): void {
  emitted += 1;
  page.stream().emit(eventType, emitted, payload);
}
let emitted = 0;

describe("Stats tab", () => {
  beforeEach(() => {
    resetPage();
  });

  it("opens from the header's file name on the current file, then the library", async () => {
    const { page } = await mountStats();

    fireEvent.click(document.getElementById("now-playing-name")!);
    await settle();

    expect(document.getElementById("panel")!.hidden).toBe(false);
    expect(document.getElementById("panel-tab-stats")!.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("panel-page-stats")!.hidden).toBe(false);
    await waitFor(() => expect(rows().Plays).toBe("1"));
    expect(sections().map((section) => section.querySelector("h3")?.textContent)).toEqual(["Current file", "Library"]);
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(page.server.requests("POST", "/api/library/item").map((call) => call.body)).toEqual([{ id: "item-video" }]);
  });

  it("opens from the file name with Enter or Space, as a button", async () => {
    await mountStats();
    const name = document.getElementById("now-playing-name")!;
    expect([name.getAttribute("role"), name.tabIndex]).toEqual(["button", 0]);

    fireEvent.keyDown(name, { key: " " });
    await settle();
    expect(document.getElementById("panel-tab-stats")!.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(document.getElementById("panel-btn")!);
    await settle();
    expect(document.getElementById("panel")!.hidden).toBe(true);

    fireEvent.keyDown(name, { key: "Enter" });
    await settle();
    expect(document.getElementById("panel")!.hidden).toBe(false);
  });

  it("is the Stats tab, with its icon, between Tags and Settings", async () => {
    await mountStats({ play: false });
    const tabs = [...document.querySelectorAll(".panel-tablist .panel-tab")];

    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(["Library", "Filter", "Tags", "Stats", "Settings"]);
    expect(document.getElementById("panel-tab-stats")!.textContent).toBe("bar_chart");
  });

  it("says nothing is playing yet above the library's cards, which match the stats response", async () => {
    await mountStats({ play: false });
    await openStatsTab();

    await waitFor(() => expect(cards()).toHaveLength(11));
    expect(sections()[0]!.textContent).toBe("Current fileNothing is playing yet.");
    expect(cards()).toEqual([
      ["Videos", (1200).toLocaleString()],
      ["Photos", "30"],
      ["Total media", (1230).toLocaleString()],
      ["Favorites", "4"],
      ["Blacklisted", "2"],
      ["Total plays", (15000).toLocaleString()],
      ["Unique played", "900"],
      ["Never played", "330"],
      ["Videos with audio", (1100).toLocaleString()],
      ["Videos without audio", "90"],
      ["Baseline loudness", "-20.4 LUFS"]
    ]);
  });

  it.each([
    ["a measured video", { hasAudio: true, integratedLoudness: -23.4, peakDb: -1.2 }, ["Yes", "-23.4 LUFS", "-1.2 dBTP"]],
    ["a digitally silent track, sent as no audio", { hasAudio: false, integratedLoudness: undefined, peakDb: undefined }, ["No", "N/A", "N/A"]],
    ["a track without a peak", { hasAudio: true, integratedLoudness: -30, peakDb: undefined }, ["Yes", "-30.0 LUFS", "Not measured"]],
    ["a video without audio", { hasAudio: false, integratedLoudness: undefined, peakDb: undefined }, ["No", "N/A", "N/A"]],
    ["a video not scanned yet", { hasAudio: undefined, integratedLoudness: undefined, peakDb: undefined }, ["Unknown", "Unknown", "Not measured"]]
  ])("shows %s's audio, loudness, and true peak", async (_, fields, expected) => {
    await mountStats({ items: [itemRow(VIDEO, fields)] });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(rows()["Has audio"]).toBe(expected[0]));
    expect([rows().Loudness, rows()["True peak"]]).toEqual(expected.slice(1));
  });

  it("follows a new play, and the server's favorite, blacklist, tag, and playback events", async () => {
    const { page, items } = await mountStats({
      items: [itemRow(VIDEO), itemRow(OTHER_VIDEO, { playCount: 7, tags: ["Beach"] })],
      picks: [VIDEO, OTHER_VIDEO]
    });
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(rows().Plays).toBe("1"));

    await playNext(OTHER_VIDEO);
    await waitFor(() => expect(rows().Plays).toBe("7"));
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("beach day.mp4");

    items.set("item-other", { ...items.get("item-other")!, isFavorite: true });
    emit(page, "itemStateChanged", { itemId: "item-other", path: OTHER_VIDEO.id, isFavorite: true, isBlacklisted: false, clientId: page.clientId() });
    await waitFor(() => expect(rows().Favorite).toBe("Yes"));

    items.set("item-other", { ...items.get("item-other")!, isFavorite: false, isBlacklisted: true });
    emit(page, "itemStateChanged", { itemId: "item-other", path: OTHER_VIDEO.id, isFavorite: false, isBlacklisted: true, clientId: page.clientId() });
    await waitFor(() => expect([rows().Favorite, rows().Blacklisted]).toEqual(["No", "Yes"]));

    items.set("item-other", { ...items.get("item-other")!, tags: ["Beach", "Calm"] });
    emit(page, "itemTagsChanged", { resolvedItemIds: ["item-other"], addedTags: ["Calm"], removedTags: [] });
    await waitFor(() => expect(tagChips()).toEqual(["Beach", "Calm"]));

    items.set("item-other", { ...items.get("item-other")!, playCount: 8 });
    emit(page, "playbackRecorded", { itemId: "item-other", playCount: 8, previousLastPlayedUtc: null });
    await waitFor(() => expect(rows().Plays).toBe("8"));
  });

  it("shows no rows for a new play until its own read lands, not the last file's", async () => {
    const { server } = await mountStats({
      items: [itemRow(VIDEO), itemRow(OTHER_VIDEO, { playCount: 7 })],
      picks: [VIDEO, OTHER_VIDEO]
    });
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(rows().Plays).toBe("1"));

    let release: () => void = () => {};
    server.on("POST", "/api/library/item", () => new Promise<Response>((resolve) => (release = () => resolve(json(itemRow(OTHER_VIDEO, { playCount: 7 }))))));
    await playNext(OTHER_VIDEO);
    await waitFor(() => expect(server.requests("POST", "/api/library/item")).toHaveLength(2));
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("beach day.mp4");
    expect(statsBody().querySelector("dl")).toBeNull();

    release();
    await waitFor(() => expect(rows().Plays).toBe("7"));
  });

  it("shows the time before this play, from the play's event, also when it comes before the item plays", async () => {
    const { page } = await mountStats({ items: [itemRow(VIDEO), itemRow(OTHER_VIDEO)], picks: [VIDEO, OTHER_VIDEO] });
    fireEvent.click(document.getElementById("now-playing-name")!);
    // Until the play's event comes, the item's own time stands in, which this play has already moved to now.
    await waitFor(() => expect(rows()["Last played"]).toBe("Just now"));

    emit(page, "playbackRecorded", { itemId: "item-video", playCount: 1, previousLastPlayedUtc: new Date(Date.now() - 3 * DAY).toISOString() });
    await waitFor(() => expect(rows()["Last played"]).toBe("3 days ago"));

    // A library play's event comes before its answer, so before the item plays.
    emit(page, "playbackRecorded", { itemId: "item-other", playCount: 1, previousLastPlayedUtc: new Date(Date.now() - 2 * DAY).toISOString() });
    await settle();
    await playNext(OTHER_VIDEO);
    await waitFor(() => expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("beach day.mp4"));
    await waitFor(() => expect(rows()["Last played"]).toBe("2 days ago"));
  });

  it("shows the file's tags in the tag catalog's category order, from the catalog the Tags tab loaded, kept by its events", async () => {
    const { page, server } = await mountStats({ items: [itemRow(VIDEO, { tags: ["Loose", "Bob", "Beach", "Calm"] })] });
    await openStatsTab();
    fireEvent.click(document.getElementById("panel-tab-tags")!);
    await waitFor(() => expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1));
    fireEvent.click(document.getElementById("panel-tab-stats")!);

    await waitFor(() => expect(tagChips()).toEqual(["Beach", "Calm", "Bob", "Loose"]));
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1);

    emit(page, "tagCatalogChanged", {
      reason: "reorder",
      categories: [
        { id: "cat-people", name: "People", sortOrder: 0 },
        { id: "cat-places", name: "Places", sortOrder: 1 },
        { id: "cat-mood", name: "Mood", sortOrder: 2 }
      ],
      tags: CATALOG.tags
    });
    await waitFor(() => expect(tagChips()).toEqual(["Bob", "Beach", "Calm", "Loose"]));
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1);
  });

  it("loads the tag catalog itself when no tab has loaded it", async () => {
    const { server } = await mountStats({ items: [itemRow(VIDEO, { tags: ["Bob", "Beach"] })] });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(tagChips()).toEqual(["Beach", "Bob"]));
    expect(server.requests("POST", "/api/tag-editor/model").map((call) => call.body)).toEqual([{ itemIds: [] }]);
  });

  it("loads only while it shows, and a burst of events loads once, plus once more for events during a load", async () => {
    const { page, server } = await mountStats();
    const statsLoads = () => server.requests("GET", "/api/library/stats").length;
    emit(page, "itemStateChanged", { itemId: "item-other", isFavorite: false, isBlacklisted: false });
    emit(page, "itemStateChanged", { itemId: "item-video", isFavorite: true, isBlacklisted: false });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(statsLoads()).toBe(0);

    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(statsLoads()).toBe(1));
    for (let i = 0; i < 4; i++) {
      emit(page, "itemStateChanged", { itemId: "item-video", isFavorite: i % 2 === 0, isBlacklisted: false });
    }
    await waitFor(() => expect(statsLoads()).toBe(2));

    // Held loads: events during one get exactly one more.
    let release: () => void = () => {};
    server.on("GET", "/api/library/stats", () => new Promise<Response>((resolve) => (release = () => resolve(json(STATS)))));
    emit(page, "itemStateChanged", { itemId: "item-other", isFavorite: false, isBlacklisted: false });
    await waitFor(() => expect(statsLoads()).toBe(3));
    for (let i = 0; i < 3; i++) {
      emit(page, "itemStateChanged", { itemId: "item-video", isFavorite: false, isBlacklisted: false });
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(statsLoads()).toBe(3);
    server.on("GET", "/api/library/stats", () => json(STATS));
    release();
    await waitFor(() => expect(statsLoads()).toBe(4));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(statsLoads()).toBe(4);
  });

  it("says a failed first load once, in the Library section, and the current file keeps its name and path", async () => {
    const { server } = await mountStats({ setup: (fake) => fake.on("GET", "/api/library/stats", () => status(500)) });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(sections()[1]!.querySelector('[role="alert"]')?.textContent).toBe("Stats load failed: HTTP 500"));
    expect(statsBody().querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(statsBody().querySelector("dl")).toBeNull();
    expect(server.logLines().some((line) => line.startsWith("status=Stats load failed: HTTP 500"))).toBe(true);
  });

  it("keeps what it showed when a later load fails", async () => {
    const { page, server } = await mountStats();
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(cards()).toHaveLength(11));

    server.on("GET", "/api/library/stats", () => status(500));
    emit(page, "itemStateChanged", { itemId: "item-other", isFavorite: false, isBlacklisted: false });
    await waitFor(() => expect(server.requests("GET", "/api/library/stats")).toHaveLength(2));
    await settle();
    expect(cards()).toHaveLength(11);
    expect(rows().Plays).toBe("1");
    expect(statsBody().querySelector('[role="alert"]')).toBeNull();
  });

  it("loads the library's cards and shows only the name and path for a playing item no longer in the catalog", async () => {
    // A refresh drops a file gone from disk, and a duplicate's delete its file, so the item's read answers 404.
    const { server } = await mountStats({ items: [] });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(cards()).toHaveLength(11));
    expect(server.requests("POST", "/api/library/item").map((call) => call.body)).toEqual([{ id: "item-video" }]);
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(statsBody().querySelector("dl")).toBeNull();
    expect(statsBody().querySelector('[role="alert"]')).toBeNull();
    expect(server.logLines().some((line) => line.startsWith("status=Stats load failed"))).toBe(false);
  });

  it("shows the server's message while it runs without a library, and loads nothing", async () => {
    const message = "The catalog was saved by a newer version of ReelRoulette and was left unchanged.";
    const server = new FakeServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, libraryState: "newer", libraryMessage: message }));
    server.on("GET", "/api/library/stats", () => json(STATS));
    mountPage({ server });
    await waitFor(() => expect(server.requests("GET", "/api/version")).toHaveLength(1));
    await settle();
    await openStatsTab();

    await waitFor(() => expect(sections()[1]!.querySelector('[role="alert"]')?.textContent).toBe(`Running without a library. ${message}`));
    expect(sections()[0]!.textContent).toBe("Current fileNothing is playing yet.");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.requests("GET", "/api/library/stats")).toHaveLength(0);
    expect(document.querySelectorAll(".stat-card")).toHaveLength(0);
  });

  it("shows the server's message while it fails the compatibility check, and loads nothing", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, minimumCompatibleApiVersion: "3" }));
    server.on("GET", "/api/library/stats", () => json(STATS));
    mountPage({ server });
    await waitFor(() => expect(server.requests("GET", "/api/version")).toHaveLength(1));
    await settle();
    await openStatsTab();

    await waitFor(() => expect(sections()[1]!.querySelector('[role="alert"]')?.textContent).toBe("Server requires client API version 3 or newer."));
    expect(sections()[0]!.textContent).toBe("Current fileNothing is playing yet.");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.requests("GET", "/api/library/stats")).toHaveLength(0);
    expect(document.querySelectorAll(".stat-card")).toHaveLength(0);
  });

  it("shows nothing in place of its stats while the server asks for pairing, and the file keeps its name and path", async () => {
    const { page, server } = await mountStats();
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(cards()).toHaveLength(11));
    expect(rows().Plays).toBe("1");

    server.on("GET", "/api/library/stats", () => status(401));
    emit(page, "itemStateChanged", { itemId: "item-other", isFavorite: false, isBlacklisted: false });
    const pairingPrompt = screen.getByRole("button", { name: "Pair", hidden: true }).closest(".pair-section") as HTMLElement;
    await waitFor(() => expect(pairingPrompt.style.display).toBe("flex"));
    await settle();

    expect(statsBody().querySelector("dl")).toBeNull();
    expect(cards()).toHaveLength(0);
    expect(statsBody().querySelector('[role="alert"]')).toBeNull();
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(server.logLines().some((line) => line.startsWith("status=Stats load failed"))).toBe(false);
  });
});
