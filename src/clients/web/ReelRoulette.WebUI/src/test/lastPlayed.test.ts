import { describe, expect, it } from "vitest";
import { createLastPlayedBeforePlay } from "../stats/lastPlayed";

const EARLIER = "2026-10-01T12:00:00Z";
const EARLIER_MS = Date.parse(EARLIER);
/** The item's own last-played time, which a play has already moved to now. */
const ITEM_NOW_MS = Date.parse("2026-10-13T20:00:00Z");

describe("last played before this play", () => {
  it("is the item's own time until a playback event says", () => {
    const lastPlayed = createLastPlayedBeforePlay();
    lastPlayed.started("item-a");

    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(ITEM_NOW_MS);
  });

  it("is the playing item's event's time from before the play, or never", () => {
    const lastPlayed = createLastPlayedBeforePlay();
    lastPlayed.started("item-a");
    lastPlayed.recorded("item-a", EARLIER);
    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(EARLIER_MS);

    lastPlayed.started("item-b");
    lastPlayed.recorded("item-b", null);
    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBeNull();
  });

  it("holds an event that comes before its item starts, as a library play's does, until that item starts", () => {
    const lastPlayed = createLastPlayedBeforePlay();
    lastPlayed.started("item-a");
    lastPlayed.recorded("item-b", EARLIER);
    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(ITEM_NOW_MS);

    lastPlayed.started("item-b");
    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(EARLIER_MS);
  });

  it("drops a held event when another item starts first", () => {
    const lastPlayed = createLastPlayedBeforePlay();
    lastPlayed.recorded("item-b", EARLIER);
    lastPlayed.started("item-c");
    lastPlayed.started("item-b");

    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(ITEM_NOW_MS);
  });

  it("keeps what an event said when the same item plays again, and takes the next play's event", () => {
    const lastPlayed = createLastPlayedBeforePlay();
    lastPlayed.started("item-a");
    lastPlayed.recorded("item-a", null);
    lastPlayed.started("item-a");
    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBeNull();

    lastPlayed.recorded("item-a", EARLIER);
    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(EARLIER_MS);
  });

  it("ignores an event that leaves the time out", () => {
    const lastPlayed = createLastPlayedBeforePlay();
    lastPlayed.started("item-a");
    lastPlayed.recorded("item-a", undefined);

    expect(lastPlayed.shownFor(ITEM_NOW_MS)).toBe(ITEM_NOW_MS);
  });
});
