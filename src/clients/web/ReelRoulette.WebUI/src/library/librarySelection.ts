import { computed, signal, type ReadonlySignal } from "@preact/signals";

/**
 * The Library tab's selection: the items picked, whether selection is on, the tile Shift+click adds a range from, and
 * whether the Selection actions menu is open. Selection is on while any item is picked, so taking out the last one
 * ends it.
 */
export interface LibrarySelection {
  /** Selection is on: every tile shows its check icon and the selection bar shows. */
  readonly active: ReadonlySignal<boolean>;
  /** How many items are picked. */
  readonly count: ReadonlySignal<number>;
  /** Changes with every change to the picked items, for what shows them. */
  readonly version: ReadonlySignal<number>;
  /** The Selection actions menu is open. */
  readonly menuOpen: ReadonlySignal<boolean>;
  has(itemId: string): boolean;
  /** The picked items' ids. */
  ids(): string[];
  /** Picks `itemId`, or takes it out when it is picked, and starts a range from it. */
  toggle(itemId: string): void;
  /**
   * Picks every item of `order` from the tile the last range started from to `itemId`, or only `itemId` when that tile
   * isn't in `order` or there is none, and starts the next range from `itemId`.
   */
  addRange(itemId: string, order: readonly string[]): void;
  /** Picks every one of `ids`, leaving the tile a range starts from. */
  addAll(ids: readonly string[]): void;
  /** Takes out every one of `ids`, as when their items are removed. */
  remove(ids: readonly string[]): void;
  /** Ends selection, taking out every item and closing the menu. */
  clear(): void;
  toggleMenu(): void;
  closeMenu(): void;
}

export function createLibrarySelection(): LibrarySelection {
  const picked = new Set<string>();
  const version = signal(0);
  const active = signal(false);
  const menuOpen = signal(false);
  const count = computed(() => {
    version.value;
    return picked.size;
  });
  let anchor: string | null = null;

  function changed(): void {
    if (picked.size === 0) {
      anchor = null;
      active.value = false;
      menuOpen.value = false;
    } else {
      active.value = true;
    }
    version.value++;
  }

  return {
    active,
    count,
    version,
    menuOpen,
    has: (itemId) => picked.has(itemId),
    ids: () => [...picked],

    toggle(itemId) {
      if (picked.has(itemId)) {
        picked.delete(itemId);
      } else {
        picked.add(itemId);
      }
      anchor = itemId;
      changed();
    },

    addRange(itemId, order) {
      const from = anchor === null ? -1 : order.indexOf(anchor);
      const to = order.indexOf(itemId);
      if (from >= 0 && to >= 0) {
        for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
          picked.add(order[index]!);
        }
      } else {
        picked.add(itemId);
      }
      anchor = itemId;
      changed();
    },

    addAll(ids) {
      if (!active.peek()) {
        return;
      }
      for (const id of ids) {
        picked.add(id);
      }
      changed();
    },

    remove(ids) {
      if (!active.peek()) {
        return;
      }
      const before = picked.size;
      for (const id of ids) {
        picked.delete(id);
      }
      if (picked.size !== before) {
        changed();
      }
    },

    clear() {
      if (!active.peek()) {
        return;
      }
      picked.clear();
      changed();
    },

    toggleMenu() {
      menuOpen.value = active.peek() && !menuOpen.peek();
    },

    closeMenu() {
      menuOpen.value = false;
    }
  };
}
