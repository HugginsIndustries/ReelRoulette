import { countText } from "../text/countText";
import type { RefreshKeptSource, RefreshStages, RefreshStatusSnapshot } from "../types/serverContracts";

/** A refresh stage's id, as the status's `currentStage` and `stages` name it. */
export type RefreshStageId = NonNullable<RefreshStatusSnapshot["currentStage"]>;

/**
 * The sources a run kept because their folder listed no media files while the library held items from them, once the
 * run's source stage has finished or the run has stopped, so they come together. Empty before then. The server adds
 * each as it reaches it and repeats them on every later status of the run.
 */
export function settledKeptSources(snapshot: RefreshStatusSnapshot): RefreshKeptSource[] {
  if (snapshot.isRunning && !snapshot.stages.sourceRefresh.isComplete) {
    return [];
  }
  return snapshot.keptSources;
}

/** A running refresh's progress, as the player's indicator shows it: its stage's label and that stage's percent. */
export interface RefreshProgress {
  stage: string;
  percent: number;
}

/** Each refresh stage's label on the player's indicator and in a failed refresh's line. */
export const REFRESH_STAGE_LABELS: Readonly<Record<RefreshStageId, string>> = {
  sourceRefresh: "Refreshing sources",
  nameSortKeys: "Sorting names",
  fingerprintScan: "Fingerprinting files",
  durationScan: "Scanning durations",
  loudnessScan: "Scanning loudness",
  thumbnailGeneration: "Generating thumbnails"
};

/** A stage's label, or "Starting" for a run before its first stage. */
function refreshStageLabel(stage: RefreshStageId | null): string {
  return stage ? REFRESH_STAGE_LABELS[stage] : "Starting";
}

/** The progress of a refresh that is running, or null when none is. */
export function refreshProgress(snapshot: RefreshStatusSnapshot): RefreshProgress | null {
  if (!snapshot.isRunning) {
    return null;
  }
  const stage = snapshot.currentStage;
  return { stage: refreshStageLabel(stage), percent: stage ? snapshot.stages[stage].percent : 0 };
}

/** "{n} {label}" for each nonzero count, in the order given. */
function nonzeroCounts(counts: ReadonlyArray<readonly [number, string]>): string[] {
  return counts.filter(([count]) => count > 0).map(([count, label]) => `${count.toLocaleString()} ${label}`);
}

/** A rescan's segment: how many values it changed, that it changed none in a forced rescan, or nothing otherwise. */
function rescanSegment(name: string, stage: RefreshStages["durationScan"]): string | null {
  if (stage.changed > 0) {
    return `${name} rescanned: ${stage.changed.toLocaleString()} changed`;
  }
  return stage.forced ? `${name} rescanned: no changes` : null;
}

/**
 * A finished refresh's summary, naming only what changed: the library's changes, then each rescan, then any problems,
 * joined by " · ", such as "12 added, 3 removed · 2 thumbnails failed", or "No changes" when nothing did. The work done
 * for new files is left out, since "added" covers it.
 */
export function refreshSummary(snapshot: RefreshStatusSnapshot): string {
  const { sourceRefresh, fingerprintScan, durationScan, loudnessScan, thumbnailGeneration } = snapshot.stages;
  const changes = nonzeroCounts([
    [sourceRefresh.added, "added"],
    [sourceRefresh.removed, "removed"],
    [sourceRefresh.renamed, "renamed"],
    [sourceRefresh.moved, "moved"],
    [fingerprintScan.changed, "changed"]
  ]);
  const rescans = [rescanSegment("Durations", durationScan), rescanSegment("Loudness", loudnessScan)];
  const failures: ReadonlyArray<readonly [number, string]> = [
    [fingerprintScan.failed, "fingerprint"],
    [durationScan.failed, "duration scan"],
    [loudnessScan.failed, "loudness scan"],
    [thumbnailGeneration.failed, "thumbnail"]
  ];
  const problems = [
    ...nonzeroCounts([[sourceRefresh.unmatched, "left unmatched"]]),
    ...failures.filter(([count]) => count > 0).map(([count, noun]) => `${countText(count, noun)} failed`)
  ];
  const missingTools = [snapshot.ffmpegNotFound ? "ffmpeg" : null, snapshot.ffprobeNotFound ? "ffprobe" : null].filter(
    (tool) => tool !== null
  );
  if (missingTools.length > 0) {
    problems.push(`${missingTools.join(" and ")} not found`);
  }
  const segments = [changes.join(", "), ...rescans, problems.join(", ")].filter((segment) => !!segment);
  return segments.length > 0 ? segments.join(" · ") : "No changes";
}

/**
 * How a refresh that isn't running ended: it failed, in the stage it stopped in, by its label, or finished, with its
 * summary, or neither, as after a cancelled run. A running refresh shows on the player's indicator instead, from
 * `refreshProgress`.
 */
export type RefreshOutcome = { result: "failed"; stage: string } | { result: "finished"; summary: string } | { result: "idle" };

export function refreshOutcome(snapshot: RefreshStatusSnapshot): RefreshOutcome {
  // The server keeps a failed run's current stage, and its error goes only to last.log.
  if (snapshot.failed) {
    return { result: "failed", stage: refreshStageLabel(snapshot.currentStage) };
  }

  if (snapshot.completedUtc) {
    return { result: "finished", summary: refreshSummary(snapshot) };
  }

  return { result: "idle" };
}

/**
 * The run id of a refresh run this snapshot reports as finished, when it differs from the last one applied,
 * so the library window reloads once per run. Otherwise null.
 */
export function newRefreshCompletionRunId(snapshot: RefreshStatusSnapshot, lastAppliedRunId: string | null): string | null {
  if (snapshot.isRunning || !snapshot.completedUtc) {
    return null;
  }
  const runId = snapshot.runId?.trim() || "__no-run-id__";
  return runId === lastAppliedRunId ? null : runId;
}
