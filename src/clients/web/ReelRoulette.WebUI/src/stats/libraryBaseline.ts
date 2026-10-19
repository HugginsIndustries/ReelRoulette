import { signal, type ReadonlySignal } from "@preact/signals";
import { errorText, UnauthorizedError } from "../api/serverRequest";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import { createCoalescedRefresh } from "./coalescedRefresh";
import type { LibraryStats } from "./statsModel";

/** A load that failed is tried again after this time, until one succeeds. */
export const BASELINE_RETRY_MS = 5_000;

/**
 * The library's baseline loudness, which loudness normalization's Automatic target is: the library stats'
 * `baselineLoudnessLufs`, loaded once the server is ready and again after each refresh and resync, which can change it.
 * Nothing loads while the server fails the compatibility check, runs without a library, or asks for pairing. A load
 * that fails keeps the baseline as it was, relays why, and is tried again every few seconds, quietly, until one
 * succeeds, the server holds back or asks for pairing, or the connection stops.
 */
export interface LibraryBaseline {
  /** The baseline in LUFS, or null until it first loads. */
  readonly lufs: ReadonlySignal<number | null>;
}

export interface LibraryBaselineOptions {
  store: Pick<AppStore, "heldBack" | "pairingRequired">;
  api: Pick<AppApi, "getJson">;
  connection: Pick<ServerConnection, "on">;
  /** Relays a line to `last.log`. */
  relay(level: string, message: string): void;
}

export function createLibraryBaseline(options: LibraryBaselineOptions): LibraryBaseline {
  const { store, api, connection, relay } = options;
  const lufs = signal<number | null>(null);
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** A load has failed since the last one succeeded, so the tries after it relay nothing. */
  let failing = false;
  /** The connection has stopped, as when the page closes, so nothing is tried again. */
  let stopped = false;

  function cancelRetry(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  async function load(): Promise<void> {
    // An event's load takes the place of a try that was waiting.
    cancelRetry();
    if (store.heldBack.peek() || store.pairingRequired.peek()) {
      return;
    }
    try {
      const stats = (await api.getJson("/api/library/stats")) as LibraryStats | null;
      failing = false;
      const baseline = stats?.global?.baselineLoudnessLufs;
      if (typeof baseline === "number" && Number.isFinite(baseline)) {
        lufs.value = baseline;
      }
    } catch (error) {
      // A 401's pairing prompt is the only thing to act on, and the server is ready again once the device pairs.
      if (error instanceof UnauthorizedError) {
        return;
      }
      if (!failing) {
        failing = true;
        relay("warn", `audio=baseline-load-failed error=${errorText(error)}`);
      }
      if (!stopped) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          request();
        }, BASELINE_RETRY_MS);
      }
    }
  }

  // Its events don't come in bursts, so a load goes at once, one at a time.
  const refresh = createCoalescedRefresh(load, 0);
  const request = () => void refresh.request();
  connection.on("serverReady", request);
  connection.on("refreshCompleted", request);
  connection.on("resyncRequired", request);
  connection.on("stopped", () => {
    stopped = true;
    cancelRetry();
  });

  return { lufs };
}
