import { signal, type ReadonlySignal } from "@preact/signals";
import type { Dialogs } from "../dialogs/dialogs";
import { AMBIENT_KEY, AMBIENT_TUNING_KEY, DEFAULT_AMBIENT_TUNING, readAmbientTuning, type AmbientTuning } from "../playback/ambient";
import { DEFAULT_AUTO_PAUSE_MODE, isAutoPauseMode, type AutoPauseMode } from "../playback/autoPause";
import { BOOST_LIMIT_RANGE, MANUAL_TARGET_RANGE } from "../playback/loudnessNormalization";
import { HIDE_AFTER_RANGE } from "../playback/playerControls";
import { MAX_ADVANCE_AFTER_SECONDS, MIN_ADVANCE_AFTER_SECONDS } from "../state/appStore";
import { isBoolean, type DeviceStore } from "../state/deviceStore";
import type { FieldProblem } from "../validation/fieldValidation";
import { DEFAULT_THEME_CHOICE, isThemeChoice, THEME_KEY, type ThemeChoice } from "./theme";

/** The per-device store's key for the Auto-Pause mode. */
export const AUTO_PAUSE_KEY = "panel.autoPause";

/** The per-device store's key for Show file names on tiles. */
export const TILE_NAMES_KEY = "appearance.tileNames";

/** The per-device store's key for the seek step. */
export const SEEK_STEP_KEY = "player.seekStep";

/** How the Developer settings' keys in the per-device store start, which Reset this device's settings keeps. */
const DEVELOPER_KEY_PREFIX = "developer.";

/** What Reset this device's settings asks first. */
export const RESET_DEVICE_QUESTION =
  "Reset this device's settings? Every setting on this device except the Developer ones goes back to its default, and the page reloads.";

/** The seek step's choices, in seconds: the desktop's. */
export const SEEK_STEPS = [1, 5, 10] as const;
export type SeekStep = (typeof SEEK_STEPS)[number];
export const DEFAULT_SEEK_STEP: SeekStep = 5;

export function isSeekStep(value: unknown): value is SeekStep {
  return SEEK_STEPS.includes(value as SeekStep);
}

/** A range's unit after its maximum, or nothing for a value without one, such as a ratio. */
function unitText(unit: string): string {
  return unit ? ` ${unit}` : "";
}

/**
 * A field's text when it is a whole number from `min` to `max`, or the problem that says what it takes, such as "Use
 * a whole number from 1 to 3600 seconds." An emptied field is flagged too, since a setting's field must always hold a
 * value for the app to work.
 */
export function wholeNumberProblem(text: string, min: number, max: number, unit: string): FieldProblem | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return /^\d+$/.test(trimmed) && value >= min && value <= max ? null : { message: `Use a whole number from ${min} to ${max}${unitText(unit)}.` };
}

/**
 * A field's text when it is a number from `min` to `max`, a negative or decimal one included, such as "-23.5", or the
 * problem that says what it takes, such as "Use a number from -50 to -10 LUFS." An emptied field is flagged too.
 */
export function numberProblem(text: string, min: number, max: number, unit: string): FieldProblem | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return /^-?\d+(\.\d+)?$/.test(trimmed) && value >= min && value <= max ? null : { message: `Use a number from ${min} to ${max}${unitText(unit)}.` };
}

/** Advance after's problem: it takes a whole number of seconds from 1 to 3600. */
export function advanceAfterProblem(text: string): FieldProblem | null {
  return wholeNumberProblem(text, MIN_ADVANCE_AFTER_SECONDS, MAX_ADVANCE_AFTER_SECONDS, "seconds");
}

/** Hide after's problem: it takes a whole number of seconds from 1 to 30. */
export function hideAfterProblem(text: string): FieldProblem | null {
  return wholeNumberProblem(text, HIDE_AFTER_RANGE.min, HIDE_AFTER_RANGE.max, "seconds");
}

/** Manual's target's problem: it takes a number of LUFS from -50 to -10. */
export function manualTargetProblem(text: string): FieldProblem | null {
  return numberProblem(text, MANUAL_TARGET_RANGE.min, MANUAL_TARGET_RANGE.max, "LUFS");
}

/** The boost limit's problem: it takes a whole number of dB from 0 to 24. */
export function boostLimitProblem(text: string): FieldProblem | null {
  return wholeNumberProblem(text, BOOST_LIMIT_RANGE.min, BOOST_LIMIT_RANGE.max, "dB");
}

/**
 * The Settings tab's settings that no other part of the page keeps: the Auto-Pause mode, the theme, ambient mode and its
 * settings, whether tiles show their file names, and the seek step. Each applies as it changes and is kept on this
 * device. The panel keeps its side, the store Advance after, the autoplay settings, and Don't record plays, the player
 * its buttons' state, the player's controls Hide player controls and its settings, the audio stage Enhanced audio,
 * loudness normalization its own settings, and the notifications service the popup settings. Reset this device's
 * settings puts them all back but the Developer ones.
 */
