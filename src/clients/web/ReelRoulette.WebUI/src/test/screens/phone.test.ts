// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPATIBLE_VERSION,
  currentStyle,
  FakeServer,
  IPHONE_USER_AGENT,
  json,
  mountPage,
  pageReady,
  resetPage,
  setViewport,
  settle,
  status,
  stubCoarsePointer,
  stubFullscreenApi,
  stubLayoutSize,
  stubSafeAreaInsets,
  useStylesheet,
  type MountedPage
} from "./pageHarness";

/** A phone upright, and on its side, which is a touch screen below 500 px of viewport height. */
const UPRIGHT = { width: 390, height: 844 };
const ON_ITS_SIDE = { width: 844, height: 390 };

/** Mounts the page and waits for its first version check to be answered. */
async function mount(server = new FakeServer()): Promise<MountedPage> {
  const page = mountPage({ server });
  await waitFor(() => expect(server.requests("GET", "/api/version").length).toBeGreaterThan(0));
  await settle();
  return page;
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

function app(): HTMLElement {
  return document.getElementById("app")!;
}

function header(): HTMLElement {
  return document.querySelector<HTMLElement>("header.top-bar")!;
}

function stage(): HTMLElement {
  return document.getElementById("fullscreen-stage")!;
}

function panel(): HTMLElement {
  return document.getElementById("panel")!;
}

function panelButton(): HTMLButtonElement {
  return document.getElementById("panel-btn") as HTMLButtonElement;
}

function controls(): HTMLElement {
  return document.getElementById("overlay-controls")!;
}

/** The player's indicator: its live region, which always stays in the page. */
function indicator(): HTMLElement {
  return document.getElementById("player-indicator")!;
}

/** The state's box in the player's indicator, or null while it shows none. */
function indicatorBox(): HTMLElement | null {
  return indicator().querySelector<HTMLElement>(".player-indicator");
}

function shows(element: Element): boolean {
  return currentStyle(element).display !== "none";
}

function tab(name: "Library" | "Filter" | "Tags"): HTMLButtonElement {
  // A tab's name says so while it holds unsaved changes.
  return within(panel().querySelector(".panel-tablist") as HTMLElement).getByRole("tab", { name: new RegExp(`^${name}(, unsaved changes)?$`), hidden: true }) as HTMLButtonElement;
}

function topDialog(): HTMLDialogElement | null {
  return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog")).at(-1) ?? null;
}

function padding(element: Element): string[] {
  const style = currentStyle(element);
  return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
}

/** The stylesheet's style rules by selector, outside any `@media` rule, or inside one whose condition has `media`. */
function styleRules(media?: string): Map<string, CSSStyleRule> {
  const rules = new Map<string, CSSStyleRule>();
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      const condition = (rule as CSSMediaRule).media?.mediaText;
      if (media === undefined) {
        if (condition === undefined && "selectorText" in rule) rules.set((rule as CSSStyleRule).selectorText, rule as CSSStyleRule);
      } else if (condition?.includes(media)) {
        for (const inner of Array.from((rule as CSSMediaRule).cssRules)) {
          rules.set((inner as CSSStyleRule).selectorText, inner as CSSStyleRule);
        }
      }
    }
  }
  return rules;
}

beforeEach(() => {
  resetPage();
  useStylesheet();
});

