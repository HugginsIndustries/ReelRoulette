import type { RuntimeConfig } from "../types/runtimeConfig";
import type { PairResponse, RefreshStatusSnapshot, VersionResponse } from "../types/serverContracts";

const CLIENT_ID_KEY = "rr_clientId";
const SESSION_ID_KEY = "rr_sessionId";
let fallbackClientId: string | null = null;
let fallbackSessionId: string | null = null;

function buildApiUrl(config: RuntimeConfig, path: string): string {
  return new URL(path, `${config.apiBaseUrl}/`).toString();
}

function createGuidFallback(): string {
  return `${Date.now()}-${Math.random()}`;
}

export function getClientId(): string {
  let id = typeof localStorage === "undefined" ? fallbackClientId : localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : createGuidFallback();
    if (typeof localStorage === "undefined") {
      fallbackClientId = id;
    } else {
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
  }

  return id;
}

export function getSessionId(): string {
  let id = typeof sessionStorage === "undefined" ? fallbackSessionId : sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : createGuidFallback();
    if (typeof sessionStorage === "undefined") {
      fallbackSessionId = id;
    } else {
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
  }

  return id;
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
