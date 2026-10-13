import { signal } from "@preact/signals";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPanelHost } from "../panel/panelHost";
import { autoPauseWants, createAutoPause, type AutoPauseMode } from "../playback/autoPause";
import { createPlayer, type PlayerElements } from "../playback/player";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import type { ServerConnection } from "../state/serverConnection";

const VIDEO: PlayingItem = {
  id: "/media/clip.mp4",
  itemId: "item-video",
  displayName: "clip.mp4",
  mediaType: "video",
  durationSeconds: 65,
  mediaUrl: "/api/media/item-video?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const PHOTO: PlayingItem = {
  ...VIDEO,
  id: "/media/beach.jpg",
  itemId: "item-photo",
  displayName: "beach.jpg",
  mediaType: "photo",
  durationSeconds: null,
  mediaUrl: "/api/media/item-photo?token=t"
};

/** Desktop and phone widths, and a phone on its side, where the panel is the overlay at any width. */
const DESKTOP = { width: 1024, height: 768, coarse: false };
const PHONE = { width: 390, height: 844, coarse: true };
const PHONE_ON_ITS_SIDE = { width: 844, height: 390, coarse: true };

type Size = typeof DESKTOP;

/** A window whose size and pointer a test sets, telling the panel host as a resize would. */
function fakeViewport(size: Size) {
  const listeners = new Set<() => void>();
  const viewport = {
    size,
    width: () => viewport.size.width,
    height: () => viewport.size.height,
    coarsePointer: () => viewport.size.coarse,
    watch(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: Size) {
      viewport.size = next;
      listeners.forEach((listener) => listener());
    }
  };
  return viewport;
}

function fakeVideo() {
  const video = {
    src: "",
    muted: false,
    loop: false,
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    style: { display: "none" },
    play() {
      video.paused = false;
      return Promise.resolve();
    },
    pause() {
      video.paused = true;
    }
  };
  return video;
}

