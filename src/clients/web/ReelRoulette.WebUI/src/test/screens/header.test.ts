// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Window as HappyDomWindow } from "happy-dom";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPATIBLE_VERSION,
  FakeServer,
  contextMenuShown,
  json,
  menuItemIn,
  menuLabels,
  mountPage,
  pageReady,
  popupsShown,
  randomAnswer,
  resetPage,
  stubClipboard,
  rightClick,
  flush,
  settle,
  status
} from "./pageHarness";

/** The app's stylesheet, which decides which of the header's logo images shows. */
const STYLESHEET = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../styles.css"), "utf8");
const DEFAULT_VIEWPORT = { width: 1024, height: 768 };

let style: HTMLStyleElement | null = null;

/** Resizes the window, which decides the stylesheet's width rules. */
function setViewport(viewport: { width: number; height: number }): void {
  (window as unknown as HappyDomWindow).happyDOM.setViewport(viewport);
}

beforeEach(() => {
  resetPage();
});

afterEach(() => {
  style?.remove();
  style = null;
  document.documentElement.classList.remove("theme-dark", "theme-light");
  setViewport(DEFAULT_VIEWPORT);
});

/**
 * Mounts the page with the stylesheet, a theme chosen as the Settings tab keeps it, and a window width. The theme and
 * width are set before the page mounts, since happy-dom can keep an element's computed style after a class on `<html>`
 * changes.
 */
async function mountStyledPage(theme: "dark" | "light", width: number): Promise<HTMLElement> {
  localStorage.setItem("rr_device.appearance.theme", JSON.stringify(theme));
  setViewport({ width, height: 800 });
  style = document.createElement("style");
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
  const page = mountPage();
  await pageReady(page.server);
  await settle();
  return page.root.querySelector("header")!;
}

/** The classes of the logo images the stylesheet shows. */
function shownLogos(header: HTMLElement): string[] {
  return Array.from(header.querySelectorAll<HTMLImageElement>(".brand img"))
    .filter((image) => getComputedStyle(image).display !== "none")
    .map((image) => image.className);
}

describe("header logo", () => {
  const cases = [
    { theme: "dark", width: 1200, shown: "brand-on-dark" },
    { theme: "light", width: 1200, shown: "brand-on-light" },
    { theme: "dark", width: 400, shown: "brand-icon" },
    { theme: "light", width: 400, shown: "brand-icon" }
  ] as const;

  for (const { theme, width, shown } of cases) {
    it(`shows only the ${shown} image in the ${theme} theme at ${width} px`, async () => {
      const header = await mountStyledPage(theme, width);

      expect(shownLogos(header)).toEqual([shown]);
    });
  }

  it("names the logo ReelRoulette through its images, not through text", async () => {
    const header = await mountStyledPage("dark", 1200);
    const brand = header.querySelector("h1.brand")!;
    const images = Array.from(brand.querySelectorAll("img"));

    expect(new Set(images.map((image) => image.className))).toEqual(new Set(["brand-on-dark", "brand-on-light", "brand-icon"]));
    expect(images.map((image) => image.alt)).toEqual(["ReelRoulette", "ReelRoulette", "ReelRoulette"]);
    expect(header.textContent).not.toContain("ReelRoulette");
  });
});

