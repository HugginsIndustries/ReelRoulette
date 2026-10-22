import { describe, expect, it, vi } from "vitest";
import { HttpStatusError, ServerUnreachableError, UnauthorizedError } from "../api/serverRequest";
import { createAppApi } from "../state/appApi";
import { REMOTE_CONNECTIONS_OFF } from "./serverReasons";

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

  it("posts JSON", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response("{}"));
    const api = createAppApi("http://localhost:51301", { onUnauthorized: () => {}, fetch: fetchImpl });
    await api.post("/api/favorite", { itemId: "item-1", isFavorite: true });

    expect(calls[0]!.url).toBe("http://localhost:51301/api/favorite");
    expect(calls[0]!.init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: "item-1", isFavorite: true })
    });
  });

  it("reads JSON, asks for pairing on 401, and throws on any failure", async () => {
    const onUnauthorized = vi.fn();
    let status = 200;
    const { calls, fetchImpl } = recordingFetch(() => new Response(JSON.stringify({ ok: true }), { status, headers: { "Content-Type": "application/json" } }));
    const api = createAppApi("http://localhost:51301", { onUnauthorized, fetch: fetchImpl });

    await expect(api.getJson("/api/presets")).resolves.toEqual({ ok: true });
    expect(calls[0]!.url).toBe("http://localhost:51301/api/presets");

    status = 401;
    await expect(api.getJson("/api/presets")).rejects.toThrow("Unauthorized");
    await expect(api.getJson("/api/presets")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);

    status = 503;
    await expect(api.getJson("/api/presets")).rejects.toThrow("HTTP 503");
    await expect(api.getJson("/api/presets")).rejects.toMatchObject({ status: 503, reason: null });
    await expect(api.getJson("/api/presets")).rejects.toBeInstanceOf(HttpStatusError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it("carries the server's reason on a failed read, and none for the empty body an unhandled error gets", async () => {
    let reply = () =>
      new Response(JSON.stringify({ error: REMOTE_CONNECTIONS_OFF }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    const { fetchImpl } = recordingFetch(() => reply());
    const api = createAppApi("http://localhost:51301", { onUnauthorized: () => {}, fetch: fetchImpl });

    await expect(api.getJson("/api/presets")).rejects.toMatchObject({ status: 403, reason: REMOTE_CONNECTIONS_OFF, message: "HTTP 403" });
    await expect(api.postJson("/api/library/query", {})).rejects.toMatchObject({ status: 403, reason: REMOTE_CONNECTIONS_OFF });

    reply = () => new Response(null, { status: 500 });
    await expect(api.getJson("/api/presets")).rejects.toMatchObject({ status: 500, reason: null });
  });

  it("posts JSON and reads the JSON answer, failing as a read does", async () => {
    const onUnauthorized = vi.fn();
    let reply = () => new Response(JSON.stringify({ tags: [] }), { headers: { "Content-Type": "application/json" } });
    const { calls, fetchImpl } = recordingFetch(() => reply());
    const api = createAppApi("http://localhost:51301", { onUnauthorized, fetch: fetchImpl });

    await expect(api.postJson("/api/tag-editor/model", { itemIds: ["item-1"] })).resolves.toEqual({ tags: [] });
    expect(calls[0]!.url).toBe("http://localhost:51301/api/tag-editor/model");
    expect(calls[0]!.init).toMatchObject({ method: "POST", body: JSON.stringify({ itemIds: ["item-1"] }) });

    reply = () => new Response("{}", { status: 401 });
    await expect(api.postJson("/api/tag-editor/model", {})).rejects.toBeInstanceOf(UnauthorizedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    reply = () => new Response("{}", { status: 500 });
    await expect(api.postJson("/api/tag-editor/model", {})).rejects.toThrow("HTTP 500");

    reply = () => new Response("<html>proxy</html>", { headers: { "Content-Type": "text/html" } });
    await expect(api.postJson("/api/tag-editor/model", {})).rejects.toThrow("The server sent an unexpected response (text/html).");
    await expect(api.getJson("/api/presets")).rejects.toThrow("The server sent an unexpected response (text/html).");
  });

  it("asks for pairing on a 401 to a post or any request, naming its route, and throws an UnauthorizedError", async () => {
    const onUnauthorized = vi.fn();
    const { fetchImpl } = recordingFetch(() => new Response("{}", { status: 401 }));
    const api = createAppApi("http://localhost:51301", { onUnauthorized, fetch: fetchImpl });

    await expect(api.post("/api/favorite", {})).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(api.request(api.url("/api/random"), { method: "POST" })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(api.getJson("/api/sources")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(onUnauthorized.mock.calls).toEqual([["POST /api/favorite"], ["POST /api/random"], ["GET /api/sources"]]);
  });

  it("says the server couldn't be reached, whatever the browser calls it", async () => {
    const unreachable = createAppApi("http://localhost:51301", {
      onUnauthorized: () => {},
      fetch: (async () => {
        throw new TypeError("Load failed");
      }) as typeof fetch
    });
    await expect(unreachable.post("/api/favorite", {})).rejects.toBeInstanceOf(ServerUnreachableError);
    await expect(unreachable.getJson("/api/presets")).rejects.toThrow("Couldn't reach the server.");
    await expect(unreachable.postJson("/api/tag-editor/model", {})).rejects.toThrow("Couldn't reach the server.");
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
