// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  FakeServer,
  IPHONE_USER_AGENT,
  json,
  mountPage,
  resetPage,
  settle,
  status,
  stubFullscreenApi,
  stubLayoutSize,
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
const EMPTY_STATE_TEXT = "Click here to play (choose a preset or open Filter…)";

/** Answers random picks with these items in order, then keeps answering with the last one. */
function answerRandom(server: FakeServer, ...items: unknown[]): void {
  let next = 0;
  server.on("POST", "/api/random", () => json(items[Math.min(next++, items.length - 1)]));
}

function serverPicking(...items: unknown[]): FakeServer {
  const server = new FakeServer();
  answerRandom(server, ...items);
  server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
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

function seekRow(): HTMLElement {
  return seekSlider().parentElement as HTMLElement;
}

function timeDisplay(): string {
  return seekSlider().nextElementSibling?.textContent ?? "";
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

function closeButton(id: "library-overlay" | "filter-dialog" | "tag-editor"): HTMLElement {
  return within(overlay(id)).getByRole("button", { name: "Close" });
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

function statusLine(): string {
  return document.getElementById("status")?.textContent ?? "";
}

function controlsShown(): boolean {
  return mediaArea().classList.contains("controls-visible");
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

beforeEach(() => {
  resetPage();
});

describe("random pick", () => {
  it("shows the empty state until something plays, and a click on it plays a random video", async () => {
    const server = serverPicking(VIDEO_ITEM);
    const page = await mount(server);
    expect(emptyState().style.display).not.toBe("none");
    expect(video().style.display).toBe("none");
    expect(photo().style.display).toBe("none");
    expect(seekRow().style.display).toBe("none");

    await click(emptyState());

    const pick = server.requests("POST", "/api/random")[0]!.body;
    expect(pick).toMatchObject({
      clientId: page.clientId(),
      sessionId: page.sessionId(),
      includeVideos: true,
      includePhotos: true,
      randomizationMode: "SmartShuffle"
    });
    expect(pick.presetId).toBeUndefined();
    expect(pick.filterState.favoritesOnly).toBe(false);
    expect(video().src).toBe(VIDEO_URL);
    expect(video().style.display).toBe("block");
    expect(seekRow().style.display).toBe("flex");
    expect(emptyState().style.display).toBe("none");
    expect(photo().style.display).toBe("none");
    expect(video().paused).toBe(false);
    expect(server.requests("POST", "/api/record-playback").map((call) => call.body)).toEqual([
      { path: "item-video", clientId: page.clientId(), sessionId: page.sessionId() }
    ]);
    await waitFor(() => expect(statusLine()).toBe("Playing"));
  });

  it("relays the pick's steps to the server log without file names or media URLs", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          "status=Loading... hasCurrent=false attempt=0",
          "playback=start attempt=1 hasCurrent=true mediaType=video",
          "playback=video-onplaying attempt=1 hasCurrent=true",
          "status=Playing hasCurrent=true attempt=1"
        ])
      )
    );
    expect(server.logLines().some((line) => line.includes("holiday") || line.includes("token") || line.includes("item-video"))).toBe(false);
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

  it("plays a photo in place of the video and reports when it loads or cannot be found", async () => {
    const server = serverPicking(PHOTO_ITEM);
    await mountAndPlay(server);

    expect(photo().src).toBe(PHOTO_URL);
    expect(photo().style.display).toBe("block");
    expect(video().style.display).toBe("none");
    expect(seekRow().style.display).toBe("none");
    expect(emptyState().style.display).toBe("none");

    fireEvent.load(photo());
    await flush();
    expect(statusLine()).toBe("Playing");
    fireEvent.error(photo());
    await flush();
    expect(statusLine()).toBe("Photo file not found.");
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          "playback=start attempt=1 hasCurrent=true mediaType=photo",
          "playback=photo-onload attempt=1 hasCurrent=true",
          "playback=photo-onerror attempt=1 hasCurrent=true"
        ])
      )
    );
  });

  it("reports a video that cannot be found", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    fireEvent.error(video());
    await flush();
    expect(statusLine()).toBe("Video file not found.");
    await waitFor(() => expect(server.logLines()).toContain("playback=video-onerror attempt=1 hasCurrent=true"));
  });

  it("reports no eligible media, a refused pick, and a pick that cannot reach the server", async () => {
    const server = serverPicking({ mediaUrl: null });
    await mount(server);
    await click(emptyState());
    expect(statusLine()).toBe("No eligible media for current filters.");

    server.on("POST", "/api/random", () => status(500));
    await click(emptyState());
    expect(statusLine()).toBe("Random selection failed (500).");

    server.on("POST", "/api/random", () => {
      throw new TypeError("Failed to fetch");
    });
    await click(emptyState());
    expect(statusLine()).toBe("Random selection failed: Failed to fetch");
    expect(emptyState().style.display).not.toBe("none");
    expect(playRecords(server)).toBe(0);
  });

  it("sends one pick at a time and gives up on one the server does not answer in 10 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/random", () => new Promise<Response>(() => {}));
    await mount(server);

    await click(emptyState());
    expect(statusLine()).toBe("Loading...");
    await click(button("Next"));
    await click(button("Play/Pause"));
    expect(randomPicks(server)).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(statusLine()).toBe("No response from the server. Try again.");
    expect(server.logLines()).toContain("playback=random-pick-timeout attempt=0 hasCurrent=false timeoutMs=10000");

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

  it("leaves Play/Pause alone while a photo shows", async () => {
    const server = serverPicking(PHOTO_ITEM);
    await mountAndPlay(server);

    await click(button("Play/Pause"));
    expect(iconOf("Play/Pause")).toBe("play_arrow");
    expect(video().paused).toBe(true);
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
    expect(playRecords(server)).toBe(1);

    await click(button("Next"));
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(SECOND_VIDEO_URL);

    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);
    expect(randomPicks(server)).toBe(2);
    expect(playRecords(server)).toBe(3);

    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
    expect(randomPicks(server)).toBe(2);
    expect(playRecords(server)).toBe(4);

    await click(button("Next"));
    expect(randomPicks(server)).toBe(3);
    expect(photo().src).toBe(PHOTO_URL);
    expect(screen.getByTitle("beach.jpg")).toBeTruthy();
  });
});