describe("a phone on its side", () => {
  it("fills the screen with the player on a touch screen below 500 px of height, and opens the panel as the overlay", async () => {
    stubSafeAreaInsets({});
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    await mount();

    expect(document.body.classList.contains("short-screen")).toBe(true);
    expect(shows(header())).toBe(false);
    expect(padding(app())).toEqual(["0px", "0px", "0px", "0px"]);
    expect(currentStyle(document.getElementById("media-container")!).borderRadius).toBe("0px");

    await click(panelButton());
    expect(stage().dataset.panelMode).toBe("overlay");
    expect(currentStyle(panel()).position).toBe("fixed");
  });

  it("keeps the normal layout on a tablet in landscape, at 500 px of height, and on a short window with a mouse", async () => {
    for (const [coarse, viewport] of [
      [true, { width: 1180, height: 820 }],
      [true, { width: 900, height: 500 }],
      [false, { width: 900, height: 400 }]
    ] as const) {
      resetPage();
      useStylesheet();
      if (coarse) stubCoarsePointer();
      setViewport(viewport);
      await mount();

      expect(document.body.classList.contains("short-screen")).toBe(false);
      expect(shows(header())).toBe(true);
    }
  });

  it("goes by the window and the pointer, not the user agent", async () => {
    resetPage(IPHONE_USER_AGENT);
    useStylesheet();
    setViewport(ON_ITS_SIDE);
    await mount();

    expect(shows(header())).toBe(true);
  });

  it("hides the header as the phone turns on its side, and shows it as it turns back, keeping an open panel", async () => {
    stubCoarsePointer();
    setViewport(UPRIGHT);
    await mount();
    await click(panelButton());
    await click(tab("Filter"));
    expect(shows(header())).toBe(true);

    setViewport(ON_ITS_SIDE);
    await settle();
    expect(shows(header())).toBe(false);
    expect(panel().hidden).toBe(false);
    expect(tab("Filter").getAttribute("aria-selected")).toBe("true");

    setViewport(UPRIGHT);
    await settle();
    expect(shows(header())).toBe(true);
    expect(panel().hidden).toBe(false);
  });

  it("fits the panel's rows that don't scroll and the dialogs to the short screen", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    await mount(server);

    await click(panelButton());
    expect(currentStyle(tab("Library")).height).toBe("40px");
    expect(currentStyle(document.getElementById("library-search-input")!).minHeight).toBe("38px");
    await click(tab("Filter"));
    expect(currentStyle(document.getElementById("filter-cancel-btn")!).minHeight).toBe("38px");
    expect(currentStyle(document.querySelector(".filter-tab")!).minHeight).toBe("38px");
    await click(tab("Tags"));
    expect(currentStyle(document.getElementById("tag-editor-category-select")!).minHeight).toBe("38px");

    await click(screen.getByRole("button", { name: "Play/Pause" }));
    expect(topDialog()?.textContent).toContain("Cannot play: server compatibility check failed.");
    expect(currentStyle(topDialog()!).maxHeight).toBe("calc(100dvh - 12px)");
    expect(currentStyle(within(topDialog()!).getByRole("button", { name: "OK" })).minHeight).toBe("38px");
  });

  it("fits the controls in the tabs' bodies and the tabs' headings to the short screen, as the mockup does", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/sources", () => json([]));
    server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [] }));
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    await mount(server);

    await click(panelButton());
    expect(currentStyle(panel().querySelector("#library-overlay h2")!).fontSize).toBe("16px");
    expect(currentStyle(document.getElementById("library-sort-direction-btn")!).minHeight).toBe("38px");
    await click(tab("Filter"));
    await waitFor(() => expect(document.getElementById("filter-min-dur-text")).not.toBeNull());
    expect(currentStyle(document.getElementById("filter-dialog-heading")!).fontSize).toBe("16px");
    expect(currentStyle(panel().querySelector(".filter-dialog-header")!).minHeight).toBe("36px");
    expect(currentStyle(document.getElementById("filter-min-dur-text")!).minHeight).toBe("38px");
    expect(currentStyle(document.getElementById("filter-dialog-preset-select")!).minHeight).toBe("38px");
    expect(currentStyle(document.getElementById("filter-update-preset-btn")!).minHeight).toBe("38px");
    await click(tab("Tags"));
    expect(currentStyle(panel().querySelector(".tag-editor-header h2")!).fontSize).toBe("16px");
    // The tabs' icon buttons keep their size.
    expect(currentStyle(document.getElementById("tag-editor-refresh-btn")!).height).toBe("44px");
    expect(currentStyle(document.getElementById("tag-editor-refresh-btn")!).minHeight).not.toBe("38px");
    expect(currentStyle(panel().querySelector(".tag-editor-header")!).minHeight).toBe("36px");
    expect(currentStyle(document.getElementById("tag-editor-new-tag")!).minHeight).toBe("38px");
    fireEvent.click(document.getElementById("tag-editor-autotag-btn")!);
    await settle();
    expect(currentStyle(document.getElementById("autotag-scan")!).minHeight).toBe("38px");
    expect(currentStyle(document.getElementById("autotag-close")!).minHeight).not.toBe("38px");
    expect(currentStyle(document.getElementById("autotag-full")!).minHeight).not.toBe("38px");
  });

  it("puts the Library tab's four controls in two rows, as the mockup does", async () => {
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    await mount();

    await click(panelButton());
    const controls = document.getElementById("library-controls")!;
    expect(currentStyle(controls).display).toBe("grid");
    expect(currentStyle(controls).gridTemplateColumns).toBe("1fr 1fr");
    expect(currentStyle(controls.querySelector(".library-controls-pair")!).display).toBe("contents");
    expect(currentStyle(document.getElementById("preset-select")!).minHeight).toBe("38px");
    expect(currentStyle(document.getElementById("library-search-input")!).minHeight).toBe("38px");
  });

  it("keeps the panel's and the dialogs' sizes on a tablet", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    stubCoarsePointer();
    setViewport({ width: 1180, height: 820 });
    await mount(server);

    await click(panelButton());
    expect(currentStyle(tab("Library")).height).toBe("44px");
    await click(tab("Filter"));
    expect(currentStyle(document.getElementById("filter-cancel-btn")!).minHeight).toBe("44px");

    await click(screen.getByRole("button", { name: "Play/Pause" }));
    expect(currentStyle(topDialog()!).maxHeight).toBe("calc(100dvh - 32px)");
    expect(currentStyle(within(topDialog()!).getByRole("button", { name: "OK" })).minHeight).toBe("44px");
  });

  it("shows the header while the server asks for pairing, so its prompt can be reached, with no reconnecting indicator, and a failed pairing in a notice", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => status(401));
    server.on("GET", "/api/presets", () => status(401));
    server.on("POST", "/api/pair", () => status(403));
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    const page = mountPage({ server });

    const pairButton = await screen.findByRole("button", { name: "Pair" });
    await waitFor(() => expect(shows(header())).toBe(true));
    // The server refuses the event stream until the device pairs, so it fails, but the prompt is what to act on.
    page.stream().fail();
    await settle();
    expect(indicatorBox()).toBeNull();

    fireEvent.input(screen.getByLabelText("Pairing token"), { target: { value: "wrong" } });
    await click(pairButton);
    await waitFor(() => expect(topDialog()?.textContent).toContain("Pairing failed."));
    expect(topDialog()!.open).toBe(true);
    expect(shows(topDialog()!)).toBe(true);
    await click(within(topDialog()!).getByRole("button", { name: "OK" }));
    expect(topDialog()).toBeNull();

    server.on("POST", "/api/pair", () => json({ paired: true }));
    server.on("GET", "/api/version", () => json(COMPATIBLE_VERSION));
    server.on("GET", "/api/presets", () => json([]));
    fireEvent.input(screen.getByLabelText("Pairing token"), { target: { value: "token-1" } });
    fireEvent.click(pairButton);
    await pageReady(server);
    await waitFor(() => expect(shows(header())).toBe(false));
    page.stream().fail();
    await settle();
    expect(indicatorBox()?.dataset.state).toBe("reconnecting");
  });
});

