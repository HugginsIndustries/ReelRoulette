import { describe, expect, it } from "vitest";
import { HttpStatusError } from "../api/serverRequest";
import { failureLine, playbackTraceLine, screenErrorLine, statusLogLine } from "../logging/relayLogLines";

const itemPath = "/mnt/nas/multimedia/TV/Show/102 Reef Blower.avi";
const mediaUrl = "/api/media/tok-3f9a2c71";
const current = { id: itemPath, displayName: "102 Reef Blower.avi", mediaUrl };

function expectNoItemDetails(line: string): void {
  expect(line).not.toContain("/mnt");
  expect(line).not.toContain("Reef Blower");
  expect(line).not.toContain("/api/media");
  expect(line).not.toContain("tok-3f9a2c71");
}

describe("relayLogLines", () => {
  it("leaves the current item out of status lines and keeps the attempt id", () => {
    const line = statusLogLine("SSE connected", current, 7);

    expectNoItemDetails(line);
    expect(line).toBe("status=SSE connected hasCurrent=true attempt=7");
  });

  it("says when there is no current item", () => {
    expect(statusLogLine("Ready", null, 0)).toBe("status=Ready hasCurrent=false attempt=0");
  });

  it("leaves item ids and media URLs out of playback lines and keeps safe context", () => {
    const line = playbackTraceLine("library-play-failed", current, 3, {
      libraryItemId: itemPath,
      expectedItemId: itemPath,
      mediaId: itemPath,
      mediaUrl,
      mediaType: "video",
      statusCode: 404,
      code: "play_media_missing",
      expectedPlayAttemptId: 3
    });

    expectNoItemDetails(line);
    expect(line).toBe(
      "playback=library-play-failed attempt=3 hasCurrent=true mediaType=video statusCode=404 code=play_media_missing expectedPlayAttemptId=3"
    );
  });

  it("keeps how long a timed-out random pick waited", () => {
    expect(playbackTraceLine("random-pick-timeout", current, 4, { timeoutMs: 10000 })).toBe(
      "playback=random-pick-timeout attempt=4 hasCurrent=true timeoutMs=10000"
    );
  });

  it("keeps why a file's media failed and an error's type", () => {
    const line = playbackTraceLine("media-probe", current, 5, { mediaType: "photo", statusCode: 404, failure: "missing", mediaUrl });
    expectNoItemDetails(line);
    expect(line).toBe("playback=media-probe attempt=5 hasCurrent=true mediaType=photo statusCode=404 failure=missing");
    expect(playbackTraceLine("step-play-failed", current, 6, { error: "ServerUnreachableError" })).toBe(
      "playback=step-play-failed attempt=6 hasCurrent=true error=ServerUnreachableError"
    );
  });

  it("names the screen and the error type, and never the error message", () => {
    const line = screenErrorLine("header", new TypeError(`Cannot read ${itemPath}`));

    expectNoItemDetails(line);
    expect(line).toBe("ui-error screen=header error=TypeError");
    expect(screenErrorLine("status", "thrown text")).toBe("ui-error screen=status error=string");
  });

  it("names a failed request's status or error type after its line, and never the error message", () => {
    expect(failureLine("filter=event-load-failed", new HttpStatusError(503, `Tag "Reef Blower" is missing`))).toBe("filter=event-load-failed status=503");
    const line = failureLine("tags=event-load-failed", new TypeError(`Cannot read ${itemPath}`));

    expectNoItemDetails(line);
    expect(line).toBe("tags=event-load-failed error=TypeError");
    expect(failureLine("library=selection-check-failed", "thrown text")).toBe("library=selection-check-failed error=string");
  });
});
