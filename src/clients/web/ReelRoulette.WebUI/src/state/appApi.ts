import { createServerRequester, HttpStatusError, readJson } from "../api/serverRequest";

/**
 * Server requests the screens share, against the runtime config's API base URL. A request that couldn't reach the
 * server throws a `ServerUnreachableError`, whatever the browser calls it, and every 401 shows the pairing prompt,
 * sends one `last.log` line naming its route, which the server refuses from a device that isn't paired, and throws an
 * `UnauthorizedError`, for which no screen shows or logs a failure of its own.
 */
export interface AppApi {
  url(path: string): string;
  /** Sends a request to the server, as `fetch` does, with the failures above. Pairing doesn't use it. */
  request: typeof fetch;
  /** Posts a JSON body. The caller checks the response. */
  post(path: string, payload?: unknown): Promise<Response>;
  /**
   * Reads a JSON response. A failed status throws an `HttpStatusError`, and a body that isn't JSON an
   * `UnexpectedResponseError`.
   */
  getJson(path: string, options?: RequestInit): Promise<any>;
  /** Posts a JSON body and reads the JSON response, failing as `getJson` does. */
  postJson(path: string, payload?: unknown, options?: RequestInit): Promise<any>;
  /** Sends one line to the server's `last.log`. Best effort: a failure is ignored. */
  relayLog(level: string, message: string): Promise<void>;
}

export interface AppApiOptions {
  /**
   * Called when the server answers 401, so the page can ask for pairing and send its `last.log` line, with the
   * request's route without ids, such as "POST /api/play/{itemId}".
   */
  onUnauthorized: (route: string) => void;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
}

export function createAppApi(apiBaseUrl: string, options: AppApiOptions): AppApi {
  const base = String(apiBaseUrl || "").replace(/\/+$/, "");
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const request = createServerRequester(send, options.onUnauthorized);

  function url(path: string): string {
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    return new URL(normalized, `${base}/`).toString();
  }

  function post(path: string, payload?: unknown, requestOptions: RequestInit = {}): Promise<Response> {
    return request(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      ...requestOptions
    });
  }

  function readSuccess(response: Response): Promise<any> {
    if (!response.ok) {
      throw new HttpStatusError(response.status);
    }
    return readJson(response);
  }

  return {
    url,
    request,
    post(path, payload) {
      return post(path, payload);
    },
    async getJson(path, requestOptions = {}) {
      return readSuccess(await request(url(path), requestOptions));
    },
    async postJson(path, payload, requestOptions = {}) {
      return readSuccess(await post(path, payload, requestOptions));
    },
    async relayLog(level, message) {
      try {
        await send(url("/api/logs/client"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "webui",
            level: level || "info",
            message: String(message || "")
          })
        });
      } catch {
        // Client logging is best-effort and must never break UX flow.
      }
    }
  };
}
