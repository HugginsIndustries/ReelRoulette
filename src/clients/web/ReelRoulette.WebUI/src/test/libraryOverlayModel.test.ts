import { describe, expect, it } from "vitest";
import {
  beginLibraryOverlayOpen,
  closeLibraryOverlayState,
  completeLibraryOverlayFetch,
  createLibraryOverlayState,
  failLibraryOverlayFetch,
  parseLibraryProjectionSummary,
  renderLibraryBrowseHtml,
  renderLibraryOverlayBodyHtml
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

  it("transitions open → ready/empty/error and close clears cached summary", () => {
    let overlayState = createLibraryOverlayState();
    overlayState = beginLibraryOverlayOpen(overlayState);
    expect(overlayState.phase).toBe("loading");
    expect(overlayState.fetchCount).toBe(1);
    expect(overlayState.summary).toBeNull();

    const summary = parseLibraryProjectionSummary({
      sources: [{ id: "s1" }],
      items: [{ sourceId: "s1" }]
    });
    overlayState = completeLibraryOverlayFetch(overlayState, summary);
    expect(overlayState.phase).toBe("ready");
    expect(overlayState.summary?.totalItems).toBe(1);

    overlayState = closeLibraryOverlayState(overlayState);
    expect(overlayState.phase).toBe("closed");
    expect(overlayState.summary).toBeNull();
  });

  it("sets empty phase when enabled sources have no items", () => {
    let overlayState = beginLibraryOverlayOpen(createLibraryOverlayState());
    const summary = parseLibraryProjectionSummary({
      sources: [{ id: "s1" }],
      items: []
    });
    overlayState = completeLibraryOverlayFetch(overlayState, summary);
    expect(overlayState.phase).toBe("empty");
  });

  it("records fetch error state", () => {
    let overlayState = beginLibraryOverlayOpen(createLibraryOverlayState());
    overlayState = failLibraryOverlayFetch(overlayState, "HTTP 503");
    expect(overlayState.phase).toBe("error");
    expect(overlayState.lastError).toBe("HTTP 503");
    expect(overlayState.summary).toBeNull();
  });

  it("refetches on each open cycle", () => {
    let overlayState = createLibraryOverlayState();
    overlayState = beginLibraryOverlayOpen(overlayState);
    overlayState = completeLibraryOverlayFetch(
      overlayState,
      parseLibraryProjectionSummary({ sources: [{ id: "s1" }], items: [{ sourceId: "s1" }] })
    );
    overlayState = closeLibraryOverlayState(overlayState);

    overlayState = beginLibraryOverlayOpen(overlayState);
    expect(overlayState.fetchCount).toBe(2);
    expect(overlayState.openCount).toBe(2);
    expect(overlayState.phase).toBe("loading");
    expect(overlayState.summary).toBeNull();
  });

  it("renders loading, empty, error body HTML and browse results", () => {
    expect(renderLibraryOverlayBodyHtml("loading", null, null)).toContain("Loading library");
    expect(renderLibraryOverlayBodyHtml("empty", null, null)).toContain("No media in library");
    expect(renderLibraryOverlayBodyHtml("error", null, "HTTP 500")).toContain("HTTP 500");
    expect(renderLibraryOverlayBodyHtml("ready", { totalItems: 1, enabledSourceCount: 1, hasItems: true }, null)).toBe("");
    expect(
      renderLibraryBrowseHtml({
        summaryLine: "Showing 1 of 1 items",
        visibleItems: [{ fileName: "clip.mp4" }],
        searchQuery: ""
      })
    ).toContain("clip.mp4");
  });
});
