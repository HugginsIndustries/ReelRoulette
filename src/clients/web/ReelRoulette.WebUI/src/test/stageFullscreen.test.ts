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

function setup(options: { device?: FullscreenDevice; refuse?: boolean; api?: "standard" | "webkit" | "none" } = {}) {
  const doc: FullscreenDocument = {};
  const stage: FullscreenStageElement = {};
  const api = options.api ?? "standard";
  const request = vi.fn(function (this: unknown) {
    if (options.refuse) {
      return Promise.reject(new TypeError("denied"));
    }
    doc[api === "webkit" ? "webkitFullscreenElement" : "fullscreenElement"] = this;
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    doc.fullscreenElement = null;
    doc.webkitFullscreenElement = null;
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
  return { fullscreen, stage, request, exit };
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
});
