import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { isBoolean, isRecord, type DeviceStore } from "../state/deviceStore";

/** The per-device store's keys for Loudness normalization and its settings. */
export const NORMALIZATION_KEY = "audio.normalization";
export const NORMALIZATION_SETTINGS_KEY = "audio.normalizationSettings";

/** The ceiling a boost keeps a video's true peak under, in dBTP. */
export const PEAK_CEILING_DBTP = -1;

/** How far past the ceiling Allow limiting lets a boost take a video's peak, for the limiter to catch, in dB. */
export const LIMITER_ALLOWANCE_DB = 6;

/**
 * How far short of a boost the headroom must fall to hold it back, in dB, so a boost that fits it exactly isn't flagged
 * for a subtraction's rounding error, as -18 - -32.7 is 14.700000000000003 against a headroom of 14.7.
 */
const HEADROOM_TOLERANCE_DB = 1e-9;

/** The targets Target loudness offers, Automatic, the library's baseline, by default. */
export const NORMALIZATION_TARGETS = ["automatic", "quieter", "standard", "louder", "manual"] as const;
export type NormalizationTarget = (typeof NORMALIZATION_TARGETS)[number];

/** The loudness of the targets that have one of their own, in LUFS. */
export const TARGET_LUFS = { quieter: -23, standard: -18, louder: -14 } as const;

/** Manual's target, in LUFS, and the boost limit, in whole dB. */
export const MANUAL_TARGET_RANGE = { min: -50, max: -10 } as const;
export const BOOST_LIMIT_RANGE = { min: 0, max: 24 } as const;

export interface NormalizationSettings {
  target: NormalizationTarget;
  /** Manual's target, in LUFS. */
  manualTarget: number;
  /** The most a quiet video is boosted by, in dB. */
  boostLimit: number;
  /** A boost may go past a video's headroom by the limiter allowance, for the limiter to catch. */
  allowLimiting: boolean;
}

export const DEFAULT_NORMALIZATION_SETTINGS: Readonly<NormalizationSettings> = {
  target: "automatic",
  manualTarget: -18,
  boostLimit: 15,
  allowLimiting: true
};

/** What normalization applies to a video, in dB, and whether its headroom held a boost back. */
export interface LoudnessAdjustment {
  db: number;
  limitedByPeak: boolean;
}

export interface GainRuleInput {
  /** The video's integrated loudness in LUFS, or null without loudness data. */
  loudness: number | null;
  /** The video's true peak in dBTP, or null when the scan hasn't measured one. */
  peak: number | null;
  targetLufs: number;
  boostLimit: number;
  allowLimiting: boolean;
}

/**
 * The gain rule. The adjustment needed is the target minus the video's loudness. A cut is applied in full, since turning
 * a video down can't clip it or raise its noise. A boost is held to the smallest of what is needed, the boost limit, and
 * the video's headroom: the ceiling minus its peak, plus the limiter allowance with Allow limiting on. A boost never goes
 * below 0 dB, so a quiet video whose peak leaves no headroom plays as it is rather than turned down, and a video without
 * a peak is only cut. The headroom holds a boost back only when the boost limit allows one. A video without loudness
 * data has no adjustment, null, and plays as it is.
 */
export function loudnessAdjustment(input: GainRuleInput): LoudnessAdjustment | null {
  const { loudness, peak, targetLufs, boostLimit, allowLimiting } = input;
  if (loudness === null) {
    return null;
  }
  const needed = targetLufs - loudness;
  if (needed <= 0) {
    return { db: needed, limitedByPeak: false };
  }
  if (peak === null) {
    return { db: 0, limitedByPeak: false };
  }
  const headroom = PEAK_CEILING_DBTP - peak + (allowLimiting ? LIMITER_ALLOWANCE_DB : 0);
  const limit = Math.min(needed, boostLimit);
  return { db: Math.max(0, Math.min(limit, headroom)), limitedByPeak: limit > 0 && headroom < limit - HEADROOM_TOLERANCE_DB };
}

/** The target's loudness in LUFS: Automatic's is the library's baseline, null until it loads. */
export function targetLufs(settings: NormalizationSettings, baseline: number | null): number | null {
  switch (settings.target) {
    case "automatic":
      return baseline;
    case "manual":
      return settings.manualTarget;
    default:
      return TARGET_LUFS[settings.target];
  }
}

/** Automatic's line under its name: the library's baseline, with its loudness once it has loaded. */
export function automaticLine(baseline: number | null): string {
  return baseline === null ? "The library's baseline." : `The library's baseline, ${baseline.toFixed(1)} LUFS.`;
}

