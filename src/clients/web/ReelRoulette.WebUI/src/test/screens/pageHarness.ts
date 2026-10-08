import { vi } from "vitest";
import { renderApp } from "../../shell";
import type { RuntimeConfig } from "../../types/runtimeConfig";

/**
 * Mounts the whole WebUI page in happy-dom against a fake server and a fake event stream, so screen tests
 * drive it the way a user does and check what the page shows and sends.
 */

export const API_BASE_URL = "http://localhost:51301";
export const SSE_URL = `${API_BASE_URL}/api/events`;

export const REQUIRED_CAPABILITIES = [
  "auth.sessionCookie",
  "identity.sessionId",
  "events.refreshStatusChanged",
  "events.resyncRequired",
  "api.random.filterState",
  "api.presets.match"
];

export const COMPATIBLE_VERSION = {
  apiVersion: "1",
  minimumCompatibleApiVersion: "1",
  capabilities: REQUIRED_CAPABILITIES
};

export const DESKTOP_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
export const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export interface FetchCall {
  method: string;
  path: string;
  url: string;
  body: any;
}

export type Reply = (call: FetchCall) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function status(code: number): Response {
  return new Response(code === 204 ? null : "{}", { status: code });
}

/** Answers the page's requests by method and path. Unknown routes answer 404. */
export class FakeServer {
  readonly calls: FetchCall[] = [];
  private readonly routes = new Map<string, Reply>();

  constructor() {
    this.on("GET", "/api/version", () => json(COMPATIBLE_VERSION));
    this.on("GET", "/api/presets", () => json([]));
    this.on("POST", "/api/logs/client", () => status(204));
    this.on("POST", "/api/library/query", () => json({ items: [], totalCount: 0, searchBaselineCount: 0 }));
    this.on("POST", "/api/record-playback", () => json({}));
  }

  on(method: string, path: string, reply: Reply): this {
    this.routes.set(`${method} ${path}`, reply);
    return this;
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init?.method || "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: FetchCall = { method, path: url.pathname, url: url.toString(), body };
    this.calls.push(call);
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const reply = this.routes.get(`${method} ${url.pathname}`);
    return reply ? reply(call) : status(404);
  };

  requests(method: string, path: string): FetchCall[] {
    return this.calls.filter((call) => call.method === method && call.path === path);
  }

  /** Lines the page relayed to the server log. */
  logLines(): string[] {
    return this.requests("POST", "/api/logs/client").map((call) => String(call.body?.message ?? ""));
  }
}

/** Stands in for the browser's EventSource. Tests open, fail, and emit on it. */
export class FakeEventSource {
  onopen: ((event: Event) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  closed = false;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(readonly url: string) {
    createdSources.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }

  emit(eventType: string, revision: number, payload: unknown): void {
    const data = JSON.stringify({ revision, eventType, timestamp: "2026-10-07T00:00:00Z", payload });
    for (const listener of this.listeners.get(eventType) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }

  param(name: string): string | null {
    return new URL(this.url).searchParams.get(name);
  }
}

let createdSources: FakeEventSource[] = [];
/** Unmounts the page the last test mounted, so its connection stops before the next test. */
let mounted: (() => void) | null = null;
/** Undoes what tests stubbed on shared prototypes and the document, newest first. */
let restores: Array<() => void> = [];

function stubProperty(target: object, name: string, descriptor: PropertyDescriptor): void {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  restores.push(() => {
    if (original) {
      Object.defineProperty(target, name, original);
    } else {
      delete (target as Record<string, unknown>)[name];
    }
  });
}

export interface FakeFullscreen {
  /** The elements the page asked to show in fullscreen, oldest first. */
  readonly requests: Element[];
  exits(): number;
}

/**
 * Gives the page a Fullscreen API, which happy-dom lacks. With `refuse`, each request is rejected, as a browser
 * rejects one it does not allow.
 */
export function stubFullscreenApi(options: { refuse?: boolean } = {}): FakeFullscreen {
  let fullscreenElement: Element | null = null;
  let exits = 0;
  const requests: Element[] = [];
  stubProperty(HTMLElement.prototype, "requestFullscreen", {
    value(this: Element) {
      requests.push(this);
      if (options.refuse) {
        return Promise.reject(new TypeError("Fullscreen request denied"));
      }
      fullscreenElement = this;
      return Promise.resolve();
    }
  });
  stubProperty(document, "fullscreenElement", { get: () => fullscreenElement });
  stubProperty(document, "exitFullscreen", {
    value() {
      exits += 1;
      fullscreenElement = null;
      return Promise.resolve();
    }
  });
  return { requests, exits: () => exits };
}

/**
 * Gives every rendered element a layout size, which happy-dom does not compute, so the library grid renders its
 * tiles. An element that is not in the page, or is inside one that is `hidden` or has `display: none`, has no
 * size, as in a browser, so the grid defers its layout while the library overlay is hidden.
 */
export function stubLayoutSize(width = 800, height = 600): void {
  const rendered = (element: HTMLElement): boolean => {
    if (!element.isConnected) {
      return false;
    }
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      if (node.hidden || node.style.display === "none") {
        return false;
      }
    }
    return true;
  };
  stubProperty(HTMLElement.prototype, "clientWidth", {
    get(this: HTMLElement) {
      return rendered(this) ? width : 0;
    }
  });
  stubProperty(HTMLElement.prototype, "clientHeight", {
    get(this: HTMLElement) {
      return rendered(this) ? height : 0;
    }
  });
}

export interface MountedPage {
  root: HTMLElement;
  server: FakeServer;
  /** The event streams this page opened, oldest first. */
  streams(): FakeEventSource[];
  /** The newest event stream this page opened. */
  stream(): FakeEventSource;
  clientId(): string;
  sessionId(): string;
  unmount(): void;
}

export interface MountOptions {
  server?: FakeServer;
  config?: Partial<RuntimeConfig>;
}

/**
 * Clears what an earlier test left: storage, the page, the user agent, stubbed globals, and the stubbed
 * Fullscreen API and layout size. The app's own
 * listeners on `document` and `window` outlive a test, so tests look only at the event streams that carry
 * their own page's client id, and storage is cleared so each page gets a new one.
 */
export function resetPage(userAgent = DESKTOP_USER_AGENT): void {
  mounted?.();
  mounted = null;
  for (const restore of restores.reverse()) {
    restore();
  }
  restores = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  createdSources = [];
  setUserAgent(userAgent);
}

export function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
}

