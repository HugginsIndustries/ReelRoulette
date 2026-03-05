import { describe, expect, it, vi } from "vitest";
import { createSseClient } from "../events/sseClient";
import type { RuntimeConfig } from "../types/runtimeConfig";
import type { RefreshStatusSnapshot } from "../types/serverContracts";

class FakeEventSource {
  public onopen: ((ev: Event) => unknown) | null = null;
  public onerror: ((ev: Event) => unknown) | null = null;
  private handlers = new Map<string, (event: MessageEvent<string>) => void>();

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.handlers.set(type, listener);
  }

  emit(type: string, data: unknown): void {
    const handler = this.handlers.get(type);
    if (!handler) {
      return;
    }

    handler({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  close(): void {}
}

const CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://localhost:51301/api",
  sseUrl: "http://localhost:51301/api/events"
};

describe("sseClient", () => {
  it("handles resyncRequired by requerying and syncing refresh status", async () => {
    const fakeSource = new FakeEventSource();
    const setConnectionStatus = vi.fn();
    const setRefreshStatus = vi.fn();
    const requery = vi.fn().mockResolvedValue(undefined);
    const snapshot: RefreshStatusSnapshot = {
      isRunning: false,
      trigger: "manual",
      completedUtc: "2026-03-05T00:00:00Z",
      stages: []
    };
    const getRefresh = vi.fn().mockResolvedValue(snapshot);

    const client = createSseClient(
      CONFIG,
      { setConnectionStatus, setRefreshStatus },
      fetch,
      {
        createEventSource: () => fakeSource,
        requeryAuthoritativeState: requery,
        getRefreshStatus: getRefresh
      }
    );

    client.connect("test");
    fakeSource.emit("resyncRequired", {
      revision: 5,
      eventType: "resyncRequired",
      timestamp: "2026-03-05T00:00:00Z",
      payload: { reason: "revisionGap", lastEventId: 1, currentRevision: 5 }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requery).toHaveBeenCalledTimes(1);
    expect(getRefresh).toHaveBeenCalledTimes(1);
    expect(setConnectionStatus).toHaveBeenCalledWith("SSE resync completed.");
    expect(setRefreshStatus).toHaveBeenCalled();
    client.stop();
  });
});
