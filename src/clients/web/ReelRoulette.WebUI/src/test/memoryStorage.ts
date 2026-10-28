import type { DeviceStorage } from "../state/deviceStore";

/** Browser storage held in memory, for a test's device store, with what it keeps and the keys written to it. */
export interface MemoryStorage extends DeviceStorage {
  /** What it keeps, by its full key, such as "rr_device.panel.open", which a test may fill or read. */
  readonly values: Map<string, string>;
  /** Each key written, in order, repeats included. */
  readonly writtenKeys: string[];
}

/**
 * Storage that starts with `initial`. Given a map, it keeps its entries in that map, so a test that holds the map sees
 * them, as across the stores a test creates for one device.
 */
export function memoryStorage(initial: Record<string, string> | Map<string, string> = {}): MemoryStorage {
  const values = initial instanceof Map ? initial : new Map(Object.entries(initial));
  const writtenKeys: string[] = [];
  return {
    values,
    writtenKeys,
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writtenKeys.push(key);
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
