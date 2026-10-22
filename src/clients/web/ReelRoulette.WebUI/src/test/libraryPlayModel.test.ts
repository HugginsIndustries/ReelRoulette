import { describe, expect, it } from "vitest";
import { HttpStatusError } from "../api/serverRequest";
import { playRefusalFailure } from "../library/libraryPlayModel";

describe("libraryPlayModel", () => {
  it("maps 404 to media-not-found message", () => {
    expect(playRefusalFailure(new HttpStatusError(404, "Item not found", "play_item_not_found"), "video")).toEqual({
      text: "Media not found. The file may have moved or been deleted.",
      logText: "Playback failed (HTTP 404)."
    });
  });

  it("maps 409 to unavailable message", () => {
    expect(playRefusalFailure(new HttpStatusError(409, "Source is disabled for this item", "play_source_disabled"), "video").text).toBe(
      "This item is unavailable."
    );
  });

  it("maps 415 to unsupported message", () => {
    expect(playRefusalFailure(new HttpStatusError(415, "Unsupported media type", "play_unsupported_media"), "video").text).toBe(
      "This file type is not supported."
    );
  });

  it("maps 503 play_media_unreadable to the couldn't-load message for the item's media type", () => {
    const unreadable = new HttpStatusError(503, "Media can't be read", "play_media_unreadable");
    expect(playRefusalFailure(unreadable, "video")).toEqual({
      text: "This video couldn't load. The server may be waiting on a slow or disconnected drive or share.",
      logText: "Playback failed (HTTP 503)."
    });
    expect(playRefusalFailure(unreadable, "photo").text).toBe(
      "This photo couldn't load. The server may be waiting on a slow or disconnected drive or share."
    );
  });

  it("gives the server's reason for another refusal, after what failed, and keeps the status for the log", () => {
    expect(playRefusalFailure(new HttpStatusError(503, "The library is missing.", "library_missing"), "video")).toEqual({
      text: "Playback failed: The library is missing.",
      logText: "Playback failed (HTTP 503)."
    });
    expect(playRefusalFailure(new HttpStatusError(500, "Server exploded"), "video").text).toBe("Playback failed: Server exploded");
  });

  it("says only that playback failed when the server gave no reason", () => {
    expect(playRefusalFailure(new HttpStatusError(500), "video")).toEqual({
      text: "Playback failed.",
      logText: "Playback failed (HTTP 500)."
    });
  });
});
