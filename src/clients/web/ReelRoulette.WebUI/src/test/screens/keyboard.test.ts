// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeServer, json, mountPage, resetPage, settle, status, stubFullscreenApi, stubVideoFrames, type MountedPage } from "./pageHarness";

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
  ...VIDEO_ITEM,
  id: "C:\\media\\sunset.mp4",
  itemId: "item-video-2",
  displayName: "sunset.mp4",
  mediaUrl: "/api/media/item-video-2?token=t"
};

const THIRD_VIDEO = {
  ...VIDEO_ITEM,
  id: "C:\\media\\harbor.mp4",
  itemId: "item-video-3",
  displayName: "harbor.mp4",
  mediaUrl: "/api/media/item-video-3?token=t"
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

/** A server that answers random picks with these items in order, then keeps answering with the last one. */
function serverPicking(...items: unknown[]): FakeServer {
  const server = new FakeServer();
  let next = 0;
  server.on("POST", "/api/random", () => json(items[Math.min(next++, items.length - 1)]));
  server.on("POST", "/api/favorite", () => json({}));
  server.on("POST", "/api/blacklist", () => json({}));
  server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
  server.on("GET", "/api/sources", () => json([]));
  return server;
}

async function mount(server: FakeServer): Promise<MountedPage> {
  const page = mountPage({ server });
  await settle();
  return page;
}

/** Presses `key` on `target`, the page itself unless given, and says whether the page left the key to the browser. */
async function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body): Promise<boolean> {
  const allowed = fireEvent.keyDown(target, { key, ...init });
  fireEvent.keyUp(target, { key, ...init });
  await settle();
  return allowed;
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

function video(): HTMLVideoElement {
  return document.getElementById("video") as HTMLVideoElement;
}

/** Gives the playing video its length, as its metadata does, and lets it start. */
async function loadVideo(seconds: number): Promise<void> {
  Object.defineProperty(video(), "duration", { configurable: true, value: seconds });
  fireEvent.loadedMetadata(video());
  fireEvent.playing(video());
  await settle();
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name, hidden: true }) as HTMLButtonElement;
}

function isLit(name: string): boolean {
  return button(name).classList.contains("active");
}

/** The play button's icon: `pause` while something plays, `play_arrow` while it waits. */
function playIcon(): string {
  return button("Play/Pause").textContent ?? "";
}

function seekSlider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "Seek", hidden: true }) as HTMLInputElement;
}

function volumeSlider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "Volume", hidden: true }) as HTMLInputElement;
}

function volumeIndicator(): { shown: boolean; text: string } {
  const indicator = document.getElementById("volume-indicator")!;
  return { shown: indicator.classList.contains("is-shown"), text: document.getElementById("volume-indicator-text")!.textContent ?? "" };
}

function panel(): HTMLElement {
  return document.getElementById("panel") as HTMLElement;
}

/** The tab the panel shows, or null while it is closed. */
function shownTab(): string | null {
  if (panel().hidden) return null;
  const page = Array.from(panel().querySelectorAll<HTMLElement>(".panel-page")).find((element) => !element.hidden);
  return page?.id.replace("panel-page-", "") ?? null;
}

function shortcutsSection(): HTMLDetailsElement {
  return document.getElementById("settings-shortcuts") as HTMLDetailsElement;
}

function isPseudoFullscreen(): boolean {
  return document.getElementById("fullscreen-stage")!.classList.contains("fullscreen-pseudo");
}

function stretchFrom(): number {
  return Number((document.getElementById("seek-loop") as HTMLElement).style.getPropertyValue("--loop-from"));
}

function randomPicks(server: FakeServer): number {
  return server.requests("POST", "/api/random").length;
}

beforeEach(() => {
  resetPage();
});

