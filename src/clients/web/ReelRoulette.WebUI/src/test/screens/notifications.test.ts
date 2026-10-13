// @vitest-environment happy-dom
import { fireEvent, waitFor, within } from "@testing-library/preact";
import { h, render as renderInto } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POPUP_SETTINGS_KEY, timeAgo, type NotifyRequest, type PopupSettings } from "../../notifications/notifications";
import { createAppServices, type AppServices } from "../../state/appServices";
import { RECONNECTING_DETAIL } from "../../state/lastingStates";
import { App } from "../../ui/App";
import {
  API_BASE_URL,
  FakeServer,
  IPHONE_USER_AGENT,
  SSE_URL,
  currentStyle,
  json,
  mountPage,
  pageReady,
  pressKey,
  resetPage,
  setViewport,
  settle,
  stubCoarsePointer,
  stubFullscreenApi,
  stubLayoutSize,
  stubSafeAreaInsets,
  useStylesheet
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

/** Unmounts what `mountWithServices` mounted. */
let unmountServices: (() => void) | null = null;

/**
 * Mounts the page with services the test holds, without connecting to the server, so a test sends messages and sets
 * the lasting states itself and nothing the connection does adds to them.
 */
async function mountWithServices(server = new FakeServer()): Promise<AppServices> {
  vi.stubGlobal("fetch", server.fetch);
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  const services = createAppServices({ apiBaseUrl: API_BASE_URL, sseUrl: SSE_URL });
  services.connection.start = () => {};
  renderInto(h(App, { services }), root);
  unmountServices = () => renderInto(null, root);
  await flush();
  return services;
}

/** Keeps popup settings on this device, as the Settings tab will, before the page reads them. */
function keepSettings(settings: Partial<Omit<PopupSettings, "kinds">> & { kinds?: Partial<PopupSettings["kinds"]> }): void {
  localStorage.setItem(`rr_device.${POPUP_SETTINGS_KEY}`, JSON.stringify(settings));
}

function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
}

/** Lets renders finish, with real or fake timers. */
async function flush(): Promise<void> {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
  } else {
    await settle();
  }
}

async function wait(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await flush();
}

async function notify(services: AppServices, request: NotifyRequest): Promise<void> {
  services.notifications.notify(request);
  await flush();
}

function stage(): HTMLElement {
  return document.getElementById("fullscreen-stage")!;
}

function playerColumn(): HTMLElement {
  return stage().querySelector<HTMLElement>("main.player-col")!;
}

function mediaArea(): HTMLElement {
  return document.getElementById("media-container")!;
}

function host(): HTMLElement {
  return document.getElementById("toasts")!;
}

/** The popups showing, oldest first, leaving out those fading as they close. */
function toasts(): HTMLElement[] {
  return [...host().querySelectorAll<HTMLElement>(".toast:not(.is-leaving)")];
}

function toastTexts(): string[] {
  return toasts().map((toast) => toast.querySelector(".toast-text > div")!.textContent ?? "");
}

function dismissButton(toast: HTMLElement): HTMLButtonElement {
  return within(toast).getByRole("button", { name: "Dismiss" }) as HTMLButtonElement;
}

function bell(): HTMLButtonElement {
  return document.getElementById("notify-btn") as HTMLButtonElement;
}

function badge(): HTMLElement {
  return bell().querySelector<HTMLElement>(".notify-badge")!;
}

function list(): HTMLElement {
  return document.getElementById("notify-list")!;
}

function listTitle(): HTMLElement {
  return document.getElementById("notify-title")!;
}

function listButton(name: "Clear" | "Close"): HTMLButtonElement {
  return within(list()).getByRole("button", { name, hidden: true }) as HTMLButtonElement;
}

function part(name: "now" | "recent"): HTMLElement {
  return list().querySelector<HTMLElement>(`[data-part="${name}"]`)!;
}

interface Row {
  icon: string;
  text: string;
  time: string;
  detail: string | null;
  classes: string[];
}

function rows(name: "now" | "recent"): Row[] {
  return [...part(name).querySelectorAll<HTMLElement>(".notify-entry")].map((row) => ({
    icon: row.querySelector(".material-symbol-icon")!.textContent ?? "",
    text: row.querySelector(".notify-text")!.textContent ?? "",
    time: row.querySelector(".notify-time")!.textContent ?? "",
    detail: row.querySelector(".notify-detail")?.textContent ?? null,
    classes: [...row.classList].filter((name) => name !== "notify-entry")
  }));
}

