/**
 * Sending requests to the server and reading their JSON, with one wording for each way they fail, whatever the
 * browser or a proxy in between says.
 */

/** The one message for a request that couldn't reach the server, in every browser. */
export const SERVER_UNREACHABLE_MESSAGE = "Couldn't reach the server.";

/** A request that couldn't reach the server, such as one to a server that is stopped. */
export class ServerUnreachableError extends Error {
  constructor() {
    super(SERVER_UNREACHABLE_MESSAGE);
    this.name = "ServerUnreachableError";
  }
}

/** The server answered with a status that isn't a success. Its message is "HTTP {status}". */
export class HttpStatusError extends Error {
  constructor(readonly status: number, message = `HTTP ${status}`) {
    super(message);
    this.name = "HttpStatusError";
  }
}

/** The server answered 401, so the page asks for pairing, which is the only thing to act on. */
export class UnauthorizedError extends HttpStatusError {
  constructor() {
    super(401, "Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** A success whose body isn't JSON, such as a proxy's HTML page. */
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
 * which callers show and log no failure of their own. Pairing itself, whose 401 means a wrong token, sends with
 * `sendRequest` instead.
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

/** The routes that name a preset by id, which `requestRoute` names as `{presetId}`. */
const PRESET_ID_ROUTE = /^\/api\/presets\/[^/]+\/(update|rename|delete)$/;

/**
 * The request's method and route, such as "POST /api/play/{itemId}": without the server, any path the server is
 * reached under before `/api/`, the query, or an item or preset id, so a log line can name it.
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

/** The server's reason for refusing a request, from its `{ "error": ... }` body, or null when it gave none. */
export async function refusalReason(response: Response): Promise<string | null> {
  try {
    const body = await readJson<{ error?: unknown }>(response);
    return typeof body?.error === "string" && body.error.trim() ? body.error : null;
  } catch {
    return null;
  }
}

/** An error's message, or the value itself as text. */
export function errorText(error: unknown): string {
  return (error instanceof Error && error.message) || String(error);
}