describe("keyboard shortcuts", () => {
  it("K and Space play and pause a video as Play does, K picks with nothing playing, and Space doesn't scroll the page", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await press("k");
    expect(randomPicks(server)).toBe(1);
    await loadVideo(65);
    expect(playIcon()).toBe("pause");

    await press("k");
    expect(playIcon()).toBe("play_arrow");
    expect(await press(" ")).toBe(false);
    expect(playIcon()).toBe("pause");
    expect(await press(" ")).toBe(false);
    expect(playIcon()).toBe("play_arrow");
    expect(randomPicks(server)).toBe(1);
  });

  it("K and Space pause and resume a photo's timer", async () => {
    await mount(serverPicking(PHOTO_ITEM));
    await click(button("Autoplay"));
    await press("k");
    expect(playIcon()).toBe("pause");
    await press("k");
    expect(playIcon()).toBe("play_arrow");
    await press(" ");
    expect(playIcon()).toBe("pause");
  });

  it("leaves Space on a focused button to the button", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    const favorite = button("Favorite");
    favorite.focus();
    expect(await press(" ", {}, favorite)).toBe(true);
    expect(playIcon()).toBe("pause");
  });

  it("J and L seek by the seek step, 5 seconds until Settings changes it, and keep a paused video paused", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    video().currentTime = 20;
    await press("j");
    expect(video().currentTime).toBe(15);
    await press("l");
    await press("l");
    expect(video().currentTime).toBe(25);
    expect(seekSlider().value).toBe("25");

    await press("5");
    const steps = within(panel()).getByRole("radiogroup", { name: "Seek step", hidden: true });
    await click(within(steps).getByRole("radio", { name: "10 seconds", hidden: true }));
    await press("5");
    await press("k");
    await press("l");
    expect(video().currentTime).toBe(35);
    expect(playIcon()).toBe("play_arrow");
  });

  it("← and → play the previous and next item, and R picks a new one from the middle of the history", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, THIRD_VIDEO);
    await mount(server);
    await press("k");
    await press("ArrowRight");
    expect(video().src).toContain("item-video-2");
    await press("ArrowLeft");
    expect(video().src).toContain("item-video?");
    await press("ArrowRight");
    expect(video().src).toContain("item-video-2");
    expect(randomPicks(server)).toBe(2);

    await press("ArrowLeft");
    await press("r");
    expect(randomPicks(server)).toBe(3);
    expect(video().src).toContain("item-video-3");
  });

  it("F and B favorite and blacklist the playing item, A turns Autoplay on and off, and M mutes", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await press("k");
    await press("f");
    await waitFor(() => expect(server.requests("POST", "/api/favorite").map((call) => call.body.isFavorite)).toEqual([true]));
    await press("b");
    await waitFor(() => expect(server.requests("POST", "/api/blacklist").map((call) => call.body.isBlacklisted)).toEqual([true]));

    expect(isLit("Autoplay")).toBe(false);
    await press("a");
    expect(isLit("Autoplay")).toBe(true);
    await press("a");
    expect(isLit("Autoplay")).toBe(false);

    await press("m");
    expect(isLit("Mute")).toBe(true);
    await press("m");
    expect(isLit("Mute")).toBe(false);
  });

  it("[ and ] step the volume by the volume step and show the volume indicator, by the muted-volume rules", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    expect(volumeSlider().value).toBe("100");
    expect(await press("[")).toBe(false);
    expect([volumeSlider().value, volumeIndicator()]).toEqual(["95", { shown: true, text: "95%" }]);
    await press("]");
    expect(volumeSlider().value).toBe("100");

    // Muted, [ changes nothing, and ] unmutes and starts from 0.
    await press("m");
    await press("[");
    expect([volumeSlider().value, isLit("Mute")]).toEqual(["0", true]);
    expect(volumeIndicator().text).toBe("0%");
    await press("]");
    expect([volumeSlider().value, isLit("Mute")]).toEqual(["5", false]);
    // [ that reaches 0 mutes, and unmuting restores the volume from before that press.
    await press("[");
    expect([volumeSlider().value, isLit("Mute")]).toEqual(["0", true]);
    await press("m");
    expect(volumeSlider().value).toBe("5");
  });

  it("[ and ] change the volume on a photo too, for the next video", async () => {
    await mount(serverPicking(PHOTO_ITEM));
    await press("k");
    await press("[");
    expect([volumeSlider().value, volumeIndicator()]).toEqual(["95", { shown: true, text: "95%" }]);
  });

  it("1 to 5 open the panel on Library, Filter, Tags, Stats, and Settings, the open tab's key closes it, T and S open Tags and Settings, and P shows or hides it", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    const shown: (string | null)[] = [];
    for (const key of ["1", "1", "2", "3", "4", "5", "t", "s", "s", "p", "p"]) {
      await press(key);
      shown.push(shownTab());
    }
    expect(shown).toEqual(["library", null, "filter", "tags", "stats", "settings", "tags", "settings", null, "settings", null]);
  });

  it("Shift+F enters and leaves fullscreen", async () => {
    const fullscreen = stubFullscreenApi();
    await mount(serverPicking(VIDEO_ITEM));
    await press("F", { shiftKey: true });
    expect(fullscreen.requests).toEqual([document.getElementById("fullscreen-stage")]);
    await press("F", { shiftKey: true });
    expect(fullscreen.exits()).toBe(1);
  });

  it("H opens Settings with Keyboard shortcuts expanded and focus on its heading, from another tab too", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    expect(shortcutsSection().open).toBe(false);
    await press("h");
    expect(shownTab()).toBe("settings");
    expect(shortcutsSection().open).toBe(true);
    expect(document.activeElement).toBe(shortcutsSection().querySelector("summary"));

    shortcutsSection().open = false;
    await press("2");
    await press("h");
    expect([shownTab(), shortcutsSection().open]).toEqual(["settings", true]);
  });

  it("leave focus on the page when a key closes the panel, Esc included, so Space plays or pauses afterwards", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    for (const key of ["Escape", "s", "5", "p"]) {
      await press("h");
      expect(document.activeElement).toBe(shortcutsSection().querySelector("summary"));
      await press(key, {}, document.activeElement!);
      expect(shownTab()).toBeNull();
      expect(document.activeElement).toBe(document.body);
      const before = playIcon();
      expect(await press(" ", {}, document.activeElement!)).toBe(false);
      expect(playIcon()).not.toBe(before);
    }
  });

  it("play or pause on Space while the bell's list is open, whose title takes focus but not Space", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    await click(document.getElementById("notify-btn")!);
    expect(document.activeElement?.id).toBe("notify-title");
    expect(await press(" ", {}, document.activeElement!)).toBe(false);
    expect(playIcon()).toBe("play_arrow");
  });

  it("leave focus on the page when Esc closes the bell's list, so Space plays or pauses afterwards", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    await click(document.getElementById("notify-btn")!);
    await press("Escape", {}, document.activeElement!);
    expect(document.getElementById("notify-list")!.hidden).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(await press(" ", {}, document.activeElement!)).toBe(false);
    expect(playIcon()).toBe("play_arrow");
  });

  it("lists every binding in the reference, and H among them", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("5");
    const list = shortcutsSection().querySelector(".shortcut-list")!;
    const rows = Array.from(list.querySelectorAll("dt")).map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["K / Space", "Play or pause, or pause and resume a photo's timer"],
      ["J / L", "Seek back or forward by the seek step"],
      ["← / →", "Previous or next"],
      ["R", "Random"],
      ["F", "Favorite"],
      ["B", "Blacklist"],
      ["A", "Autoplay on or off"],
      ["M", "Mute"],
      [", / .", "One frame back or forward, while a video is paused"],
      ["[ / ]", "Volume down or up by the volume step"],
      ["1 – 5", "Open Library, Filter, Tags, Stats, or Settings; the open tab's key closes the panel"],
      ["T", "Tags"],
      ["S", "Settings"],
      ["P", "Show or hide the panel"],
      ["Shift+F", "Fullscreen"],
      ["H", "These shortcuts"],
      ["Esc", "Close the top dialog, the notifications list, or the panel, or leave fullscreen"]
    ]);
    expect(within(shortcutsSection()).getByText("Shortcuts do nothing while you type in a text field.")).toBeTruthy();
  });

  it("do nothing while typing in a text field, while an in-app dialog is open, or with Ctrl held", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await press("k");
    await loadVideo(65);
    await press("1");
    const search = screen.getByRole("searchbox", { name: "Search library", hidden: true });
    search.focus();
    for (const key of ["k", " ", "2", "h", "ArrowRight", "m"]) {
      expect(await press(key, {}, search)).toBe(true);
    }
    expect([playIcon(), shownTab(), randomPicks(server), isLit("Mute")]).toEqual(["pause", "library", 1, false]);

    await press("k", { ctrlKey: true });
    expect(playIcon()).toBe("pause");

    server.on("POST", "/api/random", () => status(500));
    await press("r");
    await waitFor(() => expect(document.querySelector("dialog[open]")).not.toBeNull());
    await press("m");
    await press("3");
    expect([isLit("Mute"), shownTab()]).toEqual([false, "library"]);
  });

  it("leave a focused slider its arrow keys and take every other key", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    await mount(server);
    await press("k");
    await loadVideo(65);
    seekSlider().focus();
    expect(await press("ArrowRight", {}, seekSlider())).toBe(true);
    expect(randomPicks(server)).toBe(1);
    await press("k", {}, seekSlider());
    expect(playIcon()).toBe("play_arrow");
    await press(" ", {}, seekSlider());
    expect(playIcon()).toBe("pause");
  });

  it("repeat only J, L, comma, period, [, and ] while a key is held down", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await press("k");
    await loadVideo(65);
    await press("f", { repeat: true });
    await press("m", { repeat: true });
    await press("2", { repeat: true });
    expect([server.requests("POST", "/api/favorite").length, isLit("Mute"), shownTab()]).toEqual([0, false, null]);
    // A held key that acts once still keeps its repeats from the browser, so holding Space or an arrow doesn't scroll,
    // while a held Space on a focused button stays the button's.
    expect([await press(" ", { repeat: true }), await press("ArrowRight", { repeat: true })]).toEqual([false, false]);
    expect([playIcon(), randomPicks(server)]).toEqual(["pause", 1]);
    expect(await press(" ", { repeat: true }, button("Favorite"))).toBe(true);

    video().currentTime = 20;
    await press("l", { repeat: true });
    await press("]", { repeat: true });
    await press("[", { repeat: true });
    expect([video().currentTime, volumeSlider().value]).toEqual([25, "95"]);
  });

  it("comma and period step a paused video one frame by the browser's frame timings, and do nothing while it plays", async () => {
    const frames = stubVideoFrames();
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    // 25 frames a second; the frame shown at the pause starts at 0.4 s.
    for (let frame = 0; frame <= 10; frame++) frames.show(frame * 0.04);
    video().currentTime = 0.43;
    await press(".");
    expect(video().currentTime).toBe(0.43);

    await press("k");
    await press(".");
    expect(video().currentTime).toBeCloseTo(0.46, 10);
    await press(",");
    await press(",");
    expect(video().currentTime).toBeCloseTo(0.38, 10);
  });

  it("comma and period step 1/30 of a second without the browser's frame timings", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    await press("k");
    video().currentTime = 10;
    await press(".");
    expect(video().currentTime).toBeCloseTo(10 + 1 / 30, 10);
    await press(",");
    await press(",");
    expect(video().currentTime).toBeCloseTo(10 - 1 / 30, 10);
  });

  it("J, L, and a frame step start Timer mode's repeating stretch where they land", async () => {
    localStorage.setItem("rr_device.playback.autoplayMode", '"timer"');
    localStorage.setItem("rr_device.playback.advanceAfter", "10");
    await mount(serverPicking(VIDEO_ITEM));
    await click(button("Autoplay"));
    await click(button("Loop"));
    await press("k");
    await loadVideo(120);
    expect(stretchFrom()).toBe(0);

    video().currentTime = 65;
    await press("j");
    expect([video().currentTime, stretchFrom()]).toEqual([60, 0.5]);
    await press("l");
    expect(stretchFrom()).toBe(65 / 120);

    await press("k");
    video().currentTime = 90;
    await press(".");
    expect(stretchFrom()).toBeCloseTo((90 + 1 / 30) / 120, 10);
  });
});

describe("Escape", () => {
  it("closes the bell's list, then the panel, then pseudo-fullscreen", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await click(button("Fullscreen"));
    await press("p");
    await click(document.getElementById("notify-btn")!);
    const list = document.getElementById("notify-list")!;
    expect([list.hidden, shownTab(), isPseudoFullscreen()]).toEqual([false, "library", true]);

    await press("Escape");
    expect([list.hidden, shownTab(), isPseudoFullscreen()]).toEqual([true, "library", true]);
    await press("Escape");
    expect([shownTab(), isPseudoFullscreen()]).toEqual([null, true]);
    await press("Escape");
    expect(isPseudoFullscreen()).toBe(false);
  });
});
