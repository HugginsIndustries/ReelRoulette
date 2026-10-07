import { describe, expect, it } from "vitest";
import { serverCompatibilityError } from "../state/serverCompatibility";

const CAPABILITIES = [
  "auth.sessionCookie",
  "identity.sessionId",
  "events.refreshStatusChanged",
  "events.resyncRequired",
  "api.random.filterState",
  "api.presets.match"
];

describe("serverCompatibilityError", () => {
  it("accepts API versions 1 and 0 with every required capability", () => {
    expect(serverCompatibilityError({ apiVersion: "1", minimumCompatibleApiVersion: "1", capabilities: CAPABILITIES })).toBeNull();
    expect(serverCompatibilityError({ apiVersion: "0", capabilities: CAPABILITIES })).toBeNull();
  });

  it("names an unsupported or missing API version", () => {
    expect(serverCompatibilityError({ apiVersion: "2", capabilities: CAPABILITIES })).toBe("Unsupported server API version: 2.");
    expect(serverCompatibilityError({ capabilities: CAPABILITIES })).toBe("Unsupported server API version: unknown.");
    expect(serverCompatibilityError(null)).toBe("Unsupported server API version: unknown.");
  });

  it("names a minimum client version above this one", () => {
    expect(serverCompatibilityError({ apiVersion: "1", minimumCompatibleApiVersion: "2", capabilities: CAPABILITIES })).toBe(
      "Server requires client API version 2 or newer."
    );
  });

  it("lists every missing capability", () => {
    expect(serverCompatibilityError({ apiVersion: "1", capabilities: ["auth.sessionCookie", "identity.sessionId"] })).toBe(
      "Server missing required capabilities: events.refreshStatusChanged, events.resyncRequired, api.random.filterState, api.presets.match."
    );
  });
});
