import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type { DeviceStore } from "../state/deviceStore";

export type PanelTab = "library" | "filter" | "tags";
export type PanelSide = "left" | "right";
/** Beside the player, or as a full-screen overlay over it. */
export type PanelMode = "side" | "overlay";

export const PANEL_TABS: readonly PanelTab[] = ["library", "filter", "tags"];
export const PANEL_MIN_WIDTH = 360;
export const PANEL_DEFAULT_WIDTH = 420;
/** The narrowest the player gets beside the panel. */
export const PLAYER_MIN_WIDTH = 400;
/** Below this viewport width the panel is the overlay. */
export const OVERLAY_BELOW_WIDTH = 800;
/**
 * On a touch screen below this viewport height, as a phone on its side, the panel is the overlay and the page shows
 * only the player.
 */
export const OVERLAY_TOUCH_BELOW_HEIGHT = 500;
/** The resize handle's width as the stylesheet sets it, for a mouse and for a touch screen, while it can't be measured. */
const HANDLE_WIDTH = { fine: 12, coarse: 20 };

const OPEN_KEY = "panel.open";
const TAB_KEY = "panel.tab";
const SIDE_KEY = "panel.side";
const WIDTH_KEY = "panel.width";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPanelTab(value: unknown): value is PanelTab {
  return (PANEL_TABS as readonly unknown[]).includes(value);
}

function isPanelSide(value: unknown): value is PanelSide {
  return value === "left" || value === "right";
}

function isWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** What a tab does as it shows and hides. */
export interface PanelTabHooks {
  /** The tab shows, its page already shown: the panel opened on it, or it was chosen. */
  enter(): void;
  /** The tab is about to hide. False keeps it showing, as the tag editor does while a scan runs or the user keeps changes. */
  leave(): boolean | Promise<boolean>;
}

/** The window's size and pointer, which decide where the panel goes. */
export interface PanelViewport {
  width(): number;
  height(): number;
  /** A touch screen, by the `(pointer: coarse)` media query. */
  coarsePointer(): boolean;
  /** Calls `listener` when the size or the pointer changes. Returns a function that stops it. */
  watch(listener: () => void): () => void;
}

/** An element the host shows and hides by its `hidden`. */
export interface HiddenElement {
  hidden: boolean;
}

export interface PanelElements {
  /** The stage, whose width bounds the panel's. */
  stage: { readonly clientWidth: number };
  panel: HiddenElement & { contains(node: Node | null): boolean };
  /** The handle, measured while it shows. It sits beside the panel, not in it. */
  handle: HiddenElement & { readonly offsetWidth: number; contains(node: Node | null): boolean };
  pages: Record<PanelTab, HiddenElement>;
}

/**
 * The side panel: whether it is open, the tab it shows, its side, its width beside the player, and whether it sits
 * beside the player or covers it as the overlay. Its tabs hold the library, the filter, and the tag editor. The host
 * shows and hides the panel and its pages by their `hidden`, before a tab's `enter`, so a tab measures itself shown.
 * It remembers whether the panel is open, its tab, side, and width on this device.
 */
export interface PanelHost {
  readonly isOpen: ReadonlySignal<boolean>;
  /** The tab shown while the panel is open, and the one it opens on next. */
  readonly tab: ReadonlySignal<PanelTab>;
  readonly side: ReadonlySignal<PanelSide>;
  readonly mode: ReadonlySignal<PanelMode>;
  /** A phone on its side, where the panel is the overlay and the page shows only the player. */
  readonly shortScreen: ReadonlySignal<boolean>;
  /** The panel's width beside the player: the remembered width, within what the stage allows now. */
  readonly width: ReadonlySignal<number>;
  /** The widest the panel can be while leaving the player its minimum width. */
  readonly maxWidth: ReadonlySignal<number>;

