import { describe, expect, it, vi } from "vitest";
import { bootstrapAuthSession } from "../auth/authBootstrap";
import type { RuntimeConfig } from "../types/runtimeConfig";

const CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://localhost:51301/api",
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
  it("returns authorized when version endpoint succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        appVersion: "dev",
        apiVersion: "1"
      })
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
      .mockResolvedValueOnce(jsonResponse({ appVersion: "dev", apiVersion: "1" })) as unknown as typeof fetch;

    const result = await bootstrapAuthSession(CONFIG, "dev-token", fetchMock);
    expect(result.authorized).toBe(true);
    expect(result.paired).toBe(true);
  });
});