function emptyText(): HTMLElement {
  return list().querySelector<HTMLElement>(".notify-empty")!;
}

function pointer(type: "pointerenter" | "pointerleave" | "pointerdown", target: Element, init: PointerEventInit): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: type === "pointerdown", ...init }));
}

function windowPointer(type: "pointermove" | "pointerup" | "pointercancel", clientX: number): void {
  window.dispatchEvent(new PointerEvent(type, { pointerType: "touch", clientX }));
}

/** Whether a computed style makes a stacking context, which would keep the popups under the overlay panel. */
function stacks(style: CSSStyleDeclaration): boolean {
  const value = (name: string) => style.getPropertyValue(name).trim();
  return (
    !["", "auto"].includes(value("z-index")) ||
    !["", "none"].includes(value("contain")) ||
    !["", "normal"].includes(value("container-type")) ||
    !["", "none"].includes(value("container")) ||
    !["", "auto"].includes(value("isolation"))
  );
}

function orange(): string {
  return currentStyle(document.documentElement).getPropertyValue("--huggins-orange").trim();
}

beforeEach(() => {
  resetPage();
});

afterEach(() => {
  unmountServices?.();
  unmountServices = null;
});

describe("the main page", () => {
  it("has no status line, and no diagnostics line, on a mobile browser too", async () => {
    resetPage(IPHONE_USER_AGENT);
    const server = new FakeServer();
    mountPage({ server });
    await pageReady(server);

    expect(document.getElementById("status")).toBeNull();
    expect(document.querySelector(".status, .status-bottom")).toBeNull();
    expect(document.getElementById("mobile-diagnostics")).toBeNull();
    expect(document.body.textContent).not.toContain("Diagnostics:");
    expect(stage().nextElementSibling).toBeNull();
  });
});

