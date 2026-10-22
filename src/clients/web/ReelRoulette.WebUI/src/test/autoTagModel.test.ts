import { describe, expect, it } from "vitest";
import {
  AUTO_TAG_BEFORE_SCAN,
  AUTO_TAG_NO_MATCHES,
  AUTO_TAG_NO_ROWS,
  AUTO_TAG_NOTHING_FOUND,
  autoTagApplyPending,
  autoTagAssignments,
  autoTagFileChecked,
  autoTagResults,
  autoTagRowsAfterApply,
  autoTagRowsAfterRefusal,
  autoTagRowsFromScan,
  autoTagRowsLeftCatalog,
  autoTagStatusAfterChange,
  autoTagSummary,
  collapseEmptyAutoTagRows,
  selectAllAutoTagFiles,
  selectFile,
  selectRowFiles,
  visibleAutoTagRows,
  type AutoTagRow
} from "../tags/autoTagModel";

const SCAN = {
  rows: [
    {
      tagName: "Sunset",
      totalMatchedCount: 2,
      wouldChangeCount: 1,
      files: [
        { itemId: "s1", fullPath: "C:\\sunset 1.mp4", displayPath: "sunset 1.mp4", needsChange: true },
        { itemId: "s2", fullPath: "C:\\sunset 2.mp4", displayPath: "sunset 2.mp4", needsChange: false }
      ]
    },
    { tagName: "Empty", totalMatchedCount: 0, wouldChangeCount: 0, files: [] },
    {
      tagName: "beach",
      totalMatchedCount: 2,
      wouldChangeCount: 2,
      files: [
        { itemId: "b1", fullPath: "C:\\beach 1.mp4", displayPath: "beach 1.mp4", needsChange: true },
        { itemId: "b2", fullPath: "C:\\beach 2.mp4", displayPath: "beach 2.mp4", needsChange: true }
      ]
    },
    {
      tagName: "Alps",
      totalMatchedCount: 1,
      wouldChangeCount: 0,
      files: [{ itemId: "a1", fullPath: "C:\\alps.mp4", displayPath: "alps.mp4", needsChange: false }]
    }
  ]
};

function rows(): AutoTagRow[] {
  return autoTagRowsFromScan(SCAN);
}

function byName(list: readonly AutoTagRow[], name: string): AutoTagRow {
  return list.find((row) => row.tagName === name)!;
}

function select(list: AutoTagRow[], name: string, itemId: string): AutoTagRow[] {
  return list.map((row) => (row.tagName === name ? selectFile(row, itemId, true) : row));
}

describe("scan rows", () => {
  it("keeps tags with files, unselected and collapsed, numbered in scan order", () => {
    const list = rows();
    expect(list.map((row) => [row.rowId, row.tagName, row.expanded])).toEqual([
      [0, "Sunset", false],
      [1, "beach", false],
      [2, "Alps", false]
    ]);
    expect(list.flatMap((row) => row.files).every((file) => !file.selected)).toBe(true);
    expect(autoTagRowsFromScan(null)).toEqual([]);
  });

  it("shows the tags with files to change by name, or all of them with View all matches", () => {
    expect(visibleAutoTagRows(rows(), false).map((row) => row.tagName)).toEqual(["beach", "Sunset"]);
    expect(visibleAutoTagRows(rows(), true).map((row) => row.tagName)).toEqual(["Alps", "beach", "Sunset"]);
  });
});

describe("results and status", () => {
  it("shows a placeholder before a scan and another after one that found nothing, a hint for no rows, and otherwise each row with its box", () => {
    expect(autoTagResults(rows(), false, false)).toEqual({ kind: "placeholder", text: AUTO_TAG_BEFORE_SCAN });
    expect(AUTO_TAG_BEFORE_SCAN).toBe("Scan to find files whose names contain a tag's name.");
    expect(autoTagResults([], false, true)).toEqual({ kind: "placeholder", text: AUTO_TAG_NOTHING_FOUND });
    expect(AUTO_TAG_NOTHING_FOUND).toBe("No file names contain any tag's name.");
    expect(autoTagResults([byName(rows(), "Alps")], false, true)).toEqual({ kind: "hint", text: AUTO_TAG_NO_ROWS });

    const list = select(rows(), "beach", "b1");
    const shown = autoTagResults(list, false, true);
    if (shown.kind !== "rows") {
      throw new Error("Expected rows.");
    }
    expect(shown.rows.map((entry) => [entry.row.tagName, entry.files.length, entry.checked, entry.indeterminate, entry.disabled])).toEqual([
      ["beach", 2, false, true, false],
      ["Sunset", 1, false, false, false]
    ]);
    const all = autoTagResults(select(list, "beach", "b2"), false, true);
    expect(all.kind === "rows" && all.rows[0]!.checked).toBe(true);
  });

  it("with View all matches, counts a file that has the tag as checked, and turns off a row with nothing to change", () => {
    const shown = autoTagResults(rows(), true, true);
    if (shown.kind !== "rows") {
      throw new Error("Expected rows.");
    }
    expect(shown.rows.map((entry) => [entry.row.tagName, entry.checked, entry.indeterminate, entry.disabled])).toEqual([
      ["Alps", true, false, true],
      ["beach", false, false, false],
      ["Sunset", false, true, false]
    ]);
    const sunset = byName(rows(), "Sunset");
    expect(sunset.files.map(autoTagFileChecked)).toEqual([false, true]);
  });

  it("counts only selected files that would change, among the files shown", () => {
    let list = select(rows(), "Sunset", "s1");
    list = select(list, "Sunset", "s2");
    expect(autoTagSummary(list, false)).toBe("Scan complete: 3 matching tags, 5 matches, 1/3 selected changes.");
    expect(autoTagSummary(list, true)).toBe("Scan complete: 3 matching tags, 5 matches, 1/3 selected changes.");
    expect(autoTagSummary([], false)).toBe(AUTO_TAG_NO_MATCHES);
  });

  it("updates the status except before a scan, keeping a failed scan's error, and while no row shows", () => {
    const summary = "Scan complete: 1 matching tags, 1 matches, 0/0 selected changes.";
    expect(autoTagStatusAfterChange(rows(), false, false, "")).toBe("");
    expect(autoTagStatusAfterChange([], false, false, "Scan failed.")).toBe("Scan failed.");
    expect(autoTagStatusAfterChange([], false, true, summary)).toBe(AUTO_TAG_NO_MATCHES);
    expect(autoTagStatusAfterChange([byName(rows(), "Alps")], false, true, summary)).toBe(summary);
    expect(autoTagStatusAfterChange([byName(rows(), "Alps")], true, true, "")).toBe(summary);
  });
});

