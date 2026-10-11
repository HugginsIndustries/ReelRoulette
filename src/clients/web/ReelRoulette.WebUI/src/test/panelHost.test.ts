import { describe, expect, it } from "vitest";
import {
  createPanelHost,
  isShortScreen,
  panelModeFor,
  type PanelTab,
  type PanelTabHooks
} from "../panel/panelHost";
import { createDeviceStore } from "../state/deviceStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

/** A window whose size and pointer a test sets, telling the host as a resize or a pointer change would. */
function fakeViewport(width = 1200, height = 800, coarse = false) {
  const listeners = new Set<() => void>();
  const viewport = {
    size: { width, height, coarse },
    width: () => viewport.size.width,
    height: () => viewport.size.height,
    coarsePointer: () => viewport.size.coarse,
    watch(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: Partial<{ width: number; height: number; coarse: boolean }>) {
      viewport.size = { ...viewport.size, ...next };
      listeners.forEach((listener) => listener());
    }
  };
  return viewport;
}

/** The panel's elements, with the stage as wide as the window unless a test sets it. */
function fakeElements(viewport: ReturnType<typeof fakeViewport>) {
  const stage = { width: null as number | null };
  return {
    stage,
    elements: {
      stage: {
        get clientWidth() {
          return stage.width ?? viewport.width();
        }
      },
      panel: { hidden: true, contains: () => false },
      /** The handle, as wide as `width` while it shows, as the stylesheet makes it, and 0 wide while hidden. */
      handle: {
        hidden: true,
        width: 12,
        get offsetWidth() {
          return this.hidden ? 0 : this.width;
        },
        contains: () => false
      },
      pages: { library: { hidden: true }, filter: { hidden: true }, tags: { hidden: true } }
    }
  };
}

/** Records each tab's enter and leave. A tab's leave answers `refuse[tab]`'s value, or true. */
function recordingTabs() {
  const calls: string[] = [];
  const refuse: Partial<Record<PanelTab, boolean | Promise<boolean>>> = {};
  const hooks = {} as Record<PanelTab, PanelTabHooks>;
  for (const tab of ["library", "filter", "tags"] as const) {
    hooks[tab] = {
      enter: () => calls.push(`enter ${tab}`),
      leave() {
        calls.push(`leave ${tab}`);
        return refuse[tab] === undefined ? true : (refuse[tab] as boolean | Promise<boolean>);
      }
    };
  }
  return { calls, refuse, hooks };
}

function setup(options: { saved?: Record<string, string>; width?: number; height?: number; coarse?: boolean } = {}) {
  const storage = memoryStorage(options.saved);
  const viewport = fakeViewport(options.width, options.height, options.coarse);
  const panel = createPanelHost({ device: createDeviceStore(storage), viewport });
  const tabs = recordingTabs();
  panel.connectTabs(tabs.hooks);
  const { stage, elements } = fakeElements(viewport);
  panel.attach(elements);
  const shownPages = () => (Object.keys(elements.pages) as PanelTab[]).filter((tab) => !elements.pages[tab].hidden);
  return { panel, storage, viewport, stage, elements, tabs, shownPages };
}

