import { describe, expect, it } from "vitest";
import { parseLibraryProjectionSummary, renderLibraryOverlayBodyHtml } from "../library/libraryOverlayModel";

describe("libraryOverlayModel", () => {
  it("parses populated projection with enabled-source item counts", () => {
    const summary = parseLibraryProjectionSummary({
      sources: [
        { id: "s1", isEnabled: true },
        { id: "s2", isEnabled: false },
        { id: "s3", isEnabled: true }
      ],
      items: [
        { sourceId: "s1", fullPath: "/a.mp4" },
        { sourceId: "s2", fullPath: "/b.mp4" },
        { sourceId: "s3", fullPath: "/c.jpg" },
        { sourceId: "s1", fullPath: "/d.mp4" }
      ]
    });
    expect(summary.enabledSourceCount).toBe(2);
    expect(summary.totalItems).toBe(3);
    expect(summary.hasItems).toBe(true);
  });

  it("returns empty summary for missing or empty projection fields", () => {
    expect(parseLibraryProjectionSummary(null)).toEqual({
      totalItems: 0,
      enabledSourceCount: 0,
      hasItems: false
    });
    expect(parseLibraryProjectionSummary({ sources: [], items: [] })).toEqual({
      totalItems: 0,
      enabledSourceCount: 0,
      hasItems: false
    });
  });

  it("treats sources with isEnabled omitted as enabled", () => {
    const summary = parseLibraryProjectionSummary({
      sources: [{ id: "s1" }],
      items: [{ sourceId: "s1" }]
    });
    expect(summary.enabledSourceCount).toBe(1);
    expect(summary.totalItems).toBe(1);
  });

  it("renders loading, empty, error body HTML", () => {
    expect(renderLibraryOverlayBodyHtml("loading", null, null)).toContain("Loading library");
    expect(renderLibraryOverlayBodyHtml("empty", null, null)).toContain("No media in library");
    expect(renderLibraryOverlayBodyHtml("error", null, "HTTP 500")).toContain("HTTP 500");
    expect(renderLibraryOverlayBodyHtml("ready", { totalItems: 1, enabledSourceCount: 1, hasItems: true }, null)).toBe("");
  });
});
