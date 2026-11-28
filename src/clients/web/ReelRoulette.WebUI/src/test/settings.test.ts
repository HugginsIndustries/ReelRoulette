import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AMBIENT_TUNING } from "../playback/ambient";
import {
  advanceAfterProblem,
  boostLimitProblem,
  createSettings,
  manualTargetProblem,
  numberProblem,
  RESET_DEVICE_QUESTION,
  wholeNumberProblem
} from "../settings/settings";
import { createDeviceStore } from "../state/deviceStore";
import { memoryStorage, type MemoryStorage } from "./memoryStorage";

/** Settings kept in `storage`, whose reset's question gets `confirmed` and whose reloads `reloadPage` counts. */
function settingsKeptIn(storage: MemoryStorage, confirmed = false, reloadPage: () => void = () => {}) {
  return createSettings({ device: createDeviceStore(storage), dialogs: { confirm: async () => confirmed }, reloadPage });
}

describe("wholeNumberProblem", () => {
  it("takes a whole number in range, spaces around it included", () => {
    for (const text of ["1", "300", " 42 ", "007"]) {
      expect([text, wholeNumberProblem(text, 1, 300, "seconds")]).toEqual([text, null]);
    }
  });

  it("says what it takes for anything else, an emptied field included", () => {
    for (const text of ["0", "301", "", " ", "abc", "12abc", "1.5", "-5", "1e2", "+5"]) {
      expect([text, wholeNumberProblem(text, 1, 300, "seconds")]).toEqual([text, { message: "Use a whole number from 1 to 300 seconds." }]);
    }
  });
});

describe("advanceAfterProblem", () => {
  it("takes 1 to 3600 seconds", () => {
    expect(advanceAfterProblem("1")).toBeNull();
    expect(advanceAfterProblem("3600")).toBeNull();
    expect(advanceAfterProblem("0")).toEqual({ message: "Use a whole number from 1 to 3600 seconds." });
    expect(advanceAfterProblem("3601")).toEqual({ message: "Use a whole number from 1 to 3600 seconds." });
  });
});

describe("numberProblem", () => {
  it("takes a number in range, negative or decimal, spaces around it included", () => {
    for (const text of ["-50", "-10", "-23.5", " -18 ", "-010"]) {
      expect([text, numberProblem(text, -50, -10, "LUFS")]).toEqual([text, null]);
    }
  });

  it("says what it takes for anything else, an emptied field included", () => {
    for (const text of ["-51", "-9.9", "-5", "", " ", "abc", "-", "-18.", ".5", "−18", "-1e1", "+18"]) {
      expect([text, numberProblem(text, -50, -10, "LUFS")]).toEqual([text, { message: "Use a number from -50 to -10 LUFS." }]);
    }
  });
});

describe("loudness normalization's fields", () => {
  it("take a target from -50 to -10 LUFS, and a boost limit of a whole number from 0 to 24 dB", () => {
    expect([manualTargetProblem("-50"), manualTargetProblem("-10"), manualTargetProblem("-30.5")]).toEqual([null, null, null]);
    expect(manualTargetProblem("-9")).toEqual({ message: "Use a number from -50 to -10 LUFS." });
    expect([boostLimitProblem("0"), boostLimitProblem("24")]).toEqual([null, null]);
    for (const text of ["25", "2.5", "-1", ""]) {
      expect([text, boostLimitProblem(text)]).toEqual([text, { message: "Use a whole number from 0 to 24 dB." }]);
    }
  });
});

describe("createSettings", () => {
  it("starts Auto-Pause at Responsive, or as this device keeps it, and keeps each change", () => {
    expect(settingsKeptIn(memoryStorage()).autoPauseMode.value).toBe("responsive");
    expect(settingsKeptIn(memoryStorage({ "rr_device.panel.autoPause": '"sometimes"' })).autoPauseMode.value).toBe(
      "responsive"
    );

    const storage = memoryStorage({ "rr_device.panel.autoPause": '"never"' });
    const settings = settingsKeptIn(storage);
    expect(settings.autoPauseMode.value).toBe("never");
    settings.setAutoPauseMode("always");
    expect(settings.autoPauseMode.value).toBe("always");
    expect(storage.values.get("rr_device.panel.autoPause")).toBe('"always"');
  });
});

