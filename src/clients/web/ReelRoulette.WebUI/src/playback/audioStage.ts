import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type { Dialogs } from "../dialogs/dialogs";
import type { DeviceStore } from "../state/deviceStore";

/** The per-device store's keys for the volume, whether sound is muted, and Enhanced audio. */
export const VOLUME_KEY = "player.volume";
export const MUTED_KEY = "player.muted";
export const ENHANCED_AUDIO_KEY = "audio.enhanced";

/** The volume a device starts at, in percent: full, as the video plays without the app. */
export const DEFAULT_VOLUME = 100;

/** Each change of the gain glides to its level with this time constant, settling within a few tens of milliseconds. */
export const GAIN_GLIDE_SECONDS = 0.015;

/** Pause fades the sound out first, and pauses the video this long after, once it is silent. */
export const FADE_OUT_MS = 60;

export const GAIN_STAGE_FAILED_NOTICE =
  "Audio processing couldn't start on this device. Turn off Enhanced audio to play sound directly, without in-app volume on iPhone and iPad.";
export const TURN_OFF_ENHANCED_AUDIO = "Turn off Enhanced audio";

/** The parts of the `<video>` element the audio stage drives. */
export interface AudioVideoElement {
  volume: number;
  muted: boolean;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "play" | "playing", listener: () => void): void;
  removeEventListener(type: "play" | "playing", listener: () => void): void;
}

/** What playing and pausing the video, with its sound fading in and out, needs of it. */
export type PlayableElement = Pick<AudioVideoElement, "paused" | "play" | "pause">;

/** The parts of Web Audio the gain stage uses. */
export interface GainParam {
  setValueAtTime(value: number, startTime: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}

export interface GainStageNode {
  readonly gain: GainParam;
  connect(destination: unknown): unknown;
}

export interface GainStageContext {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createMediaElementSource(element: AudioVideoElement): { connect(destination: GainStageNode): unknown };
  createGain(): GainStageNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** Where the page's taps and keys are heard. */
export type ActivationTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export interface AudioStageOptions {
  device: DeviceStore;
  /** The in-app notice, for a gain stage that can't start. */
  dialogs: Pick<Dialogs, "noticeWithAction">;
  /** Relays a line to `last.log`. */
  relay(level: string, message: string): void;
  /**
   * The video in use has been through the gain stage, which an element never leaves, and Enhanced audio is now off,
   * so a new element takes over the video.
   */
  renewVideo(): void;
  /** The media element's volume can't be set from script, as on iOS. Defaults to `elementVolumeReadOnly()`. */
  volumeReadOnly?: boolean;
  /** Builds the gain stage's audio context, or throws where there is none. Defaults to the browser's `AudioContext`. */
  createContext?: () => GainStageContext;
  /** Defaults to the page's document. */
  activation?: ActivationTarget;
}

/**
 * The player's sound: the volume, Mute, and Enhanced audio, each kept on this device. With Enhanced audio, on by
 * default, the video's audio plays through a Web Audio gain stage on every device, which sets its level relative to the
 * system volume, so iPhone and iPad, where a media element's own volume is read-only, get an in-app volume too. The
 * stage starts on the first tap or key, as Web Audio needs one. Off, or until the stage runs, the sound plays directly
 * at the element's own volume and mute.
 *
 * The gain never jumps, since a jump in level is a click: each change glides to its level, play fades in from silence,
 * and pause fades out and pauses the video once it is silent.
 */
export interface AudioStage {
  /** Enhanced audio, on by default. */
  readonly enhanced: ReadonlySignal<boolean>;
  /** The volume, a whole percent from 0 to 100. */
  readonly volume: ReadonlySignal<number>;
  /**
   * Sound is muted, which the mute button shows lit with the muted icon. Mute works before anything plays and on a
   * photo too, applying to the next video.
   */
  readonly muted: ReadonlySignal<boolean>;
  /**
   * The volume slider shows. It hides only while Enhanced audio is off on a device whose element volume is read-only,
   * as on iOS, so it shows there from the start, and a volume set before the gain stage runs applies once it starts.
   */
  readonly volumeShown: ReadonlySignal<boolean>;
  /** The gain stage runs. */
  readonly running: ReadonlySignal<boolean>;

