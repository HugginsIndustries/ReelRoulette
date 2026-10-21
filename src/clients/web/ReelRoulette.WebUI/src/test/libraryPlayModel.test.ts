import { describe, expect, it } from "vitest";
import { mapPlayItemErrorToStatus } from "../library/libraryPlayModel";

describe("libraryPlayModel", () => {
  it("maps 404 to media-not-found message", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 404,
        error: "Item not found",
        code: "play_item_not_found"
      }, "video")
    ).toBe("Media not found. The file may have moved or been deleted.");
  });

  it("maps 409 to unavailable message", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 409,
        error: "Source is disabled for this item",
        code: "play_source_disabled"
      }, "video")
    ).toBe("This item is unavailable.");
  });

  it("maps 415 to unsupported message", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 415,
        error: "Unsupported media type",
        code: "play_unsupported_media"
      }, "video")
    ).toBe("This file type is not supported.");
  });

  it("maps 503 play_media_unreadable to the couldn't-load message for the item's media type", () => {
    const unreadable = { ok: false as const, statusCode: 503, error: "Media can't be read", code: "play_media_unreadable" };
    expect(mapPlayItemErrorToStatus(unreadable, "video")).toBe(
      "This video couldn't load. The server may be waiting on a slow or disconnected drive or share."
    );
    expect(mapPlayItemErrorToStatus(unreadable, "photo")).toBe(
      "This photo couldn't load. The server may be waiting on a slow or disconnected drive or share."
    );
  });

  it("keeps the server's text for another 503", () => {
    expect(
      mapPlayItemErrorToStatus({ ok: false, statusCode: 503, error: "The library is missing.", code: "library_missing" }, "video")
    ).toBe("The library is missing.");
  });

  it("falls back to server error text", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 500,
        error: "Server exploded"
      }, "video")
    ).toBe("Server exploded");
  });

  it("falls back to generic message when error is blank", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 500
      }, "video")
    ).toBe("Playback failed.");
  });
});
