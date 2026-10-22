import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { requestPlayItem } from "../api/coreApi";
import { HttpStatusError } from "../api/serverRequest";

const CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://localhost:51301",
  sseUrl: "http://localhost:51301/api/events"
};

describe("requestPlayItem", () => {
  it("returns success with RandomResponse for playable item", async () => {
    const payload = {
      id: "/media/a.mp4",
      displayName: "a.mp4",
      mediaType: "video",
      mediaUrl: "/api/media/token-1",
      isFavorite: false,
      isBlacklisted: false
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
    ) as unknown as typeof fetch;

    const result = await requestPlayItem(
      CONFIG,
      "item-1",
      { clientId: "web-1", sessionId: "session-1" },
      fetchMock
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.statusCode).toBe(200);
      expect(result.response.id).toBe("/media/a.mp4");
      expect(result.response.mediaUrl).toBe("/api/media/token-1");
    }

    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://localhost:51301/api/play/item-1");
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.clientId).toBe("web-1");
    expect(body.sessionId).toBe("session-1");
  });

  it("asks for a fresh media URL without counting a play only when told to", async () => {
    const answer = () =>
      new Response(JSON.stringify({ mediaUrl: "/api/media/token-2" }), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn().mockImplementation(async () => answer());
    const identity = { clientId: "web-1", sessionId: "session-1" };

    await requestPlayItem(CONFIG, "item-1", identity, fetchMock as unknown as typeof fetch);
    await requestPlayItem(CONFIG, "item-1", identity, fetchMock as unknown as typeof fetch, { recordPlayback: false });

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies).toEqual([
      { clientId: "web-1", sessionId: "session-1" },
      { clientId: "web-1", sessionId: "session-1", recordPlayback: false }
    ]);
  });

  it("escapes item id in request path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Item not found", code: "play_item_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })
    ) as unknown as typeof fetch;

    await requestPlayItem(CONFIG, "item/with/slash", { clientId: "web-1", sessionId: "session-1" }, fetchMock);

    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://localhost:51301/api/play/item%2Fwith%2Fslash");
  });

  it("returns the refusal with its status, reason, and code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Source is disabled for this item", code: "play_source_disabled" }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      })
    ) as unknown as typeof fetch;

    const result = await requestPlayItem(
      CONFIG,
      "disabled-item",
      { clientId: "web-1", sessionId: "session-1" },
      fetchMock
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toBeInstanceOf(HttpStatusError);
      expect(result.refusal).toMatchObject({ status: 409, reason: "Source is disabled for this item", code: "play_source_disabled" });
    }
  });

  it("reads a success that isn't JSON as an unexpected response, naming its content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    ) as unknown as typeof fetch;

    await expect(
      requestPlayItem(CONFIG, "item-1", { clientId: "web-1", sessionId: "session-1" }, fetchMock)
    ).rejects.toThrow("The server sent an unexpected response (text/html).");
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "reads a play that couldn't reach the server, which the browser calls %j, the same in every browser",
    async (wording) => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError(wording)) as unknown as typeof fetch;

      await expect(
        requestPlayItem(CONFIG, "item-1", { clientId: "web-1", sessionId: "session-1" }, fetchMock)
      ).rejects.toThrow("Couldn't reach the server.");
    }
  );

  it("fails locally when item id is blank", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const result = await requestPlayItem(
      CONFIG,
      "   ",
      { clientId: "web-1", sessionId: "session-1" },
      fetchMock
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toMatchObject({ status: 400, code: "play_item_id_invalid" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
