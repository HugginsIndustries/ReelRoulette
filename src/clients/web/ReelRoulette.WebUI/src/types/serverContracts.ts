import type { components } from "./openapi.generated";

export type RefreshStatusSnapshot = components["schemas"]["RefreshStatusSnapshot"];
/** Each refresh stage's progress and counts, one member per stage. */
export type RefreshStages = components["schemas"]["RefreshStages"];
/** `refreshStatusChanged`: the refresh's whole status, sent on every change. */
export type RefreshStatusChangedPayload = components["schemas"]["RefreshStatusChangedPayload"];
export type RefreshKeptSource = components["schemas"]["RefreshKeptSource"];
/** `itemRatingChanged` as the WebUI reads it, each field optional: the item's rating and the one before, in stars. */
export type ItemRatingChangedPayload = Partial<components["schemas"]["ItemRatingChangedPayload"]>;
/** `bulkItemStateChanged`: one favorite or blacklist change to several items, listing only the items it changed. */
export type BulkItemStateChangedPayload = components["schemas"]["BulkItemStateChangedPayload"];
/** `bulkItemRatingChanged`: one rating set or cleared on several items, listing only the items it changed. */
export type BulkItemRatingChangedPayload = components["schemas"]["BulkItemRatingChangedPayload"];
/** `itemsRemoved`: items removed from the library, their files deleted. */
export type ItemsRemovedPayload = components["schemas"]["ItemsRemovedPayload"];

export interface ServerEventEnvelope<TPayload = unknown>
  extends Omit<components["schemas"]["ServerEventEnvelope"], "payload"> {
  revision: number;
  eventType: string;
  timestamp: string;
  payload: TPayload;
}
