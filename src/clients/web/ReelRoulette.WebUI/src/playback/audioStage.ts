import { batch, computed, signal, type ReadonlySignal } from "@preact/signals";
import type { Dialogs } from "../dialogs/dialogs";
import { errorType } from "../logging/relayLogLines";
import type { DeviceStore } from "../state/deviceStore";
import { compressionGainDb, COMPRESSOR_OFF, type CompressorSetting } from "./compression";
import { dbToGain } from "./loudnessNormalization";

/** The per-device store's keys for the volume, whether sound is muted, Enhanced audio, and the volume step. */
export const VOLUME_KEY = "player.volume";
export const MUTED_KEY = "player.muted";
export const ENHANCED_AUDIO_KEY = "audio.enhanced";
export const VOLUME_STEP_KEY = "audio.volumeStep";

/** The volume a device starts at, in percent: full, as the video plays without the app. */
export const DEFAULT_VOLUME = 100;

/** The volume steps the Settings tab offers, in percent, and the one a device starts with. */
export const VOLUME_STEPS = [1, 2, 5, 10] as const;
export type VolumeStep = (typeof VOLUME_STEPS)[number];
export const DEFAULT_VOLUME_STEP: VolumeStep = 5;

/** The volume indicator fades out this long after the volume stops changing. */
export const VOLUME_INDICATOR_MS = 800;

/** Each change of the gain glides to its level with this time constant, settling within a few tens of milliseconds. */
export const GAIN_GLIDE_SECONDS = 0.015;

/** Pause fades the sound out first, and pauses the video this long after, once it is silent. */
export const FADE_OUT_MS = 60;

/**
 * The limiter after the normalization gain and compression, which holds the peaks a boost or compression's makeup gain
 * pushes past the ceiling: a compressor with its fastest attack, no knee, and a ratio of 20, at the ceiling.
 */
export const LIMITER_THRESHOLD_DB = -1;
export const LIMITER_RATIO = 20;
export const LIMITER_KNEE_DB = 0;
export const LIMITER_ATTACK_SECONDS = 0;

/**
 * The compressor lifts its whole output by a makeup gain, which Web Audio works out from its curve as the inverse of
 * the curve's gain at full scale, to the power 0.6: here 0.57 dB, which a gain after the limiter takes back, so sound
 * under the threshold passes as it is.
 */
export const LIMITER_MAKEUP_DB = -0.6 * LIMITER_THRESHOLD_DB * (1 - 1 / LIMITER_RATIO);

/**
 * Compression glides on and off, and to new values, with this time constant, settling within about half a second. It is
 * slower than the gains' since the compressor may change its makeup gain in steps, once per block of samples, which a
 * slow glide keeps small.
 */
export const COMPRESSION_GLIDE_SECONDS = 0.15;

export const GAIN_STAGE_FAILED_NOTICE = "Audio processing couldn't start on this device. Turn off Enhanced audio to play sound directly.";
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

export interface CompressorParam {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}

/** A `DynamicsCompressorNode`, the limiter's and compression's. */
export interface CompressorNode {
  readonly threshold: CompressorParam;
  readonly knee: CompressorParam;
  readonly ratio: CompressorParam;
  readonly attack: CompressorParam;
  readonly release: CompressorParam;
  connect(destination: unknown): unknown;
}

