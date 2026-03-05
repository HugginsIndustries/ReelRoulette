import { describe, expect, it } from "vitest";
import { buildEventsUrl, parseEventEnvelope } from "../events/eventEnvelope";
import { buildRefreshStatusMessage } from "../events/refreshStatusProjection";

describe("event helpers", () => {
  it("builds SSE URL with last revision query", () => {
    const url = buildEventsUrl("http://localhost:51301/api/events", 123);
    expect(url).toContain("lastEventId=123");
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
      currentStage: "thumbnailGeneration",
      stages: [{ stage: "thumbnailGeneration", percent: 52, message: "generating", isComplete: false }]
    });
    const failed = buildRefreshStatusMessage({
      isRunning: false,
      lastError: "boom",
      stages: []
    });

    expect(running).toContain("52%");
    expect(failed).toContain("failed");
  });
});
