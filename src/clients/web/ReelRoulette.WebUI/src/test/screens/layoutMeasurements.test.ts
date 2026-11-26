// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeServer,
  mountPage,
  nextFrame,
  resetPage,
  setViewport,
  settle,
  stubCoarsePointer,
  stubDevicePixelRatio,
  stubElementProperty,
  stubInstalledApp,
  stubPageSize,
  stubResizeObservers,
  stubSafeAreaInsets,
  stubVisualViewport,
  useStylesheet,
  type MountedPage
} from "./pageHarness";

beforeEach(() => {
  resetPage();
});

/**
 * Mounts the page with Show layout measurements on, unless `on` is false, and the page the window's size, and waits for
 * the figures' first frame.
 */
async function mount(options: { on?: boolean } = {}): Promise<MountedPage> {
  localStorage.setItem("rr_device.developer.layoutMeasurements", String(options.on ?? true));
  stubPageSize();
  const server = new FakeServer();
  const page = mountPage({ server });
  await waitFor(() => expect(server.requests("GET", "/api/version").length).toBeGreaterThan(0));
  await settle();
  await nextFrame();
  return page;
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

/** A figure's text and where its code places it, in px, or null while it doesn't show. */
function placed(id: string): { text: string; left: number; top: number } | null {
  const element = document.getElementById(id);
  return element ? { text: element.textContent!, left: Number.parseFloat(element.style.left), top: Number.parseFloat(element.style.top) } : null;
}

/** The box's lines. */
function details(): string[] {
  return document.getElementById("layout-details")!.textContent!.split("\n");
}

function rulers(): Array<Record<string, string>> {
  return Array.from(document.querySelectorAll<HTMLElement>(".dev-ruler")).map(({ style }) => {
    const edges = ["left", "top", "width", "height"].filter((edge) => style.getPropertyValue(edge));
    return Object.fromEntries(edges.map((edge) => [edge, style.getPropertyValue(edge)]));
  });
}

function probe(): HTMLElement {
  return document.querySelector<HTMLElement>(".dev-safe-probe")!;
}

/** Gives the player column a width and a box, which happy-dom doesn't lay out, that the test changes. */
function stubPlayerColumn(box: { top: number; width: number; height: number }): { column: HTMLElement; box: typeof box } {
  const column = document.querySelector<HTMLElement>(".player-col")!;
  Object.defineProperty(column, "clientWidth", { configurable: true, get: () => box.width });
  stubElementProperty(column, "getBoundingClientRect", () => new DOMRect(0, box.top, box.width, box.height));
  return { column, box };
}

describe("Show layout measurements", () => {
  it("shows nothing and observes nothing while it is off, and while it is on observes what it measures", async () => {
    const observers = stubResizeObservers();
    const visible = stubVisualViewport();
    await mount({ on: false });
    // What the page observes for the figures alone: the panel's box, the Library controls, and the safe areas.
    const ownObserved = () =>
      observers
        .observed()
        .map((element) => (element.classList.contains("dev-safe-probe") ? "safe-area probe" : element.id))
        .filter((name) => ["panel", "library-controls", "safe-area probe"].includes(name));
    expect(document.getElementById("layout-measurements")).toBeNull();
    expect(ownObserved()).toEqual([]);
    expect(visible.listenerCount()).toBe(0);

    await click(screen.getByRole("tab", { name: "Settings", hidden: true }));
    const setting = screen.getByRole("checkbox", { name: "Show layout measurements", hidden: true });
    await click(setting);
    await nextFrame();
    expect(placed("layout-window-width")?.text).toBe("1024 px");
    expect(ownObserved().sort()).toEqual(["library-controls", "panel", "safe-area probe"]);
    expect(visible.listenerCount()).toBe(2);

    await click(setting);
    expect(document.getElementById("layout-measurements")).toBeNull();
    expect(ownObserved()).toEqual([]);
    expect(visible.listenerCount()).toBe(0);
  });

  it("shows the window's width along its top edge and its height up its left edge, inside the safe areas, following a resize and the safe areas", async () => {
    useStylesheet();
    const observers = stubResizeObservers();
    stubSafeAreaInsets({ top: 47, right: 10, bottom: 34, left: 20 });
    setViewport({ width: 1200, height: 800 });
    await mount();
    expect(placed("layout-window-width")).toEqual({ text: "1200 px", left: 605, top: 54 });
    expect(placed("layout-window-height")).toEqual({ text: "800 px", left: 44, top: 407 });
    expect(rulers()).toEqual([
      { left: "20px", top: "50px", width: "1170px" },
      { left: "23px", top: "47px", height: "719px" }
    ]);

    setViewport({ width: 1000, height: 700 });
    await nextFrame();
    expect(placed("layout-window-width")).toEqual({ text: "1000 px", left: 505, top: 54 });
    expect(placed("layout-window-height")).toEqual({ text: "700 px", left: 44, top: 357 });

    // A phone turning moves its safe areas, which the probe's padding holds.
    stubSafeAreaInsets({ left: 47, right: 47, bottom: 21 });
    observers.resize(probe());
    await nextFrame();
    expect(placed("layout-window-width")).toEqual({ text: "1000 px", left: 500, top: 7 });
    expect(placed("layout-window-height")).toEqual({ text: "700 px", left: 71, top: 340 });
  });

  it("shows the player's width centered below the indicator, lower on a narrow player, following the player column", async () => {
    const observers = stubResizeObservers();
    setViewport({ width: 1200, height: 800 });
    await mount();
    const { column, box } = stubPlayerColumn({ top: 60, width: 1200, height: 740 });
    observers.resize(column);
    await nextFrame();
    // The corner buttons sit 12 px down, and the indicator below them.
    expect(placed("layout-player-width")).toEqual({ text: "1200 px", left: 600, top: 112 });

    box.width = 500;
    observers.resize(column);
    await nextFrame();
    expect(placed("layout-player-width")).toEqual({ text: "500 px", left: 250, top: 160 });
  });

  it("keeps the player's width below the status bar on a short screen, and hides it while the overlay panel covers the player", async () => {
    useStylesheet();
    stubCoarsePointer();
    stubSafeAreaInsets({ top: 30 });
    const observers = stubResizeObservers();
    setViewport({ width: 900, height: 400 });
    await mount();
    const { column } = stubPlayerColumn({ top: 0, width: 900, height: 400 });
    observers.resize(column);
    await nextFrame();
    expect(placed("layout-player-width")).toEqual({ text: "900 px", left: 450, top: 70 });

    await click(document.getElementById("panel-btn")!);
    await nextFrame();
    expect(placed("layout-player-width")).toBeNull();
  });

  it("shows the details at the bottom left, inside the safe areas", async () => {
    useStylesheet();
    stubSafeAreaInsets({ top: 0, bottom: 34, left: 20 });
    setViewport({ width: 1200, height: 800 });
    await mount();

    expect(details()).toEqual([
      "Pixel ratio: 1",
      "Layout: beside the player, right",
      "Safe area: 0 top · 0 right · 34 bottom · 20 left",
      "Library controls: not showing",
      "Pointer: mouse",
      "Running as: browser tab"
    ]);
    const { style } = document.getElementById("layout-details")!;
    expect([style.left, style.bottom, style.transform]).toEqual(["28px", "42px", "scale(1)"]);
  });

  it("shows a phone's details, following the Library controls' width against 520 px", async () => {
    stubDevicePixelRatio(2.625);
    stubCoarsePointer();
    stubInstalledApp();
    const observers = stubResizeObservers();
    setViewport({ width: 900, height: 400 });
    await mount();
    const controls = document.getElementById("library-controls")!;
    let width = 546;
    Object.defineProperty(controls, "clientWidth", { configurable: true, get: () => width });
    observers.resize(controls);
    await nextFrame();

    expect(details()).toEqual([
      "Pixel ratio: 2.63",
      "Layout: overlay · short screen",
      "Safe area: 0 top · 0 right · 0 bottom · 0 left",
      "Library controls: 546 px, 520 or wider",
      "Pointer: touch",
      "Running as: installed app"
    ]);

    width = 400;
    observers.resize(controls);
    await nextFrame();
    expect(details()[3]).toBe("Library controls: 400 px, under 520");
  });

  it("adds the visible area while a pinch or the on-screen keyboard shrinks it, keeping the box its size at the bottom left of what shows", async () => {
    setViewport({ width: 1200, height: 800 });
    const visible = stubVisualViewport();
    await mount();
    expect(details()).toHaveLength(6);

    visible.change({ width: 600, height: 400, scale: 2, offsetLeft: 100, offsetTop: 50 });
    await nextFrame();
    expect(details().at(-1)).toBe("Visible area: 600 × 400, zoomed 2×");
    const { style } = document.getElementById("layout-details")!;
    expect([style.left, style.bottom, style.transform]).toEqual(["104px", "354px", "scale(0.5)"]);

    visible.change({ width: 1200, height: 500, scale: 1, offsetLeft: 0, offsetTop: 0 });
    await nextFrame();
    expect(details().at(-1)).toBe("Visible area: 1200 × 500");
    expect([style.left, style.bottom, style.transform]).toEqual(["8px", "308px", "scale(1)"]);
  });
});
