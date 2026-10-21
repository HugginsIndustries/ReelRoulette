import { defineConfig } from "vite";
import { readAppVersion } from "./scripts/app-version.mjs";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion())
  }
});
