import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webUiRoot = resolve(scriptDir, "..");
const sourceIcon = resolve(webUiRoot, "..", "..", "..", "..", "assets", "HI.ico");
const targetIcon = resolve(webUiRoot, "public", "HI.ico");
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

copyRequiredAsset(sourceIcon, targetIcon, "shared icon");
copyRequiredAsset(sourceMaterialSymbolsFont, targetMaterialSymbolsFont, "Material Symbols font");
