import { getVersion, getVersionJson, pairWithToken } from "../api/coreApi";
import type { RuntimeConfig } from "../types/runtimeConfig";
import type { VersionResponse } from "../types/serverContracts";

export interface AuthBootstrapResult {
  authorized: boolean;
  paired: boolean;
  message: string;
  version?: VersionResponse;
}

export async function bootstrapAuthSession(
  config: RuntimeConfig,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<AuthBootstrapResult> {
  const versionResponse = await getVersion(config, fetchImpl);
  if (versionResponse.ok) {
    return {
      authorized: true,
      paired: false,
      message: "Session authorized.",
      version: (await versionResponse.json()) as VersionResponse
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
  return {
    authorized: true,
    paired: true,
    message: "Paired and authorized.",
    version
  };
}
