import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { Window as HappyDomWindow } from "happy-dom";
import { vi } from "vitest";
import { unauthorizedLogText } from "../../api/serverRequest";
import { statusLogLine, type RelayLogCurrentItem } from "../../logging/relayLogLines";
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
  "api.presets.byId"
];

export const COMPATIBLE_VERSION = {
  apiVersion: "2",
  minimumCompatibleApiVersion: "2",
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

/**
 * The one `last.log` line the page relays for a 401, naming the request's route, such as "POST /api/favorite", while
 * `current` is the item of play attempt `attemptId`.
 */
export function unauthorizedLogLine(route: string, current: RelayLogCurrentItem | null = null, attemptId = 0): string {
  return statusLogLine(unauthorizedLogText(route), current, attemptId);
}

/** Answers the page's requests by method and path. Unknown routes answer 404. */
export class FakeServer {
  readonly calls: FetchCall[] = [];
  private readonly routes = new Map<string, Reply>();
  private readonly fallbacks: Array<(call: FetchCall) => Response | null> = [];

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

  /**
   * Answers the requests no route takes, such as routes that carry an id, with `reply`, which returns null for one it
   * doesn't answer, before they answer 404.
   */
  fallback(reply: (call: FetchCall) => Response | null): this {
    this.fallbacks.push(reply);
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
    if (reply) {
      return reply(call);
    }
    for (const fallback of this.fallbacks) {
      const answer = fallback(call);
      if (answer) {
        return answer;
      }
    }
    return status(404);
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
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    }
  });
  stubProperty(document, "fullscreenElement", { get: () => fullscreenElement });
  stubProperty(document, "exitFullscreen", {
    value() {
      exits += 1;
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    }
  });
  return { requests, exits: () => exits };
}

export interface FakeCanvases {
  /** How many times the page drew `image` onto a canvas, as ambient mode copies the picture playing. */
  copiesOf(image: object): number;
}

/**
 * Gives every canvas a 2D context that records what is drawn on it, which happy-dom lacks: its `getContext("2d")`
 * returns null.
 */
export function stubCanvas(): FakeCanvases {
  const drawn: object[] = [];
  const contexts = new Map<HTMLCanvasElement, object>();
  stubProperty(HTMLCanvasElement.prototype, "getContext", {
    value(this: HTMLCanvasElement) {
      let context = contexts.get(this);
      if (!context) {
        context = {
          globalAlpha: 1,
          clearRect() {},
          drawImage(image: object) {
            drawn.push(image);
          }
        };
        contexts.set(this, context);
      }
      return context;
    }
  });
  return { copiesOf: (image) => drawn.filter((source) => source === image).length };
}

/** Makes the page's tab read as hidden or shown, as `document.hidden` says. Returns a function that changes it. */
export function stubTabHidden(hidden: boolean): (hidden: boolean) => void {
  let value = hidden;
  stubProperty(document, "hidden", { get: () => value });
  return (next) => {
    value = next;
  };
}

