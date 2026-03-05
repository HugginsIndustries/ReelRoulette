import type { RefreshStatusChangedPayload, ResyncRequiredPayload, ServerEventEnvelope } from "../types/serverContracts";

export function parseEventEnvelope<TPayload>(raw: string): ServerEventEnvelope<TPayload> {
  const parsed = JSON.parse(raw) as ServerEventEnvelope<TPayload>;
  if (!parsed || typeof parsed.revision !== "number" || typeof parsed.eventType !== "string") {
    throw new Error("Invalid server event envelope.");
  }

  return parsed;
}

export function buildEventsUrl(sseUrl: string, lastRevision: number): string {
  const url = new URL(sseUrl);
  if (lastRevision > 0) {
    url.searchParams.set("lastEventId", String(lastRevision));
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
