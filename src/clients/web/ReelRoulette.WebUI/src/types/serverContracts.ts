export interface VersionResponse {
  appVersion: string;
  apiVersion: string;
  assetsVersion?: string | null;
}

export interface PairResponse {
  paired: boolean;
  message: string;
}

export interface RefreshStageProgress {
  stage: string;
  percent: number;
  message: string;
  isComplete: boolean;
}

export interface RefreshStatusSnapshot {
  isRunning: boolean;
  runId?: string | null;
  trigger?: string | null;
  startedUtc?: string | null;
  completedUtc?: string | null;
  currentStage?: string | null;
  lastError?: string | null;
  stages: RefreshStageProgress[];
}

export interface RefreshStatusChangedPayload {
  snapshot: RefreshStatusSnapshot;
}

export interface ResyncRequiredPayload {
  reason: string;
  lastEventId: number;
  currentRevision: number;
}

export interface ServerEventEnvelope<TPayload = unknown> {
  revision: number;
  eventType: string;
  timestamp: string;
  payload: TPayload;
}
