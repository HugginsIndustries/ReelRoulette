// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { h, render as renderInto } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import { DOUBLE_TAP_MS } from "../../playback/mediaGestures";
import { HIDE_CONTROLS_KEY } from "../../playback/playerControls";
import { SEEK_INDICATOR_MS } from "../../playback/seekIndicator";
import { createAppServices, type AppServices } from "../../state/appServices";
import { App } from "../../ui/App";
import { FILE_NOT_IN_LIBRARY, LIBRARY_EMPTY } from "../serverReasons";
import {
  API_BASE_URL,
  CLEAR_EDGE_X,
  COMPATIBLE_VERSION,
  FakeServer,
  SSE_URL,
  IPHONE_USER_AGENT,
  closeNotices,
  json,
  mountPage,
  movePointer,
  openNotices,
  pageReady,
  popupsShown,
  pressStars,
  randomAnswer,
  flagAnswer,
  ratingAnswer,
  ratingRequests,
  releasePointer,
  resetPage,
  setViewport,
  settle,
  starsShown,
  status,
  stubStarLayout,
  tapStars,
  xFor,
  currentStyle,
  unauthorizedLogLine,
  stubCanvas,
  stubElementProperty,
  stubFullscreenApi,
  stubLayoutSize,
  stubTabHidden,
  stubReadOnlyVolume,
  stubWebAudio,
  tapPage,
  stylesheetText,
  useStylesheet,
  FakeWebAudio,
  type FakeGain,
  type MountedPage
} from "./pageHarness";

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

const SECOND_VIDEO = {
  id: "C:\\media\\sunset.mp4",
  itemId: "item-video-2",
  displayName: "sunset.mp4",
  mediaType: "video",
  durationSeconds: 30,
  mediaUrl: "/api/media/item-video-2?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const PHOTO_ITEM = {
  id: "C:\\media\\beach.jpg",
  itemId: "item-photo",
  displayName: "beach.jpg",
  mediaType: "photo",
  durationSeconds: null,
  mediaUrl: "/api/media/item-photo?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const VIDEO_URL = `${API_BASE_URL}/api/media/item-video?token=t`;
const SECOND_VIDEO_URL = `${API_BASE_URL}/api/media/item-video-2?token=t`;
const PHOTO_URL = `${API_BASE_URL}/api/media/item-photo?token=t`;
const EMPTY_STATE_TEXT = "Tap to play, or open the panel to choose a preset or filter.";

/** Answers random picks with these items in order, then keeps answering with the last one. */
function answerRandom(server: FakeServer, ...items: unknown[]): void {
  let next = 0;
  server.on("POST", "/api/random", () => randomAnswer(items[Math.min(next++, items.length - 1)]));
}

function serverPicking(...items: unknown[]): FakeServer {
  const server = new FakeServer().playsItems(...items);
  answerRandom(server, ...items);
  server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], tagCounts: [], itemCount: 0 }));
  server.on("GET", "/api/sources", () => json([]));
  return server;
}

/** Lets fetch replies and renders finish, with real or fake timers. */
async function flush(): Promise<void> {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
  } else {
    await settle();
  }
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await flush();
}

async function mount(server: FakeServer): Promise<MountedPage> {
  const page = mountPage({ server });
  await flush();
  return page;
}

/** Mounts the page and plays the first random pick. */
async function mountAndPlay(server: FakeServer): Promise<MountedPage> {
  const page = await mount(server);
  await click(emptyState());
  return page;
}

function video(): HTMLVideoElement {
  return document.getElementById("video") as HTMLVideoElement;
}

function photo(): HTMLImageElement {
  return screen.getByAltText("Photo") as HTMLImageElement;
}

function emptyState(): HTMLElement {
  return screen.getByText(EMPTY_STATE_TEXT);
}

function seekSlider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "Seek", hidden: true }) as HTMLInputElement;
}

/** The scrub bar while a photo shows, when it is the photo's timer. */
function photoTimerBar(): HTMLInputElement {
  return screen.getByRole("slider", { name: "Photo timer", hidden: true }) as HTMLInputElement;
}

function seekRow(): HTMLElement {
  return document.getElementById("seek-row") as HTMLElement;
}

/** The volume slider, at the end of the seek row. */
function volumeSlider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "Volume", hidden: true }) as HTMLInputElement;
}

function volumeWrap(): HTMLElement {
  return document.getElementById("volume-wrap") as HTMLElement;
}

function moveVolume(value: number): void {
  fireEvent.input(volumeSlider(), { target: { value: String(value) } });
}

function timeDisplay(): string {
  return document.getElementById("time-display")?.textContent ?? "";
}

function mediaArea(): HTMLElement {
  return document.getElementById("media-container") as HTMLElement;
}

function stage(): HTMLElement {
  return document.getElementById("fullscreen-stage") as HTMLElement;
}

function overlay(id: "library-overlay" | "filter-dialog" | "tag-editor"): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

type PanelTabName = "Library" | "Filter" | "Tags";

const PANEL_PAGES: Record<PanelTabName, string> = {
  Library: "panel-page-library",
  Filter: "panel-page-filter",
  Tags: "panel-page-tags"
};

function panel(): HTMLElement {
  return document.getElementById("panel") as HTMLElement;
}

/** Whether the panel is open on `tab`. */
function isShowing(tab: PanelTabName): boolean {
  return !panel().hidden && !(document.getElementById(PANEL_PAGES[tab]) as HTMLElement).hidden;
}

/** Opens the panel with the panel button, then shows `tab` with its tab in the panel's tab row if it opened on another. */
async function openPanel(tab: PanelTabName): Promise<void> {
  if (panel().hidden) {
    await click(button("Open panel"));
  }
  if (!isShowing(tab)) {
    const tabRow = panel().querySelector(".panel-tablist") as HTMLElement;
    await click(within(tabRow).getByRole("tab", { name: tab }));
  }
}

/** Closes the panel with its own Close, at the end of its tab row. */
async function closePanel(): Promise<void> {
  await click(document.getElementById("panel-close-btn") as HTMLElement);
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function iconOf(name: string): string {
  return button(name).textContent ?? "";
}

function isLit(name: string): boolean {
  return button(name).classList.contains("active");
}

/** The lines the page relayed for `text`, a message or a state with no message, whatever was playing. */
function relayedLines(server: FakeServer, text: string): string[] {
  return server.logLines().filter((line) => line.startsWith(`status=${text} hasCurrent=`));
}

/** The state the player's indicator shows, by its id, or null while it shows none. */
function indicatorState(): string | null {
  return document.getElementById("player-indicator")?.dataset.state ?? null;
}

function controlsShown(): boolean {
  return mediaArea().classList.contains("controls-visible");
}

/**
 * Sets Hide player controls to On click/tap before the page mounts, so a click or tap on the player hides the controls,
 * for tests that need them hidden.
 */
function hideControlsOnClick(): void {
  localStorage.setItem(`rr_device.${HIDE_CONTROLS_KEY}`, JSON.stringify("click"));
}

function isPseudoFullscreen(): boolean {
  return stage().classList.contains("fullscreen-pseudo");
}

function randomPicks(server: FakeServer): number {
  return server.requests("POST", "/api/random").length;
}

function playRecords(server: FakeServer): number {
  return server.requests("POST", "/api/record-playback").length;
}

/**
 * The plays the server counted: those the page recorded, and the plays a history step asked for, which the play route
 * counts itself. A request for a fresh media URL with `recordPlayback: false` counts none.
 */
function playsCounted(server: FakeServer): number {
  const routed = server.calls.filter((call) => call.method === "POST" && call.path.startsWith("/api/play/") && call.body?.recordPlayback !== false);
  return playRecords(server) + routed.length;
}

/** The popups showing, oldest first, as their text and second line. */
function popups(): Array<{ text: string; detail: string | null }> {
  return [...document.querySelectorAll<HTMLElement>("#toasts .toast:not(.is-leaving)")].map((toast) => ({
    text: toast.querySelector(".toast-text > div")?.textContent ?? "",
    detail: toast.querySelector(".toast-detail")?.textContent ?? null
  }));
}

/** The one-byte range requests the page sent to ask the server about a file whose media failed. */
function probes(server: FakeServer): string[] {
  return server.calls
    .filter((call) => call.method === "GET" && call.path.startsWith("/api/media/"))
    .map((call) => `${call.path} ${call.headers.get("Range")}`);
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    keys.push(storage.key(i) ?? "");
  }
  return keys.sort();
}

async function swipe(target: Element, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  fireEvent.touchStart(target, { touches: [{ clientX: from.x, clientY: from.y }] });
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: to.x, clientY: to.y }] });
  await flush();
}

function ratingButton(): HTMLButtonElement {
  return document.getElementById("rating-btn") as HTMLButtonElement;
}

function ratingBadge(): HTMLElement {
  return ratingButton().querySelector<HTMLElement>(".rating-badge")!;
}

function ratingPopover(): HTMLElement {
  return document.getElementById("rating-popover") as HTMLElement;
}

/** The popover's stars, which are there only while it is open. */
function popoverStars(): HTMLElement {
  const stars = ratingPopover().querySelector<HTMLElement>(".rating");
  if (!stars) {
    throw new Error("The rating's popover is closed.");
  }
  return stars;
}

/** The rating's star as it shows: its name, whether it is lit, and its badge's text while the badge shows. */
function starShows(): [string | null, boolean, string | null] {
  const badge = ratingBadge();
  return [ratingButton().getAttribute("aria-label"), ratingButton().classList.contains("active"), badge.hidden ? null : badge.textContent];
}

/** Presses the rating's star with a mouse: the press, then its click. */
async function pressStar(): Promise<void> {
  fireEvent.pointerDown(ratingButton(), { pointerType: "mouse", button: 0 });
  await click(ratingButton());
}

/** An item as the random pick and the play route give it with its rating. */
function rated<T extends object>(item: T, rating: number): T & { rating: number } {
  return { ...item, rating };
}

/** Unmounts what `mountWithServices` mounted. */
let unmountServices: (() => void) | null = null;

/**
 * Mounts the page with services the test holds, without connecting to the server, so a test sets the lasting states
 * on the store itself and nothing the connection does changes them.
 */
async function mountWithServices(server = new FakeServer()): Promise<AppServices> {
  vi.stubGlobal("fetch", server.fetch);
  stubWebAudio();
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  const services = createAppServices({ apiBaseUrl: API_BASE_URL, sseUrl: SSE_URL }, { reloadPage: () => {} });
  services.connection.start = () => {};
  renderInto(h(App, { services }), root);
  unmountServices = () => renderInto(null, root);
  await flush();
  return services;
}

beforeEach(() => {
  resetPage();
});

afterEach(() => {
  unmountServices?.();
  unmountServices = null;
});

/**
 * Fails a video that had played, and then the fresh media URL its recovery sets, running `between` after the first
 * failure. A source that fails never plays, though happy-dom's play() fires playing at once, so the element's play is
 * held until both have failed.
 */
async function failVideoAndItsFreshUrl(between?: () => void): Promise<void> {
  const element = video();
  element.play = async () => {};
  try {
    fireEvent.error(element);
    await flush();
    between?.();
    fireEvent.error(element);
    await flush();
  } finally {
    delete (element as unknown as { play?: unknown }).play;
  }
}

describe("random pick", () => {
  it("shows the empty state until something plays, and a click on it plays a random video", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    expect(emptyState().style.display).not.toBe("none");
    expect(video().style.display).toBe("none");
    expect(photo().style.display).toBe("none");
    expect(seekRow().style.display).toBe("");
    expect(seekSlider().disabled).toBe(true);
    expect(timeDisplay()).toBe("0:00 / 0:00");

    await click(emptyState());

    const pick = server.requests("POST", "/api/random")[0]!.body;
    expect(pick).toMatchObject({
      clientId: page.clientId(),
      includeVideos: true,
      includePhotos: true
    });
    expect(pick.presetId).toBeUndefined();
    expect(pick.filterState.favoritesMode).toBe("off");
    expect(video().src).toBe(VIDEO_URL);
    expect(video().style.display).toBe("block");
    expect(seekSlider().disabled).toBe(false);
    expect(emptyState().style.display).toBe("none");
    expect(photo().style.display).toBe("none");
    expect(video().paused).toBe(false);
    expect(server.requests("POST", "/api/record-playback").map((call) => call.body)).toEqual([
      { itemId: "item-video", clientId: page.clientId(), sessionId: page.sessionId() }
    ]);
    // Playing is the normal state, which shows nothing and only relays.
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Playing", VIDEO_ITEM, 1)));
  });

  it("relays the pick's steps to the server log without file names or media URLs", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          "playback=start attempt=1 hasCurrent=true mediaType=video",
          "playback=video-onplaying attempt=1 hasCurrent=true",
          "status=Playing hasCurrent=true attempt=1"
        ])
      )
    );
    expect(server.logLines().some((line) => line.includes("holiday") || line.includes("token") || line.includes("item-video"))).toBe(false);
    // A load quicker than half a second shows no Loading… on the indicator, so relays none.
    expect(server.logLines().some((line) => line.startsWith("status=Loading"))).toBe(false);
  });

  it("starts from the Play button and from a click on the media area when nothing is playing", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);

    await click(button("Play/Pause"));
    expect(randomPicks(server)).toBe(1);
    expect(video().src).toBe(VIDEO_URL);

    resetPage();
    const second = serverPicking(VIDEO_ITEM);
    await mount(second);
    await click(mediaArea());
    expect(randomPicks(second)).toBe(1);
    expect(video().src).toBe(VIDEO_URL);
  });

  it("plays a photo in place of the video, reports when it loads, and skips it once the server says it is missing", async () => {
    const server = serverPicking(PHOTO_ITEM, SECOND_VIDEO);
    server.on("POST", "/api/play/item-photo", () => json({ error: "Media not found", code: "play_media_missing" }, 404));
    await mountAndPlay(server);

    expect(photo().src).toBe(PHOTO_URL);
    expect(photo().style.display).toBe("block");
    expect(video().style.display).toBe("none");
    expect(emptyState().style.display).toBe("none");

    fireEvent.load(photo());
    await flush();
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Playing", PHOTO_ITEM, 1)));
    // The server answers the range request for the file 404, and its play route says the file is missing too, so the
    // random pick is skipped.
    fireEvent.error(photo());
    await flush();
    expect(probes(server)).toEqual(["/api/media/item-photo bytes=0-0"]);
    expect(server.requests("POST", "/api/play/item-photo").map((call) => call.body.recordPlayback)).toEqual([false]);
    expect(openNotices()).toEqual([]);
    expect(popups()).toEqual([{ text: "Skipped a missing file.", detail: "beach.jpg" }]);
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(SECOND_VIDEO_URL);
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          "playback=start attempt=1 hasCurrent=true mediaType=photo",
          "playback=photo-onload attempt=1 hasCurrent=true",
          "playback=photo-onerror attempt=1 hasCurrent=true",
          "playback=media-probe attempt=1 hasCurrent=true mediaType=photo statusCode=404 failure=missing",
          "playback=media-recheck-failed attempt=1 hasCurrent=true statusCode=404 code=play_media_missing",
          statusLogLine("Skipped a missing file.", PHOTO_ITEM, 1)
        ])
      )
    );
    // The popup's second line, the file name, isn't relayed.
    expect(server.logLines().some((line) => line.includes("beach") || line.includes("token"))).toBe(false);
  });

  it("says a video the server can't read couldn't load, and stops, once a fresh media URL fails too", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    server.on("GET", "/api/media/item-video", () => json({ error: "Media can't be read" }, 503));
    await mountAndPlay(server);

    // The video had played, so it first gets a fresh media URL, which fails too, before it plays.
    await failVideoAndItsFreshUrl(() => expect(openNotices()).toEqual([]));
    expect(openNotices()).toEqual(["This video couldn't load. The server may be waiting on a slow or disconnected drive or share."]);
    expect(probes(server)).toEqual(["/api/media/item-video bytes=0-0"]);
    expect(randomPicks(server)).toBe(1);
    expect(popups()).toEqual([]);
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          "playback=video-onerror attempt=1 hasCurrent=true",
          "playback=recover attempt=1 hasCurrent=true",
          "playback=media-probe attempt=1 hasCurrent=true mediaType=video statusCode=503 failure=unreadable",
          statusLogLine("This video couldn't load. The server may be waiting on a slow or disconnected drive or share.", VIDEO_ITEM, 1)
        ])
      )
    );
  });

  it("holds a photo's timer under Autoplay once it stops on a photo that couldn't load, so nothing moves on past it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const server = serverPicking(PHOTO_ITEM, SECOND_VIDEO);
    server.on("GET", "/api/media/item-photo", () => json({ error: "Media can't be read" }, 503));
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());

    fireEvent.error(photo());
    await flush();
    expect(openNotices()).toEqual(["This photo couldn't load. The server may be waiting on a slow or disconnected drive or share."]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(randomPicks(server)).toBe(1);
    expect(photo().style.display).toBe("block");
    expect(indicatorState()).toBeNull();
  });

  it("shows no eligible media, a refused pick, and a pick that cannot reach the server in the notice alone", async () => {
    const server = serverPicking(null);
    await mount(server);
    const failures: Array<[() => Response, string, string?]> = [
      [() => randomAnswer(null), "No eligible media for current filters."],
      [() => status(500), "Random selection failed.", "Random selection failed (HTTP 500)."],
      [() => json({ error: LIBRARY_EMPTY }, 503), `Random selection failed: ${LIBRARY_EMPTY}`, "Random selection failed (HTTP 503)."],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "Random selection failed: Couldn't reach the server."
      ],
      [
        () => new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
        "Random selection failed: The server sent an unexpected response.",
        "Random selection failed: The server sent an unexpected response (text/html)."
      ]
    ];
    for (const [answer, notice, logText = notice] of failures) {
      server.on("POST", "/api/random", answer);
      await click(emptyState());
      expect(openNotices()).toEqual([notice]);
      expect(indicatorState()).toBeNull();
      await waitFor(() => expect(server.logLines()).toContain(statusLogLine(logText, null, 0)));
      await closeNotices();
    }
    expect(emptyState().style.display).not.toBe("none");
    expect(playRecords(server)).toBe(0);
  });

  it("sends one pick at a time and gives up on one the server does not answer in 10 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/random", () => new Promise<Response>(() => {}));
    await mount(server);

    await click(emptyState());
    await click(button("Next"));
    await click(button("Play/Pause"));
    expect(randomPicks(server)).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(indicatorState()).toBe("loading");

    await vi.advanceTimersByTimeAsync(9_500);
    expect(openNotices()).toEqual(["No response from the server. Try again."]);
    expect(indicatorState()).toBeNull();
    expect(server.logLines()).toEqual(
      expect.arrayContaining([
        "playback=random-pick-timeout attempt=0 hasCurrent=false timeoutMs=10000",
        statusLogLine("No response from the server. Try again.", null, 0)
      ])
    );

    answerRandom(server, VIDEO_ITEM);
    await click(button("Next"));
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(VIDEO_URL);
  });
});

