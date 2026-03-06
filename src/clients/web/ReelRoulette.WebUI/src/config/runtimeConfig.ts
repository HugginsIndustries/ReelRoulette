import type { RuntimeConfig } from "../types/runtimeConfig";

const RUNTIME_CONFIG_PATH = "/runtime-config.json";

type RuntimeConfigInput = {
  apiBaseUrl?: unknown;
  sseUrl?: unknown;
  pairToken?: unknown;
};

declare global {
  interface Window {
    __REEL_ROULETTE_RUNTIME_CONFIG?: RuntimeConfigInput;
  }
}

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

export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<RuntimeConfig> {
  if (typeof window !== "undefined" && window.__REEL_ROULETTE_RUNTIME_CONFIG) {
    return parseRuntimeConfig(window.__REEL_ROULETTE_RUNTIME_CONFIG);
  }

  const response = await fetchImpl(RUNTIME_CONFIG_PATH, {
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Runtime config could not be loaded from '${RUNTIME_CONFIG_PATH}' (HTTP ${response.status}).`
    );
  }

  const data = (await response.json()) as RuntimeConfigInput;
  return parseRuntimeConfig(data);
}
