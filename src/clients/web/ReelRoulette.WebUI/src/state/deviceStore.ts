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
  /**
   * Removes every setting whose key `keep` turns down, such as every one but the Developer settings for Reset this
   * device's settings. Best effort, as `write` is. Nothing kept outside the store, such as the client id, is touched.
   */
  clear(keep: (key: string) => boolean): void;
}

/** Takes a setting kept as true or false, for `read`. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Takes a setting kept as a record of fields, for `read`, so each field can be checked on its own. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The parts of the browser's storage the WebUI uses. */
export type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/**
 * The browser's `localStorage` or `sessionStorage`, or null where the page can't reach it, as when the browser blocks
 * storage for the address, or where there is none, as in a test that runs without a page.
 */
export function browserStorage(name: "localStorage" | "sessionStorage"): DeviceStorage | null {
  try {
    const candidate = (globalThis as Record<string, unknown>)[name] as Partial<DeviceStorage> | null | undefined;
    return candidate && typeof candidate.getItem === "function" && typeof candidate.setItem === "function" ? (candidate as DeviceStorage) : null;
  } catch {
    return null;
  }
}

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
    },

    clear(keep) {
      if (!storage) {
        return;
      }
      try {
        // Every key first, since removing one moves the keys after it.
        const keys: string[] = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (key !== null) {
            keys.push(key);
          }
        }
        for (const key of keys) {
          if (key.startsWith(KEY_PREFIX) && !keep(key.slice(KEY_PREFIX.length))) {
            storage.removeItem(key);
          }
        }
      } catch {
        // As `write`: a browser that refuses leaves what it keeps.
      }
    }
  };
}
