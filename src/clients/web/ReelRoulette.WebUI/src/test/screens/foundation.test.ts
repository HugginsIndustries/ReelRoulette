// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderStartupError } from "../../shell";
import {
  COMPATIBLE_VERSION,
  FakeServer,
  IPHONE_USER_AGENT,
  json,
  mountPage,
  normalizedMarkup,
  resetPage,
  settle,
  status
} from "./pageHarness";

const FAVORITES_PRESET = {
  id: "preset-favorites",
  name: "Favorites",
  filterState: {
    favoritesOnly: true,
    excludeBlacklisted: true,
    onlyNeverPlayed: false,
    onlyKnownDuration: false,
    onlyKnownLoudness: false,
    audioFilter: 0,
    mediaTypeFilter: 0,
    globalMatchMode: true,
    selectedTags: [],
    excludedTags: [],
    includedSourceIds: []
  }
};

const VIDEO_ITEM = {
  id: "C:\\media\\holiday clip.mp4",
  itemId: "item-video",
  displayName: "holiday clip.mp4",
  mediaType: "video",
  durationSeconds: 65,
  mediaUrl: "/api/media/item-video?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const PHOTO_ITEM = {
  id: "C:\\media\\beach.jpg",
  itemId: "item-photo",
  displayName: "beach.jpg",
  mediaType: "photo",
  durationSeconds: null,
  mediaUrl: "/api/media/item-photo?token=t",
  isFavorite: false,
  isBlacklisted: false
};

function presetSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Choose preset" }) as HTMLSelectElement;
}

function optionLabels(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.textContent ?? "");
}

function selectedLabel(select: HTMLSelectElement): string {
  return select.options[select.selectedIndex]?.textContent ?? "";
}

function statusLine(): string {
  return document.getElementById("status")?.textContent ?? "";
}

async function startRandomPick(): Promise<void> {
  fireEvent.click(screen.getByText("Click here to play (choose a preset or open Filter…)"));
  await settle();
}

beforeEach(() => {
  resetPage();
});

