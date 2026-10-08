import { compareTagNames } from "../library/tagNameOrder";
import type { AutoTagSaveAssignment } from "../library/tagSave";

export const AUTO_TAG_SCANNING = "Scanning…";
export const AUTO_TAG_NO_MATCHES = "Scan complete: no matching tags found.";
export const AUTO_TAG_NO_ROWS = "No rows to show.";

export interface AutoTagFile {
  itemId: string;
  fullPath: string;
  displayPath: string;
  /** The file does not have the tag yet. */
  needsChange: boolean;
  selected: boolean;
}

/** One tag the scan matched, with the files whose names match it. */
export interface AutoTagRow {
  rowId: number;
  tagName: string;
  totalMatchedCount: number;
  wouldChangeCount: number;
  expanded: boolean;
  files: AutoTagFile[];
}

/** What the results area shows. */
export type AutoTagResults =
  | { kind: "none" }
  | { kind: "hint"; text: string }
  | { kind: "rows"; rows: AutoTagRowView[] };

export interface AutoTagRowView {
  row: AutoTagRow;
  files: AutoTagFile[];
  /** The row's box: checked when all its files shown are selected, partly when some are. */
  checked: boolean;
  indeterminate: boolean;
}

/** The scan's rows, unselected and collapsed. A tag with no files is left out. */
export function autoTagRowsFromScan(response: unknown): AutoTagRow[] {
  const rowsIn = (response as { rows?: unknown } | null)?.rows;
  const rows: AutoTagRow[] = [];
  for (const row of Array.isArray(rowsIn) ? rowsIn : []) {
    const files = Array.isArray(row?.files) ? row.files : [];
    if (files.length === 0) {
      continue;
    }
    rows.push({
      rowId: rows.length,
      tagName: row.tagName,
      totalMatchedCount: row.totalMatchedCount,
      wouldChangeCount: row.wouldChangeCount,
      expanded: false,
      files: files.map((file: Partial<AutoTagFile>) => ({
        itemId: file.itemId!,
        fullPath: file.fullPath!,
        displayPath: file.displayPath!,
        needsChange: !!file.needsChange,
        selected: false
      }))
    });
  }
  return rows;
}

/** The files a row shows: those without the tag, or all of them with View all matches. */
export function visibleAutoTagFiles(row: AutoTagRow, viewAll: boolean): AutoTagFile[] {
  return row.files.filter((file) => viewAll || file.needsChange);
}

/** The rows shown, by tag name: those with files to change, or all of them with View all matches. */
export function visibleAutoTagRows(rows: readonly AutoTagRow[], viewAll: boolean): AutoTagRow[] {
  return rows
    .filter((row) => viewAll || (row.wouldChangeCount || 0) > 0)
    .sort((a, b) => compareTagNames(a.tagName, b.tagName));
}

export function autoTagResults(rows: readonly AutoTagRow[], viewAll: boolean, hasRun: boolean): AutoTagResults {
  if (!hasRun) {
    return { kind: "none" };
  }
  if (rows.length === 0) {
    return { kind: "hint", text: AUTO_TAG_NO_MATCHES };
  }
  const visible = visibleAutoTagRows(rows, viewAll);
  if (visible.length === 0) {
    return { kind: "hint", text: AUTO_TAG_NO_ROWS };
  }
  return {
    kind: "rows",
    rows: visible.map((row) => {
      const files = visibleAutoTagFiles(row, viewAll);
      const selected = files.filter((file) => file.selected).length;
      return {
        row,
        files,
        checked: selected > 0 && selected === files.length,
        indeterminate: selected > 0 && selected < files.length
      };
    })
  };
}

/** Counts only selected files that would change, among the files shown. */
export function autoTagSummary(rows: readonly AutoTagRow[], viewAll: boolean): string {
  if (rows.length === 0) {
    return AUTO_TAG_NO_MATCHES;
  }
  let totalMatches = 0;
  let totalWouldChange = 0;
  let selectedChanges = 0;
  for (const row of rows) {
    totalMatches += row.totalMatchedCount || 0;
    totalWouldChange += row.wouldChangeCount || 0;
    selectedChanges += visibleAutoTagFiles(row, viewAll).filter((file) => file.needsChange && file.selected).length;
  }
  return `Scan complete: ${rows.length} matching tags, ${totalMatches} matches, ${selectedChanges}/${totalWouldChange} selected changes.`;
}

/**
 * The status after the results change. It is left as it was while no row shows, so a scan whose matches all have
 * their tag keeps "Scanning…" (recorded in WebUI Status Line Overhaul).
 */
export function autoTagStatusAfterChange(rows: readonly AutoTagRow[], viewAll: boolean, hasRun: boolean, previous: string): string {
  if (!hasRun) {
    return previous;
  }
  if (rows.length > 0 && visibleAutoTagRows(rows, viewAll).length === 0) {
    return previous;
  }
  return autoTagSummary(rows, viewAll);
}

/** Save has Auto Tag work while a selected file shown would change. */
export function autoTagApplyPending(rows: readonly AutoTagRow[], viewAll: boolean, hasRun: boolean): boolean {
  return hasRun && rows.some((row) => visibleAutoTagFiles(row, viewAll).some((file) => file.needsChange && file.selected));
}

/** Each row's selected files shown, in scan order. With View all matches, files that have the tag are sent too. */
export function autoTagAssignments(rows: readonly AutoTagRow[], viewAll: boolean): AutoTagSaveAssignment[] {
  const assignments: AutoTagSaveAssignment[] = [];
  for (const row of rows) {
    const chosen = visibleAutoTagFiles(row, viewAll).filter((file) => file.selected && file.fullPath && file.itemId);
    if (chosen.length > 0) {
      assignments.push({
        tagName: String(row.tagName || ""),
        itemPaths: chosen.map((file) => String(file.fullPath)),
        itemIds: chosen.map((file) => String(file.itemId))
      });
    }
  }
  return assignments;
}

/** Selects or clears every file shown in the rows shown. */
export function selectVisibleAutoTagFiles(rows: readonly AutoTagRow[], viewAll: boolean, selected: boolean): AutoTagRow[] {
  const shown = new Set(visibleAutoTagRows(rows, viewAll).map((row) => row.rowId));
  return rows.map((row) => (shown.has(row.rowId) ? selectRowFiles(row, viewAll, selected) : row));
}

/** Selects or clears the files a row shows. */
export function selectRowFiles(row: AutoTagRow, viewAll: boolean, selected: boolean): AutoTagRow {
  const visible = new Set(visibleAutoTagFiles(row, viewAll));
  return { ...row, files: row.files.map((file) => (visible.has(file) ? { ...file, selected } : file)) };
}

/** Selects or clears the first file of a row with that item id. */
export function selectFile(row: AutoTagRow, itemId: string, selected: boolean): AutoTagRow {
  const index = row.files.findIndex((file) => file.itemId === itemId);
  if (index < 0) {
    return row;
  }
  const files = row.files.slice();
  files[index] = { ...files[index]!, selected };
  return { ...row, files };
}

/** Collapses the rows that show no files. */
export function collapseEmptyAutoTagRows(rows: readonly AutoTagRow[], viewAll: boolean): AutoTagRow[] {
  return rows.map((row) => (row.expanded && visibleAutoTagFiles(row, viewAll).length === 0 ? { ...row, expanded: false } : row));
}
