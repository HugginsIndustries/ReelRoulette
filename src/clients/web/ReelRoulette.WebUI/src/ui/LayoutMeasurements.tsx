import { effect } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { PANEL_MIN_WIDTH } from "../panel/panelHost";
import { useApp } from "./appContext";

/** The Library controls' width from which the preset and search share a row, as the stylesheet's query says. */
const LIBRARY_CONTROLS_ROW_WIDTH = 520;
/** How far the corner buttons sit from the player's top, which a short screen keeps below the status bar. */
const CORNER_BUTTONS_TOP = 12;
/** How far below the corner buttons' top the player's width shows: below the indicator, lower on a narrow player. */
const PLAYER_FIGURE_BELOW = { wide: 40, narrow: 88 };
/** How far in from the safe areas the box sits. */
const BOX_MARGIN = 8;

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A figure's text and where it sits on the screen: its middle, or its left edge, and its top edge. */
interface Placed {
  text: string;
  left: number;
  top: number;
}

/** What the figures show, as last measured. */
interface Figures {
  /** The window's width and height, which the rulers show. */
  width: number;
  height: number;
  safe: Insets;
  panel: Placed | null;
  player: Placed | null;
  grid: Placed | null;
  box: { lines: string[]; left: number; bottom: number; scale: number };
}

/** A place or size on whole pixels, as a style takes it. */
function px(value: number): string {
  return `${Math.round(value)}px`;
}

/** Where a figure sits, its left edge, or its middle when centered, and its top edge. */
function at(left: number, top: number): { left: string; top: string } {
  return { left: px(left), top: px(top) };
}

