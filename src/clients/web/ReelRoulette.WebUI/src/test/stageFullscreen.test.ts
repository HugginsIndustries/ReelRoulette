import { describe, expect, it, vi } from "vitest";
import {
  createStageFullscreen,
  type FullscreenDevice,
  type FullscreenDocument,
  type FullscreenStageElement
} from "../playback/stageFullscreen";

const DESKTOP: FullscreenDevice = { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0", platform: "Linux x86_64", maxTouchPoints: 0 };
const IPHONE: FullscreenDevice = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
const IPAD_AS_MAC: FullscreenDevice = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };

/** A document that tells its listeners when the element in fullscreen changes, as a browser does. */
function fakeDocument(): FullscreenDocument & { change(type: string): void; listeners(): number } {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    change(type) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    listeners: () => [...listeners.values()].reduce((count, set) => count + set.size, 0)
  };
}

function setup(options: { device?: FullscreenDevice; refuse?: boolean; api?: "standard" | "webkit" | "none" } = {}) {
  const doc = fakeDocument();
  const stage: FullscreenStageElement = {};
  const api = options.api ?? "standard";
  const changed = api === "webkit" ? "webkitfullscreenchange" : "fullscreenchange";
  const request = vi.fn(function (this: unknown) {
    if (options.refuse) {
      return Promise.reject(new TypeError("denied"));
    }
    doc[api === "webkit" ? "webkitFullscreenElement" : "fullscreenElement"] = this;
    doc.change(changed);
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    doc.fullscreenElement = null;
    doc.webkitFullscreenElement = null;
    doc.change(changed);
    return Promise.resolve();
  });
  if (api === "standard") {
    stage.requestFullscreen = request;
    doc.exitFullscreen = exit;
  } else if (api === "webkit") {
    stage.webkitRequestFullscreen = request;
    doc.webkitExitFullscreen = exit;
  }
  const fullscreen = createStageFullscreen({ document: doc, device: () => options.device ?? DESKTOP });
  fullscreen.attach(stage);
  return { fullscreen, stage, request, exit, doc };
}

describe("createStageFullscreen", () => {
  it("asks the browser to show the stage in fullscreen and leaves through the document", async () => {
    const { fullscreen, stage, request, exit } = setup();
    fullscreen.toggle();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(stage);
    expect(fullscreen.pseudo.value).toBe(false);

    fullscreen.toggle();
    expect(exit).toHaveBeenCalledTimes(1);
    fullscreen.toggle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("uses Safari's prefixed calls when they are the only ones", () => {
    const { fullscreen, request, exit } = setup({ api: "webkit" });
    fullscreen.toggle();
    fullscreen.toggle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("fills the page in place of fullscreen without the API or when the browser refuses", async () => {
    const missing = setup({ api: "none" });
    missing.fullscreen.toggle();
    expect(missing.fullscreen.pseudo.value).toBe(true);
    missing.fullscreen.toggle();
    expect(missing.fullscreen.pseudo.value).toBe(false);

    const refused = setup({ refuse: true });
    refused.fullscreen.toggle();
    expect(refused.fullscreen.pseudo.value).toBe(false);
    await vi.waitFor(() => expect(refused.fullscreen.pseudo.value).toBe(true));
    refused.fullscreen.toggle();
    expect(refused.fullscreen.pseudo.value).toBe(false);
    expect(refused.request).toHaveBeenCalledTimes(1);
  });

  it("fills the page on an iPhone and on an iPad that reports itself as a Mac, without asking the browser", () => {
    for (const device of [IPHONE, IPAD_AS_MAC]) {
      const { fullscreen, request } = setup({ device });
      fullscreen.toggle();
      expect(fullscreen.pseudo.value).toBe(true);
      expect(request).not.toHaveBeenCalled();
    }
  });

  it("exitPseudo leaves only the page-filling fullscreen", () => {
    const pseudo = setup({ device: IPHONE });
    pseudo.fullscreen.toggle();
    pseudo.fullscreen.exitPseudo();
    expect(pseudo.fullscreen.pseudo.value).toBe(false);

    const real = setup();
    real.fullscreen.toggle();
    real.fullscreen.exitPseudo();
    expect(real.exit).not.toHaveBeenCalled();
  });

  it("tells whether the stage is in the browser's fullscreen, following its fullscreen change events", () => {
    for (const api of ["standard", "webkit"] as const) {
      const { fullscreen, doc } = setup({ api });
      expect(fullscreen.active.value).toBe(false);
      fullscreen.toggle();
      expect(fullscreen.active.value).toBe(true);
      expect(fullscreen.pseudo.value).toBe(false);

      // Leaving by the browser's own means, such as its Escape, which the page learns only from the event.
      doc.fullscreenElement = null;
      doc.webkitFullscreenElement = null;
      doc.change(api === "webkit" ? "webkitfullscreenchange" : "fullscreenchange");
      expect(fullscreen.active.value).toBe(false);
    }
  });

  it("counts only the stage in fullscreen, and pseudo-fullscreen too", () => {
    const { fullscreen, doc } = setup();
    doc.fullscreenElement = {};
    doc.change("fullscreenchange");
    expect(fullscreen.active.value).toBe(false);

    const pseudo = setup({ device: IPHONE });
    pseudo.fullscreen.toggle();
    expect(pseudo.fullscreen.active.value).toBe(true);
    pseudo.fullscreen.exitPseudo();
    expect(pseudo.fullscreen.active.value).toBe(false);
  });

  it("reads the fullscreen it is attached in, and stops following once detached", () => {
    const doc = fakeDocument();
    const stage: FullscreenStageElement = {};
    doc.fullscreenElement = stage;
    const fullscreen = createStageFullscreen({ document: doc, device: () => DESKTOP });
    expect(fullscreen.active.value).toBe(false);
    fullscreen.attach(stage);
    expect(fullscreen.active.value).toBe(true);
    expect(doc.listeners()).toBe(2);

    fullscreen.detach();
    expect(fullscreen.active.value).toBe(false);
    expect(doc.listeners()).toBe(0);
    doc.change("fullscreenchange");
    expect(fullscreen.active.value).toBe(false);
  });
});
