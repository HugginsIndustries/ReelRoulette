// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeServer,
  json,
  mountPage,
  popupsShown,
  presetSelect,
  randomAnswer,
  flagAnswer,
  ratingAnswer,
  ratingRequests,
  resetPage,
  settle,
  STAR_WIDTH,
  STARS_LEFT,
  starsShown,
  status,
  stubFullscreenApi,
  stubStarLayout,
  stubVideoFrames,
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
  const server = new FakeServer().playsItems(...items);
  let next = 0;
  server.on("POST", "/api/random", () => randomAnswer(items[Math.min(next++, items.length - 1)]));
  server.on("POST", "/api/favorite", flagAnswer);
  server.on("POST", "/api/blacklist", flagAnswer);
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

/** What a browser presses when it has focus: a button, a checkbox, a radio button, or a section heading. */
const PRESSED_BY_KEY = "button, input[type=checkbox], input[type=radio], summary";

/**
 * Presses `key` where focus is, as a browser sends it: the key goes down on the focused element and comes back up on what
 * has focus then. Enter going down on a button, a checkbox, a radio button, or a section heading presses it unless the
 * page prevents it, and Space coming back up on one presses it, as a browser may even when the page prevented the key
 * going down. Says whether the page left the key going down to the browser.
 */
async function pressFocused(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const pressed = document.activeElement ?? document.body;
  const allowed = fireEvent.keyDown(pressed, { key, ...init });
  if (allowed && key === "Enter" && pressed.matches(PRESSED_BY_KEY)) fireEvent.click(pressed);
  const released = document.activeElement ?? document.body;
  fireEvent.keyUp(released, { key, ...init });
  if (key === " " && released.matches(PRESSED_BY_KEY)) fireEvent.click(released);
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

/** Each side of the seek indicator's text while it shows, or null. */
function seekIndicator(): { back: string | null; forward: string | null } {
  const side = (id: string) => {
    const box = document.getElementById(id)!;
    return box.classList.contains("is-shown") ? box.querySelector(".seek-indicator-text")!.textContent : null;
  };
  return { back: side("seek-indicator-back"), forward: side("seek-indicator-forward") };
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

/** Has `server` take ratings, answering each with the rating it was sent. */
function takeRatings(server: FakeServer): FakeServer {
  return server.on("POST", "/api/rating", ratingAnswer);
}

/** The ratings sent, in order. */
function ratingsSent(server: FakeServer): unknown[] {
  return ratingRequests(server).map((body) => (body as { rating?: unknown } | undefined)?.rating);
}

/** The symbols Shift gives the digit keys 0 to 5 on a US keyboard. */
const US_SHIFTED_DIGITS = ")!@#$%";

/** Presses the digit key with Shift held, as a US keyboard sends it: the key's symbol, such as "!" for Digit1. */
function pressShiftDigit(digit: number, target: Element = document.body): Promise<boolean> {
  return press(US_SHIFTED_DIGITS[digit]!, { code: `Digit${digit}`, shiftKey: true }, target);
}

/** Waits past the pause after which a rating key's change is sent. */
function waitForKeysPause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600));
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

  it("Space, ←, and → run their shortcuts on a focused button, slider, checkbox, radio button, or section heading, which they leave unpressed, leaving focus on the page", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    await mount(server);
    await press("k");
    await loadVideo(65);
    await press("6");
    const loopStops = within(panel()).getByRole("checkbox", { name: "Loop stops autoplay", hidden: true }) as HTMLInputElement;
    const steps = within(panel()).getByRole("radiogroup", { name: "Seek step", hidden: true });
    const seekStep = within(steps).getByRole("radio", { name: "10 seconds", hidden: true }) as HTMLInputElement;
    const heading = shortcutsSection().querySelector("summary")!;
    const controls: HTMLElement[] = [button("Favorite"), seekSlider(), volumeSlider(), loopStops, seekStep, heading];
    const states = () => [server.requests("POST", "/api/favorite").length, loopStops.checked, seekStep.checked, shortcutsSection().open];
    const before = states();

    for (const control of controls) {
      control.focus();
      const icon = playIcon();
      expect(await pressFocused(" "), control.outerHTML).toBe(false);
      expect([playIcon() !== icon, document.activeElement], control.outerHTML).toEqual([true, document.body]);

      control.focus();
      expect(await pressFocused("ArrowRight"), control.outerHTML).toBe(false);
      expect([video().src.includes("item-video-2"), document.activeElement], control.outerHTML).toEqual([true, document.body]);
      control.focus();
      expect(await pressFocused("ArrowLeft"), control.outerHTML).toBe(false);
      expect([video().src.includes("item-video?"), document.activeElement], control.outerHTML).toEqual([true, document.body]);
    }
    expect(states()).toEqual(before);
    expect(randomPicks(server)).toBe(2);
  });

  it("after a click on Next, Space pauses instead of pressing Next again, and after a click on the seek bar, → plays the next item", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, THIRD_VIDEO);
    await mount(server);
    await press("k");
    await loadVideo(65);
    // A click on a button or a press on the seek bar focuses it, as Chrome and Firefox on Linux do.
    const next = button("Next");
    next.focus();
    await click(next);
    await loadVideo(65);
    expect([video().src.includes("item-video-2"), playIcon()]).toEqual([true, "pause"]);

    expect(await pressFocused(" ")).toBe(false);
    expect([playIcon(), video().src.includes("item-video-2"), randomPicks(server), document.activeElement]).toEqual(["play_arrow", true, 2, document.body]);

    seekSlider().focus();
    expect(await pressFocused("ArrowRight")).toBe(false);
    expect([video().src.includes("item-video-3"), document.activeElement]).toEqual([true, document.body]);
  });

  it("after a pick from a dropdown, focus has left it, so → after a preset pick plays the next item", async () => {
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO);
    server.on("GET", "/api/presets", () => json([{ id: "preset-favorites", name: "Favorites", filterState: { favoritesMode: "only", selectedTags: [], excludedTags: [], includedSourceIds: [] } }]));
    await mount(server);
    await press("k");
    await loadVideo(65);
    await press("1");
    await waitFor(() => expect(Array.from(presetSelect().options, (option) => option.value)).toContain("preset-favorites"));

    presetSelect().focus();
    fireEvent.change(presetSelect(), { target: { value: "preset-favorites" } });
    await settle();
    expect([presetSelect().value, document.activeElement]).toEqual(["preset-favorites", document.body]);
    expect(await pressFocused("ArrowRight")).toBe(false);
    expect(video().src).toContain("item-video-2");

    const sort = document.getElementById("library-sort-select") as HTMLSelectElement;
    const other = Array.from(sort.options).find((option) => option.value !== sort.value)!.value;
    sort.focus();
    fireEvent.change(sort, { target: { value: other } });
    await settle();
    expect([sort.value, document.activeElement]).toEqual([other, document.body]);
  });

  it("do nothing with a plain key no shortcut binds, on a control or the page, and leave F1 to F12, Escape, and keys pressed with Ctrl, Alt, or Meta to the browser", async () => {
    const server = serverPicking(VIDEO_ITEM);
    await mount(server);
    await press("k");
    await loadVideo(65);
    const volume = volumeSlider().value;
    volumeSlider().focus();
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Tab", "Enter"]) {
      expect(await pressFocused(key), key).toBe(false);
    }
    expect([volumeSlider().value, document.activeElement]).toEqual([volume, volumeSlider()]);

    button("Favorite").focus();
    expect([await pressFocused("Enter"), await pressFocused("Tab", { shiftKey: true })]).toEqual([false, false]);
    expect([server.requests("POST", "/api/favorite").length, document.activeElement]).toEqual([0, button("Favorite")]);

    button("Favorite").blur();
    for (const key of ["Tab", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", "Backspace", "x", "/"]) {
      expect(await press(key), key).toBe(false);
    }
    const left = [press("F5"), press("F12"), press("ArrowDown", { ctrlKey: true }), press("ArrowLeft", { altKey: true }), press("x", { metaKey: true }), press("Escape")];
    expect(await Promise.all(left)).toEqual([true, true, true, true, true, true]);
    expect([playIcon(), randomPicks(server)]).toEqual(["pause", 1]);
  });

  it("leave Ctrl with + and - to the browser's page zoom, while Ctrl+scroll never zooms the page", async () => {
    const page = await mount(serverPicking(VIDEO_ITEM));
    const zoomKeys = [press("=", { ctrlKey: true }), press("+", { ctrlKey: true, shiftKey: true }), press("-", { ctrlKey: true }), press("0", { ctrlKey: true })];
    expect(await Promise.all(zoomKeys)).toEqual([true, true, true, true]);

    // happy-dom's wheel event drops `ctrlKey` from its init, so it is set on the event.
    const wheel = (ctrlKey: boolean, target: Element) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
      Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
      return target.dispatchEvent(event);
    };
    const header = document.querySelector("header")!;
    expect([wheel(true, header), wheel(false, header)]).toEqual([false, true]);

    page.unmount();
    expect(wheel(true, document.body)).toBe(true);
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

    await press("6");
    const steps = within(panel()).getByRole("radiogroup", { name: "Seek step", hidden: true });
    await click(within(steps).getByRole("radio", { name: "10 seconds", hidden: true }));
    await press("6");
    await press("k");
    await press("l");
    expect(video().currentTime).toBe(35);
    expect(playIcon()).toBe("play_arrow");
  });

  it("J and L show the seek indicator on their side, adding up seeks the same way and starting over the other way, and a frame step doesn't", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    video().currentTime = 20;
    await press("l");
    await press("l");
    expect(seekIndicator()).toEqual({ back: null, forward: "+ 10" });
    await press("j");
    expect(seekIndicator()).toEqual({ back: "− 5", forward: null });

    await press("k");
    await press(".");
    expect(video().currentTime).toBeCloseTo(25 + 1 / 30, 10);
    expect(seekIndicator()).toEqual({ back: "− 5", forward: null });
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
    // Jump, the default, adds the pick at the end of the history.
    await press("ArrowLeft");
    expect(video().src).toContain("item-video-2");
  });

  it("R, with Random behavior on Insert, puts the pick right after the playing item, keeping the plays ahead after it", async () => {
    localStorage.setItem("rr_device.randomization.behavior", '"insert"');
    const server = serverPicking(VIDEO_ITEM, SECOND_VIDEO, THIRD_VIDEO);
    await mount(server);
    await press("k");
    await press("ArrowRight");
    await press("ArrowLeft");
    expect(video().src).toContain("item-video?");

    await press("r");
    expect(randomPicks(server)).toBe(3);
    expect(video().src).toContain("item-video-3");
    await press("ArrowRight");
    expect(video().src).toContain("item-video-2");
    expect(randomPicks(server)).toBe(3);
    await press("ArrowLeft");
    await press("ArrowLeft");
    expect(video().src).toContain("item-video?");
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

  it("M shows the volume indicator, Muted as it mutes and the volume it restores as it unmutes, which the Mute button doesn't", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    fireEvent.input(volumeSlider(), { target: { value: "55" } });

    await click(button("Mute"));
    expect([isLit("Mute"), volumeIndicator().shown]).toEqual([true, false]);
    await click(button("Mute"));
    expect([isLit("Mute"), volumeIndicator().shown]).toEqual([false, false]);

    await press("m");
    expect([isLit("Mute"), volumeIndicator()]).toEqual([true, { shown: true, text: "Muted" }]);
    await press("m");
    expect([isLit("Mute"), volumeIndicator()]).toEqual([false, { shown: true, text: "55%" }]);
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
    expect(volumeIndicator().text).toBe("Muted");
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

  it("1 to 6 open the panel on Library, Tags, Stats, Filter, Randomization, and Settings, the open tab's key closes it, T and S open Tags and Settings, and P shows or hides it", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    const shown: (string | null)[] = [];
    for (const key of ["1", "1", "2", "3", "4", "5", "6", "t", "s", "s", "p", "p"]) {
      await press(key);
      shown.push(shownTab());
    }
    expect(shown).toEqual(["library", null, "tags", "stats", "filter", "randomization", "settings", "tags", "settings", null, "settings", null]);
  });

  it("Shift+F enters and leaves fullscreen", async () => {
    const fullscreen = stubFullscreenApi();
    await mount(serverPicking(VIDEO_ITEM));
    await press("F", { shiftKey: true });
    expect(fullscreen.requests).toEqual([document.getElementById("fullscreen-stage")]);
    await press("F", { shiftKey: true });
    expect(fullscreen.exits()).toBe(1);
  });

  it("H opens Settings with Keyboard shortcuts expanded, from another tab too", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    expect(shortcutsSection().open).toBe(false);
    await press("h");
    expect(shownTab()).toBe("settings");
    expect(shortcutsSection().open).toBe(true);

    shortcutsSection().open = false;
    await press("2");
    await press("h");
    expect([shownTab(), shortcutsSection().open]).toEqual(["settings", true]);
  });

  it("leave focus on the page when a key closes the panel, Esc included, so Space plays or pauses afterwards", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    for (const key of ["Escape", "s", "6", "p"]) {
      await press("h");
      shortcutsSection().querySelector("summary")!.focus();
      await press(key, {}, document.activeElement!);
      expect(shownTab()).toBeNull();
      expect(document.activeElement).toBe(document.body);
      const before = playIcon();
      expect(await press(" ", {}, document.activeElement!)).toBe(false);
      expect(playIcon()).not.toBe(before);
    }
  });

  it("play or pause on Space while the bell's list is open", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    await click(document.getElementById("notify-btn")!);
    expect(await press(" ", {}, document.activeElement!)).toBe(false);
    expect(playIcon()).toBe("play_arrow");
  });

  it("leave focus on the page when Esc closes the bell's list, so Space plays or pauses afterwards", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("k");
    await loadVideo(65);
    await click(document.getElementById("notify-btn")!);
    (document.querySelector('#notify-list [data-act="close"]') as HTMLElement).focus();
    await press("Escape", {}, document.activeElement!);
    expect(document.getElementById("notify-list")!.hidden).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(await press(" ", {}, document.activeElement!)).toBe(false);
    expect(playIcon()).toBe("play_arrow");
  });

  it("lists every binding in the reference, and H among them", async () => {
    await mount(serverPicking(VIDEO_ITEM));
    await press("6");
    const list = shortcutsSection().querySelector(".shortcut-list")!;
    const rows = Array.from(list.querySelectorAll("dt")).map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["K / Space", "Play or pause, or pause and resume a photo's timer"],
      ["J / L", "Seek back or forward by the seek step"],
      ["← / →", "Previous or next"],
      ["R", "Random"],
      ["F", "Favorite"],
      ["B", "Blacklist"],
      ["Shift+1 – Shift+5", "Rate 1 to 5 stars"],
      ["Shift+0", "Clear the rating"],
      ["- / =", "Rating down or up by half a star"],
      ["A", "Autoplay on or off"],
      ["M", "Mute"],
      [", / .", "One frame back or forward, while a video is paused"],
      ["[ / ]", "Volume down or up by the volume step"],
      ["1 – 6", "Open Library, Tags, Stats, Filter, Randomization, or Settings; the open tab's key closes the panel"],
      ["T", "Tags"],
      ["S", "Settings"],
      ["P", "Show or hide the panel"],
      ["Shift+F", "Fullscreen"],
      ["H", "These shortcuts"],
      ["Esc", "Close the top dialog, a menu, the notifications list, the rating stars, or the panel, clear selection, or leave fullscreen"]
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
    // The dialog takes every key, so Enter presses its focused OK, which closes it.
    expect(document.activeElement?.textContent).toBe("OK");
    expect(await pressFocused("Enter")).toBe(true);
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("repeat only J, L, comma, period, [, ], -, and = while a key is held down", async () => {
    const server = takeRatings(serverPicking(VIDEO_ITEM));
    await mount(server);
    await press("k");
    await loadVideo(65);
    await press("f", { repeat: true });
    await press("m", { repeat: true });
    await press("2", { repeat: true });
    expect([server.requests("POST", "/api/favorite").length, isLit("Mute"), shownTab()]).toEqual([0, false, null]);
    // A held key that acts once still keeps its repeats from the browser, so holding Space or an arrow doesn't scroll or
    // press a focused button.
    expect([await press(" ", { repeat: true }), await press("ArrowRight", { repeat: true }), await press(" ", { repeat: true }, button("Favorite"))]).toEqual([false, false, false]);
    expect([playIcon(), randomPicks(server)]).toEqual(["pause", 1]);

    video().currentTime = 20;
    await press("l", { repeat: true });
    await press("]", { repeat: true });
    await press("[", { repeat: true });
    expect([video().currentTime, volumeSlider().value]).toEqual([25, "95"]);

    await press("=", { repeat: true });
    await press("=", { repeat: true });
    await press("-", { repeat: true });
    await waitFor(() => expect(ratingsSent(server)).toEqual([0.5]));
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

describe("rating keys", () => {
  /** Plays the video, which the random pick gives `rating`, on a server that takes ratings, and returns the page. */
  async function playRated(rating: number | null): Promise<MountedPage> {
    const page = await mount(takeRatings(serverPicking({ ...VIDEO_ITEM, rating })));
    await press("k");
    expect(video().src).toContain("item-video");
    return page;
  }

  it.each([
    [1, "Rated 1 star"],
    [2, "Rated 2 stars"],
    [3, "Rated 3 stars"],
    [4, "Rated 4 stars"],
    [5, "Rated 5 stars"]
  ])("Shift+%i sets the playing item's rating once the keys pause, with a popup naming the file, and opens no panel tab", async (stars, text) => {
    const page = await playRated(null);
    expect(await pressShiftDigit(stars)).toBe(false);
    expect(shownTab()).toBeNull();
    expect(page.server.requests("POST", "/api/rating")).toEqual([]);

    await waitFor(() => expect(page.server.requests("POST", "/api/rating").map((call) => call.body)).toEqual([{ itemId: "item-video", rating: stars, clientId: page.clientId() }]));
    await waitFor(() => expect(popupsShown()).toEqual([`${text} | holiday clip.mp4`]));
  });

  it("Shift+0 clears the playing item's rating, with a popup naming the file", async () => {
    const page = await playRated(3);
    expect(await pressShiftDigit(0)).toBe(false);
    expect(shownTab()).toBeNull();

    await waitFor(() => expect(page.server.requests("POST", "/api/rating").map((call) => call.body)).toEqual([{ itemId: "item-video", rating: null, clientId: page.clientId() }]));
    await waitFor(() => expect(popupsShown()).toEqual(["Rating cleared | holiday clip.mp4"]));
  });

  it.each([
    ["-", 1.5, "Rated 1.5 stars"],
    ["=", 2.5, "Rated 2.5 stars"]
  ])("%s steps the rating the random pick gives the playing item by half a star, with a popup naming the file", async (key, stepped, text) => {
    const page = await playRated(2);
    expect(await press(key)).toBe(false);

    await waitFor(() => expect(page.server.requests("POST", "/api/rating").map((call) => call.body)).toEqual([{ itemId: "item-video", rating: stepped, clientId: page.clientId() }]));
    await waitFor(() => expect(popupsShown()).toEqual([`${text} | holiday clip.mp4`]));
  });

  it("- and = repeat while held, sending the last step once the keys pause", async () => {
    const page = await playRated(2);
    await press("=");
    await press("=", { repeat: true });
    await press("=", { repeat: true });
    await press("-", { repeat: true });

    await waitFor(() => expect(ratingsSent(page.server)).toEqual([3]));
    await waitForKeysPause();
    expect(ratingsSent(page.server)).toEqual([3]);
    expect(popupsShown()).toEqual(["Rated 3 stars | holiday clip.mp4"]);
  });

  it("Shift+3 then Shift+4 within the keys' pause send one request, with 4 stars", async () => {
    const page = await playRated(null);
    await pressShiftDigit(3);
    await pressShiftDigit(4);

    await waitFor(() => expect(ratingsSent(page.server)).toEqual([4]));
    await waitForKeysPause();
    expect(ratingsSent(page.server)).toEqual([4]);
    expect(popupsShown()).toEqual(["Rated 4 stars | holiday clip.mp4"]);
  });

  it("do nothing while nothing plays, while typing in a text field, or while the server asks for pairing", async () => {
    const server = takeRatings(serverPicking({ ...VIDEO_ITEM, rating: 2 }));
    await mount(server);
    await pressShiftDigit(3);
    await press("=");
    await press("-");
    expect(shownTab()).toBeNull();

    await press("k");
    await press("1");
    const search = screen.getByRole("searchbox", { name: "Search library", hidden: true });
    search.focus();
    expect([await pressShiftDigit(3, search), await pressShiftDigit(0, search), await press("=", {}, search), await press("-", {}, search)]).toEqual([true, true, true, true]);
    search.blur();

    server.on("POST", "/api/favorite", () => status(401));
    await press("f");
    await waitFor(() => expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex"));
    expect(document.querySelector("dialog[open]")).toBeNull();
    await pressShiftDigit(3);
    await press("=");
    await press("-");

    await waitForKeysPause();
    expect(ratingsSent(server)).toEqual([]);
    expect(popupsShown()).toEqual([]);
  });
});

describe("the Stats tab's rating", () => {
  /** A server that plays two videos, reads each one rated 2 stars for the Stats tab, and takes ratings. */
  function ratingServer(): FakeServer {
    const server = takeRatings(serverPicking(VIDEO_ITEM, SECOND_VIDEO));
    server.on("POST", "/api/library/item", (call) => json({ id: call.body?.id, sourceId: "s1", fileName: "clip.mp4", mediaType: 0, rating: 2, tags: [] }));
    return server;
  }

  /** Plays both videos, the second one now, and opens the Stats tab on it, whose stars it returns once they show. */
  async function openOnSecond(server: FakeServer): Promise<HTMLElement> {
    stubStarLayout();
    await mount(server);
    await press("k");
    await press("ArrowRight");
    expect(video().src).toContain("item-video-2");
    await press("3");
    await waitFor(() => expect(document.querySelector("#stats-body .rating")).not.toBeNull());
    return document.querySelector<HTMLElement>("#stats-body .rating")!;
  }

  it.each(["mouse", "touch"])(
    "still play the previous or next item after a %s sets the rating, which leaves focus where it was",
    async (pointerType) => {
      const server = ratingServer();
      const stars = await openOnSecond(server);
      const focused = document.activeElement;
      expect(focused).not.toBe(stars);

      // A click or tap on the third star's right half, in the order a browser sends its events: a mouse's `mousedown`
      // comes with its press and a tap's after it lifts, and unless it is cancelled a browser takes focus off the
      // focused control, which this shows as focus on the stars.
      const x = STARS_LEFT + STAR_WIDTH * 2 + 27;
      const pointer = { pointerId: 1, pointerType, button: 0, clientX: x };
      const mouseDown = () => {
        if (fireEvent.mouseDown(stars, { button: 0, clientX: x })) stars.focus();
      };
      fireEvent.pointerDown(stars, pointer);
      if (pointerType === "mouse") mouseDown();
      fireEvent.pointerUp(stars, pointer);
      if (pointerType === "touch") mouseDown();
      fireEvent.mouseUp(stars, { button: 0, clientX: x });
      fireEvent.click(stars, { button: 0, clientX: x });
      await settle();

      expect(starsShown(stars)).toBe(3);
      await waitFor(() => expect(server.requests("POST", "/api/rating").map((call) => call.body?.rating)).toEqual([3]));
      expect(document.activeElement).toBe(focused);

      await press("ArrowLeft", {}, document.activeElement ?? document.body);
      expect(video().src).toContain("item-video?");
      await press("ArrowRight", {}, document.activeElement ?? document.body);
      expect(video().src).toContain("item-video-2");
      expect(server.requests("POST", "/api/rating")).toHaveLength(1);
    }
  );
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
