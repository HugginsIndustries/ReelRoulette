import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPlayItem } from "../api/coreApi";
import { HttpStatusError, PLAYBACK_REQUEST_TIMEOUT_MS, UnauthorizedError } from "../api/serverRequest";
import { createAppApi } from "../state/appApi";

const IDENTITY = { clientId: "web-1", sessionId: "session-1" };

function apiWith(fetchMock: typeof fetch, onUnauthorized: (route: string) => void = () => {}) {
  return createAppApi("http://localhost:51301", { onUnauthorized, fetch: fetchMock });
}

describe("requestPlayItem", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns success with PlaybackItemResponse for playable item", async () => {
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

    const outcome = await requestPlayItem(apiWith(fetchMock), "item-1", IDENTITY);

    expect(outcome).toMatchObject({ kind: "answered", value: { ok: true, response: payload } });

    const fetchSpy = fetchMock as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
    const api = apiWith(fetchMock as unknown as typeof fetch);

    await requestPlayItem(api, "item-1", IDENTITY);
    await requestPlayItem(api, "item-1", IDENTITY, { recordPlayback: false });

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

    await requestPlayItem(apiWith(fetchMock), "item/with/slash", IDENTITY);

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

    const outcome = await requestPlayItem(apiWith(fetchMock), "disabled-item", IDENTITY);

    expect(outcome.kind).toBe("answered");
    const result = outcome.kind === "answered" ? outcome.value : null;
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.refusal).toBeInstanceOf(HttpStatusError);
      expect(result.refusal).toMatchObject({ status: 409, reason: "Source is disabled for this item", code: "play_source_disabled" });
    }
  });

  it("fails a 401 with the pairing prompt's UnauthorizedError, asking for pairing once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 })) as unknown as typeof fetch;
    const onUnauthorized = vi.fn();

    const outcome = await requestPlayItem(apiWith(fetchMock, onUnauthorized), "item-1", IDENTITY);

    expect(outcome).toEqual({ kind: "failed", error: expect.any(UnauthorizedError) });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith("POST /api/play/{itemId}");
  });

  it("reads a success that isn't JSON as an unexpected response, naming its content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    ) as unknown as typeof fetch;

    const outcome = await requestPlayItem(apiWith(fetchMock), "item-1", IDENTITY);

    expect(outcome).toMatchObject({ kind: "failed", error: { message: "The server sent an unexpected response (text/html)." } });
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "reads a play that couldn't reach the server, which the browser calls %j, the same in every browser",
    async (wording) => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError(wording)) as unknown as typeof fetch;

      const outcome = await requestPlayItem(apiWith(fetchMock), "item-1", IDENTITY);

      expect(outcome).toMatchObject({ kind: "failed", error: { message: "Couldn't reach the server." } });
    }
  );

  it("gives up on a play the server doesn't answer within the time limit, and cancels it", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const outcome = requestPlayItem(apiWith(fetchMock), "item-1", IDENTITY);
    await vi.advanceTimersByTimeAsync(PLAYBACK_REQUEST_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toEqual({ kind: "timedOut" });
    expect(signal?.aborted).toBe(true);
  });
});
