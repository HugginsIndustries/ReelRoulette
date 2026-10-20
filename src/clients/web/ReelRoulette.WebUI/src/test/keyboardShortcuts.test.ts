// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { describe, expect, it, vi } from "vitest";
import { focusTakesKey, runShortcut, SHORTCUT_LINES, shortcutFor, type KeyPress, type ShortcutAction, type ShortcutServices } from "../keyboard/shortcuts";
import type { PanelTab } from "../panel/panelHost";

/** A key press on the page's body, with nothing held, unless `changes` says otherwise. */
function press(key: string, changes: Partial<KeyPress> = {}): KeyPress {
  return { key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, defaultPrevented: false, target: document.body, ...changes };
}

function input(type: string): HTMLInputElement {
  return Object.assign(document.createElement("input"), { type });
}

function editable(): HTMLElement {
  const element = document.createElement("div");
  element.contentEditable = "true";
  Object.defineProperty(element, "isContentEditable", { value: true });
  return element;
}

/** Every key the table binds, with the action it is bound to. */
const BOUND: readonly [KeyPress, ShortcutAction][] = [
  [press("k"), "playOrPause"],
  [press(" "), "playOrPause"],
  [press("j"), "seekBack"],
  [press("l"), "seekForward"],
  [press("ArrowLeft"), "previous"],
  [press("ArrowRight"), "next"],
  [press("r"), "random"],
  [press("f"), "favorite"],
  [press("b"), "blacklist"],
  [press("a"), "autoplay"],
  [press("m"), "mute"],
  [press(","), "frameBack"],
  [press("."), "frameForward"],
  [press("["), "volumeDown"],
  [press("]"), "volumeUp"],
  [press("1"), "library"],
  [press("2"), "filter"],
  [press("3"), "tags"],
  [press("4"), "stats"],
  [press("5"), "settings"],
  [press("t"), "tags"],
  [press("s"), "settings"],
  [press("p"), "panel"],
  [press("F", { shiftKey: true }), "fullscreen"],
  [press("h"), "shortcuts"]
];

describe("shortcutFor", () => {
  it("gives each bound key its action", () => {
    expect(BOUND.map(([keyPress]) => shortcutFor(keyPress))).toEqual(BOUND.map(([, action]) => action));
  });

  it("binds exactly the keys the reference lists, and no others", () => {
    const listed = SHORTCUT_LINES.flatMap((line) => line.bindings.map((binding) => binding.action)).sort();
    const bound = [...BOUND.map(([, action]) => action)].sort();
    expect(listed).toEqual(bound);
    // Every printable key and the named keys a keyboard sends, with Shift and without: only the table's keys act.
    const named = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter", "Tab", "Backspace", "Delete", "F11", "Escape"];
    const keys = [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), ...named];
    const acting = keys.flatMap((key) =>
      [false, true].flatMap((shiftKey) => {
        const action = shortcutFor(press(key, { shiftKey }));
        return action ? [`${shiftKey ? "Shift+" : ""}${key}`] : [];
      })
    );
    expect(acting.sort()).toEqual(
      [" ", ",", ".", "1", "2", "3", "4", "5", "ArrowLeft", "ArrowRight", "Shift+F", "Shift+f", "[", "]", "a", "b", "f", "h", "j", "k", "l", "m", "p", "r", "s", "t", "A", "B", "F", "H", "J", "K", "L", "M", "P", "R", "S", "T"].sort()
    );
  });

  it("reads a letter typed with Caps Lock as the letter, and Shift with any key but F as no shortcut, ? included, which Firefox takes", () => {
    expect(shortcutFor(press("K"))).toBe("playOrPause");
    expect(shortcutFor(press("f"))).toBe("favorite");
    expect(shortcutFor(press("H"))).toBe("shortcuts");
    expect(
      [press("K", { shiftKey: true }), press("ArrowLeft", { shiftKey: true }), press("<", { shiftKey: true }), press("?", { shiftKey: true }), press("?")].map(shortcutFor)
    ).toEqual([null, null, null, null, null]);
  });

  it("is no shortcut while Ctrl, Alt, or Meta is held, so the browser's own keys stay its own", () => {
    expect([press("k", { ctrlKey: true }), press("q", { ctrlKey: true }), press("o", { ctrlKey: true }), press("k", { altKey: true }), press("k", { metaKey: true })].map(shortcutFor)).toEqual([
      null,
      null,
      null,
      null,
      null
    ]);
  });

  it("leaves a key the focused element already handled to it", () => {
    expect(shortcutFor(press(" ", { defaultPrevented: true }))).toBeNull();
  });

  it("repeats a held key only to seek, step a frame, or step the volume", () => {
    const held = BOUND.filter(([keyPress]) => shortcutFor({ ...keyPress, repeat: true }) !== null).map(([, action]) => action);
    expect(held).toEqual(["seekBack", "seekForward", "frameBack", "frameForward", "volumeDown", "volumeUp"]);
  });

  it("is no shortcut in a text field, a text area, a dropdown, or editable text", () => {
    for (const target of [input("text"), input("search"), input("number"), document.createElement("textarea"), document.createElement("select"), editable()]) {
      expect(BOUND.map(([keyPress]) => shortcutFor({ ...keyPress, target }))).toEqual(BOUND.map(() => null));
    }
  });

  it("leaves a slider its own keys and takes every other", () => {
    const slider = input("range");
    expect(shortcutFor(press("ArrowLeft", { target: slider }))).toBeNull();
    expect(shortcutFor(press("ArrowRight", { target: slider }))).toBeNull();
    expect([" ", "k", "j", "m", "["].map((key) => shortcutFor(press(key, { target: slider })))).toEqual(["playOrPause", "playOrPause", "seekBack", "mute", "volumeDown"]);
  });
});