/** Auto-Pause in `mode`, wired to the panel host at `size` and to the player, which plays `item`. */
function setup(mode: AutoPauseMode, size: Size, item: PlayingItem = VIDEO) {
  const requests: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    requests.push(new URL(String(input)).pathname);
    return new Response(JSON.stringify({ mediaUrl: null }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: () => {}
  });
  const api = createAppApi("http://server", { onUnauthorized: () => {}, fetch: fetchImpl });
  const connection = { on() {} } as unknown as ServerConnection;
  const player = createPlayer({
    apiBaseUrl: "http://server/",
    store,
    api,
    connection,
    dialogs: { notice: () => Promise.resolve() },
    notifications: { notify() {} },
    // No animation frames outside a browser; the bar's own tests run them.
    frames: { request: () => 0, cancel: () => {} }
  });
  const video = fakeVideo();
  const photo = { src: "", style: { display: "none" } };
  player.attach({ video, photo, emptyState: { style: { display: "" } }, seekSlider: { value: "0", max: "100" } } satisfies PlayerElements);

  const viewport = fakeViewport(size);
  const panel = createPanelHost({ device: createDeviceStore(null), viewport });
  panel.attach({
    stage: { get clientWidth() { return viewport.width(); } },
    panel: { hidden: true, contains: () => false },
    handle: { hidden: true, offsetWidth: 12, contains: () => false },
    pages: { library: { hidden: true }, filter: { hidden: true }, tags: { hidden: true } }
  });
  const autoTagOpen = signal(false);
  createAutoPause({ mode: signal(mode), panel, overPage: autoTagOpen, player });

  store.pushHistory({ ...item });
  player.playCurrent();
  return {
    store,
    player,
    panel,
    video,
    photo,
    viewport,
    autoTagOpen,
    requests: (path: string) => requests.filter((request) => request === path),
    /** Whether the video plays, or the photo's timer runs. */
    playing: () => (item.mediaType === "photo" ? player.playButton.value.showsPause : !video.paused)
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("autoPauseWants", () => {
  const closed = { panelOpen: false, panelMode: "side", overPage: false } as const;
  const beside = { panelOpen: true, panelMode: "side", overPage: false } as const;
  const overlay = { panelOpen: true, panelMode: "overlay", overPage: false } as const;
  const overPage = { panelOpen: false, panelMode: "side", overPage: true } as const;

  it("never pauses on Never", () => {
    expect([closed, beside, overlay, overPage].map((cover) => autoPauseWants("never", cover))).toEqual([false, false, false, false]);
  });

  it("pauses whenever the panel opens, or something shows over the page, on Always", () => {
    expect([closed, beside, overlay, overPage].map((cover) => autoPauseWants("always", cover))).toEqual([false, true, true, true]);
  });

  it("pauses only while the panel or something over the page covers the player, on Responsive", () => {
    expect([closed, beside, overlay, overPage].map((cover) => autoPauseWants("responsive", cover))).toEqual([false, false, true, true]);
  });
});

describe("Auto-Pause with the panel and the player", () => {
  it("on Responsive, keeps playback going beside the player and pauses it as the overlay, on a phone and a phone on its side", async () => {
    for (const [size, pauses] of [[DESKTOP, false], [PHONE, true], [PHONE_ON_ITS_SIDE, true]] as const) {
      const page = setup("responsive", size);
      for (const tab of ["library", "filter", "tags"] as const) {
        await page.panel.showTab(tab);
        expect([size.width, tab, page.playing()]).toEqual([size.width, tab, !pauses]);
      }
      await page.panel.close();
      expect(page.playing()).toBe(true);
    }
  });

  it("on Always, pauses whenever the panel opens, at desktop and phone widths, and resumes on close", async () => {
    for (const size of [DESKTOP, PHONE]) {
      const page = setup("always", size);
      await page.panel.showTab("library");
      expect([size.width, page.playing()]).toEqual([size.width, false]);
      await page.panel.close();
      expect(page.playing()).toBe(true);
    }
  });

  it("on Never, never pauses, at desktop and phone widths, nor for Auto Tag", async () => {
    for (const size of [DESKTOP, PHONE]) {
      const page = setup("never", size);
      await page.panel.showTab("tags");
      page.autoTagOpen.value = true;
      expect([size.width, page.playing()]).toEqual([size.width, true]);
    }
  });

  it("on Responsive, pauses an open panel as it comes to cover the player, and resumes as it moves beside it", async () => {
    const page = setup("responsive", DESKTOP);
    await page.panel.showTab("tags");
    page.viewport.set({ ...DESKTOP, width: 700 });
    expect(page.playing()).toBe(false);
    page.viewport.set(DESKTOP);
    expect(page.playing()).toBe(true);

    page.player.playOrPause();
    page.viewport.set(PHONE_ON_ITS_SIDE);
    page.viewport.set(DESKTOP);
    expect(page.playing()).toBe(false);
  });

  it("pauses for Auto Tag on Always and Responsive, beside the player too, and resumes as it closes", async () => {
    for (const mode of ["always", "responsive"] as const) {
      const page = setup(mode, DESKTOP);
      page.autoTagOpen.value = true;
      expect([mode, page.playing()]).toEqual([mode, false]);
      page.autoTagOpen.value = false;
      expect(page.playing()).toBe(true);
    }

    const page = setup("responsive", DESKTOP);
    await page.panel.showTab("tags");
    page.autoTagOpen.value = true;
    expect(page.playing()).toBe(false);
    page.autoTagOpen.value = false;
    expect(page.playing()).toBe(true);
  });

  it("resumes only what it paused, and leaves a play or pause made while the panel is open", async () => {
    const page = setup("responsive", PHONE);
    page.player.playOrPause();
    await page.panel.showTab("library");
    await page.panel.close();
    expect(page.playing()).toBe(false);

    page.player.playOrPause();
    await page.panel.showTab("library");
    page.player.playOrPause();
    expect(page.playing()).toBe(true);
    await page.panel.close();
    expect(page.playing()).toBe(true);

    await page.panel.showTab("library");
    page.player.playOrPause();
    page.player.playOrPause();
    await page.panel.close();
    expect(page.playing()).toBe(false);
  });

  it("holds a photo's timer as the overlay opens, and resumes it with the time it had left, without loading or recording it again", async () => {
    vi.useFakeTimers();
    const page = setup("responsive", PHONE, PHOTO);
    page.player.toggleAutoplay();
    expect(page.store.playAttemptId.value).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);

    await page.panel.showTab("library");
    expect(page.playing()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.player.timeText.value).toBe("0:10 / 0:15");

    page.photo.src = "still loaded";
    await page.panel.close();
    expect(page.playing()).toBe(true);
    expect(page.photo.src).toBe("still loaded");
    expect(page.store.playAttemptId.value).toBe(2);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.requests("/api/record-playback")).toHaveLength(2);
  });

  it("ends Loading… for a video still loading as the overlay pauses it", async () => {
    vi.useFakeTimers();
    const page = setup("responsive", PHONE);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);

    await page.panel.showTab("library");
    expect(page.playing()).toBe(false);
    expect(page.store.loading.shown.value).toBe(false);
  });
});
