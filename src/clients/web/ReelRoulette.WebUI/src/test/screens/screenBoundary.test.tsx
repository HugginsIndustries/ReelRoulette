// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenBoundary } from "../../ui/ScreenBoundary";
import { FakeServer, json, mountPage, resetPage } from "./pageHarness";

// The now-playing line throws once an item plays, as a render bug in the header would.
vi.mock("../../playback/nowPlaying", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../playback/nowPlaying")>();
  return {
    ...actual,
    nowPlayingView(item: unknown) {
      if (item) {
        throw new TypeError("Cannot read C:\\media\\holiday clip.mp4");
      }
      return null;
    }
  };
});

function Broken(): never {
  throw new RangeError("broken");
}

beforeEach(() => {
  resetPage();
});

afterEach(() => {
  cleanup();
});

describe("ScreenBoundary", () => {
  it("hides a screen that fails on its first render, relays one line, and renders its siblings", () => {
    const relay = vi.fn();
    render(
      <div>
        <ScreenBoundary screen="header" relay={relay}>
          <Broken />
        </ScreenBoundary>
        <ScreenBoundary screen="status" relay={relay}>
          <p>Ready</p>
        </ScreenBoundary>
      </div>
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    expect(relay).toHaveBeenCalledTimes(1);
    expect(relay).toHaveBeenCalledWith("error", "ui-error screen=header error=RangeError");
  });

  it("keeps the player, status line, and connection working when the header fails after an item plays", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () =>
      json({
        id: "C:\\media\\holiday clip.mp4",
        itemId: "item-video",
        displayName: "holiday clip.mp4",
        mediaType: "video",
        durationSeconds: 65,
        mediaUrl: "/api/media/item-video?token=t",
        isFavorite: false,
        isBlacklisted: false
      })
    );
    const page = mountPage({ server });
    await screen.findByText("Ready (API 1)");
    expect(screen.getByRole("combobox", { name: "Choose preset" })).toBeTruthy();

    fireEvent.click(screen.getByText("Click here to play (choose a preset or open Filter…)"));

    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=header error=TypeError"));
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(screen.queryByRole("combobox", { name: "Choose preset" })).toBeNull();
    expect((page.root.querySelector("video") as HTMLVideoElement).src).toContain("/api/media/item-video");

    page.stream().open();
    await screen.findByText("SSE connected");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(server.requests("POST", "/api/random")).toHaveLength(2));
  });
});
