import { defineConfig } from "vitest/config";
import { readAppVersion } from "./scripts/app-version.mjs";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion())
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.{ts,tsx}"]
  }
});
