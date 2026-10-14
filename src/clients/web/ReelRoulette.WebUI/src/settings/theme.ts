import { effect, signal, type ReadonlySignal } from "@preact/signals";

/** The Settings tab's Theme: follow the system, or always dark or always light. */
export type ThemeChoice = "system" | "dark" | "light";

/** The theme in use. */
export type Theme = "dark" | "light";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "dark", "light"];

export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/**
 * The per-device store's key for the theme. `index.html`'s boot script reads it too, as `rr_device.appearance.theme`,
 * to apply the theme while the page loads.
 */
export const THEME_KEY = "appearance.theme";

/**
 * What each theme gives the browser and an installed app: `theme-color`, the page's background, for the browser's and
 * an installed app's bars, and the installed iOS app's status bar style, white text over the page in the dark theme
 * and dark text on a light bar in the light theme. `index.html`'s boot script has the same values.
 */
export const THEME_META: Readonly<Record<Theme, { color: string; statusBarStyle: string }>> = {
  dark: { color: "#1a1a1a", statusBarStyle: "black-translucent" },
  light: { color: "#eceff4", statusBarStyle: "default" }
};

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return (THEME_CHOICES as readonly unknown[]).includes(value);
}

/** The theme a choice gives, with the system's scheme for System. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === "system") {
    return systemDark ? "dark" : "light";
  }
  return choice;
}

function setMeta(doc: Document, name: string, content: string): void {
  let meta = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = doc.createElement("meta");
    meta.name = name;
    doc.head.append(meta);
  }
  meta.content = content;
}

/**
 * Puts `theme` on the page: the root element's `theme-dark` or `theme-light` class, which the stylesheet reads, and
 * its `theme-color` and status bar style metas.
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  root.classList.toggle("theme-dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");
  setMeta(doc, "theme-color", THEME_META[theme].color);
  setMeta(doc, "apple-mobile-web-app-status-bar-style", THEME_META[theme].statusBarStyle);
}

/**
 * Applies the theme `choice` gives now, and again whenever the choice changes or the system's scheme does, which
 * changes the theme only while the choice is System. Without `matchMedia`, the system counts as dark, as the page is
 * before any theme applies. Returns a function that stops it.
 */
export function followTheme(choice: ReadonlySignal<ThemeChoice>): () => void {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(SYSTEM_DARK_QUERY) : null;
  const systemDark = signal(query ? query.matches : true);
  const onSystemChange = () => {
    systemDark.value = query!.matches;
  };
  query?.addEventListener?.("change", onSystemChange);
  const stop = effect(() => applyTheme(resolveTheme(choice.value, systemDark.value)));
  return () => {
    stop();
    query?.removeEventListener?.("change", onSystemChange);
  };
}
