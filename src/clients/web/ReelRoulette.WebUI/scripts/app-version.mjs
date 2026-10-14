import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const versionFile = resolve(scriptDir, "..", "..", "..", "..", "..", ".version");

/**
 * The app's version, from the repository's `.version` file, which `set-release-version.ps1` sets for each release,
 * without its leading `v`: "0.15.0" for `v0.15.0`. The build and its output check both read it here.
 */
export function readAppVersion() {
  let raw;
  try {
    raw = readFileSync(versionFile, "utf8");
  } catch {
    throw new Error(`Missing the repository's version file: ${versionFile}`);
  }
  const version = raw.trim().replace(/^v/, "");
  if (!version) {
    throw new Error(`The repository's version file is empty: ${versionFile}`);
  }
  return version;
}