describe("transport", () => {
  it("plays and pauses the video and shows the matching icon", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    expect(iconOf("Play/Pause")).toBe("play_arrow");

    await click(emptyState());
    expect(iconOf("Play/Pause")).toBe("pause");

    await click(button("Play/Pause"));
    expect(video().paused).toBe(true);
    expect(iconOf("Play/Pause")).toBe("play_arrow");

    await click(button("Play/Pause"));
    expect(video().paused).toBe(false);
    expect(iconOf("Play/Pause")).toBe("pause");
    expect(randomPicks(server)).toBe(1);
  });

  it("picks at the end of history, and Previous and Next move through history without picking", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, PHOTO_ITEM);
    await mount(server);

    await click(button("Previous"));
    expect(randomPicks(server)).toBe(0);
    expect(emptyState().style.display).not.toBe("none");

    await click(emptyState());
    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);
    expect(playsCounted(server)).toBe(1);

    await click(button("Next"));
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(SECOND_VIDEO_URL);

    // A history step asks the play route for a fresh media URL, which counts its one play.
    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);
    expect(randomPicks(server)).toBe(2);
    expect(server.requests("POST", "/api/play/item-video")).toHaveLength(1);
    expect(playRecords(server)).toBe(2);
    expect(playsCounted(server)).toBe(3);

    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
    expect(randomPicks(server)).toBe(2);
    expect(server.requests("POST", "/api/play/item-video-2")).toHaveLength(1);
    expect(playsCounted(server)).toBe(4);

    await click(button("Next"));
    expect(randomPicks(server)).toBe(3);
    expect(photo().src).toBe(PHOTO_URL);
    expect(document.getElementById("now-playing-name")!.textContent).toBe("beach.jpg");
  });
});

describe("a file that can't play", () => {
  const MKV_ITEM = { ...SECOND_VIDEO, id: "C:\\media\\Holiday.MKV", itemId: "item-mkv", displayName: "Holiday.MKV", mediaUrl: "/api/media/item-mkv?token=t" };

  it("is skipped when Previous reaches it in the history, with a Skipped files popup naming it", async () => {
    const server = serverPicking(VIDEO_ITEM, MKV_ITEM, SECOND_VIDEO);
    server.on("GET", "/api/media/item-mkv", () => new Response("x", { status: 206 }));
    await mountAndPlay(server);
    await click(button("Next"));
    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);

    await click(button("Previous"));
    expect(video().src).toContain("item-mkv");
    // happy-dom plays any source, so the video reads as having played and first gets a fresh media URL, which fails too.
    await failVideoAndItsFreshUrl();

    expect(probes(server)).toEqual(["/api/media/item-mkv bytes=0-0"]);
    expect(popups()).toEqual([{ text: "Skipped a file this browser can't play.", detail: "Holiday.MKV" }]);
    expect(openNotices()).toEqual([]);
    expect(video().src).toBe(VIDEO_URL);
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Skipped a file this browser can't play.", MKV_ITEM, 4)));
    expect(server.logLines().some((line) => line.includes("Holiday") || line.includes("token") || line.includes("item-"))).toBe(false);
  });

  it("shows a file chosen from the library its message, saying its format isn't supported", async () => {
    setViewport({ width: 600, height: 800 });
    stubLayoutSize();
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/library/query", () =>
      json({
        items: [{ id: "item-mkv", fullPath: MKV_ITEM.id, fileName: "Holiday.MKV", mediaType: 0, tags: [], hasThumbnail: false }],
        totalCount: 1,
        searchBaselineCount: 1
      })
    );
    server.on("POST", "/api/play/item-mkv", () => json(MKV_ITEM));
    server.on("GET", "/api/media/item-mkv", () => new Response("x", { status: 200 }));
    mountPage({ server });
    await pageReady(server);
    await openPanel("Library");
    const tile = await waitFor(() => {
      const found = document.querySelector('.library-grid-tile[data-item-id="item-mkv"]');
      expect(found).not.toBeNull();
      return found!;
    });
    await click(tile);
    // happy-dom plays any source, so the video reads as having played and first gets a fresh media URL, which fails too.
    await failVideoAndItsFreshUrl();

    expect(openNotices()).toEqual(["This video's format (.mkv) isn't supported in this browser."]);
    expect(popups()).toEqual([]);
    expect(randomPicks(server)).toBe(0);
  });

  it("keeps a video playing from where it was when its media token is lost, as on a server restart, with no message", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const freshUrl = "/api/media/item-video?token=fresh";
    server.on("POST", "/api/play/item-video", () => json({ ...VIDEO_ITEM, mediaUrl: freshUrl }));
    await mountAndPlay(server);
    stubElementProperty(video(), "duration", 65);
    video().currentTime = 40;

    fireEvent.error(video());
    await flush();
    expect(video().src).toBe(`${API_BASE_URL}${freshUrl}`);
    video().currentTime = 0;
    fireEvent.loadedMetadata(video());
    await flush();

    expect(video().currentTime).toBe(40);
    expect(video().paused).toBe(false);
    expect(server.requests("POST", "/api/play/item-video").map((call) => call.body.recordPlayback)).toEqual([false]);
    expect(playsCounted(server)).toBe(1);
    expect(openNotices()).toEqual([]);
    expect(popups()).toEqual([]);
    expect(probes(server)).toEqual([]);
  });

  it("keeps it playing through a second server restart in the same video, once it has played again", async () => {
    const server = serverPicking(VIDEO_ITEM);
    let fresh = 0;
    server.on("POST", "/api/play/item-video", () => json({ ...VIDEO_ITEM, mediaUrl: `/api/media/item-video?token=fresh${++fresh}` }));
    await mountAndPlay(server);
    stubElementProperty(video(), "duration", 65);

    for (const [position, token] of [[20, "fresh1"], [50, "fresh2"]] as const) {
      video().currentTime = position;
      fireEvent.error(video());
      await flush();
      expect(video().src).toBe(`${API_BASE_URL}/api/media/item-video?token=${token}`);
      video().currentTime = 0;
      fireEvent.loadedMetadata(video());
      await flush();
      expect(video().currentTime).toBe(position);
      expect(video().paused).toBe(false);
    }

    expect(server.requests("POST", "/api/play/item-video").map((call) => call.body.recordPlayback)).toEqual([false, false]);
    expect(playsCounted(server)).toBe(1);
    expect(openNotices()).toEqual([]);
    expect(popups()).toEqual([]);
    expect(probes(server)).toEqual([]);
  });
});

describe("favorite and blacklist", () => {
  it("send the playing item's id and the device's client id, light their buttons, and clear each other", async () => {
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/favorite", flagAnswer);
    server.on("POST", "/api/blacklist", flagAnswer);
    const page = await mount(server);
    const clientId = page.clientId();
    expect(clientId).not.toBe("");

    await click(button("Favorite"));
    await click(button("Blacklist"));
    expect(server.requests("POST", "/api/favorite")).toHaveLength(0);
    expect(server.requests("POST", "/api/blacklist")).toHaveLength(0);

    await click(emptyState());
    await click(button("Favorite"));
    expect(server.requests("POST", "/api/favorite")[0]!.body).toEqual({ itemId: "item-video", isFavorite: true, clientId });
    expect(isLit("Favorite")).toBe(true);

    await click(button("Blacklist"));
    expect(server.requests("POST", "/api/blacklist")[0]!.body).toEqual({ itemId: "item-video", isBlacklisted: true, clientId });
    expect(isLit("Blacklist")).toBe(true);
    expect(isLit("Favorite")).toBe(false);

    await click(button("Favorite"));
    expect(server.requests("POST", "/api/favorite")[1]!.body).toEqual({ itemId: "item-video", isFavorite: true, clientId });
    expect(isLit("Favorite")).toBe(true);
    expect(isLit("Blacklist")).toBe(false);

    await click(button("Favorite"));
    expect(server.requests("POST", "/api/favorite")[2]!.body).toEqual({ itemId: "item-video", isFavorite: false, clientId });
    expect(isLit("Favorite")).toBe(false);

    await click(button("Blacklist"));
    await click(button("Blacklist"));
    expect(isLit("Blacklist")).toBe(false);
    // Each pops up as Your actions and relays its text, without the file name.
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining(
          ["Added to favorites", "Blacklisted", "Removed from favorites", "Removed from blacklist"].map((text) =>
            statusLogLine(text, VIDEO_ITEM, 1)
          )
        )
      )
    );
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
  });

  it("show the play answer's flags on Previous after a resync, for an item whose flags changed on the server", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    server.on("POST", "/api/favorite", flagAnswer);
    const page = await mountAndPlay(server);
    await click(button("Favorite"));
    await click(button("Next"));
    await waitFor(() => expect(video().src).toBe(SECOND_VIDEO_URL));

    // A change elsewhere that the server announced only with a resync: the first video is now blacklisted.
    page.stream().emit("resyncRequired", 3, { reason: "bulkItemStateChanged", lastEventId: 2, currentRevision: 3 });
    await flush();
    server.on("POST", "/api/play/item-video", () => json({ ...VIDEO_ITEM, isFavorite: false, isBlacklisted: true }));

    await click(button("Previous"));
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    expect([isLit("Favorite"), isLit("Blacklist")]).toEqual([false, true]);
  });

  it("show an update the server refuses in the notice, with its reason when it gives one, and leave the buttons as they were", async () => {
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/favorite", () => status(500));
    server.on("POST", "/api/blacklist", () => json({ error: FILE_NOT_IN_LIBRARY }, 404));
    await mountAndPlay(server);

    await click(button("Favorite"));
    expect(openNotices()).toEqual(["Favorite update failed."]);
    expect(isLit("Favorite")).toBe(false);
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Favorite update failed (HTTP 500).", VIDEO_ITEM, 1)));
    await closeNotices();

    await click(button("Blacklist"));
    expect(openNotices()).toEqual([`Blacklist update failed: ${FILE_NOT_IN_LIBRARY}`]);
    expect(isLit("Blacklist")).toBe(false);
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Blacklist update failed (HTTP 404).", VIDEO_ITEM, 1)));
    expect([...relayedLines(server, "Added to favorites"), ...relayedLines(server, "Blacklisted")]).toEqual([]);
  });

  it("show an update that couldn't reach the server in the notice, without an unhandled rejection", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const unreachable = () => {
      throw new TypeError("NetworkError when attempting to fetch resource.");
    };
    server.on("POST", "/api/favorite", unreachable);
    server.on("POST", "/api/blacklist", unreachable);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      await mountAndPlay(server);

      await click(button("Favorite"));
      expect(openNotices()).toEqual(["Favorite update failed: Couldn't reach the server."]);
      await closeNotices();
      await click(button("Blacklist"));
      expect(openNotices()).toEqual(["Blacklist update failed: Couldn't reach the server."]);
      expect([isLit("Favorite"), isLit("Blacklist")]).toEqual([false, false]);
      await settle();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("show only the pairing prompt for an update the server answers with 401, and log it", async () => {
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/favorite", () => status(401));
    server.on("POST", "/api/blacklist", () => status(401));
    await mountAndPlay(server);
    const prompt = screen.getByRole("button", { name: "Pair", hidden: true }).closest(".pair-section") as HTMLElement;
    expect(prompt.style.display).toBe("none");

    await click(button("Favorite"));
    await waitFor(() => expect(prompt.style.display).toBe("flex"));
    await click(button("Blacklist"));
    await settle();
    expect(openNotices()).toEqual([]);
    expect([isLit("Favorite"), isLit("Blacklist")]).toEqual([false, false]);
    expect([...relayedLines(server, "Added to favorites"), ...relayedLines(server, "Blacklisted")]).toEqual([]);
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          unauthorizedLogLine("POST /api/favorite", { id: VIDEO_ITEM.id }, 1),
          unauthorizedLogLine("POST /api/blacklist", { id: VIDEO_ITEM.id }, 1)
        ])
      )
    );
  });

  it("follow item-state events for the playing item, an item played again shows its latest state, and another device's change pops up", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    const page = await mountAndPlay(server);

    page.stream().emit("itemStateChanged", 2, { itemId: "item-video", path: VIDEO_ITEM.id, isFavorite: true, isBlacklisted: false });
    await flush();
    expect(isLit("Favorite")).toBe(true);

    await click(button("Next"));
    expect(isLit("Favorite")).toBe(false);

    page.stream().emit("itemStateChanged", 3, { itemId: "item-video", path: VIDEO_ITEM.id, isFavorite: false, isBlacklisted: true });
    await flush();
    expect(isLit("Blacklist")).toBe(false);

    // The server's play answer carries the state the event announced.
    server.on("POST", "/api/play/item-video", () => json({ ...VIDEO_ITEM, isBlacklisted: true }));
    await click(button("Previous"));
    expect(isLit("Blacklist")).toBe(true);
    expect(isLit("Favorite")).toBe(false);

    page.stream().emit("itemStateChanged", 4, {
      itemId: "item-video",
      path: VIDEO_ITEM.id,
      isFavorite: false,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: true
    });
    await flush();
    expect(isLit("Blacklist")).toBe(false);
    // Each relays its text, leaving the file name out.
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          statusLogLine("Added to favorites on another device", VIDEO_ITEM, 1),
          statusLogLine("Blacklisted on another device", SECOND_VIDEO, 2),
          statusLogLine("Removed from blacklist on another device", VIDEO_ITEM, 3)
        ])
      )
    );
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
  });

  /** One item's favorite and blacklist in a batch, with the ones before. */
  function batchItem(itemId: string, after: [boolean, boolean], before: [boolean, boolean]) {
    return { itemId, isFavorite: after[0], isBlacklisted: after[1], previousIsFavorite: before[0], previousIsBlacklisted: before[1] };
  }

  it("follow a batch's item states for the playing item and an item played again, and another device's batch pops up once", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    const page = await mountAndPlay(server);

    page.stream().emit("bulkItemStateChanged", 2, {
      flag: "favorite",
      value: true,
      count: 3,
      items: [batchItem("item-video", [true, false], [false, false]), batchItem("item-elsewhere", [true, false], [false, false])],
      clientId: "another-client"
    });
    await flush();
    expect(isLit("Favorite")).toBe(true);
    expect(popupsShown()).toEqual(["Added 3 items to favorites on another device"]);

    await click(button("Next"));
    page.stream().emit("bulkItemStateChanged", 3, {
      flag: "blacklist",
      value: true,
      count: 1234,
      items: [batchItem("item-video", [false, true], [true, false])],
      clientId: "another-client"
    });
    await flush();
    expect(isLit("Blacklist")).toBe(false);
    expect(popupsShown()).toEqual(["Blacklisted 1,234 items on another device"]);

    // The server's play answer carries the state the batch announced.
    server.on("POST", "/api/play/item-video", () => json({ ...VIDEO_ITEM, isBlacklisted: true }));
    await click(button("Previous"));
    expect(isLit("Blacklist")).toBe(true);
    expect(isLit("Favorite")).toBe(false);
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          statusLogLine("Added 3 items to favorites on another device", VIDEO_ITEM, 1),
          statusLogLine("Blacklisted 1,234 items on another device", SECOND_VIDEO, 2)
        ])
      )
    );
  });

  it("another device's batch says what it did to how many items, and this device's own batch pops up nothing", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const page = await mountAndPlay(server);

    page.stream().emit("bulkItemStateChanged", 2, {
      flag: "favorite",
      value: true,
      count: 4,
      items: [batchItem("item-video", [true, false], [false, false])],
      clientId: page.clientId()
    });
    await flush();
    // It still follows its own batch.
    expect(isLit("Favorite")).toBe(true);
    expect(popupsShown()).toEqual([]);

    const batches: Array<[{ flag: string; value: boolean; count: number }, string]> = [
      [{ flag: "favorite", value: false, count: 2 }, "Removed 2 items from favorites on another device"],
      [{ flag: "blacklist", value: false, count: 1 }, "Removed 1 item from the blacklist on another device"]
    ];
    let revision = 3;
    for (const [batch, text] of batches) {
      page.stream().emit("bulkItemStateChanged", revision++, { ...batch, items: [], clientId: "another-client" });
      await flush();
      expect(popupsShown()).toEqual([text]);
    }
    // A batch without a client id counts as another device's.
    page.stream().emit("bulkItemStateChanged", revision++, { flag: "favorite", value: true, count: 1, items: [] });
    await flush();
    expect(popupsShown()).toEqual(["Added 1 item to favorites on another device"]);
    expect(server.logLines().some((line) => line.includes("Added 4 items"))).toBe(false);
  });
});

