/** Where each setting is kept in the browser's storage: this prefix, then the setting's key. */
const KEY_PREFIX = "rr_device.";

/**
 * What the WebUI remembers on this device across a page refresh.
 * Each setting is one entry, kept as JSON. Browser storage is kept per address, so the WebUI opened at another address
 * on the same device remembers its own.
 */
export interface DeviceStore {
  /** The setting's value, or `fallback` when it is not kept, cannot be read, or `accept` turns it down. */
  read<T>(key: string, fallback: T, accept: (value: unknown) => value is T): T;
  /** Keeps the setting. Best effort: a browser that refuses to store it leaves the page working. */
  write(key: string, value: unknown): void;
}

export type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

export function createDeviceStore(storage: DeviceStorage | null): DeviceStore {
  return {
    read(key, fallback, accept) {
      try {
        const raw = storage?.getItem(KEY_PREFIX + key);
        if (raw === null || raw === undefined) {
          return fallback;
        }
        const value: unknown = JSON.parse(raw);
        return accept(value) ? value : fallback;
      } catch {
        return fallback;
      }
    },

    write(key, value) {
      try {
        storage?.setItem(KEY_PREFIX + key, JSON.stringify(value));
      } catch {
        // Storage can be full, or refused in a private window; the setting then lasts until the page closes.
      }
    }
  };
}