describe("popups", () => {
  it("show a card with the kind's icon, the message, its second line, and Dismiss, which closes it, taking no focus", async () => {
    useFakeClock();
    useStylesheet();
    const services = await mountWithServices();
    const play = document.getElementById("play-btn")!;
    play.focus();

    await notify(services, { kind: "actions", text: "Added to favorites", detail: "holiday clip.mp4" });
    const [toast] = toasts();
    expect(toast).toBeDefined();
    const icon = toast!.querySelector(".material-symbol-icon")!;
    expect(icon.textContent).toBe("check_circle");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(toast!.querySelector(".toast-text > div")!.textContent).toBe("Added to favorites");
    expect(toast!.querySelector(".toast-detail")!.textContent).toBe("holiday clip.mp4");
    expect(toast!.classList.contains("is-warning")).toBe(false);
    expect(document.activeElement).toBe(play);
    expect(host().getAttribute("role")).toBe("status");
    expect(host().getAttribute("aria-live")).toBe("polite");
    // Beside the player, which clips what it holds, in the player column.
    expect(host().parentElement).toBe(playerColumn());
    expect(mediaArea().parentElement).toBe(playerColumn());
    expect(currentStyle(host()).pointerEvents).toBe("none");
    expect(currentStyle(toast!).pointerEvents).toBe("auto");
    expect(currentStyle(toast!).touchAction).toBe("pan-y");

    // A message the kind's icon would misread has its own, and one with no second line has none.
    await notify(services, { kind: "connection", icon: "sync_problem", text: "Library browse failed. Showing the tiles already loaded." });
    const browse = toasts().at(-1)!;
    expect(browse.querySelector(".material-symbol-icon")!.textContent).toBe("sync_problem");
    expect(browse.querySelector(".toast-detail")).toBeNull();
    expect(document.activeElement).toBe(play);

    fireEvent.click(dismissButton(toast!));
    await flush();
    expect(toast!.classList.contains("is-leaving")).toBe(true);
    expect(toastTexts()).toEqual(["Library browse failed. Showing the tiles already loaded."]);
    await wait(200);
    expect(toast!.isConnected).toBe(false);
  });

  it("show at most three, newest nearest the edge, and the cap closes the oldest that isn't a warning", async () => {
    useFakeClock();
    const services = await mountWithServices();
    await notify(services, { kind: "refresh", text: "Library refresh failed", warning: true, key: "refresh" });
    for (const text of ["First", "Second", "Third"]) {
      await notify(services, { kind: "actions", text });
    }
    expect(toastTexts()).toEqual(["Library refresh failed", "Second", "Third"]);
    expect(toasts()[0]!.classList.contains("is-warning")).toBe(true);
    expect(toasts()[0]!.querySelector(".material-symbol-icon")!.textContent).toBe("warning");

    await notify(services, { kind: "refresh", text: "Second warning", warning: true, key: "w2" });
    await notify(services, { kind: "refresh", text: "Third warning", warning: true, key: "w3" });
    expect(toastTexts()).toEqual(["Library refresh failed", "Second warning", "Third warning"]);
    expect(badge().hidden).toBe(true);

    // While three warnings show, a new popup goes to the list only, and the bell counts it.
    await notify(services, { kind: "actions", text: "Added to favorites" });
    expect(toastTexts()).toEqual(["Library refresh failed", "Second warning", "Third warning"]);
    expect(services.notifications.entries.value[0]!.text).toBe("Added to favorites");
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe("1");
  });

  it("replace the one showing with the same key in its place, starting its time over", async () => {
    useFakeClock();
    const services = await mountWithServices();
    await notify(services, { kind: "skips", text: "Skipped a missing file.", detail: "one.mp4", key: "skip" });
    await notify(services, { kind: "actions", text: "Filters applied." });
    const first = toasts()[0]!;
    await wait(4000);

    await notify(services, { kind: "skips", text: "Skipped a file this browser can't play.", detail: "two.mp4", key: "skip" });
    expect(toastTexts()).toEqual(["Skipped a file this browser can't play.", "Filters applied."]);
    expect(toasts()[0]).toBe(first);
    expect(first.querySelector(".toast-detail")!.textContent).toBe("two.mp4");

    await wait(4000);
    expect(toastTexts()).toEqual(["Skipped a file this browser can't play."]);
    await wait(1000);
    expect(toasts()).toEqual([]);
  });

  it("keep a warning until it is closed", async () => {
    useFakeClock();
    const services = await mountWithServices();
    await notify(services, { kind: "refresh", text: "Library refresh failed", detail: "Source unavailable.", warning: true });
    await wait(10 * 60_000);
    expect(toastTexts()).toEqual(["Library refresh failed"]);

    fireEvent.click(dismissButton(toasts()[0]!));
    await wait(200);
    expect(host().childElementCount).toBe(0);
  });

  it("pause while a mouse or pen points at one, or focus is in it, without taking more off, and not for a touch", async () => {
    useFakeClock();
    const services = await mountWithServices();
    await notify(services, { kind: "actions", text: "Paired." });
    const toast = toasts()[0]!;
    await wait(2000);

    pointer("pointerenter", toast, { pointerType: "mouse" });
    await wait(10_000);
    expect(toasts()).toEqual([toast]);
    fireEvent.focusIn(dismissButton(toast));
    await wait(10_000);
    pointer("pointerleave", toast, { pointerType: "mouse" });
    // Focus still holds it.
    await wait(10_000);
    expect(toasts()).toEqual([toast]);
    fireEvent.focusOut(dismissButton(toast));
    // The 3 seconds it had left when the mouse came: the second hold took nothing more off.
    await wait(2900);
    expect(toasts()).toEqual([toast]);
    await wait(200);
    expect(toasts()).toEqual([]);

    await notify(services, { kind: "actions", text: "Paired with a pen." });
    const penned = toasts()[0]!;
    await wait(4500);
    pointer("pointerenter", penned, { pointerType: "pen" });
    await wait(10_000);
    expect(toasts()).toEqual([penned]);
    pointer("pointerleave", penned, { pointerType: "pen" });
    // A popup paused near its end keeps a little time, so it doesn't close the moment the pointer leaves.
    await wait(700);
    expect(toasts()).toEqual([penned]);
    await wait(200);
    expect(toasts()).toEqual([]);

    await notify(services, { kind: "actions", text: "Touched." });
    const touched = toasts()[0]!;
    pointer("pointerenter", touched, { pointerType: "touch" });
    await wait(5000);
    expect(toasts()).toEqual([]);
  });

  it("close on a swipe to either side past 64 px on a touch screen, and snap back on a shorter one", async () => {
    useFakeClock();
    const services = await mountWithServices();
    await notify(services, { kind: "actions", text: "Filters applied." });
    const toast = toasts()[0]!;

    pointer("pointerdown", toast, { pointerType: "touch", clientX: 100 });
    windowPointer("pointermove", 150);
    expect(toast.style.transform).toBe("translateX(50px)");
    expect(Number(toast.style.opacity)).toBeCloseTo(1 - 50 / 220);
    windowPointer("pointerup", 150);
    await flush();
    expect(toasts()).toEqual([toast]);
    expect(toast.style.transform).toBe("");
    expect(toast.style.opacity).toBe("");

    // A mouse drag and a press on Dismiss don't swipe.
    pointer("pointerdown", toast, { pointerType: "mouse", clientX: 100 });
    windowPointer("pointermove", 300);
    windowPointer("pointerup", 300);
    pointer("pointerdown", dismissButton(toast), { pointerType: "touch", clientX: 100 });
    windowPointer("pointermove", 300);
    windowPointer("pointerup", 300);
    await flush();
    expect(toasts()).toEqual([toast]);
    expect(toast.style.transform).toBe("");

    pointer("pointerdown", toast, { pointerType: "touch", clientX: 300 });
    windowPointer("pointermove", 200);
    expect(Number(toast.style.opacity)).toBeCloseTo(1 - 100 / 220);
    windowPointer("pointermove", 100);
    expect(toast.style.opacity).toBe("0.2");
    windowPointer("pointercancel", 100);
    await flush();
    expect(toasts()).toEqual([]);
    await flush();
    expect(toast.isConnected).toBe(false);
  });

  it("don't pop up while the list is open, where a popup showing with a new message's key closes and the list shows the message", async () => {
    useFakeClock();
    const services = await mountWithServices();
    await notify(services, { kind: "refresh", text: "Library refresh failed", warning: true, key: "refresh" });
    await notify(services, { kind: "actions", text: "Filters applied." });

    await click(bell());
    await notify(services, { kind: "refresh", text: "Library refresh finished", detail: "Added 2", key: "refresh" });
    await notify(services, { kind: "devices", text: "Blacklisted on another device" });
    expect(toastTexts()).toEqual(["Filters applied."]);
    expect(rows("recent").slice(0, 2).map((row) => row.text)).toEqual(["Blacklisted on another device", "Library refresh finished"]);
    expect(badge().hidden).toBe(true);
  });
});