describe("favorite and blacklist", () => {
  it("send the playing item's id, light their buttons, and clear each other", async () => {
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/favorite", () => json({}));
    server.on("POST", "/api/blacklist", () => json({}));
    await mount(server);

    await click(button("Favorite"));
    await click(button("Blacklist"));
    expect(server.requests("POST", "/api/favorite")).toHaveLength(0);
    expect(server.requests("POST", "/api/blacklist")).toHaveLength(0);

    await click(emptyState());
    await click(button("Favorite"));
    expect(server.requests("POST", "/api/favorite")[0]!.body).toEqual({ path: "item-video", isFavorite: true });
    expect(isLit("Favorite")).toBe(true);
    expect(statusLine()).toBe("Added to favorites");

    await click(button("Blacklist"));
    expect(server.requests("POST", "/api/blacklist")[0]!.body).toEqual({ path: "item-video", isBlacklisted: true });
    expect(isLit("Blacklist")).toBe(true);
    expect(isLit("Favorite")).toBe(false);
    expect(statusLine()).toBe("Blacklisted");

    await click(button("Favorite"));
    expect(server.requests("POST", "/api/favorite")[1]!.body).toEqual({ path: "item-video", isFavorite: true });
    expect(isLit("Favorite")).toBe(true);
    expect(isLit("Blacklist")).toBe(false);

    await click(button("Favorite"));
    expect(server.requests("POST", "/api/favorite")[2]!.body).toEqual({ path: "item-video", isFavorite: false });
    expect(isLit("Favorite")).toBe(false);
    expect(statusLine()).toBe("Removed from favorites");

    await click(button("Blacklist"));
    await click(button("Blacklist"));
    expect(isLit("Blacklist")).toBe(false);
    expect(statusLine()).toBe("Removed from blacklist");
  });

  it("report an update the server refuses and leave the buttons as they were", async () => {
    const server = serverPicking(VIDEO_ITEM);
    server.on("POST", "/api/favorite", () => status(500));
    server.on("POST", "/api/blacklist", () => status(403));
    await mountAndPlay(server);

    await click(button("Favorite"));
    expect(statusLine()).toBe("Favorite update failed (500).");
    expect(isLit("Favorite")).toBe(false);

    await click(button("Blacklist"));
    expect(statusLine()).toBe("Blacklist update failed (403).");
    expect(isLit("Blacklist")).toBe(false);
  });

  it("follow item-state events for the playing item, and an item played again shows its latest state", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    const page = await mountAndPlay(server);

    page.stream().emit("itemStateChanged", 2, { itemId: "item-video", path: VIDEO_ITEM.id, isFavorite: true, isBlacklisted: false });
    await flush();
    expect(isLit("Favorite")).toBe(true);
    expect(statusLine()).toBe("Synced: Added to favorites: holiday clip.mp4");

    await click(button("Next"));
    expect(isLit("Favorite")).toBe(false);

    page.stream().emit("itemStateChanged", 3, { itemId: "item-video", path: VIDEO_ITEM.id, isFavorite: false, isBlacklisted: true });
    await flush();
    expect(isLit("Blacklist")).toBe(false);
    expect(statusLine()).toBe("Synced: Blacklisted: holiday clip.mp4");

    await click(button("Previous"));
    expect(isLit("Blacklist")).toBe(true);
    expect(isLit("Favorite")).toBe(false);

    page.stream().emit("itemStateChanged", 4, { itemId: "item-video", path: VIDEO_ITEM.id, isFavorite: false, isBlacklisted: false });
    await flush();
    expect(isLit("Blacklist")).toBe(false);
    expect(statusLine()).toBe("Synced: Removed from favorites: holiday clip.mp4");
    await waitFor(() => expect(server.logLines()).toContain("status=Synced: Blacklisted hasCurrent=true attempt=2"));
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

    await vi.advanceTimersByTimeAsync(14_999);
    expect(randomPicks(server)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(randomPicks(server)).toBe(2);
    expect(video().src).toBe(VIDEO_URL);
    expect(photo().style.display).toBe("none");
  });

  it("Loop shows a photo again after the photo duration, and turning it off stops the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(PHOTO_ITEM);
    await mountAndPlay(server);
    expect(playRecords(server)).toBe(1);

    await click(button("Loop"));
    expect(playRecords(server)).toBe(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(playRecords(server)).toBe(3);
    expect(randomPicks(server)).toBe(1);
    expect(photo().src).toBe(PHOTO_URL);

    await click(button("Loop"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(playRecords(server)).toBe(3);
    expect(randomPicks(server)).toBe(1);
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
    expect(statusLine()).toBe("Playing");
    expect(server.logLines().filter((line) => line.startsWith("playback=video-"))).toEqual([
      "playback=video-onplaying attempt=1 hasCurrent=true"
    ]);
  });
});

describe("mute", () => {
  it("is enabled at start, mutes this and later videos, and is disabled while a photo shows", async () => {
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
    expect(button("Mute").disabled).toBe(true);
    expect(iconOf("Mute")).toBe("volume_up");
    expect(isLit("Mute")).toBe(false);
    await click(button("Mute"));

    await click(button("Previous"));
    expect(button("Mute").disabled).toBe(false);
    expect(video().muted).toBe(true);
    expect(iconOf("Mute")).toBe("volume_off");
    await click(button("Mute"));
    expect(video().muted).toBe(false);
    expect(iconOf("Mute")).toBe("volume_up");
  });

  it("pressed before anything plays, disables itself and mutes the first video", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);

    await click(button("Mute"));
    expect(button("Mute").disabled).toBe(true);
    expect(iconOf("Mute")).toBe("volume_up");

    await click(emptyState());
    expect(video().muted).toBe(true);
    expect(button("Mute").disabled).toBe(false);
    expect(iconOf("Mute")).toBe("volume_off");
    expect(isLit("Mute")).toBe(true);
  });
});