describe("startup and connection", () => {
  it("checks the server version, loads presets, and opens the event stream with the device's identity", async () => {
    localStorage.setItem("rr_clientId", "client-kept");
    sessionStorage.setItem("rr_sessionId", "session-kept");
    const page = mountPage();

    await screen.findByText("Ready (API 1)");
    expect(page.server.requests("GET", "/api/version")).toHaveLength(1);
    expect(page.server.requests("GET", "/api/presets")).toHaveLength(1);

    const stream = page.stream();
    expect(stream.param("clientId")).toBe("client-kept");
    expect(stream.param("sessionId")).toBe("session-kept");
    expect(stream.param("clientType")).toBe("web");
    expect(stream.param("deviceName")).toMatch(/^Web Browser \(/);
    expect(stream.param("lastEventId")).toBeNull();
  });

  it("creates and keeps a client id in localStorage and a session id in sessionStorage", async () => {
    const page = mountPage();
    await settle();

    expect(page.clientId()).not.toBe("");
    expect(page.sessionId()).not.toBe("");
    expect(page.stream().param("clientId")).toBe(page.clientId());
    expect(page.stream().param("sessionId")).toBe(page.sessionId());
  });

  it("shows the event stream opening and reconnecting with the last event ID", async () => {
    vi.useFakeTimers();
    const page = mountPage();
    await vi.advanceTimersByTimeAsync(0);

    const first = page.stream();
    first.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(statusLine()).toBe("SSE connected");

    first.emit("streamOpened", 7, {});
    first.fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(statusLine()).toBe("SSE reconnecting...");
    expect(first.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(page.streams()).toHaveLength(2);
    expect(page.stream().param("lastEventId")).toBe("7");
  });

  it("reconnects the event stream when the page becomes visible, gains focus, is shown, or comes online", async () => {
    const page = mountPage();
    await screen.findByText("Ready (API 1)");
    page.stream().emit("streamOpened", 12, {});

    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("online"));

    const streams = page.streams();
    expect(streams).toHaveLength(5);
    expect(streams.slice(1).map((stream) => stream.param("lastEventId"))).toEqual(["12", "12", "12", "12"]);
    expect(streams.slice(0, 4).every((stream) => stream.closed)).toBe(true);
  });

  it("shows refresh progress, keeps a failed refresh's error out of the log, and reloads the library once per finished run", async () => {
    const page = mountPage();
    await screen.findByText("Ready (API 1)");
    const stream = page.stream();

    stream.emit("refreshStatusChanged", 2, {
      snapshot: {
        isRunning: true,
        currentStage: "thumbnailGeneration",
        stages: [{ stage: "thumbnailGeneration", percent: 40, message: "Thumbnails", isComplete: false }]
      }
    });
    await screen.findByText("Core refresh: Thumbnails (40%)");

    stream.emit("refreshStatusChanged", 3, {
      snapshot: { isRunning: false, lastError: "Cannot read C:\\secret\\folder", stages: [] }
    });
    await screen.findByText("Core refresh failed: Cannot read C:\\secret\\folder");
    await waitFor(() => expect(page.server.logLines()).toContain("status=Core refresh failed hasCurrent=false attempt=0"));
    expect(page.server.logLines().some((line) => line.includes("secret"))).toBe(false);

    await waitFor(() => expect(page.server.requests("POST", "/api/library/query")).toHaveLength(1));
    const finished = { isRunning: false, runId: "run-1", completedUtc: "2026-10-07T00:00:00Z", stages: [] };
    stream.emit("refreshStatusChanged", 4, { snapshot: finished });
    stream.emit("refreshStatusChanged", 5, { snapshot: finished });
    await settle();
    expect(page.server.requests("POST", "/api/library/query")).toHaveLength(2);
  });

  it("reloads presets and the library when the server asks for a resync", async () => {
    const server = new FakeServer();
    const page = mountPage({ server });
    await screen.findByText("Ready (API 1)");
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(1));
    expect(optionLabels(presetSelect())).toEqual(["None"]);

    server.on("GET", "/api/presets", () => json([FAVORITES_PRESET]));
    page.stream().emit("resyncRequired", 30, { reason: "gap" });

    await waitFor(() => expect(optionLabels(presetSelect())).toEqual(["None", "Favorites"]));
    expect(server.requests("GET", "/api/presets")).toHaveLength(2);
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(2));
  });

  it("passes favorite and blacklist events to the status line", async () => {
    const page = mountPage();
    await screen.findByText("Ready (API 1)");

    page.stream().emit("itemStateChanged", 3, {
      itemId: "item-video",
      path: "C:\\media\\holiday clip.mp4",
      isFavorite: true,
      isBlacklisted: false
    });

    await screen.findByText("Synced: Added to favorites: holiday clip.mp4");
    await waitFor(() => expect(page.server.logLines()).toContain("status=Synced: Added to favorites hasCurrent=false attempt=0"));
  });
});

describe("status line relay", () => {
  it("relays each status change to the server log, and the same status only once a second", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const page = mountPage();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.server.logLines()).toEqual(
      expect.arrayContaining(["status=Ready hasCurrent=false attempt=0", "status=Ready (API 1) hasCurrent=false attempt=0"])
    );

    const idle = { snapshot: { isRunning: false, stages: [] } };
    const before = page.server.logLines().length;
    page.stream().emit("refreshStatusChanged", 2, idle);
    page.stream().emit("refreshStatusChanged", 3, idle);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.server.logLines().slice(before)).toEqual(["status=Core refresh idle. hasCurrent=false attempt=0"]);

    await vi.advanceTimersByTimeAsync(1001);
    page.stream().emit("refreshStatusChanged", 4, idle);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.server.logLines().slice(before)).toHaveLength(2);
  });
});