/** Makes `element` report `value` for a property happy-dom doesn't set, such as a video's `readyState`. */
export function stubElementProperty(element: Element, name: string, value: unknown): void {
  Object.defineProperty(element, name, { configurable: true, value });
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

/**
 * Lays out the rows that match `selector` one under another, as happy-dom does not: each `height(row)` pixels tall
 * and `gap` pixels apart, in page order, from the top of the window. Other elements keep happy-dom's empty box.
 */
export function stubRowLayout(selector: string, height: (row: HTMLElement) => number, gap = 0): void {
  const original = Element.prototype.getBoundingClientRect;
  stubProperty(HTMLElement.prototype, "getBoundingClientRect", {
    value(this: HTMLElement) {
      if (!this.matches(selector)) {
        return original.call(this);
      }
      let top = 0;
      for (const row of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        if (row === this) {
          break;
        }
        top += height(row) + gap;
      }
      return new DOMRect(0, top, 300, height(this));
    }
  });
}

/**
 * Makes `element` a list that scrolls, as happy-dom lays none out: `height` pixels tall from `top` in the window,
 * holding `content` pixels. Its `overflow-y` is set on it, since happy-dom's computed style doesn't take it from the
 * `overflow` shorthand. happy-dom sends no scroll event when its `scrollTop` is set, so a test sends one.
 */
export function stubScroller(element: HTMLElement, top: number, height: number, content: number): void {
  element.style.overflowY = "auto";
  restores.push(() => element.style.removeProperty("overflow-y"));
  stubProperty(element, "clientHeight", { get: () => height });
  stubProperty(element, "scrollHeight", { get: () => content });
  stubProperty(element, "getBoundingClientRect", { value: () => new DOMRect(0, top, 300, height) });
}

/** A focus call the page made, and whether it asked not to scroll. */
export interface FocusCall {
  element: HTMLElement;
  preventScroll: boolean;
}

/**
 * Records each focus call from here on, and scrolls `scroller` to its top for one that doesn't ask not to scroll, as a
 * browser may when it brings the focused element into view, which happy-dom doesn't do.
 */
export function scrollOnFocus(scroller: HTMLElement): FocusCall[] {
  const calls: FocusCall[] = [];
  const original = HTMLElement.prototype.focus;
  stubProperty(HTMLElement.prototype, "focus", {
    value(this: HTMLElement, options?: FocusOptions) {
      calls.push({ element: this, preventScroll: options?.preventScroll === true });
      if (!options?.preventScroll) {
        scroller.scrollTop = 0;
      }
      original.call(this, options);
    }
  });
  return calls;
}

/** happy-dom's window size, which each test starts from. */
export const DEFAULT_VIEWPORT = { width: 1024, height: 768 };

/**
 * Resizes the window, which fires `resize` and media query `change` events, as a browser does, and decides the
 * stylesheet's width and height rules.
 */
export function setViewport(viewport: { width: number; height: number }): void {
  (window as unknown as HappyDomWindow).happyDOM.setViewport(viewport);
}

/**
 * Makes `(pointer: coarse)` match, as on a touch screen; happy-dom's `matchMedia` always reports a fine pointer. The
 * stylesheet's own pointer rules still see a fine pointer.
 */
export function stubCoarsePointer(): void {
  const real = window.matchMedia.bind(window);
  stubProperty(window, "matchMedia", {
    value(query: string) {
      if (!query.includes("pointer: coarse")) {
        return real(query);
      }
      return { matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
    }
  });
}

/**
 * Makes `(prefers-color-scheme: dark)` answer as `dark` says, through a query that sends `change` when the returned
 * function changes it, as a browser does when the system's scheme changes; happy-dom sends none.
 */
export function stubColorScheme(dark: boolean): (dark: boolean) => void {
  const real = window.matchMedia.bind(window);
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
  };
  stubProperty(window, "matchMedia", {
    value(text: string) {
      return text.includes("prefers-color-scheme: dark") ? (query as unknown as MediaQueryList) : real(text);
    }
  });
  return (next) => {
    query.matches = next;
    listeners.forEach((listener) => listener());
  };
}

/**
 * Makes `(prefers-reduced-motion: reduce)` match, as when the system asks for reduced motion; happy-dom's `matchMedia`
 * never reports it. The stylesheet's own reduced-motion rules still don't apply.
 */
export function stubReducedMotion(): void {
  const real = window.matchMedia.bind(window);
  stubProperty(window, "matchMedia", {
    value(query: string) {
      if (!query.includes("prefers-reduced-motion: reduce")) {
        return real(query);
      }
      return { matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
    }
  });
}

/**
 * Gives the screen safe-area insets, in pixels, as a phone reports them, through the stylesheet's `--safe-area-*`
 * variables, since happy-dom has no `env()`. A side left out is 0.
 */
export function stubSafeAreaInsets(insets: { top?: number; right?: number; bottom?: number; left?: number }): void {
  const root = document.documentElement;
  const sides = ["top", "right", "bottom", "left"] as const;
  for (const side of sides) {
    root.style.setProperty(`--safe-area-${side}`, `${insets[side] ?? 0}px`);
  }
  restores.push(() => {
    for (const side of sides) {
      root.style.removeProperty(`--safe-area-${side}`);
    }
  });
}

/**
 * Reads `element`'s computed style afresh. happy-dom drops an element's computed style when the element itself or an
 * ancestor it read on the way changes, but not when an ancestor above one whose style it had already computed does,
 * as when the body's class changes, so a change on the element itself comes first (measured).
 */
export function currentStyle(element: Element): CSSStyleDeclaration {
  element.setAttribute("data-restyle", "");
  element.removeAttribute("data-restyle");
  return getComputedStyle(element);
}

/** Applies the WebUI's stylesheet to the page, so a test can read the styles it gives. */
export function useStylesheet(): void {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../styles.css"), "utf8");
  document.head.append(style);
  restores.push(() => style.remove());
}

let pointerY = 0;

/** Presses a mouse's main button, or a finger, on `element` at height `y`. */
export function pointerDown(element: Element, y: number): void {
  pointerY = y;
  fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 10, clientY: y });
}

