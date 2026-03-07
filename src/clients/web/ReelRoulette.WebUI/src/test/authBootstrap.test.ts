import { describe, expect, it, vi } from "vitest";
import { bootstrapAuthSession } from "../auth/authBootstrap";
import type { RuntimeConfig } from "../types/runtimeConfig";

const CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://localhost:51301",
  sseUrl: "http://localhost:51301/api/events"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("bootstrapAuthSession", () => {
  const compatibleVersion = {
    appVersion: "dev",
    apiVersion: "1",
    assetsVersion: "m7",
    minimumCompatibleApiVersion: "0",
    supportedApiVersions: ["1", "0"],
    capabilities: [
      "auth.sessionCookie",
      "events.refreshStatusChanged",
      "events.resyncRequired",
      "api.random.filterState",
      "api.presets.match"
    ]
  };

  it("returns authorized when version endpoint succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(compatibleVersion)
    ) as unknown as typeof fetch;

    const result = await bootstrapAuthSession(CONFIG, undefined, fetchMock);
    expect(result.authorized).toBe(true);
    expect(result.paired).toBe(false);
  });

  it("pairs when unauthorized and token supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ paired: true, message: "ok" }))
      .mockResolvedValueOnce(jsonResponse(compatibleVersion)) as unknown as typeof fetch;

    const result = await bootstrapAuthSession(CONFIG, "dev-token", fetchMock);
    expect(result.authorized).toBe(true);
    expect(result.paired).toBe(true);
  });

  it("rejects unsupported server api version", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ...compatibleVersion,
        apiVersion: "3",
        supportedApiVersions: ["3", "2"]
      })
    ) as unknown as typeof fetch;

    const result = await bootstrapAuthSession(CONFIG, undefined, fetchMock);
    expect(result.authorized).toBe(false);
    expect(result.message).toContain("not supported");
  });

  it("rejects missing required capabilities", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ...compatibleVersion,
        capabilities: ["events.refreshStatusChanged"]
      })
    ) as unknown as typeof fetch;

    const result = await bootstrapAuthSession(CONFIG, undefined, fetchMock);
    expect(result.authorized).toBe(false);
    expect(result.message).toContain("missing required capabilities");
  });
});
