import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { isBoolean, type DeviceStore } from "../state/deviceStore";

export type PanelTab = "library" | "tags" | "stats" | "filter" | "randomization" | "settings";
export type PanelSide = "left" | "right";
/** Beside the player, or as a full-screen overlay over it. */
export type PanelMode = "side" | "overlay";

export const PANEL_TABS: readonly PanelTab[] = ["library", "tags", "stats", "filter", "randomization", "settings"];
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
/**
 * A player narrower than this is narrow: the player's indicator moves below its corner buttons. It goes by the player
 * column's measured width, since the panel beside it narrows it too.
 */
export const NARROW_PLAYER_BELOW_WIDTH = 600;
/** The resize handle's width as the stylesheet sets it, for a mouse and for a touch screen, while it can't be measured. */
const HANDLE_WIDTH = { fine: 12, coarse: 20 };

const OPEN_KEY = "panel.open";
const TAB_KEY = "panel.tab";
const SIDE_KEY = "panel.side";
const WIDTH_KEY = "panel.width";

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
  /** The tab is about to hide. False keeps it showing; each tab now agrees, keeping its changes while it is hidden. */
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

/** An element the host measures. */
export interface MeasuredElement {
  readonly clientWidth: number;
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
 * beside the player or covers it as the overlay. Its tabs hold the library, the tag editor, the stats, the filter, the
 * random pick options, and the settings. The host shows and hides the panel and its pages by their `hidden`, before a tab's `enter`, so a tab
 * measures itself shown. It remembers whether the panel is open, its tab, side, and width on this device.
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
  /** The player column is narrower than 600 px, so the player's indicator sits below its corner buttons. */
  readonly playerNarrow: ReadonlySignal<boolean>;

  /** Gives the host each tab's hooks. Called once, after the tabs' services exist. */
  connectTabs(hooks: Record<PanelTab, PanelTabHooks>): void;
  /** Takes the rendered elements and shows a panel remembered open. Its tab waits for `startRememberedTab`. */
  attach(elements: PanelElements): void;
  /**
   * Starts the tab of a panel remembered open, once the server has passed or failed the compatibility check or found no
   * library, so the tab loads nothing before then. Does nothing once the panel has been opened or closed since the page
   * loaded.
   */
  startRememberedTab(): void;
  detach(): void;
  /**
   * Takes the player column, or lets it go with null. Its width is measured whenever the host measures, as the window,
   * the stage, or the column itself resizes, the panel opens or closes, or its handle changes its width.
   */
  attachPlayer(column: MeasuredElement | null): void;
  /** The panel button: opens the panel on its last tab, or closes it as `close` does. */
  toggle(): Promise<void>;
  /** Opens the panel on `tab`, or shows `tab` in the open panel, once the tab it leaves agrees. */
  showTab(tab: PanelTab): Promise<void>;
  /**
   * Closes the panel once its tab agrees. Focus inside it goes to the page, so keys don't go to a text field it hides.
   */
  close(): Promise<void>;
  /** Closes the panel as the overlay, which covers the player. Beside the player it stays open. */
  closeIfOverlay(): Promise<void>;
  /** Sets the width beside the player, within its limits, and remembers it when `remember`. */
  setWidth(width: number, remember: boolean): void;
  /** Moves the panel to `side` and remembers it. An open panel beside the player moves at once. */
  setSide(side: PanelSide): void;
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
  const playerNarrow = signal(false);

  /** The widest the panel can be while leaving the player its minimum width. */
  const maxWidth = computed(() => {
    const handle = handleWidth.value || (coarse.value ? HANDLE_WIDTH.coarse : HANDLE_WIDTH.fine);
    return Math.max(PANEL_MIN_WIDTH, stageWidth.value - handle - PLAYER_MIN_WIDTH);
  });
  const width = computed(() => Math.round(Math.min(Math.max(remembered.value, PANEL_MIN_WIDTH), maxWidth.value)));

  let hooks: Record<PanelTab, PanelTabHooks> | null = null;
  let elements: PanelElements | null = null;
  let stopWatching: (() => void) | null = null;
  let stageObserver: ResizeObserver | null = null;
  let playerColumn: MeasuredElement | null = null;
  let playerObserver: ResizeObserver | null = null;
  /** A tab is deciding whether it can be left. */
  let leaving = false;
  /** The panel was remembered open, and its tab waits for the server's compatibility check or its library state. */
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
    measurePlayer();
  }

  /** Reads the player column's width. A column not laid out, which measures 0, is not narrow. */
  function measurePlayer(): void {
    const columnWidth = playerColumn?.clientWidth ?? 0;
    playerNarrow.value = columnWidth > 0 && columnWidth < NARROW_PLAYER_BELOW_WIDTH;
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
    } else {
      // The player widens as the panel beside it closes.
      measurePlayer();
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
    const hadFocus = !!elements && !!focused && elements.panel.contains(focused);
    rememberedTabWaits = false;
    isOpen.value = false;
    device.write(OPEN_KEY, false);
    render();
    if (hadFocus) {
      (focused as HTMLElement).blur?.();
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
    playerNarrow,

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

    attachPlayer(column) {
      playerObserver?.disconnect();
      playerObserver = null;
      playerColumn = column;
      if (column && typeof ResizeObserver !== "undefined" && typeof Element !== "undefined" && column instanceof Element) {
        playerObserver = new ResizeObserver(() => measurePlayer());
        playerObserver.observe(column);
      }
      measurePlayer();
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
      // The stage has taken the new width by now, so the player column measures what is left beside the panel.
      measurePlayer();
      if (remember) {
        device.write(WIDTH_KEY, remembered.peek());
      }
    },

    setSide(next) {
      side.value = next;
      device.write(SIDE_KEY, next);
    }
  };
}
