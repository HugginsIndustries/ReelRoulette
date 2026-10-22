import type { components } from "./openapi.generated";

export type RefreshStageProgress = components["schemas"]["RefreshStageProgress"];
export type RefreshStatusSnapshot = components["schemas"]["RefreshStatusSnapshot"];
export type RefreshKeptSource = components["schemas"]["RefreshKeptSource"];
export type RefreshStatusChangedPayload = components["schemas"]["RefreshStatusChangedPayload"];
export type ResyncRequiredPayload = components["schemas"]["ResyncRequiredPayload"];
/** `itemRatingChanged` as the WebUI reads it, each field optional: the item's rating and the one before, in stars. */
export type ItemRatingChangedPayload = Partial<components["schemas"]["ItemRatingChangedPayload"]>;

export interface ServerEventEnvelope<TPayload = unknown>
  extends Omit<components["schemas"]["ServerEventEnvelope"], "payload"> {
  revision: number;
  eventType: string;
  timestamp: string;
  payload: TPayload;
}
