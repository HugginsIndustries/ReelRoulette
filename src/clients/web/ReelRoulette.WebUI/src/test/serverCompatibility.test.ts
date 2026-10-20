import { describe, expect, it } from "vitest";
import { serverCapabilitiesOf, serverCompatibilityError, serverVersionOf } from "../state/serverCompatibility";

const CAPABILITIES = [
  "auth.sessionCookie",
  "identity.sessionId",
  "events.refreshStatusChanged",
  "events.resyncRequired",
  "api.random.filterState",
  "api.presets.byId"
];

describe("serverCompatibilityError", () => {
  it("accepts API version 2 with every required capability", () => {
    expect(serverCompatibilityError({ apiVersion: "2", minimumCompatibleApiVersion: "2", capabilities: CAPABILITIES })).toBeNull();
  });

  it("refuses API versions 1 and 0, which named items by path", () => {
    expect(serverCompatibilityError({ apiVersion: "1", capabilities: CAPABILITIES })).toBe("Unsupported server API version: 1.");
    expect(serverCompatibilityError({ apiVersion: "0", capabilities: CAPABILITIES })).toBe("Unsupported server API version: 0.");
  });

  it("names an unsupported or missing API version", () => {
    expect(serverCompatibilityError({ apiVersion: "3", capabilities: CAPABILITIES })).toBe("Unsupported server API version: 3.");
    expect(serverCompatibilityError({ capabilities: CAPABILITIES })).toBe("Unsupported server API version: unknown.");
    expect(serverCompatibilityError(null)).toBe("Unsupported server API version: unknown.");
  });

  it("names a minimum client version above this one", () => {
    expect(serverCompatibilityError({ apiVersion: "2", minimumCompatibleApiVersion: "3", capabilities: CAPABILITIES })).toBe(
      "Server requires client API version 3 or newer."
    );
  });

  it("lists every missing capability", () => {
    expect(serverCompatibilityError({ apiVersion: "2", capabilities: ["auth.sessionCookie", "identity.sessionId"] })).toBe(
      "Server missing required capabilities: events.refreshStatusChanged, events.resyncRequired, api.random.filterState, api.presets.byId."
    );
  });
});

describe("serverVersionOf", () => {
  it("reads the release version from assetsVersion, not the assembly's appVersion, with the API version", () => {
    expect(serverVersionOf({ appVersion: "0.15.0.0", assetsVersion: "0.15.0-dev.1", apiVersion: "1" })).toEqual({
      version: "0.15.0-dev.1",
      apiVersion: "1"
    });
  });

  it("falls back to appVersion from a server that sends no assetsVersion, and leaves out what isn't text", () => {
    expect(serverVersionOf({ appVersion: " 0.14.2.0 ", assetsVersion: null, apiVersion: "1" })).toEqual({ version: "0.14.2.0", apiVersion: "1" });
    expect(serverVersionOf({ assetsVersion: "  ", apiVersion: 1 })).toEqual({ version: "", apiVersion: "" });
    expect(serverVersionOf(null)).toEqual({ version: "", apiVersion: "" });
  });
});

describe("serverCapabilitiesOf", () => {
  it("reads the listed capabilities, the optional ones too, and none from a server that sends no list", () => {
    expect(serverCapabilitiesOf({ capabilities: [...CAPABILITIES, "api.showInFileManager"] })).toEqual([...CAPABILITIES, "api.showInFileManager"]);
    expect(serverCapabilitiesOf({ capabilities: "api.showInFileManager" })).toEqual([]);
    expect(serverCapabilitiesOf({ apiVersion: "2" })).toEqual([]);
    expect(serverCapabilitiesOf(null)).toEqual([]);
  });
});
