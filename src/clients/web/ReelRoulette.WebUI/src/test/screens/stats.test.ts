// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPATIBLE_VERSION,
  currentStyle,
  FakeServer,
  json,
  mountPage,
  openNotices,
  pageReady,
  REQUIRED_CAPABILITIES,
  resetPage,
  settle,
  STAR_WIDTH,
  STARS_LEFT,
  status,
  stubStarLayout,
  useStylesheet,
  type FetchCall,
  type MountedPage
} from "./pageHarness";

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

/** A random pick, which carries the video's loudness and peak when the scan measured them. */
type PickedItem = typeof VIDEO & { integratedLoudness?: number; peakDb?: number };

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
    rated: 12,
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
  picks: PickedItem[];
}

/** The page loads the library stats once the server is ready, for loudness normalization's baseline. */
const BASELINE_LOADS = 1;

async function mountStats(
  options: { play?: boolean; items?: Record<string, unknown>[]; picks?: PickedItem[]; setup?: (server: FakeServer) => void } = {}
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
  await waitFor(() => expect(server.requests("GET", "/api/library/stats")).toHaveLength(BASELINE_LOADS));
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
    expect(sections()[0]!.querySelector(".stats-path code")?.textContent).toBe("C:\\media\\holiday clip.mp4");
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

    await waitFor(() => expect(cards()).toHaveLength(12));
    expect(sections()[0]!.textContent).toBe("Current fileNothing is playing yet.");
    expect(ratingStars()).toBeNull();
    expect(cards()).toEqual([
      ["Videos", (1200).toLocaleString()],
      ["Photos", "30"],
      ["Total media", (1230).toLocaleString()],
      ["Favorites", "4"],
      ["Blacklisted", "2"],
      ["Rated", "12"],
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

  it.each([
    ["a loud video, cut in full", { integratedLoudness: -14.44, peakDb: -1 }, "-6.0 dB"],
    ["a quiet video, boosted in full", { integratedLoudness: -26.44, peakDb: -12 }, "+6.0 dB"],
    ["a quiet video whose peak holds its boost back", { integratedLoudness: -32.44, peakDb: -4 }, "+9.0 dB (limited by peak)"],
    ["a video without loudness data", {}, "N/A"]
  ])("shows the adjustment normalization applies to %s, toward the library's baseline, between Loudness and True peak", async (_, fields, expected) => {
    await mountStats({ picks: [{ ...VIDEO, ...fields }] });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(rows().Adjustment).toBe(expected));
    const labels = Object.keys(rows());
    expect(labels.slice(labels.indexOf("Loudness"), labels.indexOf("True peak") + 1)).toEqual(["Loudness", "Adjustment", "True peak"]);
  });

  it("shows the adjustment Off while normalization or Enhanced audio is off, and follows the settings as they change", async () => {
    await mountStats({ picks: [{ ...VIDEO, integratedLoudness: -32.44, peakDb: -4 }] });
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(rows().Adjustment).toBe("+9.0 dB (limited by peak)"));

    const settingsTab = () => fireEvent.click(document.getElementById("panel-tab-settings")!);
    const statsTab = () => fireEvent.click(document.getElementById("panel-tab-stats")!);
    const checkbox = (name: string) => screen.getByRole("checkbox", { name, hidden: true }) as HTMLInputElement;
    settingsTab();
    await settle();
    fireEvent.click(checkbox("Allow limiting"));
    await settle();
    statsTab();
    await waitFor(() => expect(rows().Adjustment).toBe("+3.0 dB (limited by peak)"));

    settingsTab();
    await settle();
    fireEvent.click(checkbox("Loudness normalization"));
    await settle();
    statsTab();
    await waitFor(() => expect(rows().Adjustment).toBe("Off"));

    settingsTab();
    await settle();
    fireEvent.click(checkbox("Loudness normalization"));
    fireEvent.click(checkbox("Enhanced audio"));
    await settle();
    statsTab();
    await waitFor(() => expect(rows().Adjustment).toBe("Off"));
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
    expect(ratingStars()).toBeNull();

    release();
    await waitFor(() => expect(rows().Plays).toBe("7"));
    expect(ratingStars()).not.toBeNull();
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
    const statsLoads = () => server.requests("GET", "/api/library/stats").length - BASELINE_LOADS;
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

  it("loads nothing once the page closes, not even the load it was waiting to make", async () => {
    const { page, server } = await mountStats();
    fireEvent.click(document.getElementById("now-playing-name")!);
    await settle();
    expect(document.getElementById("panel-tab-stats")!.getAttribute("aria-selected")).toBe("true");

    page.unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.requests("GET", "/api/library/stats")).toHaveLength(BASELINE_LOADS);
    expect(server.requests("POST", "/api/library/item")).toHaveLength(0);
  });

  it("says a failed first load once, in the Library section, and the current file keeps its name and path", async () => {
    const { server } = await mountStats({ setup: (fake) => fake.on("GET", "/api/library/stats", () => status(500)) });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(sections()[1]!.querySelector('[role="alert"]')?.textContent).toBe("Stats load failed."));
    expect(statsBody().querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path code")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(statsBody().querySelector("dl")).toBeNull();
    expect(server.logLines().some((line) => line.startsWith("status=Stats load failed (HTTP 500)."))).toBe(true);
  });

  it("keeps what it showed when a later load fails", async () => {
    const { page, server } = await mountStats();
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(cards()).toHaveLength(12));

    server.on("GET", "/api/library/stats", () => status(500));
    emit(page, "itemStateChanged", { itemId: "item-other", isFavorite: false, isBlacklisted: false });
    await waitFor(() => expect(server.requests("GET", "/api/library/stats")).toHaveLength(BASELINE_LOADS + 2));
    await settle();
    expect(cards()).toHaveLength(12);
    expect(rows().Plays).toBe("1");
    expect(statsBody().querySelector('[role="alert"]')).toBeNull();
  });

  it("loads the library's cards and shows only the name and path for a playing item no longer in the catalog", async () => {
    // A refresh drops a file gone from disk, and a duplicate's delete its file, so the item's read answers 404.
    const { server } = await mountStats({ items: [] });
    fireEvent.click(document.getElementById("now-playing-name")!);

    await waitFor(() => expect(cards()).toHaveLength(12));
    expect(server.requests("POST", "/api/library/item").map((call) => call.body)).toEqual([{ id: "item-video" }]);
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path code")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(statsBody().querySelector("dl")).toBeNull();
    expect(ratingStars()).toBeNull();
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
    await waitFor(() => expect(cards()).toHaveLength(12));
    expect(rows().Plays).toBe("1");

    server.on("GET", "/api/library/stats", () => status(401));
    emit(page, "itemStateChanged", { itemId: "item-other", isFavorite: false, isBlacklisted: false });
    const pairingPrompt = screen.getByRole("button", { name: "Pair", hidden: true }).closest(".pair-section") as HTMLElement;
    await waitFor(() => expect(pairingPrompt.style.display).toBe("flex"));
    await settle();

    expect(statsBody().querySelector("dl")).toBeNull();
    expect(ratingStars()).toBeNull();
    expect(cards()).toHaveLength(0);
    expect(statsBody().querySelector('[role="alert"]')).toBeNull();
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
    expect(sections()[0]!.querySelector(".stats-path code")?.textContent).toBe("C:\\media\\holiday clip.mp4");
    expect(server.logLines().some((line) => line.startsWith("status=Stats load failed"))).toBe(false);
  });

  it("shows only the file's name and path once the server turns out to run without a library while it plays", async () => {
    const { page, server } = await mountStats();
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(ratingStars()).not.toBeNull());

    const message = "The catalog was saved by a newer version of ReelRoulette and was left unchanged.";
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, libraryState: "newer", libraryMessage: message }));
    // The stream failing checks the version again.
    page.stream().fail();
    await waitFor(() => expect(sections()[1]!.querySelector('[role="alert"]')?.textContent).toBe(`Running without a library. ${message}`));

    expect(statsBody().querySelector("dl")).toBeNull();
    expect(ratingStars()).toBeNull();
    expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("holiday clip.mp4");
  });

  it("shows the file's tags in a row of their own below the table, with no Tags label, and nothing there for a file without tags", async () => {
    await mountStats({ items: [itemRow(VIDEO, { tags: ["Beach"] }), itemRow(OTHER_VIDEO)], picks: [VIDEO, OTHER_VIDEO] });
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(tagChips()).toEqual(["Beach"]));

    expect(statsBody().querySelector("dl.stats-table")!.nextElementSibling?.classList.contains("stats-tags")).toBe(true);
    expect(Object.keys(rows())).not.toContain("Tags");

    await playNext(OTHER_VIDEO);
    await waitFor(() => expect(sections()[0]!.querySelector(".stats-file-name")?.textContent).toBe("beach day.mp4"));
    await waitFor(() => expect(statsBody().querySelector("dl")).not.toBeNull());
    expect(statsBody().querySelector(".stats-tags")).toBeNull();
    expect(Object.keys(rows())).not.toContain("Tags");
    expect(sections()[0]!.textContent).not.toContain("None");
  });
});

