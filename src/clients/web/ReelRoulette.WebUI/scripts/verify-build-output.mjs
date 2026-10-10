import { access, readFile } from "node:fs/promises";
import path from "node:path";
// Node runs this TypeScript module as is by stripping its types, so the build is checked by the app's own rules.
import { parseRuntimeConfig } from "../src/config/runtimeConfig.ts";

const cwd = process.cwd();
const distDir = path.join(cwd, "dist");
const indexPath = path.join(distDir, "index.html");
const runtimeConfigPath = path.join(distDir, "runtime-config.json");
const manifestPath = path.join(distDir, "manifest.webmanifest");
const serviceWorkerPath = path.join(distDir, "sw.js");
const faviconPath = path.join(distDir, "favicon.ico");
const logoIconPath = path.join(distDir, "icons", "logo-icon.svg");
const logoLockupPath = path.join(distDir, "icons", "logo-lockup.svg");
const logoLockupDarkPath = path.join(distDir, "icons", "logo-lockup-dark.svg");
const appleTouchIconPath = path.join(distDir, "icons", "apple-touch-icon.png");
const assetsDir = path.join(distDir, "assets");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function assertExists(targetPath, description) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

/** Reads a PNG's pixel size from its IHDR header, which follows the signature. */
async function readPngSize(filePath) {
  const bytes = await readFile(filePath);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function assertPngSize(filePath, width, height, description) {
  const size = await readPngSize(filePath);
  if (size.width !== width || size.height !== height) {
    throw new Error(`${description} is ${size.width}x${size.height}, expected ${width}x${height}: ${filePath}`);
  }
}

async function verifyManifestIcons() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("dist/manifest.webmanifest is not valid JSON.");
  }

  const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
  const purposes = new Set();
  for (const icon of icons) {
    if (typeof icon?.src !== "string" || !icon.src.startsWith("/")) {
      throw new Error(`Manifest icon has no root-relative 'src': ${JSON.stringify(icon)}`);
    }
    const iconPath = path.join(distDir, ...icon.src.slice(1).split("/"));
    await assertExists(iconPath, `manifest icon ${icon.src}`);

    for (const purpose of String(icon.purpose ?? "any").split(/\s+/).filter(Boolean)) {
      purposes.add(purpose);
    }

    if (icon.type === "image/png") {
      const match = /^(\d+)x(\d+)$/.exec(String(icon.sizes ?? ""));
      if (!match) {
        throw new Error(`Manifest icon ${icon.src} must declare its 'sizes' as WIDTHxHEIGHT.`);
      }
      await assertPngSize(iconPath, Number(match[1]), Number(match[2]), `Manifest icon ${icon.src} (sizes ${icon.sizes})`);
    }
  }

  for (const purpose of ["any", "maskable"]) {
    if (!purposes.has(purpose)) {
      throw new Error(`dist/manifest.webmanifest has no icon with purpose '${purpose}'.`);
    }
  }
}

async function verifyRuntimeConfig() {
  const runtimeConfigRaw = await readFile(runtimeConfigPath, "utf8");
  let runtimeConfig;
  try {
    runtimeConfig = JSON.parse(runtimeConfigRaw);
  } catch {
    throw new Error("dist/runtime-config.json is not valid JSON.");
  }

  try {
    parseRuntimeConfig(runtimeConfig);
  } catch (error) {
    throw new Error(`dist/runtime-config.json is rejected by the app: ${error.message}`);
  }
}

async function run() {
  await assertExists(distDir, "dist directory");
  await assertExists(indexPath, "index.html");
  await assertExists(runtimeConfigPath, "runtime config file");
  await assertExists(manifestPath, "web app manifest file");
  await assertExists(serviceWorkerPath, "service worker file");
  await assertExists(faviconPath, "favicon");
  await assertExists(logoIconPath, "logo icon");
  await assertExists(logoLockupPath, "logo lockup (dark theme)");
  await assertExists(logoLockupDarkPath, "logo lockup (light theme)");
  await assertExists(appleTouchIconPath, "Apple touch icon");
  await assertExists(assetsDir, "assets directory");

  await assertPngSize(appleTouchIconPath, 180, 180, "Apple touch icon");
  await verifyManifestIcons();
  await verifyRuntimeConfig();

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
