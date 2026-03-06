import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "../config/runtimeConfig";

describe("runtime config parsing", () => {
  it("accepts valid runtime config values", () => {
    const config = parseRuntimeConfig({
      apiBaseUrl: "http://localhost:51301/",
      sseUrl: "http://localhost:51301/api/events/",
      pairToken: "  dev-token "
    });

    expect(config.apiBaseUrl).toBe("http://localhost:51301");
    expect(config.sseUrl).toBe("http://localhost:51301/api/events");
    expect(config.pairToken).toBe("dev-token");
  });

  it("rejects missing apiBaseUrl", () => {
    expect(() =>
      parseRuntimeConfig({
        sseUrl: "http://localhost:51301/api/events"
      })
    ).toThrowError("Runtime config 'apiBaseUrl' is required.");
  });

  it("rejects non-http urls", () => {
    expect(() =>
      parseRuntimeConfig({
        apiBaseUrl: "file:///tmp/api",
        sseUrl: "http://localhost:51301/api/events"
      })
    ).toThrowError("Runtime config 'apiBaseUrl' must use http or https.");
  });

  it("rejects apiBaseUrl values that include a path segment", () => {
    expect(() =>
      parseRuntimeConfig({
        apiBaseUrl: "http://localhost:51301/api",
        sseUrl: "http://localhost:51301/api/events"
      })
    ).toThrowError("Runtime config 'apiBaseUrl' must be host root (no path).");
  });
});