/** A video whose item id needs encoding in a route. */
const ENCODED_VIDEO = { ...VIDEO, itemId: "item 7/a" };
const SHOW_IN_FILE_MANAGER_ROUTE = "/api/show-in-file-manager/item%207%2Fa";

/** The server's version for a browser on the server machine, while it has a desktop to open its file manager in. */
function offerFileManager(server: FakeServer): void {
  server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [...REQUIRED_CAPABILITIES, "api.showInFileManager"] }));
}

/** Plays the video and opens the Stats tab on it, with or without the server offering Show in File Manager. */
async function openOnFile(options: { fileManager: boolean; setup?: (server: FakeServer) => void }): Promise<StatsPage> {
  const page = await mountStats({
    picks: [ENCODED_VIDEO],
    items: [itemRow(ENCODED_VIDEO)],
    setup(server) {
      if (options.fileManager) {
        offerFileManager(server);
      }
      options.setup?.(server);
    }
  });
  fireEvent.click(document.getElementById("now-playing-name")!);
  await waitFor(() => expect(rows().Plays).toBe("1"));
  return page;
}

/** The icon button beside the path, found by the name its tooltip gives it. */
function pathButton(name: string): HTMLButtonElement | null {
  return [...statsBody().querySelectorAll<HTMLButtonElement>(".stats-path button")].find((button) => button.getAttribute("aria-label") === name) ?? null;
}

