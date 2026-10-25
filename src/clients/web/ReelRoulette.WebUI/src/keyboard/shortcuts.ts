import { PANEL_TABS, type PanelHost, type PanelTab } from "../panel/panelHost";
import type { AudioStage } from "../playback/audioStage";
import type { Player } from "../playback/player";
import type { StageFullscreen } from "../playback/stageFullscreen";
import type { PlayerRating } from "../rating/playerRating";
import type { Settings } from "../settings/settings";

/** The actions that set the playing item's rating to 1 to 5 stars, in order. */
const RATE_ACTIONS = ["rate1", "rate2", "rate3", "rate4", "rate5"] as const;

/** What a shortcut does. A panel tab's name opens the panel on that tab, or closes it when that tab is open. */
export type ShortcutAction =
  | "playOrPause"
  | "seekBack"
  | "seekForward"
  | "previous"
  | "next"
  | "random"
  | "favorite"
  | "blacklist"
  | (typeof RATE_ACTIONS)[number]
  | "clearRating"
  | "ratingDown"
  | "ratingUp"
  | "autoplay"
  | "mute"
  | "frameBack"
  | "frameForward"
  | "volumeDown"
  | "volumeUp"
  | PanelTab
  | "panel"
  | "fullscreen"
  | "shortcuts";

/**
 * A key bound to an action, matched by the character it gives or by its position on the keyboard. A digit held with
 * Shift is matched by its position, since Shift changes the character it gives, such as "!" on a US keyboard.
 */
export type ShortcutBinding = (
  | {
      /** The key as `KeyboardEvent.key` gives it, a letter in lower case. */
      key: string;
      code?: never;
    }
  | {
      /** The key's position as `KeyboardEvent.code` gives it, such as Digit1, whatever character it gives. */
      code: string;
      key?: never;
    }
) & {
  /** Held with Shift, as for Shift+F. */
  shift?: boolean;
  action: ShortcutAction;
};

/** A line of the shortcut reference: the keys it shows, what they do, and the bindings it stands for. */
export interface ShortcutLine {
  /** The keys as the reference shows them. */
  keys: readonly string[];
  /** Between the keys: "/" for keys that do one each of the line's actions, and "–" for a range. */
  join?: "/" | "–";
  text: string;
  bindings: readonly ShortcutBinding[];
}

/**
 * The shortcuts, as the Settings tab's reference lists them, and every key bound, so the two can't differ. Esc is the
 * bell's list's, the rating's popover's, the Selection actions menu's, and the stage's own (`src/ui/Notifications.tsx`,
 * `src/ui/Player.tsx`, `src/ui/LibraryOverlay.tsx`, `src/ui/Stage.tsx`), and an open dialog's before them.
 */
export const SHORTCUT_LINES: readonly ShortcutLine[] = [
  {
    keys: ["K", "Space"],
    join: "/",
    text: "Play or pause, or pause and resume a photo's timer",
    bindings: [
      { key: "k", action: "playOrPause" },
      { key: " ", action: "playOrPause" }
    ]
  },
  {
    keys: ["J", "L"],
    join: "/",
    text: "Seek back or forward by the seek step",
    bindings: [
      { key: "j", action: "seekBack" },
      { key: "l", action: "seekForward" }
    ]
  },
  {
    keys: ["←", "→"],
    join: "/",
    text: "Previous or next",
    bindings: [
      { key: "ArrowLeft", action: "previous" },
      { key: "ArrowRight", action: "next" }
    ]
  },
  { keys: ["R"], text: "Random", bindings: [{ key: "r", action: "random" }] },
  { keys: ["F"], text: "Favorite", bindings: [{ key: "f", action: "favorite" }] },
  { keys: ["B"], text: "Blacklist", bindings: [{ key: "b", action: "blacklist" }] },
  {
    keys: ["Shift+1", "Shift+5"],
    join: "–",
    text: "Rate 1 to 5 stars",
    bindings: RATE_ACTIONS.map((action, index) => ({ code: `Digit${index + 1}`, shift: true, action }))
  },
  { keys: ["Shift+0"], text: "Clear the rating", bindings: [{ code: "Digit0", shift: true, action: "clearRating" }] },
  {
    keys: ["-", "="],
    join: "/",
    text: "Rating down or up by half a star",
    bindings: [
      { key: "-", action: "ratingDown" },
      { key: "=", action: "ratingUp" }
    ]
  },
  { keys: ["A"], text: "Autoplay on or off", bindings: [{ key: "a", action: "autoplay" }] },
  { keys: ["M"], text: "Mute", bindings: [{ key: "m", action: "mute" }] },
  {
    keys: [",", "."],
    join: "/",
    text: "One frame back or forward, while a video is paused",
    bindings: [
      { key: ",", action: "frameBack" },
      { key: ".", action: "frameForward" }
    ]
  },
  {
    keys: ["[", "]"],
    join: "/",
    text: "Volume down or up by the volume step",
    bindings: [
      { key: "[", action: "volumeDown" },
      { key: "]", action: "volumeUp" }
    ]
  },
  {
    keys: ["1", "6"],
    join: "–",
    text: "Open Library, Tags, Stats, Filter, Randomization, or Settings; the open tab's key closes the panel",
    bindings: PANEL_TABS.map((tab, index) => ({ key: String(index + 1), action: tab }))
  },
  { keys: ["T"], text: "Tags", bindings: [{ key: "t", action: "tags" }] },
  { keys: ["S"], text: "Settings", bindings: [{ key: "s", action: "settings" }] },
  { keys: ["P"], text: "Show or hide the panel", bindings: [{ key: "p", action: "panel" }] },
  { keys: ["Shift+F"], text: "Fullscreen", bindings: [{ key: "f", shift: true, action: "fullscreen" }] },
  // Not ?, which Firefox takes for its quick find.
  { keys: ["H"], text: "These shortcuts", bindings: [{ key: "h", action: "shortcuts" }] },
  { keys: ["Esc"], text: "Close the top dialog, the notifications list, the rating stars, or the panel, clear selection, or leave fullscreen", bindings: [] }
];