/** A figure's number, to two decimals at most, such as 2.4 for a gap on 1.25 device pixels. */
function decimal(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The safe-area insets, from the probe's padding, which holds them, since only the stylesheet can read them. */
function safeArea(probe: HTMLElement): Insets {
  const style = getComputedStyle(probe);
  const read = (value: string) => Math.round(Number.parseFloat(value) || 0);
  return { top: read(style.paddingTop), right: read(style.paddingRight), bottom: read(style.paddingBottom), left: read(style.paddingLeft) };
}

/**
 * Show layout measurements, from the Settings tab's Developer section: while it is on, figures over the page show the
 * window's, the panel's, and the player's widths at what they measure, the Library grid's row height and gap during a
 * zoom, and a box at the bottom left the details the layout goes by. They follow the layout as it changes, let taps
 * through, and sit in the stage, so they show in fullscreen. While it is off nothing renders and nothing is observed.
 */
export function LayoutMeasurements() {
  const { settings } = useApp();
  return settings.layoutMeasurements.value ? <MeasuredFigures /> : null;
}

function MeasuredFigures() {
  const { panel, fullscreen, library } = useApp();
  const probe = useRef<HTMLDivElement>(null);
  const [figures, setFigures] = useState<Figures | null>(null);

  useLayoutEffect(() => {
    const installed = window.matchMedia?.("(display-mode: standalone)");

    function measure(): Figures {
      const safe = safeArea(probe.current!);
      // The window's size from the page, which a pinch leaves as it is, where Safari and Chrome on Android report what
      // shows as the window's inner size.
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const overlay = panel.mode.peek() === "overlay";

      // The panel's own box, since as the overlay it covers the window rather than taking its width beside the player.
      let panelFigure: Placed | null = null;
      const panelElement = document.getElementById("panel");
      const panelBox = panelElement?.getBoundingClientRect();
      if (panelElement && panelBox && !panelElement.hidden && panelBox.width > 0) {
        const tabs = panelElement.querySelector(".panel-tabs")?.getBoundingClientRect().bottom ?? panelBox.top;
        const shown = Math.round(panelBox.width);
        panelFigure = {
          text: overlay ? `${shown} px` : `${shown} px (${PANEL_MIN_WIDTH}–${panel.maxWidth.peek()})`,
          left: panelBox.left + panelBox.width / 2,
          top: tabs + 2
        };
      }

      // The player's width, unless the overlay panel covers the player.
      let playerFigure: Placed | null = null;
      const playerWidth = panel.playerWidth.peek();
      const column = document.querySelector(".player-col");
      if (column && playerWidth > 0 && !(overlay && panel.isOpen.peek())) {
        const box = column.getBoundingClientRect();
        const buttons = panel.shortScreen.peek() && !fullscreen.active.peek() ? Math.max(CORNER_BUTTONS_TOP, safe.top) : CORNER_BUTTONS_TOP;
        const below = panel.playerNarrow.peek() ? PLAYER_FIGURE_BELOW.narrow : PLAYER_FIGURE_BELOW.wide;
        playerFigure = { text: `${playerWidth} px`, left: box.left + box.width / 2, top: box.top + buttons + below };
      }

      // The row height a zoom aims the grid's rows at, and its gap, while it lasts and for a moment after.
      let gridFigure: Placed | null = null;
      const zoom = library.gridZoom.peek();
      const gridBox = zoom ? document.getElementById("library-overlay-body")?.getBoundingClientRect() : undefined;
      if (zoom && gridBox && gridBox.width > 0) {
        gridFigure = {
          text: `Rows ${zoom.rowHeight} px · gap ${decimal(zoom.gap)} px`,
          left: gridBox.left + gridBox.width / 2,
          top: gridBox.top + 8
        };
      }

      const controls = document.getElementById("library-controls")?.clientWidth ?? 0;
      const controlsRow =
        controls >= LIBRARY_CONTROLS_ROW_WIDTH ? `${LIBRARY_CONTROLS_ROW_WIDTH} or wider` : `under ${LIBRARY_CONTROLS_ROW_WIDTH}`;
      const lines = [
        `Pixel ratio: ${decimal(window.devicePixelRatio || 1)}`,
        `Layout: ${overlay ? "overlay" : `beside the player, ${panel.side.peek()}`}${panel.shortScreen.peek() ? " · short screen" : ""}`,
        `Safe area: ${safe.top} top · ${safe.right} right · ${safe.bottom} bottom · ${safe.left} left`,
        `Library controls: ${controls ? `${controls} px, ${controlsRow}` : "not showing"}`,
        `Pointer: ${panel.coarsePointer.peek() ? "touch" : "mouse"}`,
        `Running as: ${installed?.matches || (navigator as { standalone?: boolean }).standalone === true ? "installed app" : "browser tab"}`
      ];
      // What shows on screen, which a pinch or the on-screen keyboard makes smaller than the window.
      const visible = window.visualViewport;
      if (visible && (visible.width < width - 1 || visible.height < height - 1)) {
        const zoomed = visible.scale > 1.01 ? `, zoomed ${decimal(visible.scale)}×` : "";
        lines.push(`Visible area: ${Math.round(visible.width)} × ${Math.round(visible.height)}${zoomed}`);
      }
      // The box keeps its size on screen through a pinch, at the bottom left of what shows.
      const scale = visible ? 1 / visible.scale : 1;
      const box = {
        lines,
        scale,
        left: (visible?.offsetLeft ?? 0) + (BOX_MARGIN + safe.left) * scale,
        bottom: height - (visible?.offsetTop ?? 0) - (visible?.height ?? height) + (BOX_MARGIN + safe.bottom) * scale
      };

      return { width, height, safe, panel: panelFigure, player: playerFigure, grid: gridFigure, box };
    }

    // Changes come in bursts, as while the panel's handle is dragged, so the figures follow once a frame.
    let frame: number | null = null;
    function schedule(): void {
      frame ??= requestAnimationFrame(() => {
        frame = null;
        setFigures(measure());
      });
    }

    // What nothing else measures: the panel's box, the Library controls, and the safe areas, which the probe's padding
    // holds. The panel host measures the player column, and its signals say when it does.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    for (const element of [document.getElementById("panel"), document.getElementById("library-controls")]) {
      if (element) {
        observer?.observe(element);
      }
    }
    observer?.observe(probe.current!, { box: "border-box" });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    installed?.addEventListener?.("change", schedule);
    // The panel host's, fullscreen's, and the library's changes, and the first figures.
    const stopFollowing = effect(() => {
      panel.isOpen.value;
      panel.mode.value;
      panel.side.value;
      panel.shortScreen.value;
      panel.coarsePointer.value;
      panel.width.value;
      panel.maxWidth.value;
      panel.playerWidth.value;
      fullscreen.active.value;
      library.gridZoom.value;
      schedule();
    });

    return () => {
      stopFollowing();
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      installed?.removeEventListener?.("change", schedule);
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <div id="layout-measurements" class="dev-figures">
      <div class="dev-safe-probe" ref={probe}></div>
      {figures ? <Shown figures={figures} /> : null}
    </div>
  );
}

/** The figures as last measured, each at what it measures. */
function Shown({ figures }: { figures: Figures }) {
  const { width, height, safe } = figures;
  return (
    <>
      {/* The window, along its top and left edges inside the safe areas, the height reading up its ruler, in from it. */}
      <div class="dev-ruler is-across" style={{ ...at(safe.left, safe.top + 3), width: px(width - safe.left - safe.right) }}></div>
      <div id="layout-window-width" class="dev-figure dev-note is-centered" style={at((safe.left + width - safe.right) / 2, safe.top + 7)}>
        {`${width} px`}
      </div>
      <div class="dev-ruler is-down" style={{ ...at(safe.left + 3, safe.top), height: px(height - safe.top - safe.bottom) }}></div>
      <div id="layout-window-height" class="dev-figure dev-note is-upward" style={at(safe.left + 24, (safe.top + height - safe.bottom) / 2)}>
        {`${height} px`}
      </div>
      <Figure id="layout-panel-width" placed={figures.panel} />
      <Figure id="layout-player-width" placed={figures.player} />
      <Figure id="layout-grid-zoom" placed={figures.grid} />
      <div
        id="layout-details"
        class="dev-box dev-note"
        style={{ left: px(figures.box.left), bottom: px(figures.box.bottom), transform: `scale(${figures.box.scale})` }}
      >
        {figures.box.lines.join("\n")}
      </div>
    </>
  );
}

/** A figure centered at its place, or nothing while what it measures doesn't show. */
function Figure({ id, placed }: { id: string; placed: Placed | null }) {
  return placed ? (
    <div id={id} class="dev-figure dev-note is-centered" style={at(placed.left, placed.top)}>
      {placed.text}
    </div>
  ) : null;
}
