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
 * bell's list's, the rating's popover's, and the stage's own (`src/ui/Notifications.tsx`, `src/ui/Player.tsx`,
 * `src/ui/Stage.tsx`), and an open dialog's before them.
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
  { keys: ["Esc"], text: "Close the top dialog, the notifications list, the rating stars, or the panel, or leave fullscreen", bindings: [] }
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

/** The keys a slider moves itself by. */
const SLIDER_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** The inputs nothing is typed into. A slider is among them, and keeps only its own keys. */
const UNTYPED_INPUTS: readonly string[] = ["checkbox", "radio", "button", "submit", "reset", "range"];

/**
 * What Space activates, so Space there is left to it. A slider isn't among them, nor what takes focus without a tab stop,
 * such as the bell's list's title.
 */
const SPACE_ACTIVATES = 'button, a, input:not([type=range]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/**
 * The focused element takes `key` itself, so the key isn't a shortcut there: every key in a text field, a dropdown, or
 * editable text; a slider's own keys on a slider; the left and right arrows on a checkbox or radio button; and Space on
 * what it activates, such as a button or a library tile.
 */
export function focusTakesKey(target: EventTarget | null, key: string): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  if (element.isContentEditable || element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  if (element.tagName === "INPUT") {
    const type = (element as HTMLInputElement).type;
    if (!UNTYPED_INPUTS.includes(type)) return true;
    if (type === "range") return SLIDER_KEYS.has(key);
    if (key === "ArrowLeft" || key === "ArrowRight") return true;
  }
  return key === " " && element !== element.ownerDocument?.body && !!element.closest?.(SPACE_ACTIVATES);
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

/**
 * The action a key press is bound to, by its position or else by the character it gives, where the shortcuts take it:
 * none while Ctrl, Alt, or Meta is held, or for a key the focused element already handled or takes itself.
 */
function boundAction(press: KeyPress): ShortcutAction | null {
  if (press.defaultPrevented || press.ctrlKey || press.altKey || press.metaKey) return null;
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  const action = BY_CODE.get(bindingName(press.code, press.shiftKey)) ?? BY_KEY.get(bindingName(key, press.shiftKey));
  return action && !focusTakesKey(press.target, key) ? action : null;
}

/** A key held down acts again only for the actions that repeat. */
function actsOn(press: KeyPress, action: ShortcutAction): boolean {
  return !press.repeat || REPEATING.has(action);
}

/**
 * The shortcut a key press is, or null: none while Ctrl, Alt, or Meta is held, for a key the focused element already
 * handled or takes itself, or for a key held down that doesn't repeat.
 */
export function shortcutFor(press: KeyPress): ShortcutAction | null {
  const action = boundAction(press);
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

/**
 * Does what `action` says, as the player's controls, its rating stars, the panel button, and the panel's tabs do, except
 * that a key that closes the panel leaves focus on the page, so Space plays or pauses afterwards.
 */
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
      return void panel.toggle({ byKey: true });
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
    void (panel.isOpen.peek() && panel.tab.peek() === action ? panel.close({ byKey: true }) : panel.showTab(action));
  }
}

/**
 * Runs the shortcuts from `page`'s key presses, after the focused element's own handlers. An open dialog, Auto Tag
 * included, takes every key. A shortcut's key held down stays the page's even where it doesn't repeat, so holding Space
 * doesn't scroll. Returns what stops them.
 */
export function listenForShortcuts(page: Document, services: ShortcutServices): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (page.querySelector("dialog[open]")) return;
    const action = boundAction(event);
    if (!action) return;
    event.preventDefault();
    if (actsOn(event, action)) runShortcut(action, services);
  };
  page.addEventListener("keydown", onKeyDown);
  return () => page.removeEventListener("keydown", onKeyDown);
}
