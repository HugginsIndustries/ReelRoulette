import type { RuntimeConfig } from "../types/runtimeConfig";

const RUNTIME_CONFIG_PATH = "/runtime-config.json";

/**
 * What the startup page says when the config doesn't load. Nothing names its status: before the config loads, the page
 * has no server address to send a `last.log` line to.
 */
const RUNTIME_CONFIG_LOAD_FAILED = "Couldn't load the connection settings from the server.";

type RuntimeConfigInput = {
  apiBaseUrl?: unknown;
  sseUrl?: unknown;
  pairToken?: unknown;
};

function normalizeAbsoluteHttpUrl(value: string, key: keyof RuntimeConfig): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Runtime config '${key}' must be a valid absolute URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Runtime config '${key}' must use http or https.`);
  }

  if (!parsed.host) {
    throw new Error(`Runtime config '${key}' must include a host.`);
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  if (key === "apiBaseUrl" && normalizedPath.length > 0) {
    throw new Error("Runtime config 'apiBaseUrl' must be host root (no path).");
  }

  return parsed.href.replace(/\/+$/, "");
}

export function parseRuntimeConfig(raw: RuntimeConfigInput | null | undefined): RuntimeConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Runtime config is missing or invalid.");
  }

  const { apiBaseUrl, sseUrl } = raw;

  if (typeof apiBaseUrl !== "string" || apiBaseUrl.trim().length === 0) {
    throw new Error("Runtime config 'apiBaseUrl' is required.");
  }

  if (typeof sseUrl !== "string" || sseUrl.trim().length === 0) {
    throw new Error("Runtime config 'sseUrl' is required.");
  }

  return {
    apiBaseUrl: normalizeAbsoluteHttpUrl(apiBaseUrl.trim(), "apiBaseUrl"),
    sseUrl: normalizeAbsoluteHttpUrl(sseUrl.trim(), "sseUrl"),
    pairToken: typeof raw.pairToken === "string" && raw.pairToken.trim().length > 0
      ? raw.pairToken.trim()
      : undefined
  };
}

/** Loads the config. A request that can't reach the server or that it refuses throws `RUNTIME_CONFIG_LOAD_FAILED`. */
export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<RuntimeConfig> {
  let response: Response;
  try {
    response = await fetchImpl(RUNTIME_CONFIG_PATH, {
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });
  } catch {
    throw new Error(RUNTIME_CONFIG_LOAD_FAILED);
  }

  if (!response.ok) {
    throw new Error(RUNTIME_CONFIG_LOAD_FAILED);
  }

  const data = (await response.json()) as RuntimeConfigInput;
  return parseRuntimeConfig(data);
}
