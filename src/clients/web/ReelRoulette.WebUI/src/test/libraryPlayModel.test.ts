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
      })
    ).toBe("Media not found. The file may have moved or been deleted.");
  });

  it("maps 409 to unavailable message", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 409,
        error: "Source is disabled for this item",
        code: "play_source_disabled"
      })
    ).toBe("This item is unavailable.");
  });

  it("maps 415 to unsupported message", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 415,
        error: "Unsupported media type",
        code: "play_unsupported_media"
      })
    ).toBe("This file type is not supported.");
  });

  it("maps 401 to pairing message", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 401,
        error: "Unauthorized"
      })
    ).toBe("Unauthorized. Pair first.");
  });

  it("falls back to server error text", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 500,
        error: "Server exploded"
      })
    ).toBe("Server exploded");
  });

  it("falls back to generic message when error is blank", () => {
    expect(
      mapPlayItemErrorToStatus({
        ok: false,
        statusCode: 500
      })
    ).toBe("Playback failed.");
  });
});