describe("loop and autoplay", () => {
  it("Loop and Autoplay light their buttons, and Loop sets the video to loop", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);

    await click(button("Loop"));
    await click(button("Autoplay"));
    expect(isLit("Loop")).toBe(true);
    expect(isLit("Autoplay")).toBe(true);

    await click(emptyState());
    expect(video().loop).toBe(true);
    await click(button("Loop"));
    expect(video().loop).toBe(false);
    expect(isLit("Loop")).toBe(false);
    await click(button("Autoplay"));
    expect(isLit("Autoplay")).toBe(false);
  });

  it("Autoplay plays the next item when a video ends, unless Loop is on", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, PHOTO_ITEM);
    await mountAndPlay(server);

    fireEvent.ended(video());
    await flush();
    expect(randomPicks(server)).toBe(1);

    await click(button("Autoplay"));
    fireEvent.ended(video());
    await flush();
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(SECOND_VIDEO_URL);

    await click(button("Loop"));
    fireEvent.ended(video());
    await flush();
    expect(randomPicks(server)).toBe(2);
  });

  it("With Autoplay, a photo moves on after the photo duration", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());

    await vi.advanceTimersByTimeAsync(9_999);
    expect(randomPicks(server)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(VIDEO_URL);
    expect(photo().style.display).toBe("none");
  });

  it("Loop repeats a photo after Advance after, keeping its image shown without loading it or counting a play again, and turning it off stops the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(PHOTO_ITEM);
    await mountAndPlay(server);
    fireEvent.load(photo());
    await flush();
    expect(playRecords(server)).toBe(1);

    // The image is never cleared or set again, so it doesn't flicker.
    const sources: string[] = [];
    const image = photo();
    const setSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!.set!;
    Object.defineProperty(image, "src", {
      configurable: true,
      get: () => image.getAttribute("src") ?? "",
      set(value: string) {
        sources.push(value);
        setSource.call(image, value);
      }
    });
    await click(button("Loop"));
    for (let loop = 0; loop < 3; loop++) {
      await vi.advanceTimersByTimeAsync(10_000);
      expect([image.getAttribute("src"), image.style.display]).toEqual([PHOTO_URL, "block"]);
    }
    expect(sources).toEqual([]);
    expect(playRecords(server)).toBe(1);
    expect(randomPicks(server)).toBe(1);
    expect(indicatorState()).toBeNull();

    await click(button("Loop"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(playRecords(server)).toBe(1);
    expect(randomPicks(server)).toBe(1);
    delete (image as { src?: string }).src;
  });

  it("turning Autoplay off stops a photo's timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());

    await vi.advanceTimersByTimeAsync(5_000);
    await click(button("Autoplay"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(randomPicks(server)).toBe(1);
  });

  it("in Timer mode, advances a playing video after Advance after, and a pause holds the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    localStorage.setItem("rr_device.playback.autoplayMode", '"timer"');
    localStorage.setItem("rr_device.playback.advanceAfter", "4");
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());
    Object.defineProperty(video(), "duration", { configurable: true, value: 65 });
    fireEvent.loadedMetadata(video());
    fireEvent.playing(video());
    await flush();

    await vi.advanceTimersByTimeAsync(2_000);
    await click(button("Play/Pause"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(randomPicks(server)).toBe(1);
    await click(button("Play/Pause"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(SECOND_VIDEO_URL);
  });

  it("in Timer mode, with Loop holding autoplay, repeats a stretch that starts where a seek lands, shown faintly behind the scrub bar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    localStorage.setItem("rr_device.playback.autoplayMode", '"timer"');
    localStorage.setItem("rr_device.playback.advanceAfter", "10");
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(button("Loop"));
    await click(emptyState());
    Object.defineProperty(video(), "duration", { configurable: true, value: 120 });
    fireEvent.loadedMetadata(video());
    fireEvent.playing(video());
    await flush();
    const stretch = document.getElementById("seek-loop") as HTMLElement;
    expect(stretch.parentElement).toBe(seekSlider().parentElement);
    expect([stretch.hidden, stretch.style.getPropertyValue("--loop-from")]).toEqual([false, "0"]);

    fireEvent.input(seekSlider(), { target: { value: "60" } });
    await flush();
    expect([stretch.style.getPropertyValue("--loop-from"), stretch.style.getPropertyValue("--loop-to")]).toEqual(["0.5", String(70 / 120)]);
    video().currentTime = 70.2;
    fireEvent.timeUpdate(video());
    await flush();
    expect(video().currentTime).toBe(60);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(randomPicks(server)).toBe(1);
    expect(playRecords(server)).toBe(1);

    await click(button("Loop"));
    expect(stretch.hidden).toBe(true);
  });

  it("in Timer mode, starts a stretch that ends at the video's end over without relaying a line, and relays the user's own play after it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    localStorage.setItem("rr_device.playback.autoplayMode", '"timer"');
    localStorage.setItem("rr_device.playback.advanceAfter", "10");
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(button("Loop"));
    await click(emptyState());
    Object.defineProperty(video(), "duration", { configurable: true, value: 120 });
    fireEvent.loadedMetadata(video());
    fireEvent.playing(video());
    fireEvent.input(seekSlider(), { target: { value: "115" } });
    await flush();
    expect(video().loop).toBe(false);
    const lines = server.logLines().length;

    // The video reaches its end: the browser pauses it and fires ended, and the stretch plays again, firing play and
    // playing.
    for (let repeat = 0; repeat < 3; repeat++) {
      video().currentTime = 120;
      video().pause();
      fireEvent.ended(video());
      await flush();
      expect([video().currentTime, video().paused]).toEqual([115, false]);
    }
    expect(server.logLines().slice(lines)).toEqual([]);

    await click(button("Play/Pause"));
    await click(button("Play/Pause"));
    expect(server.logLines().slice(lines).filter((line) => line.startsWith("playback=video-onplaying "))).toHaveLength(1);
    expect(playRecords(server)).toBe(1);
  });

  it("ignores the hidden video's events while a photo shows", async () => {
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM);
    await mountAndPlay(server);
    await click(button("Autoplay"));
    await click(button("Next"));
    expect(photo().style.display).toBe("block");
    fireEvent.load(photo());
    await flush();

    fireEvent.ended(video());
    fireEvent.error(video());
    fireEvent.playing(video());
    await flush();
    expect(randomPicks(server)).toBe(2);
    expect(openNotices()).toEqual([]);
    expect(server.logLines().filter((line) => line.startsWith("playback=video-"))).toEqual([
      "playback=video-onplaying attempt=1 hasCurrent=true"
    ]);
  });
});

describe("mute", () => {
  it("is enabled at start and on a photo, shows whether sound is muted, and mutes this and later videos, a press on a photo applying to the next", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, PHOTO_ITEM);
    await mount(server);
    expect(button("Mute").disabled).toBe(false);
    expect(iconOf("Mute")).toBe("volume_up");

    await click(emptyState());
    expect(video().muted).toBe(false);
    await click(button("Mute"));
    expect(video().muted).toBe(true);
    expect(iconOf("Mute")).toBe("volume_off");
    expect(isLit("Mute")).toBe(true);

    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
    expect(video().muted).toBe(true);
    expect(iconOf("Mute")).toBe("volume_off");

    await click(button("Next"));
    expect(photo().style.display).toBe("block");
    expect(button("Mute").disabled).toBe(false);
    expect(iconOf("Mute")).toBe("volume_off");
    expect(isLit("Mute")).toBe(true);
    await click(button("Mute"));
    expect(iconOf("Mute")).toBe("volume_up");
    expect(isLit("Mute")).toBe(false);

    await click(button("Previous"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
    expect(video().muted).toBe(false);
    expect(iconOf("Mute")).toBe("volume_up");
    await click(button("Mute"));
    expect(video().muted).toBe(true);
    expect(iconOf("Mute")).toBe("volume_off");
  });

  it("pressed before anything plays, shows sound muted and mutes the first video", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);

    await click(button("Mute"));
    expect(button("Mute").disabled).toBe(false);
    expect(iconOf("Mute")).toBe("volume_off");
    expect(isLit("Mute")).toBe(true);

    await click(emptyState());
    expect(video().muted).toBe(true);
    expect(iconOf("Mute")).toBe("volume_off");
    expect(isLit("Mute")).toBe(true);
  });
});

describe("volume and Enhanced audio", () => {
  /** The levels the gain glided to, in order. */
  function glides(gain: FakeGain): number[] {
    return gain.calls.filter((call) => call[0] === "glide").map((call) => call[1]);
  }

  /** The gain is never set straight to a level while it plays: each change glides, with a short time constant. */
  function onlyGlides(gain: FakeGain): boolean {
    return gain.directSets === 0 && gain.calls.every((call) => call[0] === "set" ? call[1] === 0 : call[2] > 0 && call[2] <= 0.03);
  }

  /** Opens the panel's Settings tab and turns Enhanced audio off, or on. */
  async function clickEnhancedAudio(): Promise<void> {
    if (panel().hidden) {
      await click(button("Open panel"));
    }
    const tabRow = panel().querySelector(".panel-tablist") as HTMLElement;
    await click(within(tabRow).getByRole("tab", { name: "Settings" }));
    await click(within(panel()).getByRole("checkbox", { name: "Enhanced audio", hidden: true }));
  }

  it("has a volume slider from 0 to 100% at full volume until it moves, which sets the volume and sends no notification", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Playing", VIDEO_ITEM, 1)));
    const linesBefore = server.logLines().length;

    expect([volumeSlider().min, volumeSlider().max, volumeSlider().step, volumeSlider().value]).toEqual(["0", "100", "1", "100"]);
    expect(volumeSlider().title).toBe("Volume");
    expect(volumeWrap().hidden).toBe(false);
    // Before the gain stage starts, the sound plays directly, at the element's own volume.
    moveVolume(40);
    await flush();
    expect(volumeSlider().value).toBe("40");
    expect(video().volume).toBeCloseTo(0.4);
    expect(document.querySelectorAll("#toasts .toast")).toHaveLength(0);
    expect(server.logLines().slice(linesBefore)).toEqual([]);
  });

  it("starts the gain stage on a tap's pointerup, not its pointerdown, and a key starts it too", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    fireEvent.pointerDown(document.body, { pointerId: 1, button: 0, pointerType: "touch" });
    await flush();
    expect(page.webAudio.contexts).toHaveLength(0);

    await tapPage();
    expect(page.webAudio.contexts).toHaveLength(1);
    expect(page.webAudio.contexts[0]!.state).toBe("running");
    expect(page.webAudio.contexts[0]!.routed).toEqual([video()]);
    await waitFor(() => expect(server.logLines()).toContain("audio=gain-stage-started"));

    const keyed = mountPage({ server: serverPicking(VIDEO_ITEM) });
    await flush();
    fireEvent.keyDown(document.body, { key: "Tab" });
    await flush();
    expect(keyed.webAudio.contexts).toHaveLength(1);
  });

  it("through the gain stage, plays at the volume and with Mute by gliding the gain, the element at full volume and unmuted", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    await tapPage();
    await click(emptyState());
    const gain = page.webAudio.gain!;
    // Play starts from silence and fades in.
    expect(gain.calls.slice(0, 2)).toEqual([["set", 0], ["set", 0]]);
    expect(glides(gain)).toEqual([1]);
    expect([video().volume, video().muted]).toEqual([1, false]);

    moveVolume(50);
    await flush();
    expect(gain.level).toBe(0.5);
    await click(button("Mute"));
    expect(gain.level).toBe(0);
    expect([video().volume, video().muted]).toEqual([1, false]);
    await click(button("Mute"));
    expect(glides(gain)).toEqual([1, 0.5, 0, 0.5]);
    expect(onlyGlides(gain)).toBe(true);
  });

  it("fades the sound out on pause and pauses the video once it is silent, and fades it back in on play", async () => {
    useFakeClock();
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    await tapPage();
    await click(emptyState());
    const gain = page.webAudio.gain!;

    await click(button("Play/Pause"));
    // The button shows Play at once, while the sound fades out.
    expect(iconOf("Play/Pause")).toBe("play_arrow");
    expect(video().paused).toBe(false);
    expect(gain.level).toBe(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(video().paused).toBe(true);

    await click(button("Play/Pause"));
    expect(video().paused).toBe(false);
    expect(gain.calls.slice(-2)).toEqual([["set", 0], ["glide", 1, 0.015]]);

    // Play while the pause still fades out plays on, the sound gliding back.
    await click(button("Play/Pause"));
    await vi.advanceTimersByTimeAsync(30);
    await click(button("Play/Pause"));
    await vi.advanceTimersByTimeAsync(100);
    expect(video().paused).toBe(false);
    expect(iconOf("Play/Pause")).toBe("pause");
    expect(gain.level).toBe(1);
    expect(onlyGlides(gain)).toBe(true);
  });

  it("on a photo keeps the slider enabled, and the next video plays at the level set there", async () => {
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    const page = await mount(server);
    await tapPage();
    await click(emptyState());
    expect(photo().style.display).toBe("block");
    expect(volumeSlider().disabled).toBe(false);
    moveVolume(30);
    await flush();

    await click(button("Next"));
    expect(video().style.display).toBe("block");
    expect(page.webAudio.gain!.level).toBeCloseTo(0.3);
    expect(volumeSlider().value).toBe("30");
  });

  it("on iOS shows the slider from the start, and a volume set before the gain stage starts applies once it does", async () => {
    stubReadOnlyVolume();
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    expect(volumeWrap().hidden).toBe(false);
    moveVolume(60);
    await flush();
    expect(page.webAudio.contexts).toHaveLength(0);

    // A drag's pointerup starts it, as any tap's does.
    await tapPage();
    await click(emptyState());
    expect(volumeWrap().hidden).toBe(false);
    expect(page.webAudio.gain!.level).toBeCloseTo(0.6);
  });

  it("on iOS hides the slider while Enhanced audio is off, and keeps Mute", async () => {
    stubReadOnlyVolume();
    localStorage.setItem("rr_device.audio.enhanced", "false");
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    expect(volumeWrap().hidden).toBe(true);
    expect(button("Mute").disabled).toBe(false);

    // Directly, Mute is the element's own.
    await tapPage();
    await click(emptyState());
    expect(page.webAudio.contexts).toHaveLength(0);
    await click(button("Mute"));
    expect(video().muted).toBe(true);
  });

  it("turned off, hands a playing video to a new element at its position, whose sound plays directly", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    await tapPage();
    await click(emptyState());
    const routed = video();
    routed.currentTime = 12;
    moveVolume(70);
    await flush();

    await clickEnhancedAudio();
    const fresh = video();
    expect(fresh).not.toBe(routed);
    expect(routed.hasAttribute("src")).toBe(false);
    expect(routed.paused).toBe(true);
    expect([fresh.src, fresh.style.display, fresh.paused]).toEqual([VIDEO_URL, "block", false]);
    Object.defineProperty(fresh, "duration", { configurable: true, value: 65 });
    fireEvent.loadedMetadata(fresh);
    await flush();
    expect(fresh.currentTime).toBe(12);
    // Its sound plays directly, at the volume, and the gain stage is gone.
    expect([fresh.volume, fresh.muted]).toEqual([0.7, false]);
    expect(page.webAudio.contexts.map((context) => context.state)).toEqual(["closed"]);
    expect(localStorage.getItem("rr_device.audio.enhanced")).toBe("false");
    expect(openNotices()).toEqual([]);

    // Turned back on, the new element plays through a new gain stage.
    await clickEnhancedAudio();
    expect(page.webAudio.contexts).toHaveLength(2);
    expect(page.webAudio.contexts[1]!.routed).toEqual([fresh]);
    expect(video()).toBe(fresh);
  });

  it("turned off, keeps a paused video paused on the new element", async () => {
    useFakeClock();
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await tapPage();
    await click(emptyState());
    await click(button("Play/Pause"));
    await vi.advanceTimersByTimeAsync(60);
    video().currentTime = 8;

    await clickEnhancedAudio();
    expect(video().paused).toBe(true);
    expect(video().src).toBe(VIDEO_URL);
    expect(iconOf("Play/Pause")).toBe("play_arrow");
    Object.defineProperty(video(), "duration", { configurable: true, value: 65 });
    fireEvent.loadedMetadata(video());
    await flush();
    expect(video().currentTime).toBe(8);
  });

  it("says so when the gain stage can't start, once, and its Turn off Enhanced audio turns it off for this device", async () => {
    const webAudio = new FakeWebAudio();
    webAudio.unavailable = true;
    const server = serverPicking(VIDEO_ITEM);
    mountPage({ server, webAudio });
    await flush();

    // Its notice offers an action beside OK.
    const dialogMessages = () => [...document.querySelectorAll("dialog.app-dialog .dialog-message")].map((message) => message.textContent);
    await tapPage();
    expect(dialogMessages()).toEqual([
      "Audio processing couldn't start on this device. Turn off Enhanced audio to play sound directly."
    ]);
    const notice = document.querySelector("dialog.app-dialog") as HTMLElement;
    expect([...notice.querySelectorAll("button")].map((each) => each.textContent)).toEqual(["OK", "Turn off Enhanced audio"]);
    expect(document.activeElement?.textContent).toBe("OK");
    await waitFor(() => expect(server.logLines()).toContain("audio=gain-stage-failed error=Error"));

    await click(within(notice).getByRole("button", { name: "Turn off Enhanced audio" }));
    expect(dialogMessages()).toEqual([]);
    expect(localStorage.getItem("rr_device.audio.enhanced")).toBe("false");
    await tapPage();
    expect(dialogMessages()).toEqual([]);
    await click(emptyState());
    expect(video().paused).toBe(false);
  });
});

/** Turns the wheel over the player. False when the page wasn't allowed to scroll. */
function wheel(deltaY: number, deltaMode = 0): boolean {
  return fireEvent.wheel(mediaArea(), { deltaY, deltaMode });
}

/**
 * Two fingers land on the player 40 px apart, one after the other, move by each of `ups` (up is positive), and lift.
 * Returns whether each move was claimed from the browser.
 */
function dragTwoFingers(...ups: number[]): boolean[] {
  const fingers = (y: number) => [{ clientX: 120, clientY: y }, { clientX: 120, clientY: y + 40 }];
  let y = 300;
  fireEvent.touchStart(mediaArea(), { touches: fingers(y).slice(0, 1) });
  fireEvent.touchStart(mediaArea(), { touches: fingers(y) });
  const claimed = ups.map((up) => {
    y -= up;
    return !fireEvent.touchMove(mediaArea(), { touches: fingers(y) });
  });
  fireEvent.touchEnd(mediaArea(), { touches: fingers(y).slice(0, 1), changedTouches: fingers(y).slice(1) });
  fireEvent.touchEnd(mediaArea(), { touches: [], changedTouches: fingers(y).slice(0, 1) });
  return claimed;
}

/** Presses the volume slider, drags it through `values`, and lets it go. */
function slideVolume(...values: number[]): void {
  fireEvent.pointerDown(volumeSlider(), { pointerId: 1, button: 0 });
  values.forEach(moveVolume);
  fireEvent.pointerUp(document.body, { pointerId: 1, button: 0 });
}