describe("header preset dropdown", () => {
  it("lists None and the saved presets, and a pick sets the library query and the next random pick", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/presets", () => json([FAVORITES_PRESET]));
    server.on("POST", "/api/random", () => json(VIDEO_ITEM));
    mountPage({ server });

    await waitFor(() => expect(optionLabels(presetSelect())).toEqual(["None", "Favorites"]));
    expect(selectedLabel(presetSelect())).toBe("None");
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(1));

    fireEvent.change(presetSelect(), { target: { value: "preset-favorites" } });
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(2));
    expect(server.requests("POST", "/api/library/query")[1]!.body.filterState.favoritesOnly).toBe(true);
    expect(selectedLabel(presetSelect())).toBe("Favorites");

    await startRandomPick();
    const pick = server.requests("POST", "/api/random")[0]!.body;
    expect(pick.presetId).toBe("preset-favorites");
    expect(pick.filterState.favoritesOnly).toBe(true);
    expect(pick.randomizationMode).toBe("SmartShuffle");

    fireEvent.change(presetSelect(), { target: { value: "" } });
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(3));
    expect(server.requests("POST", "/api/library/query")[2]!.body.filterState.favoritesOnly).toBe(false);
    await waitFor(() => expect(selectedLabel(presetSelect())).toBe("None"));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    const next = server.requests("POST", "/api/random")[1]!.body;
    expect(next.presetId).toBeUndefined();
    expect(next.filterState.favoritesOnly).toBe(false);
  });

  it("shows Loading... until presets arrive and an error entry when they cannot load", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/presets", () => status(500));
    mountPage({ server });
    expect(optionLabels(presetSelect())).toEqual(["Loading..."]);

    await waitFor(() => expect(optionLabels(presetSelect())).toEqual(["Error loading presets"]));
    await waitFor(() => expect(server.logLines()).toContain("status=Error loading presets: HTTP 500 hasCurrent=false attempt=0"));
  });
});

describe("randomization mode", () => {
  it("starts on Smart Shuffle, keeps a pick in localStorage, and sends it with random picks", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => json(VIDEO_ITEM));
    mountPage({ server });
    const select = screen.getByRole("combobox", { name: "Choose randomization mode" }) as HTMLSelectElement;
    expect(selectedLabel(select)).toBe("Smart Shuffle");
    expect(optionLabels(select)).toEqual([
      "Smart Shuffle",
      "Pure Random",
      "Weighted Random",
      "Spread Mode",
      "Weighted with Spread"
    ]);

    fireEvent.change(select, { target: { value: "WeightedRandom" } });
    expect(localStorage.getItem("rr_randomizationMode")).toBe("WeightedRandom");

    await startRandomPick();
    expect(server.requests("POST", "/api/random")[0]!.body.randomizationMode).toBe("WeightedRandom");
  });

  it("restores a saved mode and ignores an unknown one", async () => {
    localStorage.setItem("rr_randomizationMode", "SpreadMode");
    mountPage();
    expect(selectedLabel(screen.getByRole("combobox", { name: "Choose randomization mode" }) as HTMLSelectElement)).toBe("Spread Mode");

    resetPage();
    localStorage.setItem("rr_randomizationMode", "NotAMode");
    mountPage();
    expect(selectedLabel(screen.getByRole("combobox", { name: "Choose randomization mode" }) as HTMLSelectElement)).toBe("Smart Shuffle");
  });
});

describe("photo duration", () => {
  it("starts at 15 seconds, restores a saved value, and ignores a saved value out of range", () => {
    mountPage();
    expect((screen.getByRole("spinbutton", { name: "Photo duration in seconds" }) as HTMLInputElement).value).toBe("15");

    resetPage();
    localStorage.setItem("rr_photoDuration", "42");
    mountPage();
    expect((screen.getByRole("spinbutton", { name: "Photo duration in seconds" }) as HTMLInputElement).value).toBe("42");

    resetPage();
    localStorage.setItem("rr_photoDuration", "500");
    mountPage();
    expect((screen.getByRole("spinbutton", { name: "Photo duration in seconds" }) as HTMLInputElement).value).toBe("15");
  });

  it("saves a duration from 1 to 300 seconds and ignores anything else", () => {
    mountPage();
    const input = screen.getByRole("spinbutton", { name: "Photo duration in seconds" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "30" } });
    expect(localStorage.getItem("rr_photoDuration")).toBe("30");

    for (const invalid of ["0", "301", "", "abc"]) {
      fireEvent.change(input, { target: { value: invalid } });
      expect(localStorage.getItem("rr_photoDuration")).toBe("30");
    }
  });

  it("restarts a playing photo's autoplay timer with the new duration", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = new FakeServer();
    server.on("POST", "/api/random", () => json(PHOTO_ITEM));
    mountPage({ server });
    await vi.advanceTimersByTimeAsync(0);

    fireEvent.click(screen.getByRole("button", { name: "Autoplay" }));
    fireEvent.click(screen.getByText("Click here to play (choose a preset or open Filter…)"));
    await vi.advanceTimersByTimeAsync(0);
    expect(server.requests("POST", "/api/random")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Photo duration in seconds" }), { target: { value: "2" } });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(server.requests("POST", "/api/random")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.requests("POST", "/api/random")).toHaveLength(2);
  });
});

