import { describe, expect, it } from "vitest";
import { createDeviceStore } from "../state/deviceStore";
import { memoryStorage } from "./memoryStorage";

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
      get length(): number {
        throw new Error("SecurityError");
      },
      key(): string | null {
        throw new Error("SecurityError");
      },
      getItem(): string | null {
        throw new Error("SecurityError");
      },
      setItem(): void {
        throw new Error("QuotaExceededError");
      },
      removeItem(): void {
        throw new Error("SecurityError");
      }
    };
    const device = createDeviceStore(refusing);

    expect(() => device.write("panel.open", true)).not.toThrow();
    expect(device.read("panel.open", false, (value): value is boolean => typeof value === "boolean")).toBe(false);
    expect(() => device.clear(() => false)).not.toThrow();
    expect(createDeviceStore(null).read("panel.width", 420, isNumber)).toBe(420);
    expect(() => createDeviceStore(null).clear(() => false)).not.toThrow();
  });

  it("clears every setting its keep check turns down, and nothing kept outside the store", () => {
    const storage = memoryStorage({
      "rr_device.panel.width": "512",
      "rr_device.developer.dontRecordPlays": "true",
      "rr_device.appearance.theme": '"light"',
      "rr_device.developer.other": "1",
      rr_clientId: "client-kept",
      "other.panel.width": "300"
    });

    createDeviceStore(storage).clear((key) => key.startsWith("developer."));

    expect([...storage.values.keys()].sort()).toEqual(["other.panel.width", "rr_clientId", "rr_device.developer.dontRecordPlays", "rr_device.developer.other"]);
  });
});