/** Moves the pressed pointer to height `y`, and lets the page render. */
export async function pointerMove(y: number): Promise<void> {
  pointerY = y;
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: y });
  await settle();
}

/**
 * Lets go of the pointer where it is, and lets the page render. `beforeRender` stands in for what the browser does in
 * between: it runs after the page's own handler, in the same event, since the page renders as the event ends.
 */
export async function pointerUp(beforeRender?: () => void): Promise<void> {
  if (beforeRender) {
    document.addEventListener("pointerup", beforeRender, { once: true });
  }
  fireEvent.pointerUp(document, { pointerId: 1, button: 0, clientX: 10, clientY: pointerY });
  await settle();
}

/** Presses a key on `element`, focused first, and says whether the page left the key to the browser. */
export async function pressKey(element: HTMLElement, key: string): Promise<boolean> {
  element.focus();
  const allowed = fireEvent.keyDown(element, { key });
  fireEvent.keyUp(element, { key });
  await settle();
  return allowed;
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
 * Clears what an earlier test left: storage, the page, the user agent, the window size, stubbed globals, and the
 * stubbed Fullscreen API and layout size. The app's own
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
  if (window.innerWidth !== DEFAULT_VIEWPORT.width || window.innerHeight !== DEFAULT_VIEWPORT.height) {
    setViewport(DEFAULT_VIEWPORT);
  }
  // The page follows the system's scheme by default, and happy-dom reports a light one, so the tests run as a dark
  // device, the theme the stylesheet's own tokens give. The theme a page applied goes with it.
  (window as unknown as HappyDomWindow).happyDOM.settings.device.prefersColorScheme = "dark";
  document.documentElement.classList.remove("theme-dark", "theme-light");
  document.head.querySelectorAll('meta[name="theme-color"], meta[name="apple-mobile-web-app-status-bar-style"]').forEach((meta) => meta.remove());
}

export function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
}

