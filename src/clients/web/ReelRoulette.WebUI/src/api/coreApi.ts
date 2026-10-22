import type { RuntimeConfig } from "../types/runtimeConfig";
import { HttpStatusError, readJson, refusalError, sendRequest } from "./serverRequest";
import type { components } from "../types/openapi.generated";

type RandomResponse = components["schemas"]["RandomResponse"];

export type PlayItemSuccess = {
  ok: true;
  statusCode: number;
  response: RandomResponse;
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

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function tryGetStorage(storage: unknown): StorageLike | null {
  if (!storage || typeof storage !== "object") {
    return null;
  }

  const candidate = storage as Partial<StorageLike>;
  if (typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function") {
    return null;
  }

  return candidate as StorageLike;
}

function buildApiUrl(config: Pick<RuntimeConfig, "apiBaseUrl">, path: string): string {
  return new URL(path, `${config.apiBaseUrl}/`).toString();
}

function createGuidFallback(): string {
  return `${Date.now()}-${Math.random()}`;
}

export function getClientId(): string {
  const storage = tryGetStorage((globalThis as unknown as { localStorage?: unknown }).localStorage);
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
  const storage = tryGetStorage((globalThis as unknown as { sessionStorage?: unknown }).sessionStorage);
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
   * False gets a fresh media URL for an item already playing, which counts no play and publishes no
   * `playbackRecorded`. Defaults to true, sending the default body.
   */
  recordPlayback?: boolean;
  /** Cancels the request. */
  signal?: AbortSignal;
}

/**
 * Plays an item through `POST /api/play/{itemId}`. A refusal comes back as a `PlayItemFailure`, read as `refusalError`
 * reads it. A request that couldn't reach the server throws a `ServerUnreachableError`, and a success whose body isn't
 * JSON an `UnexpectedResponseError`.
 */
export async function requestPlayItem(
  config: Pick<RuntimeConfig, "apiBaseUrl">,
  itemId: string,
  identity: { clientId: string; sessionId: string },
  fetchImpl: typeof fetch = fetch,
  options: PlayItemOptions = {}
): Promise<PlayItemResult> {
  const trimmedItemId = itemId.trim();
  if (!trimmedItemId) {
    return { ok: false, refusal: new HttpStatusError(400, "itemId is required", "play_item_id_invalid") };
  }

  const encodedItemId = encodeURIComponent(trimmedItemId);
  const response = await sendRequest(fetchImpl, buildApiUrl(config, `/api/play/${encodedItemId}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      clientId: identity.clientId,
      sessionId: identity.sessionId,
      ...(options.recordPlayback === false ? { recordPlayback: false } : {})
    }),
    signal: options.signal
  });

  if (response.ok) {
    const playResponse = await readJson<RandomResponse>(response);
    return {
      ok: true,
      statusCode: response.status,
      response: playResponse
    };
  }

  return { ok: false, refusal: await refusalError(response) };
}