export interface GainStageContext {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createMediaElementSource(element: AudioVideoElement): { connect(destination: unknown): unknown };
  createGain(): GainStageNode;
  createDynamicsCompressor(): CompressorNode;
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
  /** Loudness normalization's gain for the playing video, in dB, 0 while it is off or has no adjustment. */
  normalizationGainDb: ReadonlySignal<number>;
  /** Whether compression is on, and its compressor's values. */
  compressor: ReadonlySignal<CompressorSetting>;
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
 * The stage's chain runs from the video through loudness normalization's gain, then compression's compressor and the
 * gain after it, which takes back Web Audio's makeup gain and applies compression's own, then the limiter, which holds
 * the peaks a boost or compression's makeup gain pushes past the ceiling, and the gain that takes back the limiter's
 * makeup, to the volume's gain. Compression and the limiter stay in the chain: off, the compressor applies no
 * compression and the gain after it none, and with normalization off the limiter touches only peaks above its
 * threshold, while changing the chain's connections as it plays could click.
 *
 * The gain never jumps, since a jump in level is a click: each change of the volume or of normalization's gain glides to
 * its level, play fades in from silence, and pause fades out and pauses the video once it is silent. A video starts at
 * its own normalization gain, set while it is silent. Compression glides on and off, and to new values.
 *
 * The muted-volume rules hold for the slider and every gesture. Mute moves the slider to 0 and remembers the volume,
 * which unmuting restores. Raising the volume while muted unmutes and starts from 0, so the remembered volume isn't
 * restored, and lowering it while muted changes nothing. Lowering it to 0 while not muted mutes, and unmuting then
 * restores the volume from before the change that reached 0: a slider drag or a two-finger drag is one change, from
 * `beginVolumeChange` to `endVolumeChange`, and each wheel notch and key step on the focused slider is a change of its
 * own. A drag that starts muted and comes back to 0 so leaves the remembered volume as it was.
 */
export interface AudioStage {
  /** Enhanced audio, on by default. */
  readonly enhanced: ReadonlySignal<boolean>;
  /** The volume sound plays at when not muted, which Mute remembers: a whole percent from 1 to 100, since 0 is muted. */
  readonly volume: ReadonlySignal<number>;
  /**
   * Sound is muted, which the mute button shows lit with the muted icon. Mute works before anything plays and on a
   * photo too, applying to the next video.
   */
  readonly muted: ReadonlySignal<boolean>;
  /** The volume the slider shows: the volume, or 0 while muted, which the volume indicator shows as Muted. */
  readonly shownVolume: ReadonlySignal<number>;
  /** The volume step of the scroll wheel, a two-finger drag, and the [ and ] keys, in percent. */
  readonly volumeStep: ReadonlySignal<VolumeStep>;
  /** The volume indicator shows, from a step or M until it fades out, `VOLUME_INDICATOR_MS` after the last. */
  readonly indicatorShown: ReadonlySignal<boolean>;
  /**
   * The volume slider shows. It hides only while Enhanced audio is off on a device whose element volume is read-only,
   * as on iOS, so it shows there from the start, and a volume set before the gain stage runs applies once it starts.
   */
  readonly volumeShown: ReadonlySignal<boolean>;
  /** The gain stage runs. */
  readonly running: ReadonlySignal<boolean>;