describe("panel host", () => {
  describe("breakpoints", () => {
    it("is the overlay below 800 px of viewport width, and beside the player from 800 px", () => {
      expect(panelModeFor({ width: () => 799, height: () => 900, coarsePointer: () => false })).toBe("overlay");
      expect(panelModeFor({ width: () => 800, height: () => 900, coarsePointer: () => false })).toBe("side");
      expect(panelModeFor({ width: () => 390, height: () => 844, coarsePointer: () => true })).toBe("overlay");
    });

    it("is the overlay on a touch screen below 500 px of viewport height, and not with a mouse", () => {
      expect(panelModeFor({ width: () => 900, height: () => 499, coarsePointer: () => true })).toBe("overlay");
      expect(panelModeFor({ width: () => 900, height: () => 500, coarsePointer: () => true })).toBe("side");
      expect(panelModeFor({ width: () => 900, height: () => 400, coarsePointer: () => false })).toBe("side");
      expect(panelModeFor({ width: () => 1180, height: () => 820, coarsePointer: () => true })).toBe("side");
    });

    it("is a short screen on a touch screen below 500 px of viewport height, at any width, and not with a mouse", () => {
      expect(isShortScreen({ height: () => 499, coarsePointer: () => true })).toBe(true);
      expect(isShortScreen({ height: () => 500, coarsePointer: () => true })).toBe(false);
      expect(isShortScreen({ height: () => 400, coarsePointer: () => false })).toBe(false);

      const { panel, viewport } = setup({ width: 390, height: 844, coarse: true });
      expect(panel.shortScreen.value).toBe(false);
      viewport.set({ width: 844, height: 390 });
      expect(panel.shortScreen.value).toBe(true);
      viewport.set({ width: 667, height: 375 });
      expect(panel.shortScreen.value).toBe(true);
      viewport.set({ width: 1180, height: 820 });
      expect(panel.shortScreen.value).toBe(false);
      viewport.set({ width: 900, height: 400, coarse: false });
      expect(panel.shortScreen.value).toBe(false);
    });

    it("moves an open panel between beside the player and the overlay as the window changes, keeping its tab", async () => {
      const { panel, viewport, tabs, shownPages } = setup();
      await panel.showTab("filter");
      tabs.calls.length = 0;

      viewport.set({ width: 700 });
      expect(panel.mode.value).toBe("overlay");
      viewport.set({ width: 900, height: 420, coarse: true });
      expect(panel.mode.value).toBe("overlay");
      viewport.set({ width: 1200, height: 800, coarse: false });
      expect(panel.mode.value).toBe("side");

      expect(panel.isOpen.value).toBe(true);
      expect(panel.tab.value).toBe("filter");
      expect(shownPages()).toEqual(["filter"]);
      expect(tabs.calls).toEqual([]);
    });
  });

  describe("side", () => {
    it("sits on the right by default, and on the left when this device says so", () => {
      expect(setup().panel.side.value).toBe("right");
      expect(setup({ saved: { "rr_device.panel.side": '"left"' } }).panel.side.value).toBe("left");
      expect(setup({ saved: { "rr_device.panel.side": '"top"' } }).panel.side.value).toBe("right");
    });
  });

  describe("width", () => {
    it("starts at 420 px, and stays between 360 px and the width that leaves the player 400 px", () => {
      const { panel } = setup({ width: 1200 });
      expect(panel.width.value).toBe(420);
      // The stage, less the 12 px handle and the player's 400 px.
      expect(panel.maxWidth.value).toBe(788);

      panel.setWidth(200, true);
      expect(panel.width.value).toBe(360);
      panel.setWidth(2000, true);
      expect(panel.width.value).toBe(788);
      panel.setWidth(533.4, true);
      expect(panel.width.value).toBe(533);
    });

    it("leaves room for the wider handle on a touch screen", () => {
      expect(setup({ width: 1200, coarse: true }).panel.maxWidth.value).toBe(780);
    });

    it("leaves room for the handle as wide as it shows, and as the stylesheet sets it while hidden", async () => {
      const { panel, elements, viewport } = setup({ width: 1200 });
      elements.handle.width = 16;
      expect(panel.maxWidth.value).toBe(788);
      await panel.toggle();
      expect(panel.maxWidth.value).toBe(784);
      viewport.set({ width: 1000 });
      expect(panel.maxWidth.value).toBe(584);
    });

    it("goes by the stage's width once it renders, and is never narrower than 360 px", () => {
      const { panel, stage, viewport } = setup({ width: 1200 });
      stage.width = 1176;
      viewport.set({});
      expect(panel.maxWidth.value).toBe(764);
      stage.width = 772;
      viewport.set({});
      expect(panel.maxWidth.value).toBe(360);
    });

    it("remembers the width only when asked, and keeps it while a narrower window holds the panel narrower", () => {
      const { panel, storage, viewport } = setup({ width: 1400 });
      panel.setWidth(600, false);
      expect(storage.values.has("rr_device.panel.width")).toBe(false);
      panel.setWidth(700, true);
      expect(storage.values.get("rr_device.panel.width")).toBe("700");

      viewport.set({ width: 1000 });
      expect(panel.width.value).toBe(588);
      viewport.set({ width: 1400 });
      expect(panel.width.value).toBe(700);

      const again = setup({ saved: Object.fromEntries(storage.values), width: 1400 });
      expect(again.panel.width.value).toBe(700);
    });
  });

  describe("opening, tabs, and closing", () => {
    it("opens on Library the first time, then on its last tab, and shows one tab at a time", async () => {
      const { panel, elements, tabs, shownPages } = setup();
      expect(panel.isOpen.value).toBe(false);
      expect(elements.panel.hidden).toBe(true);
      expect(shownPages()).toEqual([]);

      await panel.toggle();
      expect(panel.isOpen.value).toBe(true);
      expect(panel.tab.value).toBe("library");
      expect(elements.panel.hidden).toBe(false);
      expect(elements.handle.hidden).toBe(false);
      expect(shownPages()).toEqual(["library"]);

      await panel.showTab("tags");
      expect(shownPages()).toEqual(["tags"]);
      await panel.showTab("tags");
      await panel.toggle();
      expect(panel.isOpen.value).toBe(false);
      expect(elements.panel.hidden).toBe(true);
      expect(elements.handle.hidden).toBe(true);
      expect(shownPages()).toEqual([]);

      await panel.toggle();
      expect(panel.tab.value).toBe("tags");
      expect(shownPages()).toEqual(["tags"]);
      expect(tabs.calls).toEqual(["enter library", "leave library", "enter tags", "leave tags", "enter tags"]);
    });

    it("opens closed on a chosen tab", async () => {
      const { panel, tabs, shownPages } = setup();
      await panel.showTab("filter");
      expect(panel.isOpen.value).toBe(true);
      expect(shownPages()).toEqual(["filter"]);
      expect(tabs.calls).toEqual(["enter filter"]);
    });

    it("keeps a tab that refuses to be left, for another tab and for closing", async () => {
      const { panel, tabs, shownPages } = setup();
      await panel.showTab("tags");
      tabs.refuse.tags = false;

      await panel.showTab("library");
      expect(shownPages()).toEqual(["tags"]);
      await panel.close();
      expect(panel.isOpen.value).toBe(true);
      await panel.toggle();
      expect(panel.isOpen.value).toBe(true);

      tabs.refuse.tags = true;
      await panel.showTab("library");
      expect(shownPages()).toEqual(["library"]);
    });

    it("ignores other requests while a tab decides whether it can be left", async () => {
      const { panel, tabs, shownPages } = setup();
      await panel.showTab("tags");
      let answer!: (leave: boolean) => void;
      tabs.refuse.tags = new Promise<boolean>((resolve) => {
        answer = resolve;
      });
      tabs.calls.length = 0;

      const closing = panel.close();
      await panel.showTab("filter");
      await panel.toggle();
      answer(true);
      await closing;

      expect(panel.isOpen.value).toBe(false);
      expect(shownPages()).toEqual([]);
      expect(tabs.calls).toEqual(["leave tags"]);
    });

    it("closes for a tile, Apply, or Cancel only as the overlay", async () => {
      const { panel, viewport } = setup({ width: 1200 });
      await panel.showTab("library");
      await panel.closeIfOverlay();
      expect(panel.isOpen.value).toBe(true);

      viewport.set({ width: 600 });
      await panel.closeIfOverlay();
      expect(panel.isOpen.value).toBe(false);
    });
  });

  describe("memory", () => {
    it("remembers whether it is open and its tab, and starts a panel remembered open on its tab", async () => {
      const first = setup();
      await first.panel.showTab("filter");
      expect(first.storage.values.get("rr_device.panel.open")).toBe("true");
      expect(first.storage.values.get("rr_device.panel.tab")).toBe('"filter"');

      const again = setup({ saved: Object.fromEntries(first.storage.values) });
      expect(again.panel.isOpen.value).toBe(true);
      expect(again.panel.tab.value).toBe("filter");
      expect(again.shownPages()).toEqual(["filter"]);
      expect(again.tabs.calls).toEqual([]);
      again.panel.startRememberedTab();
      again.panel.startRememberedTab();
      expect(again.tabs.calls).toEqual(["enter filter"]);

      await again.panel.close();
      expect(again.storage.values.get("rr_device.panel.open")).toBe("false");
      expect(setup({ saved: Object.fromEntries(again.storage.values) }).panel.isOpen.value).toBe(false);
    });

    it("starts a remembered tab only while the panel is still open on it, once", async () => {
      const remembered = { "rr_device.panel.open": "true", "rr_device.panel.tab": '"filter"' };
      const chosen = setup({ saved: remembered });
      await chosen.panel.showTab("tags");
      chosen.panel.startRememberedTab();
      expect(chosen.tabs.calls).toEqual(["leave filter", "enter tags"]);

      const closed = setup({ saved: remembered });
      await closed.panel.close();
      closed.panel.startRememberedTab();
      expect(closed.tabs.calls).toEqual(["leave filter"]);
    });

    it("starts closed on Library when what it remembers can't be read", () => {
      const { panel } = setup({ saved: { "rr_device.panel.open": "yes", "rr_device.panel.tab": '"stats"', "rr_device.panel.width": '"wide"' } });
      expect(panel.isOpen.value).toBe(false);
      expect(panel.tab.value).toBe("library");
      expect(panel.width.value).toBe(420);
    });
  });
});
