import { compareTagNames } from "../library/tagNameOrder";
import type { AutoTagSaveAssignment } from "../library/tagSave";
import { normalizeTagKey } from "./tagEditorModel";

export const AUTO_TAG_SCANNING = "Scanning…";
export const AUTO_TAG_NO_MATCHES = "Scan complete: no matching tags found.";
export const AUTO_TAG_NO_ROWS = "No rows to show.";
/** The results area's placeholder before any scan. */
export const AUTO_TAG_BEFORE_SCAN = "Scan to find files whose names contain a tag's name.";
/** The results area's placeholder after a scan that found nothing. */
export const AUTO_TAG_NOTHING_FOUND = "No file names contain any tag's name.";

export interface AutoTagFile {
  itemId: string;
  fullPath: string;
  displayPath: string;
  /** The file does not have the tag yet. Only such a file can be selected. */
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

/** What the results area shows: a placeholder before any scan and after one that found nothing, a hint, or rows. */
export type AutoTagResults =
  | { kind: "placeholder"; text: string }
  | { kind: "hint"; text: string }
  | { kind: "rows"; rows: AutoTagRowView[] };

export interface AutoTagRowView {
  row: AutoTagRow;
  files: AutoTagFile[];
  /**
   * The row's box: checked when every file shown is checked, partly when some are. A file that has the tag shows
   * checked, so the box matches the files' boxes.
   */
  checked: boolean;
  indeterminate: boolean;
  /** The row has no file to change, so its box can't change anything. */
  disabled: boolean;
}

/** A file's box shows checked when the file is selected, or already has the tag, which can't be unchecked. */
export function autoTagFileChecked(file: AutoTagFile): boolean {
  return !file.needsChange || file.selected;
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
    return { kind: "placeholder", text: AUTO_TAG_BEFORE_SCAN };
  }
  if (rows.length === 0) {
    return { kind: "placeholder", text: AUTO_TAG_NOTHING_FOUND };
  }
  const visible = visibleAutoTagRows(rows, viewAll);
  if (visible.length === 0) {
    return { kind: "hint", text: AUTO_TAG_NO_ROWS };
  }
  return {
    kind: "rows",
    rows: visible.map((row) => {
      const files = visibleAutoTagFiles(row, viewAll);
      const checked = files.filter(autoTagFileChecked).length;
      return {
        row,
        files,
        checked: checked > 0 && checked === files.length,
        indeterminate: checked > 0 && checked < files.length,
        disabled: !row.files.some((file) => file.needsChange)
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
 * their tag keeps "Scanning…" (recorded in WebUI Notifications).
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

/** Apply has work while a file is selected, which only a file without the tag can be. */
export function autoTagApplyPending(rows: readonly AutoTagRow[], hasRun: boolean): boolean {
  return hasRun && rows.some((row) => row.files.some((file) => file.needsChange && file.selected));
}

/** Each row's selected files, in scan order. A file that already has the tag is never sent. */
export function autoTagAssignments(rows: readonly AutoTagRow[]): AutoTagSaveAssignment[] {
  const assignments: AutoTagSaveAssignment[] = [];
  for (const row of rows) {
    const chosen = row.files.filter((file) => file.needsChange && file.selected && file.fullPath && file.itemId);
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

/** Selects or clears every file without its tag, which every row shows. */
export function selectAllAutoTagFiles(rows: readonly AutoTagRow[], selected: boolean): AutoTagRow[] {
  return rows.map((row) => selectRowFiles(row, selected));
}

/** Selects or clears a row's files without the tag. */
export function selectRowFiles(row: AutoTagRow, selected: boolean): AutoTagRow {
  return { ...row, files: row.files.map((file) => (file.needsChange ? { ...file, selected } : file)) };
}

/** Selects or clears the first file of a row with that item id. A file that has the tag stays as it is. */
export function selectFile(row: AutoTagRow, itemId: string, selected: boolean): AutoTagRow {
  const index = row.files.findIndex((file) => file.itemId === itemId);
  if (index < 0 || !row.files[index]!.needsChange) {
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

/**
 * The rows once Apply has sent the selected files: each now has its tag, unselected, and its row has that many fewer
 * to change. Rows left with no file shown collapse.
 */
export function autoTagRowsAfterApply(rows: readonly AutoTagRow[], viewAll: boolean): AutoTagRow[] {
  const applied = rows.map((row) => {
    const count = row.files.filter((file) => file.needsChange && file.selected).length;
    if (count === 0) {
      return row;
    }
    return {
      ...row,
      wouldChangeCount: Math.max(0, (row.wouldChangeCount || 0) - count),
      files: row.files.map((file) => (file.needsChange && file.selected ? { ...file, needsChange: false, selected: false } : file))
    };
  });
  return collapseEmptyAutoTagRows(applied, viewAll);
}

/**
 * The rows once the server refuses an Apply sent from `sent`, the rows as they were then: each file it sent needs its
 * tag again, selected, and its row counts it again. Anything else changed since, such as a row expanded, stays.
 */
export function autoTagRowsAfterRefusal(rows: readonly AutoTagRow[], sent: readonly AutoTagRow[]): AutoTagRow[] {
  return rows.map((row) => {
    const sentRow = sent.find((candidate) => candidate.rowId === row.rowId);
    const sentIds = new Set(sentRow?.files.filter((file) => file.needsChange && file.selected).map((file) => file.itemId));
    const refused = (file: AutoTagFile) => !file.needsChange && sentIds.has(file.itemId);
    const count = row.files.filter(refused).length;
    if (count === 0) {
      return row;
    }
    return {
      ...row,
      wouldChangeCount: (row.wouldChangeCount || 0) + count,
      files: row.files.map((file) => (refused(file) ? { ...file, needsChange: true, selected: true } : file))
    };
  });
}

/**
 * Whether a tag of the scan's rows is no longer in the catalog, by name ignoring case, as after another client renames
 * or deletes it, so Apply would create it again.
 */
export function autoTagRowsLeftCatalog(rows: readonly AutoTagRow[], catalogTags: readonly unknown[]): boolean {
  const catalog = new Set(catalogTags.map(normalizeTagKey));
  return rows.some((row) => !catalog.has(normalizeTagKey(row.tagName)));
}
