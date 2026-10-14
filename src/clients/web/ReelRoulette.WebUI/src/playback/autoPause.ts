import { effect, untracked, type ReadonlySignal } from "@preact/signals";
import type { PanelHost, PanelMode } from "../panel/panelHost";
import type { Player } from "./player";

/**
 * When opening the panel pauses playback: never; always, at any width; or responsive, only while the panel covers
 * the player as the full-screen overlay. What shows over the whole page pauses it under always and responsive.
 */
export type AutoPauseMode = "never" | "always" | "responsive";

/** The mode a device starts with, until its Settings tab changes it. */
export const DEFAULT_AUTO_PAUSE_MODE: AutoPauseMode = "responsive";

export const AUTO_PAUSE_MODES: readonly AutoPauseMode[] = ["responsive", "always", "never"];

export function isAutoPauseMode(value: unknown): value is AutoPauseMode {
  return (AUTO_PAUSE_MODES as readonly unknown[]).includes(value);
}

export interface AutoPauseCover {
  panelOpen: boolean;
  panelMode: PanelMode;
  /** Something shows over the whole page, covering the player, as Auto Tag does. */
  overPage: boolean;
}

/** Whether Auto-Pause wants playback paused. */
export function autoPauseWants(mode: AutoPauseMode, cover: AutoPauseCover): boolean {
  if (mode === "never") {
    return false;
  }
  if (cover.overPage) {
    return true;
  }
  return cover.panelOpen && (mode === "always" || cover.panelMode === "overlay");
}

export interface AutoPauseOptions {
  mode: ReadonlySignal<AutoPauseMode>;
  panel: Pick<PanelHost, "isOpen" | "mode">;
  /** Something shows over the whole page, covering the player, as Auto Tag does. */
  overPage: ReadonlySignal<boolean>;
  player: Pick<Player, "autoPause" | "autoResume">;
}

/**
 * Pauses playback as the panel opens, or as something comes over the whole page, as the mode says, and resumes it as
 * they close or the panel moves beside the player. It acts only when what it wants changes, so a play or pause the
 * user makes in between stands, and it resumes only what it paused. Returns a function that stops it.
 */
export function createAutoPause(options: AutoPauseOptions): () => void {
  const { mode, panel, overPage, player } = options;
  let wanted = false;
  return effect(() => {
    const wants = autoPauseWants(mode.value, {
      panelOpen: panel.isOpen.value,
      panelMode: panel.mode.value,
      overPage: overPage.value
    });
    if (wants === wanted) {
      return;
    }
    wanted = wants;
    // The player's own state doesn't rerun it.
    untracked(() => (wants ? player.autoPause() : player.autoResume()));
  });
}
