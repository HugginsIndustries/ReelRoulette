import { describe, expect, it } from "vitest";
import { buildEventsUrl, parseEventEnvelope } from "../events/eventEnvelope";
import { buildRefreshStatusMessage } from "../events/refreshStatusProjection";

describe("event helpers", () => {
  it("builds SSE URL with last revision query", () => {
    const url = buildEventsUrl("http://localhost:51301/api/events", 123, {
      clientId: "web-client",
      sessionId: "web-session",
      clientType: "web",
      deviceName: "Web Browser"
    });
    expect(url).toContain("lastEventId=123");
    expect(url).toContain("clientId=web-client");
    expect(url).toContain("sessionId=web-session");
    expect(url).toContain("clientType=web");
    expect(url).toContain("deviceName=Web+Browser");
  });

  it("parses event envelope JSON", () => {
    const envelope = parseEventEnvelope<{ value: number }>(
      JSON.stringify({
        revision: 9,
        eventType: "custom",
        timestamp: "2026-03-05T00:00:00Z",
        payload: { value: 5 }
      })
    );

    expect(envelope.revision).toBe(9);
    expect(envelope.payload.value).toBe(5);
  });

  it("builds refresh status messages", () => {
    const running = buildRefreshStatusMessage({
      isRunning: true,
      trigger: "manual",
      currentStage: "thumbnailGeneration",
      stages: [{ stage: "thumbnailGeneration", percent: 52, message: "generating", isComplete: false }]
    });
    const failed = buildRefreshStatusMessage({
      isRunning: false,
      trigger: "manual",
      lastError: "boom",
      stages: []
    });

    expect(running).toBe("Core refresh: generating (52%)");
    expect(failed).toContain("failed");
  });

  it("builds desktop-parity refresh complete summary from stage messages", () => {
    const line = buildRefreshStatusMessage({
      isRunning: false,
      trigger: "manual",
      completedUtc: "2026-03-29T12:00:00Z",
      stages: [
        { stage: "sourceRefresh", percent: 100, message: "Source refresh (0 added, 0 removed)", isComplete: true },
        { stage: "fingerprintScan", percent: 100, message: "Fingerprint (5 hashed, 10 ready)", isComplete: true },
        {
          stage: "durationScan",
          percent: 100,
          message: "Duration scan (100 files, all cached)",
          isComplete: true
        },
        {
          stage: "loudnessScan",
          percent: 100,
          message: "Loudness scan (50 files, all cached)",
          isComplete: true
        },
        {
          stage: "thumbnailGeneration",
          percent: 100,
          message: "Thumbnails (3 generated, 2 reused)",
          isComplete: true
        }
      ]
    });

    expect(line).toContain("Core refresh complete | Source:");
    expect(line).toContain("no changes");
    expect(line).toContain("Fingerprint: hashed 5, ready 10");
    expect(line).toContain("Duration: files 100, all cached");
    expect(line).toContain("Loudness: files 50, all cached");
    expect(line).toContain("Thumbnails: generated 3, reused 2");
  });

  it("uses initializing when running with empty currentStage", () => {
    const line = buildRefreshStatusMessage({
      isRunning: true,
      trigger: "manual",
      currentStage: null,
      stages: []
    });
    expect(line).toBe("Core refresh: initializing (0%)");
  });
});
