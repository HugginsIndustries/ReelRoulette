import { describe, expect, it } from "vitest";
import { LIBRARY_LOAD_TIMEOUT_MESSAGE, libraryOverlayMessage } from "../library/libraryOverlayModel";

describe("libraryOverlayModel", () => {
  it("describes the loading, empty, and error messages", () => {
    expect(libraryOverlayMessage("loading", null)).toEqual({ text: "Loading library…", error: false });
    expect(libraryOverlayMessage("empty", "ignored")).toEqual({ text: "No media in library.", error: false });
    expect(libraryOverlayMessage("error", "Library load failed.", 500)).toEqual({ text: "Library load failed.", error: true });
    expect(libraryOverlayMessage("error", "Library load failed: Couldn't reach the server.")).toEqual({
      text: "Library load failed: Couldn't reach the server.",
      error: true
    });
    expect(libraryOverlayMessage("error", null).text).toBe("Library load failed.");
  });

  it("says a load answered with 408 or 504 timed out, in place of its status", () => {
    for (const status of [408, 504]) {
      expect(libraryOverlayMessage("error", `HTTP ${status}`, status)).toEqual({ text: LIBRARY_LOAD_TIMEOUT_MESSAGE, error: true });
    }
    expect(LIBRARY_LOAD_TIMEOUT_MESSAGE).toBe(
      "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."
    );
  });

  it("says nothing for a load answered with 401, whose pairing prompt is the only thing to show", () => {
    expect(libraryOverlayMessage("error", "Unauthorized", 401)).toEqual({ text: "", error: false });
  });

  it("keeps a failure's text as text", () => {
    expect(libraryOverlayMessage("error", "Library load failed: <b>reason</b>").text).toBe("Library load failed: <b>reason</b>");
  });
});