/** Whether Mute is on, and the volume the slider shows. */
function sound(): string {
  return `${isLit("Mute") ? "muted" : "unmuted"} ${volumeSlider().value}`;
}

/** Turns Mute off, and returns the volume the slider then shows. */
async function unmute(): Promise<string> {
  if (isLit("Mute")) await click(button("Mute"));
  return volumeSlider().value;
}

function volumeIndicator(): HTMLElement {
  return document.getElementById("volume-indicator") as HTMLElement;
}

/** The volume indicator's icon and text while it shows, or null. */
function indicatorShows(): string | null {
  const box = volumeIndicator();
  return box.classList.contains("is-shown") ? `${box.querySelector(".material-symbol-icon")!.textContent} ${box.querySelector("#volume-indicator-text")!.textContent}` : null;
}

describe("volume gestures", () => {
  it("the scroll wheel over the player changes the volume a step per notch, adding up a trackpad's small deltas, never scrolls the page, and shows the controls, with no notification", async () => {
    hideControlsOnClick();
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Playing", VIDEO_ITEM, 1)));
    const linesBefore = server.logLines().length;
    moveVolume(50);
    await click(video());
    expect(controlsShown()).toBe(false);

    expect(wheel(-100)).toBe(false);
    await flush();
    expect(volumeSlider().value).toBe("55");
    expect(controlsShown()).toBe(true);
    wheel(3, 1);
    wheel(-30);
    wheel(-30);
    wheel(-30);
    await flush();
    expect(volumeSlider().value).toBe("50");
    wheel(-30);
    await flush();
    expect(volumeSlider().value).toBe("55");
    expect(document.querySelectorAll("#toasts .toast")).toHaveLength(0);
    expect(server.logLines().slice(linesBefore)).toEqual([]);
  });

  it("two fingers dragged up or down on the player change the volume a step per 30 px, claimed from the browser, and show the controls, with no notification, and a pinch never zooms", async () => {
    hideControlsOnClick();
    useStylesheet();
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Playing", VIDEO_ITEM, 1)));
    const linesBefore = server.logLines().length;
    moveVolume(50);
    await click(video());

    expect(dragTwoFingers(20, 20, -60, -30)).toEqual([true, true, true, true]);
    await flush();
    expect(volumeSlider().value).toBe("45");
    expect(controlsShown()).toBe(true);
    expect(currentStyle(mediaArea()).touchAction).toBe("none");
    expect(fireEvent(mediaArea(), new Event("gesturestart", { bubbles: true, cancelable: true }))).toBe(false);
    expect(document.querySelectorAll("#toasts .toast")).toHaveLength(0);
    expect(server.logLines().slice(linesBefore)).toEqual([]);
  });

  it("a cancelled touch ends a two-finger drag, so the next drag is a change of its own, counted from where it starts, and the next swipe still counts", async () => {
    await mountAndPlay(serverPicking(VIDEO_ITEM, SECOND_VIDEO));
    moveVolume(50);
    const cancelledDrag = () => {
      const fingers = (y: number) => [{ clientX: 120, clientY: y }, { clientX: 120, clientY: y + 40 }];
      fireEvent.touchStart(mediaArea(), { touches: fingers(600).slice(0, 1) });
      fireEvent.touchStart(mediaArea(), { touches: fingers(600) });
      fireEvent.touchMove(mediaArea(), { touches: fingers(570) });
      fireEvent.touchCancel(mediaArea(), { touches: [], changedTouches: fingers(570) });
    };
    cancelledDrag();
    await flush();
    expect(volumeSlider().value).toBe("55");

    // Starting 300 px higher, the next drag counts only its own eleven steps down, and reaching 0 mutes as its change.
    dragTwoFingers(...Array.from({ length: 11 }, () => -30));
    await flush();
    expect(sound()).toBe("muted 0");
    expect(await unmute()).toBe("55");

    cancelledDrag();
    await swipe(video(), { x: 300, y: 100 }, { x: 200, y: 110 });
    expect(video().src).toBe(SECOND_VIDEO_URL);
  });

  it("on a photo the wheel and a two-finger drag set the volume, with the indicator, never scrolling the page, and the next video plays at it", async () => {
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    const page = await mount(server);
    await tapPage();
    await click(emptyState());
    expect(photo().style.display).toBe("block");
    moveVolume(50);

    expect(wheel(-100)).toBe(false);
    await flush();
    expect(indicatorShows()).toBe("volume_up 55%");
    expect(dragTwoFingers(30)).toEqual([true]);
    await flush();
    expect(volumeSlider().value).toBe("60");
    expect(indicatorShows()).toBe("volume_up 60%");

    await click(button("Next"));
    expect(video().style.display).toBe("block");
    expect(page.webAudio.gain!.level).toBeCloseTo(0.6);
  });

  it("the volume indicator shows centered over the player, in white with a shadow and no background, outside the controls, for the wheel and a two-finger drag, while the controls are hidden too, not for the slider, and fades out 800 ms after the last change", async () => {
    hideControlsOnClick();
    useFakeClock();
    useStylesheet();
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    moveVolume(50);
    await flush();
    expect(indicatorShows()).toBe(null);
    expect(currentStyle(volumeIndicator()).opacity).toBe("0");

    wheel(-100);
    await flush();
    expect(indicatorShows()).toBe("volume_up 55%");
    const box = volumeIndicator();
    expect(box.parentElement).toBe(mediaArea());
    expect(document.getElementById("overlay-controls")!.contains(box)).toBe(false);
    await click(video());
    expect(controlsShown()).toBe(false);
    const style = currentStyle(box);
    expect([style.position, style.top, style.left, style.transform, style.opacity]).toEqual(["absolute", "50%", "50%", "translate(-50%, -50%)", "1"]);
    expect([style.backgroundColor, style.color, style.fontWeight, style.fontVariantNumeric, style.filter]).toEqual(["", "#fff", "600", "tabular-nums", "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8))"]);

    await vi.advanceTimersByTimeAsync(700);
    dragTwoFingers(30);
    await flush();
    expect(indicatorShows()).toBe("volume_up 60%");
    await vi.advanceTimersByTimeAsync(700);
    expect(indicatorShows()).toBe("volume_up 60%");
    await vi.advanceTimersByTimeAsync(100);
    expect(indicatorShows()).toBe(null);
    expect(currentStyle(box).opacity).toBe("0");
  });

  it("the volume indicator fades in over 120 ms and out over 250 ms, and not at all with reduced motion", async () => {
    useStylesheet();
    await mount(serverPicking(VIDEO_ITEM));
    const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
    // The rule whose selector list names the selector, as the volume and seek indicators share their look.
    const rule = (selector: string) => rules.find((candidate) => (candidate as CSSStyleRule).selectorText?.split(", ").includes(selector)) as CSSStyleRule | undefined;
    expect([rule(".volume-indicator")?.style.transition, rule(".volume-indicator.is-shown")?.style.transitionDuration]).toEqual(["opacity 0.25s", "0.12s"]);
    const reduced = rules
      .filter((candidate): candidate is CSSMediaRule => (candidate as CSSMediaRule).media?.mediaText.includes("prefers-reduced-motion"))
      .flatMap((candidate) => Array.from(candidate.cssRules) as CSSStyleRule[]);
    const reducedRule = (selector: string) => reduced.find((candidate) => candidate.selectorText?.split(", ").includes(selector));
    expect([reducedRule(".volume-indicator")?.style.transition, reducedRule(".volume-indicator.is-shown")?.style.transition]).toEqual(["none", "none"]);
  });

  it("on iOS the wheel and a two-finger drag work from the start, setting the volume the gain stage starts at", async () => {
    stubReadOnlyVolume();
    const page = await mount(serverPicking(VIDEO_ITEM));
    wheel(100);
    dragTwoFingers(-30);
    await flush();
    expect(volumeSlider().value).toBe("90");
    expect(page.webAudio.contexts).toHaveLength(0);

    await tapPage();
    await click(emptyState());
    expect(page.webAudio.gain!.level).toBeCloseTo(0.9);
  });

  it("on iOS with Enhanced audio off, where the slider hides, the wheel and a two-finger drag leave the volume alone, and still never scroll or zoom", async () => {
    stubReadOnlyVolume();
    localStorage.setItem("rr_device.audio.enhanced", "false");
    await mount(serverPicking(VIDEO_ITEM));
    expect(volumeWrap().hidden).toBe(true);
    expect(wheel(100)).toBe(false);
    expect(dragTwoFingers(-30)).toEqual([true]);
    await flush();
    expect(volumeSlider().value).toBe("100");
    expect(indicatorShows()).toBe(null);
  });
});

describe("the muted-volume rules", () => {
  it("Mute moves the slider to 0, still enabled, and unmuting brings the volume back; dragging the slider to 0 mutes, and unmuting brings back where the drag started", async () => {
    const page = await mount(serverPicking(VIDEO_ITEM));
    await tapPage();
    await click(emptyState());
    const gain = page.webAudio.gain!;
    moveVolume(60);
    await flush();
    await click(button("Mute"));
    expect(sound()).toBe("muted 0");
    expect(volumeSlider().disabled).toBe(false);
    expect(await unmute()).toBe("60");

    moveVolume(40);
    slideVolume(25, 10, 0);
    await flush();
    expect(sound()).toBe("muted 0");
    expect(iconOf("Mute")).toBe("volume_off");
    expect(gain.level).toBe(0);
    expect(await unmute()).toBe("40");
    expect(gain.level).toBeCloseTo(0.4);
  });

  it("raising the volume while muted, by the slider, the wheel, or a two-finger drag, unmutes and starts from 0, and lowering it while muted changes nothing", async () => {
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    const raisedWhileMuted = async (raise: () => unknown) => {
      moveVolume(60);
      await click(button("Mute"));
      raise();
      await flush();
      const raised = sound();
      await click(button("Mute"));
      return `${raised}, then ${await unmute()}`;
    };
    expect([
      await raisedWhileMuted(() => slideVolume(30)),
      await raisedWhileMuted(() => wheel(-100)),
      await raisedWhileMuted(() => dragTwoFingers(30))
    ]).toEqual(["unmuted 30, then 30", "unmuted 5, then 5", "unmuted 5, then 5"]);

    moveVolume(60);
    await click(button("Mute"));
    wheel(100);
    dragTwoFingers(-30);
    await flush();
    expect(sound()).toBe("muted 0");
    expect(indicatorShows()).toBe("volume_off Muted");
    expect(await unmute()).toBe("60");
  });

  it("a two-finger drag down to 0 mutes, and unmuting brings back where it started; a wheel notch down to 0 mutes, and unmuting brings back the volume before that notch, a slider drag before it having ended where it was let go", async () => {
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    moveVolume(15);
    dragTwoFingers(-30, -30, -30);
    await flush();
    expect(sound()).toBe("muted 0");
    expect(await unmute()).toBe("15");

    slideVolume(8);
    wheel(100);
    wheel(100);
    await flush();
    expect(sound()).toBe("muted 0");
    expect(await unmute()).toBe("3");
  });
});

describe("seek", () => {
  it("shows the time, moves the slider as the video plays, and seeks from the slider", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    expect(seekSlider().getAttribute("step")).toBe("any");
    fireEvent.input(seekSlider(), { target: { value: "50" } });
    expect(video().currentTime).toBe(0);
    expect(timeDisplay()).toBe("0:00 / 0:00");

    await click(emptyState());
    expect(timeDisplay()).toBe("0:00 / 0:00");
    Object.defineProperty(video(), "duration", { configurable: true, value: 125 });
    fireEvent.loadedMetadata(video());
    await flush();
    expect(seekSlider().max).toBe("125");
    expect(timeDisplay()).toBe("0:00 / 2:05");

    video().currentTime = 61.7;
    fireEvent.timeUpdate(video());
    await flush();
    expect(timeDisplay()).toBe("1:01 / 2:05");
    expect(seekSlider().value).toBe("61.7");

    fireEvent.input(seekSlider(), { target: { value: "90" } });
    expect(video().currentTime).toBe(90);
  });
});

/** Fakes the timers, the clock the photo timer reads, and the animation frames that move the bar. */
function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "requestAnimationFrame", "cancelAnimationFrame"] });
}

/** A phone's width, where the panel opens as the full-screen overlay. */
const PHONE_VIEWPORT = { width: 600, height: 800 };
const DESKTOP_VIEWPORT = { width: 1024, height: 768 };

async function resize(viewport: { width: number; height: number }): Promise<void> {
  setViewport(viewport);
  await flush();
}

describe("smooth scrub bar", () => {
  it("moves every animation frame while a video plays, between its time updates, and stops on pause", async () => {
    useFakeClock();
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    Object.defineProperty(video(), "duration", { configurable: true, value: 125 });
    fireEvent.loadedMetadata(video());
    await flush();

    video().currentTime = 10.4;
    await vi.advanceTimersByTimeAsync(16);
    expect([seekSlider().value, timeDisplay()]).toEqual(["10.4", "0:10 / 2:05"]);
    video().currentTime = 10.9;
    await vi.advanceTimersByTimeAsync(16);
    expect([seekSlider().value, timeDisplay()]).toEqual(["10.9", "0:10 / 2:05"]);

    await click(button("Play/Pause"));
    video().currentTime = 50;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seekSlider().value).toBe("10.9");
    await click(button("Play/Pause"));
    await vi.advanceTimersByTimeAsync(16);
    expect(seekSlider().value).toBe("50");
  });

  it("moves every animation frame while a photo's timer runs, and stops while it is held", async () => {
    useFakeClock();
    const server = serverPicking(PHOTO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());

    const readings: number[] = [];
    for (let frame = 0; frame < 5; frame++) {
      await vi.advanceTimersByTimeAsync(16);
      readings.push(Number(photoTimerBar().value));
    }
    expect(readings.every((value, index) => index === 0 || value > readings[index - 1]!)).toBe(true);
    expect(readings[4]).toBeLessThan(0.1);

    await click(button("Play/Pause"));
    const held = photoTimerBar().value;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(photoTimerBar().value).toBe(held);
  });
});

describe("Auto-Pause", () => {
  it("keeps playback going on every tab beside the player", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    for (const tab of ["Library", "Filter", "Tags"] as const) {
      await openPanel(tab);
      await waitFor(() => expect(isShowing(tab)).toBe(true));
      expect([tab, video().paused]).toEqual([tab, false]);
    }
    await closePanel();
    expect(video().paused).toBe(false);
    expect(video().src).toBe(VIDEO_URL);
  });

  it("pauses as the full-screen overlay on a phone, on every tab, and resumes on close", async () => {
    setViewport(PHONE_VIEWPORT);
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    for (const tab of ["Library", "Filter", "Tags"] as const) {
      await openPanel(tab);
      await waitFor(() => expect(isShowing(tab)).toBe(true));
      expect([tab, video().paused]).toEqual([tab, true]);
      expect(iconOf("Play/Pause")).toBe("play_arrow");
      await closePanel();
      expect([tab, video().paused]).toEqual([tab, false]);
    }
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          "playback=auto-pause attempt=1 hasCurrent=true mediaType=video",
          "playback=auto-resume attempt=1 hasCurrent=true mediaType=video"
        ])
      )
    );
  });

  it("pauses an open panel as it comes to cover the player, and resumes as it moves beside it", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    await openPanel("Tags");

    await resize(PHONE_VIEWPORT);
    expect(isShowing("Tags")).toBe(true);
    expect(video().paused).toBe(true);
    await resize(DESKTOP_VIEWPORT);
    expect(video().paused).toBe(false);
  });

  it("pauses for Auto Tag beside the player, and resumes as it closes", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    await openPanel("Tags");
    expect(video().paused).toBe(false);

    await click(button("Auto Tag"));
    expect(document.getElementById("autotag")).not.toBeNull();
    expect(video().paused).toBe(true);
    await click(document.getElementById("autotag-close") as HTMLElement);
    expect(document.getElementById("autotag")).toBeNull();
    expect(video().paused).toBe(false);
  });

  it("leaves a video the user paused paused, and playback as the user left it while the overlay was open", async () => {
    setViewport(PHONE_VIEWPORT);
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await click(button("Play/Pause"));
    await openPanel("Library");
    await closePanel();
    expect(video().paused).toBe(true);

    await click(button("Play/Pause"));
    await openPanel("Library");
    await click(button("Play/Pause"));
    expect(video().paused).toBe(false);
    await closePanel();
    expect(video().paused).toBe(false);

    await openPanel("Library");
    await click(button("Play/Pause"));
    await click(button("Play/Pause"));
    await closePanel();
    expect(video().paused).toBe(true);
  });

  it("holds a photo's timer as the overlay opens, and resumes it with the time it had left, without loading or recording it again", async () => {
    useFakeClock();
    setViewport(PHONE_VIEWPORT);
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());
    await vi.advanceTimersByTimeAsync(6_000);

    await openPanel("Library");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(randomPicks(server)).toBe(1);
    expect(timeDisplay()).toBe("0:06 / 0:10");

    await closePanel();
    expect(iconOf("Play/Pause")).toBe("pause");
    expect(photo().src).toBe(PHOTO_URL);
    expect(playRecords(server)).toBe(1);
    expect(server.logLines().filter((line) => line.startsWith("playback=start"))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(randomPicks(server)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(VIDEO_URL);
  });
});

