import type { components } from "./openapi.generated";

export type RefreshStatusSnapshot = components["schemas"]["RefreshStatusSnapshot"];
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