describe("seek", () => {
  it("shows the time, moves the slider as the video plays, and seeks from the slider", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    fireEvent.input(seekSlider(), { target: { value: "50" } });
    expect(video().currentTime).toBe(0);
    expect(timeDisplay()).toBe("0:00 / 0:00");

    await click(emptyState());
    Object.defineProperty(video(), "duration", { configurable: true, value: 125 });
    fireEvent.loadedMetadata(video());
    await flush();
    expect(seekSlider().max).toBe("125");
    expect(timeDisplay()).toBe("0:00 / 2:05");

    video().currentTime = 61.7;
    fireEvent.timeUpdate(video());
    await flush();
    expect(timeDisplay()).toBe("1:01 / 2:05");
    expect(seekSlider().value).toBe("61");

    fireEvent.input(seekSlider(), { target: { value: "90" } });
    expect(video().currentTime).toBe(90);
  });
});

describe("controls and gestures", () => {
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

  it("a tap toggles the controls once, without the click that follows toggling them back", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await swipe(video(), { x: 100, y: 100 }, { x: 105, y: 103 });
    expect(controlsShown()).toBe(false);
    await click(video());
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

  it("Escape closes an open library overlay before it leaves the page-filling fullscreen", async () => {
    const page = mountPage({ server: serverPicking(VIDEO_ITEM) });
    await screen.findByText("Ready (API 1)");
    await click(button("Fullscreen"));
    await click(button("Library"));
    expect(overlay("library-overlay").style.display).toBe("flex");

    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(overlay("library-overlay").style.display).toBe("none");
    expect(isPseudoFullscreen()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(isPseudoFullscreen()).toBe(false);
    expect(page.root.contains(overlay("library-overlay"))).toBe(true);
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
  it("the tag editor pauses a playing video and resumes it on close, and a paused video stays paused", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await click(button("Edit Tags"));
    expect(overlay("tag-editor").style.display).toBe("flex");
    expect(video().paused).toBe(true);
    await click(closeButton("tag-editor"));
    expect(overlay("tag-editor").style.display).toBe("none");
    expect(video().paused).toBe(false);

    await click(button("Play/Pause"));
    await click(button("Edit Tags"));
    await click(closeButton("tag-editor"));
    expect(video().paused).toBe(true);
  });

  it("the tag editor holds a photo's autoplay timer while open and starts it again on close", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = serverPicking(PHOTO_ITEM, VIDEO_ITEM);
    await mount(server);
    await click(button("Autoplay"));
    await click(emptyState());

    await vi.advanceTimersByTimeAsync(10_000);
    await click(button("Edit Tags"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(randomPicks(server)).toBe(1);

    await click(closeButton("tag-editor"));
    expect(playRecords(server)).toBe(2);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(randomPicks(server)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(randomPicks(server)).toBe(2);
  });

  it("playback keeps going while the library overlay and the filter dialog are open", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mountAndPlay(server);

    await click(button("Library"));
    expect(overlay("library-overlay").style.display).toBe("flex");
    expect(video().paused).toBe(false);
    await click(closeButton("library-overlay"));

    await click(button("Select filters"));
    await waitFor(() => expect(overlay("filter-dialog").style.display).toBe("flex"));
    expect(video().paused).toBe(false);
    expect(video().src).toBe(VIDEO_URL);
  });

  it("a library tile plays without a second play record, closes the overlay, and joins history", async () => {
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
    await screen.findByText("Ready (API 1)");
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(1));

    await click(button("Library"));
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
    expect(overlay("library-overlay").style.display).toBe("none");
    expect(playRecords(server)).toBe(0);
    await waitFor(() => expect(server.logLines()).toContain("playback=start attempt=1 hasCurrent=true mediaType=video"));
    const lines = server.logLines();
    expect(lines.indexOf("playback=library-play-success attempt=0 hasCurrent=true")).toBeGreaterThan(-1);
    expect(lines.indexOf("playback=library-play-success attempt=0 hasCurrent=true")).toBeLessThan(
      lines.indexOf("playback=start attempt=1 hasCurrent=true mediaType=video")
    );

    await click(button("Next"));
    expect(video().src).toBe(SECOND_VIDEO_URL);
    await click(button("Previous"));
    expect(video().src).toBe(VIDEO_URL);
    expect(playRecords(server)).toBe(2);
  });
});

describe("page structure", () => {
  it("keeps the same video and photo elements while switching media and opening and closing each overlay", async () => {
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM, SECOND_VIDEO);
    await mount(server);
    const videoNode = video();
    const photoNode = photo();

    await click(emptyState());
    await click(button("Next"));
    expect(photo().style.display).toBe("block");
    await click(button("Next"));
    expect(video().style.display).toBe("block");

    await click(button("Library"));
    await click(closeButton("library-overlay"));
    await click(button("Select filters"));
    await waitFor(() => expect(overlay("filter-dialog").style.display).toBe("flex"));
    await click(closeButton("filter-dialog"));
    await click(button("Edit Tags"));
    await click(closeButton("tag-editor"));

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
    await click(button("Library"));
    await click(closeButton("library-overlay"));

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records).toHaveLength(0);
  });

  it("adds no browser storage keys", async () => {
    const server = serverPicking(VIDEO_ITEM, PHOTO_ITEM);
    server.on("POST", "/api/favorite", () => json({}));
    await mountAndPlay(server);

    await click(button("Mute"));
    await click(button("Loop"));
    await click(button("Autoplay"));
    await click(button("Favorite"));
    await click(button("Fullscreen"));
    await click(button("Next"));
    await click(button("Previous"));

    expect(storageKeys(localStorage)).toEqual(["rr_clientId"]);
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId"]);
  });
});