describe("scrub bar on a photo", () => {
  it("stays in its place, and with Autoplay on and Loop off fills as the photo's timer runs", async () => {
    useFakeClock();
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());
    const row = seekRow();
    await click(button("Next"));
    expect(photo().style.display).toBe("block");

    expect(seekRow()).toBe(row);
    expect(row.style.display).toBe("");
    expect(photoTimerBar().parentElement!.parentElement).toBe(row);
    expect(photoTimerBar().disabled).toBe(false);
    expect([photoTimerBar().max, photoTimerBar().value, timeDisplay()]).toEqual(["10", "0", "0:00 / 0:10"]);
    expect(iconOf("Play/Pause")).toBe("pause");

    // The last animation frame before now, at most 16 ms ago, moved the bar.
    await vi.advanceTimersByTimeAsync(5_250);
    expect(Number(photoTimerBar().value)).toBeGreaterThan(5.23);
    expect(Number(photoTimerBar().value)).toBeLessThanOrEqual(5.25);
    expect(timeDisplay()).toBe("0:05 / 0:10");
  });

  it("Play/Pause holds and resumes the photo's timer with the time it had left, and dragging the bar moves it", async () => {
    useFakeClock();
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());
    await vi.advanceTimersByTimeAsync(5_000);

    await click(button("Play/Pause"));
    expect(iconOf("Play/Pause")).toBe("play_arrow");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(timeDisplay()).toBe("0:05 / 0:10");
    expect(randomPicks(server)).toBe(1);

    fireEvent.input(photoTimerBar(), { target: { value: "7" } });
    await flush();
    expect(timeDisplay()).toBe("0:07 / 0:10");
    await click(button("Play/Pause"));
    expect(iconOf("Play/Pause")).toBe("pause");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(randomPicks(server)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(randomPicks(server)).toBe(2);
    expect(playRecords(server)).toBe(2);
  });

  it("with Autoplay off or Loop on, disables Play and the bar with the time at 0:00 / 0:00; Loop keeps the time, Autoplay starts the full time, and off clears it", async () => {
    useFakeClock();
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    await mountAndPlay(server);
    const disabled = () => [button("Play/Pause").disabled, photoTimerBar().disabled, timeDisplay()];

    expect(disabled()).toEqual([true, true, "0:00 / 0:00"]);
    await click(button("Play/Pause"));
    expect(randomPicks(server)).toBe(1);

    await click(button("Autoplay"));
    expect(disabled()).toEqual([false, false, "0:00 / 0:10"]);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(timeDisplay()).toBe("0:05 / 0:10");

    await click(button("Loop"));
    expect(disabled()).toEqual([true, true, "0:00 / 0:00"]);
    expect(photoTimerBar().value).toBe("0");
    await click(button("Loop"));
    expect(disabled()).toEqual([false, false, "0:05 / 0:10"]);

    await click(button("Autoplay"));
    expect(disabled()).toEqual([true, true, "0:00 / 0:00"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(randomPicks(server)).toBe(1);
  });
});

function ambientLayer(): HTMLElement {
  return document.getElementById("ambient") as HTMLElement;
}

function ambientCanvas(): HTMLCanvasElement {
  return ambientLayer().querySelector("canvas") as HTMLCanvasElement;
}

/** Runs `check` in the dark and then the light theme, leaving the page's theme as it was. */
function inEachTheme(check: (theme: string) => void): void {
  const root = document.documentElement;
  const before = Array.from(root.classList).filter((name) => name.startsWith("theme-"));
  try {
    for (const theme of ["theme-dark", "theme-light"]) {
      root.classList.remove("theme-dark", "theme-light");
      root.classList.add(theme);
      check(theme);
    }
  } finally {
    root.classList.remove("theme-dark", "theme-light");
    root.classList.add(...before);
  }
}

describe("ambient mode", () => {
  /** Fakes the timers ambient mode samples by, and a picture for the video and the photo, which happy-dom never loads. */
  function sampling() {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    return stubCanvas();
  }

  function givePictures(): void {
    stubElementProperty(video(), "readyState", 4);
    stubElementProperty(photo(), "naturalWidth", 640);
  }

  it("glows behind a playing video, copying its picture once a second, and holds while it is paused or the tab is hidden", async () => {
    const canvases = sampling();
    const setHidden = stubTabHidden(false);
    await mount(serverPicking(VIDEO_ITEM));
    expect(ambientLayer().hidden).toBe(true);
    givePictures();
    await click(emptyState());
    expect(ambientLayer().hidden).toBe(false);
    expect(video().paused).toBe(false);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(canvases.copiesOf(video())).toBe(3);

    await click(button("Play/Pause"));
    expect(video().paused).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(canvases.copiesOf(video())).toBe(3);

    await click(button("Play/Pause"));
    setHidden(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(canvases.copiesOf(video())).toBe(3);

    setHidden(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(canvases.copiesOf(video())).toBe(4);
  });

  it("copies a photo once", async () => {
    const canvases = sampling();
    await mount(serverPicking(PHOTO_ITEM));
    givePictures();
    await click(emptyState());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(canvases.copiesOf(photo())).toBe(1);
    expect(ambientLayer().hidden).toBe(false);
  });

  it("hides its glow once the media fails, until the next item plays", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    server.on("GET", "/api/media/item-video", () => json({ error: "Media can't be read" }, 503));
    await mountAndPlay(server);
    expect(ambientLayer().hidden).toBe(false);
    // The video had played, so it first gets a fresh media URL, which fails too, before it plays.
    await failVideoAndItsFreshUrl(() => expect(ambientLayer().hidden).toBe(false));
    expect(ambientLayer().hidden).toBe(true);
    await closeNotices();
    await click(button("Next"));
    expect(ambientLayer().hidden).toBe(false);
  });

  it("off, leaves the space around the picture plain black in both themes, and copies nothing", async () => {
    useStylesheet();
    localStorage.setItem("rr_device.appearance.ambient", "false");
    const canvases = sampling();
    await mount(serverPicking(VIDEO_ITEM));
    givePictures();
    await click(emptyState());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ambientLayer().hidden).toBe(true);
    expect(canvases.copiesOf(video())).toBe(0);
    inEachTheme((theme) => expect([theme, currentStyle(mediaArea()).backgroundColor]).toEqual([theme, "#000"]));
  });

  it("sits behind the video and the photo, which are positioned to draw above it", async () => {
    useStylesheet();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    expect(mediaArea().firstElementChild).toBe(ambientLayer());
    expect(currentStyle(ambientLayer()).zIndex).toBe("0");
    expect([currentStyle(video()).position, currentStyle(photo()).position]).toEqual(["relative", "relative"]);
    expect([ambientCanvas().width, ambientCanvas().height]).toEqual([32, 18]);
  });

  it("blurs and dims its copy, at the light theme's own strength in the light theme", async () => {
    useStylesheet();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    const filters: string[] = [];
    inEachTheme(() => filters.push(currentStyle(ambientCanvas()).filter));
    expect(filters).toEqual(["blur(64px) brightness(0.5) saturate(1)", "blur(64px) brightness(0.75) saturate(1)"]);
  });
});

describe("the player's rounded corners", () => {
  /** The selectors of the stylesheet's rules, nested ones included, that give the player its corners. */
  function playerCornerRules(): string[] {
    const flatten = (rules: CSSRuleList): CSSRule[] =>
      Array.from(rules).flatMap((rule) => [rule, ...("cssRules" in rule ? flatten((rule as CSSGroupingRule).cssRules) : [])]);
    return Array.from(document.styleSheets)
      .flatMap((sheet) => flatten(sheet.cssRules))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.split(",").some((part) => part.trim().endsWith(".media-container")))
      .filter((rule) => rule.style.borderRadius || rule.style.clipPath)
      .map((rule) => rule.selectorText);
  }

  function corners(): string[] {
    return [currentStyle(mediaArea()).clipPath, currentStyle(mediaArea()).borderRadius];
  }

  it("are clipped by a rounded clip-path as well as overflow, so they stay rounded on iOS, and stay rounded in fullscreen", async () => {
    useStylesheet();
    await mount(serverPicking(VIDEO_ITEM));
    expect(corners()).toEqual(["inset(0 round 8px)", "8px"]);

    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(true);
    expect(corners()).toEqual(["inset(0 round 8px)", "8px"]);
    // happy-dom doesn't match the browser's fullscreen, so the stylesheet is read: only the player's own rule sets its
    // corners.
    expect(playerCornerRules()).toEqual([".media-container"]);
  });
});

describe("colors", () => {
  it("keep the player's time light in both themes, and checkboxes, radio buttons, and sliders orange", async () => {
    useStylesheet();
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    await openPanel("Filter");
    const filter = await waitFor(() => {
      const found = document.getElementById("panel-page-filter")!;
      expect(found.querySelector('input[type="checkbox"]')).not.toBeNull();
      expect(found.querySelector('input[type="radio"]')).not.toBeNull();
      return found;
    });
    const controls = [seekSlider(), filter.querySelector('input[type="checkbox"]')!, filter.querySelector('input[type="radio"]')!];
    const root = document.documentElement;

    try {
      for (const theme of ["theme-dark", "theme-light"]) {
        root.classList.remove("theme-dark", "theme-light");
        root.classList.add(theme);
        expect([theme, currentStyle(document.getElementById("time-display")!).color]).toEqual([theme, "#ffffff"]);
        expect(controls.map((control) => currentStyle(control).accentColor)).toEqual(["#ef7f22", "#ef7f22", "#ef7f22"]);
      }
    } finally {
      root.classList.remove("theme-dark", "theme-light");
    }
  });
});

describe("seek row", () => {
  it("sets the scrub bar, the time, Mute, and the volume slider the row's 12 px gap apart, with the time's digits all one width", async () => {
    useStylesheet();
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);
    const row = currentStyle(seekRow());
    const wrap = currentStyle(document.getElementById("seek-wrap")!);
    const bar = currentStyle(seekSlider());
    const time = currentStyle(document.getElementById("time-display")!);
    const volume = currentStyle(volumeSlider());

    expect([...seekRow().children].map((child) => child.id)).toEqual(["seek-wrap", "time-display", "mute-btn", "volume-wrap"]);
    expect([row.display, row.gap]).toEqual(["flex", "12px"]);
    // A range input's own margin, 2 px in browsers, would widen the gap, and so would its wrapper's.
    expect([bar.marginLeft, bar.marginRight, volume.marginLeft, volume.marginRight]).toEqual(["0px", "0px", "0px", "0px"]);
    expect([wrap.marginLeft, wrap.marginRight, wrap.paddingLeft, wrap.paddingRight].every((value) => value === "" || value === "0px")).toBe(true);
    // The time takes its own width, with no minimum or alignment adding space beside it.
    expect([time.minWidth, time.textAlign, time.fontVariantNumeric]).toEqual(["", "", "tabular-nums"]);
    // The volume slider is 84 px wide on every screen, and doesn't grow as the scrub bar does.
    expect([volume.width, volume.height, volume.flexGrow]).toEqual(["84px", "24px", "0"]);
  });

  it("keeps Mute's 44 px target without making the row taller than its sliders, and Mute is no longer in the transport row", async () => {
    useStylesheet();
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    const mute = currentStyle(button("Mute"));
    const controls = currentStyle(document.getElementById("overlay-controls")!);
    const px = (value: string) => parseFloat(value);

    expect([mute.width, mute.height]).toEqual(["44px", "44px"]);
    // Its box reaches into the gap above the row and the controls' padding below it.
    expect(px(mute.height) + px(mute.marginTop) + px(mute.marginBottom)).toBeLessThanOrEqual(px(currentStyle(seekSlider()).height));
    expect(-px(mute.marginTop)).toBeLessThanOrEqual(px(controls.gap) + 4);
    expect(-px(mute.marginBottom)).toBeLessThanOrEqual(px(controls.paddingBottom));
    expect(document.querySelector(".overlay-controls-transport #mute-btn")).toBeNull();
  });
});

describe("Random", () => {
  it("sits between Next and Loop, and from the middle of history picks a new item and adds it at the end, keeping the plays ahead", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, PHOTO_ITEM);
    const { store } = await mountWithServices(server);
    const transport = [...document.querySelectorAll(".overlay-controls-transport button")].map((control) => control.getAttribute("aria-label"));
    expect(transport).toEqual(["Previous", "Play/Pause", "Next", "Random", "Loop", "Autoplay", "Fullscreen"]);
    expect(iconOf("Random")).toBe("casino");
    expect(button("Random").title).toBe("Random");

    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    await click(button("Next"));
    await waitFor(() => expect(video().src).toBe(SECOND_VIDEO_URL));
    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);

    await click(button("Random"));
    await waitFor(() => expect(photo().src).toBe(PHOTO_URL));
    expect(randomPicks(server)).toBe(3);
    expect(store.history.value.map((entry) => entry.itemId)).toEqual(["item-video", "item-video-2", "item-photo"]);
    expect(store.historyIndex.value).toBe(2);
    await click(button("Previous"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
  });

  it("with Random behavior on Insert, from the middle of history puts the pick right after the playing item, keeping the plays ahead after it, while Next at the end still adds at the end", async () => {
    localStorage.setItem("rr_device.randomization.behavior", '"insert"');
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, PHOTO_ITEM);
    const { store } = await mountWithServices(server);

    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    await click(button("Next"));
    await waitFor(() => expect(video().src).toBe(SECOND_VIDEO_URL));
    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);

    await click(button("Random"));
    await waitFor(() => expect(photo().src).toBe(PHOTO_URL));
    expect(randomPicks(server)).toBe(3);
    expect(store.history.value.map((entry) => entry.itemId)).toEqual(["item-video", "item-photo", "item-video-2"]);
    expect(store.historyIndex.value).toBe(1);
    await click(button("Next"));
    await waitFor(() => expect(video().src).toBe(SECOND_VIDEO_URL));
    expect(randomPicks(server)).toBe(3);

    await click(button("Next"));
    await waitFor(() => expect(randomPicks(server)).toBe(4));
    expect(store.history.value.map((entry) => entry.itemId)).toEqual(["item-video", "item-photo", "item-video-2", "item-photo"]);
  });

  it("with nothing playing, picks as Play does", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await click(button("Random"));
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    expect(randomPicks(server)).toBe(1);
  });
});

describe("Hide player controls", () => {
  /** Lets `ms` pass on the fake clock. */
  async function pass(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  /** Lets the 3 seconds pass, after which the controls are hidden. */
  async function untilHidden(): Promise<void> {
    await pass(3000);
    expect(controlsShown()).toBe(false);
  }

  function moveMouse(pointerType = "mouse"): void {
    fireEvent.pointerMove(video(), { pointerType });
  }

  it("Timeout, the default, hides them 3 seconds after the last activity while something plays, and hidden they can't be pressed", async () => {
    useFakeClock();
    useStylesheet();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    expect(controlsShown()).toBe(true);
    expect(currentStyle(button("Play/Pause")).pointerEvents).toBe("auto");
    await pass(2900);
    expect(controlsShown()).toBe(true);
    await pass(100);
    expect(controlsShown()).toBe(false);
    for (const control of [button("Play/Pause"), button("Random"), seekSlider(), volumeSlider()]) {
      expect(currentStyle(control).pointerEvents).toBe("none");
    }

    moveMouse();
    await flush();
    expect(controlsShown()).toBe(true);
    expect(currentStyle(button("Play/Pause")).pointerEvents).toBe("auto");
  });

  it("moving the mouse, a tap or click on the player, a key press, the scroll wheel, and a two-finger drag show them and restart the countdown", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    await untilHidden();

    moveMouse();
    await pass(2000);
    moveMouse();
    await pass(2000);
    expect(controlsShown()).toBe(true);
    await pass(1000);
    expect(controlsShown()).toBe(false);

    // A tap shows them through the click that follows it, and a click never hides them.
    await swipe(video(), { x: 100, y: 100 }, { x: 102, y: 101 });
    await click(video());
    expect(controlsShown()).toBe(true);
    await untilHidden();
    await click(video());
    await click(video());
    expect(controlsShown()).toBe(true);
    await untilHidden();

    fireEvent.keyDown(document.body, { key: "x" });
    await flush();
    expect(controlsShown()).toBe(true);
    await untilHidden();
    // A key on a slider is, since a slider leaves the keys to the page, but a key typed in a field isn't.
    fireEvent.keyDown(volumeSlider(), { key: "ArrowUp" });
    await flush();
    expect(controlsShown()).toBe(true);
    await untilHidden();
    fireEvent.keyDown(document.getElementById("settings-advance-after")!, { key: "4" });
    await flush();
    expect(controlsShown()).toBe(false);

    wheel(-100);
    await flush();
    expect(controlsShown()).toBe(true);
    await untilHidden();
    dragTwoFingers(30);
    await flush();
    expect(controlsShown()).toBe(true);
    await untilHidden();
  });

  it("come back for a tap only through the click that follows it, not its touch or a touch moving over the player, so a tap where a hidden button sits only shows them", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    await untilHidden();

    // Chrome picks the click's target after the touch ends, so controls shown by then would take the click.
    fireEvent.pointerMove(video(), { pointerType: "touch" });
    await flush();
    expect(controlsShown()).toBe(false);
    await swipe(video(), { x: 100, y: 100 }, { x: 102, y: 101 });
    expect(controlsShown()).toBe(false);
    await click(video());
    expect(controlsShown()).toBe(true);
  });

  it("a press on a control restarts the countdown, as a tap on one does on the iPad, where it leaves no focus", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    moveMouse();
    await pass(2000);
    fireEvent.pointerDown(button("Loop"), { pointerType: "touch" });
    fireEvent.pointerUp(button("Loop"), { pointerType: "touch" });
    await click(button("Loop"));
    expect(document.activeElement).not.toBe(button("Loop"));
    await pass(2900);
    expect(controlsShown()).toBe(true);
    await pass(100);
    expect(controlsShown()).toBe(false);
  });

  it("stay while a mouse or pen pointer is over a control, though not a touch, and hide 3 seconds after it leaves", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));

    fireEvent.pointerOver(button("Next"), { pointerType: "mouse" });
    await pass(10000);
    expect(controlsShown()).toBe(true);
    // Moving on to another control is still over them.
    fireEvent.pointerOut(button("Next"), { pointerType: "mouse", relatedTarget: seekSlider() });
    fireEvent.pointerOver(seekSlider(), { pointerType: "mouse" });
    await pass(10000);
    expect(controlsShown()).toBe(true);
    fireEvent.pointerOut(seekSlider(), { pointerType: "mouse", relatedTarget: video() });
    await pass(2900);
    expect(controlsShown()).toBe(true);
    await pass(100);
    expect(controlsShown()).toBe(false);

    moveMouse("pen");
    fireEvent.pointerOver(button("Loop"), { pointerType: "pen" });
    await pass(10000);
    expect(controlsShown()).toBe(true);
    fireEvent.pointerOut(button("Loop"), { pointerType: "pen", relatedTarget: video() });
    await untilHidden();

    await swipe(video(), { x: 100, y: 100 }, { x: 102, y: 101 });
    fireEvent.pointerOver(button("Loop"), { pointerType: "touch" });
    await untilHidden();
  });

  it("stay while the scrub bar or the volume is dragged, and hide 3 seconds after it's let go", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));

    for (const bar of [seekSlider(), volumeSlider()]) {
      moveMouse();
      fireEvent.pointerDown(bar, { pointerType: "touch" });
      await pass(10000);
      expect(controlsShown()).toBe(true);
      fireEvent.pointerUp(document, { pointerType: "touch" });
      await pass(2900);
      expect(controlsShown()).toBe(true);
      await pass(100);
      expect(controlsShown()).toBe(false);
    }
  });

  it("stay while the bell's list is open, and hide 3 seconds after it closes", async () => {
    useFakeClock();
    const services = await mountWithServices(serverPicking(VIDEO_ITEM));
    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));

    services.notifications.openList();
    await pass(10000);
    expect(controlsShown()).toBe(true);
    services.notifications.closeList();
    await pass(2900);
    expect(controlsShown()).toBe(true);
    await pass(100);
    expect(controlsShown()).toBe(false);
  });

  it("show and hide the rating's star with them, and stay while its popover is open, the countdown starting again as it closes, and on click/tap, a click on the player closes it and still hides them", async () => {
    useFakeClock();
    useStylesheet();
    const services = await mountWithServices(serverPicking(VIDEO_ITEM));
    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    expect(currentStyle(ratingButton()).pointerEvents).toBe("auto");
    await untilHidden();
    expect(currentStyle(ratingButton()).pointerEvents).toBe("none");

    // Timeout.
    moveMouse();
    await pressStar();
    expect(ratingPopover().hidden).toBe(false);
    await pass(10000);
    expect(controlsShown()).toBe(true);
    expect(currentStyle(popoverStars()).pointerEvents).toBe("auto");
    services.playerRating.closePopover();
    await flush();
    await pass(2900);
    expect(controlsShown()).toBe(true);
    await pass(100);
    expect(controlsShown()).toBe(false);

    // On click/tap, the only thing that hides them is a click on the player, whose press closes the popover first.
    services.playerControls.setMode("click");
    await flush();
    await pressStar();
    expect(controlsShown()).toBe(true);
    fireEvent.pointerDown(video(), { pointerType: "mouse", button: 0 });
    await click(video());
    expect(ratingPopover().hidden).toBe(true);
    expect(controlsShown()).toBe(false);
  });

  it("with Keep visible while paused, a pause shows them and they stay until it plays again; without it, they hide while paused", async () => {
    useFakeClock();
    const services = await mountWithServices(serverPicking(VIDEO_ITEM));
    // Before anything plays, they stay.
    await pass(10000);
    expect(controlsShown()).toBe(true);
    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    await untilHidden();

    services.player.playOrPause();
    await flush();
    expect(video().paused).toBe(true);
    expect(controlsShown()).toBe(true);
    await pass(10000);
    expect(controlsShown()).toBe(true);
    services.player.playOrPause();
    await flush();
    await pass(2900);
    expect(controlsShown()).toBe(true);
    await pass(100);
    expect(controlsShown()).toBe(false);

    services.playerControls.setKeepWhilePaused(false);
    services.player.playOrPause();
    await flush();
    expect(video().paused).toBe(true);
    expect(controlsShown()).toBe(false);
    moveMouse();
    await untilHidden();
  });

  it("with Keep visible while paused, autoplay and a swipe moving to another item leave them hidden", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM, SECOND_VIDEO, VIDEO_ITEM));
    await click(button("Autoplay"));
    await untilHidden();

    // Autoplay moves on to a pick, and a swipe left picks again.
    fireEvent.ended(video());
    await flush();
    expect([video().src, controlsShown()]).toEqual([SECOND_VIDEO_URL, false]);
    await swipe(video(), { x: 300, y: 100 }, { x: 200, y: 110 });
    expect([video().src, controlsShown()]).toEqual([VIDEO_URL, false]);

    // A swipe right steps back through history, and autoplay steps forward through it.
    await swipe(video(), { x: 100, y: 100 }, { x: 250, y: 90 });
    expect([video().src, controlsShown()]).toEqual([SECOND_VIDEO_URL, false]);
    fireEvent.ended(video());
    await flush();
    expect([video().src, controlsShown()]).toEqual([VIDEO_URL, false]);
  });

  it("Never keeps them shown through time and clicks", async () => {
    localStorage.setItem(`rr_device.${HIDE_CONTROLS_KEY}`, JSON.stringify("never"));
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    await pass(60000);
    expect(controlsShown()).toBe(true);
    await click(video());
    await swipe(video(), { x: 100, y: 100 }, { x: 102, y: 101 });
    expect(controlsShown()).toBe(true);
  });
});

