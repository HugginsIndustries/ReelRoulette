import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webUiRoot = resolve(scriptDir, "..");
const sourceIcon = resolve(webUiRoot, "..", "..", "..", "..", "assets", "HI.ico");
const targetIcon = resolve(webUiRoot, "public", "HI.ico");

if (!existsSync(sourceIcon)) {
  throw new Error(`Shared icon not found: ${sourceIcon}`);
}

mkdirSync(dirname(targetIcon), { recursive: true });
copyFileSync(sourceIcon, targetIcon);
console.log(`Synced shared icon: ${sourceIcon} -> ${targetIcon}`);
