import { describe, expect, it } from "vitest";
import { buildEventsUrl, parseEventEnvelope } from "../events/eventEnvelope";
import {
  coerceRefreshSnapshot,
  newRefreshCompletionRunId,
  settledKeptSources,
  refreshOutcome,
  refreshProgress
} from "../events/refreshStatusProjection";

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

  it("tells a failed refresh, with its error, from a run that ended without finishing", () => {
    const failed = refreshOutcome({
      isRunning: false,
      trigger: "manual",
      lastError: "boom",
      completedUtc: "2026-03-29T12:00:00Z",
      stages: []
    });

    expect(failed).toEqual({ result: "failed", error: "boom" });
    expect(refreshOutcome({ isRunning: false, trigger: "manual", stages: [] })).toEqual({ result: "idle" });
  });

  it("builds refresh complete summary segments from stage messages", () => {
    const outcome = refreshOutcome({
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

    expect(outcome).toEqual({
      result: "finished",
      segments: [
        "Source: no changes",
        "Fingerprint: hashed 5, ready 10",
        "Duration: files 100, all cached",
        "Loudness: files 50, all cached",
        "Thumbnails: generated 3, reused 2"
      ]
    });
  });

  it("reports each finished refresh run once", () => {
    const running = { isRunning: true, runId: "run-1", completedUtc: null, stages: [] };
    const finished = { isRunning: false, runId: "run-1", completedUtc: "2026-10-06T12:00:00Z", stages: [] };
    const failed = { isRunning: false, runId: "run-2", completedUtc: "2026-10-06T12:05:00Z", lastError: "boom", stages: [] };
    const canceled = { isRunning: false, runId: "run-3", completedUtc: null, stages: [] };

    expect(newRefreshCompletionRunId(running, null)).toBeNull();
    expect(newRefreshCompletionRunId(finished, null)).toBe("run-1");
    expect(newRefreshCompletionRunId(finished, "run-1")).toBeNull();
    expect(newRefreshCompletionRunId(failed, "run-1")).toBe("run-2");
    expect(newRefreshCompletionRunId(canceled, "run-2")).toBeNull();
  });

  it("keeps the sources a refresh kept, from camelCase or PascalCase, and none when the snapshot lists none", () => {
    expect(coerceRefreshSnapshot({ isRunning: false, keptSources: [{ sourceId: "src-a", itemCount: 2 }] }).keptSources).toEqual([
      { sourceId: "src-a", itemCount: 2 }
    ]);
    expect(coerceRefreshSnapshot({ IsRunning: false, KeptSources: [{ SourceId: "src-b", ItemCount: 1200 }] }).keptSources).toEqual([
      { sourceId: "src-b", itemCount: 1200 }
    ]);
    expect(coerceRefreshSnapshot({ isRunning: true }).keptSources).toEqual([]);
  });

  it("gives the kept sources once the source stage has finished or the run has stopped", () => {
    const keptSources = [{ sourceId: "src-a", itemCount: 2 }];
    const sourceStage = (isComplete: boolean) => ({ stage: "sourceRefresh", percent: isComplete ? 100 : 40, message: "", isComplete });

    expect(settledKeptSources({ isRunning: true, currentStage: "sourceRefresh", stages: [sourceStage(false)], keptSources })).toEqual([]);
    expect(settledKeptSources({ isRunning: true, currentStage: "durationScan", stages: [sourceStage(true)], keptSources })).toEqual(keptSources);
    // A run that failed or was cancelled in its source stage kept them all the same.
    expect(settledKeptSources({ isRunning: false, stages: [sourceStage(false)], keptSources })).toEqual(keptSources);
    expect(settledKeptSources({ isRunning: false, stages: [] })).toEqual([]);
  });

  it("gives a running refresh's stage label and percent, Starting before its first stage, and nothing once it stops", () => {
    const stages = [
      ["sourceRefresh", "Refreshing sources"],
      ["nameSortKeys", "Sorting names"],
      ["fingerprintScan", "Fingerprinting files"],
      ["durationScan", "Scanning durations"],
      ["loudnessScan", "Scanning loudness"],
      ["thumbnailGeneration", "Generating thumbnails"],
      ["newStage", "newStage"]
    ];
    for (const [stage, label] of stages) {
      const snapshot = {
        isRunning: true,
        trigger: "manual",
        currentStage: stage,
        stages: [{ stage, percent: 35, message: "Thumbnails 1200/49000 (new 3, regen 0, reused 1197, failed 0, missing 0)", isComplete: false }]
      };
      expect(refreshProgress(snapshot)).toEqual({ stage: label, percent: 35 });
    }
    expect(refreshProgress({ isRunning: true, trigger: "manual", currentStage: null, stages: [] })).toEqual({ stage: "Starting", percent: 0 });
    expect(refreshProgress({ isRunning: false, trigger: "manual", completedUtc: "2026-10-13T10:00:00Z", stages: [] })).toBeNull();
  });
});