describe("controls and gestures, with Hide player controls on On click/tap", () => {
  beforeEach(() => {
    hideControlsOnClick();
  });

  it("a click on the media area hides and shows the controls once something plays, and clicks on the controls do not", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    expect(controlsShown()).toBe(true);

    await click(emptyState());
    expect(controlsShown()).toBe(true);

    await click(video());
    expect(controlsShown()).toBe(false);
    await click(video());
    expect(controlsShown()).toBe(true);

    await click(button("Loop"));
    await click(document.getElementById("overlay-controls") as HTMLElement);
    await click(seekSlider());
    expect(controlsShown()).toBe(true);
  });

  it("a swipe left plays the next item and a swipe right the previous one, and the click that follows a swipe is ignored", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    await mountAndPlay(server);

    await swipe(video(), { x: 300, y: 100 }, { x: 200, y: 110 });
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(SECOND_VIDEO_URL);
    await click(video());
    expect(controlsShown()).toBe(true);

    await swipe(video(), { x: 100, y: 100 }, { x: 250, y: 90 });
    expect(video().src).toBe(VIDEO_URL);
    expect(randomPicks(server)).toBe(2);
    await click(video());
    expect(controlsShown()).toBe(true);
    await click(video());
    expect(controlsShown()).toBe(false);
  });

  it("a mostly vertical drag does nothing", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    await mountAndPlay(server);

    await swipe(video(), { x: 300, y: 100 }, { x: 230, y: 300 });
    expect(randomPicks(server)).toBe(1);
    expect(controlsShown()).toBe(true);
  });

  it("a tap toggles the controls through the click that follows it, and its touch alone does nothing", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await swipe(video(), { x: 100, y: 100 }, { x: 105, y: 103 });
    expect(controlsShown()).toBe(true);
    await click(video());
    expect(controlsShown()).toBe(false);
    await swipe(video(), { x: 100, y: 100 }, { x: 105, y: 103 });
    expect(controlsShown()).toBe(false);
    await click(video());
    expect(controlsShown()).toBe(true);
  });

  it("a tap with nothing playing does nothing, and the click that follows picks", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);

    await swipe(emptyState(), { x: 100, y: 100 }, { x: 102, y: 101 });
    expect(controlsShown()).toBe(true);
    expect(randomPicks(server)).toBe(0);
    await click(emptyState());
    expect(randomPicks(server)).toBe(1);
  });

  it("touches on the controls neither swipe nor toggle the controls", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    await mountAndPlay(server);

    await swipe(button("Loop"), { x: 300, y: 100 }, { x: 100, y: 100 });
    await swipe(button("Loop"), { x: 100, y: 100 }, { x: 101, y: 100 });
    expect(randomPicks(server)).toBe(1);
    expect(video().src).toBe(VIDEO_URL);
    expect(controlsShown()).toBe(true);
  });

  it("the player shows no tap highlight, which Chrome on Android flashes over what a tap clicks, and its controls inherit that", () => {
    // happy-dom drops the property when it parses the stylesheet, so the test reads the player's rule as written.
    const rule = /\n\.media-container \{([^}]*)\}/.exec(stylesheetText())?.[1] ?? "";
    expect(rule).toContain("-webkit-tap-highlight-color: transparent;");
  });
});

describe("double-tap seeking and the seek indicator", () => {
  /** Gives the playing video its length, as its metadata does, lets it start, and gives the player a 400 px box. */
  async function loadVideo(seconds: number): Promise<void> {
    Object.defineProperty(video(), "duration", { configurable: true, value: seconds });
    fireEvent.loadedMetadata(video());
    fireEvent.playing(video());
    Object.defineProperty(mediaArea(), "getBoundingClientRect", { configurable: true, value: () => new DOMRect(0, 0, 400, 300) });
    await flush();
  }

  /** A tap `x` px across the player, whose halves split at 200 px: its touch, then the click that follows it. */
  async function tapAt(x: number): Promise<void> {
    fireEvent.touchStart(video(), { touches: [{ clientX: x, clientY: 150 }] });
    fireEvent.touchEnd(video(), { changedTouches: [{ clientX: x, clientY: 150 }] });
    await click(video());
  }

  /** The seek indicator's chevron and text, in their order, while it shows, or null. */
  function seekIndicatorShows(): string | null {
    const shown = document.querySelector(".seek-indicator.is-shown");
    return shown ? Array.from(shown.children, (part) => part.textContent).join(" ") : null;
  }

  it("a double-tap on the right or left half of a video seeks forward or back by the seek step, leaving hidden controls hidden, and a single tap shows them once 300 ms pass", async () => {
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    await loadVideo(120);
    await vi.advanceTimersByTimeAsync(3000);
    expect(controlsShown()).toBe(false);

    video().currentTime = 60;
    await tapAt(300);
    await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS - 1);
    await tapAt(300);
    expect([video().currentTime, controlsShown()]).toEqual([65, false]);
    await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS);
    await tapAt(100);
    await tapAt(100);
    await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS);
    expect([video().currentTime, controlsShown()]).toEqual([60, false]);

    await tapAt(100);
    await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS - 1);
    expect([video().currentTime, controlsShown()]).toEqual([60, false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(controlsShown()).toBe(true);
  });

  it("with On click/tap, a triple-tap seeks twice by the seek step setting, leaving shown controls shown, and a single tap hides them once 300 ms pass", async () => {
    hideControlsOnClick();
    localStorage.setItem("rr_device.player.seekStep", "10");
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    await loadVideo(120);
    video().currentTime = 60;

    await tapAt(300);
    await tapAt(300);
    await tapAt(300);
    await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS);
    expect([video().currentTime, controlsShown()]).toEqual([80, true]);

    await tapAt(300);
    expect(controlsShown()).toBe(true);
    await vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS);
    expect([video().currentTime, controlsShown()]).toEqual([80, false]);
  });

  it("a tap acts at once on a photo and on a video whose length isn't known", async () => {
    hideControlsOnClick();
    await mountAndPlay(serverPicking(VIDEO_ITEM, PHOTO_ITEM));
    await tapAt(100);
    expect(controlsShown()).toBe(false);
    await tapAt(100);
    expect([video().currentTime, controlsShown()]).toEqual([0, true]);

    await click(button("Next"));
    await waitFor(() => expect(photo().style.display).not.toBe("none"));
    await tapAt(100);
    expect(controlsShown()).toBe(false);
  });

  it("a double-tap starts Timer mode's repeating stretch where it lands", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    localStorage.setItem("rr_device.playback.autoplayMode", '"timer"');
    localStorage.setItem("rr_device.playback.advanceAfter", "10");
    await mount(serverPicking(VIDEO_ITEM));
    await click(button("Autoplay"));
    await click(button("Loop"));
    await click(emptyState());
    await loadVideo(120);
    const stretchFrom = () => Number(document.getElementById("seek-loop")!.style.getPropertyValue("--loop-from"));
    expect(stretchFrom()).toBe(0);

    fireEvent.input(seekSlider(), { target: { value: "65" } });
    await flush();
    expect(stretchFrom()).toBe(65 / 120);
    await tapAt(100);
    await tapAt(100);
    expect([video().currentTime, stretchFrom()]).toEqual([60, 0.5]);
  });

  it("the seek indicator shows '+ {n}' and › on the right and ‹ and '− {n}' on the left, outside the controls and while they're hidden, adds up, and fades out a second after the last seek, and the scrub bar doesn't show it", async () => {
    hideControlsOnClick();
    useFakeClock();
    await mountAndPlay(serverPicking(VIDEO_ITEM));
    await loadVideo(120);
    await click(video());
    expect([controlsShown(), seekIndicatorShows()]).toEqual([false, null]);

    video().currentTime = 60;
    await tapAt(300);
    await tapAt(300);
    await tapAt(300);
    expect([seekIndicatorShows(), controlsShown()]).toEqual(["+ 10 chevron_right", false]);
    const box = document.getElementById("seek-indicator-forward")!;
    expect(box.parentElement).toBe(mediaArea());
    expect(document.getElementById("overlay-controls")!.contains(box)).toBe(false);
    await vi.advanceTimersByTimeAsync(SEEK_INDICATOR_MS - 1);
    expect(seekIndicatorShows()).toBe("+ 10 chevron_right");
    await vi.advanceTimersByTimeAsync(1);
    expect(seekIndicatorShows()).toBe(null);

    await tapAt(100);
    await tapAt(100);
    expect(seekIndicatorShows()).toBe("chevron_left − 5");
    await vi.advanceTimersByTimeAsync(SEEK_INDICATOR_MS);
    fireEvent.input(seekSlider(), { target: { value: "30" } });
    await flush();
    expect([video().currentTime, seekIndicatorShows()]).toEqual([30, null]);
  });

  it("the seek indicator sits 24 px in from each side in white with a shadow, fades in over 120 ms as its chevron slides out and out over 250 ms, and not at all with reduced motion", async () => {
    useStylesheet();
    await mount(serverPicking(VIDEO_ITEM));
    const back = currentStyle(document.getElementById("seek-indicator-back")!);
    const forward = currentStyle(document.getElementById("seek-indicator-forward")!);
    expect([back.left, forward.right, back.top, back.transform, back.opacity]).toEqual(["24px", "24px", "50%", "translateY(-50%)", "0"]);
    expect([back.backgroundColor, back.color, back.fontWeight, back.fontVariantNumeric, back.filter]).toEqual(["", "#fff", "600", "tabular-nums", "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8))"]);

    const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
    // The rule whose selector list names the selector, as the volume and seek indicators share their look.
    const rule = (selector: string) => rules.find((candidate) => (candidate as CSSStyleRule).selectorText?.split(", ").includes(selector)) as CSSStyleRule | undefined;
    expect([rule(".seek-indicator")?.style.transition, rule(".seek-indicator.is-shown")?.style.transitionDuration]).toEqual(["opacity 0.25s", "0.12s"]);
    expect([rule(".seek-indicator.is-back.is-shown .material-symbol-icon")?.style.animation, rule(".seek-indicator.is-forward.is-shown .material-symbol-icon")?.style.animation]).toEqual([
      "seek-chevron-back 0.3s ease-out",
      "seek-chevron-forward 0.3s ease-out"
    ]);
    const slide = (name: string) => (rules.find((candidate) => (candidate as CSSKeyframesRule).name === name) as CSSKeyframesRule | undefined)?.cssRules[0] as CSSKeyframeRule | undefined;
    expect([slide("seek-chevron-back")?.style.transform, slide("seek-chevron-forward")?.style.transform]).toEqual(["translateX(10px)", "translateX(-10px)"]);
    const reduced = rules
      .filter((candidate): candidate is CSSMediaRule => (candidate as CSSMediaRule).media?.mediaText.includes("prefers-reduced-motion"))
      .flatMap((candidate) => Array.from(candidate.cssRules) as CSSStyleRule[]);
    const reducedRule = (selector: string) => reduced.find((candidate) => candidate.selectorText?.split(", ").includes(selector));
    expect([reducedRule(".seek-indicator")?.style.transition, reducedRule(".seek-indicator.is-shown")?.style.transition, reducedRule(".seek-indicator.is-shown .material-symbol-icon")?.style.animation]).toEqual(["none", "none", "none"]);
  });
});

