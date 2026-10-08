import { describe, expect, it } from "vitest";
import {
  AUTO_TAG_NO_MATCHES,
  AUTO_TAG_NO_ROWS,
  autoTagApplyPending,
  autoTagAssignments,
  autoTagResults,
  autoTagRowsFromScan,
  autoTagStatusAfterChange,
  autoTagSummary,
  collapseEmptyAutoTagRows,
  selectFile,
  selectRowFiles,
  selectVisibleAutoTagFiles,
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
  it("shows nothing before a scan, a hint for no matches or no rows, and otherwise each row with its box", () => {
    expect(autoTagResults(rows(), false, false)).toEqual({ kind: "none" });
    expect(autoTagResults([], false, true)).toEqual({ kind: "hint", text: AUTO_TAG_NO_MATCHES });
    expect(autoTagResults([byName(rows(), "Alps")], false, true)).toEqual({ kind: "hint", text: AUTO_TAG_NO_ROWS });

    const list = select(rows(), "beach", "b1");
    const shown = autoTagResults(list, false, true);
    if (shown.kind !== "rows") {
      throw new Error("Expected rows.");
    }
    expect(shown.rows.map((entry) => [entry.row.tagName, entry.files.length, entry.checked, entry.indeterminate])).toEqual([
      ["beach", 2, false, true],
      ["Sunset", 1, false, false]
    ]);
    const all = autoTagResults(select(list, "beach", "b2"), false, true);
    expect(all.kind === "rows" && all.rows[0]!.checked).toBe(true);
  });

  it("counts only selected files that would change, among the files shown", () => {
    let list = select(rows(), "Sunset", "s1");
    list = select(list, "Sunset", "s2");
    expect(autoTagSummary(list, false)).toBe("Scan complete: 3 matching tags, 5 matches, 1/3 selected changes.");
    expect(autoTagSummary(list, true)).toBe("Scan complete: 3 matching tags, 5 matches, 1/3 selected changes.");
    expect(autoTagSummary([], false)).toBe(AUTO_TAG_NO_MATCHES);
  });

  it("updates the status except before a scan and while no row shows", () => {
    expect(autoTagStatusAfterChange(rows(), false, false, "")).toBe("");
    expect(autoTagStatusAfterChange([], false, true, "Scanning…")).toBe(AUTO_TAG_NO_MATCHES);
    expect(autoTagStatusAfterChange([byName(rows(), "Alps")], false, true, "Scanning…")).toBe("Scanning…");
    expect(autoTagStatusAfterChange([byName(rows(), "Alps")], true, true, "Scanning…")).toBe(
      "Scan complete: 1 matching tags, 1 matches, 0/0 selected changes."
    );
  });
});

describe("selection and save", () => {
  it("has work to save only while a selected file shown would change", () => {
    expect(autoTagApplyPending(select(rows(), "Alps", "a1"), true, true)).toBe(false);
    expect(autoTagApplyPending(select(rows(), "beach", "b1"), false, true)).toBe(true);
    expect(autoTagApplyPending(select(rows(), "beach", "b1"), false, false)).toBe(false);
    expect(autoTagApplyPending(select(rows(), "Sunset", "s2"), false, true)).toBe(false);
  });

  it("assigns each row's selected files shown, in scan order, with files that have the tag only under View all", () => {
    let list = select(rows(), "beach", "b2");
    list = select(list, "Sunset", "s2");
    list = select(list, "Sunset", "s1");
    expect(autoTagAssignments(list, false)).toEqual([
      { tagName: "Sunset", itemPaths: ["C:\\sunset 1.mp4"], itemIds: ["s1"] },
      { tagName: "beach", itemPaths: ["C:\\beach 2.mp4"], itemIds: ["b2"] }
    ]);
    expect(autoTagAssignments(list, true)[0]).toEqual({
      tagName: "Sunset",
      itemPaths: ["C:\\sunset 1.mp4", "C:\\sunset 2.mp4"],
      itemIds: ["s1", "s2"]
    });
  });

  it("selects and clears only the files and rows shown", () => {
    const all = selectVisibleAutoTagFiles(rows(), false, true);
    expect(byName(all, "Sunset").files.map((file) => file.selected)).toEqual([true, false]);
    expect(byName(all, "Alps").files[0]!.selected).toBe(false);
    expect(byName(selectVisibleAutoTagFiles(all, false, false), "beach").files.some((file) => file.selected)).toBe(false);

    const row = selectRowFiles(byName(rows(), "Sunset"), true, true);
    expect(row.files.map((file) => file.selected)).toEqual([true, true]);
    expect(selectFile(row, "missing", false)).toBe(row);
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
