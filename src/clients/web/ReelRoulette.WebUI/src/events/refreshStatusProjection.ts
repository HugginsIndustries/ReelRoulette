import type { RefreshStatusSnapshot } from "../types/serverContracts";

/** Loose snapshot from SSE JSON (may omit optional fields). */
export type RefreshSnapshotInput = Partial<RefreshStatusSnapshot> & {
  isRunning?: boolean;
  stages?: Array<{
    stage?: string;
    percent?: number;
    message?: string;
    isComplete?: boolean;
  }>;
};

function getCount(counts: Map<string, number>, key: string): number {
  const k = [...counts.keys()].find((x) => x.toLowerCase() === key.toLowerCase());
  return k !== undefined ? (counts.get(k) ?? 0) : 0;
}

function containsUnavailableToken(stageMessage: string): boolean {
  return stageMessage.toLowerCase().includes("unavailable");
}

function parseStageCounts(stageMessage: string): Map<string, number> {
  const counts = new Map<string, number>();
  const openParen = stageMessage.indexOf("(");
  if (openParen < 0) return counts;
  const closeParen = stageMessage.indexOf(")", openParen + 1);
  if (closeParen <= openParen) return counts;

  const payload = stageMessage.slice(openParen + 1, closeParen);
  const segments = payload.split(",").map((s) => s.trim());
  for (const segment of segments) {
    if (!segment) continue;
    let labelStart = 0;
    while (labelStart < segment.length && /\s/.test(segment[labelStart]!)) {
      labelStart++;
    }
    let valueStart = labelStart;
    while (valueStart < segment.length && /\d/.test(segment[valueStart]!)) {
      valueStart++;
    }
    if (valueStart === labelStart) continue;

    const numStr = segment.slice(labelStart, valueStart);
    const value = Number.parseInt(numStr, 10);
    if (!Number.isFinite(value)) continue;

    const label = segment.slice(valueStart).trim();
    if (!label) continue;
    counts.set(label, value);
  }
  return counts;
}

function addNonZeroToken(tokens: string[], label: string, value: number): void {
  if (value > 0) {
    tokens.push(`${label} ${value}`);
  }
}

function buildSourceRefreshSummary(stageMessage: string | null | undefined): string {
  if (!stageMessage?.trim()) return "no data";
  if (containsUnavailableToken(stageMessage)) return "unavailable";

  const counts = parseStageCounts(stageMessage);
  if (counts.size === 0) return "no data";

  const tokens: string[] = [];
  addNonZeroToken(tokens, "added", getCount(counts, "added"));
  addNonZeroToken(tokens, "removed", getCount(counts, "removed"));
  addNonZeroToken(tokens, "renamed", getCount(counts, "renamed"));
  addNonZeroToken(tokens, "moved", getCount(counts, "moved"));
  addNonZeroToken(tokens, "updated", getCount(counts, "updated"));
  addNonZeroToken(tokens, "unresolved", getCount(counts, "unresolved"));

  return tokens.length === 0 ? "no changes" : tokens.join(", ");
}

function hasFilesKey(counts: Map<string, number>): boolean {
  return [...counts.keys()].some((k) => k.toLowerCase() === "files");
}

function buildDurationScanSummary(stageMessage: string | null | undefined): string {
  if (!stageMessage?.trim()) return "no data";
  if (containsUnavailableToken(stageMessage)) return "unavailable";

  const counts = parseStageCounts(stageMessage);
  if (!hasFilesKey(counts)) return "no data";

  const filesVal = getCount(counts, "files");
  const lower = stageMessage.toLowerCase();
  if (lower.includes("all cached")) {
    return `files ${filesVal}, all cached`;
  }

  const updated = getCount(counts, "updated");
  const forced = lower.includes("forced full rescan") ? ", forced" : "";
  return `files ${filesVal}, updated ${updated}${forced}`;
}

function buildLoudnessScanSummary(stageMessage: string | null | undefined): string {
  if (!stageMessage?.trim()) return "no data";
  if (containsUnavailableToken(stageMessage)) return "unavailable";

  const counts = parseStageCounts(stageMessage);
  const filesVal = getCount(counts, "files");
  const hasFiles = [...counts.keys()].some((k) => k.toLowerCase() === "files");
  if (!hasFiles) return "no data";

  if (filesVal === 0) return "no eligible files";

  const lower = stageMessage.toLowerCase();
  if (lower.includes("all scanned") || lower.includes("all cached")) {
    return `files ${filesVal}, all cached`;
  }

  const updated = getCount(counts, "updated");
  const withoutAudio = getCount(counts, "without audio");
  const errors = getCount(counts, "errors");
  const tokens: string[] = [`files ${filesVal}`];
  addNonZeroToken(tokens, "updated", updated);
  addNonZeroToken(tokens, "no-audio", withoutAudio);
  addNonZeroToken(tokens, "errors", errors);
  if (lower.includes("forced full rescan")) {
    tokens.push("forced");
  }
  return tokens.join(", ");
}

function buildFingerprintScanSummary(stageMessage: string | null | undefined): string {
  if (!stageMessage?.trim()) return "no data";
  if (containsUnavailableToken(stageMessage)) return "unavailable";

  const counts = parseStageCounts(stageMessage);
  if (counts.size === 0) return "no data";

  const tokens: string[] = [];
  addNonZeroToken(tokens, "hashed", getCount(counts, "hashed"));
  addNonZeroToken(tokens, "ready", getCount(counts, "ready"));
  addNonZeroToken(tokens, "failed", getCount(counts, "failed"));
  addNonZeroToken(tokens, "skipped", getCount(counts, "skipped"));
  return tokens.length === 0 ? "none" : tokens.join(", ");
}