describe("createSettings' Appearance", () => {
  it("starts the theme at System and file names on tiles off, or as this device keeps them, and keeps each change", () => {
    const fresh = settingsKeptIn(memoryStorage());
    expect([fresh.theme.value, fresh.tileNames.value]).toEqual(["system", false]);
    const unreadable = settingsKeptIn(memoryStorage({ "rr_device.appearance.theme": '"sepia"', "rr_device.appearance.tileNames": '"yes"' }));
    expect([unreadable.theme.value, unreadable.tileNames.value]).toEqual(["system", false]);

    const storage = memoryStorage({ "rr_device.appearance.theme": '"light"', "rr_device.appearance.tileNames": "true" });
    const settings = settingsKeptIn(storage);
    expect([settings.theme.value, settings.tileNames.value]).toEqual(["light", true]);
    settings.setTheme("dark");
    settings.setTileNames(false);
    expect([settings.theme.value, settings.tileNames.value]).toEqual(["dark", false]);
    expect([storage.values.get("rr_device.appearance.theme"), storage.values.get("rr_device.appearance.tileNames")]).toEqual(['"dark"', "false"]);
  });
});

describe("createSettings' ambient mode", () => {
  it("starts on, or as this device keeps it, and keeps each change", () => {
    expect(settingsKeptIn(memoryStorage()).ambient.value).toBe(true);
    expect(settingsKeptIn(memoryStorage({ "rr_device.appearance.ambient": '"off"' })).ambient.value).toBe(true);

    const storage = memoryStorage({ "rr_device.appearance.ambient": "false" });
    const settings = settingsKeptIn(storage);
    expect(settings.ambient.value).toBe(false);
    settings.setAmbient(true);
    expect(settings.ambient.value).toBe(true);
    expect(storage.values.get("rr_device.appearance.ambient")).toBe("true");
  });

  it("changes the settings given, keeping the others, and Reset to defaults puts every one back", () => {
    const storage = memoryStorage({ "rr_device.appearance.ambientSettings": JSON.stringify({ ...DEFAULT_AMBIENT_TUNING, blur: 40 }) });
    const settings = settingsKeptIn(storage);
    expect(settings.ambientTuning.value).toEqual({ ...DEFAULT_AMBIENT_TUNING, blur: 40 });

    settings.setAmbientTuning({ rate: 2.5 });
    const changed = { ...DEFAULT_AMBIENT_TUNING, blur: 40, rate: 2.5 };
    expect(settings.ambientTuning.value).toEqual(changed);
    expect(JSON.parse(storage.values.get("rr_device.appearance.ambientSettings")!)).toEqual(changed);

    settings.resetAmbientTuning();
    expect(settings.ambientTuning.value).toEqual(DEFAULT_AMBIENT_TUNING);
    expect(JSON.parse(storage.values.get("rr_device.appearance.ambientSettings")!)).toEqual(DEFAULT_AMBIENT_TUNING);
  });
});

describe("createSettings' reset", () => {
  const kept = () => ({
    "rr_device.appearance.theme": '"light"',
    "rr_device.panel.autoPause": '"never"',
    "rr_device.developer.dontRecordPlays": "true",
    rr_clientId: "client-kept"
  });

  it("asks first, then clears every setting but the Developer ones and reloads the page", async () => {
    const storage = memoryStorage(kept());
    const reloadPage = vi.fn();
    const confirm = vi.fn(async () => true);
    const settings = createSettings({ device: createDeviceStore(storage), dialogs: { confirm }, reloadPage });

    await settings.resetDevice();

    expect(confirm).toHaveBeenCalledWith({ message: RESET_DEVICE_QUESTION, confirmLabel: "Reset", danger: true });
    expect([...storage.values.keys()].sort()).toEqual(["rr_clientId", "rr_device.developer.dontRecordPlays"]);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it("changes nothing when the question is cancelled", async () => {
    const storage = memoryStorage(kept());
    const reloadPage = vi.fn();

    await settingsKeptIn(storage, false, reloadPage).resetDevice();

    expect(Object.fromEntries(storage.values)).toEqual(kept());
    expect(reloadPage).not.toHaveBeenCalled();
  });
});