export interface Settings {
  readonly autoPauseMode: ReadonlySignal<AutoPauseMode>;
  setAutoPauseMode(mode: AutoPauseMode): void;
  /** The theme chosen, System by default, which the page follows. */
  readonly theme: ReadonlySignal<ThemeChoice>;
  setTheme(choice: ThemeChoice): void;
  /** Ambient mode, on by default: a soft glow of the picture's colors fills the black space around it. */
  readonly ambient: ReadonlySignal<boolean>;
  setAmbient(on: boolean): void;
  /** Ambient mode's settings, which apply whether it is on or off. */
  readonly ambientTuning: ReadonlySignal<AmbientTuning>;
  /** Changes the settings given, keeping the others. */
  setAmbientTuning(changes: Partial<AmbientTuning>): void;
  /** Puts every one of ambient mode's settings back to its default. */
  resetAmbientTuning(): void;
  /** Tiles show their file names, off by default; a tile's tooltip names it either way. */
  readonly tileNames: ReadonlySignal<boolean>;
  setTileNames(on: boolean): void;
  /**
   * Counts the requests to show the popup settings, which the bell's list's Notification settings makes: each one new,
   * so asking again shows them again. The Settings tab opens Popup settings and moves to Show popups for each.
   */
  readonly popupSettingsRequest: ReadonlySignal<number>;
  revealPopupSettings(): void;
  /** How far J and L seek, in seconds: 1, 5, or 10, and 5 by default. */
  readonly seekStep: ReadonlySignal<SeekStep>;
  setSeekStep(step: SeekStep): void;
  /**
   * Counts the requests to show the keyboard shortcuts, which H makes once the Settings tab shows: each one new, so
   * asking again shows them again. The Settings tab expands Keyboard shortcuts and moves to it for each.
   */
  readonly shortcutsRequest: ReadonlySignal<number>;
  revealShortcuts(): void;
  /**
   * Reset this device's settings: asks first, then clears every setting on this device except the Developer ones and
   * reloads the page, since each part reads its settings once, as the page starts. Cancel changes nothing.
   */
  resetDevice(): Promise<void>;
}

export interface SettingsOptions {
  device: DeviceStore;
  /** The in-app dialogs, for the reset's question. */
  dialogs: Pick<Dialogs, "confirm">;
  /** Reloads the page, which ends a reset. */
  reloadPage: () => void;
}

export function createSettings(options: SettingsOptions): Settings {
  const { device, dialogs, reloadPage } = options;
  const autoPauseMode = signal(device.read(AUTO_PAUSE_KEY, DEFAULT_AUTO_PAUSE_MODE, isAutoPauseMode));
  const theme = signal(device.read(THEME_KEY, DEFAULT_THEME_CHOICE, isThemeChoice));
  const ambient = signal(device.read(AMBIENT_KEY, true, isBoolean));
  const ambientTuning = signal(readAmbientTuning(device));
  const tileNames = signal(device.read(TILE_NAMES_KEY, false, isBoolean));
  const popupSettingsRequest = signal(0);
  const seekStep = signal(device.read(SEEK_STEP_KEY, DEFAULT_SEEK_STEP, isSeekStep));
  const shortcutsRequest = signal(0);
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
    ambient,
    setAmbient(on) {
      ambient.value = on;
      device.write(AMBIENT_KEY, on);
    },
    ambientTuning,
    setAmbientTuning(changes) {
      ambientTuning.value = { ...ambientTuning.peek(), ...changes };
      device.write(AMBIENT_TUNING_KEY, ambientTuning.peek());
    },
    resetAmbientTuning() {
      ambientTuning.value = { ...DEFAULT_AMBIENT_TUNING };
      device.write(AMBIENT_TUNING_KEY, ambientTuning.peek());
    },
    tileNames,
    setTileNames(on) {
      tileNames.value = on;
      device.write(TILE_NAMES_KEY, on);
    },
    popupSettingsRequest,
    revealPopupSettings() {
      popupSettingsRequest.value += 1;
    },
    seekStep,
    setSeekStep(step) {
      if (!isSeekStep(step)) return;
      seekStep.value = step;
      device.write(SEEK_STEP_KEY, step);
    },
    shortcutsRequest,
    revealShortcuts() {
      shortcutsRequest.value += 1;
    },
    async resetDevice() {
      if (!(await dialogs.confirm({ message: RESET_DEVICE_QUESTION, confirmLabel: "Reset", danger: true }))) {
        return;
      }
      device.clear((key) => key.startsWith(DEVELOPER_KEY_PREFIX));
      reloadPage();
    }
  };
}
