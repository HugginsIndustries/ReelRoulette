/**
 * Sending requests to the server and reading their JSON, with one wording for each way they fail, whatever the
 * browser or a proxy in between says. An error's message is what `last.log` gets; `requestFailure` words it for the
 * user, without a status code or a content type.
 */

/** The one message for a request that couldn't reach the server, in every browser. */
export const SERVER_UNREACHABLE_MESSAGE = "Couldn't reach the server.";

/** What the user sees for a success whose body isn't JSON, without its content type. */
const UNEXPECTED_RESPONSE_MESSAGE = "The server sent an unexpected response.";

/** A request that couldn't reach the server, such as one to a server that is stopped. */
export class ServerUnreachableError extends Error {
  constructor() {
    super(SERVER_UNREACHABLE_MESSAGE);
    this.name = "ServerUnreachableError";
  }
}

/**
 * The server answered with a status that isn't a success, with its reason and its code, such as
 * "play_media_unreadable", when it gave them. Its message is "HTTP {status}", for `last.log`, since the reason can name
 * a file or a preset.
 */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null = null,
    readonly code: string | null = null,
    message = `HTTP ${status}`
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

/** The server answered 401, so the page asks for pairing, which is the only thing to act on. */
export class UnauthorizedError extends HttpStatusError {
  constructor() {
    super(401, null, null, "Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** A success whose body isn't JSON, such as a proxy's HTML page. Its message names the content type, for `last.log`. */
export class UnexpectedResponseError extends Error {
  constructor(contentType: string) {
    super(`The server sent an unexpected response (${contentType}).`);
    this.name = "UnexpectedResponseError";
  }
}

/**
 * Sends a request. The browser reports a request that couldn't reach the server as a `TypeError` in its own words
 * ("Failed to fetch" in Chrome, "Load failed" in Safari, "NetworkError when attempting to fetch resource." in
 * Firefox), which becomes a `ServerUnreachableError`. A cancelled request still throws its `AbortError`.
 */
export async function sendRequest(send: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await send(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ServerUnreachableError();
    }
    throw error;
  }
}

/**
 * Sends requests to the server as `sendRequest` does, and answers every 401 in one place: it asks for pairing, whose
 * prompt is the only thing to act on, with the request's route as `requestRoute` names it, for the one `last.log` line
 * the page sends, which the server refuses from a device that isn't paired, and throws an `UnauthorizedError`, for
 * which callers show and log no failure of their own. Pairing itself, whose 401 means a wrong token, and the `/control`
 * routes, whose 401 means the control token is needed, go around it through `AppApi.requestAroundPairing`.
 */
export function createServerRequester(send: typeof fetch, onUnauthorized: (route: string) => void): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await sendRequest(send, input, init);
    if (response.status === 401) {
      onUnauthorized(requestRoute(input, init));
      throw new UnauthorizedError();
    }
    return response;
  }) as typeof fetch;
}

/** Routes that end in an item id, which `requestRoute` names as `{itemId}`. */
const ITEM_ID_ROUTES: readonly string[] = ["/api/play/", "/api/show-in-file-manager/"];

/** The media route, whose token `requestRoute` names as `{token}`, so a log line never carries one. */
const MEDIA_ROUTE = "/api/media/";

/** The routes that name a preset by id, which `requestRoute` names as `{presetId}`. */
const PRESET_ID_ROUTE = /^\/api\/presets\/[^/]+\/(update|rename|delete)$/;

/**
 * The request's method and route, such as "POST /api/play/{itemId}": without the server, any path the server is
 * reached under before `/api/`, the query, an item or preset id, or a media token, so a log line can name it.
 */
export function requestRoute(input: RequestInfo | URL, init?: RequestInit): string {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const path = new URL(request ? request.url : String(input), "http://localhost").pathname;
  const apiStart = path.indexOf("/api/");
  const route = apiStart >= 0 ? path.slice(apiStart) : path;
  const idRoute = ITEM_ID_ROUTES.find((prefix) => route.startsWith(prefix));
  if (idRoute) {
    return `${method} ${idRoute}{itemId}`;
  }
  if (route.startsWith(MEDIA_ROUTE)) {
    return `${method} ${MEDIA_ROUTE}{token}`;
  }
  const presetRoute = PRESET_ID_ROUTE.exec(route);
  return `${method} ${presetRoute ? `/api/presets/{presetId}/${presetRoute[1]}` : route}`;
}

/** The one `last.log` line for a 401, naming the request's route as `requestRoute` does. */
export function unauthorizedLogText(route: string): string {
  return `Unauthorized. Pair first. (${route})`;
}

