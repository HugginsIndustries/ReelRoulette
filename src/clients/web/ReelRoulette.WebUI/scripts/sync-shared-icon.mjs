import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webUiRoot = resolve(scriptDir, "..");
const repoAssets = resolve(webUiRoot, "..", "..", "..", "..", "assets");
const logoDir = resolve(repoAssets, "logo");
const publicDir = resolve(webUiRoot, "public");
const publicIconsDir = resolve(publicDir, "icons");

/**
 * The logo files the WebUI serves, copied as they are: the favicon, the header's logos, and the PWA and Apple
 * touch icons. Each PNG is already drawn at the size the manifest and index.html declare for it.
 */
const logoFiles = [
  { source: resolve(logoDir, "favicon.ico"), target: resolve(publicDir, "favicon.ico"), label: "favicon" },
  { source: resolve(logoDir, "logo-icon.svg"), target: resolve(publicIconsDir, "logo-icon.svg"), label: "logo icon" },
  { source: resolve(logoDir, "logo-lockup.svg"), target: resolve(publicIconsDir, "logo-lockup.svg"), label: "logo lockup (dark theme)" },
  {
    source: resolve(logoDir, "logo-lockup-dark.svg"),
    target: resolve(publicIconsDir, "logo-lockup-dark.svg"),
    label: "logo lockup (light theme)"
  },
  { source: resolve(logoDir, "png", "pwa-192.png"), target: resolve(publicIconsDir, "pwa-192.png"), label: "PWA icon 192" },
  { source: resolve(logoDir, "png", "pwa-512.png"), target: resolve(publicIconsDir, "pwa-512.png"), label: "PWA icon 512" },
  {
    source: resolve(logoDir, "png", "pwa-maskable-192.png"),
    target: resolve(publicIconsDir, "pwa-maskable-192.png"),
    label: "PWA maskable icon 192"
  },
  {
    source: resolve(logoDir, "png", "pwa-maskable-512.png"),
    target: resolve(publicIconsDir, "pwa-maskable-512.png"),
    label: "PWA maskable icon 512"
  },
  {
    source: resolve(logoDir, "png", "apple-touch-icon.png"),
    target: resolve(publicIconsDir, "apple-touch-icon.png"),
    label: "Apple touch icon"
  }
];

const sourceMaterialSymbolsFont = resolve(repoAssets, "fonts", "MaterialSymbolsOutlined.var.ttf");
const targetMaterialSymbolsFont = resolve(publicDir, "assets", "fonts", "MaterialSymbolsOutlined.var.ttf");

function copyRequiredAsset(sourcePath, targetPath, label) {
  if (!existsSync(sourcePath)) {
    throw new Error(`${label} not found: ${sourcePath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  console.log(`Synced ${label}: ${sourcePath} -> ${targetPath}`);
}

for (const file of logoFiles) {
  copyRequiredAsset(file.source, file.target, file.label);
}
copyRequiredAsset(sourceMaterialSymbolsFont, targetMaterialSymbolsFont, "Material Symbols font");
