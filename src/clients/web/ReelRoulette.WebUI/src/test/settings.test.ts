import { describe, expect, it } from "vitest";
import { advanceAfterProblem, createSettings, wholeNumberProblem } from "../settings/settings";
import { createDeviceStore } from "../state/deviceStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
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
  it("takes 1 to 300 seconds", () => {
    expect(advanceAfterProblem("1")).toBeNull();
    expect(advanceAfterProblem("300")).toBeNull();
    expect(advanceAfterProblem("301")).toEqual({ message: "Use a whole number from 1 to 300 seconds." });
  });
});

describe("createSettings", () => {
  it("starts Auto-Pause at Responsive, or as this device keeps it, and keeps each change", () => {
    expect(createSettings({ device: createDeviceStore(memoryStorage()) }).autoPauseMode.value).toBe("responsive");
    expect(createSettings({ device: createDeviceStore(memoryStorage({ "rr_device.panel.autoPause": '"sometimes"' })) }).autoPauseMode.value).toBe(
      "responsive"
    );

    const storage = memoryStorage({ "rr_device.panel.autoPause": '"never"' });
    const settings = createSettings({ device: createDeviceStore(storage) });
    expect(settings.autoPauseMode.value).toBe("never");
    settings.setAutoPauseMode("always");
    expect(settings.autoPauseMode.value).toBe("always");
    expect(storage.values.get("rr_device.panel.autoPause")).toBe('"always"');
  });
});

describe("createSettings' Appearance", () => {
  it("starts the theme at System and file names on tiles off, or as this device keeps them, and keeps each change", () => {
    const fresh = createSettings({ device: createDeviceStore(memoryStorage()) });
    expect([fresh.theme.value, fresh.tileNames.value]).toEqual(["system", false]);
    const unreadable = createSettings({
      device: createDeviceStore(memoryStorage({ "rr_device.appearance.theme": '"sepia"', "rr_device.appearance.tileNames": '"yes"' }))
    });
    expect([unreadable.theme.value, unreadable.tileNames.value]).toEqual(["system", false]);

    const storage = memoryStorage({ "rr_device.appearance.theme": '"light"', "rr_device.appearance.tileNames": "true" });
    const settings = createSettings({ device: createDeviceStore(storage) });
    expect([settings.theme.value, settings.tileNames.value]).toEqual(["light", true]);
    settings.setTheme("dark");
    settings.setTileNames(false);
    expect([settings.theme.value, settings.tileNames.value]).toEqual(["dark", false]);
    expect([storage.values.get("rr_device.appearance.theme"), storage.values.get("rr_device.appearance.tileNames")]).toEqual(['"dark"', "false"]);
  });
});
