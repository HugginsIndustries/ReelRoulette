import { signal, type ReadonlySignal } from "@preact/signals";
import { DEFAULT_AUTO_PAUSE_MODE, isAutoPauseMode, type AutoPauseMode } from "../playback/autoPause";
import { MAX_PHOTO_DURATION_SECONDS, MIN_PHOTO_DURATION_SECONDS } from "../state/appStore";
import type { DeviceStore } from "../state/deviceStore";
import type { FieldProblem } from "../validation/fieldValidation";
import { DEFAULT_THEME_CHOICE, isThemeChoice, THEME_KEY, type ThemeChoice } from "./theme";

/** The per-device store's key for the Auto-Pause mode. */
export const AUTO_PAUSE_KEY = "panel.autoPause";

/** The per-device store's key for Show file names on tiles. */
export const TILE_NAMES_KEY = "appearance.tileNames";

/**
 * A field's text when it is a whole number from `min` to `max`, or the problem that says what it takes, such as "Use
 * a whole number from 1 to 300 seconds." An emptied field is flagged too, since a setting's field must always hold a
 * value for the app to work.
 */
export function wholeNumberProblem(text: string, min: number, max: number, unit: string): FieldProblem | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return /^\d+$/.test(trimmed) && value >= min && value <= max ? null : { message: `Use a whole number from ${min} to ${max} ${unit}.` };
}

/** Advance after's problem: it takes a whole number of seconds from 1 to 300. */
export function advanceAfterProblem(text: string): FieldProblem | null {
  return wholeNumberProblem(text, MIN_PHOTO_DURATION_SECONDS, MAX_PHOTO_DURATION_SECONDS, "seconds");
}

/**
 * The Settings tab's settings that no other part of the page keeps: the Auto-Pause mode, the theme, and whether tiles
 * show their file names. Each applies as it changes and is kept on this device. The panel keeps its side, the store
 * Advance after, the player its buttons' state, and the notifications service the popup settings.
 */
export interface Settings {
  readonly autoPauseMode: ReadonlySignal<AutoPauseMode>;
  setAutoPauseMode(mode: AutoPauseMode): void;
  /** The theme chosen, System by default, which the page follows. */
  readonly theme: ReadonlySignal<ThemeChoice>;
  setTheme(choice: ThemeChoice): void;
  /** Tiles show their file names, off by default; a tile's tooltip names it either way. */
  readonly tileNames: ReadonlySignal<boolean>;
  setTileNames(on: boolean): void;
  /**
   * Counts the requests to show the popup settings, which the bell's list's Notification settings makes: each one new,
   * so asking again shows them again. The Settings tab opens Popup settings and moves to Show popups for each.
   */
  readonly popupSettingsRequest: ReadonlySignal<number>;
  revealPopupSettings(): void;
}

export function createSettings(options: { device: DeviceStore }): Settings {
  const { device } = options;
  const autoPauseMode = signal(device.read(AUTO_PAUSE_KEY, DEFAULT_AUTO_PAUSE_MODE, isAutoPauseMode));
  const theme = signal(device.read(THEME_KEY, DEFAULT_THEME_CHOICE, isThemeChoice));
  const tileNames = signal(device.read(TILE_NAMES_KEY, false, (value): value is boolean => typeof value === "boolean"));
  const popupSettingsRequest = signal(0);
  return {
    autoPauseMode,
    setAutoPauseMode(mode) {
      autoPauseMode.value = mode;
      device.write(AUTO_PAUSE_KEY, mode);
    },
    theme,
    setTheme(choice) {
      theme.value = choice;
      device.write(THEME_KEY, choice);
    },
    tileNames,
    setTileNames(on) {
      tileNames.value = on;
      device.write(TILE_NAMES_KEY, on);
    },
    popupSettingsRequest,
    revealPopupSettings() {
      popupSettingsRequest.value += 1;
    }
  };
}
