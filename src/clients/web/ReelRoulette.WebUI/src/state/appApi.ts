/** Server requests the screens share, against the runtime config's API base URL. */
export interface AppApi {
  url(path: string): string;
  /** Posts a JSON body. The caller checks the response. */
  post(path: string, payload?: unknown): Promise<Response>;
  /** Reads a JSON response. A 401 shows the pairing prompt, and any failure throws. */
  getJson(path: string, options?: RequestInit): Promise<any>;
  /** Sends one line to the server's `last.log`. Best effort: a failure is ignored. */
  relayLog(level: string, message: string): Promise<void>;
}

export interface AppApiOptions {
  /** Called when the server answers 401, so the page can ask for pairing. */
  onUnauthorized: () => void;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
}

export function createAppApi(apiBaseUrl: string, options: AppApiOptions): AppApi {
  const base = String(apiBaseUrl || "").replace(/\/+$/, "");
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));

  function url(path: string): string {
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    return new URL(normalized, `${base}/`).toString();
  }

  return {
    url,
    post(path, payload) {
      return send(url(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload || {})
      });
    },
    async getJson(path, requestOptions = {}) {
      const response = await send(url(path), {
        credentials: "include",
        ...requestOptions
      });
      if (response.status === 401) {
        options.onUnauthorized();
        throw new Error("Unauthorized");
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    async relayLog(level, message) {
      try {
        await send(url("/api/logs/client"), {
          method: "POST",
          credentials: "include",
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