/** The popups showing, each as its text and second line, leaving out any that are fading out. */
function popupsShown(): string[] {
  return [...document.querySelectorAll<HTMLElement>("#toasts .toast:not(.is-leaving)")].map((toast) =>
    [...toast.querySelectorAll(".toast-text > div")].map((line) => line.textContent).join(" | ")
  );
}

/** Whether any line the page relayed names the file or its path. */
function relayedFile(server: FakeServer): boolean {
  return server.logLines().some((line) => line.includes("holiday clip") || line.includes("C:\\media"));
}

/** The browser has no Clipboard API, as on a page served over plain HTTP to another device. */
function removeClipboard(): void {
  Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
}

function stubClipboard(writeText: (text: string) => Promise<void>): ReturnType<typeof vi.fn> {
  const spy = vi.fn(writeText);
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: spy }, configurable: true });
  return spy;
}

interface ExecCopy {
  commands: string[];
  /** The field's value, selection, and place when the copy ran. */
  fields: Array<{ value: string; selected: string; inStatsTab: boolean; focused: boolean }>;
}

/** Stands in for `document.execCommand`, which happy-dom lacks, answering `result`. */
function stubExecCommand(result: boolean): ExecCopy {
  const copy: ExecCopy = { commands: [], fields: [] };
  (document as unknown as { execCommand: (command: string) => boolean }).execCommand = (command: string) => {
    copy.commands.push(command);
    const field = document.querySelector("textarea");
    if (field) {
      copy.fields.push({
        value: field.value,
        selected: field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0),
        inStatsTab: !!field.closest("#stats-tab"),
        focused: document.activeElement === field
      });
    }
    return result;
  };
  return copy;
}

