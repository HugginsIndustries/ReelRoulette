// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { screen } from "@testing-library/preact";
import type { Window as HappyDomWindow } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountPage, resetPage, settle } from "./pageHarness";

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
 * Mounts the page with the stylesheet, a theme, and a window width. The theme and width are set before the page
 * mounts, since happy-dom can keep an element's computed style after a class on `<html>` changes.
 */
async function mountStyledPage(theme: "dark" | "light", width: number): Promise<HTMLElement> {
  document.documentElement.classList.add(`theme-${theme}`);
  setViewport({ width, height: 800 });
  style = document.createElement("style");
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
  const page = mountPage();
  await screen.findByText("Ready (API 1)");
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

    expect(images.map((image) => image.className)).toEqual(["brand-on-dark", "brand-on-light", "brand-icon"]);
    expect(images.map((image) => image.alt)).toEqual(["ReelRoulette", "ReelRoulette", "ReelRoulette"]);
    expect(header.textContent).not.toContain("ReelRoulette");
  });
});
