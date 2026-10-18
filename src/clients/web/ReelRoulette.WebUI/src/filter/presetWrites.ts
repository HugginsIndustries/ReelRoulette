import { namesEqualIgnoringCase } from "./filterDialogModel";
import { filterStatesEqualForPresetMatch, type FilterState, type PresetRow } from "./filterStateModel";

/** One preset write Apply sends, by id. A new preset's id is its temporary one until the server gives it its own. */
export type PresetWrite =
  | { kind: "delete"; id: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "update"; id: string; filterState: FilterState }
  | { kind: "create"; id: string; name: string; filterState: FilterState }
  /** Sends the tab's order, with the ids the server gave its new presets. */
  | { kind: "reorder" };

/** Presets whose changes would have them take each other's names, or filters, by id, in the tab's order. */
export interface PresetLoop {
  kind: "names" | "filters";
  ids: string[];
}

/** The writes that make the server's list the tab's, in order, or the loop that keeps any order from doing it. */
export type PresetWritePlan = { writes: PresetWrite[]; loop: null } | { writes: null; loop: PresetLoop };

/**
 * Orders `changes` so each goes after every change that frees what it takes, or returns a loop of changes that wait on
 * each other, of any size, which no order can send. `frees(other, change)` says whether `other` gives up what `change`
 * takes.
 */
function orderAfterFreers<T>(changes: readonly T[], frees: (other: T, change: T) => boolean): { order: T[] } | { loop: T[] } {
  const order: T[] = [];
  const done = new Set<T>();
  const path: T[] = [];
  function visit(change: T): T[] | null {
    if (done.has(change)) {
      return null;
    }
    const at = path.indexOf(change);
    if (at >= 0) {
      return path.slice(at);
    }
    path.push(change);
    for (const other of changes) {
      if (other !== change && frees(other, change)) {
        const loop = visit(other);
        if (loop) {
          return loop;
        }
      }
    }
    path.pop();
    done.add(change);
    order.push(change);
    return null;
  }
  for (const change of changes) {
    const loop = visit(change);
    if (loop) {
      return { loop };
    }
  }
  return { order };
}

/**
 * Whether the tab reordered its presets: its order differs from the saved one with the tab's deletes taken out and its
 * new presets at the end, as the server would have them once Apply deletes and creates them.
 */
export function presetsReordered(saved: readonly PresetRow[], tab: readonly PresetRow[]): boolean {
  const savedIds = new Set(saved.map((row) => row.id));
  const tabIds = new Set(tab.map((row) => row.id));
  const expected = [...saved.filter((row) => tabIds.has(row.id)), ...tab.filter((row) => !savedIds.has(row.id))];
  return tab.some((row, index) => row.id !== expected[index]!.id);
}

/**
 * The writes that make the server's list, `saved` as the tab last took it, the tab's: deletes, then renames, then filter
 * updates, then new presets, in the tab's order, then one reorder while the order still differs. A rename goes after the
 * rename that gives up its name, ignoring case, and an update after the update that gives up its filter, as the server
 * refuses a name or filter another preset has. Presets that would take each other's names, or filters, in a loop can't
 * be sent in any order: the walk that orders them finds the loop, whatever its size, names first.
 */
export function planPresetWrites(saved: readonly PresetRow[], tab: readonly PresetRow[]): PresetWritePlan {
  const tabById = new Map(tab.map((row) => [row.id, row]));
  const savedById = new Map(saved.map((row) => [row.id, row]));
  const kept = tab.filter((row) => savedById.has(row.id));
  const inTabOrder = (rows: readonly PresetRow[]) => tab.filter((row) => rows.includes(row)).map((row) => row.id);

  const renames = kept.filter((row) => row.name !== savedById.get(row.id)!.name);
  const renameOrder = orderAfterFreers(renames, (other, rename) =>
    namesEqualIgnoringCase(savedById.get(other.id)!.name, rename.name)
  );
  if ("loop" in renameOrder) {
    return { writes: null, loop: { kind: "names", ids: inTabOrder(renameOrder.loop) } };
  }
  const updates = kept.filter((row) => !filterStatesEqualForPresetMatch(row.filterState, savedById.get(row.id)!.filterState));
  const updateOrder = orderAfterFreers(updates, (other, update) =>
    filterStatesEqualForPresetMatch(savedById.get(other.id)!.filterState, update.filterState)
  );
  if ("loop" in updateOrder) {
    return { writes: null, loop: { kind: "filters", ids: inTabOrder(updateOrder.loop) } };
  }

  const writes: PresetWrite[] = [
    ...saved.filter((row) => !tabById.has(row.id)).map((row): PresetWrite => ({ kind: "delete", id: row.id })),
    ...renameOrder.order.map((row): PresetWrite => ({ kind: "rename", id: row.id, name: row.name })),
    ...updateOrder.order.map((row): PresetWrite => ({ kind: "update", id: row.id, filterState: row.filterState })),
    ...tab
      .filter((row) => !savedById.has(row.id))
      .map((row): PresetWrite => ({ kind: "create", id: row.id, name: row.name, filterState: row.filterState }))
  ];
  if (presetsReordered(saved, tab)) {
    writes.push({ kind: "reorder" });
  }
  return { writes, loop: null };
}

/**
 * The tab's list once it takes `server`, a freshly loaded list, while it holds `tab` against `saved`, the list it last
 * took. Each preset the tab kept takes the server's name and filter, except a name or filter the tab changed. The tab's
 * deletes and new presets stay, and a preset another device deleted leaves, with any change the tab made to it. The
 * order is the server's, with the tab's new presets at the end, unless the tab reordered, which keeps the tab's order,
 * with the server's new presets at the end. With no changes in the tab, it is the server's list.
 */
export function mergePresetLists(
  tab: readonly PresetRow[],
  saved: readonly PresetRow[],
  server: readonly PresetRow[]
): PresetRow[] {
  const savedById = new Map(saved.map((row) => [row.id, row]));
  const tabById = new Map(tab.map((row) => [row.id, row]));
  const serverById = new Map(server.map((row) => [row.id, row]));
  const merged = (row: PresetRow): PresetRow => {
    const mine = tabById.get(row.id);
    const was = savedById.get(row.id);
    if (!mine || !was) {
      return row;
    }
    return {
      id: row.id,
      name: mine.name !== was.name ? mine.name : row.name,
      filterState: filterStatesEqualForPresetMatch(mine.filterState, was.filterState) ? row.filterState : mine.filterState
    };
  };
  const added = tab.filter((row) => !savedById.has(row.id));
  if (!presetsReordered(saved, tab)) {
    const deletedHere = (row: PresetRow) => savedById.has(row.id) && !tabById.has(row.id);
    return [...server.filter((row) => !deletedHere(row)).map(merged), ...added];
  }
  const ordered = tab
    .filter((row) => !savedById.has(row.id) || serverById.has(row.id))
    .map((row) => (savedById.has(row.id) ? merged(serverById.get(row.id)!) : row));
  const serverNew = server.filter((row) => !savedById.has(row.id) && !tabById.has(row.id));
  return [...ordered, ...serverNew];
}
