// src/app.js is untyped, so `npm run typecheck` does not cover it and an undeclared name passes the build and
// tests. This check runs TypeScript over app.js and fails only on "Cannot find name" errors, without requiring
// the rest of app.js to type-check. It goes away with app.js in the WebUI Preact migration.
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const webUiRoot = resolve(import.meta.dirname, "..");
const appPath = resolve(webUiRoot, "src/app.js");

if (!existsSync(appPath)) {
  process.stderr.write("src/app.js was not found. Remove this check from `npm run verify` along with app.js.\n");
  process.exit(1);
}

const program = ts.createProgram([appPath], {
  allowJs: true,
  checkJs: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  // Browser globals only, so a Node global such as `process` counts as undeclared.
  types: [],
  skipLibCheck: true
});
const appFile = program.getSourceFile(appPath);
const undeclared = ts.getPreEmitDiagnostics(program, appFile)
  .map((diagnostic) => ({ diagnostic, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n") }))
  .filter(({ message }) => message.startsWith("Cannot find name"));

if (undeclared.length > 0) {
  for (const { diagnostic, message } of undeclared) {
    const { line, character } = appFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    process.stderr.write(`${relative(webUiRoot, appPath)}(${line + 1},${character + 1}): ${message}\n`);
  }
  process.stderr.write(`src/app.js uses ${undeclared.length} undeclared name(s).\n`);
  process.exit(1);
}

process.stdout.write("src/app.js has no undeclared names.\n");
