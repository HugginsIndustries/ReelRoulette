// Loads each mockup page in happy-dom, runs its script, and drives the main interactions to catch runtime errors.
// It does no layout, so it cannot check how the pages look or pointer dragging. Needs the WebUI's npm install.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { Window } = await import(
  new URL("../../../../src/clients/web/ReelRoulette.WebUI/node_modules/happy-dom/lib/index.js", import.meta.url).href
);
const dir = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
const windows = [];

async function load(name, width, query = "", setup = null) {
  console.log(`  loading ${name}@${width}`);
  const window = new Window({ width, height: 800, url: "https://mockup.test/" + name + query, settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  if (setup) setup(window);
  const errors = [];
  window.addEventListener("error", (event) => errors.push(String(event.error?.stack || event.message)));
  window.console.error = (...args) => errors.push(args.join(" "));
  window.document.write(readFileSync(`${dir}/${name}.html`, "utf8"));
  windows.push(window);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { window, document: window.document, errors };
}

function check(label, ok) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

// A stand-in for Web Audio, which happy-dom lacks: it records each gain node and its changes, and the media elements'
// plays and pauses. A direct set of a gain's value is a jump, and a jump in level is a click.
function standInAudio() {
  const gains = [];
  const playedBy = [];
  class StandInAudioContext {
    constructor() {
      this.state = "suspended";
      this.destination = {};
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createMediaElementSource() {
      return { connect: (node) => node };
    }
    get currentTime() {
      return performance.now() / 1000;
    }
    createGain() {
      // Records each change: a direct set of its value is a jump, and a jump in level is a click.
      const param = {
        level: 1,
        directSets: 0,
        calls: [],
        get value() {
          return this.level;
        },
        set value(level) {
          this.directSets += 1;
          this.level = level;
        },
        setValueAtTime(level) {
          this.calls.push(["set", level]);
          this.level = level;
        },
        setTargetAtTime(level, start, timeConstant) {
          this.calls.push(["glide", level, timeConstant]);
          this.level = level;
        }
      };
      const node = { gain: param, connect: (next) => next };
      gains.push(node);
      return node;
    }
  }
  // The stand-in sound's element: plays and pauses are recorded, and paused follows them.
  const mediaCalls = [];
  const setup = (w) => {
    w.AudioContext = StandInAudioContext;
    const proto = w.HTMLMediaElement.prototype;
    Object.defineProperty(proto, "paused", { configurable: true, get() { return this.standInPaused !== false; } });
    proto.play = function () {
      this.standInPaused = false;
      mediaCalls.push("play");
      playedBy.push(this);
      return Promise.resolve();
    };
    proto.pause = function () {
      this.standInPaused = true;
      mediaCalls.push("pause");
    };
  };
  return { setup, gains, mediaCalls, playedBy };
}

// "WebUI" is an internal name: what the app shows says "ReelRoulette". Mockup notes and controls, and log lines and
// events, which keep the internal source name, are left out.
function internalNames(document) {
  const copy = document.documentElement.cloneNode(true);
  copy.querySelectorAll('script, style, [class*="mock-"], [id^="mock-"], #log-rows, #log-svc, #log-chips, #tail, #events').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll("[title], [aria-label], [placeholder], [alt]")]
    .flatMap((el) => ["title", "aria-label", "placeholder", "alt"].map((name) => el.getAttribute(name) || ""));
  return [copy.querySelector("body").textContent, ...attributes].join("\n").match(/\bWeb ?UIs?\b[^\n]{0,40}/gi) || [];
}

const logoIcon = "data:image/svg+xml;base64," + readFileSync(new URL("../../../../assets/logo/logo-icon.svg", import.meta.url)).toString("base64");
for (const name of ["index", "validation", "recovery", "desktop-notice", "layout", "admin"]) {
  const { document, errors } = await load(name, 1280);
  check(`${name}: no script errors ${errors.join("; ")}`, errors.length === 0);
  check(`${name}: the page icon is logo-icon.svg`, document.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute("href") === logoIcon);
  if (name === "recovery") check("recovery: the title shows the icon", document.querySelector("h1 img")?.getAttribute("src") === logoIcon && document.querySelector("h1").textContent === "ReelRoulette Recovery");
  if (name === "desktop-notice") check("desktop-notice: the notice shows the icon", document.querySelector("#notice .notice-head img")?.getAttribute("src") === logoIcon);
  if (!["index", "validation"].includes(name)) {
    const found = internalNames(document);
    check(`${name}: what the app shows says ReelRoulette, never WebUI (${found.join(" | ")})`, found.length === 0);
  }
}

{
  const { document, errors, window } = await load("validation", 1280);
  const pinned = [...document.querySelectorAll("input[data-check]")];
  const states = pinned.map((input) => `${input.value || "''"}:${input.getAttribute("aria-invalid") || "-"}`);
  check(`validation: aria-invalid per specimen ${states.join(" ")}`,
    states.join(" ") === "'':- 1:7x:true 1:30:- '':- '':true favorites:true Beach:- '':true '':true places:true");
  const typed = pinned[0];
  typed.value = "12:x";
  typed.dispatchEvent(new window.Event("input"));
  const tip = document.getElementById(typed.getAttribute("aria-describedby") || "none");
  check("validation: typing a bad duration flags it and describes it", typed.getAttribute("aria-invalid") === "true" && tip?.textContent === "Use MM:SS, HH:MM:SS, or seconds.");
  typed.value = "12:07";
  typed.dispatchEvent(new window.Event("input"));
  check("validation: correcting it clears aria-invalid and the description", !typed.hasAttribute("aria-invalid") && !typed.hasAttribute("aria-describedby"));
  const [jumpApply, other] = document.querySelectorAll("[data-apply]");
  check("validation: one Apply, aria-disabled with the icon", !other && jumpApply.getAttribute("aria-disabled") === "true" && jumpApply.classList.contains("shows-problem") && !jumpApply.disabled);
  const mini = document.querySelector('[data-mini="jump"]');
  mini.querySelector('[data-sub="tags"]').click();
  jumpApply.click();
  check("validation: Apply switches to General and focuses the field, applying nothing",
    mini.querySelector('[data-sub="general"]').classList.contains("is-active") && document.activeElement === mini.querySelector("[data-min]") && !jumpApply.textContent.includes("Applied"));
  check(`validation: no script errors after interaction ${errors.join("; ")}`, errors.length === 0);
}

for (const width of [1280, 390]) {
  // "?instant" skips the mockup's waits: random picks, loading, and Auto Tag's scan finish at once.
  const standIn = standInAudio();
  const { document, errors, window } = await load("layout", width, "?instant", standIn.setup);
  const $ = (id) => document.getElementById(id);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
  };
  const change = (el, value) => {
    if (typeof value === "boolean") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  const press = (k, target = document.body, extra = {}) =>
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
  const nativeCalls = [];
  for (const name of ["confirm", "prompt", "alert"]) window[name] = () => nativeCalls.push(name);
  const openDialogs = () => [...document.querySelectorAll("dialog.app-dialog")];
  const topDialog = () => openDialogs().at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  const pressEscape = (dialog) => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
  const notice = () => topDialog()?.querySelector(".dialog-message")?.textContent || "";
  const dismissNotices = () => {
    for (const dialog of openDialogs().reverse()) button(dialog, "OK")?.click();
  };
  const items = window.mockup.items;
  const queue = window.mockup.queue;
  const np = () => $("np-name").textContent;
  const chip = () => $("play-chip").textContent;
  const status = () => $("status").textContent;
  const situation = (value) => document.querySelector(`input[name="mock-situation"][value="${value}"]`).click();
  const tiles = () => [...$("lib-grid").querySelectorAll(".lib-tile")];
  const gridText = () => $("lib-grid").textContent;
  const openTab = (tab) => {
    if ($("panel").hidden) $("panel-btn").click();
    $(`tab-btn-${tab}`).click();
  };
  const closePanel = () => {
    if (!$("panel").hidden) $("panel-close").click();
  };
  const playable = (item) => !item.missing && !item.removed && (item.type === "photo" || /\.(mp4|mkv)$/.test(item.name));

  check(`layout@${width}: no script errors on load ${errors.join("; ")}`, errors.length === 0);
  // Nothing plays until a tap or Play.
  check(`layout@${width}: nothing plays at first, and the player shows the start hint`,
    !$("empty-state").hidden && $("empty-state").textContent === "Tap to play, or open the panel to choose a preset or filter." && $("panel").hidden && $("np-name").parentElement.hidden && chip().includes("Nothing playing"));
  check(`layout@${width}: the status line says Ready (API 1) (${status()})`, status() === "Ready (API 1)");
  const corner = [...document.querySelectorAll(".overlay-corner-btn")].map((b) => b.id).join(",");
  check(`layout@${width}: the player's corner buttons are ${corner}`, corner === "panel-btn,favorite-btn,blacklist-btn");
  check(`layout@${width}: the header has no settings icon`, !$("header-settings") && !!$("header-admin"));
  // The header shows the lockup for the theme, or the icon alone on a phone, in place of the "ReelRoulette" text.
  // happy-dom keeps an element's computed style after a class changes on <html>, so each is measured on a fresh copy.
  const shownNow = (el) => {
    const copy = el.cloneNode(true);
    el.after(copy);
    const shown = window.getComputedStyle(copy).display !== "none";
    copy.remove();
    return shown;
  };
  const brand = document.querySelector(".top-bar .brand");
  const brandShown = () => [...brand.querySelectorAll("img")].filter(shownNow).map((img) => img.className).join(",");
  const lockupFor = (theme) => (width <= 600 ? "brand-icon" : theme === "light" ? "brand-on-light" : "brand-on-dark");
  const themeNow = () => (document.documentElement.classList.contains("theme-light") ? "light" : "dark");
  check(`layout@${width}: the header shows the ${themeNow()} theme's logo (${brandShown()}), named ReelRoulette, with no text`,
    brandShown() === lockupFor(themeNow()) && brand.textContent.trim() === "" && [...brand.querySelectorAll("img")].every((img) => img.alt === "ReelRoulette" && img.src.startsWith("data:image/svg+xml")));
  const otherTheme = themeNow() === "light" ? "dark" : "light";
  document.querySelector(`input[name="set-theme"][value="${otherTheme}"]`).click();
  check(`layout@${width}: and the ${otherTheme} theme's (${brandShown()})`, brandShown() === lockupFor(otherTheme));
  document.querySelector('input[name="set-theme"][value="system"]').click();
  press("4");
  check(`layout@${width}: with nothing playing, Stats says so`, !$("tab-stats").hidden && $("stats-body").textContent.includes("Nothing is playing yet."));
  press("3");
  check(`layout@${width}: and the Tags tab's chips can't add or remove`,
    [...document.querySelectorAll('#tags-body [title="Add tag"], #tags-body [title="Remove tag"]')].every((b) => b.disabled) && $("tags-target").hidden);
  press("1");
  check(`layout@${width}: the library loads its tiles`, tiles().length > 20 && $("lib-summary").textContent.startsWith("Showing"));
  press("1");
  check(`layout@${width}: the open tab's key closes the panel`, $("panel").hidden);

  // A tap starts a random pick; Next picks at random at the end of the history, and both skip what can't play.
  queue.push(0);
  $("media").click();
  await tick();
  check(`layout@${width}: a tap starts a random pick (${np()}, ${status()})`, np() === items[0].name && chip().includes("Playing") && $("empty-state").hidden && status() === "Playing");
  queue.push(2);
  $("next-btn").click();
  check(`layout@${width}: Next at the end of the history picks at random (a photo, scrub bar disabled)`, np() === items[2].name && $("seek").disabled);
  queue.push(4, 3);
  $("next-btn").click();
  check(`layout@${width}: a random pick skips a file this browser can't play, saying so (${status()})`,
    np() === items[3].name && status() === "Skipped a file this browser can't play." && openDialogs().length === 0);
  $("prev-btn").click();
  check(`layout@${width}: Previous steps back through the history`, np() === items[2].name);
  $("prev-btn").click();
  $("prev-btn").click();
  check(`layout@${width}: and does nothing at its start`, np() === items[0].name && window.mockup.history().index === 0);
  $("next-btn").click();
  check(`layout@${width}: Next steps forward through the history before picking`, np() === items[2].name && window.mockup.history().index === 1);
  const missing = items.find((item) => item.missing);
  window.mockup.choose(missing.id);
  check(`layout@${width}: choosing a missing file says so and changes nothing (${notice()})`, notice() === "Media not found. The file may have moved or been deleted." && np() === items[2].name);
  dismissNotices();
  queue.push(missing.id, 0);
  press("r");
  check(`layout@${width}: R picks at random and skips a missing file, saying so (${status()})`, status() === "Skipped a missing file." && np() === items[0].name);
  window.mockup.choose(4);
  check(`layout@${width}: an .avi chosen from the library shows the format notice`, notice().includes("format (.avi) isn't supported in this browser") && chip().includes("Can't play"));
  dismissNotices();
  // Swipes on the media area: left plays the next item, and the click that follows a swipe is ignored.
  const touch = (type, x) => $("media").dispatchEvent(Object.assign(new window.Event(type, { bubbles: true }), { touches: [{ clientX: x, clientY: 200 }], changedTouches: [{ clientX: x, clientY: 200 }] }));
  const controlsBefore = $("media").classList.contains("controls-visible");
  queue.push(3);
  touch("touchstart", 400);
  touch("touchend", 250);
  $("media").click();
  check(`layout@${width}: a swipe left plays the next item and swallows its click`, np() === items[3].name && $("media").classList.contains("controls-visible") === controlsBefore);
  // Favorite and Blacklist clear each other.
  $("favorite-btn").click();
  $("blacklist-btn").click();
  check(`layout@${width}: Blacklist clears Favorite`, $("blacklist-btn").classList.contains("active") && !$("favorite-btn").classList.contains("active"));
  $("favorite-btn").click();
  check(`layout@${width}: Favorite clears Blacklist`, $("favorite-btn").classList.contains("active") && !$("blacklist-btn").classList.contains("active"));
  $("favorite-btn").click();

  // The server's situations.
  situation("reconnecting");
  check(`layout@${width}: reconnecting shows on the status line (${status()})`, status() === "SSE reconnecting..." && $("conn-indicator").hidden);
  press("r");
  check(`layout@${width}: a random pick then fails with a notice (${notice()})`, notice() === "Random selection failed: Failed to fetch");
  dismissNotices();
  $("favorite-btn").click();
  check(`layout@${width}: and so does Favorite (${notice()})`, notice() === "Favorite update failed (503)." && !$("favorite-btn").classList.contains("active"));
  dismissNotices();
  $("set-status").click();
  check(`layout@${width}: with the status line hidden, the player shows the reconnecting indicator`, $("status").hidden && !$("conn-indicator").hidden);
  $("set-status").click();
  situation("connected");
  check(`layout@${width}: reconnecting says SSE connected (${status()})`, status() === "SSE connected" && $("conn-indicator").hidden);
  situation("noanswer");
  press("r");
  check(`layout@${width}: a server that doesn't answer gives up with a notice (${notice()})`, notice() === "No response from the server. Try again.");
  dismissNotices();
  situation("nolibrary");
  openTab("library");
  check(`layout@${width}: without a library the grid shows the server's message (${gridText().slice(0, 40)})`,
    gridText().startsWith("Running without a library.") && !!$("lib-grid").querySelector(".lib-empty.is-error") && $("lib-preset").disabled && $("lib-preset").textContent === "Error loading presets");
  press("r");
  check(`layout@${width}: and random picks fail with a notice (${notice()})`, notice() === "Random selection failed (503).");
  dismissNotices();
  situation("incompatible");
  check(`layout@${width}: a failed compatibility check opens the panel and shows its message in the Library tab (${gridText()})`,
    !$("panel").hidden && gridText() === "Unsupported server API version: 2." && status() === "Unsupported server API version: 2.");
  press("r");
  check(`layout@${width}: and Play shows its notice (${notice()})`, notice() === "Cannot play: server compatibility check failed.");
  dismissNotices();
  situation("empty");
  check(`layout@${width}: an empty library says No media in library.`, gridText() === "No media in library.");
  openTab("filter");
  document.querySelector('[data-sub="tags"]').click();
  check(`layout@${width}: the Filter tab names the Tags tab when there are no tags`, $("filter-tag-categories").textContent === "No tags yet. Add them in the Tags tab.");
  document.querySelector('[data-sub="presets"]').click();
  check(`layout@${width}: and says No presets, and no sources`, $("filter-preset-list").textContent === "No presets" && !$("no-sources").hidden);
  document.querySelector('[data-sub="general"]').click();
  press("r");
  check(`layout@${width}: with nothing to pick, a notice says so (${notice()})`, notice() === "No eligible media for current filters.");
  dismissNotices();
  situation("connected");
  press("1");
  closePanel();

  // The Auto-Pause checks below need a video playing.
  window.mockup.choose(3);
  $("panel-btn").click();
  const overlay = $("stage").classList.contains("is-overlay");
  check(`layout@${width}: the panel button opens the panel on its last tab (Library) as ${overlay ? "overlay" : "side panel"}`,
    !$("panel").hidden && !$("tab-library").hidden && overlay === (width < 800) && $("panel-btn").getAttribute("aria-expanded") === "true");
  check(`layout@${width}: open state remembered`, window.localStorage.getItem("rr-mockup.open") === "true");
  check(`layout@${width}: Responsive Auto-Pause ${overlay ? "pauses" : "keeps playing"} (${chip()})`, chip().includes(overlay ? "Auto-Paused" : "Playing"));
  $("tab-btn-filter").click();
  const min = $("filter-min");
  input(min, "1:7x");
  const apply = $("filter-apply");
  const applyKids = [...apply.children].map((c) => c.className.split(" ")[0]).join(",");
  check(`layout@${width}: strict parser flags 1:7x; Apply held with its icon after the label (${applyKids})`,
    min.getAttribute("aria-invalid") === "true" && apply.getAttribute("aria-disabled") === "true" && applyKids === "btn-label,btn-problem");
  check(`layout@${width}: the tooltip sits inside the field`, min.closest(".vfield").contains(document.getElementById(min.getAttribute("aria-describedby"))));
  document.querySelector('[data-sub="presets"]').click();
  const statusBeforeApply = status();
  apply.click();
  check(`layout@${width}: held Apply goes to the field, keeps the panel open, and writes no status`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === min && !$("panel").hidden && status() === statusBeforeApply);
  input(min, "1:30");
  document.querySelector('[data-sub="presets"]').click();
  const presetNames = () => [...document.querySelectorAll(".filter-preset-row")].map((r) => r.dataset.key).join(",");
  const rowButtons = [...document.querySelector(".filter-preset-row").querySelectorAll("button")].map((b) => b.title).join(",");
  check(`layout@${width}: preset rows have a handle and Edit only (${rowButtons})`, rowButtons === "Drag to reorder,Edit preset");
  check(`layout@${width}: the mockup has many presets (${document.querySelectorAll(".filter-preset-row").length})`, document.querySelectorAll(".filter-preset-row").length >= 12);
  key(document.querySelector(".filter-preset-row .drag-handle"), "ArrowDown");
  check(`layout@${width}: ArrowDown on a preset's handle moves it and keeps focus on it`,
    presetNames().startsWith("Short clips,Favorites,Photos only,Long videos,") && document.activeElement?.closest(".filter-preset-row")?.dataset.key === "Favorites" && $("filter-apply-label").textContent === "Apply*");
  document.querySelector('.filter-preset-row[data-key="Long videos"] [title="Edit preset"]').click();
  const presetDialog = topDialog();
  const presetName = presetDialog?.querySelector("input");
  input(presetName, "favorites");
  check(`layout@${width}: Edit Preset flags a taken name and holds Save`,
    presetName.getAttribute("aria-invalid") === "true" && button(presetDialog, "Save").getAttribute("aria-disabled") === "true");
  button(presetDialog, "Delete").click();
  check(`layout@${width}: Delete opens a confirmation stacked above the edit dialog`,
    openDialogs().length === 2 && topDialog().textContent.includes('Delete preset "Long videos"?') && topDialog().getAttribute("role") === "alertdialog");
  check(`layout@${width}: the confirmation opens with Cancel focused (${document.activeElement?.textContent.trim()})`,
    document.activeElement?.textContent.trim() === "Cancel" && button(topDialog(), "Delete").classList.contains("btn-danger"));
  pressEscape(topDialog());
  check(`layout@${width}: Escape closes only the confirmation`, openDialogs().length === 1 && presetNames().includes("Long videos"));
  button(presetDialog, "Delete").click();
  button(topDialog(), "Delete").click();
  await tick();
  check(`layout@${width}: confirming deletes the preset and closes both dialogs`, openDialogs().length === 0 && !presetNames().includes("Long videos"));
  const dot = (id) => !$(id).querySelector(".unsaved-dot").hidden;
  check(`layout@${width}: unsaved Filter changes mark the Filter tab and the panel button`,
    dot("tab-btn-filter") && dot("panel-btn") && !dot("tab-btn-tags") && $("tab-btn-filter").getAttribute("aria-label") === "Filter, unsaved changes" && $("panel-btn").getAttribute("aria-label").endsWith(", unsaved changes"));
  apply.click();
  check(`layout@${width}: Apply clears the dots`, !dot("tab-btn-filter") && !dot("panel-btn"));
  check(`layout@${width}: valid Apply applies${overlay ? " and closes the overlay" : " and stays open"}`,
    status() === "Filters applied." && $("panel").hidden === overlay);
  check(`layout@${width}: closing resumes playback`, overlay ? chip().includes("Playing") : true);
  if ($("panel").hidden) $("panel-btn").click();
  check(`layout@${width}: reopening comes back on the last tab (Filter)`, !$("tab-filter").hidden);

  // Favorites and Blacklisted each choose only or excluded.
  document.querySelector('[data-sub="general"]').click();
  $("filter-clear").click();
  check(`layout@${width}: Favorites starts off, its dropdown disabled; Blacklisted starts on, excluded`,
    !$("filter-fav").checked && $("filter-fav-mode").disabled && $("filter-bl").checked && $("filter-bl-mode").value === "excluded" && !$("filter-bl-mode").disabled);
  const applyFilter = async (fav, favMode, bl, blMode) => {
    openTab("filter");
    document.querySelector('[data-sub="general"]').click();
    change($("filter-fav"), fav);
    change($("filter-fav-mode"), favMode);
    change($("filter-bl"), bl);
    change($("filter-bl-mode"), blMode);
    $("filter-apply").click();
    await tick();
    openTab("library");
  };
  const badged = (icon) => tiles().filter((tile) => tile.querySelector(`.lib-tile-badge [data-icon="${icon}"]`)).length;
  await applyFilter(true, "excluded", true, "excluded");
  check(`layout@${width}: Favorites excluded leaves out every favorite (${$("lib-filters").textContent})`,
    tiles().length > 0 && badged("favorite") === 0 && $("lib-filters").textContent === "Filters: Favorites excluded");
  await applyFilter(true, "only", true, "excluded");
  check(`layout@${width}: Favorites only shows only favorites (${tiles().length})`, tiles().length > 0 && badged("favorite") === tiles().length);
  await applyFilter(false, "only", true, "only");
  check(`layout@${width}: Blacklisted only shows only blacklisted items, badged (${tiles().length})`,
    tiles().length > 0 && badged("thumb_down") === tiles().length && $("lib-filters").textContent === "Filters: Blacklisted only");
  press("r");
  check(`layout@${width}: random picks follow it`, $("blacklist-btn").classList.contains("active"));
  dismissNotices();
  await applyFilter(false, "only", true, "excluded");
  check(`layout@${width}: the default leaves out blacklisted items and shows no Filters line`, badged("thumb_down") === 0 && $("lib-filters").hidden);
  await applyFilter(false, "only", false, "excluded");
  check(`layout@${width}: Blacklisted off includes them (${badged("thumb_down")} badged)`, badged("thumb_down") > 0);
  await applyFilter(false, "excluded", true, "excluded");
  check(`layout@${width}: once applied, an unchecked filter's dropdown shows its default`,
    $("filter-fav-mode").value === "only" && $("filter-fav-mode").disabled);
  await applyFilter(false, "only", true, "excluded");

  // Choosing a preset applies its filter, and a change to that filter stars it.
  const choosePreset = (value) => change($("lib-preset"), value);
  choosePreset("Photos only");
  await tick();
  check(`layout@${width}: choosing a preset in the Library tab applies its filter (${tiles().length} tiles)`,
    tiles().length > 0 && tiles().every((t) => t.getAttribute("aria-label").endsWith(".jpg")) && $("lib-filters").textContent === "Filters: Photos only" && document.querySelectorAll('input[name="media"]')[2].checked);
  await applyFilter(true, "only", true, "excluded");
  check(`layout@${width}: changing its filter stars it (${$("lib-preset").selectedOptions[0]?.textContent}, ${$("filter-heading").textContent})`,
    $("lib-preset").value === "*" && $("lib-preset").selectedOptions[0].textContent === "Photos only*" && $("filter-heading").textContent === "Preset: Photos only*");
  choosePreset("");
  await tick();
  check(`layout@${width}: None goes back to the default filter`, $("lib-filters").hidden && !$("filter-fav").checked);
  openTab("filter");
  document.querySelector('[data-sub="presets"]').click();
  change($("filter-preset-select"), "Favorites");
  document.querySelector('[data-sub="general"]').click();
  check(`layout@${width}: choosing a preset in the Filter tab loads its filter into the tab`, $("filter-fav").checked && $("filter-fav-mode").value === "only" && $("filter-heading").textContent === "Preset: Favorites");
  $("filter-cancel").click();
  check(`layout@${width}: and Cancel puts the applied filter back`, !$("filter-fav").checked);
  // While the server is unreachable, a browse keeps the tiles already loaded and Apply can't save the presets.
  situation("reconnecting");
  openTab("library");
  const tileCount = tiles().length;
  input($("lib-search"), "beach");
  check(`layout@${width}: a browse while reconnecting keeps the loaded tiles (${status()})`, status() === "Library browse failed. Showing the tiles already loaded." && tiles().length === tileCount);
  input($("lib-search"), "");
  openTab("filter");
  $("filter-apply").click();
  check(`layout@${width}: Apply while reconnecting says it couldn't save the presets (${notice()})`, notice() === "Saving presets failed: Failed to fetch");
  dismissNotices();
  $("filter-cancel").click();
  situation("connected");
  openTab("library");

  // Tiles: the playing tile's icon in the middle, filled badges without a dark rectangle, and names only by setting.
  const tileToPlay = tiles().find((tile) => tile.getAttribute("aria-label").endsWith(".mp4"));
  const playingId = Number(tileToPlay.dataset.id);
  tileToPlay.click();
  openTab("library");
  const shown = (el) => !!el && window.getComputedStyle(el).display !== "none";
  const playingMarks = tiles().filter((tile) => shown(tile.querySelector(".playing-mark")));
  check(`layout@${width}: only the playing tile shows the playing icon (${playingMarks.length})`,
    playingMarks.length === 1 && Number(playingMarks[0].dataset.id) === playingId && playingMarks[0].querySelector(".playing-mark .material-symbol-icon").classList.contains("is-filled"));
  check(`layout@${width}: the mockup has no playing marker option`, !document.querySelector('input[name="mock-marker"]'));
  const badge = $("lib-grid").querySelector(".lib-tile-badge");
  const badgeIcon = badge.querySelector(".material-symbol-icon");
  check(`layout@${width}: tile badges are filled icons with a drop shadow and no dark rectangle (${window.getComputedStyle(badge).backgroundColor || "none"})`,
    badgeIcon.classList.contains("is-filled") && /drop-shadow/.test(window.getComputedStyle(badgeIcon).filter) && !/rgba\(0, 0, 0, 0\.6\)/.test(window.getComputedStyle(badge).backgroundColor));
  const firstTile = tiles()[0];
  check(`layout@${width}: file names are hidden on tiles by default, and a tile's tooltip is its name`,
    !shown(firstTile.querySelector(".lib-tile-name")) && firstTile.title === items[Number(firstTile.dataset.id)].name && !$("set-tile-names").checked);
  change($("set-tile-names"), true);
  check(`layout@${width}: Show file names on tiles shows them and is remembered`,
    shown(tiles()[0].querySelector(".lib-tile-name")) && window.localStorage.getItem("rr-mockup.tileNames") === "true" && tiles()[0].title !== "");
  change($("set-tile-names"), false);
  openTab("library");

  // Tags.
  openTab("tags");
  const chipButtons = [...document.querySelector("#tags-body .tag-chip").querySelectorAll("button")].map((b) => b.title).join(",");
  check(`layout@${width}: chips have no delete (${chipButtons})`, chipButtons === "Add tag,Remove tag,Edit tag");
  const categoryOrder = () => [...document.querySelectorAll("#tags-body .tag-category")].map((c) => c.dataset.key).join(",");
  check(`layout@${width}: the mockup has many tag categories (${categoryOrder()})`, document.querySelectorAll("#tags-body .tag-category").length >= 10 && document.querySelectorAll("#tags-body .tag-chip").length >= 60);
  const header = document.querySelector('#tags-body [data-key="people"] .tag-category-header');
  const headerButtons = [...header.querySelectorAll("button")].map((b) => b.className.split(" ")[0]).join(",");
  check(`layout@${width}: category headers hold a handle, the name, and Edit, with no arrows (${headerButtons})`,
    headerButtons === "drag-handle,tag-category-toggle,icon-btn" && !header.querySelector('[title="Move category up"]'));
  const uncategorized = document.querySelector('#tags-body [data-key="uncategorized"] .drag-handle');
  check(`layout@${width}: Uncategorized shows a disabled handle and no Edit`,
    uncategorized?.disabled === true && !document.querySelector('#tags-body [data-key="uncategorized"] [title="Edit category"]'));
  // Categories start collapsed and remember which are open per device, separately here and in the Filter tab.
  const tagSection = (id) => document.querySelector(`#tags-body [data-key="${id}"]`);
  const filterSection = (id) => document.getElementById(`tag-grid-filter-${id}`)?.parentElement;
  const collapsedNow = (section) => section.classList.contains("is-collapsed");
  check(`layout@${width}: every category starts collapsed, in the Tags tab and the Filter tab`,
    [...document.querySelectorAll("#tags-body .tag-category, #filter-tag-categories .tag-category")].every(collapsedNow));
  header.querySelector(".tag-category-toggle").click();
  const peopleGrid = document.querySelector('#tags-body [data-key="people"] .tag-grid');
  // The Filter tab's Refresh redraws its categories, so they show what it remembers.
  $("filter-refresh").click();
  check(`layout@${width}: clicking the header's name expands the category, remembered here only`,
    !peopleGrid.hidden && header.querySelector(".tag-category-toggle").getAttribute("aria-expanded") === "true" &&
    JSON.parse(window.localStorage.getItem("rr-mockup.tagsExpanded")).includes("people") && collapsedNow(filterSection("people")));
  header.click();
  check(`layout@${width}: clicking the header itself collapses it again`, peopleGrid.hidden);
  // A collapsed header counts the item's tags in it.
  const playingItem = items.find((item) => item.name === np());
  const usedCategory = window.mockup.tags.find((category) => category.id !== "people" && category.chips.some((chip) => playingItem.tags.has(chip.key)));
  const usedCount = usedCategory.chips.filter((chip) => playingItem.tags.has(chip.key)).length;
  const usedBadge = tagSection(usedCategory.id).querySelector(".category-count");
  check(`layout@${width}: a collapsed category's header counts the item's tags in it (${usedBadge.textContent}, "${usedBadge.title}")`,
    !usedBadge.hidden && usedBadge.textContent === String(usedCount) && usedBadge.title === `${usedCount} ${usedCount === 1 ? "tag" : "tags"} on this item` &&
    tagSection(usedCategory.id).querySelector(".tag-category-toggle").getAttribute("aria-label").includes(usedBadge.title));
  const orderBefore = categoryOrder();
  key(document.querySelector('#tags-body [data-key="trips"] .drag-handle'), "ArrowDown");
  check(`layout@${width}: the last category can't move below Uncategorized`, categoryOrder() === orderBefore && categoryOrder().endsWith(",trips,uncategorized"));
  key(document.querySelector('#tags-body [data-key="events"] .drag-handle'), "ArrowUp");
  check(`layout@${width}: ArrowUp moves a category (${categoryOrder().split(",").slice(0, 3)}) and Save turns on`, categoryOrder().startsWith("people,events,places,") && !$("tags-save").disabled);
  document.querySelector('#tags-body [data-key="places"] [title="Edit category"]').click();
  const categoryDialog = topDialog();
  const categoryName = categoryDialog.querySelector("input");
  input(categoryName, "people");
  check(`layout@${width}: a taken category name is flagged and Save held`,
    categoryName.getAttribute("aria-invalid") === "true" && button(categoryDialog, "Save").getAttribute("aria-disabled") === "true");
  button(categoryDialog, "Delete").click();
  check(`layout@${width}: category Delete asks with today's wording`, topDialog().textContent.includes('Delete category "Places"? Tags will become Uncategorized.'));
  button(topDialog(), "Delete").click();
  await tick();
  check(`layout@${width}: confirming removes it, and Uncategorized, which gets its tags, opens`, !categoryOrder().includes("places") && openDialogs().length === 0 && !collapsedNow(tagSection("uncategorized")));
  document.querySelector('#tags-body [title="Edit tag"]').click();
  const tagDialog = topDialog();
  const name = tagDialog.querySelector("input");
  input(name, "");
  check(`layout@${width}: emptied tag name flagged and Save held`,
    name.getAttribute("aria-invalid") === "true" && button(tagDialog, "Save").getAttribute("aria-disabled") === "true");
  button(tagDialog, "Delete").click();
  button(topDialog(), "Delete").click();
  await tick();
  check(`layout@${width}: Delete in Edit Tag removes the chip`, ![...document.querySelectorAll("#tags-body .tag-chip-label")].some((l) => l.textContent === "Alice"));
  $("tags-add-category").click();
  check(`layout@${width}: New Category opens as an in-app dialog`, topDialog()?.querySelector("h3")?.textContent === "New Category");
  input(topDialog().querySelector("input"), "Pets");
  topDialog().querySelector('button[type="submit"]').click();
  const pets = [...document.querySelectorAll("#tags-body .tag-category")].find((section) => section.querySelector(".tag-category-name").textContent === "Pets");
  check(`layout@${width}: a new category starts collapsed, with the dot until saved`, !!pets && collapsedNow(pets) && !pets.querySelector(".unsaved-dot").hidden);
  // The Tags tab follows the playing item unless it has unsaved changes to its item's tags.
  const playOther = () => {
    const other = items.find((item) => playable(item) && item.name !== np());
    window.mockup.choose(other.id);
    dismissNotices();
    if (!$("tab-tags").hidden) return;
    openTab("tags");
  };
  const line = $("tags-target");
  const edited = np();
  document.querySelector('#tags-body .tag-chip [title="Add tag"]').click();
  playOther();
  check(`layout@${width}: with unsaved tag changes the tab stays on its item and names it ("${line.textContent}")`,
    !line.hidden && line.textContent === `Editing tags for ${edited}` && np() !== edited);
  $("panel-close").click();
  check(`layout@${width}: closing the panel keeps them, without asking, and the panel button shows the dot`,
    $("panel").hidden && openDialogs().length === 0 && dot("panel-btn") && $("panel-btn").getAttribute("aria-label") === "Open panel, unsaved changes");
  $("panel-btn").click();
  $("tab-btn-library").click();
  $("tab-btn-tags").click();
  check(`layout@${width}: reopening and switching tabs keeps them (Tags dot, Save lit, line shown)`,
    dot("tab-btn-tags") && !$("tags-save").disabled && !line.hidden);
  $("tags-save").click();
  check(`layout@${width}: after Save it follows the playing item, and the dots go (${status()})`,
    line.hidden && !dot("tab-btn-tags") && !dot("panel-btn") && status() === "Tag editor changes applied");
  playOther();
  check(`layout@${width}: with no unsaved changes it follows`, line.hidden);
  document.querySelector('#tags-body .tag-chip [title="Remove tag"]').click();
  playOther();
  $("tags-refresh").click();
  await tick();
  check(`layout@${width}: Refresh asks "Discard changes?" with Cancel focused`,
    topDialog()?.textContent.includes("Discard changes?") && document.activeElement?.textContent.trim() === "Cancel" && !line.hidden);
  button(topDialog(), "Discard").click();
  await tick();
  check(`layout@${width}: after discarding it follows and nothing is pending`, line.hidden && $("tags-save").disabled);
  // A collapsed category with unsaved changes shows the dot; a category opens when a tag is added to it or moved into it.
  const weatherChip = tagSection("weather").querySelector(".tag-chip");
  weatherChip.querySelector('[title="Add tag"]').click();
  check(`layout@${width}: a collapsed category with a pending change shows the orange dot`,
    collapsedNow(tagSection("weather")) && !tagSection("weather").querySelector(".unsaved-dot").hidden &&
    tagSection("weather").querySelector(".tag-category-toggle").getAttribute("aria-label").endsWith("unsaved changes"));
  tagSection("weather").querySelector(".tag-chip").querySelector('[title="Add tag"]').click();
  check(`layout@${width}: and loses it once nothing is pending`, tagSection("weather").querySelector(".unsaved-dot").hidden);
  change($("tags-category-select"), "mood");
  input($("tags-new-name"), "Serene");
  $("tags-add-tag").click();
  check(`layout@${width}: adding a tag opens its category`, !collapsedNow(tagSection("mood")) && JSON.parse(window.localStorage.getItem("rr-mockup.tagsExpanded")).includes("mood"));
  tagSection("camera").querySelector('[title="Edit tag"]').click();
  topDialog().querySelector("select").value = "quality";
  topDialog().querySelector('button[type="submit"]').click();
  check(`layout@${width}: moving a tag into a category opens it`, !collapsedNow(tagSection("quality")));
  $("tags-refresh").click();
  await tick();
  button(topDialog(), "Discard").click();
  await tick();
  // In the Filter tab, a collapsed category counts the filter's tags in it, and shows the dot until the change applies.
  openTab("filter");
  filterSection("people").querySelector('[title="Include"]').click();
  const filterBadge = filterSection("people").querySelector(".category-count");
  check(`layout@${width}: a collapsed Filter category counts the filter's tags in it and shows the dot while unapplied (${filterBadge.title})`,
    collapsedNow(filterSection("people")) && !filterBadge.hidden && filterBadge.textContent === "1" && filterBadge.title === "1 tag in the filter" &&
    !filterSection("people").querySelector(".unsaved-dot").hidden);
  $("filter-cancel").click();
  check(`layout@${width}: Cancel clears both`, filterSection("people").querySelector(".category-count").hidden && filterSection("people").querySelector(".unsaved-dot").hidden);
  openTab("tags");
  check(`layout@${width}: no browser dialog was used (${nativeCalls.join(",")})`, nativeCalls.length === 0);

  // Auto Tag: a scan runs with today's indeterminate bar, then lists matches; Close and Cancel wait for it.
  const autoTagText = () => $("autotag-results").querySelector(".autotag-empty")?.textContent;
  $("open-autotag").click();
  const footerButtons = [...document.querySelectorAll("#autotag .autotag-footer button")].map((b) => b.id).join(",");
  check(`layout@${width}: Auto Tag opens with its before-scan placeholder, and Cancel then Apply at the footer's end (${autoTagText()}; ${footerButtons})`,
    !$("autotag").hidden && autoTagText() === "Scan to find files whose names contain a tag's name." && $("autotag-apply").disabled && footerButtons === "autotag-cancel,autotag-apply");
  change($("autotag-full"), true);
  $("autotag-scan").click();
  check(`layout@${width}: Scan shows the indeterminate bar and disables Close and Cancel`,
    !$("autotag-progress").hidden && $("autotag-close").disabled && $("autotag-cancel").disabled && $("autotag-status").textContent === "Scanning…");
  press("Escape");
  check(`layout@${width}: Escape doesn't close it while scanning`, !$("autotag").hidden);
  await tick();
  const autoRows = $("autotag-results").querySelectorAll(".autotag-result").length;
  check(`layout@${width}: then it lists matching tags with nothing checked, as today (${autoRows} rows, ${$("autotag-status").textContent})`,
    $("autotag-progress").hidden && !$("autotag-close").disabled && autoRows > 0 && /^Scan complete: .* 0\/\d+ selected changes\.$/.test($("autotag-status").textContent) && $("autotag-apply").disabled &&
    ![...$("autotag-results").querySelectorAll(".autotag-row-main input")].some((box) => box.checked));
  $("autotag-select-all").click();
  const [chosenChanges, allChanges] = /(\d+)\/(\d+) selected changes/.exec($("autotag-status").textContent).slice(1).map(Number);
  check(`layout@${width}: Select all checks everything (${chosenChanges}/${allChanges})`, chosenChanges === allChanges && allChanges > 0 && !$("autotag-apply").disabled);
  const autoHead = $("autotag-results").querySelector(".autotag-table-head");
  const autoRow = $("autotag-results").querySelector(".autotag-row-main");
  const columns = (el) => window.getComputedStyle(el).gridTemplateColumns;
  const countCells = (el) => [...el.children].slice(3).every((cell) => cell.classList.contains("autotag-count"));
  check(`layout@${width}: the header and the rows share one column template, so each count sits under its header (${columns(autoHead)})`,
    columns(autoHead) === columns(autoRow) && !/\bauto\b/.test(columns(autoHead)) && countCells(autoHead) && countCells(autoRow) &&
    window.getComputedStyle(autoRow.children[3]).textAlign === window.getComputedStyle(autoHead.children[3]).textAlign);
  $("autotag-results").querySelector(".autotag-row-main .icon-btn").click();
  check(`layout@${width}: a row expands to its files`, $("autotag-results").querySelectorAll(".autotag-file").length > 0);
  // With View all matches, files that already have the tag show checked and can't be unchecked.
  change($("autotag-all"), true);
  const resultRows = () => [...$("autotag-results").querySelectorAll(".autotag-result")];
  const counts = (row) => [...row.querySelectorAll(".autotag-row-main .autotag-count")].map((cell) => Number(cell.textContent));
  const tagged = resultRows().find((row) => counts(row)[0] > counts(row)[1]);
  const tagNameOf = (row) => row.querySelector(".autotag-row-main").children[2].textContent;
  const taggedName = tagNameOf(tagged);
  if (!tagged.querySelector(".autotag-files")) tagged.querySelector(".autotag-row-main .icon-btn").click();
  const taggedRow = resultRows().find((row) => tagNameOf(row) === taggedName);
  const lockedBoxes = [...taggedRow.querySelectorAll(".autotag-file input")].filter((box) => box.disabled);
  check(`layout@${width}: with View all matches, files that already have the tag are checked and disabled (${lockedBoxes.length} in ${taggedName})`,
    lockedBoxes.length > 0 && lockedBoxes.every((box) => box.checked));
  change($("autotag-all"), false);
  $("autotag-apply").click();
  check(`layout@${width}: its own Apply applies the checked changes (${$("autotag-status").textContent})`,
    status() === "Tag editor changes applied" && $("autotag-apply").disabled && $("autotag-status").textContent.endsWith("0/0 selected changes."));
  $("autotag-close").click();
  check(`layout@${width}: and the X closes it`, $("autotag").hidden);
  $("open-autotag").click();
  check(`layout@${width}: reopening it after the X keeps the last scan`, $("autotag-status").textContent.startsWith("Scan complete:") && !autoTagText());
  $("autotag-cancel").click();
  check(`layout@${width}: Cancel closes it`, $("autotag").hidden);
  $("open-autotag").click();
  check(`layout@${width}: and clears the scan (${autoTagText()})`, autoTagText() === "Scan to find files whose names contain a tag's name." && $("autotag-status").textContent === "");
  situation("empty");
  $("autotag-scan").click();
  await tick();
  check(`layout@${width}: a scan that finds nothing shows its own placeholder (${autoTagText()})`, autoTagText() === "No file names contain any tag's name.");
  situation("connected");
  $("autotag-close").click();

  // A photo: Play and the scrub bar work while its timer runs (Autoplay on, Loop off), and are disabled otherwise.
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const playIcon = () => $("play-btn").querySelector(".material-symbol-icon").dataset.icon;
  closePanel();
  if ($("autoplay-btn").classList.contains("active")) $("autoplay-btn").click();
  window.mockup.choose(2);
  const seek = $("seek");
  check(`layout@${width}: with Autoplay off, a photo's Play and scrub bar are disabled and the time is blank`,
    $("play-btn").disabled && seek.disabled && $("time-display").textContent === "" && $("mute-btn").disabled);
  $("autoplay-btn").click();
  check(`layout@${width}: turning Autoplay on starts the photo's full time from then (${$("time-display").textContent})`,
    !seek.disabled && !$("play-btn").disabled && Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:05" && playIcon() === "pause");
  await sleep(600);
  check(`layout@${width}: the bar fills as the timer runs (${seek.value})`, Number(seek.value) > 0);
  $("play-btn").click();
  const heldAt = Number(seek.value);
  await sleep(500);
  check(`layout@${width}: Play pauses the timer and keeps the time left (${chip()}, ${seek.value})`, Number(seek.value) === heldAt && chip().includes("Timer paused") && playIcon() === "play_arrow");
  $("play-btn").click();
  await sleep(300);
  check(`layout@${width}: and resumes it from there (${seek.value})`, Number(seek.value) > heldAt && chip().includes("Photo timer"));
  press(" ");
  check(`layout@${width}: Space pauses the timer too`, chip().includes("Timer paused"));
  press(" ");
  check(`layout@${width}: and resumes it`, chip().includes("Photo timer"));
  input(seek, 2);
  check(`layout@${width}: dragging the scrub bar moves the timer's position (${$("time-display").textContent})`, $("time-display").textContent === "0:02 / 0:05");
  $("loop-btn").click();
  check(`layout@${width}: with Loop on, Play and the scrub bar are disabled`, $("play-btn").disabled && seek.disabled);
  $("loop-btn").click();
  $("autoplay-btn").click();
  check(`layout@${width}: turning Autoplay off clears the timer, and Autoplay is remembered`,
    Number(seek.value) === 0 && $("time-display").textContent === "" && $("play-btn").disabled && window.localStorage.getItem("rr-mockup.autoplay") === "false");
  $("autoplay-btn").click();
  check(`layout@${width}: turning it on again starts the full time, not where the timer was (${$("time-display").textContent})`, $("time-display").textContent === "0:00 / 0:05");
  $("autoplay-btn").click();
  // Space plays or pauses a video as K does, and leaves a focused button to its own action.
  window.mockup.choose(3);
  press(" ");
  check(`layout@${width}: Space pauses a video (${chip()})`, chip().includes("Paused"));
  press(" ");
  check(`layout@${width}: and plays it again`, chip().includes("Playing"));
  press(" ", $("loop-btn"));
  check(`layout@${width}: Space on a focused button doesn't also play or pause (${chip()})`, chip().includes("Playing"));

  // Stats: the file name opens it; Copy Path off the server machine, Show in File Manager on it.
  $("np-name").click();
  check(`layout@${width}: the file name opens the Stats tab on the current file`,
    !$("panel").hidden && !$("tab-stats").hidden && $("stats-body").textContent.includes(np()) && $("stats-body").textContent.includes("Copy Path"));
  check(`layout@${width}: its tooltip shows the full name, then Show stats`, $("np-name").title === `${np()}\nShow stats`);
  $("mock-server-machine").click();
  check(`layout@${width}: on the server machine it offers Show in File Manager`, $("stats-body").textContent.includes("Show in File Manager"));
  $("mock-server-machine").click();

  // Settings: Advance after is validated, and a value that is not valid is not kept.
  $("tab-btn-settings").click();
  const advance = $("set-advance");
  input(advance, "0");
  check(`layout@${width}: Advance after flags 0 and keeps 5`, advance.getAttribute("aria-invalid") === "true" && window.localStorage.getItem("rr-mockup.advanceAfter") === null);
  input(advance, "8");
  check(`layout@${width}: Advance after keeps 8`, !advance.hasAttribute("aria-invalid") && window.localStorage.getItem("rr-mockup.advanceAfter") === "8");
  check(`layout@${width}: the shortcut reference lists the bindings, ? among them`, $("shortcut-list").querySelectorAll("dt").length === 17 &&
    [...$("shortcut-list").querySelectorAll("dt")].some((dt) => dt.textContent === "?"));
  const sectionNames = [...$("settings-body").querySelectorAll(".settings-section h3")].map((h) => h.textContent).join(", ");
  check(`layout@${width}: Settings is in sections: ${sectionNames}`, sectionNames === "Playback, Audio, Player controls, Appearance, Panel, Keyboard shortcuts, Diagnostics");
  const sectionOf = (id) => $(id).closest(".settings-section").querySelector("h3").textContent;
  check(`layout@${width}: each setting sits in its section`,
    sectionOf("set-advance") === "Playback" && sectionOf("set-ambient") === "Appearance" && document.querySelector('input[name="set-seek"]').closest(".settings-section").querySelector("h3").textContent === "Playback" &&
    document.querySelector('input[name="set-volstep"]').closest(".settings-section").querySelector("h3").textContent === "Audio" && sectionOf("set-hide-after") === "Player controls");
  const settingsText = $("settings-body").textContent;
  check(`layout@${width}: no mockup notes, desktop asides, or key badges in the setting labels`,
    !settingsText.includes("photo duration, renamed") && !settingsText.includes("as on the desktop") && !settingsText.includes("desktop's player view") &&
    !$("settings-body").querySelector(".setting-label kbd") && !settingsText.includes("step one frame"));
  check(`layout@${width}: Keyboard shortcuts starts collapsed, with a chevron`, !$("set-shortcuts").open && !!$("set-shortcuts").querySelector("summary .setting-more-chevron"));
  check(`layout@${width}: Loudness normalization sits in Audio, right under Enhanced audio`,
    sectionOf("set-loudness") === "Audio" && $("set-loudness").closest(".setting").previousElementSibling === $("set-enhanced-audio").closest(".setting"));
  check(`layout@${width}: Diagnostics show today's client type and device name`, $("diag-type").textContent === "web" && $("diag-device").textContent === "Web Browser");
  document.querySelector('input[name="set-theme"][value="light"]').click();
  check(`layout@${width}: the Theme setting switches to Light`, document.documentElement.classList.contains("theme-light"));
  document.querySelector('input[name="set-theme"][value="dark"]').click();
  check(`layout@${width}: and to Dark`, document.documentElement.classList.contains("theme-dark"));
  $("set-status").click();
  check(`layout@${width}: the status line can be hidden`, $("status").hidden);
  $("set-status").click();

  // Hide player controls: Timeout by default, with its two settings under it; On click/tap; Never.
  const hideChoice = (value) => document.querySelector(`input[name="set-hide-controls"][value="${value}"]`);
  const controlsUp = () => $("media").classList.contains("controls-visible");
  const moveOverPlayer = () => $("media").dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true }));
  check(`layout@${width}: Hide player controls starts on Timeout, hiding after 3 s and kept while paused`,
    hideChoice("timeout").checked && !$("set-hide-timeout").hidden && $("set-hide-after").value === "3" && $("set-keep-paused").checked &&
    hideChoice("timeout").closest(".settings-section").querySelector("h3").textContent === "Player controls");
  input($("set-hide-after"), "31");
  check(`layout@${width}: Hide after flags 31 and keeps 3`, $("set-hide-after").getAttribute("aria-invalid") === "true" && window.localStorage.getItem("rr-mockup.hideAfter") === null);
  input($("set-hide-after"), "1");
  check(`layout@${width}: and keeps 1`, window.localStorage.getItem("rr-mockup.hideAfter") === "1");
  closePanel();
  window.mockup.choose(3);
  moveOverPlayer();
  check(`layout@${width}: moving the mouse over the player shows the controls`, controlsUp());
  await sleep(1300);
  const hiddenPlay = (() => {
    const copy = $("play-btn").cloneNode(true);
    copy.removeAttribute("id");
    $("play-btn").after(copy);
    const events = window.getComputedStyle(copy).pointerEvents;
    copy.remove();
    return events;
  })();
  check(`layout@${width}: with no activity they hide after the time set, and hidden they can't be pressed (${hiddenPlay})`, !controlsUp() && hiddenPlay === "none");
  moveOverPlayer();
  await sleep(700);
  moveOverPlayer();
  await sleep(700);
  check(`layout@${width}: each movement restarts the countdown`, controlsUp());
  await sleep(600);
  check(`layout@${width}: and they hide once it runs out`, !controlsUp());
  moveOverPlayer();
  $("play-btn").dispatchEvent(new window.PointerEvent("pointerover", { bubbles: true }));
  await sleep(1300);
  check(`layout@${width}: they stay while the pointer is over them`, controlsUp());
  $("play-btn").dispatchEvent(new window.PointerEvent("pointerout", { bubbles: true, relatedTarget: $("media") }));
  await sleep(1300);
  check(`layout@${width}: and hide after it leaves`, !controlsUp());
  moveOverPlayer();
  $("seek").dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  await sleep(1300);
  check(`layout@${width}: they stay while the scrub bar is dragged`, controlsUp());
  document.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
  await sleep(1300);
  check(`layout@${width}: and hide after the drag ends`, !controlsUp());
  moveOverPlayer();
  $("play-btn").click();
  await sleep(1300);
  check(`layout@${width}: with Keep visible while paused, they stay while paused (${chip()})`, controlsUp() && chip().includes("Paused"));
  change($("set-keep-paused"), false);
  await sleep(1300);
  check(`layout@${width}: without it, they hide while paused too`, !controlsUp() && window.localStorage.getItem("rr-mockup.keepWhilePaused") === "false");
  change($("set-keep-paused"), true);
  $("play-btn").click();
  hideChoice("click").click();
  check(`layout@${width}: On click/tap shows the controls and hides Timeout's settings`, controlsUp() && $("set-hide-timeout").hidden);
  $("media").click();
  check(`layout@${width}: a click on the player hides them`, !controlsUp());
  $("media").click();
  await sleep(1300);
  check(`layout@${width}: and another shows them, with no countdown`, controlsUp());
  hideChoice("never").click();
  $("media").click();
  await sleep(1300);
  check(`layout@${width}: Never keeps them visible through clicks and time`, controlsUp() && $("set-hide-timeout").hidden && window.localStorage.getItem("rr-mockup.hideControls") === '"never"');
  hideChoice("timeout").click();
  input($("set-hide-after"), "3");

  // Volume: the scroll wheel and a two-finger drag change it by the volume step, show the controls, and never scroll
  // the page over the player.
  const volumeNow = () => Number($("volume").value);
  const wheel = (deltaY, deltaMode = 0) => {
    const event = new window.WheelEvent("wheel", { deltaY, deltaMode, bubbles: true, cancelable: true });
    $("media").dispatchEvent(event);
    return event.defaultPrevented;
  };
  closePanel();
  window.mockup.choose(3);
  input($("volume"), "50");
  hideChoice("timeout").click();
  await sleep(10);
  const wheelPrevented = wheel(-100);
  check(`layout@${width}: a wheel notch up raises the volume a step, shows the controls, and doesn't scroll the page (${volumeNow()})`, volumeNow() === 55 && wheelPrevented && controlsUp());
  wheel(3, 1);
  check(`layout@${width}: a notch down in lines lowers it a step (${volumeNow()})`, volumeNow() === 50);
  wheel(-30);
  wheel(-30);
  wheel(-30);
  const afterLightSwipe = volumeNow();
  wheel(-30);
  check(`layout@${width}: a trackpad's small deltas add up to a step every 100 px (${afterLightSwipe}, then ${volumeNow()})`, afterLightSwipe === 50 && volumeNow() === 55);
  window.mockup.choose(2);
  const photoPrevented = wheel(-100);
  check(`layout@${width}: on a photo the wheel does nothing, and still doesn't scroll the page`, volumeNow() === 55 && photoPrevented);
  window.mockup.choose(3);
  const touches = (type, ys) => {
    const event = Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), {
      touches: ys.map((y) => ({ clientX: 120, clientY: y })),
      changedTouches: [{ clientX: 120, clientY: ys[0] ?? 0 }]
    });
    $("media").dispatchEvent(event);
    return event.defaultPrevented;
  };
  touches("touchstart", [300, 340]);
  const dragPrevented = touches("touchmove", [240, 280]);
  touches("touchend", []);
  check(`layout@${width}: two fingers dragged up 60 px raise it two steps, claimed from the browser (${volumeNow()})`,
    volumeNow() === 65 && dragPrevented && window.getComputedStyle($("media")).touchAction === "none" && controlsUp());
  check(`layout@${width}: the player is clipped by a rounded shape as well, which keeps its corners on iOS (${window.getComputedStyle($("media")).clipPath})`,
    /^inset\(0(px)? round /.test(window.getComputedStyle($("media")).clipPath));
  input($("volume"), "80");

  // Ambient mode: on by default, with its settings in an expandable section beside the toggle. It samples at the
  // update rate while a video plays, holds while the video is paused or the tab is hidden, and samples a photo once.
  const samples = () => window.mockup.ambientSamples();
  const wait = sleep;
  const setSlider = (key, value) => {
    $(`set-ambient-${key}`).value = String(value);
    $(`set-ambient-${key}`).dispatchEvent(new window.Event("input"));
  };
  const out = (key) => $(`set-ambient-${key}-out`).textContent;
  closePanel();
  window.mockup.choose(3);
  const ambientCanvas = $("ambient").querySelector("canvas");
  const ambientFilter = () => window.getComputedStyle(ambientCanvas).filter;
  check(`layout@${width}: ambient mode starts on, behind the playing video`,
    $("set-ambient").checked && !$("ambient").hidden && !!($("ambient").compareDocumentPosition($("video")) & window.Node.DOCUMENT_POSITION_FOLLOWING) &&
    window.getComputedStyle($("ambient")).zIndex === "0");
  const more = $("set-ambient-more");
  check(`layout@${width}: its settings are an expandable section beside the toggle, and the Mockup tab has no tuning (${more.querySelector("summary").textContent})`,
    more.tagName === "DETAILS" && more.querySelector("summary").lastChild.textContent === "Ambient mode settings" && more.closest(".setting") === $("set-ambient").closest(".setting") &&
    !document.querySelector('#mock-sheet input[type="range"]'));
  // Its chevron points right while closed and turns down when open. happy-dom keeps an element's computed style after an
  // ancestor's attribute changes, so the chevron is measured on a fresh copy beside it.
  const chevron = more.querySelector("summary .setting-more-chevron");
  const chevronTurn = () => {
    const copy = chevron.cloneNode(true);
    chevron.after(copy);
    const transform = window.getComputedStyle(copy).transform;
    copy.remove();
    return transform;
  };
  more.removeAttribute("open");
  const closedTurn = chevronTurn();
  more.setAttribute("open", "");
  const openTurn = chevronTurn();
  more.removeAttribute("open");
  check(`layout@${width}: its header has a chevron that turns when it opens (${closedTurn || "none"} to ${openTurn})`,
    chevron?.dataset.icon === "chevron_right" && openTurn === "rotate(90deg)" && closedTurn !== openTurn);
  const settingNames = [...more.querySelectorAll("label span")].map((el) => el.textContent).join(", ");
  check(`layout@${width}: with plain labels and today's defaults (${settingNames}: ${["rate", "fade", "blur", "dark", "light", "saturation"].map(out).join(", ")})`,
    settingNames === "Update rate, Fade time, Blur, Strength in the dark theme, Strength in the light theme, Saturation" &&
    out("rate") === "1 per second" && out("fade") === "2 s" && out("blur") === "64 px" && out("dark") === "50%" && out("light") === "75%" && out("saturation") === "100%" &&
    ambientFilter() === "blur(64px) brightness(0.5) saturate(1)" && !!button(more, "Reset to defaults"));
  setSlider("rate", 4);
  let ambientBefore = samples();
  await wait(900);
  check(`layout@${width}: at 4 per second it samples while the video plays (${samples() - ambientBefore} in 0.9 s)`, samples() - ambientBefore >= 2);
  $("play-btn").click();
  ambientBefore = samples();
  await wait(700);
  check(`layout@${width}: and holds while the video is paused (${samples() - ambientBefore})`, samples() === ambientBefore && chip().includes("Paused"));
  $("play-btn").click();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  ambientBefore = samples();
  await wait(700);
  check(`layout@${width}: and while the tab is hidden (${samples() - ambientBefore})`, samples() === ambientBefore);
  delete document.hidden;
  window.mockup.choose(2);
  ambientBefore = samples();
  await wait(700);
  check(`layout@${width}: a photo is sampled once (${samples() - ambientBefore})`, samples() - ambientBefore === 1 && !$("ambient").hidden);
  change($("set-ambient"), false);
  check(`layout@${width}: turning it off leaves the plain black background, and is remembered`, $("ambient").hidden && window.localStorage.getItem("rr-mockup.ambient") === "false");
  change($("set-ambient"), true);
  window.mockup.choose(3);
  setSlider("rate", 0.5);
  await wait(300);
  ambientBefore = samples();
  await wait(1200);
  check(`layout@${width}: a slower update rate applies at once (${samples() - ambientBefore} in 1.2 s at ${out("rate")})`, samples() - ambientBefore <= 1 && out("rate") === "0.5 per second");
  setSlider("fade", 3);
  setSlider("blur", 40);
  setSlider("dark", 30);
  setSlider("saturation", 150);
  check(`layout@${width}: blur, the dark theme's strength, and saturation apply as set (${ambientFilter()})`,
    ambientFilter() === "blur(40px) brightness(0.3) saturate(1.5)" && out("fade") === "3 s" && out("saturation") === "150%" &&
    JSON.parse(window.localStorage.getItem("rr-mockup.ambientSettings")).blur === 40);
  document.querySelector('input[name="set-theme"][value="light"]').click();
  setSlider("light", 60);
  check(`layout@${width}: the light theme uses full color at its own strength (${ambientFilter()})`, ambientFilter() === "blur(40px) brightness(0.6) saturate(1.5)");
  check(`layout@${width}: the time display stays light in the light theme (${window.getComputedStyle($("time-display")).color})`, window.getComputedStyle($("time-display")).color === "#ffffff");
  document.querySelector('input[name="set-theme"][value="dark"]').click();
  check(`layout@${width}: and in the dark theme`, window.getComputedStyle($("time-display")).color === "#ffffff");
  setSlider("rate", 0.25);
  button(more, "Reset to defaults").click();
  check(`layout@${width}: Reset to defaults restores each setting`,
    ambientFilter() === "blur(64px) brightness(0.5) saturate(1)" && out("rate") === "1 per second" && out("light") === "75%" && window.localStorage.getItem("rr-mockup.ambientSettings") === null);
  ambientBefore = samples();
  await wait(1300);
  check(`layout@${width}: and the default rate applies at once (${samples() - ambientBefore} in 1.3 s)`, samples() - ambientBefore >= 1);
  // Native controls use the orange accent in both themes, and the panel side reads Left, then Right.
  const accent = window.getComputedStyle(document.documentElement).getPropertyValue("--huggins-orange").trim();
  const accented = [$("seek"), $("volume"), $("set-ambient"), document.querySelector('input[name="set-theme"]'), $("set-ambient-rate")];
  check(`layout@${width}: the scrub bar, volume, checkboxes, radio buttons, and sliders use the orange accent (${window.getComputedStyle($("seek")).accentColor})`,
    accented.every((el) => window.getComputedStyle(el).accentColor === accent));
  const sides = [...document.querySelectorAll('input[name="set-side"]')].map((radio) => radio.parentElement.textContent.trim()).join(", ");
  check(`layout@${width}: the panel side options read ${sides}`, sides === "Left, Right");

  // Keyboard shortcuts, ignored while typing.
  closePanel();
  // ? is Shift+/ on most keyboards, so it arrives with Shift held.
  press("?", document.body, { shiftKey: true });
  check(`layout@${width}: ? opens Settings with the shortcuts expanded`, !$("panel").hidden && !$("tab-settings").hidden && $("set-shortcuts").open && document.activeElement === $("set-shortcuts").querySelector("summary"));
  $("set-shortcuts").open = false;
  closePanel();
  press("?", $("lib-search"), { shiftKey: true });
  check(`layout@${width}: but not while typing`, $("panel").hidden);
  press("2");
  check(`layout@${width}: 2 opens the Filter tab`, !$("panel").hidden && !$("tab-filter").hidden);
  press("2");
  check(`layout@${width}: 2 again closes the panel`, $("panel").hidden);
  const volumeBefore = Number($("volume").value);
  const statusBeforeVolume = status();
  press("[");
  check(`layout@${width}: [ lowers the volume by the step (${volumeBefore} to ${$("volume").value}), with no status message`,
    Number($("volume").value) === volumeBefore - 5 && status() === statusBeforeVolume);
  // Frame stepping on comma and period, only while a video is paused.
  window.mockup.choose(3);
  $("play-btn").click();
  const frameBefore = Number($("seek").value);
  press(".");
  check(`layout@${width}: . steps one frame while paused (${chip()})`, chip().includes("stepped a frame forward") && Math.abs(Number($("seek").value) - frameBefore - 1 / 30) < 0.02);
  $("play-btn").click();
  press(",");
  check(`layout@${width}: , does nothing while playing`, chip().includes("Playing"));
  openTab("library");
  const before = chip();
  press("k", $("lib-search"));
  check(`layout@${width}: K in the search box types instead of pausing`, chip() === before);

  // Selection, as Google Photos does it: one check icon at each tile's top left.
  const markOf = (tile) => tile.querySelector(".select-mark");
  // Selection patches tiles in place, and happy-dom keeps an element's computed style after a class change, so styles
  // here are measured on a fresh copy in the element's place.
  const freshStyle = (el) => {
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    el.after(copy);
    const style = window.getComputedStyle(copy);
    const values = { display: style.display, opacity: style.opacity, color: style.color, transform: style.transform };
    copy.remove();
    return values;
  };
  const markShown = (el) => !!el && freshStyle(el).display !== "none";
  check(`layout@${width}: the Library has no Select button`, !$("lib-select"));
  check(`layout@${width}: outside selection the check icons stay hidden until a tile is hovered`, tiles().every((tile) => !markShown(markOf(tile))));
  const firstId = tiles()[0].dataset.id;
  const playingBefore = np();
  markOf(tiles()[0]).click();
  const picked = $("lib-grid").querySelector(`.lib-tile[data-id="${firstId}"]`);
  check(`layout@${width}: clicking a tile's check icon selects it and starts selection, and plays nothing (${$("bulk-count").textContent})`,
    picked.classList.contains("is-selected") && $("bulk-count").textContent === "1 selected" && !$("bulk-bar").hidden && np() === playingBefore);
  const others = tiles().filter((tile) => tile !== picked);
  check(`layout@${width}: during selection every tile shows the icon, faded`,
    others.every((tile) => markShown(markOf(tile)) && freshStyle(markOf(tile)).opacity === "0.6"));
  check(`layout@${width}: a selected tile's icon is filled orange and its thumbnail shrinks inside the tile`,
    freshStyle(markOf(picked)).opacity === "1" && freshStyle(markOf(picked)).color === window.getComputedStyle(document.documentElement).getPropertyValue("--huggins-orange").trim() &&
    /scale\(0\.86\)/.test(freshStyle(picked.querySelector(".lib-tile-frame")).transform) && markOf(picked).querySelector(".material-symbol-icon").dataset.icon === "check_circle");
  markOf(picked).click();
  check(`layout@${width}: deselecting the last tile ends selection`, !$("lib-grid").querySelector(`.lib-tile[data-id="${firstId}"]`).classList.contains("is-selected") && $("bulk-bar").hidden && !$("lib-grid").classList.contains("selecting"));
  $("bulk-exit").click();
  check(`layout@${width}: leaving selection hides the icons again`, tiles().every((tile) => !markShown(markOf(tile))));

  // Multi-select and bulk actions; removing from the library is an admin action.
  markOf(tiles()[0]).click();
  check(`layout@${width}: selection marks the tiles as checkboxes`, tiles()[0].getAttribute("role") === "checkbox" && !$("bulk-bar").hidden);
  tiles()[1].click();
  check(`layout@${width}: two taps select two (${$("bulk-count").textContent})`, $("bulk-count").textContent === "2 selected" && tiles()[0].classList.contains("is-selected"));
  // Edit tags opens the Tags tab on the selected items: green for a tag every one has, orange for one only some have.
  const pair = [Number(tiles()[0].dataset.id), Number(tiles()[1].dataset.id)];
  const [both, one, none] = window.mockup.tags.flatMap((category) => category.chips).slice(0, 3);
  pair.forEach((id) => [both, one, none].forEach((tag) => items[id].tags.delete(tag.key)));
  pair.forEach((id) => items[id].tags.add(both.key));
  items[pair[0]].tags.add(one.key);
  $("bulk-actions").click();
  $("bulk-menu").querySelector('[data-bulk="tags"]').click();
  await tick();
  const tagLine = $("tags-target");
  const chipFor = (tag) => [...document.querySelectorAll("#tags-body .tag-chip")].find((el) => el.querySelector(".tag-chip-label").textContent === tag.name);
  check(`layout@${width}: Edit tags opens the Tags tab on the selection, with no dialog ("${tagLine.textContent}")`,
    !$("panel").hidden && !$("tab-tags").hidden && !tagLine.hidden && tagLine.textContent === "Editing tags for 2 items" && openDialogs().length === 0);
  check(`layout@${width}: a tag both items have is green, one only one has is orange, and one neither has is plain`,
    chipFor(both).classList.contains("state-all") && chipFor(one).classList.contains("state-some") && !/state-/.test(chipFor(none).className));
  chipFor(none).querySelector('[title="Add tag"]').click();
  chipFor(one).querySelector('[title="Remove tag"]').click();
  $("tags-save").click();
  check(`layout@${width}: Save applies the changes to every selected item (${status()})`,
    pair.every((id) => items[id].tags.has(none.key) && !items[id].tags.has(one.key)) && status() === "Updated tags on 2 items." &&
    tagLine.textContent === "Editing tags for 2 items" && chipFor(none).classList.contains("state-all") && !/state-/.test(chipFor(one).className));
  // The tab follows the selection while selection lasts.
  openTab("library");
  const thirdId = tiles().find((tile) => !tile.classList.contains("is-selected")).dataset.id;
  $("lib-grid").querySelector(`.lib-tile[data-id="${thirdId}"]`).click();
  openTab("tags");
  check(`layout@${width}: selecting a third tile makes it 3 items ("${tagLine.textContent}")`, tagLine.textContent === "Editing tags for 3 items");
  openTab("library");
  $("lib-grid").querySelector(`.lib-tile[data-id="${thirdId}"]`).click();
  const removedName = tiles()[0].getAttribute("aria-label");
  $("bulk-actions").click();
  $("bulk-menu").querySelector('[data-bulk="remove"]').click();
  await tick();
  check(`layout@${width}: Remove from library asks for the control token first`, topDialog()?.querySelector("h3")?.textContent === "Control token");
  input(topDialog().querySelector("input"), "secret-token");
  topDialog().querySelector('button[type="submit"]').click();
  await tick();
  check(`layout@${width}: then asks to remove, with deleting files off by default`, topDialog()?.textContent.includes("Remove 2 items from the library? Their files stay on disk.") && !topDialog().querySelector('input[type="checkbox"]').checked);
  change(topDialog().querySelector('input[type="checkbox"]'), true);
  check(`layout@${width}: turning deletion on says the files are deleted from disk`, topDialog().textContent.includes("permanently delete their 2 files from disk") && !!button(topDialog(), "Remove and Delete"));
  change(topDialog().querySelector('input[type="checkbox"]'), false);
  button(topDialog(), "Remove").click();
  await tick();
  check(`layout@${width}: the items leave the grid (${status()})`, !tiles().some((t) => t.getAttribute("aria-label") === removedName) && status() === "Removed 2 items from the library.");
  $("bulk-exit").click();
  check(`layout@${width}: when selection ends without unsaved changes, the Tags tab follows the playing item again`, tagLine.hidden);
  // Selection ending with unsaved changes keeps its items in the Tags tab until the changes are saved or discarded.
  markOf(tiles()[0]).click();
  $("bulk-actions").click();
  $("bulk-menu").querySelector('[data-bulk="tags"]').click();
  await tick();
  chipFor(one).querySelector('[title="Add tag"]').click();
  $("bulk-exit").click();
  check(`layout@${width}: after selection ends with unsaved changes the tab keeps its items ("${tagLine.textContent}")`,
    tagLine.textContent === "Editing tags for 1 item" && !$("tags-save").disabled);
  $("tags-refresh").click();
  await tick();
  button(topDialog(), "Discard").click();
  await tick();
  check(`layout@${width}: discarding them returns it to the playing item`, tagLine.hidden && $("tags-save").disabled);
  // Shift+click selects a range and no text; Ctrl+click is an ordinary click.
  openTab("library");
  check(`layout@${width}: the grid's text can't be selected (${window.getComputedStyle($("lib-grid")).userSelect})`, window.getComputedStyle($("lib-grid")).userSelect === "none");
  markOf(tiles()[0]).click();
  tiles()[3].dispatchEvent(new window.MouseEvent("click", { bubbles: true, shiftKey: true }));
  check(`layout@${width}: Shift+click selects the range (${$("bulk-count").textContent})`, $("bulk-count").textContent === "4 selected");
  $("bulk-exit").click();
  const ctrlTile = tiles().find((tile) => playable(items[Number(tile.dataset.id)]) && items[Number(tile.dataset.id)].name !== np());
  const ctrlName = items[Number(ctrlTile.dataset.id)].name;
  ctrlTile.dispatchEvent(new window.MouseEvent("click", { bubbles: true, ctrlKey: true }));
  dismissNotices();
  check(`layout@${width}: Ctrl+click plays the tile and selects nothing`, $("bulk-bar").hidden && np() === ctrlName);
  openTab("library");

  // Keyboard focus shows in the brand orange throughout, as one ring and none for a mouse click. In the grid, as Google
  // Photos does it, a focused tile gets an orange border and a focused check icon a thick ring that the tile crops.
  const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("\n");
  const ruleFor = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
  };
  const focusRing = window.getComputedStyle(document.documentElement).getPropertyValue("--focus-ring").trim();
  check(`layout@${width}: focus is one orange ring, at some transparency, and none for a mouse click (${focusRing})`,
    /^rgba\(239, 127, 34, 0\.\d+\)$/.test(focusRing) && ruleFor(":focus").includes("outline: none") && ruleFor(":focus-visible").includes("outline: 2px solid var(--focus-ring)"));
  // happy-dom paints nothing, so the border counts as shown only when a layer after the thumbnail's frame draws it, over
  // the tile's whole edge: the frame fills the tile and covers anything the tile itself draws, its outline included.
  const ringColor = window.getComputedStyle(document.documentElement).getPropertyValue("--focus-ring").trim();
  const borderTile = tiles()[2];
  borderTile.focus();
  const layers = [...borderTile.children];
  const borderLayer = layers.slice(layers.indexOf(borderTile.querySelector(".lib-tile-frame")) + 1).find((layer) => {
    const copy = layer.cloneNode(true);
    copy.removeAttribute("id");
    layer.after(copy);
    const style = window.getComputedStyle(copy);
    const draws = style.display !== "none" && style.position === "absolute" && style.top === "0px" && style.left === "0px" && style.right === "0px" && style.bottom === "0px" &&
      ((style.boxShadow.includes("inset") && style.boxShadow.includes(ringColor)) || `${style.outlineColor} ${style.outline}`.includes(ringColor));
    copy.remove();
    return draws;
  });
  check(`layout@${width}: a focused tile's orange border is drawn by a layer above its thumbnail (${borderLayer?.className || "none"})`, !!borderLayer);
  check(`layout@${width}: and its check icon shows, then turns bright white in a thick ring the tile crops`,
    ruleFor(".lib-tile:focus-visible .select-mark").includes("display: flex") && /opacity: 1;.*outline: 11px solid var\(--focus-ring\); outline-offset: -2px/.test(ruleFor(".select-mark:focus-visible")) &&
    window.getComputedStyle(tiles()[0]).overflow === "hidden");
  const stops = () => [...$("lib-grid").querySelectorAll(".lib-tile, .select-mark")].filter((el) => el.tabIndex === 0);
  check(`layout@${width}: the grid is one tab stop: a tile, then its check icon`, stops().length === 2 && stops()[0].classList.contains("lib-tile") && stops()[1].parentElement === stops()[0]);
  const gridTiles = tiles();
  gridTiles[0].focus();
  const npBeforeArrows = np();
  press("ArrowRight", gridTiles[0]);
  check(`layout@${width}: ArrowRight moves focus and the tab stop to the next tile, and plays nothing`,
    document.activeElement === gridTiles[1] && gridTiles[1].tabIndex === 0 && gridTiles[0].tabIndex === -1 && markOf(gridTiles[1]).tabIndex === 0 && np() === npBeforeArrows);
  press("ArrowDown", gridTiles[1]);
  check(`layout@${width}: ArrowDown moves to a tile in the next row`, document.activeElement?.parentElement === gridTiles[1].parentElement.nextElementSibling && stops()[0] === document.activeElement);
  press("ArrowUp", document.activeElement);
  check(`layout@${width}: ArrowUp moves back up a row`, document.activeElement?.parentElement === gridTiles[1].parentElement);
  press("ArrowLeft", document.activeElement);
  const focusedTile = document.activeElement;
  check(`layout@${width}: ArrowLeft moves to the previous tile`, focusedTile?.classList.contains("lib-tile") && np() === npBeforeArrows);
  const focusedMark = markOf(focusedTile);
  focusedMark.focus();
  press("Enter", focusedMark);
  check(`layout@${width}: Enter on a tile's check icon selects it and starts selection, and focus stays on the icon`,
    focusedTile.classList.contains("is-selected") && $("bulk-count").textContent === "1 selected" && focusedMark.getAttribute("aria-checked") === "true" && document.activeElement === focusedMark);
  press(" ", focusedMark);
  check(`layout@${width}: Space on it deselects it, ending selection, with focus still there`,
    !focusedTile.classList.contains("is-selected") && $("bulk-bar").hidden && document.activeElement === focusedMark && np() === npBeforeArrows);

  // The browser-playable option and the format notice.
  const avi = tiles().find((t) => t.getAttribute("aria-label").endsWith(".avi"));
  avi.click();
  check(`layout@${width}: an .avi says its format isn't supported (${notice().slice(0, 60)})`,
    notice().includes("format (.avi) isn't supported in this browser") && chip().includes("Can't play"));
  dismissNotices();
  openTab("filter");
  document.querySelector('[data-sub="general"]').click();
  change($("filter-playable"), true);
  $("filter-apply").click();
  await tick();
  openTab("library");
  check(`layout@${width}: with it on, no .avi or .wmv tiles show, and the filter line says so (${$("lib-filters").textContent})`,
    !tiles().some((t) => /\.(avi|wmv)$/.test(t.getAttribute("aria-label"))) && $("lib-filters").textContent.includes("Only files this browser can play"));

  // Pairing prompt and read-only volume.
  $("mock-pairing").click();
  check(`layout@${width}: the pairing prompt shows in the header, labeled`, !$("pair").hidden && document.body.classList.contains("pairing") && $("pair").querySelector("label").textContent === "Pairing token" && $("pair-token").placeholder === "Enter token");
  input($("pair-token"), "x");
  input($("pair-token"), "");
  check(`layout@${width}: an emptied pairing token is flagged and Pair held`, $("pair-token").getAttribute("aria-invalid") === "true" && $("pair-btn").getAttribute("aria-disabled") === "true");
  input($("pair-token"), "wrong");
  $("pair").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`layout@${width}: a wrong token says Pairing failed. and keeps the prompt`, notice() === "Pairing failed." && !$("pair").hidden);
  dismissNotices();
  input($("pair-token"), "abc123");
  $("pair").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`layout@${width}: Pair hides the prompt`, $("pair").hidden && status() === "Paired." && !document.body.classList.contains("pairing"));
  $("mock-ios-volume").click();
  check(`layout@${width}: with the gain stage running, a read-only volume, as on iOS, keeps its slider`, !$("volume-wrap").hidden && standIn.gains.length === 1);
  // Library controls collapse, and the preset and randomization dropdowns share a row.
  openTab("library");
  check(`layout@${width}: preset and randomization sit in one row`, $("lib-preset").parentElement === $("lib-mode").parentElement && $("lib-preset").parentElement.classList.contains("lib-pair"));
  $("lib-collapse").click();
  check(`layout@${width}: the controls and the Filters line collapse, stay collapsed on this device, and say so (${$("lib-collapse").title})`,
    $("lib-controls").classList.contains("is-collapsed") && $("lib-filters").classList.contains("is-collapsed") && window.localStorage.getItem("rr-mockup.libCollapsed") === "true" && $("lib-collapse").title === "Show controls & filters");
  $("lib-collapse").click();
  // A phone on its side: the header and status line hide, the panel opens as the overlay, and the reconnecting
  // indicator stands in for the status line.
  $("mock-short").click();
  check(`layout@${width}: a short touch screen gets the full-screen player layout and the overlay`, document.body.classList.contains("short-screen") && $("stage").classList.contains("is-overlay"));
  situation("reconnecting");
  check(`layout@${width}: there the player shows the reconnecting indicator`, !$("conn-indicator").hidden);
  situation("connected");
  $("mock-short").click();

  // Hide mockup notes: every mockup-only element goes except the Mockup tab and its options. happy-dom keeps an
  // element's computed style after a class changes on <html>, so each is measured on a fresh copy in its place.
  const displayed = (el) => {
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    el.after(copy);
    const shown = window.getComputedStyle(copy).display !== "none";
    copy.remove();
    return shown;
  };
  $("mock-toggle").click();
  check(`layout@${width}: mockup notes show by default`, displayed($("play-chip")) && !document.documentElement.classList.contains("hide-mock"));
  change($("mock-hide-notes"), true);
  const notes = [$("play-chip"), $("mock-hint"), document.querySelector("#autotag .mock-note"), document.querySelector("#startup-error .mock-note")];
  const kept = [$("mock-toggle"), $("mock-sheet"), document.querySelector("#mock-sheet .mock-label"), $("startup-error-back")];
  check(`layout@${width}: Hide mockup notes hides the notes and keeps the Mockup tab, its options, and the way back from the error page (${notes.map(displayed)} / ${kept.map(displayed)})`,
    notes.every((el) => !displayed(el)) && displayed($("mock-toggle")) && displayed($("mock-sheet")) && displayed(document.querySelector("#mock-sheet .mock-label")) &&
    displayed($("startup-error-back")) && window.localStorage.getItem("rr-mockup.hideMock") === "true");
  change($("mock-hide-notes"), false);
  check(`layout@${width}: and turning it off shows them again`, notes.filter((el) => !el.hidden).every(displayed));
  $("mock-close").click();

  // Events from the server, and the runtime config failing.
  $("mock-sync").click();
  check(`layout@${width}: a favorite from another device shows a sync notice (${status().slice(0, 40)})`, /^Synced: (Added to|Removed from) favorites: /.test(status()));
  $("mock-refresh").click();
  await tick();
  check(`layout@${width}: a library refresh ends with its summary`, status().startsWith("Core refresh complete | Source: "));
  $("mock-startup").click();
  check(`layout@${width}: a runtime config failure shows today's error page`, !$("startup-error").hidden && $("startup-error").textContent.includes("Runtime Configuration Error"));
  $("startup-error-back").click();
  check(`layout@${width}: no browser dialog was used anywhere (${nativeCalls.join(",")})`, nativeCalls.length === 0);
  check(`layout@${width}: no script errors anywhere ${errors.join("; ")}`, errors.length === 0);
}