describe("selection and save", () => {
  it("has work to apply only while a file is selected, which only a file without the tag can be", () => {
    expect(autoTagApplyPending(select(rows(), "Alps", "a1"), true)).toBe(false);
    expect(autoTagApplyPending(select(rows(), "beach", "b1"), true)).toBe(true);
    expect(autoTagApplyPending(select(rows(), "beach", "b1"), false)).toBe(false);
    expect(autoTagApplyPending(select(rows(), "Sunset", "s2"), true)).toBe(false);
  });

  it("assigns each row's selected files in scan order, and never a file that has the tag", () => {
    let list = select(rows(), "beach", "b2");
    list = select(list, "Sunset", "s2");
    list = select(list, "Sunset", "s1");
    expect(autoTagAssignments(list)).toEqual([
      { tagName: "Sunset", itemPaths: ["C:\\sunset 1.mp4"], itemIds: ["s1"] },
      { tagName: "beach", itemPaths: ["C:\\beach 2.mp4"], itemIds: ["b2"] }
    ]);
  });

  it("selects and clears every file without its tag, in every row, and leaves a file that has it", () => {
    const all = selectAllAutoTagFiles(rows(), true);
    expect(byName(all, "Sunset").files.map((file) => file.selected)).toEqual([true, false]);
    expect(byName(all, "beach").files.map((file) => file.selected)).toEqual([true, true]);
    expect(byName(all, "Alps").files[0]!.selected).toBe(false);
    expect(byName(selectAllAutoTagFiles(all, false), "beach").files.some((file) => file.selected)).toBe(false);

    const row = selectRowFiles(byName(rows(), "Sunset"), true);
    expect(row.files.map((file) => file.selected)).toEqual([true, false]);
    expect(selectFile(row, "s2", true)).toBe(row);
    expect(selectFile(row, "missing", false)).toBe(row);
  });

  it("after Apply, shows the selected files as having their tag, unselected, with fewer to change", () => {
    let list = select(rows(), "beach", "b1");
    list = select(list, "Sunset", "s1").map((row) => ({ ...row, expanded: true }));
    const applied = autoTagRowsAfterApply(list, false);
    expect(byName(applied, "beach").files.map((file) => [file.needsChange, file.selected])).toEqual([
      [false, false],
      [true, false]
    ]);
    expect(byName(applied, "beach").wouldChangeCount).toBe(1);
    expect(byName(applied, "beach").expanded).toBe(true);
    // Sunset has nothing left to change, so it shows nothing without View all and collapses.
    expect(byName(applied, "Sunset")).toMatchObject({ wouldChangeCount: 0, expanded: false });
    expect(autoTagApplyPending(applied, true)).toBe(false);
    expect(byName(autoTagRowsAfterApply(list, true), "Sunset").expanded).toBe(true);
  });

  it("after a refused Apply, shows the files it sent as needing their tag again, selected, keeping later changes", () => {
    let list = select(rows(), "beach", "b1");
    list = select(list, "Sunset", "s1");
    // Sunset collapsed after Apply, and the user expanded it again before the server refused.
    const changed = autoTagRowsAfterApply(list, false).map((row) => (row.tagName === "Sunset" ? { ...row, expanded: true } : row));
    const refused = autoTagRowsAfterRefusal(changed, list);
    expect(byName(refused, "beach").files.map((file) => [file.needsChange, file.selected])).toEqual([
      [true, true],
      [true, false]
    ]);
    expect(byName(refused, "beach").wouldChangeCount).toBe(2);
    expect(byName(refused, "Sunset")).toMatchObject({ wouldChangeCount: 1, expanded: true });
    expect(autoTagApplyPending(refused, true)).toBe(true);
    expect(autoTagRowsAfterRefusal(list, list)).toEqual(list);
  });

  it("finds a scan's tag no longer in the catalog, by name ignoring case", () => {
    expect(autoTagRowsLeftCatalog(rows(), ["sunset", "Beach", "alps", "Bob"])).toBe(false);
    expect(autoTagRowsLeftCatalog(rows(), ["Sunset", "beach"])).toBe(true);
    expect(autoTagRowsLeftCatalog([], [])).toBe(false);
  });

  it("collapses rows that show no files", () => {
    const expanded = rows().map((row) => ({ ...row, expanded: true }));
    expect(collapseEmptyAutoTagRows(expanded, false).map((row) => [row.tagName, row.expanded])).toEqual([
      ["Sunset", true],
      ["beach", true],
      ["Alps", false]
    ]);
  });
});
