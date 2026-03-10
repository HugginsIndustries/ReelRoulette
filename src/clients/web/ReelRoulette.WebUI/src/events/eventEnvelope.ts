import type { RefreshStatusChangedPayload, ResyncRequiredPayload, ServerEventEnvelope } from "../types/serverContracts";

export function parseEventEnvelope<TPayload>(raw: string): ServerEventEnvelope<TPayload> {
  const parsed = JSON.parse(raw) as ServerEventEnvelope<TPayload>;
  if (!parsed || typeof parsed.revision !== "number" || typeof parsed.eventType !== "string") {
    throw new Error("Invalid server event envelope.");
  }

  return parsed;
}

export function buildEventsUrl(
  sseUrl: string,
  lastRevision: number,
  options?: { clientId?: string; sessionId?: string; clientType?: string; deviceName?: string }
): string {
  const url = new URL(sseUrl);
  if (lastRevision > 0) {
    url.searchParams.set("lastEventId", String(lastRevision));
  }
  if (options?.clientId) {
    url.searchParams.set("clientId", options.clientId);
  }
  if (options?.sessionId) {
    url.searchParams.set("sessionId", options.sessionId);
  }
  if (options?.clientType) {
    url.searchParams.set("clientType", options.clientType);
  }
  if (options?.deviceName) {
    url.searchParams.set("deviceName", options.deviceName);
  }

  return url.toString();
}

export function getRefreshPayload(raw: string): RefreshStatusChangedPayload {
  const envelope = parseEventEnvelope<RefreshStatusChangedPayload>(raw);
  return envelope.payload;
}

export function getResyncPayload(raw: string): ResyncRequiredPayload {
  const envelope = parseEventEnvelope<ResyncRequiredPayload>(raw);
  return envelope.payload;
}
