import { computed, effect, untracked, type ReadonlySignal } from "@preact/signals";
import type { DeviceStore } from "../state/deviceStore";
import type { FrameScheduler } from "./player";

/** The per-device store's key for whether ambient mode is on. */
export const AMBIENT_KEY = "appearance.ambient";

/** The per-device store's key for ambient mode's settings, kept together. */
export const AMBIENT_TUNING_KEY = "appearance.ambientSettings";

/** Ambient mode's settings, which the Settings tab's Ambient mode settings change. */
export interface AmbientTuning {
  /** How many times a second the glow takes a new copy of the picture. */
  rate: number;
  /** The seconds the glow takes to fade to a new copy. */
  fade: number;
  /** The blur, in pixels. */
  blur: number;
  /** The glow's brightness in the dark theme, in percent. */
  dark: number;
  /** The glow's brightness in the light theme, in percent. */
  light: number;
  /** In percent. */
  saturation: number;
}

export type AmbientSetting = keyof AmbientTuning;

/** The settings in the order the Settings tab shows them. */
export const AMBIENT_SETTINGS: readonly AmbientSetting[] = ["rate", "fade", "blur", "dark", "light", "saturation"];

export const DEFAULT_AMBIENT_TUNING: Readonly<AmbientTuning> = { rate: 1, fade: 2, blur: 64, dark: 50, light: 75, saturation: 100 };

/** Each setting's range and step, as its slider offers them. */
export const AMBIENT_RANGES: Readonly<Record<AmbientSetting, { min: number; max: number; step: number }>> = {
  rate: { min: 0.25, max: 4, step: 0.25 },
  fade: { min: 0.25, max: 4, step: 0.25 },
  blur: { min: 10, max: 80, step: 1 },
  dark: { min: 0, max: 100, step: 1 },
  light: { min: 0, max: 100, step: 1 },
  saturation: { min: 0, max: 200, step: 5 }
};

