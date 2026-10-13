import { describe, expect, it } from "vitest";
import { KEPT_SOURCES_LOG_TEXT, keptSourcesMessage } from "../library/keptSources";

const PHONE = { id: "src-phone", displayName: "Phone backup", rootPath: "/media/phone" };
const CAMERA = { id: "src-camera", displayName: "/media/camera", rootPath: "/media/camera" };
const ARCHIVE = { id: "src-archive", displayName: "", rootPath: "/mnt/archive" };

describe("keptSourcesMessage", () => {
  it("names one source with its folder, as the Filter tab labels it", () => {
    expect(keptSourcesMessage([{ source: PHONE, itemCount: 2 }])).toBe(
      "Library refresh found no media files in Phone backup (/media/phone), so it kept the library's 2 items from there. If the folder is on a drive or share, check that it's connected."
    );
  });

  it("counts a single kept item as one item", () => {
    expect(keptSourcesMessage([{ source: PHONE, itemCount: 1 }])).toContain("so it kept the library's 1 item from there.");
  });

  it("names a source whose name is its folder once", () => {
    expect(keptSourcesMessage([{ source: CAMERA, itemCount: 7 }])).toBe(
      "Library refresh found no media files in /media/camera, so it kept the library's 7 items from there. If the folder is on a drive or share, check that it's connected."
    );
  });

  it("names two sources joined with and, counting their items together", () => {
    expect(
      keptSourcesMessage([
        { source: PHONE, itemCount: 2 },
        { source: CAMERA, itemCount: 1500 }
      ])
    ).toBe(
      `Library refresh found no media files in Phone backup (/media/phone) and /media/camera, so it kept the library's ${(1502).toLocaleString()} items from them. If the folders are on a drive or share, check that it's connected.`
    );
  });

  it("names three sources with commas and a final and", () => {
    expect(
      keptSourcesMessage([
        { source: PHONE, itemCount: 1 },
        { source: CAMERA, itemCount: 2 },
        { source: ARCHIVE, itemCount: 3 }
      ])
    ).toBe(
      "Library refresh found no media files in Phone backup (/media/phone), /media/camera and /mnt/archive, so it kept the library's 6 items from them. If the folders are on a drive or share, check that it's connected."
    );
  });

  it("logs a line that names no folder", () => {
    expect(KEPT_SOURCES_LOG_TEXT).toBe("Library refresh kept the items of sources whose folder listed no media files");
  });
});
