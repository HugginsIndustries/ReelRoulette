import { describe, expect, it } from "vitest";
import { LIMITER_MAKEUP_DB, LIMITER_RATIO, LIMITER_THRESHOLD_DB } from "../playback/audioStage";
import {
  COMPRESSION_PRESETS,
  COMPRESSOR_OFF,
  compressionGainDb,
  createCompression,
  DEFAULT_COMPRESSION_SETTINGS,
  readCompressionSettings,
  webAudioMakeupDb
} from "../playback/compression";
import { createDeviceStore } from "../state/deviceStore";
import { memoryStorage } from "./memoryStorage";

/** A device whose store starts with `saved`, and what it keeps. */
function device(saved: Record<string, string> = {}) {
  const kept = new Map(Object.entries(saved));
  return { kept, store: createDeviceStore(memoryStorage(kept)) };
}

describe("Web Audio's makeup gain", () => {
  it("without a knee, is 0.6 times the curve's cut at full scale, the limiter's 0.57 dB among them", () => {
    for (const [threshold, ratio] of [
      [-24, 4],
      [-50, 20],
      [-10, 2],
      [-60, 1.5]
    ] as const) {
      expect(webAudioMakeupDb(threshold, 0, ratio), `${threshold} dB at ${ratio} to 1`).toBeCloseTo(-0.6 * threshold * (1 - 1 / ratio), 6);
    }
    expect(webAudioMakeupDb(LIMITER_THRESHOLD_DB, 0, LIMITER_RATIO)).toBeCloseTo(LIMITER_MAKEUP_DB, 9);
  });

  it("with a knee, follows the knee curve Blink, Gecko, and WebKit share, below the formula without one", () => {
    // Worked out by a script following `DynamicsCompressorKernel`, in doubles.
    expect(webAudioMakeupDb(-18, 6, 2)).toBeCloseTo(4.5478, 3);
    expect(webAudioMakeupDb(-24, 6, 4)).toBeCloseTo(9.6514, 3);
    expect(webAudioMakeupDb(-30, 6, 8)).toBeCloseTo(14.5559, 3);
    expect(webAudioMakeupDb(-24, 6, 4)).toBeLessThan(10.8);
  });

  it("is none with compression off, a ratio of 1 with no knee at 0 dB", () => {
    expect(webAudioMakeupDb(COMPRESSOR_OFF.thresholdDb, COMPRESSOR_OFF.kneeDb, COMPRESSOR_OFF.ratio)).toBeCloseTo(0, 9);
  });

  it("gives each preset the lift Web Audio gave it, to a tenth of a dB, so the gain after the compressor is about 0 dB", () => {
    for (const [name, values] of Object.entries(COMPRESSION_PRESETS)) {
      const lift = webAudioMakeupDb(values.thresholdDb, values.kneeDb, values.ratio);
      expect(values.makeupDb, name).toBe(Math.round(lift * 10) / 10);
      expect(Math.abs(compressionGainDb(values)), name).toBeLessThanOrEqual(0.05);
    }
  });

  it("takes back Web Audio's makeup and applies the values' own", () => {
    const values = { ...COMPRESSION_PRESETS.medium, makeupDb: 0 };
    expect(compressionGainDb(values)).toBeCloseTo(-webAudioMakeupDb(-24, 6, 4), 9);
    expect(compressionGainDb({ ...values, makeupDb: 3 })).toBeCloseTo(3 - webAudioMakeupDb(-24, 6, 4), 9);
  });
});

describe("Compression's settings", () => {
  it("are off with Medium by default, and Custom starts at Medium's values", () => {
    const compression = createCompression({ device: device().store });
    expect(compression.enabled.value).toBe(false);
    expect(compression.settings.value).toEqual({ strength: "medium", custom: COMPRESSION_PRESETS.medium });
    expect(compression.compressor.value).toEqual({ on: false, values: COMPRESSION_PRESETS.medium });
  });

  it("give the audio stage the chosen strength's values, and Custom keeps its own while another strength is chosen", () => {
    const { store, kept } = device();
    const compression = createCompression({ device: store });
    compression.setEnabled(true);
    compression.setStrength("strong");
    expect(compression.compressor.value).toEqual({ on: true, values: COMPRESSION_PRESETS.strong });
    compression.setStrength("custom");
    compression.updateCustom({ ratio: 6, makeupDb: 3 });
    expect(compression.compressor.value.values).toEqual({ ...COMPRESSION_PRESETS.medium, ratio: 6, makeupDb: 3 });
    compression.setStrength("light");
    expect(compression.compressor.value.values).toEqual(COMPRESSION_PRESETS.light);
    expect(compression.settings.value.custom).toEqual({ ...COMPRESSION_PRESETS.medium, ratio: 6, makeupDb: 3 });
    expect(JSON.parse(kept.get("rr_device.audio.compression")!)).toBe(true);
    expect(JSON.parse(kept.get("rr_device.audio.compressionSettings")!)).toEqual({
      strength: "light",
      custom: { ...COMPRESSION_PRESETS.medium, ratio: 6, makeupDb: 3 }
    });
  });

  it("Reset to Medium puts Custom's values back to Medium's, leaving the strength", () => {
    const compression = createCompression({ device: device().store });
    compression.setStrength("custom");
    compression.updateCustom({ thresholdDb: -40 });
    compression.resetCustom();
    expect(compression.settings.value).toEqual({ strength: "custom", custom: COMPRESSION_PRESETS.medium });
  });

  it("read each kept value outside its range, and a strength not offered, as its default", () => {
    const { store } = device({
      "rr_device.audio.compressionSettings": JSON.stringify({ strength: "loud", custom: { thresholdDb: -120, ratio: 6, kneeDb: 50, attackSeconds: 0.01, makeupDb: 30 } })
    });
    expect(readCompressionSettings(store)).toEqual({ strength: "medium", custom: { ...COMPRESSION_PRESETS.medium, ratio: 6, attackSeconds: 0.01 } });
    expect(DEFAULT_COMPRESSION_SETTINGS.strength).toBe("medium");
  });
});