  /** Gives the host each tab's hooks. Called once, after the tabs' services exist. */
  connectTabs(hooks: Record<PanelTab, PanelTabHooks>): void;
  /** Takes the rendered elements and shows a panel remembered open. Its tab waits for `startRememberedTab`. */
  attach(elements: PanelElements): void;
  /**
   * Starts the tab of a panel remembered open, once the server has passed or failed the compatibility check, so the
   * tab loads nothing before then. Does nothing once the panel has been opened or closed since the page loaded.
   */
  startRememberedTab(): void;
  detach(): void;
  /** The element that takes focus when the panel closes with focus inside it or on its handle: the panel button. */
  attachButton(button: { focus(options?: FocusOptions): void } | null): void;
  /** The panel button: opens the panel on its last tab, or closes it. */
  toggle(): Promise<void>;
  /** Opens the panel on `tab`, or shows `tab` in the open panel, once the tab it leaves agrees. */
  showTab(tab: PanelTab): Promise<void>;
  /** Closes the panel once its tab agrees. */
  close(): Promise<void>;
  /** Closes the panel as the overlay, which covers the player. Beside the player it stays open. */
  closeIfOverlay(): Promise<void>;
  /** Sets the width beside the player, within its limits, and remembers it when `remember`. */
  setWidth(width: number, remember: boolean): void;
}

export interface PanelHostOptions {
  device: DeviceStore;
  /** Defaults to the browser window. */
  viewport?: PanelViewport;
}

function windowViewport(): PanelViewport {
  const coarseQuery = "(pointer: coarse)";
  return {
    width: () => window.innerWidth,
    height: () => window.innerHeight,
    coarsePointer: () => window.matchMedia?.(coarseQuery).matches ?? false,
    watch(listener) {
      const pointer = window.matchMedia?.(coarseQuery);
      window.addEventListener("resize", listener);
      pointer?.addEventListener?.("change", listener);
      return () => {
        window.removeEventListener("resize", listener);
        pointer?.removeEventListener?.("change", listener);
      };
    }
  };
}

/**
 * A touch screen below 500 px of viewport height, as a phone on its side. It goes by the viewport and the pointer,
 * never the user agent.
 */
export function isShortScreen(viewport: Pick<PanelViewport, "height" | "coarsePointer">): boolean {
  return viewport.coarsePointer() && viewport.height() < OVERLAY_TOUCH_BELOW_HEIGHT;
}

/**
 * Where the panel goes: the overlay below 800 px of viewport width, or on a short screen; otherwise beside the player.
 * It goes by the viewport and the pointer, never the user agent.
 */
export function panelModeFor(viewport: Pick<PanelViewport, "width" | "height" | "coarsePointer">): PanelMode {
  return viewport.width() < OVERLAY_BELOW_WIDTH || isShortScreen(viewport) ? "overlay" : "side";
}

