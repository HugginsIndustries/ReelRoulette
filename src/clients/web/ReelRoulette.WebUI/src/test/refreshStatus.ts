import type { RefreshStages, RefreshStatusSnapshot } from "../types/serverContracts";

/** Overrides for a refresh status: any top-level field, and any of each stage's fields. */
export type RefreshStatusOverrides = Partial<Omit<RefreshStatusSnapshot, "stages">> & {
  stages?: { [Stage in keyof RefreshStages]?: Partial<RefreshStages[Stage]> };
};

/**
 * A complete refresh status, as the server sends it: by default a refresh that has never run, with every stage at 0,
 * no forced rescan, nothing failed, and ffmpeg and ffprobe found.
 */
export function refreshStatus(overrides: RefreshStatusOverrides = {}): RefreshStatusSnapshot {
  const { stages = {}, ...topLevel } = overrides;
  const mediaScan = { percent: 0, isComplete: false, processed: 0, total: 0, changed: 0, failed: 0, forced: false };
  return {
    isRunning: false,
    runId: null,
    trigger: "manual",
    startedUtc: null,
    completedUtc: null,
    currentStage: null,
    failed: false,
    ffmpegNotFound: false,
    ffprobeNotFound: false,
    keptSources: [],
    ...topLevel,
    stages: {
      sourceRefresh: {
        percent: 0,
        isComplete: false,
        source: 0,
        sourceCount: 0,
        newFilesFingerprinted: 0,
        newFilesToFingerprint: 0,
        added: 0,
        removed: 0,
        renamed: 0,
        moved: 0,
        unmatched: 0,
        ...stages.sourceRefresh
      },
      nameSortKeys: { percent: 0, isComplete: false, processed: 0, total: 0, ...stages.nameSortKeys },
      fingerprintScan: {
        percent: 0,
        isComplete: false,
        phase: "checking",
        processed: 0,
        total: 0,
        changed: 0,
        failed: 0,
        ...stages.fingerprintScan
      },
      durationScan: { ...mediaScan, ...stages.durationScan },
      loudnessScan: { ...mediaScan, ...stages.loudnessScan },
      thumbnailGeneration: {
        percent: 0,
        isComplete: false,
        phase: "generating",
        processed: 0,
        total: 0,
        failed: 0,
        ...stages.thumbnailGeneration
      }
    }
  };
}