describe("safe-area insets", () => {
  it("come from the screen, which the page may draw under", () => {
    const root = getComputedStyle(document.documentElement);
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(root.getPropertyValue(`--safe-area-${side}`)).toBe(`env(safe-area-inset-${side}, 0px)`);
    }
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../index.html"), "utf8");
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });

  it("keep the header, the player, and the panel as the overlay clear of them as an installed app on a phone", async () => {
    stubSafeAreaInsets({ top: 59, bottom: 34 });
    stubCoarsePointer();
    setViewport(UPRIGHT);
    await mount();

    expect(shows(header())).toBe(true);
    expect(padding(app())).toEqual(["calc(max(12px, 59px))", "calc(max(12px, 0px))", "calc(max(12px, 34px))", "calc(max(12px, 0px))"]);

    await click(panelButton());
    expect(currentStyle(panel()).position).toBe("fixed");
    expect(padding(panel())).toEqual(["59px", "0px", "34px", "0px"]);
  });

  it("on a phone on its side, leave the player between the side insets and keep its controls off the home indicator", async () => {
    stubSafeAreaInsets({ right: 47, bottom: 21, left: 47 });
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    await mount();

    expect(padding(app())).toEqual(["0px", "47px", "0px", "47px"]);
    expect(currentStyle(controls()).paddingTop).toBe("calc(max(12px, 0px))");
    expect(currentStyle(controls()).paddingBottom).toBe("calc(max(12px, 21px))");
    expect(currentStyle(document.getElementById("favorite-btn")!).top).toBe("calc(max(12px, 0px))");

    await click(panelButton());
    expect(padding(panel())).toEqual(["0px", "47px", "21px", "47px"]);
  });

  it("keep pseudo-fullscreen clear, where the stage pads itself and the controls keep their own padding", async () => {
    resetPage(IPHONE_USER_AGENT);
    useStylesheet();
    stubFullscreenApi();
    stubSafeAreaInsets({ right: 47, bottom: 21, left: 47 });
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    await mount();

    await click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);
    expect(padding(stage())).toEqual(["0px", "47px", "21px", "47px"]);
    expect(currentStyle(controls()).paddingBottom).toBe("12px");
  });
});

