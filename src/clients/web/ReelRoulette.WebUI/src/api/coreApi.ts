import { browserStorage } from "../state/deviceStore";
import type { AppApi } from "../state/appApi";
import {
  PLAYBACK_REQUEST_TIMEOUT_MS,
  readJson,
  refusalError,
  withTimeout,
  type HttpStatusError,
  type TimedOutcome
} from "./serverRequest";
import type { components } from "../types/openapi.generated";

type PlaybackItemResponse = components["schemas"]["PlaybackItemResponse"];

export type PlayItemSuccess = {
  ok: true;
  response: PlaybackItemResponse;
};

/** A play the server refused, with its status and, when it gave them, its reason and code. */
export type PlayItemFailure = {
  ok: false;
  refusal: HttpStatusError;
};

export type PlayItemResult = PlayItemSuccess | PlayItemFailure;

const CLIENT_ID_KEY = "rr_clientId";
const SESSION_ID_KEY = "rr_sessionId";
let fallbackClientId: string | null = null;
let fallbackSessionId: string | null = null;

function createGuidFallback(): string {
  return `${Date.now()}-${Math.random()}`;
}

export function getClientId(): string {
  const storage = browserStorage("localStorage");
  let id = storage ? storage.getItem(CLIENT_ID_KEY) : fallbackClientId;
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : createGuidFallback();
    if (!storage) {
      fallbackClientId = id;
    } else {
      storage.setItem(CLIENT_ID_KEY, id);
    }
  }

  return id;
}

export function getSessionId(): string {
  const storage = browserStorage("sessionStorage");
  let id = storage ? storage.getItem(SESSION_ID_KEY) : fallbackSessionId;
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : createGuidFallback();
    if (!storage) {
      fallbackSessionId = id;
    } else {
      storage.setItem(SESSION_ID_KEY, id);
    }
  }

  return id;
}

export function getClientType(): string {
  if (typeof navigator === "undefined") {
    return "web";
  }

  return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || "") ? "mobile-web" : "web";
}

export function getDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "Web Browser";
  }

  const platform = navigator.platform || "unknown-platform";
  const ua = navigator.userAgent || "";
  const prefix = getClientType() === "mobile-web" ? "Mobile Browser" : "Web Browser";
  return `${prefix} (${platform}${ua ? `; ${ua.slice(0, 40)}` : ""})`;
}

export interface PlayItemOptions {
  /**
   * False counts no play and publishes no `playbackRecorded`: for a fresh media URL for an item already playing, or
   * for any play while Don't record plays is on. Defaults to true, sending the default body.
   */
  recordPlayback?: boolean;
}

/**
 * Plays an item through `POST /api/play/{itemId}`, waiting at most `PLAYBACK_REQUEST_TIMEOUT_MS`, as `withTimeout`
 * waits. A refusal answers a `PlayItemFailure`, read as `refusalError` reads it. A request that couldn't reach the
 * server fails with a `ServerUnreachableError`, a 401 with the `UnauthorizedError` of `api.request`, and a success whose
 * body isn't JSON with an `UnexpectedResponseError`.
 */
export function requestPlayItem(
  api: Pick<AppApi, "request" | "url">,
  itemId: string,
  identity: { clientId: string; sessionId: string },
  options: PlayItemOptions = {}
): Promise<TimedOutcome<PlayItemResult>> {
  return withTimeout(async (signal): Promise<PlayItemResult> => {
    const response = await api.request(api.url(`/api/play/${encodeURIComponent(itemId)}`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clientId: identity.clientId,
        sessionId: identity.sessionId,
        ...(options.recordPlayback === false ? { recordPlayback: false } : {})
      }),
      signal
    });

    if (response.ok) {
      return { ok: true, response: await readJson<PlaybackItemResponse>(response) };
    }

    return { ok: false, refusal: await refusalError(response) };
  }, PLAYBACK_REQUEST_TIMEOUT_MS);
}
