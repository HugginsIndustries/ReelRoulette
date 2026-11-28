import { countText, ofText } from "../text/countText";
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

/**
 * A running refresh's progress: its stage's label and that stage's percent, as the player's indicator shows them, and
 * the line the bell's Now shows under them.
 */
export interface RefreshProgress {
  stage: string;
  percent: number;
  /** How far the stage has got, such as "1,234 of 49,455 files", or null before it has counted any work. */
  line: string | null;
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

/** "{lead}{done} of {total} {noun}s", or null for a count with nothing to do yet, so "0 of 0" never shows. */
function countLine(done: number, total: number, noun: string, lead = ""): string | null {
  return total > 0 ? lead + ofText(done, total, noun) : null;
}

/**
 * How far a stage has got: the source it is on, with that source's new files while it fingerprints them, then the
 * files or videos of each stage's phase. Null before the first stage and for a stage that hasn't counted its work.
 */
function refreshProgressLine(snapshot: RefreshStatusSnapshot): string | null {
  const { sourceRefresh, nameSortKeys, fingerprintScan, durationScan, loudnessScan, thumbnailGeneration } = snapshot.stages;
  switch (snapshot.currentStage) {
    case "sourceRefresh": {
      if (sourceRefresh.source === 0 || sourceRefresh.sourceCount === 0) {
        return null;
      }
      const source = `Source ${ofText(sourceRefresh.source, sourceRefresh.sourceCount)}`;
      const newFiles = countLine(sourceRefresh.newFilesFingerprinted, sourceRefresh.newFilesToFingerprint, "new file");
      return newFiles ? `${source} · ${newFiles}` : source;
    }
    case "nameSortKeys":
      return countLine(nameSortKeys.processed, nameSortKeys.total, "file");
    case "fingerprintScan":
      return countLine(fingerprintScan.processed, fingerprintScan.total, "file", fingerprintScan.phase === "checking" ? "Checking " : "");
    case "durationScan":
      return countLine(durationScan.processed, durationScan.total, "video");
    case "loudnessScan":
      return countLine(loudnessScan.processed, loudnessScan.total, "video");
    case "thumbnailGeneration":
      return thumbnailGeneration.phase === "cleanup"
        ? countLine(thumbnailGeneration.processed, thumbnailGeneration.total, "old thumbnail", "Removing ")
        : countLine(thumbnailGeneration.processed, thumbnailGeneration.total, "file");
    default:
      return null;
  }
}

/** The progress of a refresh that is running, or null when none is. */
export function refreshProgress(snapshot: RefreshStatusSnapshot): RefreshProgress | null {
  if (!snapshot.isRunning) {
    return null;
  }
  const stage = snapshot.currentStage;
  return { stage: refreshStageLabel(stage), percent: stage ? snapshot.stages[stage].percent : 0, line: refreshProgressLine(snapshot) };
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

/** A finished refresh's summary in its parts: the library's changes and each rescan, then its problems. */
interface RefreshSummaryParts {
  /** The library's changes, joined by ", ", then each rescan's segment, with nothing left empty. */
  changes: string[];
  /** The problems, joined by ", ", or empty. */
  problems: string;
}

function refreshSummaryParts(snapshot: RefreshStatusSnapshot): RefreshSummaryParts {
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
  return {
    changes: [changes.join(", "), ...rescans].filter((segment): segment is string => !!segment),
    problems: problems.join(", ")
  };
}

/**
 * A finished refresh's summary, naming only what changed: the library's changes, then each rescan, then any problems,
 * joined by " · ", such as "12 added, 3 removed · 2 thumbnails failed", or "No changes" when nothing did. The work done
 * for new files is left out, since "added" covers it.
 */
export function refreshSummary(snapshot: RefreshStatusSnapshot): string {
  return summaryText(refreshSummaryParts(snapshot));
}

function summaryText({ changes, problems }: RefreshSummaryParts): string {
  const segments = problems ? [...changes, problems] : changes;
  return segments.length > 0 ? segments.join(" · ") : "No changes";
}

/**
 * How a refresh that isn't running ended: it failed, in the stage it stopped in, by its label, or finished, with its
 * summary, or neither, as after a cancelled run. A running refresh shows on the player's indicator instead, from
 * `refreshProgress`.
 */
export type RefreshOutcome =
  | { result: "failed"; stage: string }
  /**
   * `changed`: the summary names a library change or a rescan, rather than nothing or only problems, which come back
   * on every refresh until they're fixed.
   */
  | { result: "finished"; summary: string; changed: boolean }
  | { result: "idle" };

export function refreshOutcome(snapshot: RefreshStatusSnapshot): RefreshOutcome {
  // The server keeps a failed run's current stage, and its error goes only to last.log.
  if (snapshot.failed) {
    return { result: "failed", stage: refreshStageLabel(snapshot.currentStage) };
  }

  if (snapshot.completedUtc) {
    const parts = refreshSummaryParts(snapshot);
    return { result: "finished", summary: summaryText(parts), changed: parts.changes.length > 0 };
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