export function mountPage(options: MountOptions = {}): MountedPage {
  const server = options.server ?? new FakeServer();
  vi.stubGlobal("fetch", server.fetch);
  vi.stubGlobal("EventSource", FakeEventSource);
  // The page asks and tells in its own dialog, so a browser dialog fails the test that opened it.
  for (const name of ["alert", "confirm", "prompt"]) {
    vi.stubGlobal(name, () => {
      throw new Error(`The page opened the browser's ${name}.`);
    });
  }

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

/**
 * Waits until the page has found the server ready, which its relayed "Ready (API …)" line shows, since no status line
 * says so.
 */
export async function pageReady(server: FakeServer): Promise<void> {
  await waitFor(() => {
    if (!server.logLines().some((line) => line.startsWith("status=Ready (API"))) {
      throw new Error("The page hasn't found the server ready.");
    }
  });
}

/** Lets pending fetch replies and the renders they cause finish. */
export async function settle(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** The in-app notices open now, oldest first: the dialogs whose only button is OK. */
function noticeDialogs(): HTMLDialogElement[] {
  return [...document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog")].filter((dialog) => {
    const buttons = [...dialog.querySelectorAll(".dialog-actions button")];
    return buttons.length === 1 && buttons[0]!.textContent === "OK";
  });
}

/** The messages of the in-app notices open now, oldest first. */
export function openNotices(): string[] {
  return noticeDialogs().map((dialog) => dialog.querySelector(".dialog-message")?.textContent ?? "");
}

/** Closes every open notice with its OK, newest first, and lets the page settle. */
export async function closeNotices(): Promise<void> {
  for (const dialog of noticeDialogs().reverse()) {
    fireEvent.click(dialog.querySelector(".dialog-actions button")!);
  }
  await settle();
}

/** The Library tab's preset dropdown, found while its tab is hidden too. */
export function presetSelect(): HTMLSelectElement {
  return document.getElementById("preset-select") as HTMLSelectElement;
}

/** The label of the entry the preset dropdown shows. */
export function selectedPresetLabel(): string {
  const select = presetSelect();
  return select.options[select.selectedIndex]?.textContent ?? "";
}

/**
 * Picks `value` in the Library tab's preset dropdown as the user does: shows the Library tab, opening the panel on it
 * when it is closed, picks once the dropdown lists the value, and leaves the panel as it was, closed or on its tab.
 */
export async function pickPreset(value: string): Promise<void> {
  const panel = document.getElementById("panel")!;
  const wasClosed = panel.hidden;
  const previous = panel.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  fireEvent.click(document.getElementById("panel-tab-library")!);
  await settle();
  await waitFor(() => {
    if (!Array.from(presetSelect().options).some((option) => option.value === value)) {
      throw new Error(`The preset dropdown doesn't list "${value}".`);
    }
  });
  fireEvent.change(presetSelect(), { target: { value } });
  await settle();
  if (wasClosed) {
    fireEvent.click(document.getElementById("panel-close-btn")!);
  } else if (previous && previous.id !== "panel-tab-library") {
    fireEvent.click(previous);
  }
  await settle();
}

/**
 * The page markup, for checking that a screen moved to Preact renders the same elements and attributes. Three
 * things that differ between the old HTML and Preact's output without changing the page are normalized:
 * - Whitespace-only text is dropped and other text is trimmed: JSX drops the HTML's indentation, which shows
 *   nothing inside the flex rows the markup uses. A space that does show, as in the now-playing line, is
 *   checked by the test of that screen.
 * - Style declarations are compared as a sorted list: the HTML wrote `display:none`, and Preact writes
 *   `display: none;`. A zero length compares as `0px`: the HTML wrote `margin:0`, and Preact sets styles
 *   through the browser, which writes `margin: 0px`. An empty `class` attribute is left out:
 *   `classList.toggle` left one where Preact writes none. These two were added when moving the filter dialog and
 *   are deliberate.
 * - An `<option>` is compared by `option.value`, the value the browser uses, whether it comes from the
 *   attribute or the option's text: Preact skips writing a `value` attribute that equals the text, as for the
 *   library sort list's Name and Duration. This was added when moving the first screens and is deliberate.
 *
 * With `liveFormState`, a checkbox or radio is compared by its `checked` property, an option by its `selected`
 * property, and any other input by its `value` property, in place of those attributes: what the user sees. The
 * HTML wrote them as attributes, which keep their first value after the user changes the control, and Preact
 * sets the properties and writes no attribute. Added with the filter dialog's tests, before that screen moved.
 */
export function normalizedMarkup(node: Node, options: { liveFormState?: boolean } = {}, depth = 0): string {
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
  const live = options.liveFormState ? liveFormState(element) : null;
  const attributes = Array.from(element.attributes)
    .filter((attribute) => !(isOption && attribute.name === "value"))
    .filter((attribute) => !live || !(attribute.name in live))
    .filter((attribute) => !(attribute.name === "class" && !attribute.value.trim()))
    .map((attribute) => {
      if (attribute.name === "style") {
        const declarations = attribute.value
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => part.replace(/\s*:\s*/, ": ").replace(/: 0$/, ": 0px"))
          .sort();
        return `style="${declarations.join("; ")}"`;
      }
      return `${attribute.name}="${attribute.value}"`;
    });
  if (isOption) {
    attributes.push(`value="${element.value}"`);
  }
  for (const [name, value] of Object.entries(live ?? {})) {
    attributes.push(`${name}="${value}"`);
  }
  attributes.sort();
  let out = `${pad}<${element.tagName.toLowerCase()}${attributes.length ? ` ${attributes.join(" ")}` : ""}>\n`;
  for (const child of Array.from(element.childNodes)) {
    out += normalizedMarkup(child, options, depth + 1);
  }
  return out;
}

/** The form state an element shows, by attribute name, for `liveFormState`. */
function liveFormState(element: Element): Record<string, string> | null {
  if (element instanceof HTMLOptionElement) {
    return { selected: String(element.selected) };
  }
  if (element instanceof HTMLInputElement) {
    return element.type === "checkbox" || element.type === "radio"
      ? { checked: String(element.checked) }
      : { value: element.value };
  }
  return null;
}