describe("popups' placement", () => {
  it("at the bottom, sit 12 px up, rising above the player's controls while those show, unless the overlay panel covers the player", async () => {
    useStylesheet();
    await mountWithServices();
    expect(host().dataset.pos).toBe("bottom-center");
    expect(mediaArea().classList.contains("controls-visible")).toBe(true);
    expect(currentStyle(host()).bottom).toBe("112px");

    mediaArea().classList.remove("controls-visible");
    expect(currentStyle(host()).bottom).toBe("12px");
    mediaArea().classList.add("controls-visible");

    setViewport({ width: 700, height: 800 });
    await flush();
    await click(document.getElementById("panel-btn")!);
    expect(stage().dataset.panelMode).toBe("overlay");
    expect(stage().classList.contains("covers-player")).toBe(true);
    expect(currentStyle(host()).bottom).toBe("12px");

    await click(document.getElementById("panel-close-btn")!);
    expect(stage().classList.contains("covers-player")).toBe(false);
    expect(currentStyle(host()).bottom).toBe("112px");
  });

  it("at the bottom on a phone on its side, rise above the controls clear of the home indicator, outside pseudo-fullscreen", async () => {
    resetPage(IPHONE_USER_AGENT);
    useStylesheet();
    stubFullscreenApi();
    stubSafeAreaInsets({ bottom: 21 });
    stubCoarsePointer();
    setViewport({ width: 844, height: 390 });
    await mountWithServices();
    expect(document.body.classList.contains("short-screen")).toBe(true);
    expect(currentStyle(host()).bottom).toBe("calc(112px + 21px)");

    await click(document.getElementById("fullscreen-btn")!);
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);
    expect(currentStyle(host()).bottom).toBe("112px");
  });

  it("at the top, start 64 px down, below the indicator on a player narrower than 600 px", async () => {
    keepSettings({ position: "top-center" });
    useStylesheet();
    stubLayoutSize(800);
    await mountWithServices();
    expect(host().dataset.pos).toBe("top-center");
    expect(playerColumn().classList.contains("is-narrow")).toBe(false);
    expect(currentStyle(host()).top).toBe("64px");
    expect(currentStyle(host()).flexDirection).toBe("column-reverse");

    stubLayoutSize(599);
    setViewport({ width: 900, height: 768 });
    await flush();
    expect(playerColumn().classList.contains("is-narrow")).toBe(true);
    expect(currentStyle(host()).top).toBe("104px");
  });

  it("line up by the position's side, and the newest sits nearest its edge", async () => {
    const expected: Record<string, [string, string]> = {
      "bottom-center": ["center", "column"],
      "bottom-left": ["flex-start", "column"],
      "bottom-right": ["flex-end", "column"],
      "top-center": ["center", "column-reverse"],
      "top-left": ["flex-start", "column-reverse"],
      "top-right": ["flex-end", "column-reverse"]
    };
    for (const [position, [align, direction]] of Object.entries(expected)) {
      unmountServices?.();
      resetPage();
      keepSettings({ position: position as PopupSettings["position"] });
      useStylesheet();
      await mountWithServices();
      const style = currentStyle(host());
      expect([host().dataset.pos, style.alignItems, style.flexDirection]).toEqual([position, align, direction]);
    }
  });

  it("show over the overlay panel, with no stacking context between them, and the list sits inside the stage", async () => {
    useStylesheet();
    setViewport({ width: 700, height: 800 });
    await mountWithServices();
    await click(document.getElementById("panel-btn")!);

    const panelLayer = Number(currentStyle(document.getElementById("panel")!).zIndex);
    expect(panelLayer).toBe(1000);
    expect(Number(currentStyle(host()).zIndex)).toBe(1200);
    expect(Number(currentStyle(host()).zIndex)).toBeGreaterThan(panelLayer);
    expect(currentStyle(playerColumn()).position).toBe("relative");
    expect(currentStyle(playerColumn()).overflow).toBe("hidden");
    expect(stacks(currentStyle(playerColumn()))).toBe(false);
    expect(stacks(currentStyle(stage()))).toBe(false);

    expect(list().parentElement).toBe(stage());
    expect(list().tagName).toBe("SECTION");
    expect(currentStyle(list()).position).toBe("fixed");
    expect(currentStyle(list()).zIndex).toBe("1500");
  });

  it("take no motion under reduced motion", async () => {
    useStylesheet();
    await mountWithServices();
    const reduced = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .filter((rule): rule is CSSMediaRule => (rule as CSSMediaRule).media?.mediaText.includes("prefers-reduced-motion"))
      .flatMap((rule) => Array.from(rule.cssRules) as CSSStyleRule[]);
    const rule = reduced.find((candidate) => candidate.selectorText === ".toast, .toasts");
    expect([rule?.style.animation, rule?.style.transition]).toEqual(["none", "none"]);
  });
});