describe("fullscreen", () => {
  it("asks the browser to show the stage in fullscreen, and a second press leaves it", async () => {
    const fullscreen = stubFullscreenApi();
    await mount(serverPicking(VIDEO_ITEM));

    await click(button("Fullscreen"));
    expect(fullscreen.requests).toEqual([stage()]);
    expect(isPseudoFullscreen()).toBe(false);

    await click(button("Fullscreen"));
    expect(fullscreen.exits()).toBe(1);
    await click(button("Fullscreen"));
    expect(fullscreen.requests).toHaveLength(2);
  });

  it("fills the page in its place when the browser has no Fullscreen API, and Escape or a second press leaves it", async () => {
    await mount(serverPicking(VIDEO_ITEM));

    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(true);
    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(false);

    await click(button("Fullscreen"));
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(isPseudoFullscreen()).toBe(false);
  });

  it("fills the page in its place when the browser refuses fullscreen", async () => {
    const fullscreen = stubFullscreenApi({ refuse: true });
    await mount(serverPicking(VIDEO_ITEM));

    await click(button("Fullscreen"));
    expect(fullscreen.requests).toEqual([stage()]);
    expect(isPseudoFullscreen()).toBe(true);
  });

  it("fills the page in its place on an iPhone even when the Fullscreen API exists", async () => {
    resetPage(IPHONE_USER_AGENT);
    const fullscreen = stubFullscreenApi();
    await mount(serverPicking(VIDEO_ITEM));

    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(true);
    expect(fullscreen.requests).toHaveLength(0);
  });

  it("Escape closes an open panel before it leaves the page-filling fullscreen", async () => {
    const page = mountPage({ server: serverPicking(VIDEO_ITEM) });
    await pageReady(page.server);
    await click(button("Fullscreen"));
    await openPanel("Library");
    expect(isShowing("Library")).toBe(true);
    expect(isPseudoFullscreen()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(panel().hidden).toBe(true);
    expect(isPseudoFullscreen()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(isPseudoFullscreen()).toBe(false);
    expect(page.root.contains(overlay("library-overlay"))).toBe(true);
  });

  it("shows the exit icon while the stage is in fullscreen or pseudo-fullscreen", async () => {
    stubFullscreenApi();
    await mount(serverPicking(VIDEO_ITEM));
    expect(iconOf("Fullscreen")).toBe("fullscreen");
    await click(button("Fullscreen"));
    expect(iconOf("Fullscreen")).toBe("fullscreen_exit");
    await click(button("Fullscreen"));
    expect(iconOf("Fullscreen")).toBe("fullscreen");

    resetPage(IPHONE_USER_AGENT);
    await mount(serverPicking(VIDEO_ITEM));
    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(true);
    expect(iconOf("Fullscreen")).toBe("fullscreen_exit");
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(iconOf("Fullscreen")).toBe("fullscreen");
  });

  it("keeps the overlays inside the fullscreen stage", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    for (const id of ["library-overlay", "filter-dialog", "tag-editor"] as const) {
      expect(stage().contains(overlay(id))).toBe(true);
    }
    expect(stage().contains(mediaArea())).toBe(true);
  });
});

describe("other screens", () => {
  it("a library tile plays without a second play record, closes the overlay, and joins history", async () => {
    setViewport({ width: 600, height: 800 });
    stubLayoutSize();
    const server = serverPicking(SECOND_VIDEO);
    server.on("POST", "/api/library/query", () =>
      json({
        items: [
          {
            id: "item-video",
            fullPath: VIDEO_ITEM.id,
            fileName: "holiday clip.mp4",
            mediaType: 1,
            durationSeconds: 65,
            tags: [],
            hasThumbnail: false,
            width: 1920,
            height: 1080
          }
        ],
        totalCount: 1,
        searchBaselineCount: 1
      })
    );
    server.on("POST", "/api/play/item-video", () => json(VIDEO_ITEM));
    const page = mountPage({ server });
    await pageReady(server);
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(1));

    await openPanel("Library");
    const tile = await waitFor(() => {
      const found = document.querySelector('.library-grid-tile[data-item-id="item-video"]');
      expect(found).not.toBeNull();
      return found!;
    });
    await click(tile);

    expect(server.requests("POST", "/api/play/item-video")[0]!.body).toEqual({
      clientId: page.clientId(),
      sessionId: page.sessionId()
    });
    expect(video().src).toBe(VIDEO_URL);
    expect(panel().hidden).toBe(true);
    expect(playRecords(server)).toBe(0);
    await waitFor(() => expect(server.logLines()).toContain("playback=start attempt=1 hasCurrent=true mediaType=video"));
    const lines = server.logLines();
    expect(lines.indexOf("playback=library-play-success attempt=0 hasCurrent=true")).toBeGreaterThan(-1);
    expect(lines.indexOf("playback=library-play-success attempt=0 hasCurrent=true")).toBeLessThan(
      lines.indexOf("playback=start attempt=1 hasCurrent=true mediaType=video")
    );

    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
    // Previous is a history step, whose play the play route counts.
    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);
    expect(server.requests("POST", "/api/play/item-video")).toHaveLength(2);
    expect(playRecords(server)).toBe(1);
    expect(playsCounted(server)).toBe(3);
  });
});

describe("Don't record plays on this device", () => {
  /** Keeps Don't record plays on this device as on or off before the page loads. */
  function keepDontRecordPlays(on: boolean): void {
    localStorage.setItem("rr_device.developer.dontRecordPlays", JSON.stringify(on));
  }

  function countsDisabled(): HTMLElement | null {
    return document.getElementById("counts-disabled");
  }

  for (const on of [false, true]) {
    it(`${on ? "records nothing" : "records each play"} for a random pick and a history step while it is ${on ? "on" : "off"}`, async () => {
      keepDontRecordPlays(on);
      const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
      await mount(server);

      await click(emptyState());
      await click(button("Next"));
      expect(randomPicks(server)).toBe(2);
      expect(playRecords(server)).toBe(on ? 0 : 2);

      // A history step asks the play route for a fresh media URL, which counts its play unless told not to.
      await click(button("Previous"));
      expect(video().src).toBe(VIDEO_URL);
      expect(server.requests("POST", "/api/play/item-video").map((call) => call.body.recordPlayback)).toEqual([on ? false : undefined]);
      expect(playsCounted(server)).toBe(on ? 0 : 3);
    });

    it(`${on ? "asks the play route not to count" : "counts"} a library tile's play while it is ${on ? "on" : "off"}`, async () => {
      keepDontRecordPlays(on);
      setViewport({ width: 600, height: 800 });
      stubLayoutSize();
      const server = serverPicking(SECOND_VIDEO);
      server.on("POST", "/api/library/query", () =>
        json({
          items: [
            {
              id: "item-video",
              fullPath: VIDEO_ITEM.id,
              fileName: "holiday clip.mp4",
              mediaType: 1,
              durationSeconds: 65,
              tags: [],
              hasThumbnail: false,
              width: 1920,
              height: 1080
            }
          ],
          totalCount: 1,
          searchBaselineCount: 1
        })
      );
      server.on("POST", "/api/play/item-video", () => json(VIDEO_ITEM));
      const page = mountPage({ server });
      await pageReady(server);
      await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(1));

      await openPanel("Library");
      const tile = await waitFor(() => {
        const found = document.querySelector('.library-grid-tile[data-item-id="item-video"]');
        expect(found).not.toBeNull();
        return found!;
      });
      await click(tile);

      expect(server.requests("POST", "/api/play/item-video").map((call) => call.body)).toEqual([
        { clientId: page.clientId(), sessionId: page.sessionId(), ...(on ? { recordPlayback: false } : {}) }
      ]);
      expect(video().src).toBe(VIDEO_URL);
      expect(playsCounted(server)).toBe(on ? 0 : 1);
    });
  }

  it("shows Counts disabled with its icon while it is on, through the controls hiding and in fullscreen", async () => {
    useFakeClock();
    keepDontRecordPlays(true);
    const server = serverPicking(VIDEO_ITEM);
    const page = await mountAndPlay(server);
    expect(mediaArea().contains(countsDisabled())).toBe(true);
    expect(countsDisabled()!.textContent).toBe("play_disabledCounts disabled");
    expect(countsDisabled()!.querySelector(".material-symbol-icon")!.textContent).toBe("play_disabled");
    expect(page.server.logLines()).toContain("developer=dont-record-plays-on-at-load");

    await vi.advanceTimersByTimeAsync(3000);
    expect(controlsShown()).toBe(false);
    expect(countsDisabled()).not.toBeNull();

    // Pseudo-fullscreen, where the browser has no Fullscreen API, and the browser's own fullscreen both show the stage.
    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(true);
    expect(stage().contains(countsDisabled())).toBe(true);
  });

  it("shows nothing while it is off, and follows the setting as it changes", async () => {
    const { store } = await mountWithServices();
    expect(countsDisabled()).toBeNull();

    store.setDontRecordPlays(true);
    await flush();
    expect(countsDisabled()).not.toBeNull();

    store.setDontRecordPlays(false);
    await flush();
    expect(countsDisabled()).toBeNull();
  });

  it("sits under the bell, below the indicator on a narrow player, in the developer style, and under the popups", async () => {
    useStylesheet();
    keepDontRecordPlays(true);
    await mountWithServices();

    const pill = currentStyle(countsDisabled()!);
    expect([pill.position, pill.top, pill.left, pill.pointerEvents]).toEqual(["absolute", "64px", "12px", "none"]);
    const root = currentStyle(document.documentElement);
    expect(pill.borderStyle).toBe("dashed");
    expect(pill.backgroundColor).toBe(root.getPropertyValue("--dev-bg").trim());
    expect(currentStyle(countsDisabled()!.querySelector(".material-symbol-icon")!).color).toBe(root.getPropertyValue("--dev").trim());
    // The player clips to its rounded corners, which makes it its own stacking context, so the pill's z-index counts only
    // inside it, and the popups beside it, at 1200, cover it.
    expect(currentStyle(mediaArea()).clipPath).toBe("inset(0 round 8px)");
    const popups = document.getElementById("toasts")!;
    expect(mediaArea().contains(popups)).toBe(false);
    expect(popups.parentElement).toBe(mediaArea().parentElement);
    expect(currentStyle(popups).zIndex).toBe("1200");

    stubLayoutSize(599);
    setViewport({ width: 1000, height: 768 });
    await flush();
    expect(stage().querySelector("main.player-col")!.classList.contains("is-narrow")).toBe(true);
    expect(currentStyle(countsDisabled()!).top).toBe("108px");
  });
});

describe("page structure", () => {
  it("keeps the same video and photo elements while switching media and opening and closing each panel tab", async () => {
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM, SECOND_VIDEO);
    await mount(server);
    const videoNode = video();
    const photoNode = photo();

    await click(emptyState());
    await click(button("Next"));
    expect(photo().style.display).toBe("block");
    await click(button("Next"));
    expect(video().style.display).toBe("block");

    await openPanel("Library");
    await closePanel();
    await openPanel("Filter");
    await waitFor(() => expect(isShowing("Filter")).toBe(true));
    await closePanel();
    await openPanel("Tags");
    await closePanel();

    expect(video()).toBe(videoNode);
    expect(photo()).toBe(photoNode);
    expect(videoNode.isConnected).toBe(true);
    expect(photoNode.isConnected).toBe(true);
  });

  it("adds and removes no elements in the stage or the media area while media, controls, and fullscreen change", async () => {
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM, SECOND_VIDEO);
    await mountAndPlay(server);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    for (const target of [stage(), stage().querySelector("main") as HTMLElement, mediaArea()]) {
      observer.observe(target, { childList: true });
    }

    await click(button("Next"));
    await click(button("Next"));
    await click(video());
    await click(video());
    await click(button("Fullscreen"));
    await click(button("Fullscreen"));
    await click(button("Mute"));
    await click(button("Loop"));
    await openPanel("Library");
    await closePanel();

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records).toHaveLength(0);
  });

  it("adds no browser storage keys but its buttons' state on this device", async () => {
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM);
    server.on("POST", "/api/favorite", flagAnswer);
    await mountAndPlay(server);

    await click(button("Mute"));
    await click(button("Loop"));
    await click(button("Autoplay"));
    await click(button("Favorite"));
    await click(button("Fullscreen"));
    await click(button("Next"));
    await click(button("Previous"));

    expect(storageKeys(localStorage)).toEqual(["rr_clientId", "rr_device.player.autoplay", "rr_device.player.loop", "rr_device.player.muted"]);
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId"]);
  });
});

describe("the player's indicator", () => {
  function indicatorBox(): HTMLElement {
    const box = document.getElementById("player-indicator");
    if (!box) {
      throw new Error("The indicator shows no state.");
    }
    return box;
  }

  function indicatorIcon(): HTMLElement {
    return indicatorBox().querySelector<HTMLElement>(".material-symbol-icon")!;
  }

  function indicatorText(): HTMLElement {
    return indicatorBox().querySelector<HTMLElement>(".player-indicator-text")!;
  }

  it("shows the state's box in the media area only while a state shows, with its icon and its text", async () => {
    const { store } = await mountWithServices();
    expect(document.getElementById("player-indicator")).toBeNull();

    store.reconnecting.value = true;
    await flush();
    expect(mediaArea().contains(indicatorBox())).toBe(true);
    expect(indicatorState()).toBe("reconnecting");
    expect(indicatorIcon().textContent).toBe("sync");
    expect(indicatorIcon().classList.contains("spins")).toBe(true);
    expect(indicatorText().textContent).toBe("Reconnecting…");
    expect(indicatorBox().textContent).toBe("syncReconnecting…");

    store.reconnecting.value = false;
    await flush();
    expect(document.getElementById("player-indicator")).toBeNull();
  });

  it("shows the first active lasting state in the precedence order, alone and together, so it never alternates", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { store } = await mountWithServices();
    store.refreshProgress.value = { stage: "Scanning durations", percent: 42 };
    store.loading.hold("pick");
    await vi.advanceTimersByTimeAsync(500);
    store.libraryState.value = "missing";
    store.compatibilityBlocked.value = true;
    store.reconnecting.value = true;
    await flush();

    const seen: Array<[string | null, string, boolean, boolean, boolean]> = [];
    const note = () => {
      const box = indicatorBox();
      seen.push([
        indicatorState(),
        indicatorText().textContent ?? "",
        box.classList.contains("is-warning"),
        indicatorIcon().classList.contains("spins"),
        box.classList.contains("follows-controls")
      ]);
    };
    note();
    store.reconnecting.value = false;
    await flush();
    note();
    store.compatibilityBlocked.value = false;
    await flush();
    note();
    store.libraryState.value = "ready";
    await flush();
    note();
    store.loading.release("pick");
    await flush();
    note();

    expect(seen).toEqual([
      ["reconnecting", "Reconnecting…", false, true, false],
      ["incompatible", "Server not compatible", true, false, false],
      ["nolibrary", "Running without a library", true, false, false],
      ["loading", "Loading…", false, true, false],
      ["refresh", "Library refresh: Scanning durations", false, true, true]
    ]);

    // Each alone.
    store.refreshProgress.value = null;
    for (const [set, clear, id] of [
      [() => (store.reconnecting.value = true), () => (store.reconnecting.value = false), "reconnecting"],
      [() => (store.compatibilityBlocked.value = true), () => (store.compatibilityBlocked.value = false), "incompatible"],
      [() => (store.libraryState.value = "damaged"), () => (store.libraryState.value = "ready"), "nolibrary"]
    ] as const) {
      set();
      await flush();
      expect(indicatorState()).toBe(id);
      clear();
      await flush();
      expect(indicatorState()).toBeNull();
    }
  });

  it("shows a refresh's percentage after the text that ends in an ellipsis, outside it", async () => {
    const { store } = await mountWithServices();
    store.refreshProgress.value = { stage: "Generating thumbnails", percent: 7 };
    await flush();

    const box = indicatorBox();
    expect(box.textContent).toBe("autorenewLibrary refresh: Generating thumbnails (7%)");
    expect(indicatorText().textContent).toBe("Library refresh: Generating thumbnails");
    const percent = Array.from(box.querySelectorAll("span")).find((span) => span.textContent === "(7%)")!;
    expect(indicatorText().contains(percent)).toBe(false);
  });

  it("shows nothing while the server asks for pairing, whose prompt is the thing to act on", async () => {
    const { store } = await mountWithServices();
    store.reconnecting.value = true;
    store.pairingRequired.value = true;
    await flush();
    expect(indicatorState()).toBeNull();

    store.pairingRequired.value = false;
    await flush();
    expect(indicatorState()).toBe("reconnecting");
  });

  it("shows a refresh only while the player's controls show, and other states whether they show or not", async () => {
    hideControlsOnClick();
    useStylesheet();
    const { store } = await mountWithServices(serverPicking(VIDEO_ITEM));
    await click(emptyState());
    store.refreshProgress.value = { stage: "Refreshing sources", percent: 3 };
    await flush();
    // happy-dom reports no opacity where no rule sets one, which is fully shown.
    expect(currentStyle(indicatorBox()).opacity).not.toBe("0");

    await click(video());
    expect(controlsShown()).toBe(false);
    expect(currentStyle(indicatorBox()).opacity).toBe("0");
    await click(video());
    expect(controlsShown()).toBe(true);
    expect(currentStyle(indicatorBox()).opacity).not.toBe("0");

    await click(video());
    store.reconnecting.value = true;
    await flush();
    expect(controlsShown()).toBe(false);
    expect(indicatorState()).toBe("reconnecting");
    expect(currentStyle(indicatorBox()).opacity).not.toBe("0");
  });

  it("sits at the player's top center, clear of the corner buttons on both sides, a long state ending in an ellipsis", async () => {
    useStylesheet();
    const { store } = await mountWithServices();
    store.refreshProgress.value = { stage: "Fingerprinting files", percent: 50 };
    await flush();

    const box = currentStyle(indicatorBox());
    expect([box.position, box.top, box.left, box.transform]).toEqual(["absolute", "14px", "50%", "translateX(-50%)"]);
    // The corner buttons take the last 212 px at the right, so the indicator leaves that much on both sides.
    expect(box.maxWidth).toBe("calc(100% - 440px)");
    expect(box.pointerEvents).toBe("none");
    const text = currentStyle(indicatorText());
    expect([text.overflow, text.whiteSpace, text.textOverflow, text.minWidth]).toEqual(["hidden", "nowrap", "ellipsis", "0"]);
    // Its clip box reaches past the line box, so a descender isn't cut off, and the pill's height stays as it was.
    expect([text.getPropertyValue("padding-block"), text.getPropertyValue("margin-block")]).toEqual(["0.15em", "-0.15em"]);

    store.compatibilityBlocked.value = true;
    await flush();
    expect(currentStyle(indicatorIcon()).color).toBe(currentStyle(document.documentElement).getPropertyValue("--huggins-orange").trim());
  });

  it("leaves 160 px on both sides while the panel is on the left, where its button sits by the bell", async () => {
    localStorage.setItem("rr_device.panel.side", '"left"');
    useStylesheet();
    const { store } = await mountWithServices();
    store.reconnecting.value = true;
    await flush();

    expect(currentStyle(indicatorBox()).maxWidth).toBe("calc(100% - 336px)");

    // A narrow player's indicator sits below the corner buttons, on either side.
    stubLayoutSize(599);
    setViewport({ width: 1000, height: 768 });
    await flush();
    expect(stage().querySelector("main.player-col")!.classList.contains("is-narrow")).toBe(true);
    expect(currentStyle(indicatorBox()).maxWidth).toBe("calc(100% - 24px)");
  });

  it("moves below the corner buttons on a player narrower than 600 px, by the player column's measured width", async () => {
    useStylesheet();
    stubLayoutSize(599);
    const { store } = await mountWithServices();
    store.reconnecting.value = true;
    await flush();
    const column = stage().querySelector("main.player-col") as HTMLElement;

    expect(column.classList.contains("is-narrow")).toBe(true);
    expect(currentStyle(indicatorBox()).top).toBe("64px");
    expect(currentStyle(indicatorBox()).maxWidth).toBe("calc(100% - 24px)");

    stubLayoutSize(600);
    setViewport({ width: 1000, height: 768 });
    await flush();
    expect(column.classList.contains("is-narrow")).toBe(false);
    expect(currentStyle(indicatorBox()).top).toBe("14px");

    stubLayoutSize(1200);
    setViewport({ width: 1200, height: 768 });
    await flush();
    expect(column.classList.contains("is-narrow")).toBe(false);
  });

  it("slows its spin under reduced motion", async () => {
    useStylesheet();
    await mountWithServices();
    const reduced = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .filter((rule): rule is CSSMediaRule => (rule as CSSMediaRule).media?.mediaText?.includes("prefers-reduced-motion") ?? false)
      .flatMap((rule) => Array.from(rule.cssRules) as CSSStyleRule[])
      .find((rule) => rule.selectorText === ".player-indicator .material-symbol-icon.spins");
    expect(reduced?.style.animationDuration).toBe("3s");
  });
});