describe("Stats tab's Show in File Manager and Copy Path", () => {
  beforeEach(() => {
    resetPage();
  });

  afterEach(() => {
    delete (window.navigator as unknown as Record<string, unknown>).clipboard;
    delete (document as unknown as Record<string, unknown>).execCommand;
    vi.unstubAllGlobals();
  });

  it("offers Show in File Manager only where the server offers it, and Copy Path otherwise, as an icon button named by its tooltip", async () => {
    await openOnFile({ fileManager: true });
    const show = pathButton("Show in File Manager");
    expect(show).not.toBeNull();
    expect(screen.getByRole("button", { name: "Show in File Manager" })).toBe(show);
    expect([show!.className, show!.title, show!.textContent]).toEqual(["icon-btn", "Show in File Manager", "folder_open"]);
    expect(show!.querySelector(".material-symbol-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(pathButton("Copy Path")).toBeNull();

    resetPage();
    await openOnFile({ fileManager: false });
    const copy = pathButton("Copy Path");
    expect(copy).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy Path" })).toBe(copy);
    expect([copy!.className, copy!.title, copy!.textContent]).toEqual(["icon-btn", "Copy Path", "content_copy"]);
    expect(pathButton("Show in File Manager")).toBeNull();
  });

  it("shows Copy Path beside the path of a playing item no longer in the catalog", async () => {
    await mountStats({ items: [] });
    fireEvent.click(document.getElementById("now-playing-name")!);
    await waitFor(() => expect(cards()).toHaveLength(12));

    expect(statsBody().querySelector("dl")).toBeNull();
    expect(pathButton("Copy Path")).not.toBeNull();
  });

  it("asks the server to open its file manager at the item, and says so with the file's name", async () => {
    const { server } = await openOnFile({ fileManager: true, setup: (fake) => fake.on("POST", SHOW_IN_FILE_MANAGER_ROUTE, () => status(204)) });

    fireEvent.click(pathButton("Show in File Manager")!);
    await waitFor(() => expect(popupsShown()).toEqual(["Opened in the file manager. | holiday clip.mp4"]));
    expect(server.requests("POST", SHOW_IN_FILE_MANAGER_ROUTE)).toHaveLength(1);
    expect(server.requests("POST", SHOW_IN_FILE_MANAGER_ROUTE)[0]!.body).toBeUndefined();
    expect(openNotices()).toEqual([]);
    expect(server.logLines().some((line) => line.startsWith("status=Opened in the file manager."))).toBe(true);
    expect(relayedFile(server)).toBe(false);
  });

  it("says why the server refused to open its file manager, or that it failed without a reason, logging only the status", async () => {
    const { server } = await openOnFile({
      fileManager: true,
      setup: (fake) =>
        fake.on("POST", SHOW_IN_FILE_MANAGER_ROUTE, () =>
          json({ error: "The server has no desktop to open a file manager in.", code: "file_manager_unavailable" }, 409)
        )
    });

    fireEvent.click(pathButton("Show in File Manager")!);
    await waitFor(() => expect(openNotices()).toEqual(["Show in File Manager failed: The server has no desktop to open a file manager in."]));
    expect(server.logLines().some((line) => line.startsWith("status=Show in File Manager failed (HTTP 409)."))).toBe(true);
    fireEvent.click(document.querySelector("dialog.app-dialog .dialog-actions button")!);
    await settle();

    server.on("POST", SHOW_IN_FILE_MANAGER_ROUTE, () => new Response("Internal error", { status: 500 }));
    fireEvent.click(pathButton("Show in File Manager")!);
    await waitFor(() => expect(openNotices()).toEqual(["Show in File Manager failed."]));
    expect(server.logLines().some((line) => line.startsWith("status=Show in File Manager failed (HTTP 500)."))).toBe(true);
    expect(popupsShown()).toEqual([]);
    expect(relayedFile(server)).toBe(false);
  });

  it("copies the path with the Clipboard API, and says so with the file's name", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    const execCopy = stubExecCommand(true);
    const { server } = await openOnFile({ fileManager: false });

    fireEvent.click(pathButton("Copy Path")!);
    await waitFor(() => expect(popupsShown()).toEqual(["Path copied. | holiday clip.mp4"]));
    expect(writeText.mock.calls).toEqual([["C:\\media\\holiday clip.mp4"]]);
    expect(execCopy.commands).toEqual([]);
    expect(server.logLines().some((line) => line.startsWith("status=Path copied."))).toBe(true);
    expect(relayedFile(server)).toBe(false);
  });

  it("copies the path from a hidden field without the Clipboard API, as over plain HTTP from another device", async () => {
    removeClipboard();
    const execCopy = stubExecCommand(true);
    const { server } = await openOnFile({ fileManager: false });
    const button = pathButton("Copy Path")!;
    button.focus();

    fireEvent.click(button);
    await waitFor(() => expect(popupsShown()).toEqual(["Path copied. | holiday clip.mp4"]));
    expect(execCopy.commands).toEqual(["copy"]);
    const path = "C:\\media\\holiday clip.mp4";
    expect(execCopy.fields).toEqual([{ value: path, selected: path, inStatsTab: true, focused: true }]);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(openNotices()).toEqual([]);
    expect(relayedFile(server)).toBe(false);
  });

  it("falls back to the hidden field when the Clipboard API refuses, and says when that fails too", async () => {
    const writeText = stubClipboard(() => Promise.reject(new Error("Write permission denied.")));
    const execCopy = stubExecCommand(false);
    const { server } = await openOnFile({ fileManager: false });

    fireEvent.click(pathButton("Copy Path")!);
    await waitFor(() => expect(openNotices()).toEqual(["Couldn't copy the path."]));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(execCopy.commands).toEqual(["copy"]);
    expect(document.querySelector("textarea")).toBeNull();
    expect(popupsShown()).toEqual([]);
    expect(server.logLines().some((line) => line.startsWith("status=Couldn't copy the path."))).toBe(true);
    expect(relayedFile(server)).toBe(false);
  });
});

/** The Current file section's stars, or null while they don't show. */
function ratingStars(): HTMLElement | null {
  return statsBody().querySelector<HTMLElement>(".rating");
}

/** The rating the stars show, in stars, a half-filled star counting as half. */
function starsShown(): number {
  return [...ratingStars()!.querySelectorAll(".rating-star")].reduce(
    (stars, star) => stars + (star.classList.contains("is-full") ? 1 : star.classList.contains("is-half") ? 0.5 : 0),
    0
  );
}

/** The slider's value and value text, which stay the rating set through a preview. */
function sliderValue(): [string | null, string | null] {
  const stars = ratingStars()!;
  return [stars.getAttribute("aria-valuenow"), stars.getAttribute("aria-valuetext")];
}

/** Where on the laid-out stars `stars` is set: a star's right half for a whole star, and its left half for a half. */
function xFor(stars: number): number {
  return STARS_LEFT + STAR_WIDTH * (Math.ceil(stars) - 1) + (Number.isInteger(stars) ? 27 : 13);
}
/** On the first star's left edge, which clears the rating. */
const CLEAR_EDGE_X = STARS_LEFT + 4;
const PAST_RIGHT_X = STARS_LEFT + STAR_WIDTH * 5 + 20;
const PAST_LEFT_X = STARS_LEFT - 30;

type Pointer = "mouse" | "touch";

/** Sends `mousedown` on the stars, which moves focus to them unless it is cancelled, as a browser does. */
function mouseDownOnStars(x: number): void {
  const stars = ratingStars()!;
  if (fireEvent.mouseDown(stars, { button: 0, clientX: x })) {
    stars.focus();
  }
}

/** Presses on the stars at `x` and holds. A mouse's `mousedown` comes with its press. */
async function pressStars(x: number, pointer: Pointer): Promise<void> {
  fireEvent.pointerDown(ratingStars()!, { pointerId: 1, pointerType: pointer, button: 0, clientX: x });
  if (pointer === "mouse") mouseDownOnStars(x);
  await settle();
}

async function movePointer(x: number, pointer: Pointer): Promise<void> {
  fireEvent.pointerMove(ratingStars()!, { pointerId: 1, pointerType: pointer, clientX: x });
  await settle();
}

/** Lets go at `x`, as a drag ends, which a touch screen sends no mouse events for. */
async function releasePointer(x: number, pointer: Pointer): Promise<void> {
  fireEvent.pointerUp(ratingStars()!, { pointerId: 1, pointerType: pointer, button: 0, clientX: x });
  if (pointer === "mouse") fireEvent.mouseUp(ratingStars()!, { button: 0, clientX: x });
  await settle();
}

/**
 * A click or a tap on the stars at `x`, in the order a browser sends its events: a tap's pointer leaves as it lifts,
 * and its `mousedown` comes after that, each `mousedown` moving focus to the stars unless it is cancelled.
 */
async function tapStars(x: number, pointer: Pointer = "mouse"): Promise<void> {
  const stars = ratingStars()!;
  const init = { pointerId: 1, pointerType: pointer, button: 0, clientX: x };
  fireEvent.pointerDown(stars, init);
  if (pointer === "mouse") mouseDownOnStars(x);
  fireEvent.pointerUp(stars, init);
  if (pointer === "touch") {
    fireEvent.pointerLeave(stars, init);
    mouseDownOnStars(x);
  }
  fireEvent.mouseUp(stars, { button: 0, clientX: x });
  fireEvent.click(stars, { button: 0, clientX: x });
  await settle();
}

async function pressRatingKey(key: string): Promise<void> {
  fireEvent.keyDown(ratingStars()!, { key });
  fireEvent.keyUp(ratingStars()!, { key });
  await settle();
}

/** The rating requests' bodies, in order. */
function ratingRequests(server: FakeServer): unknown[] {
  return server.requests("POST", "/api/rating").map((call) => call.body);
}

/** The server's answer to a rating request, as it answers one it takes. */
function ratingAnswer(call: FetchCall): Response {
  return json({ itemId: call.body?.itemId, rating: call.body?.rating ?? null, revision: 9 });
}

/**
 * Plays the video, whose read gives it `rating`, with its stars laid out, and opens the Stats tab on it, with the server
 * taking ratings as `reply` answers them.
 */
async function openRated(
  rating: number | null,
  options: { items?: Record<string, unknown>[]; picks?: PickedItem[]; reply?: (call: FetchCall) => Response | Promise<Response> } = {}
): Promise<StatsPage> {
  stubStarLayout();
  const stats = await mountStats({
    items: options.items ?? [itemRow(VIDEO, rating === null ? {} : { rating })],
    picks: options.picks,
    setup: (server) => server.on("POST", "/api/rating", options.reply ?? ratingAnswer)
  });
  fireEvent.click(document.getElementById("now-playing-name")!);
  await waitFor(() => expect(ratingStars()).not.toBeNull());
  return stats;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Stats tab's rating", () => {
  beforeEach(() => {
    resetPage();
  });

  it("shows the file's rating under its path, as a slider named Rating from 0 to 5 whose value text reads it", async () => {
    await openRated(3.5);

    const stars = screen.getByRole("slider", { name: "Rating" });
    expect(stars).toBe(ratingStars());
    expect([stars.getAttribute("aria-valuemin"), stars.getAttribute("aria-valuemax"), stars.tabIndex]).toEqual(["0", "5", 0]);
    expect(sliderValue()).toEqual(["3.5", "3.5 stars"]);
    expect(starsShown()).toBe(3.5);
    const line = stars.closest(".stats-rating")!;
    expect(line.previousElementSibling?.classList.contains("stats-path")).toBe(true);
    expect(line.nextElementSibling?.matches("dl.stats-table")).toBe(true);
    expect(line.querySelector(".stats-rating-label")?.textContent).toBe("Rating");

    resetPage();
    await openRated(null);
    expect(sliderValue()).toEqual(["0", "Not rated"]);
    expect(starsShown()).toBe(0);
  });

  it("sets half a star less or the whole star on a click or tap on a star's left or right half, and clears it on the first star's left edge", async () => {
    const { page, server } = await openRated(null);

    await tapStars(xFor(3), "mouse");
    expect(sliderValue()).toEqual(["3", "3 stars"]);
    await waitFor(() => expect(popupsShown()).toEqual(["Rated 3 stars | holiday clip.mp4"]));

    // A second rating's popup replaces the first.
    await tapStars(xFor(1.5), "touch");
    expect(sliderValue()).toEqual(["1.5", "1.5 stars"]);
    await waitFor(() => expect(popupsShown()).toEqual(["Rated 1.5 stars | holiday clip.mp4"]));

    await tapStars(CLEAR_EDGE_X, "touch");
    expect(sliderValue()).toEqual(["0", "Not rated"]);
    await waitFor(() => expect(popupsShown()).toEqual(["Rating cleared | holiday clip.mp4"]));

    expect(ratingRequests(server)).toEqual([
      { itemId: "item-video", rating: 3, clientId: page.clientId() },
      { itemId: "item-video", rating: 1.5, clientId: page.clientId() },
      { itemId: "item-video", rating: null, clientId: page.clientId() }
    ]);
    expect(server.logLines().some((line) => line.startsWith("status=Rated 3 stars"))).toBe(true);
    expect(relayedFile(server)).toBe(false);
  });

  it("does nothing for a click or tap left of the stars", async () => {
    const { server } = await openRated(2);
    const label = ratingStars()!.closest(".stats-rating")!.querySelector(".stats-rating-label")!;

    for (const pointerType of ["mouse", "touch"]) {
      fireEvent.pointerDown(label, { pointerId: 1, pointerType, button: 0, clientX: STARS_LEFT - 40 });
      fireEvent.pointerUp(label, { pointerId: 1, pointerType, button: 0, clientX: STARS_LEFT - 40 });
      fireEvent.click(label);
    }
    await wait(600);

    expect(ratingRequests(server)).toEqual([]);
    expect(sliderValue()).toEqual(["2", "2 stars"]);
  });

  it("shows a press's value as it drags, without changing the slider's value, and sets it on release, 5 stars past the right end", async () => {
    const { server } = await openRated(2);

    await pressStars(xFor(1), "touch");
    expect(starsShown()).toBe(1);
    await movePointer(xFor(4.5), "touch");
    expect(starsShown()).toBe(4.5);
    expect(sliderValue()).toEqual(["2", "2 stars"]);
    expect(ratingRequests(server)).toEqual([]);
    await releasePointer(xFor(4), "touch");
    expect(sliderValue()).toEqual(["4", "4 stars"]);
    await waitFor(() => expect(ratingRequests(server)).toHaveLength(1));

    await pressStars(xFor(2), "mouse");
    await movePointer(PAST_RIGHT_X, "mouse");
    expect(starsShown()).toBe(5);
    await releasePointer(PAST_RIGHT_X, "mouse");
    expect(sliderValue()).toEqual(["5", "5 stars"]);
    await waitFor(() => expect(ratingRequests(server).map((body) => (body as { rating: unknown }).rating)).toEqual([4, 5]));
  });

  it.each([
    ["on the first star's left edge", CLEAR_EDGE_X],
    ["past the stars' left end", PAST_LEFT_X]
  ])("clears the rating for a drag that ends %s", async (_, x) => {
    const { server } = await openRated(3);

    await pressStars(xFor(3), "touch");
    await movePointer(x, "touch");
    expect(starsShown()).toBe(0);
    await releasePointer(x, "touch");

    expect(sliderValue()).toEqual(["0", "Not rated"]);
    await waitFor(() => expect(ratingRequests(server).map((body) => (body as { rating: unknown }).rating)).toEqual([null]));
  });

  it("sets nothing for a press the browser cancels", async () => {
    const { server } = await openRated(2);

    await pressStars(xFor(1), "touch");
    await movePointer(xFor(4), "touch");
    fireEvent.pointerCancel(ratingStars()!, { pointerId: 1, pointerType: "touch" });
    await settle();
    await wait(600);

    expect(starsShown()).toBe(2);
    expect(ratingRequests(server)).toEqual([]);
  });

  it("previews the value under a mouse, none on the first star's left edge, without changing the slider's value, and shows the rating set once it leaves", async () => {
    const { server } = await openRated(2);

    await movePointer(xFor(4), "mouse");
    expect(starsShown()).toBe(4);
    await movePointer(xFor(3.5), "mouse");
    expect(starsShown()).toBe(3.5);
    await movePointer(CLEAR_EDGE_X, "mouse");
    expect(starsShown()).toBe(0);
    expect(sliderValue()).toEqual(["2", "2 stars"]);
    fireEvent.pointerLeave(ratingStars()!, { pointerId: 1, pointerType: "mouse" });
    await settle();
    expect(starsShown()).toBe(2);

    // A finger that isn't pressed previews nothing.
    await movePointer(xFor(5), "touch");
    expect(starsShown()).toBe(2);
    expect(ratingRequests(server)).toEqual([]);
  });

  it("steps by half a star on the arrow keys, clears on Home, Delete, and Backspace, and sets 5 stars on End, showing each at once", async () => {
    await openRated(2);
    ratingStars()!.focus();

    const steps: Array<[string, string]> = [
      ["ArrowRight", "2.5 stars"],
      ["ArrowUp", "3 stars"],
      ["ArrowLeft", "2.5 stars"],
      ["ArrowDown", "2 stars"],
      ["End", "5 stars"],
      ["ArrowRight", "5 stars"],
      ["Home", "Not rated"],
      ["ArrowLeft", "Not rated"],
      ["ArrowUp", "0.5 stars"],
      ["Delete", "Not rated"],
      ["End", "5 stars"],
      ["Backspace", "Not rated"]
    ];
    for (const [key, text] of steps) {
      await pressRatingKey(key);
      expect(sliderValue()[1]).toBe(text);
    }
  });

  it("sends the keys' rating once, when they pause or focus leaves the stars", async () => {
    const { page, server } = await openRated(1);
    ratingStars()!.focus();

    for (let i = 0; i < 6; i++) {
      await pressRatingKey("ArrowRight");
    }
    expect(sliderValue()).toEqual(["4", "4 stars"]);
    expect(ratingRequests(server)).toEqual([]);
    await wait(600);
    expect(ratingRequests(server)).toEqual([{ itemId: "item-video", rating: 4, clientId: page.clientId() }]);
    await waitFor(() => expect(popupsShown()).toEqual(["Rated 4 stars | holiday clip.mp4"]));

    await pressRatingKey("End");
    await pressRatingKey("ArrowLeft");
    ratingStars()!.blur();
    await settle();
    expect(ratingRequests(server).map((body) => (body as { rating: unknown }).rating)).toEqual([4, 4.5]);
    await wait(600);
    expect(ratingRequests(server)).toHaveLength(2);
  });

  it("sends nothing once the page closes, not even a rating the keys were waiting to send", async () => {
    const { page, server } = await openRated(2);
    ratingStars()!.focus();
    await pressRatingKey("ArrowRight");

    page.unmount();
    await wait(600);

    expect(ratingRequests(server)).toEqual([]);
  });

  it("sends nothing and pops up nothing for the rating the file already has", async () => {
    const { server } = await openRated(3);

    await tapStars(xFor(3), "mouse");
    await tapStars(xFor(3), "touch");
    ratingStars()!.focus();
    await pressRatingKey("ArrowRight");
    await pressRatingKey("ArrowLeft");
    await wait(600);

    expect(ratingRequests(server)).toEqual([]);
    expect(popupsShown()).toEqual([]);
    expect(sliderValue()).toEqual(["3", "3 stars"]);
  });

  it("sends a rating to the file it was set on as soon as another file plays", async () => {
    const { page, server } = await openRated(2, { items: [itemRow(VIDEO, { rating: 2 }), itemRow(OTHER_VIDEO)], picks: [VIDEO, OTHER_VIDEO] });
    ratingStars()!.focus();
    await pressRatingKey("ArrowRight");

    await playNext(OTHER_VIDEO);
    await waitFor(() => expect(ratingRequests(server)).toHaveLength(1));
    expect(ratingRequests(server)).toEqual([{ itemId: "item-video", rating: 2.5, clientId: page.clientId() }]);
    await waitFor(() => expect(popupsShown()).toEqual(["Rated 2.5 stars | holiday clip.mp4"]));
    // Sent when the next file started, before the tab read it, not once the keys' pause ran out.
    const otherReadAt = () => server.calls.findIndex((call) => call.path === "/api/library/item" && call.body?.id === "item-other");
    await waitFor(() => expect(otherReadAt()).toBeGreaterThan(-1));
    expect(otherReadAt()).toBeGreaterThan(server.calls.findIndex((call) => call.path === "/api/rating"));
  });

  it("puts the rating back when its request fails, saying why in the notice", async () => {
    let answer: (response: Response) => void = () => {};
    const { server } = await openRated(2, { reply: () => new Promise<Response>((resolve) => (answer = resolve)) });

    await tapStars(xFor(4), "touch");
    expect(sliderValue()).toEqual(["4", "4 stars"]);
    await waitFor(() => expect(ratingRequests(server)).toHaveLength(1));
    answer(status(500));
    await waitFor(() => expect(openNotices()).toEqual(["Rating update failed."]));
    expect(sliderValue()).toEqual(["2", "2 stars"]);
    fireEvent.click(document.querySelector("dialog.app-dialog .dialog-actions button")!);
    await settle();

    server.on("POST", "/api/rating", () => {
      throw new TypeError("Failed to fetch");
    });
    await tapStars(xFor(3), "mouse");
    await waitFor(() => expect(openNotices()).toEqual(["Rating update failed: Couldn't reach the server."]));
    expect(sliderValue()).toEqual(["2", "2 stars"]);
    expect(popupsShown()).toEqual([]);
    expect(server.logLines().some((line) => line.startsWith("status=Rating update failed (HTTP 500)."))).toBe(true);
  });

  it("shows another device's rating at once, and loads the tab again, as the Rated card shows", async () => {
    const { page, server, items } = await openRated(2);
    const statsLoads = () => server.requests("GET", "/api/library/stats").length;
    await waitFor(() => expect(cards()).toHaveLength(12));
    const loads = statsLoads();

    items.set("item-video", itemRow(VIDEO, { rating: 4.5 }));
    server.on("GET", "/api/library/stats", () => json({ ...STATS, global: { ...STATS.global, rated: 13 } }));
    emit(page, "itemRatingChanged", { itemId: "item-video", path: VIDEO.id, rating: 4.5, previousRating: 2, clientId: "another-client" });
    await settle();
    expect(sliderValue()).toEqual(["4.5", "4.5 stars"]);
    expect(statsLoads()).toBe(loads);

    await waitFor(() => expect(cards()).toContainEqual(["Rated", "13"]));
    expect(sliderValue()).toEqual(["4.5", "4.5 stars"]);
  });

  it("keeps a rating the keys set until it is sent, through another device's change", async () => {
    const { page, server } = await openRated(2);
    ratingStars()!.focus();
    await pressRatingKey("ArrowRight");

    emit(page, "itemRatingChanged", { itemId: "item-video", path: VIDEO.id, rating: 4, previousRating: 2, clientId: "another-client" });
    await settle();
    expect(sliderValue()).toEqual(["2.5", "2.5 stars"]);

    await waitFor(() => expect(ratingRequests(server)).toHaveLength(1));
    await settle();
    expect(sliderValue()).toEqual(["2.5", "2.5 stars"]);
  });

  it("keeps focus on the stars while the tab loads again", async () => {
    const { page, server } = await openRated(2);
    ratingStars()!.focus();
    const loads = server.requests("GET", "/api/library/stats").length;

    emit(page, "itemStateChanged", { itemId: "item-video", path: VIDEO.id, isFavorite: true, isBlacklisted: false });
    await waitFor(() => expect(server.requests("GET", "/api/library/stats")).toHaveLength(loads + 1));
    await settle();

    expect(document.activeElement).toBe(ratingStars());
  });

  it("keeps a touch that starts on the stars their own, so it never scrolls the tab", async () => {
    useStylesheet();
    await openRated(2);

    expect(currentStyle(ratingStars()!).touchAction).toBe("none");
    expect(currentStyle(ratingStars()!.closest(".stats-rating")!).touchAction).not.toBe("none");
  });
});