describe("now playing", () => {
  it("is hidden before anything plays, then shows the file name, its full name as a tooltip, and the duration", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => json(VIDEO_ITEM));
    mountPage({ server });
    expect(screen.queryByTitle("holiday clip.mp4")).toBeNull();

    await startRandomPick();
    const name = await screen.findByTitle("holiday clip.mp4");
    expect(name.textContent).toBe("holiday clip.mp4");
    const line = name.closest(".now-playing") as HTMLElement;
    expect(line.style.display).not.toBe("none");
    expect((line.textContent ?? "").replace(/\s+/g, " ").trim()).toBe("holiday clip.mp4 1:05");
  });

  it("shortens a long name to 45 characters and keeps the full name in the tooltip", async () => {
    const longName = `${"a".repeat(60)}.mp4`;
    const server = new FakeServer();
    server.on("POST", "/api/random", () => json({ ...VIDEO_ITEM, displayName: longName, id: `C:\\media\\${longName}` }));
    mountPage({ server });

    await startRandomPick();
    const name = await screen.findByTitle(longName);
    expect(name.textContent).toBe(`${"a".repeat(42)}...`);
  });
});

describe("pairing", () => {
  it("shows the pairing prompt when the server needs pairing, and pairs, checks the version, and connects", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => status(401));
    server.on("GET", "/api/presets", () => status(401));
    server.on("POST", "/api/pair", () => json({ paired: true }));
    const page = mountPage({ server });

    const pairButton = await screen.findByRole("button", { name: "Pair" });
    const prompt = pairButton.closest(".pair-section") as HTMLElement;
    await waitFor(() => expect(prompt.style.display).toBe("flex"));
    await screen.findByText("Ready (API offline)");

    server.on("GET", "/api/version", () => json(COMPATIBLE_VERSION));
    server.on("GET", "/api/presets", () => json([FAVORITES_PRESET]));
    fireEvent.input(screen.getByLabelText("Pairing token:"), { target: { value: " token-1 " } });
    fireEvent.click(pairButton);

    await screen.findByText("Ready (API 1)");
    expect(server.requests("POST", "/api/pair")[0]!.body).toEqual({ token: "token-1" });
    await waitFor(() => expect(prompt.style.display).toBe("none"));
    await waitFor(() => expect(optionLabels(presetSelect())).toEqual(["None", "Favorites"]));
    expect(server.logLines()).toContain("status=Paired. hasCurrent=false attempt=0");
    expect(page.streams()).toHaveLength(2);
  });

  it("asks for a token and reports a failed pairing", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => status(401));
    server.on("POST", "/api/pair", () => status(403));
    mountPage({ server });
    await screen.findByText("Ready (API offline)");

    fireEvent.click(screen.getByRole("button", { name: "Pair" }));
    await screen.findByText("Pair token required.");

    fireEvent.input(screen.getByLabelText("Pairing token:"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));
    await screen.findByText("Pairing failed.");
    expect((screen.getByRole("button", { name: "Pair" }).closest(".pair-section") as HTMLElement).style.display).toBe("flex");
  });

  it("pairs on startup with the token from the runtime config", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/pair", () => json({ paired: true }));
    mountPage({ server, config: { pairToken: "config-token" } });

    expect((screen.getByLabelText("Pairing token:") as HTMLInputElement).value).toBe("config-token");
    await waitFor(() => expect(server.requests("POST", "/api/pair")).toHaveLength(1));
    expect(server.requests("POST", "/api/pair")[0]!.body).toEqual({ token: "config-token" });
  });

  it("shows the pairing prompt when a random pick is unauthorized", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => status(401));
    mountPage({ server });
    await screen.findByText("Ready (API 1)");
    const prompt = screen.getByRole("button", { name: "Pair", hidden: true }).closest(".pair-section") as HTMLElement;
    expect(prompt.style.display).toBe("none");

    await startRandomPick();
    await screen.findByText("Unauthorized. Pair first.");
    await waitFor(() => expect(prompt.style.display).toBe("flex"));
  });
});