function buildThumbnailSummary(stageMessage: string | null | undefined): string {
  if (!stageMessage?.trim()) return "no data";
  if (containsUnavailableToken(stageMessage)) return "unavailable";

  const counts = parseStageCounts(stageMessage);
  if (counts.size === 0) return "no data";

  const tokens: string[] = [];
  addNonZeroToken(tokens, "generated", getCount(counts, "generated"));
  addNonZeroToken(tokens, "regenerated", getCount(counts, "regenerated"));
  addNonZeroToken(tokens, "reused", getCount(counts, "reused"));
  addNonZeroToken(tokens, "failed", getCount(counts, "failed"));
  addNonZeroToken(tokens, "missing", getCount(counts, "missing source"));
  addNonZeroToken(tokens, "metadata", getCount(counts, "metadata updated"));
  addNonZeroToken(tokens, "stale", getCount(counts, "stale removed"));
  addNonZeroToken(tokens, "evicted", getCount(counts, "evicted"));

  return tokens.length === 0 ? "none" : tokens.join(", ");
}

function getStageMessage(
  stages: RefreshStatusSnapshot["stages"],
  stageName: string
): string | null {
  if (!Array.isArray(stages)) return null;
  const found = stages.find((s) => String(s.stage ?? "").toLowerCase() === stageName.toLowerCase());
  const msg = found?.message?.trim();
  return msg || null;
}

function buildRefreshCompleteLine(snapshot: RefreshStatusSnapshot): string {
  const stages = snapshot.stages;
  const sourceSummary = buildSourceRefreshSummary(getStageMessage(stages, "sourceRefresh"));
  const fingerprintSummary = buildFingerprintScanSummary(getStageMessage(stages, "fingerprintScan"));
  const durationSummary = buildDurationScanSummary(getStageMessage(stages, "durationScan"));
  const loudnessSummary = buildLoudnessScanSummary(getStageMessage(stages, "loudnessScan"));
  const thumbnailSummary = buildThumbnailSummary(getStageMessage(stages, "thumbnailGeneration"));

  return `Core refresh complete | Source: ${sourceSummary} | Fingerprint: ${fingerprintSummary} | Duration: ${durationSummary} | Loudness: ${loudnessSummary} | Thumbnails: ${thumbnailSummary}`;
}

function normalizeSnapshot(input: RefreshSnapshotInput): RefreshStatusSnapshot {
  return {
    isRunning: !!input.isRunning,
    runId: input.runId ?? null,
    trigger: String(input.trigger ?? "manual"),
    startedUtc: input.startedUtc ?? null,
    completedUtc: input.completedUtc ?? null,
    currentStage: input.currentStage ?? null,
    lastError: input.lastError ?? null,
    stages: Array.isArray(input.stages)
      ? input.stages.map((s) => ({
          stage: String(s.stage ?? ""),
          percent: Number(s.percent ?? 0),
          message: String(s.message ?? ""),
          isComplete: !!s.isComplete
        }))
      : []
  };
}

/** Normalize SSE/API snapshot objects that may use PascalCase. */
export function coerceRefreshSnapshot(raw: unknown): RefreshSnapshotInput {
  if (!raw || typeof raw !== "object") {
    return { isRunning: false, trigger: "manual", stages: [] };
  }
  const r = raw as Record<string, unknown>;
  const stagesIn = (r.stages ?? r.Stages) as unknown;
  const stages: RefreshSnapshotInput["stages"] = Array.isArray(stagesIn)
    ? stagesIn.map((s) => {
        if (!s || typeof s !== "object") {
          return { stage: "", percent: 0, message: "", isComplete: false };
        }
        const x = s as Record<string, unknown>;
        return {
          stage: String(x.stage ?? x.Stage ?? ""),
          percent: Number(x.percent ?? x.Percent ?? 0),
          message: String(x.message ?? x.Message ?? ""),
          isComplete: Boolean(x.isComplete ?? x.IsComplete)
        };
      })
    : [];
  return {
    isRunning: !!(r.isRunning ?? r.IsRunning),
    runId: (r.runId ?? r.RunId) as string | null | undefined,
    trigger: (r.trigger ?? r.Trigger) as string | undefined,
    startedUtc: (r.startedUtc ?? r.StartedUtc) as string | null | undefined,
    completedUtc: (r.completedUtc ?? r.CompletedUtc) as string | null | undefined,
    currentStage: (r.currentStage ?? r.CurrentStage) as string | null | undefined,
    lastError: (r.lastError ?? r.LastError) as string | null | undefined,
    stages
  };
}

export function buildRefreshStatusMessage(snapshotInput: RefreshSnapshotInput): string {
  const snapshot = normalizeSnapshot(snapshotInput);

  if (snapshot.isRunning) {
    const stageRaw = snapshot.currentStage?.trim();
    const stage = stageRaw || "initializing";
    const active = snapshot.stages.find((s) => s.stage.toLowerCase() === stage.toLowerCase());
    const percent = active?.percent ?? 0;
    const message = active?.message?.trim() ? active.message : stage;
    return `Core refresh: ${message} (${percent}%)`;
  }

  if (snapshot.lastError) {
    return `Core refresh failed: ${snapshot.lastError}`;
  }

  if (snapshot.completedUtc) {
    return buildRefreshCompleteLine(snapshot);
  }

  return "Core refresh idle.";
}
