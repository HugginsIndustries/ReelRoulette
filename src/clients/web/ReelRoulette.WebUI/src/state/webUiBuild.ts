/**
 * A WebUI build, as its `index.html` names it: the `/assets/` addresses of its module script and stylesheets. Vite
 * names both by their content, so a page whose files differ from those a fresh `index.html` names runs another build.
 */
export interface WebUiBuild {
  /** The module script's address, such as "/assets/index-DfW9QbrE.js". */
  readonly script: string;
  /** The module script's and stylesheets' addresses, sorted. Two builds with the same addresses are the same build. */
  readonly assets: readonly string[];
}

const ASSETS_PREFIX = "/assets/";

function assetAddresses(page: ParentNode, selector: string, attribute: string): string[] {
  return Array.from(page.querySelectorAll(selector), (element) => element.getAttribute(attribute) ?? "").filter((address) =>
    address.startsWith(ASSETS_PREFIX)
  );
}

/**
 * The build a page names, or null when it loads no module script from `/assets/`, as a page from Vite's dev server,
 * which loads the source, doesn't.
 */
export function webUiBuildOf(page: ParentNode): WebUiBuild | null {
  const scripts = assetAddresses(page, 'script[type="module"][src]', "src");
  const script = scripts[0];
  if (script === undefined) {
    return null;
  }
  const stylesheets = assetAddresses(page, 'link[rel~="stylesheet"][href]', "href");
  return { script, assets: [...scripts, ...stylesheets].sort() };
}

/** The build an `index.html` names, read as `webUiBuildOf` reads a page's own. */
export function webUiBuildOfHtml(html: string): WebUiBuild | null {
  return webUiBuildOf(new DOMParser().parseFromString(html, "text/html"));
}

export function sameWebUiBuild(a: WebUiBuild, b: WebUiBuild): boolean {
  return a.assets.length === b.assets.length && a.assets.every((address, index) => address === b.assets[index]);
}

/** The file name of a build's module script, such as "index-DfW9QbrE.js", which a log line names. */
export function webUiBuildScriptName(build: WebUiBuild): string {
  return build.script.slice(build.script.lastIndexOf("/") + 1);
}