{
  // iOS: a media element's volume is read-only, so the volume works through a Web Audio gain stage. The slider shows
  // once the stage starts on the first tap, and the wheel and the slider then set its gain.
  const { setup, gains, mediaCalls } = standInAudio();
  const { document, errors, window } = await load("layout", 390, "?instant", setup);
  const $ = (id) => document.getElementById(id);
  document.getElementById("mock-ios-volume").click();
  window.mockup.choose(3);
  const wheelUp = () => $("media").dispatchEvent(new window.WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
  const volumeBefore = Number($("volume").value);
  wheelUp();
  check("ios: with the volume read-only and no gain stage yet, the slider is hidden and the wheel does nothing", $("volume-wrap").hidden && Number($("volume").value) === volumeBefore && gains.length === 0);
  document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  check(`ios: the first tap starts the gain stage, and the slider shows (${gains.length} gain node)`, gains.length === 1 && !$("volume-wrap").hidden);
  wheelUp();
  check(`ios: the wheel then raises the volume, and the gain follows it (${$("volume").value}, gain ${gains[0]?.gain.value})`,
    Number($("volume").value) === Math.min(100, volumeBefore + 5) && Math.abs(gains[0].gain.value - Number($("volume").value) / 100) < 1e-9);
  const param = gains[0].gain;
  const lastCall = () => param.calls.at(-1);
  const glides = (call, level) => call?.[0] === "glide" && Math.abs(call[1] - level) < 1e-9 && call[2] > 0 && call[2] <= 0.03;
  check(`ios: playing a video started the sound from silence and faded it in (${JSON.stringify(param.calls.slice(0, 2))})`,
    param.calls[0]?.[0] === "set" && param.calls[0][1] === 0 && glides(param.calls[1], volumeBefore / 100) && mediaCalls[0] === "play");
  check(`ios: a volume step glides to its level instead of jumping (${JSON.stringify(lastCall())})`, glides(lastCall(), Number($("volume").value) / 100));
  $("play-btn").click();
  const pausedAtOnce = mediaCalls.at(-1) === "pause";
  check(`ios: pause fades the sound out first (${JSON.stringify(lastCall())})`, glides(lastCall(), 0) && !pausedAtOnce);
  await new Promise((resolve) => setTimeout(resolve, 100));
  check("ios: and stops it once it is silent", mediaCalls.at(-1) === "pause");
  $("play-btn").click();
  check(`ios: play fades it back in from silence (${JSON.stringify(param.calls.slice(-2))})`,
    param.calls.at(-2)?.[0] === "set" && param.calls.at(-2)[1] === 0 && glides(lastCall(), Number($("volume").value) / 100) && mediaCalls.at(-1) === "play");
  $("mute-btn").click();
  check("ios: Mute glides the gain to 0", glides(lastCall(), 0) && param.value === 0);
  check(`ios: the gain is never set straight to a level (${param.directSets} direct sets)`, param.directSets === 0);
  check(`ios: no script errors ${errors.join("; ")}`, errors.length === 0);
}

{
  // Enhanced audio, on by default: every device plays through the gain stage. Off, the sound plays directly, and on
  // iOS the volume controls hide.
  const { setup, gains, playedBy } = standInAudio();
  const { document, errors, window } = await load("layout", 1280, "?instant", setup);
  const $ = (id) => document.getElementById(id);
  const toggle = $("set-enhanced-audio");
  check(`enhanced: Enhanced audio starts on, in Playback, with its description (${toggle.closest(".setting").querySelector(".setting-hint").textContent})`,
    toggle.checked && toggle.closest(".settings-section").querySelector("h3").textContent === "Audio" &&
    toggle.closest(".setting").querySelector(".setting-hint").textContent === "Processes audio in the app, for in-app volume on iPhone and iPad and loudness normalization.");
  document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  window.mockup.choose(3);
  const routed = playedBy.at(-1);
  check(`enhanced: a device whose volume isn't read-only also plays through the gain stage (${gains.length} gain node)`, gains.length === 1 && !!routed);
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event("change"));
  const direct = playedBy.at(-1);
  check("enhanced: turning it off plays the sound directly, on another element, with no gain stage", direct !== routed && routed.paused && !direct.paused && gains.length === 1 && window.localStorage.getItem("rr-mockup.enhancedAudio") === "false");
  const slider = $("volume");
  slider.value = "40";
  slider.dispatchEvent(new window.Event("input"));
  check(`enhanced: directly, the volume sets the element's own volume (${direct.volume})`, Math.abs(direct.volume - 0.4) < 1e-9 && !$("volume-wrap").hidden);
  $("mock-ios-volume").click();
  check("enhanced: off, on iOS the volume controls hide", $("volume-wrap").hidden);
  $("mock-ios-volume").click();
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  check(`enhanced: turning it back on starts a new gain stage and plays through it (${gains.length} gain nodes)`, gains.length === 2 && direct.paused && playedBy.at(-1) !== direct);
  check(`enhanced: no script errors ${errors.join("; ")}`, errors.length === 0);
}

