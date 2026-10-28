import { signal } from "@preact/signals";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  automaticLine,
  createLoudnessNormalization,
  DEFAULT_NORMALIZATION_SETTINGS,
  loudnessAdjustment,
  readNormalizationSettings,
  targetLufs,
  type GainRuleInput,
  type LoudnessAdjustment,
  type NormalizedItem
} from "../playback/loudnessNormalization";
import { createDeviceStore } from "../state/deviceStore";
import { memoryStorage } from "./memoryStorage";

interface GainRuleCase {
  name: string;
  input: GainRuleInput;
  expected: LoudnessAdjustment | null;
}

const gainRuleCases = JSON.parse(readFileSync(new URL("./fixtures/loudness-gain-rule.json", import.meta.url), "utf8")) as GainRuleCase[];

describe("loudnessAdjustment", () => {
  it.each(gainRuleCases.map((rule) => [rule.name, rule] as const))("%s", (_, rule) => {
    const adjustment = loudnessAdjustment(rule.input);
    if (rule.expected === null) {
      expect(adjustment).toBeNull();
      return;
    }
    expect(adjustment).not.toBeNull();
    expect(adjustment!.db).toBeCloseTo(rule.expected.db, 9);
    expect(adjustment!.limitedByPeak).toBe(rule.expected.limitedByPeak);
  });
});

describe("targetLufs and automaticLine", () => {
  it("gives Quieter, Standard, and Louder their own loudness, Manual its target, and Automatic the library's baseline", () => {
    const settingsFor = (target: (typeof DEFAULT_NORMALIZATION_SETTINGS)["target"]) => ({ ...DEFAULT_NORMALIZATION_SETTINGS, target, manualTarget: -31.5 });
    expect([settingsFor("quieter"), settingsFor("standard"), settingsFor("louder"), settingsFor("manual"), settingsFor("automatic")].map((settings) => targetLufs(settings, -27.8))).toEqual([
      -23, -18, -14, -31.5, -27.8
    ]);
    expect(targetLufs(settingsFor("automatic"), null)).toBeNull();
  });

  it("names the library's baseline with its loudness once it has loaded", () => {
    expect(automaticLine(-27.84)).toBe("The library's baseline, -27.8 LUFS.");
    expect(automaticLine(null)).toBe("The library's baseline.");
  });
});

describe("readNormalizationSettings", () => {
  it("reads the defaults, Automatic, -18 LUFS, a 15 dB boost limit, and Allow limiting on, from a device that kept none", () => {
    expect(readNormalizationSettings(createDeviceStore(memoryStorage()))).toEqual({
      target: "automatic",
      manualTarget: -18,
      boostLimit: 15,
      allowLimiting: true
    });
  });

  it("reads each setting this device kept, and each one outside its range as its default", () => {
    const kept = (value: unknown) =>
      readNormalizationSettings(createDeviceStore(memoryStorage({ "rr_device.audio.normalizationSettings": JSON.stringify(value) })));
    expect(kept({ target: "manual", manualTarget: -50, boostLimit: 0, allowLimiting: false })).toEqual({
      target: "manual",
      manualTarget: -50,
      boostLimit: 0,
      allowLimiting: false
    });
    expect(kept({ target: "louder", manualTarget: -10.5, boostLimit: 24 })).toEqual({ ...DEFAULT_NORMALIZATION_SETTINGS, target: "louder", manualTarget: -10.5, boostLimit: 24 });
    expect(kept({ target: "loudest", manualTarget: -9, boostLimit: 25, allowLimiting: "yes" })).toEqual(DEFAULT_NORMALIZATION_SETTINGS);
    expect(kept({ manualTarget: -51, boostLimit: 2.5 })).toEqual(DEFAULT_NORMALIZATION_SETTINGS);
    expect(kept([1, 2])).toEqual(DEFAULT_NORMALIZATION_SETTINGS);
  });
});