describe("the bell", () => {
  it("sits at the player's top left, first of the corner buttons, with its name and a badge that counts what didn't pop up", async () => {
    keepSettings({ popups: false });
    useStylesheet();
    const services = await mountWithServices();

    expect(bell().parentElement).toBe(document.getElementById("overlay-controls"));
    const corners = [...document.querySelectorAll("#overlay-controls > .overlay-corner-btn")].map((button) => button.id);
    expect(corners).toEqual(["notify-btn", "panel-btn", "favorite-btn", "blacklist-btn"]);
    expect(currentStyle(bell()).left).toBe("12px");
    expect(bell().querySelector(".material-symbol-icon")!.textContent).toBe("notifications");
    expect(bell().getAttribute("aria-label")).toBe("Notifications");
    expect(bell().title).toBe("Notifications");
    expect(bell().getAttribute("aria-controls")).toBe("notify-list");
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(badge().hidden).toBe(true);

    await notify(services, { kind: "actions", text: "Paired." });
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe("1");
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 1 unread");
    expect(bell().title).toBe("Notifications, 1 unread");

    for (let i = 0; i < 9; i++) {
      services.notifications.notify({ kind: "actions", text: `Message ${i}` });
    }
    await flush();
    expect(badge().textContent).toBe("9+");
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 10 unread");

    await click(bell());
    expect(badge().hidden).toBe(true);
    expect(bell().getAttribute("aria-label")).toBe("Notifications");
  });

  it("toggles the list, orange while it is open, and starts no random pick with nothing playing", async () => {
    useStylesheet();
    const server = new FakeServer();
    server.on("POST", "/api/random", () => json(VIDEO_ITEM));
    await mountWithServices(server);

    await click(bell());
    expect(list().hidden).toBe(false);
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    expect(currentStyle(bell()).color).toBe(orange());
    expect(document.activeElement).toBe(listTitle());

    await click(bell());
    expect(list().hidden).toBe(true);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(currentStyle(bell()).color).not.toBe(orange());
    expect(server.requests("POST", "/api/random")).toEqual([]);
  });

  it("keeps the player's controls shown while the list is open", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => json(VIDEO_ITEM));
    server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    const services = await mountWithServices(server);
    await click(document.getElementById("empty-state")!);
    await waitFor(() => expect(services.store.current.value).not.toBeNull());

    await click(mediaArea());
    expect(mediaArea().classList.contains("controls-visible")).toBe(false);
    services.notifications.openList();
    await flush();
    expect(mediaArea().classList.contains("controls-visible")).toBe(true);
    services.notifications.closeList();
    await flush();
    expect(mediaArea().classList.contains("controls-visible")).toBe(false);
  });
});

