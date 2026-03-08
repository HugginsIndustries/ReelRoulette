import { getVersion, getVersionJson, pairWithToken } from "../api/coreApi";
import type { RuntimeConfig } from "../types/runtimeConfig";
import type { VersionResponse } from "../types/serverContracts";

const WEBUI_API_VERSION = "1";
const SUPPORTED_SERVER_API_VERSIONS = new Set(["1", "0"]);
const REQUIRED_SERVER_CAPABILITIES = [
  "auth.sessionCookie",
  "identity.sessionId",
  "events.refreshStatusChanged",
  "events.resyncRequired",
  "api.random.filterState",
  "api.presets.match"
];

export interface AuthBootstrapResult {
  authorized: boolean;
  paired: boolean;
  message: string;
  version?: VersionResponse;
}

function parseVersion(value: string | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateServerCompatibility(version: VersionResponse): string | null {
  const apiVersion = String(version.apiVersion || "").trim();
  if (!SUPPORTED_SERVER_API_VERSIONS.has(apiVersion)) {
    return `Server API version ${apiVersion || "unknown"} is not supported by this WebUI build.`;
  }

  const minimumCompatible = parseVersion(version.minimumCompatibleApiVersion);
  const webUiVersion = parseVersion(WEBUI_API_VERSION);
  if (Number.isFinite(minimumCompatible) && Number.isFinite(webUiVersion) && webUiVersion < minimumCompatible) {
    return `Server requires client API version ${version.minimumCompatibleApiVersion} or newer.`;
  }

  const capabilitySet = new Set((version.capabilities || []).map((x) => String(x)));
  const missing = REQUIRED_SERVER_CAPABILITIES.filter((key) => !capabilitySet.has(key));
  if (missing.length > 0) {
    return `Server is missing required capabilities: ${missing.join(", ")}.`;
  }

  return null;
}

export async function bootstrapAuthSession(
  config: RuntimeConfig,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<AuthBootstrapResult> {
  const versionResponse = await getVersion(config, fetchImpl);
  if (versionResponse.ok) {
    const version = (await versionResponse.json()) as VersionResponse;
    const compatibilityError = validateServerCompatibility(version);
    if (compatibilityError) {
      return {
        authorized: false,
        paired: false,
        message: compatibilityError,
        version
      };
    }

    return {
      authorized: true,
      paired: false,
      message: "Session authorized.",
      version
    };
  }

  if (versionResponse.status !== 401) {
    return {
      authorized: false,
      paired: false,
      message: `Version probe failed with HTTP ${versionResponse.status}.`
    };
  }

  if (!token) {
    return {
      authorized: false,
      paired: false,
      message: "Pairing token required. Enter token and click Pair."
    };
  }

  await pairWithToken(config, token, fetchImpl);
  const version = await getVersionJson(config, fetchImpl);
  const compatibilityError = validateServerCompatibility(version);
  if (compatibilityError) {
    return {
      authorized: false,
      paired: true,
      message: compatibilityError,
      version
    };
  }

  return {
    authorized: true,
    paired: true,
    message: "Paired and authorized.",
    version
  };
}
