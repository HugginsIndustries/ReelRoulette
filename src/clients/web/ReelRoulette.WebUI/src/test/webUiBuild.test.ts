// @vitest-environment happy-dom
// happy-dom loads the stylesheets of a page its DOMParser parses, which a browser doesn't, and logs that it can't.
// @vitest-environment-options {"settings": {"handleDisabledFileLoadingAsSuccess": true}}
import { describe, expect, it } from "vitest";
import { sameWebUiBuild, webUiBuildOf, webUiBuildOfHtml, webUiBuildScriptName } from "../state/webUiBuild";

/** The head of `index.html` as Vite builds it: the theme script, the icons and manifest, then the built files. */
const BUILT_HEAD = `
  <meta charset="UTF-8" />
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" href="/icons/logo-icon.svg" type="image/svg+xml" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <title>ReelRoulette</title>
  <script>
    (function () {})();
  </script>
  <script type="module" crossorigin src="/assets/index-DfW9QbrE.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-GBS-EXN2.css">`;

const BUILT_PAGE = `<!doctype html><html lang="en"><head>${BUILT_HEAD}</head><body><div id="app"></div></body></html>`;

describe("webUiBuildOf", () => {
  it("reads the module script and stylesheets a built page loads from /assets/, and none of its other scripts and links", () => {
    expect(webUiBuildOfHtml(BUILT_PAGE)).toEqual({
      script: "/assets/index-DfW9QbrE.js",
      assets: ["/assets/index-DfW9QbrE.js", "/assets/index-GBS-EXN2.css"]
    });
  });

  it("reads the page's own document as it reads a fetched index.html", () => {
    document.head.innerHTML = BUILT_HEAD;

    expect(webUiBuildOf(document)).toEqual(webUiBuildOfHtml(BUILT_PAGE));
  });

  it("names no build for a page that loads no module script from /assets/, as one from Vite's dev server", () => {
    expect(webUiBuildOfHtml('<html><head><script type="module" src="/src/main.ts"></script></head></html>')).toBeNull();
    expect(webUiBuildOfHtml('<html><head><link rel="stylesheet" href="/assets/index-GBS-EXN2.css"></head></html>')).toBeNull();
    expect(webUiBuildOfHtml("Not found")).toBeNull();
  });

  it("tells builds apart by every file, and names the module script's file", () => {
    const build = webUiBuildOfHtml(BUILT_PAGE)!;

    expect(sameWebUiBuild(build, webUiBuildOfHtml(BUILT_PAGE)!)).toBe(true);
    expect(sameWebUiBuild(build, webUiBuildOfHtml(BUILT_PAGE.replace("index-GBS-EXN2.css", "index-Xy12.css"))!)).toBe(false);
    expect(sameWebUiBuild(build, webUiBuildOfHtml(BUILT_PAGE.replace("</head>", '<link rel="stylesheet" href="/assets/more.css"></head>'))!)).toBe(
      false
    );
    expect(webUiBuildScriptName(build)).toBe("index-DfW9QbrE.js");
  });
});