{
  // No silent fallback: a gain stage that can't start shows a notice that offers to turn Enhanced audio off.
  const { setup, gains, playedBy } = standInAudio();
  const { document, errors, window } = await load("layout", 390, "?instant", setup);
  const $ = (id) => document.getElementById(id);
  $("mock-audio-fails").click();
  document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const notice = [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  const turnOff = notice && [...notice.querySelectorAll("button")].find((b) => b.textContent.trim() === "Turn off Enhanced audio");
  check(`audio-fails: the next tap shows the notice (${notice?.querySelector(".dialog-message")?.textContent.slice(0, 45)})`,
    !!notice && notice.querySelector(".dialog-message").textContent.startsWith("Audio processing couldn't start on this device.") && !!turnOff && gains.length === 0 &&
    document.activeElement?.textContent.trim() === "OK");
  turnOff.click();
  window.mockup.choose(3);
  check("audio-fails: its button turns Enhanced audio off for this device, and the sound then plays directly",
    !$("set-enhanced-audio").checked && window.localStorage.getItem("rr-mockup.enhancedAudio") === "false" && !document.querySelector("dialog.app-dialog") && playedBy.length === 1 && !playedBy[0].paused);
  check(`audio-fails: no script errors ${errors.join("; ")}`, errors.length === 0);
}

{
  // Loudness normalization, off by default: its settings sit in an expandable section like Ambient mode's, with the
  // desktop's defaults, and are disabled while Enhanced audio is off. On, it sets the gain stage by the desktop's formula:
  // the baseline minus the item's loudness, limited to the boost and the reduction, as a linear gain on the volume.
  const { setup, gains, playedBy } = standInAudio();
  const { document, errors, window } = await load("layout", 1280, "?instant", setup);
  const $ = (id) => document.getElementById(id);
  const change = (el, value) => {
    el.checked = value;
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
  };
  const stored = (key) => JSON.parse(window.localStorage.getItem("rr-mockup." + key) ?? "null");
  const toggle = $("set-loudness");
  const more = $("set-loudness-more");
  const baseline = (value) => document.querySelector(`input[name="set-loud-baseline"][value="${value}"]`);
  const labels = [...more.querySelectorAll(".setting-label")].map((el) => el.textContent).join(", ");
  check(`loudness: the option starts off, with its hint (${$("set-loudness-hint").textContent})`,
    !toggle.checked && !toggle.disabled && $("set-loudness-hint").textContent === "Evens out loudness between videos.");
  check(`loudness: its settings are an expandable section with the desktop's defaults (${labels})`,
    more.tagName === "DETAILS" && !more.open && more.querySelector("summary").lastChild.textContent === "Loudness normalization settings" &&
    !!more.querySelector("summary .setting-more-chevron") && labels === "Maximum reduction, Maximum boost, Baseline, Target" &&
    $("set-loud-reduction").value === "15" && $("set-loud-boost").value === "5" && baseline("auto").checked && $("set-loud-manual").hidden &&
    $("set-loud-target").value === "-23" && $("set-loud-auto-value").textContent === "The library's baseline, -20.4 LUFS.");
  check("loudness: the target field uses the full keyboard, since the numeric keypads on iOS have no minus key",
    !$("set-loud-target").hasAttribute("inputmode") && $("set-loud-reduction").getAttribute("inputmode") === "numeric");
  document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  window.mockup.choose(3);
  const param = gains.at(-1).gain;
  const volume = Number($("volume").value) / 100;
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  // The Stats tab's Adjustment shows what normalization applies: the baseline difference limited by its settings.
  const adjustment = () => {
    const dt = [...$("stats-body").querySelectorAll("dt")].find((el) => el.textContent === "Adjustment");
    return dt?.nextElementSibling.textContent;
  };
  check(`loudness: off, the gain is the volume (${param.level}), and Stats shows the Adjustment as ${adjustment()}`, close(param.level, volume) && adjustment() === "Off");
  change(toggle, true);
  const loudness = window.mockup.items[3].loudness;
  const limitedDb = Math.max(-15, Math.min(5, -20.4 - loudness));
  const expected = Math.min(2, volume * Math.pow(10, limitedDb / 20));
  check(`loudness: on, the gain follows the item's loudness against the library's baseline (${param.level.toFixed(4)} for ${loudness} LUFS)`,
    close(param.level, expected) && param.calls.at(-1)[0] === "glide" && stored("loudness") === true);
  check(`loudness: and Stats shows the limited adjustment it applies (${adjustment()} for a difference of ${(-20.4 - loudness).toFixed(1)} dB)`,
    adjustment() === `${limitedDb >= 0 ? "+" : ""}${limitedDb.toFixed(1)} dB`);
  change(baseline("manual"), true);
  check("loudness: Manual shows the target", !$("set-loud-manual").hidden && stored("loudnessSettings").baseline === "manual");
  input($("set-loud-target"), "-50");
  check(`loudness: a target far below the item is limited to the maximum reduction (${param.level.toFixed(4)}, ${adjustment()})`,
    close(param.level, volume * Math.pow(10, -15 / 20)) && stored("loudnessSettings").target === -50 && adjustment() === "-15.0 dB");
  input($("set-loud-reduction"), "31");
  check("loudness: a reduction outside 1 to 30 is flagged and not kept, and the gain stays",
    $("set-loud-reduction").getAttribute("aria-invalid") === "true" && stored("loudnessSettings").reduction === 15 && close(param.level, volume * Math.pow(10, -15 / 20)));
  input($("set-loud-reduction"), "6");
  check(`loudness: a reduction of 6 dB applies at once (${param.level.toFixed(4)}, ${adjustment()})`,
    close(param.level, volume * Math.pow(10, -6 / 20)) && stored("loudnessSettings").reduction === 6 && adjustment() === "-6.0 dB");
  input($("set-loud-target"), "-5");
  input($("set-loud-boost"), "11");
  check("loudness: a target above -10 LUFS and a boost above 10 dB are flagged",
    $("set-loud-target").getAttribute("aria-invalid") === "true" && $("set-loud-boost").getAttribute("aria-invalid") === "true" && stored("loudnessSettings").target === -50);
  change($("set-enhanced-audio"), false);
  check(`loudness: with Enhanced audio off, the option and its settings are disabled, with "${$("set-loudness-hint").textContent}"`,
    toggle.disabled && toggle.checked && $("set-loudness-fields").disabled && $("set-loudness-hint").textContent === "Needs Enhanced audio." &&
    !!playedBy.at(-1) && !playedBy.at(-1).paused && adjustment() === "Off");
  change($("set-enhanced-audio"), true);
  check("loudness: turning Enhanced audio back on enables them", !toggle.disabled && !$("set-loudness-fields").disabled && $("set-loudness-hint").textContent === "Evens out loudness between videos.");
  $("set-loud-reset").click();
  check("loudness: Reset to defaults restores each setting, and forgets the stored ones",
    $("set-loud-reduction").value === "15" && $("set-loud-boost").value === "5" && $("set-loud-target").value === "-23" && baseline("auto").checked &&
    $("set-loud-manual").hidden && !$("set-loud-boost").hasAttribute("aria-invalid") && stored("loudnessSettings") === null && toggle.checked);
  check(`loudness: no script errors ${errors.join("; ")}`, errors.length === 0);
}

for (const width of [1280, 390]) {
  // Daily retention starts off, at 0 days, so upgrading keeps today's rotation, and the restore list shows daily
  // backups only while it is on.
  const { document, errors, window } = await load("admin", width, "?instant");
  const $ = (id) => document.getElementById(id);
  const rows = () => [...$("backup-list").querySelectorAll(".list-row")].map((row) => row.firstChild.textContent);
  const save = (days) => {
    $("backup-days").value = days;
    $("backup-days").dispatchEvent(new window.Event("input"));
    $("backup-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  };
  check(`backups@${width}: daily backups kept start at 0, with the hint that 0 turns it off (${$("backup-days").closest(".field").querySelector(".hint").textContent})`,
    $("backup-days").value === "0" && $("backup-days").closest(".field").querySelector(".hint").textContent === "One backup per day for this many days, on top of the count above. 0, the default, turns it off.");
  check(`backups@${width}: with it off, the restore list has no daily backups (${rows().join(", ")})`, rows().length === 3 && !rows().some((label) => label.includes("(daily)")));
  save("7");
  check(`backups@${width}: saving 7 days lists the daily backups (${rows().length})`, rows().length === 5 && rows().filter((label) => label.includes("(daily)")).length === 2);
  save("400");
  check(`backups@${width}: a value outside 0 to 365 isn't kept, and the list stays`, rows().length === 5);
  save("0");
  check(`backups@${width}: saving 0 again hides them`, rows().length === 3);
  // Before an import or a restore replaces the library, the current one is backed up and listed first.
  const topDialog = () => [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  // Import Library…: the file input gets a library, as a browser's picker gives it.
  Object.defineProperty($("import-file"), "files", { configurable: true, value: [{ name: "library-2026-10-01.db" }] });
  $("import-file").dispatchEvent(new window.Event("change"));
  await tick();
  topDialog().querySelector("form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  button(topDialog(), "Replace").click();
  await tick();
  check(`backups@${width}: an import first backs up the current library, listed first (${rows()[0]})`,
    /^Today \d\d:\d\d \(before import\)$/.test(rows()[0]) && rows().length === 4 && !topDialog());
  button($("backup-list").querySelectorAll(".list-row")[2], "Restore").click();
  await tick();
  button(topDialog(), "Restore").click();
  await tick();
  check(`backups@${width}: so does a restore, listed above it (${rows().slice(0, 2).join(", ")})`,
    /^Today \d\d:\d\d \(before restore\)$/.test(rows()[0]) && /\(before import\)$/.test(rows()[1]) && rows().length === 5);
  check(`backups@${width}: no script errors ${errors.join("; ")}`, errors.length === 0);
}

for (const width of [1280, 390]) {
  const { document, errors, window } = await load("admin", width, "?instant");
  const $ = (id) => document.getElementById(id);
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
  };
  const topDialog = () => [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  check(`admin@${width}: no script errors on load ${errors.join("; ")}`, errors.length === 0);
  check(`admin@${width}: the header shows the logo, not the "ReelRoulette" text`, !!document.querySelector(".top-bar .brand img") && document.querySelector(".top-bar .brand").textContent.trim() === "");
  $("mock-remote").click();
  check(`admin@${width}: from another machine the token gate shows first`, !$("gate").hidden && $("admin").hidden);
  input($("gate-token"), "secret");
  $("gate-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`admin@${width}: the token opens admin`, $("gate").hidden && !$("admin").hidden);
  input($("web-port"), "80");
  check(`admin@${width}: a port below 1024 is flagged and Save held`, $("web-port").getAttribute("aria-invalid") === "true" && $("web-save").getAttribute("aria-disabled") === "true");
  input($("refresh-interval"), "2");
  check(`admin@${width}: a refresh interval below 5 is flagged`, $("refresh-interval").getAttribute("aria-invalid") === "true");
  input($("source-path"), "/media/videos");
  check(`admin@${width}: an existing source's folder is flagged`, $("source-path").getAttribute("aria-invalid") === "true");
  document.querySelector('#source-list [title="Edit source"]').click();
  // Removing a source leaves its files on disk, so its button says Remove, not Delete.
  check(`admin@${width}: Edit Source holds the name and Remove, not Delete`,
    topDialog()?.querySelector("h3")?.textContent === "Edit Source" && !!button(topDialog(), "Remove") && !button(topDialog(), "Delete"));
  button(topDialog(), "Remove")?.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: Remove asks first, with a red Remove (${topDialog()?.textContent.slice(0, 60)})`,
    topDialog()?.textContent.includes('Remove the source "Videos"?') && !!button(topDialog(), "Remove")?.classList.contains("btn-danger") && !button(topDialog(), "Delete"));
  button(topDialog(), "Cancel")?.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  topDialog().dispatchEvent(new window.Event("cancel", { cancelable: true }));
  $("dup-scan").click();
  check(`admin@${width}: a duplicate scan opens review inside admin`, !$("review").hidden && $("admin").hidden && $("review-summary").textContent.includes("Keep All"));
  document.querySelector('#review-body .dup-file input[type="radio"]').click();
  document.querySelector('#review-body .dup-file input[type="radio"]').dispatchEvent(new window.Event("change"));
  $("review-apply").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: review counts one file in the singular (${$("review-apply").textContent} / ${$("review-summary").textContent})`,
    $("review-apply").textContent === "Delete 1 File" && $("review-summary").textContent.startsWith("1 file to delete from 1 group;"));
  check(`admin@${width}: deleting asks, naming the counts (${topDialog()?.textContent.slice(0, 50)})`, topDialog()?.textContent.includes("permanently deletes") && topDialog().textContent.includes("Files to delete: 1") && !!button(topDialog(), "Delete 1 File"));
  // The confirmation opens where it can be seen: a dialog inside a hidden view leaves the page inert with nothing shown.
  check(`admin@${width}: and the confirmation shows over duplicate review, not inside the hidden admin view (${topDialog()?.parentElement?.id})`,
    !!topDialog() && !topDialog().closest("[hidden]"));
  button(topDialog(), "Delete").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: and review closes, saying what it deleted (${$("dup-state").textContent} / ${$("status").textContent})`,
    $("review").hidden && !$("admin").hidden && $("dup-state").textContent === "Deleted 1 file." && $("status").textContent === "Deleted 1 duplicate file.");
  const sourceBox = document.querySelector("#source-list input.switch");
  sourceBox.click();
  sourceBox.dispatchEvent(new window.Event("change"));
  check(`admin@${width}: a source change says every open copy of ReelRoulette follows it (${$("status").textContent})`,
    $("status").textContent === "Videos disabled. ReelRoulette updates the library everywhere it's open.");
  sourceBox.click();
  sourceBox.dispatchEvent(new window.Event("change"));
  check(`admin@${width}: one Refresh Sources button for the whole list`, !!$("sources-refresh") && !document.querySelector('#source-list [aria-label^="Refresh"]'));
  check(`admin@${width}: Export Library is a plain download, with no ellipsis`, $("export").textContent.trim().endsWith("Export Library"));
  // The control token: Save without a change saves at once; a changed token asks first, since it signs other machines out.
  $("status").textContent = "";
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: saving Control with the token unchanged asks nothing (${$("status").textContent})`, !topDialog() && $("status").textContent === "Control settings saved.");
  $("status").textContent = "";
  input($("control-token"), "new-token-1234");
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: a changed token asks first, warning other machines will be signed out (${topDialog()?.textContent.slice(0, 60)})`,
    topDialog()?.textContent.includes("Other machines will be signed out") && button(topDialog(), "Change Token")?.classList.contains("btn-danger") &&
    document.activeElement?.textContent.trim() === "Cancel" && $("status").textContent === "" && $("control-token").closest(".field").textContent.includes("Changing it signs them out."));
  button(topDialog(), "Cancel").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: Cancel saves nothing`, !topDialog() && $("status").textContent === "");
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  button(topDialog(), "Change Token").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: Change Token saves it`, !topDialog() && $("status").textContent === "Control settings saved.");
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: and saving again without a change asks nothing`, !topDialog());
  check(`admin@${width}: no approved proposal still carries a Proposed or Open note`, !/Proposed|Open:/.test(document.body.textContent));
  const clients = $("client-list").textContent;
  check(`admin@${width}: clients show their id and OS`, ["web-3f9c2e81 · Windows", "web-a71d09c4 · iOS", "web-55be2f10 · Android", "desktop-0c9e7a22 · OS not reported"].every((text) => clients.includes(text)));
  check(`admin@${width}: the Log Viewer is named so in its card and jump link`, document.querySelector("#logs h3").textContent.endsWith("Log Viewer") && document.querySelector('.admin-nav a[href="#logs"]').textContent === "Log Viewer" && !document.body.textContent.includes("Server Logs"));
  check(`admin@${width}: it has no Tail lines field and shows the newest ${$("log-rows").querySelectorAll(".log-line").length} lines, loading older ones on scroll`,
    !$("logs").textContent.includes("Tail") && $("log-rows").querySelectorAll(".log-line").length === 20 && $("log-rows").querySelector(".log-more").textContent.startsWith("Loading"));
  const logRows = $("log-rows");
  Object.defineProperty(logRows, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(logRows, "clientHeight", { configurable: true, value: 280 });
  logRows.scrollTop = 700;
  logRows.dispatchEvent(new window.Event("scroll"));
  check(`admin@${width}: scrolling to the end loads older lines (${logRows.querySelectorAll(".log-line").length})`, logRows.querySelectorAll(".log-line").length === 40);
  logRows.scrollTop = 0;
  logRows.dispatchEvent(new window.Event("scroll"));
  check(`admin@${width}: the Log Viewer's filters start collapsed, with chips, and no category filter`, $("log-filters").hidden && $("log-chips").textContent.includes("Levels: All") && !$("log-filters").textContent.includes("Category"));
  check(`admin@${width}: the sources are the lines' second brackets (${$("log-svc").textContent})`, ["server", "webui", "desktop-main-window", "desktop-update"].every((source) => $("log-svc").textContent.includes(source)));
  const rowCount = () => $("log-rows").querySelectorAll(".log-line").length;
  const allRows = rowCount();
  $("log-levels").querySelectorAll("input")[0].click();
  $("log-levels").querySelectorAll("input")[0].dispatchEvent(new window.Event("change"));
  check(`admin@${width}: unchecking info leaves only warn and error lines (${rowCount()} of ${allRows})`, rowCount() === 10);
  $("log-rows").querySelector(".log-line").click();
  check(`admin@${width}: a row expands to its full line in today's format`, /^\[2026-10-08 10:20:05\.214\] \[server\] \[error\] /.test($("log-rows").querySelector(".log-raw").textContent));
  $("mock-no-library").click();
  check(`admin@${width}: without a library the server card says why and Refresh is off`, !$("no-library").hidden && $("refresh-now").disabled);
  $("mock-no-library").click();
  check(`admin@${width}: the server card has Refresh Status`, !!$("refresh-status") && $("running-version").textContent === "0.15.0");
  $("mock-dev-run").click();
  check(`admin@${width}: a dev run says so in today's words (${$("running-version").textContent})`, $("running-version").textContent === "0.15.0 (dev run — not a Velopack install)");
  $("mock-dev-run").click();
  const counts = $("client-counts").textContent;
  check(`admin@${width}: clients show the three counts, their types and connection times, and no session id (${counts})`,
    counts.includes("API sessions: 3") && counts.includes("Control sessions: 1") && counts.includes("Event streams: 4") &&
    clients.includes("mobile-web · 192.168.1.31 · connected 09:47") && !/session/i.test(clients));
  $("mock-bad-import").click();
  check(`admin@${width}: an import shows its upload progress (${$("import-state").textContent})`, !$("import-upload").hidden && $("import-state").textContent === "Uploading notes.db: 0%");
  await new Promise((resolve) => setTimeout(resolve, 20));
  check(`admin@${width}: a file that isn't a library is rejected with a notice (${topDialog()?.textContent.slice(0, 50)})`,
    $("import-upload").hidden && topDialog()?.querySelector(".dialog-message")?.textContent === "notes.db isn't a ReelRoulette library. The library wasn't changed.");
  button(topDialog(), "OK").click();
  $("mock-short").click();
  check(`admin@${width}: a phone on its side hides the app header and keeps the admin bar`, document.body.classList.contains("short-screen") && !$("admin").hidden);
  $("mock-short").click();
  $("mock-hide-notes").click();
  const freshDisplay = (el) => {
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    el.after(copy);
    const display = window.getComputedStyle(copy).display;
    copy.remove();
    return display;
  };
  check(`admin@${width}: Hide mockup notes hides the notes and keeps the mockup bar`,
    freshDisplay(document.querySelector("#logs .mock-note")) === "none" && freshDisplay(document.querySelector(".mock-bar")) !== "none" && document.documentElement.classList.contains("hide-mock"));
  $("mock-hide-notes").click();
  check(`admin@${width}: no script errors anywhere ${errors.join("; ")}`, errors.length === 0);
}

for (const width of [1280, 390]) {
  const { document, errors, window } = await load("recovery", width);
  const $ = (id) => document.getElementById(id);
  const topDialog = () => [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  check(`recovery@${width}: no script errors on load ${errors.join("; ")}`, errors.length === 0);
  check(`recovery@${width}: titled ReelRoulette Recovery, with restart, stop, updates, and the Log Viewer`,
    document.title === "ReelRoulette Recovery" && document.querySelector("h1").textContent === "ReelRoulette Recovery" && !!$("restart") && !!$("stop") && !!$("update-check") &&
    [...document.querySelectorAll("h2")].some((h) => h.textContent === "Log Viewer") && $("tail").textContent.split("\n").length === 7);
  $("mock-remote").click();
  check(`recovery@${width}: from another machine the control token gate shows first`, !$("gate").hidden && $("recovery").hidden);
  const token = $("gate-token");
  token.value = "secret";
  token.dispatchEvent(new window.Event("input"));
  $("gate").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`recovery@${width}: the token opens it`, $("gate").hidden && !$("recovery").hidden);
  $("update-check").click();
  $("update-download").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`recovery@${width}: Download asks first, with Cancel focused`, topDialog()?.textContent.includes("Download update 0.15.1 now?") && window.document.activeElement?.textContent.trim() === "Cancel");
  [...topDialog().querySelectorAll("button")].find((b) => b.textContent.trim() === "Download").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`recovery@${width}: then offers Apply & Restart`, !$("update-apply").hidden && $("update-download").hidden);
  check(`recovery@${width}: no script errors anywhere ${errors.join("; ")}`, errors.length === 0);
}

{
  const { document, errors } = await load("desktop-notice", 1280);
  const open = document.getElementById("notice-open");
  check(`desktop-notice: the notice names ReelRoulette and its button says where it goes (${open.textContent})`,
    open.textContent === "Open ReelRoulette in your browser" && document.getElementById("notice").textContent.includes("Use ReelRoulette in your browser instead."));
  open.click();
  check(`desktop-notice: Open ReelRoulette in your browser closes the notice ${errors.join("; ")}`, document.getElementById("notice").hidden && errors.length === 0);
}

console.log(failures ? `${failures} failed` : "all passed");
for (const w of windows) await w.happyDOM.abort();
process.exit(failures ? 1 : 0);