describe("the page's height", () => {
  it("follows the browser's toolbars in a tab, and is the whole screen in an installed app, where a launch reports it short", async () => {
    await mount();

    // happy-dom drops `dvh` and `lvh` and its display mode is always `browser`, so the test reads the rules' text.
    expect(getComputedStyle(document.documentElement).getPropertyValue("--page-height")).toBe("100dvh");
    const page = styleRules();
    expect(page.get("body")?.style.height).toBe("var(--page-height)");
    expect(page.get(".fullscreen-stage.fullscreen-pseudo")?.style.maxHeight).toBe("var(--page-height)");

    const installed = styleRules("display-mode: standalone");
    expect(installed.get(":root")?.style.getPropertyValue("--page-height")).toBe("100lvh");
    expect(installed.get(".fullscreen-stage.fullscreen-pseudo")?.style.height).toBe("var(--page-height)");
  });
});

describe("player's indicator", () => {
  it("shows Reconnecting… on the player while the connection is lost on a phone on its side, and goes once it reconnects", async () => {
    stubCoarsePointer();
    setViewport(ON_ITS_SIDE);
    const page = await mount();
    page.stream().open();
    await settle();
    expect(indicatorBox()).toBeNull();

    page.stream().fail();
    await settle();
    expect(indicatorBox()?.dataset.state).toBe("reconnecting");
    expect(shows(indicatorBox()!)).toBe(true);
    expect(within(document.getElementById("media-container")!).getByRole("status").querySelector(".player-indicator-text")?.textContent).toBe("Reconnecting…");

    window.dispatchEvent(new Event("focus"));
    page.stream().open();
    await settle();
    expect(indicatorBox()).toBeNull();
    // The live region stays, so its announcements aren't lost.
    expect(indicator().getAttribute("role")).toBe("status");
  });

  it("shows on the player at every width, and doesn't pop up", async () => {
    stubCoarsePointer();
    setViewport(UPRIGHT);
    const page = await mount();
    page.stream().fail();
    await settle();

    expect(indicatorBox()?.dataset.state).toBe("reconnecting");
    expect(document.getElementById("toasts")!.textContent).not.toMatch(/reconnecting/i);

    setViewport(ON_ITS_SIDE);
    await settle();
    expect(indicatorBox()?.dataset.state).toBe("reconnecting");

    setViewport(UPRIGHT);
    await settle();
    expect(indicatorBox()?.dataset.state).toBe("reconnecting");
  });

  it("keeps clear of the status bar on a phone on its side, and below the corner buttons on a player narrower than 600 px", async () => {
    stubSafeAreaInsets({ top: 20 });
    stubCoarsePointer();
    stubLayoutSize(844);
    setViewport(ON_ITS_SIDE);
    const page = await mount();
    page.stream().fail();
    await settle();

    const column = stage().querySelector("main.player-col")!;
    expect(column.classList.contains("is-narrow")).toBe(false);
    expect(currentStyle(indicatorBox()!).top).toBe("calc(max(14px, 20px))");

    stubLayoutSize(560);
    setViewport({ width: 667, height: 375 });
    await settle();
    expect(column.classList.contains("is-narrow")).toBe(true);
    expect(currentStyle(indicatorBox()!).top).toBe("calc(max(12px, 20px) + 52px)");
    expect(currentStyle(indicatorBox()!).maxWidth).toBe("calc(100% - 24px)");

    // Upright, the page shows the header above the player, and the indicator sits 64 px down the narrow player.
    stubLayoutSize(390);
    setViewport(UPRIGHT);
    await settle();
    expect(column.classList.contains("is-narrow")).toBe(true);
    expect(currentStyle(indicatorBox()!).top).toBe("64px");
  });
});
