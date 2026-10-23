import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { isBoolean, type DeviceStore } from "../state/deviceStore";
import { dbToGain } from "./loudnessNormalization";

/** The per-device store's keys for Compression and its settings. */
export const COMPRESSION_KEY = "audio.compression";
export const COMPRESSION_SETTINGS_KEY = "audio.compressionSettings";

/**
 * A compressor's values: where it starts turning sound down, how strongly, its knee, how quickly it acts and lets go,
 * and the makeup gain applied after it.
 */
export interface CompressorValues {
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackSeconds: number;
  releaseSeconds: number;
  makeupDb: number;
}

/** Strength's choices: the presets, Medium by default, and Custom, which keeps values of its own. */
export const COMPRESSION_STRENGTHS = ["light", "medium", "strong", "custom"] as const;
export type CompressionStrength = (typeof COMPRESSION_STRENGTHS)[number];
export type CompressionPreset = Exclude<CompressionStrength, "custom">;

/**
 * The presets. Each one's makeup gain is the lift Web Audio's own makeup gave it, to a tenth of a dB, so the presets sound
 * as they did when they were settled by listening, while compression cancels Web Audio's makeup.
 */
export const COMPRESSION_PRESETS: Readonly<Record<CompressionPreset, Readonly<CompressorValues>>> = {
  light: { thresholdDb: -18, ratio: 2, kneeDb: 6, attackSeconds: 0.005, releaseSeconds: 0.25, makeupDb: 4.5 },
  medium: { thresholdDb: -24, ratio: 4, kneeDb: 6, attackSeconds: 0.005, releaseSeconds: 0.25, makeupDb: 9.7 },
  strong: { thresholdDb: -30, ratio: 8, kneeDb: 6, attackSeconds: 0.005, releaseSeconds: 0.25, makeupDb: 14.6 }
};

/**
 * Custom's ranges: Web Audio's own for the compressor, with attack and release in whole ms, and the makeup gain up to
 * the boost limit's 24 dB.
 */
export const CUSTOM_RANGES: Readonly<Record<keyof CompressorValues, { min: number; max: number }>> = {
  thresholdDb: { min: -100, max: 0 },
  ratio: { min: 1, max: 20 },
  kneeDb: { min: 0, max: 40 },
  attackSeconds: { min: 0, max: 1 },
  releaseSeconds: { min: 0, max: 1 },
  makeupDb: { min: 0, max: 24 }
};

export interface CompressionSettings {
  strength: CompressionStrength;
  /** Custom's values, which start at Medium's and are kept while another strength is chosen. */
  custom: CompressorValues;
}

export const DEFAULT_COMPRESSION_SETTINGS: Readonly<CompressionSettings> = { strength: "medium", custom: { ...COMPRESSION_PRESETS.medium } };

/** Off, the compressor stays in the chain with no compression and no makeup gain: a ratio of 1, no knee, at 0 dB. */
export const COMPRESSOR_OFF = { thresholdDb: 0, kneeDb: 0, ratio: 1 } as const;

function toDb(linear: number): number {
  return 20 * Math.log10(linear);
}

/**
 * The makeup gain Web Audio's compressor lifts its whole output by, in dB: the inverse of its curve's gain at full
 * scale, to the power 0.6, as the spec gives it. Over the knee, from the threshold to the threshold plus the knee, the
 * curve is the one Blink's `DynamicsCompressorKernel`, which Gecko and WebKit share, works out: `t + (1 - e^(-k(x - t))) / k`
 * in linear units, with `k` searched for so the curve's slope at the knee's end is 1/ratio. Above the knee it rises at
 * 1/ratio, in dB.
 */
