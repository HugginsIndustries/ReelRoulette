import { describe, expect, it } from "vitest";
import { applyItemStateToCurrent, type CurrentItem } from "../library/currentItemState";

function current(itemId: string, id: string): CurrentItem & { id: string } {
  return { id, itemId, isFavorite: false, isBlacklisted: false };
}

describe("currentItemState", () => {
  it("applies an item-state event to the current item by item id, not to one whose path differs only in case", () => {
    const playing = current("id-upper", "/media/Clip.mp4");

    const appliedOther = applyItemStateToCurrent(playing, { itemId: "id-lower", isFavorite: true, isBlacklisted: false });
    expect(appliedOther).toBe(false);
    expect(playing.isFavorite).toBe(false);

    const appliedOwn = applyItemStateToCurrent(playing, { itemId: "id-upper", isFavorite: false, isBlacklisted: true });
    expect(appliedOwn).toBe(true);
    expect(playing.isBlacklisted).toBe(true);
  });

  it("does not match the current item by path", () => {
    const playing = current("id-upper", "/media/Clip.mp4");
    expect(applyItemStateToCurrent(playing, { itemId: "/media/Clip.mp4", isFavorite: true })).toBe(false);
    expect(applyItemStateToCurrent(null, { itemId: "id-upper", isFavorite: true })).toBe(false);
  });
});
