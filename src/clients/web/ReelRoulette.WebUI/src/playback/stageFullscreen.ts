import { computed, signal, type ReadonlySignal } from "@preact/signals";

/** The fullscreen stage element, with the prefixed request Safari on macOS used before it had the standard one. */
export interface FullscreenStageElement {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
}

export interface FullscreenDocument {
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface FullscreenDevice {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

/**
 * Fullscreen for the stage, which holds the player and the overlays so they show in fullscreen too. Where the
 * browser cannot show the stage in fullscreen, as on iPhone and iPad or when it refuses, the stage fills the page
 * instead ("pseudo-fullscreen"), which Escape or the button leaves.
 */
export interface StageFullscreen {
  /** The stage fills the page in place of fullscreen. */
  readonly pseudo: ReadonlySignal<boolean>;
  /** The stage is in fullscreen, the browser's or pseudo-fullscreen, following the browser's `fullscreenchange`. */
  readonly active: ReadonlySignal<boolean>;
  attach(stage: FullscreenStageElement): void;
  detach(): void;
  toggle(): void;
  /** Leaves pseudo-fullscreen. Does nothing otherwise. */
  exitPseudo(): void;
}

export interface StageFullscreenOptions {
  /** Defaults to the page's document. */
  document?: FullscreenDocument;
  /** Defaults to the browser's navigator, read on each use. */
  device?: () => FullscreenDevice;
}

export function createStageFullscreen(options: StageFullscreenOptions = {}): StageFullscreen {
  const pageDocument = (): FullscreenDocument => options.document ?? (document as FullscreenDocument);
  const device = options.device ?? (() => navigator);
  const pseudo = signal(false);
  /** The browser shows the stage in fullscreen. */
  const native = signal(false);
  const active = computed(() => pseudo.value || native.value);
  let stage: FullscreenStageElement | null = null;
  const fullscreenEvents = ["fullscreenchange", "webkitfullscreenchange"];

  function followFullscreen(): void {
    native.value = stage !== null && fullscreenElement() === stage;
  }

  /** Safari on iPhone and iPad, which has no fullscreen for elements other than video. */
  function isIosTouchWebKit(): boolean {
    const { userAgent, platform, maxTouchPoints } = device();
    if (/iPad|iPhone|iPod/i.test(userAgent || "")) return true;
    return platform === "MacIntel" && maxTouchPoints > 1;
  }

  function fullscreenElement(): unknown {
    const doc = pageDocument();
    return doc.fullscreenElement || doc.webkitFullscreenElement || null;
  }

  function isActive(): boolean {
    return pseudo.peek() || (stage !== null && fullscreenElement() === stage);
  }

  function enter(): void {
    if (!stage || isIosTouchWebKit()) {
      pseudo.value = true;
      return;
    }
    const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (!request) {
      pseudo.value = true;
      return;
    }
    void request.call(stage).catch(() => {
      pseudo.value = true;
    });
  }

  function exit(): void {
    if (pseudo.peek()) {
      pseudo.value = false;
      return;
    }
    if (stage !== null && fullscreenElement() === stage) {
      const doc = pageDocument();
      const exitFullscreen = doc.exitFullscreen || doc.webkitExitFullscreen;
      void exitFullscreen?.call(doc)?.catch?.(() => {});
    }
  }

  return {
    pseudo,
    active,
    attach(element) {
      stage = element;
      const doc = pageDocument();
      fullscreenEvents.forEach((type) => doc.addEventListener?.(type, followFullscreen));
      followFullscreen();
    },
    detach() {
      const doc = pageDocument();
      fullscreenEvents.forEach((type) => doc.removeEventListener?.(type, followFullscreen));
      stage = null;
      native.value = false;
    },
    toggle() {
      if (isActive()) {
        exit();
      } else {
        enter();
      }
    },
    exitPseudo() {
      pseudo.value = false;
    }
  };
}
