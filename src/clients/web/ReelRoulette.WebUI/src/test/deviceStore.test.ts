import { describe, expect, it } from "vitest";
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

const isNumber = (value: unknown): value is number => typeof value === "number";

describe("device store", () => {
  it("keeps each setting as JSON under its own key, and reads it back", () => {
    const storage = memoryStorage();
    const device = createDeviceStore(storage);

    device.write("panel.width", 512);
    device.write("panel.side", "left");

    expect(storage.values.get("rr_device.panel.width")).toBe("512");
    expect(storage.values.get("rr_device.panel.side")).toBe('"left"');
    expect(device.read("panel.width", 420, isNumber)).toBe(512);
    expect(createDeviceStore(storage).read("panel.side", "right", (value): value is string => typeof value === "string")).toBe("left");
  });

  it("reads the fallback for a setting not kept, not JSON, or not accepted", () => {
    const device = createDeviceStore(memoryStorage({ "rr_device.broken": "{", "rr_device.text": '"wide"' }));

    expect(device.read("missing", 420, isNumber)).toBe(420);
    expect(device.read("broken", 420, isNumber)).toBe(420);
    expect(device.read("text", 420, isNumber)).toBe(420);
  });

  it("keeps working when the browser refuses its storage", () => {
    const refusing = {
      getItem(): string | null {
        throw new Error("SecurityError");
      },
      setItem(): void {
        throw new Error("QuotaExceededError");
      }
    };
    const device = createDeviceStore(refusing);

    expect(() => device.write("panel.open", true)).not.toThrow();
    expect(device.read("panel.open", false, (value): value is boolean => typeof value === "boolean")).toBe(false);
    expect(createDeviceStore(null).read("panel.width", 420, isNumber)).toBe(420);
  });
});
