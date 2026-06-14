import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { getVersion, pairWithToken, requestPlayItem, requeryAuthoritativeState } from "../api/coreApi";

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
      new Response(JSON.stringify(payload), { status: 200 })
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

  it("escapes item id in request path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Item not found", code: "play_item_not_found" }), {
        status: 404
      })
    ) as unknown as typeof fetch;

    await requestPlayItem(CONFIG, "item/with/slash", { clientId: "web-1", sessionId: "session-1" }, fetchMock);

    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://localhost:51301/api/play/item%2Fwith%2Fslash");
  });

  it("returns structured failure with error and code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Source is disabled for this item", code: "play_source_disabled" }), {
        status: 409
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
      expect(result.statusCode).toBe(409);
      expect(result.error).toBe("Source is disabled for this item");
      expect(result.code).toBe("play_source_disabled");
    }
  });

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
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe("play_item_id_invalid");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