describe("createLoudnessNormalization", () => {
  function setup(saved: Record<string, string> = {}) {
    const storage = memoryStorage(saved);
    const current = signal<NormalizedItem | null>({ integratedLoudness: -12, peakDb: -0.5 });
    const baseline = signal<number | null>(-27.8);
    const normalization = createLoudnessNormalization({ device: createDeviceStore(storage), current, baseline });
    return { storage, current, baseline, normalization };
  }

  it("starts on, or as this device keeps it, and keeps each change", () => {
    const { normalization, storage } = setup();
    expect(normalization.enabled.value).toBe(true);
    normalization.setEnabled(false);
    expect(normalization.enabled.value).toBe(false);
    expect(storage.values.get("rr_device.audio.normalization")).toBe("false");
    expect(setup({ "rr_device.audio.normalization": "false" }).normalization.enabled.value).toBe(false);
    expect(setup({ "rr_device.audio.normalization": '"off"' }).normalization.enabled.value).toBe(true);
  });

  it("keeps each settings change with the others, and Reset to defaults puts them all back, leaving normalization off", () => {
    const { normalization, storage } = setup();
    normalization.setEnabled(false);
    normalization.updateSettings({ target: "manual", manualTarget: -30 });
    normalization.updateSettings({ boostLimit: 6 });
    expect(normalization.settings.value).toEqual({ target: "manual", manualTarget: -30, boostLimit: 6, allowLimiting: true });
    expect(JSON.parse(storage.values.get("rr_device.audio.normalizationSettings")!)).toEqual(normalization.settings.value);

    normalization.resetSettings();
    expect(normalization.settings.value).toEqual(DEFAULT_NORMALIZATION_SETTINGS);
    expect(JSON.parse(storage.values.get("rr_device.audio.normalizationSettings")!)).toEqual(DEFAULT_NORMALIZATION_SETTINGS);
    expect(normalization.enabled.value).toBe(false);
  });

  it("applies the gain rule to the playing video toward the target, and follows the settings, the target, and the video as they change", () => {
    const { normalization, current } = setup();
    expect(normalization.adjustment.value).toEqual({ kind: "applied", db: expect.closeTo(-15.8, 9), limitedByPeak: false });
    expect(normalization.gainDb.value).toBeCloseTo(-15.8, 9);

    normalization.updateSettings({ target: "standard" });
    expect(normalization.gainDb.value).toBeCloseTo(-6, 9);

    current.value = { integratedLoudness: -30, peakDb: -6 };
    expect(normalization.adjustment.value).toEqual({ kind: "applied", db: 11, limitedByPeak: true });
    normalization.updateSettings({ allowLimiting: false });
    expect(normalization.adjustment.value).toEqual({ kind: "applied", db: 5, limitedByPeak: true });
  });

  it("is off while normalization is off, with no gain", () => {
    const { normalization } = setup();
    normalization.setEnabled(false);
    expect(normalization.adjustment.value).toEqual({ kind: "off" });
    expect(normalization.gainDb.value).toBe(0);
  });

  it("has none for a file without loudness data, or nothing playing, whether normalization is on or off", () => {
    const { normalization, current } = setup();
    current.value = { integratedLoudness: undefined, peakDb: undefined };
    expect(normalization.adjustment.value).toEqual({ kind: "none" });
    normalization.setEnabled(false);
    expect(normalization.adjustment.value).toEqual({ kind: "none" });
    current.value = null;
    expect(normalization.adjustment.value).toEqual({ kind: "none" });
    expect(normalization.gainDb.value).toBe(0);
  });

  it("under Automatic, has none and no gain until the library's baseline arrives, then applies the rule toward it", () => {
    const { normalization, baseline } = setup();
    baseline.value = null;
    expect(normalization.adjustment.value).toEqual({ kind: "none" });
    expect(normalization.gainDb.value).toBe(0);
    // The other targets don't wait for it.
    normalization.updateSettings({ target: "louder" });
    expect(normalization.gainDb.value).toBeCloseTo(-2, 9);
    normalization.updateSettings({ target: "automatic" });

    baseline.value = -20;
    expect(normalization.adjustment.value).toEqual({ kind: "applied", db: -8, limitedByPeak: false });
  });
});