  /** Off, the sound plays directly; on, the gain stage starts at once, since the setting's own click is a tap. */
  setEnhanced(on: boolean): void;
  setVolumeStep(step: VolumeStep): void;
  /** Starts a slider drag's or a two-finger drag's change, keeping the volume from before it. */
  beginVolumeChange(): void;
  endVolumeChange(): void;
  /** Moves the volume to `percent`, as the slider does, within the change under way or as a change of its own. */
  setVolume(percent: number): void;
  /**
   * Moves the volume by whole volume steps, as the scroll wheel, a two-finger drag, and [ and ] do, within the change
   * under way or as a change of its own, and shows the volume indicator, a step down while muted too.
   */
  stepVolume(steps: number): void;
  /**
   * Turns Mute on or off, as the Mute button does. M (`byKey`) also shows the volume indicator, Muted or the volume
   * unmuting restores, which the button doesn't, as the slider doesn't.
   */
  toggleMute(options?: { byKey?: boolean }): void;
  /** Hides the volume indicator at once, as when the rating's stars open where it shows. */
  hideIndicator(): void;
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
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

function isVolumeStep(value: unknown): value is VolumeStep {
  return VOLUME_STEPS.includes(value as VolumeStep);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function createAudioStage(options: AudioStageOptions): AudioStage {
  const { device, dialogs, relay, renewVideo, normalizationGainDb, compressor } = options;
  const createContext = options.createContext ?? browserAudioContext;
  const volumeReadOnly = options.volumeReadOnly ?? elementVolumeReadOnly();

  const enhanced = signal(device.read(ENHANCED_AUDIO_KEY, true, isBoolean));
  const volume = signal(device.read(VOLUME_KEY, DEFAULT_VOLUME, isVolume));
  const muted = signal(device.read(MUTED_KEY, false, isBoolean));
  const shownVolume = computed(() => (muted.value ? 0 : volume.value));
  const volumeStep = signal(device.read(VOLUME_STEP_KEY, DEFAULT_VOLUME_STEP, isVolumeStep));
  const indicatorShown = signal(false);
  const running = signal(false);
  const volumeShown = computed(() => enhanced.value || !volumeReadOnly);

  let video: AudioVideoElement | null = null;
  let activation: ActivationTarget | null = null;
  let context: GainStageContext | null = null;
  /** The volume's gain, last in the chain. */
  let gain: GainStageNode | null = null;
  /** Loudness normalization's gain, first in the chain. */
  let normalization: GainStageNode | null = null;
  /** Compression's compressor, after normalization's gain, and the gain after it. */
  let compression: CompressorNode | null = null;
  let compressionGain: GainStageNode | null = null;
  /**
   * The element the gain stage took, which plays through it, or nowhere once the stage is closed, until a new one takes
   * over.
   */
  let routed: AudioVideoElement | null = null;
  /** The gain stage couldn't start; it isn't tried again until Enhanced audio is turned off and on. */
  let failed = false;
  let fadeOut: ReturnType<typeof setTimeout> | null = null;
  /** The volume from before the slider's or a two-finger drag's change under way. */
  let volumeBeforeChange: number | null = null;
  let indicatorFade: ReturnType<typeof setTimeout> | null = null;

  function level(): number {
    return muted.peek() ? 0 : volume.peek() / 100;
  }

  function glide(target: number): void {
    if (gain && context) {
      gain.gain.setTargetAtTime(target, context.currentTime, GAIN_GLIDE_SECONDS);
    }
  }

  /** Normalization's gain for the playing video, as a gain node takes it. */
  function normalizationLevel(): number {
    return dbToGain(normalizationGainDb.peek());
  }

  /**
   * Compression's compressor as it is now, and the gain after it, in dB: its values while compression is on, and no
   * compression and no gain while it is off.
   */
  function compressionSettings() {
    const { on, values } = compressor.peek();
    return on ? { ...values, gainDb: compressionGainDb(values) } : { ...values, ...COMPRESSOR_OFF, gainDb: 0 };
  }

  /**
   * Compression's compressor and the gain after it glide to their settings, so turning it on or off, or a new value,
   * reaches the sound at once without a click. The gain can't follow Web Audio's makeup exactly while the compressor's
   * settings move, so the level may swell briefly as it glides.
   */
  function glideCompression(): void {
    if (!compression || !compressionGain || !context) return;
    const settings = compressionSettings();
    const now = context.currentTime;
    compression.threshold.setTargetAtTime(settings.thresholdDb, now, COMPRESSION_GLIDE_SECONDS);
    compression.knee.setTargetAtTime(settings.kneeDb, now, COMPRESSION_GLIDE_SECONDS);
    compression.ratio.setTargetAtTime(settings.ratio, now, COMPRESSION_GLIDE_SECONDS);
    compression.attack.setTargetAtTime(settings.attackSeconds, now, COMPRESSION_GLIDE_SECONDS);
    compression.release.setTargetAtTime(settings.releaseSeconds, now, COMPRESSION_GLIDE_SECONDS);
    compressionGain.gain.setTargetAtTime(dbToGain(settings.gainDb), now, COMPRESSION_GLIDE_SECONDS);
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

  /** Keeps the volume and Mute, and the sound follows them. */
  function keep(nextVolume: number, nextMuted: boolean): void {
    if (nextVolume === volume.peek() && nextMuted === muted.peek()) return;
    batch(() => {
      if (nextVolume !== volume.peek()) {
        volume.value = nextVolume;
        device.write(VOLUME_KEY, nextVolume);
      }
      if (nextMuted !== muted.peek()) {
        muted.value = nextMuted;
        device.write(MUTED_KEY, nextMuted);
      }
    });
    follow();
  }

  /** Moves the volume the slider shows to `target`, by the muted-volume rules. */
  function moveVolume(target: number): void {
    if (!Number.isFinite(target)) return;
    const next = Math.round(Math.min(100, target));
    if (next > 0) {
      keep(next, false);
    } else if (!muted.peek()) {
      keep(volumeBeforeChange ?? volume.peek(), true);
    }
  }

  function hideIndicator(): void {
    if (indicatorFade !== null) clearTimeout(indicatorFade);
    indicatorFade = null;
    indicatorShown.value = false;
  }

  function showIndicator(): void {
    indicatorShown.value = true;
    if (indicatorFade !== null) clearTimeout(indicatorFade);
    indicatorFade = setTimeout(() => {
      indicatorFade = null;
      indicatorShown.value = false;
    }, VOLUME_INDICATOR_MS);
  }

  function endVolumeChange(): void {
    volumeBeforeChange = null;
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
    normalization = null;
    compression = null;
    compressionGain = null;
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
      normalization = created.createGain();
      normalization.gain.setValueAtTime(normalizationLevel(), created.currentTime);
      compression = created.createDynamicsCompressor();
      const settings = compressionSettings();
      compression.threshold.value = settings.thresholdDb;
      compression.knee.value = settings.kneeDb;
      compression.ratio.value = settings.ratio;
      compression.attack.value = settings.attackSeconds;
      compression.release.value = settings.releaseSeconds;
      compressionGain = created.createGain();
      compressionGain.gain.setValueAtTime(dbToGain(settings.gainDb), created.currentTime);
      const limiter = created.createDynamicsCompressor();
      limiter.threshold.value = LIMITER_THRESHOLD_DB;
      limiter.knee.value = LIMITER_KNEE_DB;
      limiter.ratio.value = LIMITER_RATIO;
      limiter.attack.value = LIMITER_ATTACK_SECONDS;
      const makeup = created.createGain();
      makeup.gain.setValueAtTime(dbToGain(-LIMITER_MAKEUP_DB), created.currentTime);
      gain = created.createGain();
      gain.gain.setValueAtTime(0, created.currentTime);
      source.connect(normalization);
      normalization.connect(compression);
      compression.connect(compressionGain);
      compressionGain.connect(limiter);
      limiter.connect(makeup);
      makeup.connect(gain);
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

  /**
   * Play starts from silence, so the video's normalization gain is set without a glide; the sound fades in once the
   * video plays.
   */
  function videoPlay(): void {
    if (gain && normalization && context) {
      gain.gain.setValueAtTime(0, context.currentTime);
      normalization.gain.setValueAtTime(normalizationLevel(), context.currentTime);
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

  // A change of a normalization setting, its target, or the video reaches the sound at once, gliding to it.
  normalizationGainDb.subscribe(() => {
    if (normalization && context) {
      normalization.gain.setTargetAtTime(normalizationLevel(), context.currentTime, GAIN_GLIDE_SECONDS);
    }
  });
  // Turning compression on or off, or a change of its strength or values, reaches the sound at once, gliding to it.
  compressor.subscribe(() => glideCompression());

  return {
    enhanced,
    volume,
    muted,
    shownVolume,
    volumeStep,
    indicatorShown,
    volumeShown,
    running,
    setEnhanced,

    setVolumeStep(step) {
      if (!isVolumeStep(step) || step === volumeStep.peek()) return;
      volumeStep.value = step;
      device.write(VOLUME_STEP_KEY, step);
    },

    beginVolumeChange() {
      volumeBeforeChange = volume.peek();
    },

    endVolumeChange,

    setVolume: moveVolume,

    stepVolume(steps) {
      moveVolume(shownVolume.peek() + steps * volumeStep.peek());
      showIndicator();
    },

    toggleMute(options) {
      endVolumeChange();
      keep(volume.peek(), !muted.peek());
      if (options?.byKey) showIndicator();
    },

    hideIndicator,

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
      hideIndicator();
      endVolumeChange();
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