describe("the list", () => {
  it("shows each active lasting state under Now with its full text and second line", async () => {
    const services = await mountWithServices();
    const { store } = services;
    await click(bell());
    expect(part("now").hidden).toBe(true);
    expect(part("recent").querySelector(".notify-group-title")!.hasAttribute("hidden")).toBe(true);
    expect(emptyText().hidden).toBe(false);
    expect(emptyText().textContent).toBe("No notifications yet.");

    store.reconnecting.value = true;
    store.compatibilityBlocked.value = true;
    store.compatibilityMessage.value = "Server API 3 is newer than this page supports (API 2).";
    store.libraryState.value = "missing";
    store.libraryMessage.value = "The library file is missing.";
    store.refreshProgress.value = { stage: "Scanning durations", percent: 42 };
    await flush();

    expect(part("now").hidden).toBe(false);
    expect(emptyText().hidden).toBe(true);
    expect(rows("now")).toEqual([
      { icon: "sync", text: "Reconnecting…", time: "", detail: RECONNECTING_DETAIL, classes: [] },
      { icon: "sync_problem", text: "Server not compatible", time: "", detail: "Server API 3 is newer than this page supports (API 2).", classes: ["is-warning"] },
      { icon: "warning", text: "Running without a library", time: "", detail: "The library file is missing.", classes: ["is-warning"] },
      { icon: "autorenew", text: "Library refresh: Scanning durations (42%)", time: "", detail: null, classes: [] }
    ]);

    store.reconnecting.value = false;
    store.compatibilityBlocked.value = false;
    store.libraryState.value = "ready";
    store.refreshProgress.value = null;
    await flush();
    expect(part("now").hidden).toBe(true);
    expect(emptyText().hidden).toBe(false);
  });

  it("shows Recent newest first with their times, which move on while it is open, and marks what didn't pop up", async () => {
    useFakeClock();
    vi.setSystemTime(new Date(2026, 9, 13, 14, 5, 0));
    keepSettings({ kinds: { devices: false } });
    const services = await mountWithServices();
    await notify(services, { kind: "devices", text: "Blacklisted on another device", detail: "holiday clip.mp4" });
    const first = Date.now();
    await wait(3 * 60_000);
    await notify(services, { kind: "actions", text: "Filters applied." });
    expect(badge().textContent).toBe("1");

    await click(bell());
    expect(part("recent").querySelector(".notify-group-title")!.hasAttribute("hidden")).toBe(false);
    expect(rows("recent")).toEqual([
      { icon: "check_circle", text: "Filters applied.", time: "Just now", detail: null, classes: [] },
      { icon: "devices", text: "Blacklisted on another device", time: "3 min ago", detail: "holiday clip.mp4", classes: ["is-unread"] }
    ]);
    expect(emptyText().hidden).toBe(true);

    await wait(30_000);
    expect(rows("recent").map((row) => row.time)).toEqual(["Just now", "3 min ago"]);
    await wait(30_000);
    expect(rows("recent").map((row) => row.time)).toEqual(["1 min ago", "4 min ago"]);
    await wait(60 * 60_000);
    expect(rows("recent")[1]!.time).toBe(timeAgo(first, Date.now()));
    expect(rows("recent")[1]!.time).toBe(new Date(first).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));

    // Once seen, it is no longer marked.
    await click(bell());
    await click(bell());
    expect(rows("recent").map((row) => row.classes)).toEqual([[], []]);
  });

  it("keeps every in-app notice, unmarked, with the error icon, and the bell doesn't count it", async () => {
    const services = await mountWithServices();
    void services.dialogs.notice("Saving presets failed (500).");
    await flush();
    fireEvent.click(within(document.querySelector("dialog.app-dialog") as HTMLElement).getByRole("button", { name: "OK" }));
    await flush();
    expect(badge().hidden).toBe(true);
    expect(toasts()).toEqual([]);

    await click(bell());
    expect(rows("recent")).toEqual([{ icon: "error", text: "Saving presets failed (500).", time: "Just now", detail: null, classes: ["is-error"] }]);
  });

  it("keeps the last 50 messages, and Clear empties it", async () => {
    keepSettings({ popups: false });
    const services = await mountWithServices();
    for (let i = 0; i < 55; i++) {
      services.notifications.notify({ kind: "actions", text: `Message ${i}` });
    }
    await flush();

    await click(bell());
    const recent = rows("recent");
    expect(recent.length).toBe(50);
    expect([recent[0]!.text, recent[49]!.text]).toEqual(["Message 54", "Message 5"]);
    expect(listButton("Clear").disabled).toBe(false);

    bell().focus();
    await click(listButton("Clear"));
    expect(rows("recent")).toEqual([]);
    expect(emptyText().hidden).toBe(false);
    expect(listButton("Clear").disabled).toBe(true);
    expect(document.activeElement).toBe(listTitle());
    expect(list().hidden).toBe(false);
  });

  it("closes on its Close, the bell, and Escape, giving focus back to the bell", async () => {
    await mountWithServices();
    expect(list().getAttribute("role")).toBe("dialog");
    expect(list().getAttribute("aria-labelledby")).toBe("notify-title");
    expect(listTitle().textContent).toBe("Notifications");
    expect(list().hidden).toBe(true);

    await click(bell());
    expect(document.activeElement).toBe(listTitle());
    await click(listButton("Close"));
    expect(list().hidden).toBe(true);
    expect(document.activeElement).toBe(bell());

    await click(bell());
    expect(document.activeElement).toBe(listTitle());
    await click(bell());
    expect(list().hidden).toBe(true);
    expect(document.activeElement).toBe(bell());

    await click(bell());
    const allowed = await pressKey(listTitle(), "Escape");
    expect(allowed).toBe(false);
    expect(list().hidden).toBe(true);
    expect(document.activeElement).toBe(bell());
  });

  it("takes Escape before the stage, so the panel stays open, but not while an in-app dialog is open", async () => {
    const services = await mountWithServices();
    await click(document.getElementById("panel-btn")!);
    expect(services.panel.isOpen.value).toBe(true);

    await click(bell());
    expect(list().hidden).toBe(false);
    await pressKey(listTitle(), "Escape");
    expect(list().hidden).toBe(true);
    expect(services.panel.isOpen.value).toBe(true);

    void services.dialogs.notice("Saving presets failed (500).");
    services.notifications.openList();
    await flush();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await flush();
    expect(list().hidden).toBe(false);
  });

  it("closes on a press outside it and when the panel opens, leaving focus where they put it", async () => {
    await mountWithServices();
    await click(bell());
    fireEvent.pointerDown(listTitle());
    fireEvent.pointerDown(bell());
    await flush();
    expect(list().hidden).toBe(false);

    const play = document.getElementById("play-btn")!;
    play.focus();
    fireEvent.pointerDown(mediaArea());
    await flush();
    expect(list().hidden).toBe(true);
    expect(document.activeElement).toBe(play);

    await click(bell());
    expect(document.activeElement).toBe(listTitle());
    await click(document.getElementById("panel-btn")!);
    expect(list().hidden).toBe(true);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).not.toBe(bell());
  });

  it("opens under the bell, lined up with its left edge in the window's left half and its right edge in the right half", async () => {
    await mountWithServices();
    let rect = new DOMRect(12, 12, 44, 44);
    bell().getBoundingClientRect = () => rect;

    await click(bell());
    expect([list().style.left, list().style.top, list().style.maxHeight]).toEqual(["12px", "62px", `${768 - 56 - 18}px`]);
    await click(bell());

    // 380 px wide, ending at the bell's right edge.
    rect = new DOMRect(900, 12, 44, 44);
    await click(bell());
    expect(list().style.left).toBe(`${944 - 380}px`);

    // Kept 8 px from the window's edge, and placed again as the window resizes.
    rect = new DOMRect(980, 40, 44, 44);
    setViewport({ width: 1024, height: 300 });
    await flush();
    expect([list().style.left, list().style.top, list().style.maxHeight]).toEqual([`${1024 - 380 - 8}px`, "90px", "220px"]);
  });
});

