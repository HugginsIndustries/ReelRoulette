// A smoke check of the mockup pages: each loads at a desktop and a phone width in happy-dom, its main panels, tabs, and
// dialogs open, and no script errors occur. It checks no behavior and does no layout; the user's review on their devices
// judges how the pages look and behave. Needs the WebUI's npm install.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { Window } = await import(
  new URL("../../../../src/clients/web/ReelRoulette.WebUI/node_modules/happy-dom/lib/index.js", import.meta.url).href
);
const dir = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
const pages = [];
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// happy-dom has no Web Audio, so a stand-in lets the player's Enhanced audio, on by default, start as it does in a browser.
class StandInAudioContext {
  state = "suspended";
  destination = {};
  get currentTime() {
    return performance.now() / 1000;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createMediaElementSource() {
    return { connect: (node) => node };
  }
  createGain() {
    return { gain: { value: 1, setValueAtTime() {}, setTargetAtTime() {} }, connect: (node) => node };
  }
}

async function load(name, width, query = "") {
  const window = new Window({ width, height: 800, url: "https://mockup.test/" + name + query, settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  window.AudioContext = StandInAudioContext;
  const errors = [];
  window.addEventListener("error", (event) => errors.push(String(event.error?.stack || event.message)));
  window.console.error = (...args) => errors.push(args.join(" "));
  window.document.write(readFileSync(`${dir}/${name}.html`, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const document = window.document;
  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} is missing`);
    return el;
  };
  const page = { label: `${name}@${width}`, window, document, $, errors, seen: 0 };
  pages.push(page);
  return page;
}

// One step on a page. It fails when it throws, returns false, or a script error occurs while it runs.
async function step(page, label, run) {
  let ok = false;
  let problem = "";
  try {
    ok = (await run()) !== false;
  } catch (error) {
    problem = error.message;
  }
  await tick();
  const errors = page.errors.slice(page.seen);
  page.seen = page.errors.length;
  if (errors.length) ok = false;
  if (!ok) failures++;
  // happy-dom reports a listener's error both as an error event and on the console, so each shows once, with where it
  // was thrown when a copy has its stack.
  const brief = new Map();
  for (const error of errors) {
    const [first, frame] = error.split("\n").map((line) => line.trim());
    if (frame || !brief.has(first)) brief.set(first, frame ? `${first} ${frame}` : first);
  }
  const detail = [problem, ...brief.values()].filter(Boolean).join("; ");
  console.log(`${ok ? "PASS" : "FAIL"} ${page.label}: ${label}${detail ? ` (${detail})` : ""}`);
}

const shown = (el) => !el.hidden;
const named = (id) => id[0].toUpperCase() + id.slice(1);
const topDialog = (document) => [...document.querySelectorAll("dialog.app-dialog")].at(-1);
const press = (root, label) => {
  const button = [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  if (!button) throw new Error(`no ${label} button`);
  button.click();
};
// A tap or click as a browser sends it: the pointerup starts Enhanced audio, as it does on the page.
const tap = (window, el) => {
  for (const type of ["pointerdown", "pointerup"]) el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerType: "mouse", button: 0 }));
  el.click();
};
// Shows a dialog from a control, then closes it with Cancel.
async function dialogOpensAndCancels(document, open) {
  open();
  await tick();
  const dialog = topDialog(document);
  if (!dialog) return false;
  press(dialog, "Cancel");
  return !topDialog(document);
}

async function bellOpensAndCloses(page) {
  const { $ } = page;
  await step(page, "the bell's list opens and closes", () => {
    $("notify-btn").click();
    const opened = shown($("notify-list"));
    $("notify-btn").click();
    return opened && $("notify-list").hidden;
  });
}

async function plainPage(name, width) {
  const page = await load(name, width);
  await step(page, "loads", () => true);
}

async function layout(width) {
  // "?instant" skips the mockup's waits, so the library loads at once.
  const page = await load("layout", width, "?instant");
  const { window, document, $ } = page;
  const openTab = (tab) => {
    if ($("panel").hidden) $("panel-btn").click();
    $(`tab-btn-${tab}`).click();
  };
  await step(page, "loads", () => true);
  await step(page, "the side panel opens", () => {
    $("panel-btn").click();
    return shown($("panel"));
  });
  for (const tab of ["library", "filter", "tags", "stats", "settings"]) {
    await step(page, `the ${named(tab)} tab shows`, () => {
      openTab(tab);
      return shown($(`tab-${tab}`));
    });
  }
  for (const section of ["general", "tags", "presets"]) {
    await step(page, `the Filter tab's ${named(section)} section shows`, () => {
      openTab("filter");
      document.querySelector(`#tab-filter .filter-tab[data-sub="${section}"]`).click();
      return shown(document.querySelector(`#filter-body [data-subpanel="${section}"]`));
    });
  }
  await step(page, "Auto Tag opens from the Tags tab and closes", () => {
    openTab("tags");
    $("open-autotag").click();
    const opened = shown($("autotag"));
    $("autotag-close").click();
    return opened && $("autotag").hidden;
  });
  await step(page, "Add category's dialog opens and Cancel closes it", () => {
    openTab("tags");
    return dialogOpensAndCancels(document, () => $("tags-add-category").click());
  });
  // A library tile plays its item, Play/Pause pauses it, and Next picks another.
  const playing = () => $("np-name").textContent.trim() !== "" && shown($("np-name").parentElement);
  const playIcon = () => $("play-btn").querySelector(".material-symbol-icon").dataset.icon;
  await step(page, "a library tile plays its video", async () => {
    openTab("library");
    const tile = [...$("lib-grid").querySelectorAll(".lib-tile")].find((el) => el.title.endsWith(".mp4"));
    if (!tile) throw new Error("no .mp4 tile");
    tap(window, tile);
    await tick();
    return playing() && $("np-name").textContent === tile.title && playIcon() === "pause";
  });
  await step(page, "Play/Pause pauses it", () => {
    tap(window, $("play-btn"));
    return playIcon() === "play_arrow";
  });
  await step(page, "Next plays another item", async () => {
    tap(window, $("next-btn"));
    await tick();
    return playing();
  });
  await step(page, "the side panel closes", () => {
    if (!$("panel").hidden) $("panel-close").click();
    return $("panel").hidden;
  });
  await bellOpensAndCloses(page);
  await step(page, "the Mockup tab opens and closes", () => {
    $("mock-toggle").click();
    const opened = shown($("mock-sheet"));
    $("mock-close").click();
    return opened && $("mock-sheet").hidden;
  });
}

// From another machine, the control token gate shows first, and the token opens the page.
async function tokenGate(page, view, submit) {
  const { window, $ } = page;
  await step(page, "the control token gate shows from another machine, and the token opens it", () => {
    $("mock-remote").click();
    const gated = shown($("gate")) && $(view).hidden;
    const token = $("gate-token");
    token.value = "secret";
    token.dispatchEvent(new window.Event("input"));
    $(submit).dispatchEvent(new window.Event("submit", { cancelable: true }));
    return gated && $("gate").hidden && shown($(view));
  });
}

async function admin(width) {
  const page = await load("admin", width);
  const { document, $ } = page;
  await step(page, "loads", () => true);
  await bellOpensAndCloses(page);
  await step(page, "duplicate review opens from Scan and goes back", () => {
    $("dup-scan").click();
    const opened = shown($("review")) && $("admin").hidden;
    $("review-back").click();
    return opened && $("review").hidden && shown($("admin"));
  });
  await step(page, "Clear all stats asks first, and Cancel closes it", () => dialogOpensAndCancels(document, () => $("clear-all-stats").click()));
  await tokenGate(page, "admin", "gate-form");
}

async function recovery(width) {
  const page = await load("recovery", width);
  const { document, $ } = page;
  await step(page, "loads", () => true);
  await tokenGate(page, "recovery", "gate");
  await step(page, "Download asks first, and Cancel closes it", () => {
    $("update-check").click();
    return dialogOpensAndCancels(document, () => $("update-download").click());
  });
}

for (const width of [1280, 390]) {
  await plainPage("index", width);
  await plainPage("validation", width);
  await layout(width);
  await admin(width);
  await recovery(width);
}

// A script error from a timer that fires after a page's last step.
await new Promise((resolve) => setTimeout(resolve, 100));
for (const page of pages) await step(page, "no script errors after its steps", () => true);

console.log(failures ? `${failures} failed` : "all passed");
for (const page of pages) await page.window.happyDOM.abort();
process.exit(failures ? 1 : 0);