describe("the now-playing name's menu", () => {
  /** A name longer than the header shows, which it cuts short. */
  const LONG_NAME = "a holiday clip whose name runs well past what the header shows.mp4";
  const ITEM = {
    id: `C:\\media\\${LONG_NAME}`,
    itemId: "item-video",
    displayName: LONG_NAME,
    mediaType: "video",
    durationSeconds: 65,
    mediaUrl: "/api/media/item-video?token=t",
    isFavorite: false,
    isBlacklisted: false
  };

  /** Mounts the page and plays the item, with Show in File Manager listed for this browser when `fileManager` is. */
  async function mountPlaying(fileManager = false): Promise<FakeServer> {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(ITEM));
    if (fileManager) {
      server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [...COMPATIBLE_VERSION.capabilities, "api.showInFileManager"] }));
    }
    mountPage({ server });
    await pageReady(server);
    fireEvent.click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(name().textContent).not.toBe(""));
    return server;
  }

  function name(): HTMLElement {
    return document.getElementById("now-playing-name") as HTMLElement;
  }

  function statsTabShown(): boolean {
    return !(document.getElementById("panel") as HTMLElement).hidden && !(document.getElementById("panel-page-stats") as HTMLElement).hidden;
  }

  async function pick(label: string): Promise<void> {
    fireEvent.click(menuItemIn(contextMenuShown()!, label));
    await flush();
  }

  it("opens at a right-click on the name with Show stats, Copy name, and Copy path, tinting the name while it's open", async () => {
    await mountPlaying();
    expect(name().textContent).not.toBe(LONG_NAME);

    expect(rightClick(name())).toBe(false);
    await settle();
    expect(menuLabels(contextMenuShown()!)).toEqual(new Set(["Show stats", "Copy name", "Copy path"]));
    expect(name().classList.contains("is-menu-target")).toBe(true);
    expect(statsTabShown()).toBe(false);

    fireEvent.keyDown(document.body, { key: "Escape" });
    await settle();
    expect([contextMenuShown(), name().classList.contains("is-menu-target")]).toEqual([null, false]);
  });

  it("closes when another item plays", async () => {
    const server = await mountPlaying();
    rightClick(name());
    await settle();
    expect(contextMenuShown()).not.toBeNull();

    const second = { ...ITEM, id: "C:\\media\\second.mp4", itemId: "item-second", displayName: "second.mp4", mediaUrl: "/api/media/item-second?token=t" };
    server.on("POST", "/api/random", () => randomAnswer(second));
    // A click alone, with no press before it to close the menu.
    fireEvent.click(screen.getByRole("button", { name: "Next", hidden: true }));
    await waitFor(() => expect(name().textContent).toBe("second.mp4"));
    expect(contextMenuShown()).toBeNull();
  });

  it("lists Show in File Manager while the server lists it for this browser, which opens the server's file manager at the item", async () => {
    const server = await mountPlaying(true);
    server.on("POST", "/api/show-in-file-manager/item-video", () => status(204));

    rightClick(name());
    await settle();
    expect(menuLabels(contextMenuShown()!)).toEqual(new Set(["Show stats", "Copy name", "Copy path", "Show in File Manager"]));
    await pick("Show in File Manager");
    expect(server.requests("POST", "/api/show-in-file-manager/item-video")).toHaveLength(1);
    await waitFor(() => expect(popupsShown()).toEqual([`Opened in the file manager. | ${LONG_NAME}`]));
  });

  it("opens at a long press on the name, whose click doesn't open the Stats tab, though Show stats does", async () => {
    await mountPlaying();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    fireEvent.pointerDown(name(), { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: 40, clientY: 20 });
    await vi.advanceTimersByTimeAsync(500);
    expect(menuLabels(contextMenuShown()!)).toEqual(new Set(["Show stats", "Copy name", "Copy path"]));
    expect(name().classList.contains("is-menu-target")).toBe(true);
    fireEvent.pointerUp(name(), { pointerType: "touch", pointerId: 1, button: 0, clientX: 40, clientY: 20 });
    fireEvent.click(name());
    await flush();
    expect([contextMenuShown() !== null, statsTabShown()]).toEqual([true, false]);

    await pick("Show stats");
    expect([contextMenuShown(), statsTabShown()]).toEqual([null, true]);
  });

  it("Copy name copies the full name, and Copy path the path, each saying so with the name on its second line", async () => {
    const writeText = stubClipboard();
    await mountPlaying();

    rightClick(name());
    await settle();
    await pick("Copy name");
    expect(writeText.mock.calls).toEqual([[LONG_NAME]]);
    await waitFor(() => expect(popupsShown()).toEqual([`Name copied. | ${LONG_NAME}`]));

    rightClick(name());
    await settle();
    await pick("Copy path");
    expect(writeText.mock.calls.at(-1)).toEqual([ITEM.id]);
    await waitFor(() => expect(popupsShown()).toEqual([`Path copied. | ${LONG_NAME}`]));
  });
});
