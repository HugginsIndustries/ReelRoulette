import { access, readFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const distDir = path.join(cwd, "dist");
const indexPath = path.join(distDir, "index.html");
const runtimeConfigPath = path.join(distDir, "runtime-config.json");
const manifestPath = path.join(distDir, "manifest.webmanifest");
const pwaIcon192Path = path.join(distDir, "icons", "icon-192.png");
const pwaIcon512Path = path.join(distDir, "icons", "icon-512.png");
const appleTouchIconPath = path.join(distDir, "icons", "apple-touch-icon.png");
const assetsDir = path.join(distDir, "assets");

async function assertExists(targetPath, description) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

async function run() {
  await assertExists(distDir, "dist directory");
  await assertExists(indexPath, "index.html");
  await assertExists(runtimeConfigPath, "runtime config file");
  await assertExists(manifestPath, "web app manifest file");
  await assertExists(pwaIcon192Path, "PWA icon 192");
  await assertExists(pwaIcon512Path, "PWA icon 512");
  await assertExists(appleTouchIconPath, "Apple touch icon");
  await assertExists(assetsDir, "assets directory");

  const runtimeConfigRaw = await readFile(runtimeConfigPath, "utf8");
  let runtimeConfig;
  try {
    runtimeConfig = JSON.parse(runtimeConfigRaw);
  } catch {
    throw new Error("dist/runtime-config.json is not valid JSON.");
  }

  if (
    !runtimeConfig ||
    typeof runtimeConfig.apiBaseUrl !== "string" ||
    runtimeConfig.apiBaseUrl.length === 0
  ) {
    throw new Error("dist/runtime-config.json must include non-empty string 'apiBaseUrl'.");
  }

  if (!runtimeConfig || typeof runtimeConfig.sseUrl !== "string" || runtimeConfig.sseUrl.length === 0) {
    throw new Error("dist/runtime-config.json must include non-empty string 'sseUrl'.");
  }

  const indexHtml = await readFile(indexPath, "utf8");
  if (!indexHtml.includes("assets/")) {
    throw new Error("dist/index.html does not reference built asset bundles.");
  }

  console.log("Build output verification passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
