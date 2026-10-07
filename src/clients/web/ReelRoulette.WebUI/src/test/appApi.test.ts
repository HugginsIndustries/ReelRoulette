import { describe, expect, it, vi } from "vitest";
import { createAppApi } from "../state/appApi";

function recordingFetch(reply: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return reply();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("createAppApi", () => {
  it("builds URLs against the API base, with or without a trailing slash", () => {
    const api = createAppApi("http://localhost:51301/", { onUnauthorized: () => {} });
    expect(api.url("/api/version")).toBe("http://localhost:51301/api/version");
    expect(api.url("api/presets")).toBe("http://localhost:51301/api/presets");
  });

  it("posts JSON with credentials", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response("{}"));
    const api = createAppApi("http://localhost:51301", { onUnauthorized: () => {}, fetch: fetchImpl });
    await api.post("/api/favorite", { path: "item-1", isFavorite: true });

    expect(calls[0]!.url).toBe("http://localhost:51301/api/favorite");
    expect(calls[0]!.init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "item-1", isFavorite: true })
    });
  });

  it("reads JSON, asks for pairing on 401, and throws on any failure", async () => {
    const onUnauthorized = vi.fn();
    let status = 200;
    const { calls, fetchImpl } = recordingFetch(() => new Response(JSON.stringify({ ok: true }), { status }));
    const api = createAppApi("http://localhost:51301", { onUnauthorized, fetch: fetchImpl });

    await expect(api.getJson("/api/presets")).resolves.toEqual({ ok: true });
    expect(calls[0]!.init?.credentials).toBe("include");

    status = 401;
    await expect(api.getJson("/api/presets")).rejects.toThrow("Unauthorized");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    status = 503;
    await expect(api.getJson("/api/presets")).rejects.toThrow("HTTP 503");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("relays a log line as the WebUI, and ignores a failure to send it", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response(null, { status: 204 }));
    const api = createAppApi("http://localhost:51301", { onUnauthorized: () => {}, fetch: fetchImpl });
    await api.relayLog("warn", "playback=start");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ source: "webui", level: "warn", message: "playback=start" });

    const failing = createAppApi("http://localhost:51301", {
      onUnauthorized: () => {},
      fetch: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch
    });
    await expect(failing.relayLog("info", "status=Ready")).resolves.toBeUndefined();
  });
});
