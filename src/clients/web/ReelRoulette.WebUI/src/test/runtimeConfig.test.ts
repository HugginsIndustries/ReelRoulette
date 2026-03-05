import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "../config/runtimeConfig";

describe("runtime config parsing", () => {
  it("accepts valid runtime config values", () => {
    const config = parseRuntimeConfig({
      apiBaseUrl: "http://localhost:51301/api/",
      sseUrl: "http://localhost:51301/api/events/"
    });

    expect(config.apiBaseUrl).toBe("http://localhost:51301/api");
    expect(config.sseUrl).toBe("http://localhost:51301/api/events");
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
});
