import type { ServerVersion } from "./appStore";

// Version 2 names items only by id on every route that takes an item id, and makes clearing every item's playback
// stats explicit.
const WEBUI_API_VERSION = "2";
const SUPPORTED_SERVER_API_VERSIONS = new Set(["2"]);
const REQUIRED_SERVER_CAPABILITIES = [
  "auth.sessionCookie",
  "identity.sessionId",
  "events.refreshStatusChanged",
  "events.resyncRequired",
  "api.random.filterState",
  "api.presets.match"
];

/** The parts of `GET /api/version` the compatibility check and Diagnostics read. */
export interface ServerVersionInfo {
  appVersion?: unknown;
  assetsVersion?: unknown;
  apiVersion?: unknown;
  minimumCompatibleApiVersion?: unknown;
  capabilities?: unknown;
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The server's release version and API version, which the Settings tab's Diagnostics shows. `assetsVersion` is the
 * release version, such as "0.15.0", while `appVersion` is the server's 4-part assembly version, such as "0.15.0.0",
 * so `appVersion` is read only from a server that sends no `assetsVersion`.
 */
export function serverVersionOf(version: ServerVersionInfo | null | undefined): ServerVersion {
  return {
    version: trimmedText(version?.assetsVersion) || trimmedText(version?.appVersion),
    apiVersion: trimmedText(version?.apiVersion)
  };
}

function parseApiVersion(value: unknown): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** The status message that blocks this WebUI from a server it cannot work with, or null when it can. */
export function serverCompatibilityError(version: ServerVersionInfo | null | undefined): string | null {
  const apiVersion = String(version?.apiVersion || "").trim();
  if (!SUPPORTED_SERVER_API_VERSIONS.has(apiVersion)) {
    return `Unsupported server API version: ${apiVersion || "unknown"}.`;
  }

  const minimumCompatible = parseApiVersion(version?.minimumCompatibleApiVersion);
  const webUiVersion = parseApiVersion(WEBUI_API_VERSION);
  if (Number.isFinite(minimumCompatible) && Number.isFinite(webUiVersion) && webUiVersion < minimumCompatible) {
    return `Server requires client API version ${String(version?.minimumCompatibleApiVersion)} or newer.`;
  }

  const capabilities = Array.isArray(version?.capabilities) ? version.capabilities.map((x) => String(x)) : [];
  const capabilitySet = new Set(capabilities);
  const missing = REQUIRED_SERVER_CAPABILITIES.filter((key) => !capabilitySet.has(key));
  if (missing.length > 0) {
    return `Server missing required capabilities: ${missing.join(", ")}.`;
  }

  return null;
}
