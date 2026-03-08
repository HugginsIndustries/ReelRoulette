import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { getVersion, pairWithToken, requeryAuthoritativeState } from "../api/coreApi";

const CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://localhost:51301",
  sseUrl: "http://localhost:51301/api/events"
};

describe("coreApi endpoint composition", () => {
  it("uses /api/version against host-root apiBaseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    await getVersion(CONFIG, fetchMock);
    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://localhost:51301/api/version");
  });

  it("uses /api/pair against host-root apiBaseUrl", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ paired: true, message: "ok" }), { status: 200 })) as unknown as typeof fetch;
    await pairWithToken(CONFIG, "dev-token", fetchMock);
    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://localhost:51301/api/pair");
  });

  it("sends client/session identity for authoritative requery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    await requeryAuthoritativeState(CONFIG, fetchMock);
    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://localhost:51301/api/library-states");
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.clientId).toBeTruthy();
    expect(body.sessionId).toBeTruthy();
    expect(body.paths).toEqual([]);
  });
});
