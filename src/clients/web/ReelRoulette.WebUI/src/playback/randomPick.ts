import type { components } from "../types/openapi.generated";

type RandomResponse = components["schemas"]["RandomResponse"];

/** How long a random pick may wait for the server before the WebUI cancels it. */
export const RANDOM_PICK_TIMEOUT_MS = 10_000;

export type RandomPickOutcome =
  /** A pick is already waiting for the server, so nothing was sent. */
  | { kind: "busy" }
  | { kind: "picked"; item: RandomResponse }
  /** The server found nothing eligible for the filter. */
  | { kind: "none" }
  | { kind: "unauthorized" }
  | { kind: "failed"; statusCode: number }
  | { kind: "error"; message: string }
  /** The server did not answer in time, and the request was cancelled. */
  | { kind: "timedOut"; timeoutMs: number };

/** Sends one `POST /api/random` body; the signal cancels it. */
export type RandomPickSend = (body: string, signal: AbortSignal) => Promise<Response>;

export interface RandomPicker {
  pick(body: unknown): Promise<RandomPickOutcome>;
}

/**
 * Random picks for one page, one request at a time, so repeated presses cannot play and record several
 * items. A pick the server does not answer within the timeout is cancelled and resolves as timed out, and
 * its answer is never used, even when it arrives after a newer pick was sent.
 */
export function createRandomPicker(send: RandomPickSend, timeoutMs: number = RANDOM_PICK_TIMEOUT_MS): RandomPicker {
  let inFlight = false;
  return {
    async pick(body) {
      if (inFlight) {
        return { kind: "busy" };
      }

      inFlight = true;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<RandomPickOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timedOut", timeoutMs }), timeoutMs);
      });
      try {
        const outcome = await Promise.race([request(send, JSON.stringify(body), controller.signal), timedOut]);
        if (outcome.kind === "timedOut") {
          controller.abort();
        }
        return outcome;
      } finally {
        clearTimeout(timer);
        inFlight = false;
      }
    }
  };
}

async function request(send: RandomPickSend, body: string, signal: AbortSignal): Promise<RandomPickOutcome> {
  try {
    const response = await send(body, signal);
    if (response.status === 401) {
      return { kind: "unauthorized" };
    }
    if (!response.ok) {
      return { kind: "failed", statusCode: response.status };
    }

    const data = (await response.json()) as Partial<RandomResponse> | null;
    if (!data?.mediaUrl) {
      return { kind: "none" };
    }
    return { kind: "picked", item: data as RandomResponse };
  } catch (error) {
    return { kind: "error", message: (error instanceof Error && error.message) || String(error) };
  }
}