/** The response's media type without its parameters, lower-cased, or empty when it has none. */
function mediaType(response: Response): string {
  return (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
}

/**
 * Reads a JSON body, as `application/json` or any `+json` type. Any other content type, or a body that doesn't parse,
 * throws an `UnexpectedResponseError` that names the type, in place of a `SyntaxError`.
 */
export async function readJson<T = any>(response: Response): Promise<T> {
  const type = mediaType(response);
  const described = type || "no content type";
  if (type !== "application/json" && !(type.startsWith("application/") && type.endsWith("+json"))) {
    throw new UnexpectedResponseError(described);
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new UnexpectedResponseError(described);
    }
    throw error;
  }
}

/**
 * The error for a response whose status isn't a success, with the server's reason and code when its
 * `{ "error": ..., "code": ... }` body gives them.
 */
export async function refusalError(response: Response): Promise<HttpStatusError> {
  let body: { error?: unknown; code?: unknown } | null = null;
  try {
    body = await readJson(response);
  } catch {
    // A body that isn't JSON gives neither.
  }
  const reason = typeof body?.error === "string" && body.error.trim() ? body.error : null;
  const code = typeof body?.code === "string" && body.code ? body.code : null;
  return new HttpStatusError(response.status, reason, code);
}

/** An error's message, or the value itself as text. */
export function errorText(error: unknown): string {
  return (error instanceof Error && error.message) || String(error);
}

/** Where a failure shows: the in-app notice, which relays `logText` to `last.log` in place of the message. */
type NoticeDialogs = { notice(message: string, logText?: string): Promise<void> };

/** A failed request, worded for the user and for `last.log`. */
export interface RequestFailure {
  text: string;
  logText: string;
}

/**
 * Words a failed request, with `failed` naming what failed, such as "Saving presets failed". A refusal reads
 * "{failed}: {the server's reason}", or "{failed}." without one, and is logged as "{failed} (HTTP {status}).", without
 * the reason, which can name a file or a preset. Any other failure reads "{failed}: {why}", and only the log names a
 * response's content type.
 */
export function requestFailure(failed: string, error: unknown): RequestFailure {
  if (error instanceof HttpStatusError) {
    return { text: error.reason ? `${failed}: ${error.reason}` : `${failed}.`, logText: `${failed} (HTTP ${error.status}).` };
  }
  const logText = `${failed}: ${errorText(error)}`;
  return { text: error instanceof UnexpectedResponseError ? `${failed}: ${UNEXPECTED_RESPONSE_MESSAGE}` : logText, logText };
}

/**
 * Shows a failed request in `dialogs`' notice, worded as `requestFailure` words it, except a 401, which shows only the
 * pairing prompt the request has asked for.
 */
export function noticeRequestFailure(dialogs: NoticeDialogs, failed: string, error: unknown): void {
  if (error instanceof UnauthorizedError) {
    return;
  }
  const { text, logText } = requestFailure(failed, error);
  void dialogs.notice(text, logText);
}

/**
 * Sends a request with `read`, which throws on a failure as `AppApi.postJson` does, and answers what it read, or null
 * once the failure shows in `dialogs`' notice, as `noticeRequestFailure` shows it.
 */
export async function readWithNotice<T>(dialogs: NoticeDialogs, failed: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    noticeRequestFailure(dialogs, failed, error);
    return null;
  }
}

/**
 * Sends a change with `send` and says whether the server took it. A failure shows in `dialogs`' notice, as
 * `noticeRequestFailure` shows it.
 */
export async function requestWithNotice(dialogs: NoticeDialogs, failed: string, send: () => Promise<Response>): Promise<boolean> {
  const taken = await readWithNotice(dialogs, failed, async () => {
    const response = await send();
    if (!response.ok) {
      throw await refusalError(response);
    }
    return true;
  });
  return taken ?? false;
}

/**
 * How long a playback request may wait for the server before the WebUI cancels it: a random pick, the range request
 * about a file whose media failed, and a play request for a fresh media URL.
 */
export const PLAYBACK_REQUEST_TIMEOUT_MS = 10_000;

export type TimedOutcome<T> =
  | { kind: "answered"; value: T }
  | { kind: "failed"; error: unknown }
  /** No answer within the limit, and the request was cancelled. */
  | { kind: "timedOut" };

/**
 * Runs one request with a time limit: one that doesn't settle in time is cancelled through its signal, and its answer
 * is never used, even when it arrives later.
 */
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<TimedOutcome<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<TimedOutcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timedOut" }), timeoutMs);
  });
  const settled = run(controller.signal).then(
    (value): TimedOutcome<T> => ({ kind: "answered", value }),
    (error: unknown): TimedOutcome<T> => ({ kind: "failed", error })
  );
  try {
    const outcome = await Promise.race([settled, timedOut]);
    if (outcome.kind === "timedOut") {
      controller.abort();
    }
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}
