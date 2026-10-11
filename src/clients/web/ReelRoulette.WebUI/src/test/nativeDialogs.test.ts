import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// The WebUI asks and tells the user in its own dialog, never the browser's alert, confirm, or prompt, which don't match
// its look and don't suit it as an installed app.

const NATIVE_DIALOGS = new Set(["alert", "confirm", "prompt"]);
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);
const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Each place the code calls one of the browser's dialogs bare, or names one on a global object, as "file:line: code". */
function nativeDialogUses(fileName: string, text: string): string[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const onGlobal = (object: ts.Expression) => ts.isIdentifier(object) && GLOBAL_OBJECTS.has(object.text);
  const visit = (node: ts.Node): void => {
    const bareCall = ts.isCallExpression(node) && ts.isIdentifier(node.expression) && NATIVE_DIALOGS.has(node.expression.text);
    const globalMember = ts.isPropertyAccessExpression(node) && onGlobal(node.expression) && NATIVE_DIALOGS.has(node.name.text);
    const globalIndex =
      ts.isElementAccessExpression(node) &&
      onGlobal(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      NATIVE_DIALOGS.has(node.argumentExpression.text);
    if (bareCall || globalMember || globalIndex) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${fileName}:${line + 1}: ${node.getText()}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The WebUI's source files, leaving out its tests. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return relative(SOURCE_ROOT, path) === "test" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("native dialogs", () => {
  it("finds a bare call, and a call or a reference through a global object", () => {
    const uses = nativeDialogUses(
      "sample.ts",
      [
        'if (confirm("Delete?")) {}',
        'const name = window.prompt("Name", "");',
        "const ask = globalThis.alert;",
        'self["confirm"]("Discard?");'
      ].join("\n")
    );
    expect(uses).toEqual([
      'sample.ts:1: confirm("Delete?")',
      'sample.ts:2: window.prompt',
      "sample.ts:3: globalThis.alert",
      'sample.ts:4: self["confirm"]'
    ]);
  });

  it("leaves the in-app dialog's calls, options, and methods of the same names alone", () => {
    const uses = nativeDialogUses(
      "sample.tsx",
      [
        'void dialogs.confirm({ message: "Delete?", confirmLabel: "Delete" });',
        "const ask = options.prompt;",
        "const confirm = true;",
        "const service = { confirm() { return true; } };",
        "const element = <button onClick={() => void dialogs.notice(\"Done\")}>OK</button>;"
      ].join("\n")
    );
    expect(uses).toEqual([]);
  });

  it("the WebUI calls none of the browser's alert, confirm, or prompt", () => {
    const files = sourceFiles(SOURCE_ROOT);
    expect(files.length).toBeGreaterThan(40);
    const uses = files.flatMap((file) => nativeDialogUses(relative(SOURCE_ROOT, file), readFileSync(file, "utf8")));
    expect(uses).toEqual([]);
  });
});
