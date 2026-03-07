import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const webUiRoot = resolve(import.meta.dirname, "..");
const openApiPath = resolve(webUiRoot, "../../../../shared/api/openapi.yaml");
const generatedPath = resolve(webUiRoot, "src/types/openapi.generated.ts");
const tempPath = resolve(webUiRoot, ".openapi.generated.tmp.ts");
const generatorBinary = process.platform === "win32"
  ? resolve(webUiRoot, "node_modules/.bin/openapi-typescript.cmd")
  : resolve(webUiRoot, "node_modules/.bin/openapi-typescript");
const generationCommand = `"${generatorBinary}" "${openApiPath}" -o "${tempPath}"`;

const generation = spawnSync(generationCommand, {
  cwd: webUiRoot,
  shell: true,
  stdio: "pipe",
  encoding: "utf8"
});

if (generation.status !== 0) {
  process.stderr.write(generation.stderr || generation.stdout || generation.error?.message || "OpenAPI contract generation failed.\n");
  process.exit(generation.status ?? 1);
}

const normalize = (value) => String(value).replace(/\r\n/g, "\n");
const generated = normalize(readFileSync(generatedPath, "utf8"));
const expected = normalize(readFileSync(tempPath, "utf8"));
rmSync(tempPath, { force: true });

if (generated !== expected) {
  process.stderr.write(
    "Generated contracts are stale. Run `npm run generate:contracts` in ReelRoulette.WebUI and commit src/types/openapi.generated.ts.\n"
  );
  process.exit(1);
}

process.stdout.write("OpenAPI generated contracts are up-to-date.\n");
