import { describe, expect, it } from "vitest";
import {
  LIBRARY_LOAD_TIMEOUT_MESSAGE,
  libraryOverlayMessage,
  parseLibraryProjectionSummary
} from "../library/libraryOverlayModel";

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
    expect(libraryOverlayMessage("error", "Library load failed.", 500)).toEqual({ text: "Library load failed.", error: true, live: false });
    expect(libraryOverlayMessage("error", "Library load failed: Couldn't reach the server.")).toEqual({
      text: "Library load failed: Couldn't reach the server.",
      error: true,
      live: false
    });
    expect(libraryOverlayMessage("error", null).text).toBe("Library load failed.");
  });

  it("says a load answered with 408 or 504 timed out, in place of its status", () => {
    for (const status of [408, 504]) {
      expect(libraryOverlayMessage("error", `HTTP ${status}`, status)).toEqual({ text: LIBRARY_LOAD_TIMEOUT_MESSAGE, error: true, live: false });
    }
    expect(LIBRARY_LOAD_TIMEOUT_MESSAGE).toBe(
      "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."
    );
  });

  it("says nothing for a load answered with 401, whose pairing prompt is the only thing to show", () => {
    expect(libraryOverlayMessage("error", "Unauthorized", 401)).toEqual({ text: "", error: false, live: false });
  });

  it("keeps a failure's text as text", () => {
    expect(libraryOverlayMessage("error", "Library load failed: <b>reason</b>").text).toBe("Library load failed: <b>reason</b>");
  });
});