  /** Off, the sound plays directly; on, the gain stage starts at once, since the setting's own click is a tap. */
  setEnhanced(on: boolean): void;
  setVolume(percent: number): void;
  toggleMute(): void;
  /**
   * Takes the video whose sound it plays, applying the volume and mute to it, and listens for the page's first tap or
   * key. A new element, once one takes over the video, is attached in its place.
   */
  attach(video: AudioVideoElement): void;
  /** Lets go of the video and the page's taps and keys, and closes the gain stage. */
  detach(): void;
  /** Plays the video. One whose pause is still fading out plays on, with its sound gliding back. */
  play(video: PlayableElement): Promise<void>;
  /**
   * Fades the sound out and pauses the video once it is silent, or pauses it at once while the gain stage isn't
   * running.
   */
  pause(video: PlayableElement): void;
  /** A pause is fading out, so the video, though still playing, counts as paused. */
  pausing(): boolean;
  /** Drops a pause that is fading out, for a video that stops at once, as a new item does. */
  cancelPause(): void;
}

/** A media element's volume can't be set from script, as on iOS, where it always reads 1. */
export function elementVolumeReadOnly(): boolean {
  try {
    const probe = document.createElement("audio");
    probe.volume = 0.5;
    return probe.volume !== 0.5;
  } catch {
    return false;
  }
}

function browserAudioContext(): GainStageContext {
  // Older Safari names it with WebKit's prefix.
  const legacy = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const Context = window.AudioContext ?? legacy;
  if (!Context) {
    throw new Error("Web Audio is unavailable");
  }
  return new Context() as unknown as GainStageContext;
}

function isVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** The error's type only, as the log names a screen's failure. */
function errorType(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : typeof error;
}

export function createAudioStage(options: AudioStageOptions): AudioStage {
  const { device, dialogs, relay, renewVideo } = options;
  const createContext = options.createContext ?? browserAudioContext;
  const volumeReadOnly = options.volumeReadOnly ?? elementVolumeReadOnly();

  const enhanced = signal(device.read(ENHANCED_AUDIO_KEY, true, isBoolean));
  const volume = signal(device.read(VOLUME_KEY, DEFAULT_VOLUME, isVolume));
  const muted = signal(device.read(MUTED_KEY, false, isBoolean));
  const running = signal(false);
  const volumeShown = computed(() => enhanced.value || !volumeReadOnly);

  let video: AudioVideoElement | null = null;
  let activation: ActivationTarget | null = null;
  let context: GainStageContext | null = null;
  let gain: GainStageNode | null = null;
  /**
   * The element the gain stage took, which plays through it, or nowhere once the stage is closed, until a new one takes
   * over.
   */
  let routed: AudioVideoElement | null = null;
  /** The gain stage couldn't start; it isn't tried again until Enhanced audio is turned off and on. */
  let failed = false;
  let fadeOut: ReturnType<typeof setTimeout> | null = null;

  function level(): number {
    return muted.peek() ? 0 : volume.peek() / 100;
  }

  function glide(target: number): void {
    if (gain && context) {
      gain.gain.setTargetAtTime(target, context.currentTime, GAIN_GLIDE_SECONDS);
    }
  }

  /** The video's sound can be heard: it plays, and no pause is fading it out. */
  function audible(): boolean {
    return !!video && !video.paused && fadeOut === null;
  }

  /**
   * Through the gain stage, the element plays at its full volume, unmuted, and the gain sets the level. Directly, the
   * element's own volume, where it can change, and its mute do.
   */
  function applyToElement(): void {
    if (!video) return;
    const throughStage = video === routed;
    video.muted = throughStage ? false : muted.peek();
    if (!volumeReadOnly) {
      video.volume = throughStage ? 1 : volume.peek() / 100;
    }
  }

  /** The volume or Mute changed: the element takes it, and the gain glides to it while the sound can be heard. */
  function follow(): void {
    applyToElement();
    if (running.peek() && audible()) {
      glide(level());
    }
  }

  function clearFadeOut(): void {
    if (fadeOut !== null) {
      clearTimeout(fadeOut);
      fadeOut = null;
    }
  }

  function closeContext(): void {
    clearFadeOut();
    const closing = context;
    context = null;
    gain = null;
    running.value = false;
    if (closing) {
      void closing.close().catch(() => {});
    }
  }

  /** No silent fallback: a gain stage that can't start says so, once, and offers to play the sound directly. */
  function gainStageFailed(error: unknown): void {
    if (failed) return;
    failed = true;
    closeContext();
    relay("warn", `audio=gain-stage-failed error=${errorType(error)}`);
    void dialogs.noticeWithAction(GAIN_STAGE_FAILED_NOTICE, TURN_OFF_ENHANCED_AUDIO).then((turnOff) => {
      if (turnOff) {
        setEnhanced(false);
      }
    });
  }

  /**
   * Starts the gain stage on a tap or key, which Web Audio needs, or resumes one the browser suspended. It starts
   * silent, and the sound fades in once the stage runs.
   */
  function start(): void {
    if (!enhanced.peek() || failed || !video) return;
    if (context) {
      if (context.state !== "running") {
        void context.resume().catch(() => {});
      }
      return;
    }
    let created: GainStageContext;
    try {
      created = createContext();
      context = created;
      const source = created.createMediaElementSource(video);
      routed = video;
      gain = created.createGain();
      gain.gain.setValueAtTime(0, created.currentTime);
      source.connect(gain);
      gain.connect(created.destination);
    } catch (error) {
      gainStageFailed(error);
      return;
    }
    applyToElement();
    created.resume().then(
      () => {
        if (context !== created) return;
        if (created.state !== "running") {
          gainStageFailed(new Error(`Audio context is ${created.state}`));
          return;
        }
        running.value = true;
        relay("info", "audio=gain-stage-started");
        if (audible()) {
          glide(level());
        }
      },
      (error: unknown) => {
        if (context === created) {
          gainStageFailed(error);
        }
      }
    );
  }

  /** Play starts from silence; the sound fades in once the video plays. */
  function videoPlay(): void {
    if (gain && context) {
      gain.gain.setValueAtTime(0, context.currentTime);
    }
  }

  function videoPlaying(): void {
    if (running.peek() && audible()) {
      glide(level());
    }
  }

  function listen(target: ActivationTarget | null, on: boolean): void {
    if (!target) return;
    const method = on ? "addEventListener" : "removeEventListener";
    // A touch's pointerdown carries no user activation in Firefox on Android or Safari on iOS, and its pointerup does.
    // A mouse's pointerup comes while its pointerdown's activation still holds.
    target[method]("pointerup", start, true);
    target[method]("keydown", start, true);
  }

  function setEnhanced(on: boolean): void {
    if (enhanced.peek() === on) return;
    enhanced.value = on;
    device.write(ENHANCED_AUDIO_KEY, on);
    failed = false;
    if (on) {
      start();
      return;
    }
    closeContext();
    if (routed) {
      // The element stays routed to the closed stage, so it is silent until a new one takes over the video.
      routed = null;
      renewVideo();
    }
    applyToElement();
  }

  return {
    enhanced,
    volume,
    muted,
    volumeShown,
    running,
    setEnhanced,

    setVolume(percent) {
      const next = Math.round(Math.min(100, Math.max(0, percent)));
      if (!Number.isFinite(next) || next === volume.peek()) return;
      volume.value = next;
      device.write(VOLUME_KEY, next);
      follow();
    },

    toggleMute() {
      muted.value = !muted.peek();
      device.write(MUTED_KEY, muted.peek());
      follow();
    },

    attach(next) {
      if (video !== next) {
        video?.removeEventListener("play", videoPlay);
        video?.removeEventListener("playing", videoPlaying);
        video = next;
        next.addEventListener("play", videoPlay);
        next.addEventListener("playing", videoPlaying);
      }
      if (!activation) {
        activation = options.activation ?? document;
        listen(activation, true);
      }
      applyToElement();
    },

    detach() {
      listen(activation, false);
      activation = null;
      video?.removeEventListener("play", videoPlay);
      video?.removeEventListener("playing", videoPlaying);
      video = null;
      closeContext();
    },

    play(target) {
      if (fadeOut !== null) {
        clearFadeOut();
        if (!target.paused) {
          if (running.peek()) {
            glide(level());
          }
          return Promise.resolve();
        }
      }
      return target.play();
    },

    pause(target) {
      clearFadeOut();
      if (!running.peek() || target.paused) {
        target.pause();
        return;
      }
      glide(0);
      fadeOut = setTimeout(() => {
        fadeOut = null;
        target.pause();
      }, FADE_OUT_MS);
    },

    pausing: () => fadeOut !== null,
    cancelPause: clearFadeOut
  };
}
