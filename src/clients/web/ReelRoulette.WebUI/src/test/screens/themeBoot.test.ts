// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, isThemeChoice, resolveTheme, THEME_META } from "../../settings/theme";
import { resetPage, stubColorScheme } from "./pageHarness";

const INDEX_HTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../index.html"), "utf8");

/** `index.html`'s inline boot script, the one `<script>` without a `src` or a type. */
const BOOT_SCRIPT = (() => {
  const scripts = [...INDEX_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
  if (scripts.length !== 1) {
    throw new Error(`index.html has ${scripts.length} inline scripts, not the one boot script.`);
  }
  return scripts[0]!;
})();

/** A meta's content as `index.html` writes it, before any script runs. */
function staticMeta(name: string): string {
  return new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(INDEX_HTML)![1]!;
}

/** The page's head as `index.html` starts it: the two metas the theme sets. */
function addStaticMetas(): void {
  for (const name of ["theme-color", "apple-mobile-web-app-status-bar-style"]) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = staticMeta(name);
    document.head.append(meta);
  }
}

function pageTheme() {
  const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
  return {
    classes: Array.from(document.documentElement.classList).filter((name) => name.startsWith("theme-")),
    color: meta("theme-color"),
    statusBar: meta("apple-mobile-web-app-status-bar-style")
  };
}

beforeEach(() => {
  resetPage();
  addStaticMetas();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetPage();
});

describe("index.html's theme boot script", () => {
  it("starts dark, as the stylesheet's own tokens are, for a page whose scripts don't run", () => {
    expect([staticMeta("theme-color"), staticMeta("apple-mobile-web-app-status-bar-style")]).toEqual([
      THEME_META.dark.color,
      THEME_META.dark.statusBarStyle
    ]);
  });

  // What this device keeps, as `localStorage` holds it, or null for nothing kept.
  const kept = [null, '"system"', '"dark"', '"light"', '"sepia"', "dark", "{"];
  for (const stored of kept) {
    for (const systemDark of [false, true]) {
      it(`applies the theme src/settings/theme.ts would, with ${stored ?? "nothing"} kept and a ${systemDark ? "dark" : "light"} system`, () => {
        if (stored !== null) {
          localStorage.setItem("rr_device.appearance.theme", stored);
        }
        stubColorScheme(systemDark);
        new Function(BOOT_SCRIPT)();
        const booted = pageTheme();

        let parsed: unknown = null;
        try {
          parsed = stored === null ? null : JSON.parse(stored);
        } catch {
          // Text that isn't JSON counts as nothing kept.
        }
        const theme = resolveTheme(isThemeChoice(parsed) ? parsed : "system", systemDark);
        expect(booted).toEqual({ classes: [`theme-${theme}`], color: THEME_META[theme].color, statusBar: THEME_META[theme].statusBarStyle });

        // The app's own applyTheme leaves the page the same.
        applyTheme(theme);
        expect(pageTheme()).toEqual(booted);
      });
    }
  }

  it("follows the system when the browser refuses to read storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    stubColorScheme(false);
    new Function(BOOT_SCRIPT)();
    expect(pageTheme()).toEqual({ classes: ["theme-light"], color: THEME_META.light.color, statusBar: THEME_META.light.statusBarStyle });
  });
});