/** The actions a key held down repeats; every other key acts once per press. */
const REPEATING: ReadonlySet<ShortcutAction> = new Set(["seekBack", "seekForward", "ratingDown", "ratingUp", "frameBack", "frameForward", "volumeDown", "volumeUp"]);

function bindingName(keyOrCode: string, shift: boolean): string {
  return shift ? `Shift+${keyOrCode}` : keyOrCode;
}

/** The actions bound by the character a key gives, for `by` "key", or by its position, for "code". */
function bindingsBy(by: "key" | "code"): ReadonlyMap<string, ShortcutAction> {
  return new Map(
    SHORTCUT_LINES.flatMap((line) =>
      line.bindings.flatMap((binding) => {
        const name = binding[by];
        return name === undefined ? [] : [[bindingName(name, !!binding.shift), binding.action] as const];
      })
    )
  );
}

const BY_KEY = bindingsBy("key");
const BY_CODE = bindingsBy("code");

/**
 * The element takes every key pressed in it, as a text field, a dropdown, or editable text does, where a text field is
 * any `input` but a checkbox, radio button, button, or slider, or a text area. No key there is a shortcut, or activity
 * for the player's controls. Every other control leaves the keys to the page.
 */
export function takesKeys(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  if (element.isContentEditable || element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  return element.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset", "range"].includes((element as HTMLInputElement).type);
}

/** A key press, as a `keydown` event gives it. */
export interface KeyPress {
  readonly key: string;
  readonly code: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
}

/** F1 to F12, which stay the browser's. */
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

/**
 * The page takes the key press, so the key does what a shortcut binds it to, or nothing, which keeps every plain key
 * free for shortcuts: any key pressed outside a text field, a dropdown, or editable text, but one the focused element
 * already handled, one pressed with Ctrl, Alt, or Meta, or F1 to F12, which stay the browser's, and Escape, which closes
 * what is open.
 */
export function pageTakesKey(press: KeyPress): boolean {
  if (press.defaultPrevented || press.ctrlKey || press.altKey || press.metaKey) return false;
  return press.key !== "Escape" && !FUNCTION_KEY.test(press.key) && !takesKeys(press.target);
}

/** The action a key press is bound to, by the key's position or else by the character it gives. */
function bindingOf(press: KeyPress): ShortcutAction | null {
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  return BY_CODE.get(bindingName(press.code, press.shiftKey)) ?? BY_KEY.get(bindingName(key, press.shiftKey)) ?? null;
}

/** A key held down acts again only for the actions that repeat. */
function actsOn(press: KeyPress, action: ShortcutAction): boolean {
  return !press.repeat || REPEATING.has(action);
}

/**
 * The shortcut a key press is, or null: none for a key the page doesn't take, as `pageTakesKey` says, or for a key held
 * down that doesn't repeat.
 */
export function shortcutFor(press: KeyPress): ShortcutAction | null {
  const action = pageTakesKey(press) ? bindingOf(press) : null;
  return action && actsOn(press, action) ? action : null;
}

/** What the shortcuts act on. */
export interface ShortcutServices {
  player: Pick<Player, "playOrPause" | "seekBy" | "stepFrame" | "previous" | "next" | "pickRandom" | "toggleFavorite" | "toggleBlacklist" | "toggleAutoplay">;
  audio: Pick<AudioStage, "toggleMute" | "stepVolume" | "volumeShown">;
  panel: Pick<PanelHost, "isOpen" | "tab" | "showTab" | "close" | "toggle">;
  fullscreen: Pick<StageFullscreen, "toggle">;
  settings: Pick<Settings, "seekStep" | "revealShortcuts">;
  rating: Pick<PlayerRating, "set" | "step">;
}

function isPanelTab(action: ShortcutAction): action is PanelTab {
  return (PANEL_TABS as readonly string[]).includes(action);
}

/** Opens Settings, then asks it to show the shortcuts, once the tab the panel leaves has let it go. */
async function showShortcuts({ panel, settings }: ShortcutServices): Promise<void> {
  await panel.showTab("settings");
  if (panel.isOpen.peek() && panel.tab.peek() === "settings") {
    settings.revealShortcuts();
  }
}

/** Does what `action` says, as the player's controls, its rating stars, the panel button, and the panel's tabs do. */
export function runShortcut(action: ShortcutAction, services: ShortcutServices): void {
  const { player, audio, panel, fullscreen, settings, rating } = services;
  switch (action) {
    case "playOrPause":
      return player.playOrPause();
    case "seekBack":
      return player.seekBy(-settings.seekStep.peek());
    case "seekForward":
      return player.seekBy(settings.seekStep.peek());
    case "previous":
      return player.previous();
    case "next":
      return player.next();
    case "random":
      return void player.pickRandom();
    case "favorite":
      return void player.toggleFavorite();
    case "blacklist":
      return void player.toggleBlacklist();
    case "clearRating":
      return rating.set(null, { byKey: true });
    case "ratingDown":
      return rating.step(-1);
    case "ratingUp":
      return rating.step(1);
    case "autoplay":
      return player.toggleAutoplay();
    case "mute":
      return audio.toggleMute({ byKey: true });
    case "frameBack":
      return player.stepFrame(-1);
    case "frameForward":
      return player.stepFrame(1);
    // The volume can't change where its slider hides, as for the scroll wheel.
    case "volumeDown":
    case "volumeUp":
      if (audio.volumeShown.peek()) audio.stepVolume(action === "volumeUp" ? 1 : -1);
      return;
    case "panel":
      return void panel.toggle();
    case "fullscreen":
      return fullscreen.toggle();
    case "shortcuts":
      return void showShortcuts(services);
  }
  const stars = (RATE_ACTIONS as readonly string[]).indexOf(action) + 1;
  if (stars > 0) {
    return rating.set(stars, { byKey: true });
  }
  if (isPanelTab(action)) {
    void (panel.isOpen.peek() && panel.tab.peek() === action ? panel.close() : panel.showTab(action));
  }
}

/**
 * Runs the shortcuts from `page`'s key presses, after the focused element's own handlers, and keeps every key the page
 * takes from the browser, so a key does what a shortcut binds it to or nothing: Tab moves no focus, Enter presses no
 * button, the arrows move no slider, and no key scrolls, and a held key that doesn't repeat acts once. The focused
 * control loses focus before a shortcut runs, so Space's release can't press a button and focus doesn't stay for the
 * next key. An open dialog, Auto Tag included, takes every key. Returns what stops them.
 */
export function listenForShortcuts(page: Document, services: ShortcutServices): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (page.querySelector("dialog[open]") || !pageTakesKey(event)) return;
    // Read before the key is kept from the browser, which marks it as handled.
    const action = shortcutFor(event);
    event.preventDefault();
    if (!action) return;
    (page.activeElement as HTMLElement | null)?.blur?.();
    runShortcut(action, services);
  };
  page.addEventListener("keydown", onKeyDown);
  return () => page.removeEventListener("keydown", onKeyDown);
}

/**
 * Has a dropdown give up focus right after a pick, so the next key is a shortcut, as → after a preset pick plays the next
 * item. It runs as the change reaches the page, after the dropdown's own handlers, and leaves alone a control the pick
 * moved focus to, such as a dialog's. Returns what stops it.
 */
export function blurDropdownsAfterPick(page: Document): () => void {
  const onChange = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "SELECT") target.blur();
  };
  page.addEventListener("change", onChange);
  return () => page.removeEventListener("change", onChange);
}