describe("focusTakesKey", () => {
  it("gives a slider its arrow keys, Home, End, Page Up, and Page Down, and nothing else", () => {
    const slider = input("range");
    expect(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].every((key) => focusTakesKey(slider, key))).toBe(true);
    expect([" ", "k", "Enter"].some((key) => focusTakesKey(slider, key))).toBe(false);
  });

  it("gives a checkbox and a radio button the left and right arrows and Space", () => {
    for (const target of [input("checkbox"), input("radio")]) {
      expect(["ArrowLeft", "ArrowRight", " "].map((key) => focusTakesKey(target, key))).toEqual([true, true, true]);
      expect(focusTakesKey(target, "k")).toBe(false);
    }
  });

  it("gives Space to what it activates: a button, a link, a summary, or a tile or anything else with a tab stop", () => {
    const tile = document.createElement("div");
    tile.tabIndex = 0;
    const inTile = document.createElement("span");
    tile.append(inTile);
    for (const target of [document.createElement("button"), document.createElement("a"), document.createElement("summary"), tile, inTile]) {
      expect([focusTakesKey(target, " "), focusTakesKey(target, "k"), focusTakesKey(target, "ArrowLeft")]).toEqual([true, false, false]);
    }
  });

  it("leaves Space to the page on what takes focus without a tab stop, as the bell's list's title does", () => {
    const title = document.createElement("h2");
    title.tabIndex = -1;
    expect(focusTakesKey(title, " ")).toBe(false);
  });

  it("gives nothing to the page itself, or to no target", () => {
    expect([" ", "k", "ArrowLeft"].map((key) => focusTakesKey(document.body, key))).toEqual([false, false, false]);
    expect(focusTakesKey(null, " ")).toBe(false);
  });
});

/** Lets promises the shortcut started settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Services that note what each shortcut asked of them. */
function services(options: { open?: boolean; tab?: PanelTab; volumeShown?: boolean } = {}) {
  const calls: string[] = [];
  const note =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length ? `${name}(${args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(", ")})` : name);
      return Promise.resolve();
    };
  const isOpen = signal(options.open ?? false);
  const tab = signal<PanelTab>(options.tab ?? "library");
  const shown: ShortcutServices = {
    player: {
      playOrPause: note("playOrPause"),
      seekBy: note("seekBy"),
      stepFrame: note("stepFrame"),
      previous: note("previous"),
      next: note("next"),
      pickRandom: note("pickRandom"),
      toggleFavorite: note("toggleFavorite"),
      toggleBlacklist: note("toggleBlacklist"),
      toggleAutoplay: note("toggleAutoplay")
    },
    audio: { toggleMute: note("toggleMute"), stepVolume: note("stepVolume"), volumeShown: signal(options.volumeShown ?? true) },
    panel: {
      isOpen,
      tab,
      showTab: vi.fn(async (next: PanelTab) => {
        calls.push(`showTab(${next})`);
        isOpen.value = true;
        tab.value = next;
      }),
      close: note("close"),
      toggle: note("toggle")
    },
    fullscreen: { toggle: note("fullscreen") },
    settings: { seekStep: signal(10), revealShortcuts: note("revealShortcuts") }
  } as unknown as ShortcutServices;
  return { services: shown, calls };
}

describe("runShortcut", () => {
  it("does what the player's controls, the panel, and fullscreen do, seeking by the seek step", async () => {
    const actions: ShortcutAction[] = ["playOrPause", "seekBack", "seekForward", "previous", "next", "random", "favorite", "blacklist", "autoplay", "mute", "frameBack", "frameForward", "volumeDown", "volumeUp", "panel", "fullscreen"];
    const { services: shown, calls } = services();
    actions.forEach((action) => runShortcut(action, shown));
    expect(calls).toEqual([
      "playOrPause",
      "seekBy(-10)",
      "seekBy(10)",
      "previous",
      "next",
      "pickRandom",
      "toggleFavorite",
      "toggleBlacklist",
      "toggleAutoplay",
      "toggleMute",
      "stepFrame(-1)",
      "stepFrame(1)",
      "stepVolume(-1)",
      "stepVolume(1)",
      'toggle({"byKey":true})',
      "fullscreen"
    ]);
  });

  it("leaves the volume alone where its slider hides", () => {
    const { services: shown, calls } = services({ volumeShown: false });
    runShortcut("volumeUp", shown);
    runShortcut("volumeDown", shown);
    expect(calls).toEqual([]);
  });

  it("opens the panel on a tab, shows another tab in the open panel, and closes the panel on the open tab's key", () => {
    const closed = services();
    runShortcut("filter", closed.services);
    expect(closed.calls).toEqual(["showTab(filter)"]);

    const open = services({ open: true, tab: "filter" });
    runShortcut("tags", open.services);
    expect(open.calls).toEqual(["showTab(tags)"]);
    runShortcut("tags", open.services);
    expect(open.calls).toEqual(["showTab(tags)", 'close({"byKey":true})']);
  });

  it("opens Settings, then asks it to show the shortcuts, but not when the tab it left kept the panel where it was", async () => {
    const { services: shown, calls } = services();
    runShortcut("shortcuts", shown);
    await settle();
    expect(calls).toEqual(["showTab(settings)", "revealShortcuts"]);

    const kept = services({ open: true, tab: "filter" });
    (kept.services.panel as { showTab: (tab: PanelTab) => Promise<void> }).showTab = async (tab) => void kept.calls.push(`showTab(${tab})`);
    runShortcut("shortcuts", kept.services);
    await settle();
    expect(kept.calls).toEqual(["showTab(settings)"]);
  });
});