describe("the popup settings", () => {
  it("start on for every kind, at the bottom center, in fullscreen too, for 5 seconds", async () => {
    useFakeClock();
    stubFullscreenApi();
    const services = await mountWithServices();
    expect(services.notifications.settings.value).toEqual({
      popups: true,
      kinds: { actions: true, devices: true, refresh: true, skips: true, connection: true },
      position: "bottom-center",
      fullscreen: true,
      seconds: 5
    });
    expect(host().dataset.pos).toBe("bottom-center");

    for (const kind of ["actions", "devices", "refresh", "skips", "connection"] as const) {
      await notify(services, { kind, text: `A ${kind} message` });
      expect(toastTexts()).toContain(`A ${kind} message`);
      services.notifications.dismissAll();
      await flush();
    }

    await click(document.getElementById("fullscreen-btn")!);
    expect(services.fullscreen.active.value).toBe(true);
    await notify(services, { kind: "actions", text: "Filters applied." });
    expect(toastTexts()).toEqual(["Filters applied."]);
    await wait(4999);
    expect(toastTexts()).toEqual(["Filters applied."]);
    await wait(1);
    expect(toastTexts()).toEqual([]);
    expect(badge().hidden).toBe(true);
  });

  it("send a kind that is off only to the list, which the bell counts, and the others still pop up", async () => {
    keepSettings({ kinds: { actions: false } });
    const services = await mountWithServices();
    await notify(services, { kind: "actions", text: "Added to favorites" });
    expect(toasts()).toEqual([]);
    expect(badge().textContent).toBe("1");
    await notify(services, { kind: "devices", text: "Blacklisted on another device" });
    expect(toastTexts()).toEqual(["Blacklisted on another device"]);
    expect(badge().textContent).toBe("1");
  });

  it("with Show popups off, send every message only to the list", async () => {
    keepSettings({ popups: false });
    const services = await mountWithServices();
    for (const kind of ["actions", "devices", "refresh", "skips", "connection"] as const) {
      await notify(services, { kind, text: `A ${kind} message` });
    }
    expect(toasts()).toEqual([]);
    expect(badge().textContent).toBe("5");
  });

  it("show popups where Position says", async () => {
    keepSettings({ position: "top-right" });
    const services = await mountWithServices();
    expect(host().dataset.pos).toBe("top-right");
    await notify(services, { kind: "actions", text: "Paired." });
    expect(toastTexts()).toEqual(["Paired."]);
  });

  it("show popups for as long as Show for says", async () => {
    for (const seconds of [3, 10]) {
      unmountServices?.();
      resetPage();
      useFakeClock();
      keepSettings({ seconds });
      const services = await mountWithServices();
      await notify(services, { kind: "actions", text: "Paired." });
      await wait(seconds * 1000 - 1);
      expect(toastTexts()).toEqual(["Paired."]);
      await wait(1);
      expect(toastTexts()).toEqual([]);
    }
  });

  it("with Show in fullscreen off, close the popups showing on entering fullscreen, and send messages there only to the list", async () => {
    useFakeClock();
    keepSettings({ fullscreen: false });
    const fake = stubFullscreenApi();
    const services = await mountWithServices();
    await notify(services, { kind: "refresh", text: "Library refresh failed", warning: true });
    await notify(services, { kind: "actions", text: "Filters applied." });
    expect(toasts().length).toBe(2);

    await click(document.getElementById("fullscreen-btn")!);
    expect(fake.requests).toEqual([stage()]);
    expect(toasts()).toEqual([]);
    await notify(services, { kind: "devices", text: "Blacklisted on another device" });
    expect(toasts()).toEqual([]);
    expect(badge().textContent).toBe("1");

    await click(document.getElementById("fullscreen-btn")!);
    expect(services.fullscreen.active.value).toBe(false);
    await notify(services, { kind: "actions", text: "Added to favorites" });
    expect(toastTexts()).toEqual(["Added to favorites"]);
  });

  it("with Show in fullscreen off, do the same in pseudo-fullscreen", async () => {
    resetPage(IPHONE_USER_AGENT);
    useFakeClock();
    keepSettings({ fullscreen: false });
    stubFullscreenApi();
    const services = await mountWithServices();
    await notify(services, { kind: "actions", text: "Filters applied." });
    expect(toasts().length).toBe(1);

    await click(document.getElementById("fullscreen-btn")!);
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);
    expect(toasts()).toEqual([]);
    await notify(services, { kind: "skips", text: "Skipped a missing file.", detail: "one.mp4" });
    expect(toasts()).toEqual([]);
    expect(badge().textContent).toBe("1");

    // Escape leaves pseudo-fullscreen, and popups show again.
    fireEvent.keyDown(document.body, { key: "Escape" });
    await flush();
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(false);
    await notify(services, { kind: "actions", text: "Added to favorites" });
    expect(toastTexts()).toEqual(["Added to favorites"]);
  });
});
