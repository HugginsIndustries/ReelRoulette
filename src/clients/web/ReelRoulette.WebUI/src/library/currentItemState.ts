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

function idKey(itemId: string | null | undefined): string {
  return itemId != null ? String(itemId).trim() : "";
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