describe("server compatibility", () => {
  it("blocks a server that lacks a required capability and stops the event stream", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, capabilities: COMPATIBLE_VERSION.capabilities.filter((c) => c !== "api.presets.match") })
    );
    const page = mountPage({ server });

    await screen.findByText("Server missing required capabilities: api.presets.match.");
    expect(page.stream().closed).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Pair", hidden: true }));
    await screen.findByText("Pairing blocked by server compatibility check.");

    await startRandomPick();
    await screen.findByText("Cannot play: server compatibility check failed.");
    expect(server.requests("POST", "/api/random")).toHaveLength(0);
    expect(server.requests("POST", "/api/library/query")).toHaveLength(0);
  });

  it("names an unsupported API version and a minimum client version above this one", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, apiVersion: "2" }));
    mountPage({ server });
    await screen.findByText("Unsupported server API version: 2.");

    resetPage();
    const newer = new FakeServer();
    newer.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, minimumCompatibleApiVersion: "3" }));
    mountPage({ server: newer });
    await screen.findByText("Server requires client API version 3 or newer.");
  });
});

describe("mobile diagnostics", () => {
  it("shows the client and session ids on a mobile browser", async () => {
    resetPage(IPHONE_USER_AGENT);
    const page = mountPage();
    await settle();

    const line = screen.getByText(/^Diagnostics:/);
    expect(line.textContent).toBe(
      `Diagnostics: clientId=${page.clientId().slice(0, 10)}..., sessionId=${page.sessionId().slice(0, 10)}..., type=mobile-web`
    );
    expect(line.style.display).toBe("block");
    expect(page.stream().param("clientType")).toBe("mobile-web");
    expect(page.stream().param("deviceName")).toMatch(/^Mobile Browser \(/);
  });

  it("stays hidden on a desktop browser", async () => {
    mountPage();
    await settle();
    expect(screen.queryByText(/^Diagnostics:/)).toBeNull();
  });
});

describe("page structure", () => {
  it("keeps the starting markup", async () => {
    const page = mountPage();
    await screen.findByText("Ready (API 1)");
    await settle();
    expect(normalizedMarkup(page.root)).toMatchSnapshot();
  });

  it("keeps the same video element while the header and status line change", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/presets", () => json([FAVORITES_PRESET]));
    server.on("POST", "/api/random", () => json(VIDEO_ITEM));
    const page = mountPage({ server });
    const video = page.root.querySelector("video");
    const seek = screen.getByRole("slider", { name: "Seek", hidden: true }) as HTMLInputElement;
    seek.value = "40";

    await screen.findByText("Ready (API 1)");
    await waitFor(() => expect(optionLabels(presetSelect())).toEqual(["None", "Favorites"]));
    fireEvent.change(presetSelect(), { target: { value: "preset-favorites" } });
    await startRandomPick();
    await screen.findByTitle("holiday clip.mp4");
    page.stream().open();
    await screen.findByText("SSE connected");

    expect(page.root.querySelector("video")).toBe(video);
    expect(video?.isConnected).toBe(true);
    expect(seek.value).toBe("40");
  });
});

describe("startup error", () => {
  it("shows the error message as text", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderStartupError(root, "Runtime config '<b>apiBaseUrl</b>' is required.");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ReelRoulette");
    expect(screen.getByText("Runtime Configuration Error")).toBeTruthy();
    expect(screen.getByText("Runtime config '<b>apiBaseUrl</b>' is required.")).toBeTruthy();
    expect(root.querySelector("b")).toBeNull();
  });
});
