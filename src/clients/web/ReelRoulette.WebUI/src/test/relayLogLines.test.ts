import { describe, expect, it } from "vitest";
import { playbackTraceLine, statusLogLine } from "../logging/relayLogLines";

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
});