export function createPanelHost(options: PanelHostOptions): PanelHost {
  const { device } = options;
  const viewport = options.viewport ?? windowViewport();

  const isOpen = signal(device.read(OPEN_KEY, false, isBoolean));
  const tab = signal(device.read(TAB_KEY, "library", isPanelTab));
  const side = signal(device.read(SIDE_KEY, "right", isPanelSide));
  const remembered = signal(Math.max(PANEL_MIN_WIDTH, device.read(WIDTH_KEY, PANEL_DEFAULT_WIDTH, isWidth)));
  const mode = signal(panelModeFor(viewport));
  const shortScreen = signal(isShortScreen(viewport));
  const stageWidth = signal(viewport.width());
  const coarse = signal(viewport.coarsePointer());
  /** The handle's width while it shows, or 0 before it has been measured. */
  const handleWidth = signal(0);

  const maxWidth = computed(() => {
    const handle = handleWidth.value || (coarse.value ? HANDLE_WIDTH.coarse : HANDLE_WIDTH.fine);
    return Math.max(PANEL_MIN_WIDTH, stageWidth.value - handle - PLAYER_MIN_WIDTH);
  });
  const width = computed(() => Math.round(Math.min(Math.max(remembered.value, PANEL_MIN_WIDTH), maxWidth.value)));

  let hooks: Record<PanelTab, PanelTabHooks> | null = null;
  let elements: PanelElements | null = null;
  let button: { focus(options?: FocusOptions): void } | null = null;
  let stopWatching: (() => void) | null = null;
  let stageObserver: ResizeObserver | null = null;
  /** A tab is deciding whether it can be left, as the tag editor asks about its changes. */
  let leaving = false;
  /** The panel was remembered open, and its tab waits for the server's compatibility check. */
  let rememberedTabWaits = false;

  /**
   * Reads the window, the stage, and the handle again. The stage is the window's width before it renders, and a
   * hidden handle keeps the width it was last measured at.
   */
  function measure(): void {
    mode.value = panelModeFor(viewport);
    shortScreen.value = isShortScreen(viewport);
    coarse.value = viewport.coarsePointer();
    stageWidth.value = elements?.stage.clientWidth || viewport.width();
    if (elements?.handle.offsetWidth) {
      handleWidth.value = elements.handle.offsetWidth;
    }
  }

  function render(): void {
    if (!elements) {
      return;
    }
    const open = isOpen.peek();
    elements.panel.hidden = !open;
    elements.handle.hidden = !open;
    for (const name of PANEL_TABS) {
      elements.pages[name].hidden = !open || name !== tab.peek();
    }
    if (open) {
      measure();
    }
  }

  function enter(): void {
    hooks?.[tab.peek()].enter();
  }

  /** Asks the tab showing whether it can be left. True while the panel is closed. */
  async function leaveShown(): Promise<boolean> {
    if (!isOpen.peek() || !hooks) {
      return true;
    }
    leaving = true;
    try {
      return await hooks[tab.peek()].leave();
    } finally {
      leaving = false;
    }
  }

  function openOn(next: PanelTab): void {
    rememberedTabWaits = false;
    tab.value = next;
    isOpen.value = true;
    device.write(TAB_KEY, next);
    device.write(OPEN_KEY, true);
    render();
    enter();
  }

  async function close(): Promise<void> {
    if (!isOpen.peek() || leaving || !(await leaveShown())) {
      return;
    }
    const focused = typeof document === "undefined" ? null : document.activeElement;
    const hadFocus = !!elements && !!focused && (elements.panel.contains(focused) || elements.handle.contains(focused));
    rememberedTabWaits = false;
    isOpen.value = false;
    device.write(OPEN_KEY, false);
    render();
    if (hadFocus) {
      button?.focus({ preventScroll: true });
    }
  }

  async function showTab(next: PanelTab): Promise<void> {
    if (leaving) {
      return;
    }
    if (!isOpen.peek()) {
      openOn(next);
      return;
    }
    if (next === tab.peek() || !(await leaveShown())) {
      return;
    }
    openOn(next);
  }

  return {
    isOpen,
    tab,
    side,
    mode,
    shortScreen,
    width,
    maxWidth,

    connectTabs(connected) {
      hooks = connected;
    },

    attach(attached) {
      elements = attached;
      measure();
      render();
      stopWatching = viewport.watch(measure);
      if (typeof ResizeObserver !== "undefined" && typeof Element !== "undefined" && attached.stage instanceof Element) {
        stageObserver = new ResizeObserver(() => measure());
        stageObserver.observe(attached.stage);
      }
      rememberedTabWaits = isOpen.peek();
    },

    startRememberedTab() {
      if (rememberedTabWaits) {
        rememberedTabWaits = false;
        enter();
      }
    },

    detach() {
      stopWatching?.();
      stopWatching = null;
      stageObserver?.disconnect();
      stageObserver = null;
      elements = null;
    },

    attachButton(attached) {
      button = attached;
    },

    toggle() {
      return isOpen.peek() ? close() : showTab(tab.peek());
    },

    showTab,
    close,

    closeIfOverlay() {
      return mode.peek() === "overlay" ? close() : Promise.resolve();
    },

    setWidth(next, remember) {
      remembered.value = Math.round(Math.min(Math.max(next, PANEL_MIN_WIDTH), maxWidth.peek()));
      if (remember) {
        device.write(WIDTH_KEY, remembered.peek());
      }
    }
  };
}
