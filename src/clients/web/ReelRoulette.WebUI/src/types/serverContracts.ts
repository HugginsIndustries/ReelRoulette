import type { components } from "./openapi.generated";

export type VersionResponse = components["schemas"]["VersionResponse"];
export type PairResponse = components["schemas"]["PairResponse"];
export type RefreshStageProgress = components["schemas"]["RefreshStageProgress"];
export type RefreshStatusSnapshot = components["schemas"]["RefreshStatusSnapshot"];
export type RefreshStatusChangedPayload = components["schemas"]["RefreshStatusChangedPayload"];
export type ResyncRequiredPayload = components["schemas"]["ResyncRequiredPayload"];

export interface ServerEventEnvelope<TPayload = unknown>
  extends Omit<components["schemas"]["ServerEventEnvelope"], "payload"> {
  revision: number;
  eventType: string;
  timestamp: string;
  payload: TPayload;
}
