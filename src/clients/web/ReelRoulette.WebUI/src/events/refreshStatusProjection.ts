import type { RefreshStatusSnapshot } from "../types/serverContracts";

export function buildRefreshStatusMessage(snapshot: RefreshStatusSnapshot): string {
  if (snapshot.isRunning) {
    const stage = snapshot.currentStage ?? "running";
    const progress = snapshot.stages.find((s) => s.stage === stage);
    if (progress) {
      return `Core refresh: ${progress.message || stage} (${progress.percent}%).`;
    }

    return `Core refresh: ${stage}.`;
  }

  if (snapshot.lastError) {
    return `Core refresh failed: ${snapshot.lastError}`;
  }

  if (snapshot.completedUtc) {
    return `Core refresh complete (${snapshot.trigger ?? "manual"}).`;
  }

  return "Core refresh idle.";
}
