import type { RuntimeConfig } from "../types/runtimeConfig";
import type { PairResponse, RefreshStatusSnapshot, VersionResponse } from "../types/serverContracts";

const CLIENT_ID_KEY = "rr_clientId";
const SESSION_ID_KEY = "rr_sessionId";
let fallbackClientId: string | null = null;
let fallbackSessionId: string | null = null;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function tryGetStorage(storage: unknown): StorageLike | null {
  if (!storage || typeof storage !== "object") {
    return null;
  }

  const candidate = storage as Partial<StorageLike>;
  if (typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function") {
    return null;
  }

  return candidate as StorageLike;
}

function buildApiUrl(config: RuntimeConfig, path: string): string {
  return new URL(path, `${config.apiBaseUrl}/`).toString();
}

function createGuidFallback(): string {
  return `${Date.now()}-${Math.random()}`;
}

export function getClientId(): string {
  const storage = tryGetStorage((globalThis as unknown as { localStorage?: unknown }).localStorage);
  let id = storage ? storage.getItem(CLIENT_ID_KEY) : fallbackClientId;
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : createGuidFallback();
    if (!storage) {
      fallbackClientId = id;
    } else {
      storage.setItem(CLIENT_ID_KEY, id);
    }
  }

  return id;
}

export function getSessionId(): string {
  const storage = tryGetStorage((globalThis as unknown as { sessionStorage?: unknown }).sessionStorage);
  let id = storage ? storage.getItem(SESSION_ID_KEY) : fallbackSessionId;
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : createGuidFallback();
    if (!storage) {
      fallbackSessionId = id;
    } else {
      storage.setItem(SESSION_ID_KEY, id);
    }
  }

  return id;
}

export function getClientType(): string {
  if (typeof navigator === "undefined") {
    return "web";
  }

  return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || "") ? "mobile-web" : "web";
}

export function getDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "Web Browser";
  }

  const platform = navigator.platform || "unknown-platform";
  const ua = navigator.userAgent || "";
  const prefix = getClientType() === "mobile-web" ? "Mobile Browser" : "Web Browser";
  return `${prefix} (${platform}${ua ? `; ${ua.slice(0, 40)}` : ""})`;
}

export async function getVersion(
  config: RuntimeConfig,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  return fetchImpl(buildApiUrl(config, "/api/version"), {
    method: "GET",
    credentials: "include"
  });
}

export async function pairWithToken(
  config: RuntimeConfig,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<PairResponse> {
  const response = await fetchImpl(buildApiUrl(config, "/api/pair"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    throw new Error(`Pairing failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as PairResponse;
}

export async function getRefreshStatus(
  config: RuntimeConfig,
  fetchImpl: typeof fetch = fetch
): Promise<RefreshStatusSnapshot> {
  const response = await fetchImpl(buildApiUrl(config, "/api/refresh/status"), {
    method: "GET",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`Refresh status request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as RefreshStatusSnapshot;
}

export async function requeryAuthoritativeState(
  config: RuntimeConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const clientId = getClientId();
  const sessionId = getSessionId();
  const response = await fetchImpl(buildApiUrl(config, "/api/library-states"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ clientId, sessionId, paths: [] })
  });
  if (!response.ok) {
    throw new Error(`Authoritative requery failed with HTTP ${response.status}.`);
  }
}

export async function getVersionJson(
  config: RuntimeConfig,
  fetchImpl: typeof fetch = fetch
): Promise<VersionResponse> {
  const response = await getVersion(config, fetchImpl);
  if (!response.ok) {
    throw new Error(`Version request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as VersionResponse;
}
