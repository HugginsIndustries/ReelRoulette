import { computed, effect, signal, untracked, type ReadonlySignal } from "@preact/signals";
import { isBoolean, type DeviceStore } from "../state/deviceStore";

/**
 * When the player's controls hide: after a time with no activity, on a click or tap on the player, or never.
 */
export type HideControlsMode = "timeout" | "click" | "never";

export const HIDE_CONTROLS_MODES: readonly HideControlsMode[] = ["timeout", "click", "never"];

/** The mode a device starts with, until its Settings tab changes it. */
export const DEFAULT_HIDE_CONTROLS_MODE: HideControlsMode = "timeout";

/** Hide after takes a whole number of seconds in this range. */
export const HIDE_AFTER_RANGE = { min: 1, max: 30 } as const;

export const DEFAULT_HIDE_AFTER_SECONDS = 3;

/** The per-device store's keys for Hide player controls and its two settings. */
export const HIDE_CONTROLS_KEY = "playerControls.hide";
export const HIDE_AFTER_KEY = "playerControls.hideAfter";
export const KEEP_WHILE_PAUSED_KEY = "playerControls.keepWhilePaused";

export function isHideControlsMode(value: unknown): value is HideControlsMode {
  return (HIDE_CONTROLS_MODES as readonly unknown[]).includes(value);
}

function isHideAfter(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= HIDE_AFTER_RANGE.min && (value as number) <= HIDE_AFTER_RANGE.max;
}

/**
 * A field that takes the keys pressed in it, as a text field, a slider, a dropdown, or editable text does, so a key
 * there isn't activity. Checkboxes, radio buttons, and buttons don't.
 */
export function isTextField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  if (element.isContentEditable || element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  return element.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((element as HTMLInputElement).type);
}

/**
 * What keeps the controls shown under Timeout, besides a pause, the bell's list, and the rating's stars: a mouse or pen
 * pointer over a control, a drag of the scrub bar or the volume, and keyboard focus on a control.
 */
export type ControlsHold = "pointer" | "drag" | "keyboardFocus";

export interface PlayerControlsOptions {
  device: DeviceStore;
  /** Playback waits for the user, which keeps the controls shown while Keep visible while paused is on. */
  paused: ReadonlySignal<boolean>;
  /** The list behind the bell or the rating's stars are open, which keeps the controls shown in every mode. */
  openFromControls: ReadonlySignal<boolean>;
}

/**
 * Whether the player's controls show, as Hide player controls sets, kept per device with its settings.
 *
 * Timeout, the default: they hide after Hide after with no activity. Moving the mouse over the player, tapping or
 * clicking it, a press on the controls, a key press, the scroll wheel, and a two-finger drag show them and restart the
 * countdown. They stay while a hold lasts, while the bell's list or the rating's stars are open, and, with Keep visible
 * while paused, while playback is paused, which also shows them; as each of those ends, the countdown starts again. On
 * click/tap: a click or tap on the player shows or hides them. Never: they stay. A new mode starts with them shown.
 */
export interface PlayerControls {
  readonly mode: ReadonlySignal<HideControlsMode>;
  setMode(mode: HideControlsMode): void;
  readonly hideAfterSeconds: ReadonlySignal<number>;
  /** Sets Hide after and keeps it on this device. Anything but a whole number from 1 to 30 seconds is ignored. */
  setHideAfter(seconds: number): void;
  readonly keepWhilePaused: ReadonlySignal<boolean>;
  setKeepWhilePaused(on: boolean): void;
  /** The controls show. */
  readonly shown: ReadonlySignal<boolean>;
  /**
   * Moving the mouse over the player, a press on the controls, or a key press: under Timeout, shows the controls and
   * restarts the countdown.
   */
  activity(): void;
  /**
   * A click on the player, or the click that follows a tap: shows or hides the controls under On click/tap, and is
   * activity under Timeout.
   */
  tap(): void;
  /**
   * The scroll wheel or a two-finger drag, so the volume slider shows while it changes: shows the controls in every
   * mode, and restarts the countdown under Timeout.
   */
  show(): void;
  /** Starts or ends a hold. Ending one is activity, so the countdown starts again from there. */
  hold(reason: ControlsHold, held: boolean): void;
}

export function createPlayerControls(options: PlayerControlsOptions): PlayerControls {
  const { device, paused, openFromControls } = options;
  const mode = signal(device.read(HIDE_CONTROLS_KEY, DEFAULT_HIDE_CONTROLS_MODE, isHideControlsMode));
  const hideAfterSeconds = signal(device.read(HIDE_AFTER_KEY, DEFAULT_HIDE_AFTER_SECONDS, isHideAfter));
  const keepWhilePaused = signal(device.read(KEEP_WHILE_PAUSED_KEY, true, isBoolean));
  const visible = signal(true);
  const holds = new Set<ControlsHold>();
  let countdown: ReturnType<typeof setTimeout> | null = null;

  function timeout(): boolean {
    return mode.peek() === "timeout";
  }

  function held(): boolean {
    return holds.size > 0 || openFromControls.peek() || (keepWhilePaused.peek() && paused.peek());
  }

  /** A hold that lasts when the countdown ends keeps the controls shown, and the countdown starts again as it ends. */
  function restartCountdown(): void {
    if (countdown !== null) clearTimeout(countdown);
    countdown = null;
    if (!timeout()) return;
    countdown = setTimeout(() => {
      countdown = null;
      if (!held()) visible.value = false;
    }, hideAfterSeconds.peek() * 1000);
  }

  function activity(): void {
    if (!timeout()) return;
    visible.value = true;
    restartCountdown();
  }

  /** A pause shows the controls while Keep visible while paused is on, and playing on restarts the countdown. */
  function followPlayback(): void {
    if (!timeout()) return;
    if (keepWhilePaused.peek() && paused.peek()) visible.value = true;
    restartCountdown();
  }

  effect(() => {
    paused.value;
    untracked(followPlayback);
  });

  // The controls stay while the list or the stars are open, so their countdown starts again when they close, however
  // they close.
  let wasOpen = openFromControls.peek();
  effect(() => {
    const open = openFromControls.value;
    if (wasOpen && !open) untracked(activity);
    wasOpen = open;
  });

  return {
    mode,
    setMode(next) {
      mode.value = next;
      device.write(HIDE_CONTROLS_KEY, next);
      visible.value = true;
      restartCountdown();
    },
    hideAfterSeconds,
    setHideAfter(seconds) {
      if (!isHideAfter(seconds)) return;
      hideAfterSeconds.value = seconds;
      device.write(HIDE_AFTER_KEY, seconds);
      restartCountdown();
    },
    keepWhilePaused,
    setKeepWhilePaused(on) {
      keepWhilePaused.value = on;
      device.write(KEEP_WHILE_PAUSED_KEY, on);
      followPlayback();
    },
    shown: computed(() => visible.value || openFromControls.value),
    activity,
    tap() {
      if (mode.peek() === "click") {
        visible.value = !visible.peek();
      } else {
        activity();
      }
    },
    show() {
      if (timeout()) {
        activity();
      } else {
        visible.value = true;
      }
    },
    hold(reason, on) {
      if (on) {
        holds.add(reason);
      } else if (holds.delete(reason)) {
        activity();
      }
    }
  };
}
