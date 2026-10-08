import { describe, expect, it } from "vitest";
import { libraryOverlayMessage, parseLibraryProjectionSummary } from "../library/libraryOverlayModel";

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

  it("describes the loading, empty, and error messages", () => {
    expect(libraryOverlayMessage("loading", null)).toEqual({ text: "Loading library…", error: false, live: true });
    expect(libraryOverlayMessage("empty", "ignored")).toEqual({ text: "No media in library.", error: false, live: false });
    expect(libraryOverlayMessage("error", "HTTP 500")).toEqual({ text: "HTTP 500", error: true, live: false });
    expect(libraryOverlayMessage("error", null).text).toBe("Could not load library.");
  });

  it("keeps an error message as text", () => {
    expect(libraryOverlayMessage("error", "<b>HTTP</b> 500").text).toBe("<b>HTTP</b> 500");
  });
});
