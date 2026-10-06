export interface ItemFlags {
  isFavorite: boolean;
  isBlacklisted: boolean;
}

/** The playing item as the random and play responses describe it. */
export interface CurrentItem {
  itemId?: string | null;
  isFavorite?: boolean;
  isBlacklisted?: boolean;
}

export interface ItemStateEvent {
  itemId?: string | null;
  isFavorite?: boolean;
  isBlacklisted?: boolean;
}

export interface ItemStateCache {
  remember(itemId: string | null | undefined, flags: ItemFlags): void;
  applyTo(item: CurrentItem | null | undefined): void;
}

function idKey(itemId: string | null | undefined): string {
  return itemId != null ? String(itemId).trim() : "";
}

/**
 * The favorite and blacklist last seen for each catalog item id, so an item played again from history shows
 * its current state. Keyed by item id, so two files whose paths differ only in case stay apart.
 */
export function createItemStateCache(): ItemStateCache {
  const states = new Map<string, ItemFlags>();
  return {
    remember(itemId, flags) {
      const key = idKey(itemId);
      if (!key) {
        return;
      }
      states.set(key, { isFavorite: !!flags.isFavorite, isBlacklisted: !!flags.isBlacklisted });
    },
    applyTo(item) {
      const cached = item ? states.get(idKey(item.itemId)) : undefined;
      if (!item || !cached) {
        return;
      }
      item.isFavorite = cached.isFavorite;
      item.isBlacklisted = cached.isBlacklisted;
    }
  };
}

/** Applies an item-state event to the current item when the event names it. Returns whether it did. */
export function applyItemStateToCurrent(current: CurrentItem | null | undefined, payload: ItemStateEvent): boolean {
  const itemId = idKey(payload.itemId);
  if (!current || !itemId || idKey(current.itemId) !== itemId) {
    return false;
  }
  current.isFavorite = payload.isFavorite === true;
  current.isBlacklisted = payload.isBlacklisted === true;
  return true;
}