/** A setting's value as the Settings tab shows it, such as "1 per second", "2 s", "64 px", or "50%". */
export function formatAmbientSetting(setting: AmbientSetting, value: number): string {
  switch (setting) {
    case "rate":
      return `${value} per second`;
    case "fade":
      return `${value} s`;
    case "blur":
      return `${value} px`;
    default:
      return `${value}%`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ambient mode's settings as this device keeps them, each one outside its range or not kept at its default. */
export function readAmbientTuning(device: DeviceStore): AmbientTuning {
  const saved = device.read<Record<string, unknown> | null>(AMBIENT_TUNING_KEY, null, isRecord) ?? {};
  const tuning = { ...DEFAULT_AMBIENT_TUNING };
  for (const setting of AMBIENT_SETTINGS) {
    const value = saved[setting];
    const { min, max } = AMBIENT_RANGES[setting];
    if (typeof value === "number" && value >= min && value <= max) {
      tuning[setting] = value;
    }
  }
  return tuning;
}

/** The drawing the effect does on a canvas: copying a picture onto it at an opacity, or clearing it. */
export interface AmbientContext {
  globalAlpha: number;
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: object, dx: number, dy: number, dw: number, dh: number): void;
}

export interface AmbientCanvas {
  width: number;
  height: number;
  /** Null where the browser draws nothing on a canvas. */
  getContext(contextId: "2d"): AmbientContext | null;
}

/**
 * The glow's elements: its layer, which the effect hides while the glow doesn't show and which carries the settings the
 * stylesheet's filter reads, the tiny canvas on screen, and the media it copies from.
 */
export interface AmbientElements {
  layer: { hidden: boolean; readonly style: { setProperty(name: string, value: string): void } };
  canvas: AmbientCanvas;
  video: { readonly paused: boolean; readonly readyState: number };
  photo: { readonly complete: boolean; readonly naturalWidth: number };
}

export interface AmbientOptions {
  /** Ambient mode is on. */
  enabled: ReadonlySignal<boolean>;
  tuning: ReadonlySignal<AmbientTuning>;
  /** The item playing, or null before anything plays. */
  current: ReadonlySignal<{ readonly mediaType: string } | null>;
  /** Counts play attempts, so a photo shown again is copied again. */
  attemptId: ReadonlySignal<number>;
  /** The media of the attempt playing now failed to load. */
  failed: ReadonlySignal<boolean>;
  /** Defaults to the browser's animation frames. */
  frames?: FrameScheduler;
  /** Milliseconds by a steady clock. Defaults to `performance.now()`. */
  now?: () => number;
  /** Whether the page's tab is hidden. Defaults to `document.hidden`. */
  tabHidden?: () => boolean;
  /** Makes the canvases the effect fades between. Defaults to new canvas elements. */
  createCanvas?: () => AmbientCanvas;
}

export interface Ambient {
  attach(elements: AmbientElements): void;
  /** Stops sampling and fading, and lets go of the elements. */
  detach(): void;
}

/** A video's `readyState` once it has a picture to copy. */
const HAVE_CURRENT_DATA = 2;

/**
 * Ambient mode: a heavily blurred, dimmed copy of the picture's colors fills the black space around it. At the update
 * rate a tiny copy of the picture becomes the target that the canvas on screen fades to over the fade time. The fade
 * starts from what is on screen, so a copy that arrives mid-fade carries on from there, and the canvas is never
 * cleared, so the black background never shows through. Sampling holds while the video is paused or the tab is hidden,
 * and a photo is copied once, and again when ambient mode turns back on. A video's copy waits until it has a picture,
 * and a photo's until it has loaded. The glow shows while ambient mode is on and an item plays, and hides once its
 * media fails. The effect only draws pictures onto canvases and never reads their pixels back, so a cross-origin
 * video, which taints the canvas, still shows.
 */
export function createAmbient(options: AmbientOptions): Ambient {
  const { enabled, tuning, current, attemptId, failed } = options;
  const frames: FrameScheduler = options.frames ?? {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id)
  };
  const now = options.now ?? (() => performance.now());
  const tabHidden = options.tabHidden ?? (() => document.hidden);
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
  const shows = computed(() => enabled.value && !!current.value && !failed.value);
  const rate = computed(() => tuning.value.rate);

  let elements: AmbientElements | null = null;
  /** What was on screen when the last copy arrived, and that copy, which the fade goes between. */
  let from: AmbientCanvas | null = null;
  let to: AmbientCanvas | null = null;
  /** The play attempt last copied, so a photo, or a paused video, is copied once. */
  let sampledAttempt: number | null = null;
  let fadeStart = 0;
  let fadeFrame: number | null = null;
  let tickId: ReturnType<typeof setTimeout> | null = null;
  let stopEffects: Array<() => void> = [];

  /** The element whose picture shows, once it has one. */
  function picture(): object | null {
    const item = current.peek();
    if (!item || !elements) return null;
    if (item.mediaType === "photo") {
      const { photo } = elements;
      return photo.complete && photo.naturalWidth > 0 ? photo : null;
    }
    return elements.video.readyState >= HAVE_CURRENT_DATA ? elements.video : null;
  }

  function blend(): void {
    fadeFrame = null;
    if (!elements || !from || !to) return;
    const progress = Math.min(1, (now() - fadeStart) / (tuning.peek().fade * 1000));
    const shown = elements.canvas.getContext("2d");
    if (shown) {
      const { width, height } = elements.canvas;
      shown.globalAlpha = 1;
      shown.drawImage(from, 0, 0, width, height);
      shown.globalAlpha = progress;
      shown.drawImage(to, 0, 0, width, height);
      shown.globalAlpha = 1;
    }
    if (progress < 1) {
      fadeFrame = frames.request(blend);
    }
  }

  function sample(source: object): void {
    if (!elements || !from || !to) return;
    const fromContext = from.getContext("2d");
    const toContext = to.getContext("2d");
    if (!fromContext || !toContext) return;
    const { width, height } = elements.canvas;
    fromContext.clearRect(0, 0, width, height);
    fromContext.drawImage(elements.canvas, 0, 0, width, height);
    toContext.clearRect(0, 0, width, height);
    toContext.drawImage(source, 0, 0, width, height);
    fadeStart = now();
    if (fadeFrame === null) {
      fadeFrame = frames.request(blend);
    }
  }

  function tick(): void {
    tickId = null;
    if (elements && shows.peek() && !tabHidden()) {
      const attempt = attemptId.peek();
      const source = picture();
      const playing = source === elements.video && !elements.video.paused;
      if (source && (sampledAttempt !== attempt || playing)) {
        sample(source);
        sampledAttempt = attempt;
      }
    }
    schedule();
  }

  /** Waits one update interval from now while ambient mode is on, so a new rate applies at once. */
  function schedule(): void {
    if (tickId !== null) {
      clearTimeout(tickId);
      tickId = null;
    }
    if (elements && enabled.peek()) {
      tickId = setTimeout(tick, 1000 / rate.peek());
    }
  }

  function stopFade(): void {
    if (fadeFrame !== null) {
      frames.cancel(fadeFrame);
      fadeFrame = null;
    }
  }

  return {
    attach(attached) {
      elements = attached;
      from = createCanvas();
      to = createCanvas();
      for (const canvas of [from, to]) {
        canvas.width = attached.canvas.width;
        canvas.height = attached.canvas.height;
      }
      stopEffects = [
        effect(() => {
          const { layer } = attached;
          const settings = tuning.value;
          layer.hidden = !shows.value;
          layer.style.setProperty("--ambient-blur", `${settings.blur}px`);
          layer.style.setProperty("--ambient-dark", String(settings.dark / 100));
          layer.style.setProperty("--ambient-light", String(settings.light / 100));
          layer.style.setProperty("--ambient-saturation", String(settings.saturation / 100));
        }),
        // Turning ambient mode off cuts a fade short, so turning it on copies the picture again, a photo's too.
        effect(() => {
          const on = enabled.value;
          untracked(() => {
            if (on) {
              sampledAttempt = null;
            } else {
              stopFade();
            }
          });
        }),
        effect(() => {
          enabled.value;
          rate.value;
          untracked(schedule);
        })
      ];
    },

    detach() {
      for (const stop of stopEffects) stop();
      stopEffects = [];
      if (tickId !== null) {
        clearTimeout(tickId);
        tickId = null;
      }
      stopFade();
      elements = null;
      from = null;
      to = null;
    }
  };
}
