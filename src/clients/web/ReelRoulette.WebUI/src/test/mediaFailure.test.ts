import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYBACK_REQUEST_TIMEOUT_MS, ServerUnreachableError, UnauthorizedError } from "../api/serverRequest";
import {
  couldNotLoadMessage,
  fileExtension,
  mediaFailureMessage,
  probeMedia,
  skipText
} from "../playback/mediaFailure";

afterEach(() => {
  vi.useRealTimers();
});

describe("media failure messages", () => {
  it("reads a file's extension without its dot, in lower case, from a name or a path", () => {
    expect(fileExtension("Holiday.MKV")).toBe("mkv");
    expect(fileExtension("C:\\media\\IMG_1.HEIC")).toBe("heic");
    expect(fileExtension("/media/a.b/clip.webm")).toBe("webm");
    expect(fileExtension("noextension")).toBe("");
  });

  it("words each failure for a video and a photo", () => {
    expect(mediaFailureMessage("video", "format", "Holiday.MKV")).toBe("This video's format (.mkv) isn't supported in this browser.");
    expect(mediaFailureMessage("photo", "format", "IMG_1.HEIC")).toBe("This photo's format (.heic) isn't supported in this browser.");
    expect(mediaFailureMessage("video", "missing", "clip.mp4")).toBe("Video file not found.");
    expect(mediaFailureMessage("photo", "missing", "beach.jpg")).toBe("Photo file not found.");
    expect(mediaFailureMessage("video", "unreadable", "clip.mp4")).toBe(
      "This video couldn't load. The server may be waiting on a slow or disconnected drive or share."
    );
    expect(couldNotLoadMessage("photo")).toBe("This photo couldn't load. The server may be waiting on a slow or disconnected drive or share.");
    expect(skipText("format")).toBe("Skipped a file this browser can't play.");
    expect(skipText("missing")).toBe("Skipped a missing file.");
  });
});

describe("probeMedia", () => {
  function sending(answer: () => Promise<Response>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return answer();
    }) as typeof fetch;
    return { send, calls };
  }

  it("sends a one-byte range request to the media URL and cancels the body it doesn't read", async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const response = new Response("x", { status: 206 });
    Object.defineProperty(response, "body", { value: { cancel } });
    const { send, calls } = sending(async () => response);

    expect(await probeMedia(send, "http://server/api/media/tok")).toEqual({ outcome: "format", statusCode: 206 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://server/api/media/tok");
    expect(calls[0]!.init.method).toBe("GET");
    expect(new Headers(calls[0]!.init.headers).get("Range")).toBe("bytes=0-0");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    [200, "format"],
    [206, "format"],
    [404, "missing"],
    [503, "unreadable"],
    [500, "unreadable"],
    [416, "unreadable"]
  ])("reads a %i as %s", async (statusCode, outcome) => {
    const { send } = sending(async () => new Response(null, { status: statusCode }));
    expect(await probeMedia(send, "http://server/api/media/tok")).toEqual({ outcome, statusCode });
  });

  it("reads no answer within ten seconds as couldn't load, and cancels the request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const send = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as typeof fetch;

    const probe = probeMedia(send, "http://server/api/media/tok");
    await vi.advanceTimersByTimeAsync(PLAYBACK_REQUEST_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await probe).toEqual({ outcome: "unreadable", timeoutMs: 10_000 });
    expect(signal?.aborted).toBe(true);
  });

  it("reads a request that couldn't reach the server as couldn't load, naming only the error's type, and a 401 as pairing", async () => {
    expect(await probeMedia(sending(() => Promise.reject(new ServerUnreachableError())).send, "http://server/api/media/tok")).toEqual({
      outcome: "unreadable",
      error: "ServerUnreachableError"
    });
    expect(await probeMedia(sending(() => Promise.reject(new UnauthorizedError())).send, "http://server/api/media/tok")).toEqual({
      outcome: "unauthorized"
    });
  });
});
