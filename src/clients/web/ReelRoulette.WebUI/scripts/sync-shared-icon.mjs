import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webUiRoot = resolve(scriptDir, "..");
const sourceIcon = resolve(webUiRoot, "..", "..", "..", "..", "assets", "HI.ico");
const targetIcon = resolve(webUiRoot, "public", "HI.ico");
const sourcePwaSource = resolve(webUiRoot, "..", "..", "..", "..", "assets", "HI-256.png");
const targetPwaIcon192 = resolve(webUiRoot, "public", "icons", "icon-192.png");
const sourcePwa512Source = resolve(webUiRoot, "..", "..", "..", "..", "assets", "HI-512.png");
const targetPwaIcon512 = resolve(webUiRoot, "public", "icons", "icon-512.png");
const targetAppleTouchIcon = resolve(webUiRoot, "public", "icons", "apple-touch-icon.png");
const sourceMaterialSymbolsFont = resolve(
  webUiRoot,
  "..",
  "..",
  "..",
  "..",
  "assets",
  "fonts",
  "MaterialSymbolsOutlined.var.ttf"
);
const targetMaterialSymbolsFont = resolve(
  webUiRoot,
  "public",
  "assets",
  "fonts",
  "MaterialSymbolsOutlined.var.ttf"
);

function copyRequiredAsset(sourcePath, targetPath, label) {
  if (!existsSync(sourcePath)) {
    throw new Error(`${label} not found: ${sourcePath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  console.log(`Synced ${label}: ${sourcePath} -> ${targetPath}`);
}

/**
 * Writes a square PNG at exact pixel dimensions (manifest `sizes` must match file dimensions).
 */
async function writeResizedPng(sourcePath, targetPath, width, height, label) {
  if (!existsSync(sourcePath)) {
    throw new Error(`${label} source not found: ${sourcePath}`);
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  await sharp(sourcePath)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toFile(targetPath);
  const meta = await sharp(targetPath).metadata();
  if (meta.width !== width || meta.height !== height) {
    throw new Error(`${label}: expected ${width}x${height}, got ${meta.width}x${meta.height}`);
  }
  console.log(`Generated ${label}: ${sourcePath} -> ${targetPath} (${width}x${height})`);
}

async function main() {
  copyRequiredAsset(sourceIcon, targetIcon, "shared icon");
  await writeResizedPng(sourcePwaSource, targetPwaIcon192, 192, 192, "PWA icon 192");
  await writeResizedPng(sourcePwa512Source, targetPwaIcon512, 512, 512, "PWA icon 512");
  await writeResizedPng(sourcePwa512Source, targetAppleTouchIcon, 180, 180, "Apple touch icon");
  copyRequiredAsset(sourceMaterialSymbolsFont, targetMaterialSymbolsFont, "Material Symbols font");
}

await main();
