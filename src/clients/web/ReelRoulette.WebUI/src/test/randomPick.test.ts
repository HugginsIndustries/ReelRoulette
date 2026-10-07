import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RANDOM_PICK_TIMEOUT_MS,
  createRandomPicker,
  type RandomPickOutcome,
  type RandomPickSend
} from "../playback/randomPick";

interface SentRequest {
  body: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
}

/** A send that waits until the test answers each request. */
function heldSend(): { sent: SentRequest[]; send: RandomPickSend } {
  const sent: SentRequest[] = [];
  const send: RandomPickSend = (body, signal) =>
    new Promise<Response>((resolve, reject) => {
      sent.push({ body, signal, resolve, reject });
    });
  return { sent, send };
}

function randomItem(id: string) {
  return {
    id: `/media/${id}.mp4`,
    itemId: id,
    displayName: `${id}.mp4`,
    mediaType: "video" as const,
    mediaUrl: `/api/media/${id}`,
    isFavorite: false,
    isBlacklisted: false
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("randomPick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits ten seconds for the server", () => {
    expect(RANDOM_PICK_TIMEOUT_MS).toBe(10_000);
  });

  it("sends one pick at a time and sends nothing for presses while one is waiting", async () => {
    const { sent, send } = heldSend();
    const picker = createRandomPicker(send);

    const first = picker.pick({ press: 1 });
    await expect(picker.pick({ press: 2 })).resolves.toEqual({ kind: "busy" });
    await expect(picker.pick({ press: 3 })).resolves.toEqual({ kind: "busy" });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body)).toEqual({ press: 1 });

    sent[0].resolve(jsonResponse(randomItem("a")));
    await expect(first).resolves.toEqual({ kind: "picked", item: randomItem("a") });

    const next = picker.pick({ press: 4 });
    expect(sent).toHaveLength(2);
    sent[1].resolve(jsonResponse(randomItem("b")));
    await expect(next).resolves.toEqual({ kind: "picked", item: randomItem("b") });
  });

  it("cancels a pick the server does not answer within the timeout and lets the next press start a fresh one", async () => {
    const { sent, send } = heldSend();
    const picker = createRandomPicker(send);
    let outcome: RandomPickOutcome | undefined;
    void picker.pick({ press: 1 }).then((result) => {
      outcome = result;
    });

    await vi.advanceTimersByTimeAsync(RANDOM_PICK_TIMEOUT_MS - 1);
    expect(outcome).toBeUndefined();
    expect(sent[0].signal.aborted).toBe(false);
    await expect(picker.pick({ press: 2 })).resolves.toEqual({ kind: "busy" });

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toEqual({ kind: "timedOut", timeoutMs: RANDOM_PICK_TIMEOUT_MS });
    expect(sent[0].signal.aborted).toBe(true);
    // A cancelled fetch rejects; that must not reach anyone.
    sent[0].reject(new DOMException("The operation was aborted.", "AbortError"));

    const fresh = picker.pick({ press: 3 });
    expect(sent).toHaveLength(2);
    expect(sent[1].signal.aborted).toBe(false);
    sent[1].resolve(jsonResponse(randomItem("b")));
    await expect(fresh).resolves.toEqual({ kind: "picked", item: randomItem("b") });
  });

  it("ignores an answer that arrives after a newer pick was sent", async () => {
    const { sent, send } = heldSend();
    const picker = createRandomPicker(send);

    const stale = picker.pick({ press: 1 });
    await vi.advanceTimersByTimeAsync(RANDOM_PICK_TIMEOUT_MS);
    await expect(stale).resolves.toEqual({ kind: "timedOut", timeoutMs: RANDOM_PICK_TIMEOUT_MS });

    const newer = picker.pick({ press: 2 });
    sent[0].resolve(jsonResponse(randomItem("late")));
    await vi.advanceTimersByTimeAsync(0);
    // The late answer neither completes the newer pick nor frees it for another press.
    await expect(picker.pick({ press: 3 })).resolves.toEqual({ kind: "busy" });

    sent[1].resolve(jsonResponse(randomItem("b")));
    await expect(newer).resolves.toEqual({ kind: "picked", item: randomItem("b") });
    expect(sent).toHaveLength(2);
  });

  it("maps each kind of answer and frees the next press after it", async () => {
    const answers: Array<() => Promise<Response>> = [
      async () => new Response("", { status: 401 }),
      async () => jsonResponse({ error: "Library not loaded or empty." }, 503),
      async () => jsonResponse({}),
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => new Response("not json", { status: 200 }),
      async () => jsonResponse(randomItem("a"))
    ];
    const picker = createRandomPicker(() => answers.shift()!());

    await expect(picker.pick({})).resolves.toEqual({ kind: "unauthorized" });
    await expect(picker.pick({})).resolves.toEqual({ kind: "failed", statusCode: 503 });
    await expect(picker.pick({})).resolves.toEqual({ kind: "none" });
    await expect(picker.pick({})).resolves.toEqual({ kind: "error", message: "Failed to fetch" });
    await expect(picker.pick({})).resolves.toMatchObject({ kind: "error" });
    await expect(picker.pick({})).resolves.toEqual({ kind: "picked", item: randomItem("a") });
  });
});