describe("the player's rating", () => {
  /** Plays the first of `items`, with the server taking ratings and the rating's stars laid out. */
  async function playRated(...items: unknown[]): Promise<{ page: MountedPage; server: FakeServer }> {
    stubStarLayout();
    const server = serverPicking(...items);
    server.on("POST", "/api/rating", ratingAnswer);
    const page = await mountAndPlay(server);
    return { page, server };
  }

  function orange(): string {
    return currentStyle(document.documentElement).getPropertyValue("--huggins-orange").trim();
  }

  it("shows the playing item's rating on a star between the panel button and Favorite, orange with the rating in its badge, and outlined without one while unrated", async () => {
    useStylesheet();
    await playRated(rated(VIDEO_ITEM, 3.5), rated(SECOND_VIDEO, 3), PHOTO_ITEM);

    const star = ratingButton();
    expect(star.previousElementSibling?.id).toBe("panel-btn");
    expect(star.nextElementSibling).toBe(ratingPopover());
    expect(ratingPopover().nextElementSibling?.id).toBe("favorite-btn");
    expect([star.type, star.title]).toEqual(["button", "Rating, 3.5 stars"]);
    expect(ratingPopover().hidden).toBe(true);
    expect(star.querySelector(".material-symbol-icon")!.textContent).toBe("star");
    expect(starShows()).toEqual(["Rating, 3.5 stars", true, "3.5"]);
    expect(currentStyle(star).color).toBe(orange());
    const right = (id: string) => currentStyle(document.getElementById(id)!).right;
    expect([right("panel-btn"), right("rating-btn"), right("favorite-btn"), right("blacklist-btn")]).toEqual(["168px", "116px", "64px", "12px"]);
    // The bell's badge, at the same place over its button.
    const badge = currentStyle(ratingBadge());
    expect([badge.position, badge.top, badge.right, badge.boxShadow]).toEqual(["absolute", "4px", "4px", "0 0 0 2px #000"]);

    await click(button("Next"));
    expect(starShows()).toEqual(["Rating, 3 stars", true, "3"]);

    await click(button("Next"));
    expect(starShows()).toEqual(["Rating", false, null]);
    expect(star.title).toBe("Rating");
    expect(currentStyle(star).color).not.toBe(orange());
  });

  it("stays left of Favorite while the panel is on the left, whose button then sits just right of the bell", async () => {
    localStorage.setItem("rr_device.panel.side", '"left"');
    useStylesheet();
    await mount(serverPicking(VIDEO_ITEM));

    const panelButton = currentStyle(document.getElementById("panel-btn")!);
    expect([panelButton.left, panelButton.right]).toEqual(["64px", "auto"]);
    expect(currentStyle(ratingButton()).right).toBe("116px");
  });

  it("opens nothing for a press while nothing plays or while the server asks for pairing", async () => {
    const services = await mountWithServices(serverPicking(VIDEO_ITEM));

    await pressStar();
    expect(ratingPopover().hidden).toBe(true);

    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    services.store.pairingRequired.value = true;
    await flush();
    await pressStar();
    expect(ratingPopover().hidden).toBe(true);

    services.store.pairingRequired.value = false;
    await flush();
    await pressStar();
    expect(ratingPopover().hidden).toBe(false);
  });

  it("opens the Stats tab's stars at the player's center, which set a rating by a click, a tap, or a drag and close as they set it, with the popup and the request", async () => {
    const { page, server } = await playRated(VIDEO_ITEM);
    expect(ratingPopover().hidden).toBe(true);
    expect(ratingPopover().querySelector(".rating")).toBeNull();

    await pressStar();
    expect(ratingPopover().hidden).toBe(false);
    expect(starsShown(popoverStars())).toBe(0);

    await tapStars(popoverStars(), xFor(3), "mouse");
    expect(ratingPopover().hidden).toBe(true);
    expect(starShows()).toEqual(["Rating, 3 stars", true, "3"]);
    await waitFor(() => expect(popups()).toEqual([{ text: "Rated 3 stars", detail: "holiday clip.mp4" }]));

    await pressStar();
    expect(starsShown(popoverStars())).toBe(3);
    await tapStars(popoverStars(), xFor(1.5), "touch");
    expect(ratingPopover().hidden).toBe(true);
    expect(starShows()).toEqual(["Rating, 1.5 stars", true, "1.5"]);

    // A drag shows the value under it and sets it as it ends.
    await pressStar();
    await pressStars(popoverStars(), xFor(1), "touch");
    await movePointer(popoverStars(), xFor(4.5), "touch");
    expect(starsShown(popoverStars())).toBe(4.5);
    expect(ratingPopover().hidden).toBe(false);
    await releasePointer(popoverStars(), xFor(4), "touch");
    expect(ratingPopover().hidden).toBe(true);
    expect(starShows()).toEqual(["Rating, 4 stars", true, "4"]);

    await pressStar();
    await tapStars(popoverStars(), CLEAR_EDGE_X, "mouse");
    expect(ratingPopover().hidden).toBe(true);
    expect(starShows()).toEqual(["Rating", false, null]);
    await waitFor(() => expect(popups()).toEqual([{ text: "Rating cleared", detail: "holiday clip.mp4" }]));

    // A release on the rating it has closes it too, and sends nothing.
    await pressStar();
    await tapStars(popoverStars(), CLEAR_EDGE_X, "touch");
    expect(ratingPopover().hidden).toBe(true);

    await waitFor(() => expect(ratingRequests(server)).toHaveLength(4));
    expect(ratingRequests(server)).toEqual([
      { itemId: "item-video", rating: 3, clientId: page.clientId() },
      { itemId: "item-video", rating: 1.5, clientId: page.clientId() },
      { itemId: "item-video", rating: 4, clientId: page.clientId() },
      { itemId: "item-video", rating: null, clientId: page.clientId() }
    ]);
    // Its presses never reach the player behind it.
    expect(randomPicks(server)).toBe(1);
  });

  it("closes on a second press of the star", async () => {
    await playRated(VIDEO_ITEM);

    await pressStar();
    expect(ratingPopover().hidden).toBe(false);
    await pressStar();
    expect(ratingPopover().hidden).toBe(true);
  });

  it("closes on Escape before the stage does, so in pseudo-fullscreen the first Escape closes only it, but not while an in-app dialog is open", async () => {
    await playRated(VIDEO_ITEM);
    await click(button("Fullscreen"));
    expect(isPseudoFullscreen()).toBe(true);

    await pressStar();
    expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(false);
    await flush();
    expect(ratingPopover().hidden).toBe(true);
    expect(isPseudoFullscreen()).toBe(true);

    fireEvent.keyDown(document.body, { key: "Escape" });
    await flush();
    expect(isPseudoFullscreen()).toBe(false);

    await pressStar();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await flush();
    expect(ratingPopover().hidden).toBe(false);
    dialog.remove();
  });

  it("closes on a press elsewhere, which still does what it does", async () => {
    const { server } = await playRated(VIDEO_ITEM);

    await pressStar();
    fireEvent.pointerDown(button("Loop"), { pointerType: "mouse", button: 0 });
    await flush();
    expect(ratingPopover().hidden).toBe(true);
    await click(button("Loop"));
    expect(isLit("Loop")).toBe(true);

    // A tap on the player beside the stars.
    await pressStar();
    fireEvent.pointerDown(video(), { pointerType: "touch" });
    await flush();
    expect(ratingPopover().hidden).toBe(true);
    expect(ratingRequests(server)).toEqual([]);
  });

  it("closes on a volume change, by the wheel, [ and ], or M, so it and the volume indicator never show at once, and opening it hides the indicator", async () => {
    await playRated(VIDEO_ITEM);
    moveVolume(50);

    const changes: Array<() => void> = [
      () => wheel(-100),
      () => fireEvent.keyDown(document.body, { key: "[" }),
      () => fireEvent.keyDown(document.body, { key: "]" }),
      () => fireEvent.keyDown(document.body, { key: "m" })
    ];
    for (const change of changes) {
      await pressStar();
      expect(ratingPopover().hidden).toBe(false);
      change();
      await flush();
      expect(ratingPopover().hidden).toBe(true);
      expect(indicatorShows()).not.toBeNull();
    }

    await pressStar();
    expect(ratingPopover().hidden).toBe(false);
    expect(indicatorShows()).toBeNull();
  });

  it("closes when another item plays, so a rating goes only to the item it was opened for, and when the panel opens", async () => {
    stubStarLayout();
    const services = await mountWithServices(serverPicking(VIDEO_ITEM, SECOND_VIDEO));
    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));

    await pressStar();
    void services.player.next();
    await waitFor(() => expect(video().src).toBe(SECOND_VIDEO_URL));
    expect(ratingPopover().hidden).toBe(true);

    await pressStar();
    services.panel.toggle();
    await flush();
    expect(panel().hidden).toBe(false);
    expect(ratingPopover().hidden).toBe(true);
  });

  it("cancels a touch's end on its stars, so the click after a tap never lands on the video under it as it hides, and a swipe there plays nothing", async () => {
    const { server } = await playRated(VIDEO_ITEM);

    await pressStar();
    expect(fireEvent.touchEnd(popoverStars(), { changedTouches: [{ clientX: 120, clientY: 100 }] })).toBe(false);
    await swipe(popoverStars(), { x: 300, y: 100 }, { x: 100, y: 100 });
    expect(randomPicks(server)).toBe(1);
    expect(video().src).toBe(VIDEO_URL);
  });

  it("looks like the player's other icons: the stars alone at the player's center, white when empty, each glyph with a text shadow, and only the stars take presses", async () => {
    useStylesheet();
    await playRated(rated(VIDEO_ITEM, 3.5));
    // Hidden, it shows nothing, though it lays the stars out as a flexbox while open.
    expect(currentStyle(ratingPopover()).display).toBe("none");
    await pressStar();

    const popover = currentStyle(ratingPopover());
    expect([popover.position, popover.display, popover.alignItems, popover.justifyContent, popover.pointerEvents]).toEqual([
      "absolute",
      "flex",
      "center",
      "center",
      "none"
    ]);
    // It spans the player, with no background, and centers the stars without a transform.
    expect([popover.transform, popover.backgroundColor]).toEqual(["", ""]);
    expect(stylesheetText()).toMatch(/\.rating-popover \{[^}]*inset: 0;/);
    const stars = currentStyle(popoverStars());
    expect([stars.pointerEvents, stars.marginLeft]).toEqual(["auto", "0px"]);

    const root = currentStyle(document.documentElement);
    const shadow = root.getPropertyValue("--control-drop-shadow").trim();
    const [full, , , half, empty] = [...popoverStars().querySelectorAll<HTMLElement>(".rating-star")];
    const part = (star: HTMLElement | undefined, name: "outline" | "fill") => currentStyle(star!.querySelector(`.rating-${name}`)!);
    expect(currentStyle(empty!).color).toBe(root.getPropertyValue("--icon-foreground").trim());
    expect([part(empty, "outline").textShadow, part(full, "fill").textShadow]).toEqual([shadow, shadow]);
    // A half star's shadow is its outline's, so none is cut off with its filled half.
    expect([part(half, "outline").textShadow, part(half, "fill").textShadow]).toEqual([shadow, ""]);
    // The filled star spans its star and centers its glyph there without a transform.
    expect(part(full, "fill").transform).toBe("");
    expect(stylesheetText()).toMatch(/\.rating-fill \{ position: absolute; inset: 0;/);
  });

  it("follows a rating the keys set at once, on the star and in the popover", async () => {
    stubStarLayout();
    const server = serverPicking(rated(VIDEO_ITEM, 2));
    server.on("POST", "/api/rating", ratingAnswer);
    const services = await mountWithServices(server);
    await click(emptyState());
    await waitFor(() => expect(video().src).toBe(VIDEO_URL));
    expect(starShows()).toEqual(["Rating, 2 stars", true, "2"]);

    await pressStar();
    services.playerRating.step(1);
    await flush();
    expect(starShows()).toEqual(["Rating, 2.5 stars", true, "2.5"]);
    expect(starsShown(popoverStars())).toBe(2.5);
    expect(ratingPopover().hidden).toBe(false);

    services.playerRating.set(null, { byKey: true });
    await flush();
    expect(starShows()).toEqual(["Rating", false, null]);
    expect(starsShown(popoverStars())).toBe(0);
    await waitFor(() => expect(ratingRequests(server)).toHaveLength(1));
    expect(ratingRequests(server).map((body) => (body as { rating: unknown }).rating)).toEqual([null]);
  });

  it("follows another device's rating, and keeps a rating set here through a resync", async () => {
    const { page, server } = await playRated(rated(VIDEO_ITEM, 2));

    await pressStar();
    page.stream().emit("itemRatingChanged", 2, { itemId: "item-video", path: VIDEO_ITEM.id, rating: 4.5, previousRating: 2, clientId: "another-client" });
    await flush();
    expect(starShows()).toEqual(["Rating, 4.5 stars", true, "4.5"]);
    expect(starsShown(popoverStars())).toBe(4.5);

    await tapStars(popoverStars(), xFor(3), "mouse");
    await waitFor(() => expect(ratingRequests(server)).toHaveLength(1));
    await flush();
    page.stream().emit("resyncRequired", 3, {});
    await flush();
    expect(starShows()).toEqual(["Rating, 3 stars", true, "3"]);
  });

  it("on a resync, shows the playing item's favorite, blacklist, and rating as the server reads them", async () => {
    const server = serverPicking(rated(VIDEO_ITEM, 2));
    server.on("POST", "/api/favorite", flagAnswer);
    const page = await mount(server);
    // Nothing reads while nothing plays.
    page.stream().emit("resyncRequired", 1, { reason: "revisionGap", lastEventId: 0, currentRevision: 1 });
    await flush();
    expect(server.requests("POST", "/api/library/item")).toHaveLength(0);

    await click(emptyState());
    await click(button("Favorite"));
    expect([isLit("Favorite"), isLit("Blacklist"), starShows()]).toEqual([true, false, ["Rating, 2 stars", true, "2"]]);

    // A change made elsewhere that the server announced only with a resync.
    server.on("POST", "/api/library/item", (call) =>
      json({ id: VIDEO_ITEM.id, sourceId: "s1", fileName: VIDEO_ITEM.displayName, mediaType: 0, isFavorite: false, isBlacklisted: true, rating: 4, tags: [] })
    );
    page.stream().emit("resyncRequired", 3, { reason: "bulkItemStateChanged", lastEventId: 2, currentRevision: 3 });
    await flush();
    expect(server.requests("POST", "/api/library/item").map((call) => call.body)).toEqual([{ id: "item-video" }]);
    expect([isLit("Favorite"), isLit("Blacklist"), starShows()]).toEqual([false, true, ["Rating, 4 stars", true, "4"]]);
    expect(openNotices()).toEqual([]);
  });

  it("follows a batch's rating on the playing item, and another device's batch pops up once, while this device's own pops up nothing", async () => {
    const { page, server } = await playRated(rated(VIDEO_ITEM, 2));

    page.stream().emit("bulkItemRatingChanged", 2, {
      rating: 3.5,
      count: 2,
      items: [
        { itemId: "item-video", rating: 3.5, previousRating: 2 },
        { itemId: "item-elsewhere", rating: 3.5, previousRating: null }
      ],
      clientId: "another-client"
    });
    await flush();
    expect(starShows()).toEqual(["Rating, 3.5 stars", true, "3.5"]);
    expect(popupsShown()).toEqual(["Rated 2 items 3.5 stars on another device"]);

    page.stream().emit("bulkItemRatingChanged", 3, {
      rating: null,
      count: 1234,
      items: [{ itemId: "item-video", rating: null, previousRating: 3.5 }],
      clientId: "another-client"
    });
    await flush();
    expect(starShows()).toEqual(["Rating", false, null]);
    expect(popupsShown()).toEqual(["Cleared the rating on 1,234 items on another device"]);

    page.stream().emit("bulkItemRatingChanged", 4, {
      rating: 1,
      count: 1,
      items: [{ itemId: "item-video", rating: 1, previousRating: null }],
      clientId: page.clientId()
    });
    await flush();
    expect(starShows()).toEqual(["Rating, 1 star", true, "1"]);
    expect(popupsShown()).toEqual(["Cleared the rating on 1,234 items on another device"]);
    expect(server.logLines().some((line) => line.includes("Rated 1 item"))).toBe(false);
  });

  it("shows the rating a history step's play answer gives, so a change made while the item wasn't playing shows after a resync", async () => {
    const { page, server } = await playRated(rated(VIDEO_ITEM, 2), SECOND_VIDEO);
    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);

    // Another device rates the first video while the second plays, and a resync drops what this device kept of it.
    page.stream().emit("itemRatingChanged", 2, { itemId: "item-video", path: VIDEO_ITEM.id, rating: 4, previousRating: 2, clientId: "another-client" });
    await flush();
    page.stream().emit("resyncRequired", 3, {});
    await flush();
    server.on("POST", "/api/play/item-video", () => json(rated(VIDEO_ITEM, 4)));

    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);
    expect(starShows()).toEqual(["Rating, 4 stars", true, "4"]);
  });
});

describe("without a library", () => {
  it("Play, a click on the media area, and Next show the notice and send nothing, while the indicator says so", async () => {
    const server = serverPicking(VIDEO_ITEM);
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, libraryState: "missing", libraryMessage: "The library file is missing." })
    );
    const page = await mount(server);
    await waitFor(() => expect(indicatorState()).toBe("nolibrary"));
    // The server refuses the event stream until it has a library, which isn't a lost connection.
    page.stream().fail();
    await flush();
    expect(indicatorState()).toBe("nolibrary");

    for (const target of [() => button("Play/Pause"), () => emptyState(), () => button("Next")]) {
      await click(target());
      expect(openNotices()).toEqual(["Cannot play: the server is running without a library."]);
      await closeNotices();
    }
    expect(randomPicks(server)).toBe(0);
    expect(playRecords(server)).toBe(0);
  });
});
