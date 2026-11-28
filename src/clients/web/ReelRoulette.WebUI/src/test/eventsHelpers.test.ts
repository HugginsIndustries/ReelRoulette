import { describe, expect, it } from "vitest";
import { buildEventsUrl, parseEventEnvelope } from "../events/eventEnvelope";
import {
  newRefreshCompletionRunId,
  refreshOutcome,
  refreshProgress,
  refreshSummary,
  settledKeptSources
} from "../events/refreshStatusProjection";
import { refreshStatus } from "./refreshStatus";

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

  it("tells a failed refresh, by the stage it stopped in, from a run that ended without finishing", () => {
    const failed = refreshOutcome(
      refreshStatus({ currentStage: "durationScan", failed: true, completedUtc: "2026-03-29T12:00:00Z" })
    );

    expect(failed).toEqual({ result: "failed", stage: "Scanning durations" });
    expect(refreshOutcome(refreshStatus())).toEqual({ result: "idle" });
  });

  it("gives a finished refresh's summary as its outcome", () => {
    const outcome = refreshOutcome(
      refreshStatus({ completedUtc: "2026-03-29T12:00:00Z", stages: { sourceRefresh: { added: 12 } } })
    );

    expect(outcome).toEqual({ result: "finished", summary: "12 added", changed: true });
  });

  it("tells a finished refresh that changed the library or rescanned from one that changed nothing or found only problems", () => {
    const finished = (overrides: Parameters<typeof refreshStatus>[0]) =>
      refreshOutcome(refreshStatus({ completedUtc: "2026-03-29T12:00:00Z", ...overrides }));

    expect(finished({})).toEqual({ result: "finished", summary: "No changes", changed: false });
    expect(finished({ ffmpegNotFound: true, stages: { loudnessScan: { failed: 2 }, sourceRefresh: { unmatched: 1 } } })).toEqual({
      result: "finished",
      summary: "1 left unmatched, 2 loudness scans failed, ffmpeg not found",
      changed: false
    });
    for (const stages of [
      { sourceRefresh: { removed: 1 } },
      { sourceRefresh: { renamed: 1 } },
      { sourceRefresh: { moved: 1 } },
      { fingerprintScan: { changed: 1 } },
      { durationScan: { changed: 1 } },
      // A rescan the user turned on runs once, so its result is news even when it changed nothing.
      { loudnessScan: { forced: true } }
    ]) {
      expect(finished({ stages, ffprobeNotFound: true })).toMatchObject({ changed: true });
    }
  });

  it("sums up a refresh that changed nothing as No changes, leaving out the work done for new files", () => {
    const summary = refreshSummary(
      refreshStatus({
        completedUtc: "2026-03-29T12:00:00Z",
        stages: {
          sourceRefresh: { percent: 100, isComplete: true, sourceCount: 2, newFilesFingerprinted: 4, newFilesToFingerprint: 4 },
          nameSortKeys: { processed: 30, total: 30 },
          fingerprintScan: { phase: "hashing", processed: 5, total: 5 },
          durationScan: { processed: 100, total: 100 },
          loudnessScan: { processed: 50, total: 50 },
          thumbnailGeneration: { phase: "cleanup", processed: 3, total: 3 }
        }
      })
    );

    expect(summary).toBe("No changes");
  });

  it("names only the library's nonzero changes, then the problems", () => {
    expect(
      refreshSummary(refreshStatus({ stages: { sourceRefresh: { added: 12, removed: 3, renamed: 2, moved: 1 } } }))
    ).toBe("12 added, 3 removed, 2 renamed, 1 moved");
    expect(refreshSummary(refreshStatus({ stages: { fingerprintScan: { changed: 1 } } }))).toBe("1 changed");
    expect(
      refreshSummary(refreshStatus({ stages: { sourceRefresh: { added: 12 }, thumbnailGeneration: { failed: 2 } } }))
    ).toBe("12 added · 2 thumbnails failed");
    expect(refreshSummary(refreshStatus({ stages: { sourceRefresh: { removed: 3, unmatched: 2 } } }))).toBe(
      "3 removed · 2 left unmatched"
    );
    expect(
      refreshSummary(
        refreshStatus({
          stages: {
            sourceRefresh: { moved: 4, unmatched: 1 },
            fingerprintScan: { changed: 2, failed: 3 },
            durationScan: { failed: 4 },
            loudnessScan: { failed: 5 },
            thumbnailGeneration: { failed: 6 }
          }
        })
      )
    ).toBe(
      "4 moved, 2 changed · 1 left unmatched, 3 fingerprints failed, 4 duration scans failed, 5 loudness scans failed, 6 thumbnails failed"
    );
  });

  it("names a rescan's changes, or that a forced rescan changed nothing", () => {
    expect(refreshSummary(refreshStatus({ stages: { loudnessScan: { changed: 3 } } }))).toBe("Loudness rescanned: 3 changed");
    expect(refreshSummary(refreshStatus({ stages: { durationScan: { forced: true }, loudnessScan: { forced: true } } }))).toBe(
      "Durations rescanned: no changes · Loudness rescanned: no changes"
    );
    expect(
      refreshSummary(
        refreshStatus({ stages: { sourceRefresh: { added: 1 }, durationScan: { changed: 2, forced: true }, thumbnailGeneration: { failed: 1 } } })
      )
    ).toBe("1 added · Durations rescanned: 2 changed · 1 thumbnail failed");
  });

  it("names a missing ffmpeg or ffprobe once", () => {
    expect(refreshSummary(refreshStatus({ ffmpegNotFound: true, stages: { sourceRefresh: { added: 12 } } }))).toBe(
      "12 added · ffmpeg not found"
    );
    expect(refreshSummary(refreshStatus({ ffprobeNotFound: true }))).toBe("ffprobe not found");
    expect(refreshSummary(refreshStatus({ ffmpegNotFound: true, ffprobeNotFound: true, stages: { durationScan: { failed: 1 } } }))).toBe(
      "1 duration scan failed, ffmpeg and ffprobe not found"
    );
  });

  it("groups the summary's numbers as the device writes numbers", () => {
    expect(
      refreshSummary(refreshStatus({ stages: { sourceRefresh: { added: 1234 }, thumbnailGeneration: { failed: 5678 } } }))
    ).toBe(`${(1234).toLocaleString()} added · ${(5678).toLocaleString()} thumbnails failed`);
  });

  it("reports each finished refresh run once", () => {
    const running = refreshStatus({ isRunning: true, runId: "run-1" });
    const finished = refreshStatus({ runId: "run-1", completedUtc: "2026-10-06T12:00:00Z" });
    const failed = refreshStatus({ runId: "run-2", completedUtc: "2026-10-06T12:05:00Z", failed: true });
    const canceled = refreshStatus({ runId: "run-3" });

    expect(newRefreshCompletionRunId(running, null)).toBeNull();
    expect(newRefreshCompletionRunId(finished, null)).toBe("run-1");
    expect(newRefreshCompletionRunId(finished, "run-1")).toBeNull();
    expect(newRefreshCompletionRunId(failed, "run-1")).toBe("run-2");
    expect(newRefreshCompletionRunId(canceled, "run-2")).toBeNull();
  });

  it("gives the kept sources once the source stage has finished or the run has stopped", () => {
    const keptSources = [{ sourceId: "src-a", itemCount: 2 }];
    const status = (isRunning: boolean, sourceDone: boolean) =>
      refreshStatus({
        isRunning,
        currentStage: isRunning ? (sourceDone ? "durationScan" : "sourceRefresh") : null,
        keptSources,
        stages: { sourceRefresh: { percent: sourceDone ? 100 : 40, isComplete: sourceDone } }
      });

    expect(settledKeptSources(status(true, false))).toEqual([]);
    expect(settledKeptSources(status(true, true))).toEqual(keptSources);
    // A run that failed or was cancelled in its source stage kept them all the same.
    expect(settledKeptSources(status(false, false))).toEqual(keptSources);
    expect(settledKeptSources(refreshStatus())).toEqual([]);
  });

  it("gives a running refresh's stage label and percent, Starting before its first stage, and nothing once it stops", () => {
    const stages = [
      ["sourceRefresh", "Refreshing sources"],
      ["nameSortKeys", "Sorting names"],
      ["fingerprintScan", "Fingerprinting files"],
      ["durationScan", "Scanning durations"],
      ["loudnessScan", "Scanning loudness"],
      ["thumbnailGeneration", "Generating thumbnails"]
    ] as const;
    for (const [stage, label] of stages) {
      const snapshot = refreshStatus({ isRunning: true, currentStage: stage, stages: { [stage]: { percent: 35 } } });
      expect(refreshProgress(snapshot)).toEqual({ stage: label, percent: 35, line: null });
    }
    expect(refreshProgress(refreshStatus({ isRunning: true }))).toEqual({ stage: "Starting", percent: 0, line: null });
    expect(refreshProgress(refreshStatus({ completedUtc: "2026-10-13T10:00:00Z" }))).toBeNull();
  });

  it("words each stage's progress line, grouping its numbers, and none before a stage has counted its work", () => {
    const line = (overrides: Parameters<typeof refreshStatus>[0]) => refreshProgress(refreshStatus({ isRunning: true, ...overrides }))!.line;
    const n = (count: number) => count.toLocaleString();

    // Before the first source, and with no source enabled, so "0 of 0" never shows.
    expect(line({ currentStage: "sourceRefresh" })).toBeNull();
    expect(line({ currentStage: "sourceRefresh", stages: { sourceRefresh: { source: 2, sourceCount: 3 } } })).toBe("Source 2 of 3");
    expect(
      line({ currentStage: "sourceRefresh", stages: { sourceRefresh: { source: 2, sourceCount: 3, newFilesFingerprinted: 120, newFilesToFingerprint: 400 } } })
    ).toBe("Source 2 of 3 · 120 of 400 new files");
    expect(line({ currentStage: "nameSortKeys", stages: { nameSortKeys: { processed: 1234, total: 49455 } } })).toBe(`${n(1234)} of ${n(49455)} files`);
    expect(line({ currentStage: "fingerprintScan", stages: { fingerprintScan: { phase: "checking", processed: 12000, total: 49455 } } })).toBe(
      `Checking ${n(12000)} of ${n(49455)} files`
    );
    expect(line({ currentStage: "fingerprintScan", stages: { fingerprintScan: { phase: "hashing", processed: 1234, total: 2000 } } })).toBe(
      `${n(1234)} of ${n(2000)} files`
    );
    expect(line({ currentStage: "durationScan", stages: { durationScan: { processed: 12, total: 40 } } })).toBe("12 of 40 videos");
    expect(line({ currentStage: "loudnessScan", stages: { loudnessScan: { processed: 0, total: 1 } } })).toBe("0 of 1 video");
    expect(
      line({ currentStage: "thumbnailGeneration", stages: { thumbnailGeneration: { phase: "generating", processed: 12000, total: 49455 } } })
    ).toBe(`${n(12000)} of ${n(49455)} files`);
    expect(line({ currentStage: "thumbnailGeneration", stages: { thumbnailGeneration: { phase: "cleanup", processed: 120, total: 5000 } } })).toBe(
      `Removing 120 of ${n(5000)} old thumbnails`
    );
    // A stage with nothing to do.
    expect(line({ currentStage: "durationScan", stages: { durationScan: { isComplete: true, percent: 100 } } })).toBeNull();
    expect(line({ currentStage: "thumbnailGeneration", stages: { thumbnailGeneration: { phase: "cleanup" } } })).toBeNull();
  });
});