/** A gain in dB as the linear factor a gain node takes. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max;
}

/** Normalization's settings as this device kept them, each one missing or outside its range read as its default. */
export function readNormalizationSettings(device: DeviceStore): NormalizationSettings {
  const saved = device.read<Record<string, unknown> | null>(NORMALIZATION_SETTINGS_KEY, null, isRecord) ?? {};
  const settings = { ...DEFAULT_NORMALIZATION_SETTINGS };
  if (NORMALIZATION_TARGETS.includes(saved.target as NormalizationTarget)) {
    settings.target = saved.target as NormalizationTarget;
  }
  if (inRange(saved.manualTarget, MANUAL_TARGET_RANGE)) {
    settings.manualTarget = saved.manualTarget;
  }
  if (inRange(saved.boostLimit, BOOST_LIMIT_RANGE) && Number.isInteger(saved.boostLimit)) {
    settings.boostLimit = saved.boostLimit;
  }
  if (typeof saved.allowLimiting === "boolean") {
    settings.allowLimiting = saved.allowLimiting;
  }
  return settings;
}

/**
 * The playing video's adjustment: none for a file without loudness data, or while Automatic waits for the library's
 * baseline; off while normalization is off; otherwise the one applied.
 */
export type NormalizationAdjustment = { kind: "none" } | { kind: "off" } | ({ kind: "applied" } & LoudnessAdjustment);

/** What normalization reads of the playing item: its loudness and true peak, when the scan measured them. */
export interface NormalizedItem {
  integratedLoudness?: number | null;
  peakDb?: number | null;
}

/**
 * Loudness normalization, on by default and kept on this device with its settings, which evens out loudness between
 * videos toward the target. The audio stage applies its gain to the playing video, which Enhanced audio's gain stage
 * needs, and the Stats tab shows its adjustment.
 */
export interface LoudnessNormalization {
  readonly enabled: ReadonlySignal<boolean>;
  setEnabled(on: boolean): void;
  readonly settings: ReadonlySignal<NormalizationSettings>;
  /** Changes the settings given, keeping the others. */
  updateSettings(changes: Partial<NormalizationSettings>): void;
  /** Puts every setting back to its default, leaving normalization on or off as it is. */
  resetSettings(): void;
  /** The library's baseline, Automatic's target, in LUFS, or null until it loads. */
  readonly baseline: ReadonlySignal<number | null>;
  readonly adjustment: ReadonlySignal<NormalizationAdjustment>;
  /** The gain the audio stage applies, in dB: the adjustment applied, or 0 without one. */
  readonly gainDb: ReadonlySignal<number>;
}

export interface LoudnessNormalizationOptions {
  device: DeviceStore;
  current: ReadonlySignal<NormalizedItem | null>;
  baseline: ReadonlySignal<number | null>;
}

function measured(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function createLoudnessNormalization(options: LoudnessNormalizationOptions): LoudnessNormalization {
  const { device, current, baseline } = options;
  const enabled = signal(device.read(NORMALIZATION_KEY, true, isBoolean));
  const settings = signal(readNormalizationSettings(device));

  const adjustment = computed<NormalizationAdjustment>(() => {
    const item = current.value;
    const loudness = measured(item?.integratedLoudness);
    if (loudness === null) {
      return { kind: "none" };
    }
    if (!enabled.value) {
      return { kind: "off" };
    }
    const tuning = settings.value;
    const target = targetLufs(tuning, baseline.value);
    if (target === null) {
      return { kind: "none" };
    }
    const applied = loudnessAdjustment({
      loudness,
      peak: measured(item?.peakDb),
      targetLufs: target,
      boostLimit: tuning.boostLimit,
      allowLimiting: tuning.allowLimiting
    })!;
    return { kind: "applied", ...applied };
  });

  function keep(next: NormalizationSettings): void {
    settings.value = next;
    device.write(NORMALIZATION_SETTINGS_KEY, next);
  }

  return {
    enabled,
    setEnabled(on) {
      enabled.value = on;
      device.write(NORMALIZATION_KEY, on);
    },
    settings,
    updateSettings(changes) {
      keep({ ...settings.peek(), ...changes });
    },
    resetSettings() {
      keep({ ...DEFAULT_NORMALIZATION_SETTINGS });
    },
    baseline,
    adjustment,
    gainDb: computed(() => {
      const value = adjustment.value;
      return value.kind === "applied" ? value.db : 0;
    })
  };
}