export function webAudioMakeupDb(thresholdDb: number, kneeDb: number, ratio: number): number {
  const threshold = dbToGain(thresholdDb);
  const kneeCurve = (x: number, k: number) => (x < threshold ? x : threshold + (1 - Math.exp(-k * (x - threshold))) / k);
  // The curve's slope in dB at `x`, measured over a step of 0.1%, as the kernel measures it.
  const slopeAt = (x: number, k: number) => {
    if (x < threshold) return 1;
    const next = x * 1.001;
    return (toDb(kneeCurve(next, k)) - toDb(kneeCurve(x, k))) / (toDb(next) - toDb(x));
  };
  const kneeEndDb = thresholdDb + kneeDb;
  const kneeEnd = dbToGain(kneeEndDb);
  let low = 0.1;
  let high = 10000;
  let k = 5;
  for (let step = 0; step < 15; step += 1) {
    if (slopeAt(kneeEnd, k) < 1 / ratio) {
      high = k;
    } else {
      low = k;
    }
    k = Math.sqrt(low * high);
  }
  const kneeEndOutputDb = toDb(kneeCurve(kneeEnd, k));
  const fullScaleOutput = 1 < kneeEnd ? kneeCurve(1, k) : dbToGain(kneeEndOutputDb + (0 - kneeEndDb) / ratio);
  return -0.6 * toDb(fullScaleOutput);
}

/** The gain after the compressor, in dB: Web Audio's makeup taken back, and the values' own makeup gain applied. */
export function compressionGainDb(values: CompressorValues): number {
  return values.makeupDb - webAudioMakeupDb(values.thresholdDb, values.kneeDb, values.ratio);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, key: keyof CompressorValues): value is number {
  const range = CUSTOM_RANGES[key];
  return typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max;
}

/** Compression's settings as this device kept them, each one missing or outside its range read as its default. */
export function readCompressionSettings(device: DeviceStore): CompressionSettings {
  const saved = device.read<Record<string, unknown> | null>(COMPRESSION_SETTINGS_KEY, null, isRecord) ?? {};
  const strength = COMPRESSION_STRENGTHS.includes(saved.strength as CompressionStrength) ? (saved.strength as CompressionStrength) : DEFAULT_COMPRESSION_SETTINGS.strength;
  const custom = { ...DEFAULT_COMPRESSION_SETTINGS.custom };
  const savedCustom = isRecord(saved.custom) ? saved.custom : {};
  for (const key of Object.keys(CUSTOM_RANGES) as Array<keyof CompressorValues>) {
    if (inRange(savedCustom[key], key)) {
      custom[key] = savedCustom[key];
    }
  }
  return { strength, custom };
}

/** What the audio stage applies: whether compression is on, and the chosen strength's values. */
export interface CompressorSetting {
  on: boolean;
  values: CompressorValues;
}

/**
 * Compression, off by default and kept on this device with its settings, which evens out loudness within a video. The
 * audio stage applies it, which Enhanced audio's gain stage needs.
 */
export interface Compression {
  readonly enabled: ReadonlySignal<boolean>;
  setEnabled(on: boolean): void;
  readonly settings: ReadonlySignal<CompressionSettings>;
  setStrength(strength: CompressionStrength): void;
  /** Changes the Custom values given, keeping the others. */
  updateCustom(changes: Partial<CompressorValues>): void;
  /** Puts Custom's values back to Medium's, leaving the strength as it is. */
  resetCustom(): void;
  /** Whether compression is on, and the chosen strength's values. */
  readonly compressor: ReadonlySignal<CompressorSetting>;
}

export function createCompression(options: { device: DeviceStore }): Compression {
  const { device } = options;
  const enabled = signal(device.read(COMPRESSION_KEY, false, isBoolean));
  const settings = signal(readCompressionSettings(device));

  function keep(next: CompressionSettings): void {
    settings.value = next;
    device.write(COMPRESSION_SETTINGS_KEY, next);
  }

  return {
    enabled,
    setEnabled(on) {
      enabled.value = on;
      device.write(COMPRESSION_KEY, on);
    },
    settings,
    setStrength(strength) {
      keep({ ...settings.peek(), strength });
    },
    updateCustom(changes) {
      const current = settings.peek();
      keep({ ...current, custom: { ...current.custom, ...changes } });
    },
    resetCustom() {
      keep({ ...settings.peek(), custom: { ...COMPRESSION_PRESETS.medium } });
    },
    compressor: computed(() => {
      const { strength, custom } = settings.value;
      return { on: enabled.value, values: strength === "custom" ? custom : COMPRESSION_PRESETS[strength] };
    })
  };
}