export function mountPage(options: MountOptions = {}): MountedPage {
  const server = options.server ?? new FakeServer();
  vi.stubGlobal("fetch", server.fetch);
  vi.stubGlobal("EventSource", FakeEventSource);

  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  const config: RuntimeConfig = { apiBaseUrl: API_BASE_URL, sseUrl: SSE_URL, ...options.config };
  const dispose = renderApp(root, config);
  mounted = dispose;

  const clientId = () => localStorage.getItem("rr_clientId") ?? "";
  const sessionId = () => sessionStorage.getItem("rr_sessionId") ?? "";
  const streams = () => createdSources.filter((source) => source.param("clientId") === clientId());
  return {
    root,
    server,
    streams,
    stream() {
      const all = streams();
      if (all.length === 0) {
        throw new Error("The page has not opened an event stream.");
      }
      return all[all.length - 1]!;
    },
    clientId,
    sessionId,
    unmount() {
      dispose();
      root.remove();
    }
  };
}

/** Lets pending fetch replies and the renders they cause finish. */
export async function settle(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * The page markup, for checking that a screen moved to Preact renders the same elements and attributes. Three
 * things that differ between the old HTML and Preact's output without changing the page are normalized:
 * - Whitespace-only text is dropped and other text is trimmed: JSX drops the HTML's indentation, which shows
 *   nothing inside the flex rows the markup uses. A space that does show, as in the now-playing line, is
 *   checked by the test of that screen.
 * - Style declarations are compared as a sorted list: the HTML wrote `display:none`, and Preact writes
 *   `display: none;`.
 * - An `<option>` is compared by `option.value`, the value the browser uses, whether it comes from the
 *   attribute or the option's text: Preact skips writing a `value` attribute that equals the text, as for the
 *   library sort list's Name and Duration. This was added when moving the first screens and is deliberate.
 */
export function normalizedMarkup(node: Node, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    return text ? `${pad}"${text}"\n` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const element = node as Element;
  const isOption = element instanceof HTMLOptionElement;
  const attributes = Array.from(element.attributes)
    .filter((attribute) => !(isOption && attribute.name === "value"))
    .map((attribute) => {
      if (attribute.name === "style") {
        const declarations = attribute.value
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => part.replace(/\s*:\s*/, ": "))
          .sort();
        return `style="${declarations.join("; ")}"`;
      }
      return `${attribute.name}="${attribute.value}"`;
    });
  if (isOption) {
    attributes.push(`value="${element.value}"`);
  }
  attributes.sort();
  let out = `${pad}<${element.tagName.toLowerCase()}${attributes.length ? ` ${attributes.join(" ")}` : ""}>\n`;
  for (const child of Array.from(element.childNodes)) {
    out += normalizedMarkup(child, depth + 1);
  }
  return out;
}
