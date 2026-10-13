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
    states.join(" ") === "'':- 1:7x:true 1:30:- '':- favorites:true Beach days:- '':- beach:true Beach:- '':- '':- places:true");
  // An empty name disables its action without a flag; a taken name disables an action beside it and holds a dialog's Save.
  const actionState = (action) => (action.disabled ? "disabled" : action.getAttribute("aria-disabled") === "true" ? (action.classList.contains("shows-problem") ? "held" : "held-no-icon") : "available");
  const actions = pinned.map((input) => input.closest(".specimen").querySelector("[data-action]")).filter(Boolean);
  check(`validation: each action's state ${actions.map(actionState).join(" ")}`,
    actions.map(actionState).join(" ") === "disabled disabled available disabled disabled available disabled disabled disabled");
  const takenTag = pinned.find((input) => input.value === "beach");
  check("validation: a taken tag name says what it expects",
    document.getElementById(takenTag.getAttribute("aria-describedby") || "none")?.textContent === "Use a name no other tag has.");
  const emptyPreset = pinned.find((input) => input.dataset.check === "preset" && !input.value);
  const emptyPresetAction = emptyPreset.closest(".specimen").querySelector("[data-action]");
  emptyPreset.value = "x";
  emptyPreset.dispatchEvent(new window.Event("input"));
  const typedState = actionState(emptyPresetAction);
  emptyPreset.value = "";
  emptyPreset.dispatchEvent(new window.Event("input"));
  check(`validation: a typed preset name enables Add Preset, and emptying it disables it again without a flag (${typedState}, ${actionState(emptyPresetAction)})`,
    typedState === "available" && actionState(emptyPresetAction) === "disabled" && !emptyPreset.hasAttribute("aria-invalid"));
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

  const placeholders = (name) => [...document.querySelectorAll(`input[aria-label="${name} duration"]`)].map((field) => field.placeholder);
  const miniStack = document.querySelector('[data-mini="jump"] [data-min]').closest(".filter-stack");
  check(`validation: the Min and Max fields stack 10px apart (${window.getComputedStyle(miniStack).gap})`, window.getComputedStyle(miniStack).gap === "10px");
  check(`validation: empty durations say No minimum and No maximum (${placeholders("Minimum")} / ${placeholders("Maximum")})`,
    placeholders("Minimum").length === 4 && placeholders("Minimum").every((text) => text === "No minimum") && placeholders("Maximum").every((text) => text === "No maximum"));

  const pairs = [...document.querySelectorAll(".specimen[data-pair]")];
  const modes = (root) => [root.querySelector("[data-fav-mode]"), root.querySelector("[data-bl-mode]")];
  const pairStates = pairs.map((specimen) => modes(specimen).map((select) => select.getAttribute("aria-invalid") || "-").join("/"));
  check(`validation: only Favorites only with Blacklisted only is flagged (${pairStates.join(" ")})`, pairStates.join(" ") === "-/- true/true");
  const [favMode, blMode] = modes(pairs[1]);
  const pairTip = document.getElementById(favMode.getAttribute("aria-describedby") || "none");
  check("validation: both dropdowns are described by one tooltip, whose icon follows the Blacklisted dropdown",
    pairTip?.textContent === "Nothing is both a favorite and blacklisted. Use excluded for one of them." && blMode.getAttribute("aria-describedby") === pairTip.id &&
    blMode.closest(".vfield").contains(pairTip) && blMode.nextElementSibling?.classList.contains("vfield-icon"));
  blMode.value = "excluded";
  blMode.dispatchEvent(new window.Event("change"));
  check("validation: choosing excluded clears both dropdowns", !favMode.hasAttribute("aria-invalid") && !blMode.hasAttribute("aria-invalid"));
  blMode.value = "only";
  blMode.dispatchEvent(new window.Event("change"));
  const favBox = pairs[1].querySelector("[data-fav]");
  favBox.checked = false;
  favBox.dispatchEvent(new window.Event("change"));
  check("validation: turning Favorites off clears both dropdowns", !favMode.hasAttribute("aria-invalid") && !blMode.hasAttribute("aria-invalid") && favMode.disabled);

  const miniMin = mini.querySelector("[data-min]");
  miniMin.value = "2:15";
  miniMin.dispatchEvent(new window.Event("input"));
  const [miniFav, miniBl] = mini.querySelectorAll("[data-mode-box]");
  miniFav.checked = true;
  miniFav.dispatchEvent(new window.Event("change"));
  const miniBlMode = miniBl.closest(".mode-row").querySelector("select");
  miniBlMode.value = "only";
  miniBlMode.dispatchEvent(new window.Event("change"));
  check("validation: the pair holds Apply and marks General",
    jumpApply.getAttribute("aria-disabled") === "true" && mini.querySelector('[data-sub="general"]').classList.contains("has-problem") && jumpApply.title === "Change Favorites or Blacklisted to apply.");
  mini.querySelector('[data-sub="presets"]').click();
  jumpApply.click();
  check("validation: Apply held by the pair moves to the Blacklisted dropdown, applying nothing",
    mini.querySelector('[data-sub="general"]').classList.contains("is-active") && document.activeElement === miniBlMode && !jumpApply.textContent.includes("Applied"));
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
  // Notifications: what the list under the bell keeps, what popped up, and the player's indicator.
  const messages = window.mockup.notifications;
  const toastTexts = () => messages.toasts().map((toast) => toast.querySelector(".toast-text > div").textContent);
  const newest = () => messages.entries()[0]?.text || "";
  const said = (text) => newest() === text && toastTexts().includes(text);
  const test = (name) => document.querySelector(`#mock-tests [data-test="${name}"]`).click();
  const indicatorText = () => ($("player-indicator").hidden ? "" : [...$("player-indicator").childNodes].filter((node) => !node.classList?.contains("material-symbol-icon")).map((node) => node.textContent).join(""));
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
  check(`layout@${width}: before anything plays, the scrub bar is disabled and the time shows 0:00 / 0:00 (${$("time-display").textContent})`,
    $("seek").disabled && $("time-display").textContent === "0:00 / 0:00");
  const muteLit = () => $("mute-btn").classList.contains("active");
  const muteIcon = () => $("mute-btn").querySelector(".material-symbol-icon").dataset.icon;
  const mutedAtFirst = muteLit();
  $("mute-btn").click();
  check(`layout@${width}: before anything plays, Mute is enabled and shows whether sound is muted (${muteIcon()})`,
    !$("mute-btn").disabled && muteLit() === !mutedAtFirst && muteIcon() === (mutedAtFirst ? "volume_up" : "volume_off"));
  $("mute-btn").click();
  check(`layout@${width}: there is no status line, and while connected nothing shows on the player and nothing pops up`,
    !$("status") && !document.querySelector(".status") && $("player-indicator").hidden && messages.toasts().length === 0 && messages.entries().length === 0);
  const indicatorRegion = $("player-indicator").parentElement;
  check(`layout@${width}: the indicator's live region stays in the page while nothing shows, and only the box inside it hides`,
    indicatorRegion.getAttribute("role") === "status" && !indicatorRegion.hidden && !$("player-indicator").hasAttribute("role"));
  // Popups sit beside the player, which clips what it holds, and above the overlay panel, so nothing between them may
  // make a stacking context: no z-index, containment, or container on the player column or the stage.
  const rulesFor = (selector) => Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules)).filter((rule) => rule.selectorText === selector);
  const stacks = (selector) => rulesFor(selector).some((rule) => ["z-index", "contain", "container", "container-type", "container-name", "isolation"].some((name) => rule.style.getPropertyValue(name)));
  const zOf = (selector) => Number(rulesFor(selector).map((rule) => rule.style.getPropertyValue("z-index")).find(Boolean));
  check(`layout@${width}: popups sit in the player column, above the overlay panel, with no stacking context between (${zOf(".toasts")} > ${zOf(".stage.is-overlay .panel")})`,
    $("toasts").parentElement === $("media").parentElement && !stacks(".player-col") && !stacks(".stage") && zOf(".toasts") > zOf(".stage.is-overlay .panel"));
  const ruleStyle = (selector, name) => rulesFor(selector).map((rule) => rule.style.getPropertyValue(name)).find(Boolean) || "";
  check(`layout@${width}: the bell is on the player, at the top left with its controls, with no badge, and the header has none`,
    $("notify-btn").parentElement === $("overlay-controls") && $("notify-btn").classList.contains("overlay-corner-btn") && ruleStyle("#notify-btn", "left") === "12px" &&
    !document.querySelector(".top-bar .notify-btn") && $("notify-btn").getAttribute("aria-label") === "Notifications" && $("notify-btn").querySelector(".notify-badge").hidden);
  $("notify-btn").click();
  check(`layout@${width}: pressing it opens the list in the stage, so it shows in fullscreen, and starts no random pick`,
    !$("notify-list").hidden && $("notify-list").parentElement === $("stage") && !$("notify-list").querySelector(".notify-empty").hidden &&
    window.mockup.history().ids.length === 0 && !$("empty-state").hidden);
  $("notify-btn").click();
  check(`layout@${width}: and pressing it again closes it`, $("notify-list").hidden);
  const corner = [...document.querySelectorAll(".overlay-corner-btn")].map((b) => b.id).join(",");
  check(`layout@${width}: the player's corner buttons are ${corner}`, corner === "notify-btn,panel-btn,favorite-btn,blacklist-btn");
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
  $("panel-btn").click();
  $("panel-close").focus();
  $("panel-close").click();
  check(`layout@${width}: closing with focus in the panel gives focus to the panel button`, $("panel").hidden && document.activeElement === $("panel-btn"));
  $("panel-btn").click();
  $("panel-btn").blur();
  press("Escape");
  check(`layout@${width}: closing with focus outside the panel leaves focus where it was`, $("panel").hidden && document.activeElement !== $("panel-btn"));

  // A tap starts a random pick; Next picks at random at the end of the history, and both skip what can't play.
  queue.push(0);
  $("media").click();
  await tick();
  check(`layout@${width}: a tap starts a random pick, and Loading… is gone once it plays (${np()}, ${indicatorText()})`,
    np() === items[0].name && chip().includes("Playing") && $("empty-state").hidden && $("player-indicator").hidden && messages.entries().length === 0);
  queue.push(2);
  $("next-btn").click();
  check(`layout@${width}: Next at the end of the history picks at random (a photo, scrub bar disabled)`, np() === items[2].name && $("seek").disabled);
  queue.push(4, 3);
  $("next-btn").click();
  check(`layout@${width}: a random pick skips a file this browser can't play, saying so in a popup that names it (${newest()})`,
    np() === items[3].name && said("Skipped a file this browser can't play.") && messages.entries()[0].detail === items[4].name && openDialogs().length === 0);
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
  check(`layout@${width}: R picks at random and skips a missing file, saying so (${newest()})`, said("Skipped a missing file.") && np() === items[0].name);
  check(`layout@${width}: and the second skip's popup replaces the first (${toastTexts()})`, toastTexts().filter((text) => text.startsWith("Skipped")).length === 1);
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
  check(`layout@${width}: reconnecting shows on the player's indicator at every width (${indicatorText()})`,
    indicatorText() === "Reconnecting…" && $("player-indicator").dataset.state === "reconnecting" && !!$("player-indicator").querySelector(".spins"));
  // At the top, centered, it stays clear of the corner buttons on either side, the last 160 px at the right, and cuts
  // its text short with an ellipsis instead.
  check(`layout@${width}: at the top, the indicator stops short of the corner buttons, ending its text with an ellipsis (${ruleStyle(".player-indicator", "max-width")})`,
    ruleStyle(".player-indicator", "max-width") === "calc(100% - 336px)" && ruleStyle(".player-indicator-text", "text-overflow") === "ellipsis" &&
    // Its clip box reaches past its line box, so a descender isn't cut off, without making the pill taller.
    ruleStyle(".player-indicator-text", "padding-block") === "0.15em" && ruleStyle(".player-indicator-text", "margin-block") === "-0.15em" &&
    $("player-indicator").querySelector(".player-indicator-text")?.textContent === "Reconnecting…");
  // Narrower than 600 px is one class on the player column, set from its measured width, which the indicator and the
  // popups at the top both use; no container query applies a second rule.
  const playerCol = document.querySelector(".player-col");
  const narrowAt = (measured) => {
    Object.defineProperty(playerCol, "clientWidth", { configurable: true, get: () => measured });
    window.dispatchEvent(new window.Event("resize"));
    return playerCol.classList.contains("is-narrow");
  };
  const narrow = [narrowAt(599), narrowAt(600), narrowAt(1200)];
  delete playerCol.clientWidth;
  window.dispatchEvent(new window.Event("resize"));
  const containerRules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules)).filter((rule) => rule.constructor.name === "CSSContainerRule");
  check(`layout@${width}: a player narrower than 600 px, not one 600 px wide, puts the indicator below the corner buttons (${narrow})`,
    narrow.join() === "true,false,false" && ruleStyle(".player-col.is-narrow .player-indicator", "top") === "64px" &&
    !containerRules.some((rule) => rule.cssText.includes("player-indicator") || rule.cssText.includes("mock-chip")));
  press("r");
  check(`layout@${width}: a random pick then fails with a notice (${notice()})`, notice() === "Random selection failed: Couldn't reach the server.");
  dismissNotices();
  $("favorite-btn").click();
  check(`layout@${width}: and so does Favorite (${notice()})`, notice() === "Favorite update failed: Couldn't reach the server." && !$("favorite-btn").classList.contains("active"));
  $("favorite-btn").click();
  check(`layout@${width}: and a second press doesn't open the same notice again (${openDialogs().length})`, openDialogs().length === 1);
  dismissNotices();
  $("notify-btn").click();
  const nowText = () => $("notify-list").querySelector('[data-part="now"]').textContent;
  check(`layout@${width}: the bell's list shows it under Now with its full text, and keeps the notices (${nowText().slice(0, 40)})`,
    !$("notify-list").hidden && $("notify-btn").getAttribute("aria-expanded") === "true" && nowText().includes("The connection to the server was lost.") &&
    $("notify-list").textContent.includes("Favorite update failed: Couldn't reach the server.") && messages.entries()[0].kind === "error");
  press("Escape");
  check(`layout@${width}: Escape closes the list and gives focus back to the bell`, $("notify-list").hidden && document.activeElement === $("notify-btn"));
  situation("connected");
  check(`layout@${width}: when the connection comes back, the indicator goes and Reconnected. pops up (${newest()})`, said("Reconnected.") && $("player-indicator").hidden);
  situation("noanswer");
  press("r");
  check(`layout@${width}: a server that doesn't answer gives up with a notice (${notice()})`, notice() === "No response from the server. Try again.");
  dismissNotices();
  situation("nolibrary");
  openTab("library");
  check(`layout@${width}: without a library the grid shows the server's message (${gridText().slice(0, 40)})`,
    gridText().startsWith("Running without a library.") && !!$("lib-grid").querySelector(".lib-empty.is-error") && $("lib-preset").disabled && $("lib-preset").textContent === "Running without a library" &&
    ["lib-search", "lib-sort", "lib-dir"].every((id) => $(id).disabled));
  check(`layout@${width}: and the player's indicator says so (${indicatorText()})`, indicatorText() === "Running without a library" && $("player-indicator").classList.contains("is-warning"));
  press("r");
  check(`layout@${width}: and Play shows its notice, sending nothing (${notice()})`, notice() === "Cannot play: the server is running without a library.");
  dismissNotices();
  // While the server runs without a library or fails the compatibility check, the Filter and Tags tabs load nothing,
  // the Filter tab's Refresh and Apply, the Tags tab's Save, and Auto Tag do nothing, and the Tags tab's Refresh, which
  // still asks to discard changes, loads nothing, as in the app.
  const styleHidden = (el) => {
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    el.after(copy);
    const hidden = window.getComputedStyle(copy).display === "none";
    copy.remove();
    return hidden;
  };
  const checkTabsHeldBack = (why) => {
    const entriesBefore = messages.entries().length;
    openTab("filter");
    const sectionsHidden = styleHidden(document.querySelector('#filter-body > [data-subpanel="general"]'));
    $("filter-refresh").click();
    $("filter-apply").click();
    openTab("tags");
    const tagsEmpty = $("tags-body").textContent === "";
    $("tags-save").click();
    $("open-autotag").click();
    $("autotag-scan").click();
    const scanIdle = $("autotag-status").textContent === "" && $("autotag-progress").hidden;
    $("autotag-close").click();
    check(`layout@${width}: ${why}, the Filter and Tags tabs load nothing, and Refresh, Apply, Save, and an Auto Tag scan do nothing`,
      sectionsHidden && tagsEmpty && scanIdle && messages.entries().length === entriesBefore && openDialogs().length === 0);
    openTab("library");
  };
  checkTabsHeldBack("without a library");
  situation("incompatible");
  check(`layout@${width}: a failed compatibility check opens the panel and shows its message in the Library tab (${gridText()})`,
    !$("panel").hidden && gridText() === "Unsupported server API version: 2." && indicatorText() === "Server not compatible");
  check(`layout@${width}: and disables search, sort, and its direction, dimmed to half as the app has them`,
    ["lib-search", "lib-sort", "lib-dir"].every((id) => $(id).disabled && window.getComputedStyle($(id)).opacity === "0.5"));
  check(`layout@${width}: and the preset dropdown, which says so, is disabled and dimmed the same way`,
    $("lib-preset").disabled && window.getComputedStyle($("lib-preset")).opacity === "0.5");
  press("r");
  check(`layout@${width}: and Play shows its notice (${notice()})`, notice() === "Cannot play: server compatibility check failed.");
  dismissNotices();
  checkTabsHeldBack("while the server fails the compatibility check");
  situation("empty");
  check(`layout@${width}: an empty library says No media in library.`, gridText() === "No media in library.");
  const libraryLoad = (value) => document.querySelector(`input[name="mock-library-load"][value="${value}"]`).click();
  const gridAlert = () => !!$("lib-grid").querySelector('.lib-empty.is-error[role="alert"]');
  libraryLoad("failed");
  check(`layout@${width}: a failed library load shows Library load failed: and its error in the grid (${gridText()})`, gridText() === "Library load failed: HTTP 500" && gridAlert());
  libraryLoad("timeout");
  check(`layout@${width}: and a load the server or a proxy times out says the server didn't answer in time (${gridText()})`,
    gridText() === "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share." && gridAlert());
  libraryLoad("loads");
  check(`layout@${width}: and a load that works shows the grid again`, gridText() === "No media in library.");
  $("mock-kept-one").click();
  check(`layout@${width}: a refresh that keeps a source's items names its folder and count in a notice (${notice()})`,
    notice() === "Library refresh found no media files in Phone backup (/media/phone), so it kept the library's 1,204 items from there. If the folder is on a drive or share, check that it's connected.");
  dismissNotices();
  $("mock-kept-both").click();
  check(`layout@${width}: and a later refresh names only the folder it hasn't named yet (${notice()})`,
    openDialogs().length === 1 && notice().startsWith("Library refresh found no media files in Videos (/media/videos), so it kept the library's 2,316 items from there."));
  dismissNotices();
  $("mock-kept-both").click();
  check(`layout@${width}: and once every folder is named, none shows again`, openDialogs().length === 0);
  check(`layout@${width}: several folders at once share one notice (${window.mockup.keptSourcesMessage(["videos", "phone"])})`,
    window.mockup.keptSourcesMessage(["videos", "phone"]) === "Library refresh found no media files in Videos (/media/videos) and Phone backup (/media/phone), so it kept the library's 3,520 items from them. If the folders are on a drive or share, check that it's connected.");
  check(`layout@${width}: and search, sort, and its direction work again once the check passes`, ["lib-search", "lib-sort", "lib-dir"].every((id) => !$(id).disabled));
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
  const messagesBeforeApply = messages.entries().length;
  apply.click();
  check(`layout@${width}: held Apply goes to the field, keeps the panel open, and sends no message`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === min && !$("panel").hidden && messages.entries().length === messagesBeforeApply);
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
  // A dialog has the user's attention, so a problem in its field disables Save, and the field's icon says why.
  const disabledNoIcon = (el) => el.disabled && !el.classList.contains("shows-problem") && !el.hasAttribute("aria-disabled");
  check(`layout@${width}: Edit Preset flags a taken name and disables Save without an icon`,
    presetName.getAttribute("aria-invalid") === "true" && disabledNoIcon(button(presetDialog, "Save")));
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
  // A duration still being typed is an unsaved change for the dots, as in the app, though Apply's star waits.
  const appliedMin = min.value;
  input(min, "7:07");
  check(`layout@${width}: a duration being typed marks the Filter tab and the panel button, without Apply's star`,
    dot("tab-btn-filter") && dot("panel-btn") && $("filter-apply-label").textContent === "Apply");
  input(min, appliedMin);
  check(`layout@${width}: the dots go once the typed duration is the applied one again`, !dot("tab-btn-filter") && !dot("panel-btn"));
  check(`layout@${width}: valid Apply applies${overlay ? " and closes the overlay" : " and stays open"}`,
    said("Filters applied.") && $("panel").hidden === overlay);
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

  // Favorites only with Blacklisted only matches nothing: the pair is flagged and holds every action that uses it.
  openTab("filter");
  document.querySelector('[data-sub="general"]').click();
  change($("filter-fav"), true);
  change($("filter-fav-mode"), "only");
  change($("filter-bl-mode"), "only");
  const pairTip = document.getElementById($("filter-fav-mode").getAttribute("aria-describedby") || "none");
  check(`layout@${width}: Favorites only with Blacklisted only flags both dropdowns, with one icon after Blacklisted, and marks General`,
    $("filter-fav-mode").getAttribute("aria-invalid") === "true" && $("filter-bl-mode").getAttribute("aria-invalid") === "true" &&
    pairTip?.textContent === "Nothing is both a favorite and blacklisted. Use excluded for one of them." && $("filter-bl-mode").closest(".vfield").contains(pairTip) &&
    document.querySelector('.filter-tab[data-sub="general"]').classList.contains("has-problem"));
  const heldWithIcon = (id) => $(id).getAttribute("aria-disabled") === "true" && $(id).classList.contains("shows-problem");
  const disabledNoIconId = (id) => disabledNoIcon($(id));
  check(`layout@${width}: the pair holds Apply and Update Preset, and Add Preset stays disabled while its name is empty`,
    heldWithIcon("filter-apply") && heldWithIcon("filter-update-preset") && disabledNoIconId("filter-add-preset") && $("filter-update-preset").title === "Change Favorites or Blacklisted first.");
  document.querySelector('[data-sub="presets"]').click();
  const messagesBeforePair = messages.entries().length;
  $("filter-update-preset").click();
  check(`layout@${width}: held Update Preset goes to the Blacklisted dropdown and sends no message`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === $("filter-bl-mode") && messages.entries().length === messagesBeforePair);
  change($("filter-bl"), false);
  check(`layout@${width}: turning Blacklisted off clears the pair and lets Apply proceed`,
    !$("filter-fav-mode").hasAttribute("aria-invalid") && !$("filter-bl-mode").hasAttribute("aria-invalid") && !$("filter-apply").hasAttribute("aria-disabled"));
  input($("filter-min"), "1:7x");
  check(`layout@${width}: a duration that is not valid holds Update Preset too, and Add Preset stays disabled while its name is empty`,
    heldWithIcon("filter-update-preset") && disabledNoIconId("filter-add-preset") && $("filter-update-preset").title === "Correct the minimum duration first.");
  document.querySelector('[data-sub="presets"]').click();
  $("filter-new-preset").focus();
  input($("filter-new-preset"), "FAVORITES");
  const takenPresetTip = document.getElementById($("filter-new-preset").getAttribute("aria-describedby") || "none");
  check(`layout@${width}: a taken preset name is flagged and disables Add Preset without an icon, even while a duration holds it ("${takenPresetTip?.textContent}")`,
    $("filter-new-preset").getAttribute("aria-invalid") === "true" && takenPresetTip?.textContent === "Use a name no other preset has." &&
    disabledNoIconId("filter-add-preset") && document.querySelector('.filter-tab[data-sub="presets"]').classList.contains("has-problem"));
  input($("filter-new-preset"), "Unique name");
  check(`layout@${width}: with a new name, the duration holds Add Preset with its icon`, heldWithIcon("filter-add-preset") && !$("filter-add-preset").disabled);
  $("filter-add-preset").click();
  check(`layout@${width}: held Add Preset goes to the duration and adds nothing`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === $("filter-min") && $("filter-new-preset").value === "Unique name");
  input($("filter-min"), "");
  $("filter-add-preset").click();
  const addedPreset = $("filter-preset-list").lastElementChild;
  check(`layout@${width}: Add Preset adds the preset last and moves to its drag handle`,
    addedPreset?.dataset.key === "Unique name" && document.activeElement === addedPreset.querySelector(".drag-handle") && $("filter-new-preset").value === "");
  await applyFilter(false, "only", true, "excluded");

  // An empty duration field means no limit: the rows have no boxes, and the placeholders say so.
  openTab("filter");
  document.querySelector('[data-sub="general"]').click();
  const durationRows = [$("filter-min"), $("filter-max")].map((field) => field.closest(".filter-row"));
  check(`layout@${width}: the duration rows have no boxes, and their placeholders say No minimum and No maximum`,
    durationRows.every((row) => !row.querySelector('input[type="checkbox"]')) && $("filter-min").placeholder === "No minimum" && $("filter-max").placeholder === "No maximum");
  const durationStack = $("filter-min").closest(".filter-stack");
  const durationGap = window.getComputedStyle(durationStack).gap;
  check(`layout@${width}: the Min and Max fields stack 10px apart, as the WebUI's filter rows do (${durationGap})`,
    durationGap === "10px" && $("filter-max").closest(".filter-stack") === durationStack);
  input($("filter-min"), "2:00");
  $("filter-apply").click();
  await tick();
  check(`layout@${width}: a typed minimum applies, read as the Filter tab shows it after a reload (${$("lib-filters").textContent})`,
    !$("lib-filters").hidden && $("lib-filters").textContent === "Filters: Min 02:00");
  openTab("filter");
  document.querySelector('[data-sub="general"]').click();
  input($("filter-min"), "");
  check(`layout@${width}: an emptied minimum is not flagged and doesn't hold Apply`,
    !$("filter-min").hasAttribute("aria-invalid") && !$("filter-apply").hasAttribute("aria-disabled"));
  $("filter-apply").click();
  await tick();
  check(`layout@${width}: applying it empty removes the minimum`, $("lib-filters").hidden || !$("lib-filters").textContent.includes("Min"));
  openTab("library");

  // When nothing matches the search or the filters, the grid says so.
  const nothingMatches = "Nothing matches the search or filters.";
  input($("lib-search"), "no file has this name");
  await tick();
  check(`layout@${width}: a search that matches nothing says ${nothingMatches} (${gridText()})`, gridText() === nothingMatches && tiles().length === 0);
  input($("lib-search"), "");
  await tick();
  openTab("filter");
  document.querySelector('[data-sub="general"]').click();
  input($("filter-min"), "1:00:00");
  $("filter-apply").click();
  await tick();
  openTab("library");
  check(`layout@${width}: a minimum longer than every video matches nothing and says so too, and the Filters line reads it as HH:MM:SS (${$("lib-filters").textContent} | ${gridText()})`,
    gridText() === nothingMatches && tiles().length === 0 && $("lib-filters").textContent === "Filters: Min 01:00:00");
  $("lib-filters").click();
  check(`layout@${width}: clicking the Filters line opens the Filter tab`,
    !$("panel").hidden && !$("tab-filter").hidden && $("tab-library").hidden && $("tab-btn-filter").getAttribute("aria-selected") === "true");
  // The Filters line counts sources and tags, after a bold "Filters: " and separated by " · ".
  const videosSource = () => [...document.querySelectorAll('[data-subpanel="general"] label')].find((label) => label.textContent.includes("(/media/videos)")).querySelector("input");
  const filterTagButtons = (title) => [...document.querySelectorAll(`#filter-tag-categories button[title="${title}"]`)];
  const applyCounts = async (includeCount, excludeCount) => {
    openTab("filter");
    $("filter-clear").click();
    change(videosSource(), false);
    // Each click redraws the chips, so each looks its button up again; includes take the first chips, excludes the next.
    for (let i = 0; i < includeCount; i++) filterTagButtons("Include")[i].click();
    for (let i = 0; i < excludeCount; i++) filterTagButtons("Exclude")[includeCount + i].click();
    $("filter-apply").click();
    await tick();
    openTab("library");
  };
  const filtersLabel = () => $("lib-filters").firstElementChild;
  await applyCounts(1, 2);
  check(`layout@${width}: the Filters line names unchecked sources and one included tag (${$("lib-filters").textContent})`,
    $("lib-filters").textContent === "Filters: 2 of 3 sources · 1 tag · 2 tags excluded" && filtersLabel()?.tagName === "B" && filtersLabel().textContent === "Filters: ");
  await applyCounts(2, 1);
  check(`layout@${width}: and tags in the plural, with one excluded tag (${$("lib-filters").textContent})`,
    $("lib-filters").textContent === "Filters: 2 of 3 sources · 2 tags · 1 tag excluded");
  openTab("filter");
  $("filter-clear").click();
  $("filter-apply").click();
  await tick();
  check(`layout@${width}: Clear all filters then Apply hides the Filters line`, $("lib-filters").hidden);
  openTab("library");

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
  check(`layout@${width}: a browse while reconnecting keeps the loaded tiles (${newest()})`, said("Library browse failed. Showing the tiles already loaded.") && tiles().length === tileCount);
  const browseIcon = messages.toasts().find((toast) => toast.textContent.includes("Library browse failed"))?.querySelector(".material-symbol-icon").dataset.icon;
  check(`layout@${width}: its popup shows a problem icon, not the Connection kind's check (${browseIcon})`, browseIcon === "sync_problem");
  input($("lib-search"), "");
  openTab("filter");
  $("filter-apply").click();
  check(`layout@${width}: Apply while reconnecting says it couldn't save the presets (${notice()})`, notice() === "Saving presets failed: Couldn't reach the server.");
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
  // A press on the handle or Edit let go elsewhere on the header, as a drag's drop often is, has the browser click the
  // header itself.
  for (const [name, control] of [["the handle", header.querySelector(".drag-handle")], ["Edit", header.querySelector('[title="Edit category"]')]]) {
    if (!peopleGrid.hidden) header.querySelector(".tag-category-toggle").click();
    control.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    document.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, button: 0 }));
    header.click();
    check(`layout@${width}: a press on ${name} let go elsewhere on the header leaves the category collapsed`,
      peopleGrid.hidden && openDialogs().length === 0);
  }
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
  check(`layout@${width}: a taken category name is flagged and disables Save without an icon`,
    categoryName.getAttribute("aria-invalid") === "true" && disabledNoIcon(button(categoryDialog, "Save")));
  button(categoryDialog, "Delete").click();
  check(`layout@${width}: category Delete asks with today's wording`, topDialog().textContent.includes('Delete category "Places"? Tags will become Uncategorized.'));
  button(topDialog(), "Delete").click();
  await tick();
  check(`layout@${width}: confirming removes it, and Uncategorized, which gets its tags, opens`, !categoryOrder().includes("places") && openDialogs().length === 0 && !collapsedNow(tagSection("uncategorized")));
  document.querySelector('#tags-body [title="Edit tag"]').click();
  const tagDialog = topDialog();
  const name = tagDialog.querySelector("input");
  input(name, "");
  check(`layout@${width}: an emptied tag name is not flagged and disables Save`,
    !name.hasAttribute("aria-invalid") && button(tagDialog, "Save").disabled && !button(tagDialog, "Save").hasAttribute("aria-disabled"));
  const otherTagName = [...document.querySelectorAll("#tags-body .tag-chip-label")].map((label) => label.textContent).find((text) => text !== "Alice");
  input(name, otherTagName.toUpperCase());
  check(`layout@${width}: Edit Tag can take another tag's name (${otherTagName}), since the server merges them`,
    !name.hasAttribute("aria-invalid") && !button(tagDialog, "Save").disabled && !button(tagDialog, "Save").hasAttribute("aria-disabled"));
  button(tagDialog, "Delete").click();
  button(topDialog(), "Delete").click();
  await tick();
  check(`layout@${width}: Delete in Edit Tag removes the chip`, ![...document.querySelectorAll("#tags-body .tag-chip-label")].some((l) => l.textContent === "Alice"));
  $("tags-add-category").click();
  check(`layout@${width}: New Category opens as an in-app dialog`, topDialog()?.querySelector("h3")?.textContent === "New Category");
  const newCategoryDialog = topDialog();
  const newCategoryName = newCategoryDialog.querySelector("input");
  check(`layout@${width}: New Category's empty name disables Save without flagging it`,
    !newCategoryName.hasAttribute("aria-invalid") && button(newCategoryDialog, "Save").disabled && !button(newCategoryDialog, "Save").hasAttribute("aria-disabled"));
  input(newCategoryName, "PEOPLE");
  const newCategoryTip = document.getElementById(newCategoryName.getAttribute("aria-describedby") || "none");
  check(`layout@${width}: New Category flags a taken name, ignoring case, and disables Save without an icon ("${newCategoryTip?.textContent}")`,
    newCategoryName.getAttribute("aria-invalid") === "true" && newCategoryTip?.textContent === "Use a name no other category has." &&
    disabledNoIcon(button(newCategoryDialog, "Save")));
  newCategoryDialog.querySelector('button[type="submit"]').click();
  check(`layout@${width}: Save with a taken name adds nothing and keeps the dialog open`,
    topDialog() === newCategoryDialog && window.mockup.tags.filter((category) => category.name.toLowerCase() === "people").length === 1);
  input(newCategoryName, "Pets");
  topDialog().querySelector('button[type="submit"]').click();
  const pets = [...document.querySelectorAll("#tags-body .tag-category")].find((section) => section.querySelector(".tag-category-name").textContent === "Pets");
  check(`layout@${width}: a new category starts collapsed, with the dot until saved`, !!pets && collapsedNow(pets) && !pets.querySelector(".unsaved-dot").hidden);
  const newTag = $("tags-new-name");
  const chipCount = () => document.querySelectorAll("#tags-body .tag-chip").length;
  check(`layout@${width}: an empty new tag name disables Add tag without a flag, and Add tag keeps its title`,
    $("tags-add-tag").disabled && !newTag.hasAttribute("aria-invalid") && $("tags-add-tag").title === "Add tag");
  const existingTag = document.querySelector("#tags-body .tag-chip-label").textContent;
  const chipsBefore = chipCount();
  input(newTag, existingTag.toUpperCase());
  const newTagTip = document.getElementById(newTag.getAttribute("aria-describedby") || "none");
  newTag.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  check(`layout@${width}: another tag's name (${existingTag}) is flagged and disables Add tag without an icon, and Enter adds nothing ("${newTagTip?.textContent}")`,
    newTag.getAttribute("aria-invalid") === "true" && newTagTip?.textContent === "Use a name no other tag has." &&
    $("tags-add-tag").disabled && !$("tags-add-tag").classList.contains("shows-problem") && chipCount() === chipsBefore);
  input(newTag, "Zebra");
  const zebraEnabled = !$("tags-add-tag").disabled && !newTag.hasAttribute("aria-invalid");
  input(newTag, "");
  check(`layout@${width}: a new tag name enables Add tag`, zebraEnabled && $("tags-add-tag").disabled);
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
  check(`layout@${width}: after Save it follows the playing item, and the dots go (${newest()})`,
    line.hidden && !dot("tab-btn-tags") && !dot("panel-btn") && said("Tag editor changes applied"));
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
  const sereneAdd = () =>
    [...tagSection("mood").querySelectorAll(".tag-chip")].find((chip) => chip.querySelector(".tag-chip-label").textContent === "Serene")?.querySelector('[title="Add tag"]');
  check(`layout@${width}: Add tag doesn't put the new tag on the item, and moves to its chip's Add`,
    !!sereneAdd() && !sereneAdd().disabled && !sereneAdd().classList.contains("is-selected") && document.activeElement === sereneAdd());
  sereneAdd().click();
  check(`layout@${width}: one more press puts the new tag on the item`, sereneAdd().classList.contains("is-selected"));
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
    said("Tag editor changes applied") && $("autotag-apply").disabled && $("autotag-status").textContent.endsWith("0/0 selected changes."));
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
  situation("reconnecting");
  $("autotag-scan").click();
  await tick();
  check(`layout@${width}: a scan that fails says so in Auto Tag's status, not as one that found nothing (${$("autotag-status").textContent}; ${autoTagText()})`,
    $("autotag-status").textContent === "Scan failed: Couldn't reach the server." && autoTagText() === "Scan to find files whose names contain a tag's name." && $("autotag-apply").disabled && openDialogs().length === 0);
  situation("connected");
  $("autotag-close").click();

  // A photo: Play and the scrub bar work while its timer runs (Autoplay on, Loop off), and are disabled otherwise.
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const playIcon = () => $("play-btn").querySelector(".material-symbol-icon").dataset.icon;
  closePanel();
  if ($("autoplay-btn").classList.contains("active")) $("autoplay-btn").click();
  window.mockup.choose(2);
  const seek = $("seek");
  check(`layout@${width}: with Autoplay off, a photo's Play and scrub bar are disabled and the time shows 0:00 / 0:00 (${$("time-display").textContent})`,
    $("play-btn").disabled && seek.disabled && $("time-display").textContent === "0:00 / 0:00");
  // Mute and the volume slider stay enabled on a photo, and what they set there applies to the next video.
  const mutedOnPhoto = !muteLit();
  const volumeBeforePhoto = $("volume").value;
  const volumeOnPhoto = volumeBeforePhoto === "30" ? "40" : "30";
  $("mute-btn").click();
  input($("volume"), volumeOnPhoto);
  check(`layout@${width}: on a photo, Mute and the volume slider stay enabled, and Mute shows whether sound is muted (${muteIcon()})`,
    !$("mute-btn").disabled && !$("volume").disabled && muteLit() === mutedOnPhoto && muteIcon() === (mutedOnPhoto ? "volume_off" : "volume_up"));
  $("autoplay-btn").click();
  check(`layout@${width}: turning Autoplay on starts the photo's full time from then (${$("time-display").textContent})`,
    !seek.disabled && !$("play-btn").disabled && Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:05" && playIcon() === "pause");
  await sleep(600);
  check(`layout@${width}: the bar fills as the timer runs (${seek.value})`, Number(seek.value) > 0);
  // Read six times 30 ms apart, the bar has moved more often than the 250 ms interval would move it.
  const barReadings = async () => {
    const readings = [];
    for (let i = 0; i < 6; i++) {
      await sleep(30);
      readings.push(Number($("seek").value));
    }
    return readings;
  };
  const movesEachFrame = (readings) => new Set(readings).size >= 4 && readings.every((value, i) => i === 0 || value >= readings[i - 1]);
  const photoReadings = await barReadings();
  check(`layout@${width}: the bar takes any value and moves every animation frame while the photo's timer runs (${photoReadings.map((value) => value.toFixed(2)).join(", ")})`,
    seek.getAttribute("step") === "any" && movesEachFrame(photoReadings));
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
  check(`layout@${width}: with Loop on, Play and the scrub bar are disabled, and the time shows 0:00 / 0:00 (${$("time-display").textContent})`,
    $("play-btn").disabled && seek.disabled && $("time-display").textContent === "0:00 / 0:00");
  $("loop-btn").click();
  $("autoplay-btn").click();
  check(`layout@${width}: turning Autoplay off clears the timer, and Autoplay is remembered`,
    Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:00" && $("play-btn").disabled && window.localStorage.getItem("rr-mockup.autoplay") === "false");
  $("autoplay-btn").click();
  check(`layout@${width}: turning it on again starts the full time, not where the timer was (${$("time-display").textContent})`, $("time-display").textContent === "0:00 / 0:05");
  // Once the timer ends, Play and the bar are disabled, with the time at 0:00 / 0:00, while the next pick fails here.
  situation("noanswer");
  input(seek, 4.95);
  await sleep(200);
  check(`layout@${width}: once a photo's timer ends, Play and the bar are disabled and the time shows 0:00 / 0:00 until the next item plays (${chip()}, ${$("time-display").textContent}, ${notice()})`,
    $("play-btn").disabled && seek.disabled && Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:00" && chip().includes("Photo timer ended") &&
    notice() === "No response from the server. Try again.");
  dismissNotices();
  situation("connected");
  $("autoplay-btn").click();
  // Space plays or pauses a video as K does, and leaves a focused button to its own action.
  window.mockup.choose(3);
  check(`layout@${width}: the next video plays with the mute and volume set on the photo (${muteIcon()}, ${$("volume").value})`,
    muteLit() === mutedOnPhoto && $("volume").value === volumeOnPhoto);
  $("mute-btn").click();
  input($("volume"), volumeBeforePhoto);
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
  check(`layout@${width}: Settings is in sections: ${sectionNames}`, sectionNames === "Playback, Audio, Player controls, Appearance, Notifications, Panel, Keyboard shortcuts, Diagnostics");
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
  // Notifications, in place of Show the status line: popups on for every kind, at the bottom center, for 5 seconds.
  const kindBox = (kind) => document.querySelector(`input[name="set-popup-kind"][value="${kind}"]`);
  const secondsChoice = (value) => document.querySelector(`input[name="set-popup-time"][value="${value}"]`);
  check(`layout@${width}: Settings has no status line option, and Notifications follows Appearance`,
    !$("set-status") && sectionOf("set-popups") === "Notifications" && $("set-notify-section").previousElementSibling.querySelector("h3").textContent === "Appearance");
  check(`layout@${width}: popups start on for every kind, at the bottom center, in fullscreen too, for 5 seconds`,
    $("set-popups").checked && !$("set-popup-fields").disabled && ["actions", "devices", "refresh", "skips", "connection"].every((kind) => kindBox(kind).checked) &&
    $("set-popup-position").value === "bottom-center" && $("set-popup-fullscreen").checked && secondsChoice("5").checked && $("toasts").dataset.pos === "bottom-center");
  check(`layout@${width}: their settings are a collapsible group under Show popups, closed at first, like Ambient mode's`,
    $("set-popups-more").tagName === "DETAILS" && !$("set-popups-more").open && $("set-popups-more").contains($("set-popup-fields")) &&
    $("set-popups-more").querySelector("summary").textContent.endsWith("Popup settings") && !!$("set-popups-more").querySelector("summary .setting-more-chevron"));
  const entriesBeforePreview = messages.entries().length;
  change($("set-popup-position"), "top-right");
  check(`layout@${width}: a new position moves the popups and shows a sample there, which the list doesn't keep`,
    $("toasts").dataset.pos === "top-right" && toastTexts().includes("Popups show here.") && messages.entries().length === entriesBeforePreview);
  secondsChoice("3").click();
  check(`layout@${width}: so does a new time (${messages.toasts().at(-1)?.querySelector(".toast-detail")?.textContent})`,
    messages.getSettings().seconds === 3 && toastTexts().filter((text) => text === "Popups show here.").length === 1 && messages.toasts().some((toast) => toast.textContent.includes("For 3 seconds")));
  kindBox("actions").click();
  $("set-popups").blur();
  const toastsBeforeOff = messages.toasts().length;
  document.querySelector('#mock-tests [data-test="actions"]').click();
  check(`layout@${width}: with Your actions off, an action's message goes only to the list, and the bell counts it`,
    newest() === "Added to favorites" && messages.toasts().length === toastsBeforeOff && $("notify-btn").querySelector(".notify-badge").textContent === "1" &&
    !$("notify-btn").querySelector(".notify-badge").hidden && $("notify-btn").getAttribute("aria-label") === "Notifications, 1 unread");
  $("notify-btn").click();
  check(`layout@${width}: opening the list marks it, clears the count, and shows its time`,
    $("notify-btn").querySelector(".notify-badge").hidden && $("notify-list").querySelector(".notify-entry.is-unread")?.textContent.includes("Added to favorites") &&
    $("notify-list").querySelector(".notify-entry .notify-time").textContent === "Just now");
  $("notify-btn").click();
  kindBox("actions").click();
  change($("set-popups"), false);
  check(`layout@${width}: turning popups off disables their settings`, $("set-popup-fields").disabled && !messages.getSettings().popups);
  change($("set-popups"), true);
  change($("set-popup-position"), "bottom-center");
  secondsChoice("5").click();
  // Show in fullscreen off: entering fullscreen closes the popups showing, and while there messages go to the list only.
  test("actions");
  change($("set-popup-fullscreen"), false);
  $("fullscreen-btn").click();
  await tick();
  const inFullscreen = () => !!document.fullscreenElement || $("stage").classList.contains("fullscreen-pseudo");
  check(`layout@${width}: with Show in fullscreen off, entering fullscreen closes the popups showing`, inFullscreen() && messages.toasts().length === 0);
  test("devices");
  check(`layout@${width}: and a message there goes only to the list, which the bell counts`,
    newest() === "Blacklisted on another device" && messages.toasts().length === 0 && $("notify-btn").querySelector(".notify-badge").textContent === "1");
  $("fullscreen-btn").click();
  await tick();
  test("actions");
  check(`layout@${width}: out of fullscreen they pop up again`, !inFullscreen() && toastTexts().includes("Added to favorites"));
  change($("set-popup-fullscreen"), true);
  $("notify-btn").click();
  $("notify-btn").click();
  // Closing the list gives focus back to the bell, and a control with keyboard focus keeps the controls up.
  $("notify-btn").blur();
  check(`layout@${width}: and they come back as they were`, !$("set-popup-fields").disabled && kindBox("actions").checked && $("toasts").dataset.pos === "bottom-center");

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
  // Closing with focus in the panel gives it to the panel button, and a control with keyboard focus keeps the controls up.
  $("panel-btn").blur();
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
  // The bell is one of the controls, so they stay while its list is open, and the countdown starts over when it closes,
  // even by a tap, which moves no pointer over the player.
  moveOverPlayer();
  $("notify-btn").click();
  await sleep(1300);
  check(`layout@${width}: they stay, with the bell, while its list is open`, controlsUp() && !$("notify-list").hidden && !$("overlay-controls").contains(document.activeElement));
  const listClose = $("notify-list").querySelector('[data-act="close"]');
  listClose.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
  listClose.click();
  await sleep(1300);
  check(`layout@${width}: and hide again once a tap on Close closes it`, !controlsUp() && $("notify-list").hidden);
  $("notify-btn").blur();
  moveOverPlayer();
  $("play-btn").dispatchEvent(new window.PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  await sleep(1300);
  check(`layout@${width}: they stay while the mouse pointer is over them`, controlsUp());
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
  // Only a mouse or pen counts as over them, and only keyboard focus on one holds them, as :focus-visible does: a tap
  // on Play leaves focus there, and the controls still hide.
  moveOverPlayer();
  $("play-btn").dispatchEvent(new window.PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
  await sleep(1300);
  check(`layout@${width}: a touch on them doesn't count as a pointer over them`, !controlsUp());
  const tap = (el) => {
    el.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    el.focus();
    el.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
    el.click();
  };
  moveOverPlayer();
  tap($("play-btn"));
  tap($("play-btn"));
  await sleep(1300);
  check(`layout@${width}: after a tap on Play, which leaves focus on it, they still hide once the time runs out (${chip()})`,
    document.activeElement === $("play-btn") && chip().includes("Playing") && !controlsUp());
  $("play-btn").blur();
  press("Tab");
  $("play-btn").focus();
  await sleep(1300);
  check(`layout@${width}: keyboard focus on a control keeps them up`, controlsUp());
  $("play-btn").blur();
  await sleep(1300);
  check(`layout@${width}: and they hide once it leaves`, !controlsUp());
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
  const touches = (type, ys) => {
    const event = Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), {
      touches: ys.map((y) => ({ clientX: 120, clientY: y })),
      changedTouches: [{ clientX: 120, clientY: ys[0] ?? 0 }]
    });
    $("media").dispatchEvent(event);
    return event.defaultPrevented;
  };
  window.mockup.choose(2);
  const photoPrevented = wheel(-100);
  touches("touchstart", [300, 340]);
  const photoDragPrevented = touches("touchmove", [270, 310]);
  touches("touchend", []);
  check(`layout@${width}: on a photo the wheel and a two-finger drag set the volume too, a step each, and still don't scroll the page (${volumeNow()})`,
    volumeNow() === 65 && photoPrevented && photoDragPrevented);
  window.mockup.choose(3);
  check(`layout@${width}: and the next video plays at the level set on the photo (${volumeNow()})`, volumeNow() === 65);
  input($("volume"), "55");
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
  // The scrub bar, the time, and the volume slider sit the row's 12 px gap apart: neither slider keeps a browser's
  // margin, 2 px, the volume's wrapper adds none, and the time takes its own width, with its digits all one width.
  const styleOf = (el) => window.getComputedStyle(el);
  const unset = (value) => value === "" || value === "0px";
  const seekRow = document.querySelector(".overlay-seek-row");
  const timeStyle = styleOf($("time-display"));
  const wrapStyle = styleOf($("volume-wrap"));
  const sliderMargins = [$("seek"), $("volume")].map((el) => `${styleOf(el).marginLeft} ${styleOf(el).marginRight}`);
  check(`layout@${width}: the scrub bar, the time, and the volume slider sit the row's 12 px gap apart (gap ${styleOf(seekRow).gap}, slider margins ${sliderMargins.join(", ")}, time ${timeStyle.minWidth || "no minimum"} ${timeStyle.textAlign || "start"} ${timeStyle.fontVariantNumeric})`,
    [...seekRow.children].map((el) => el.id).join() === "seek,time-display,volume-wrap" && styleOf(seekRow).gap === "12px" &&
    sliderMargins.every((margins) => margins === "0px 0px") && [wrapStyle.marginLeft, wrapStyle.marginRight, wrapStyle.paddingLeft, wrapStyle.paddingRight].every(unset) &&
    timeStyle.minWidth === "" && timeStyle.textAlign === "" && timeStyle.fontVariantNumeric === "tabular-nums");
  // No rule, a phone's container query among them, gives the volume slider another width.
  const innerRules = (rules) => [...rules].flatMap((rule) => [rule, ...(rule.cssRules ? innerRules(rule.cssRules) : [])]);
  const volumeWidths = innerRules([...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]))
    .filter((rule) => rule.selectorText?.includes(".volume") && rule.style?.width).map((rule) => rule.style.width);
  check(`layout@${width}: the volume slider keeps its 84 px on every screen (${volumeWidths.join(", ")})`,
    styleOf($("volume")).width === "84px" && volumeWidths.join() === "84px");
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
  // The panel button sits on the panel's side: at the top right, or just right of the bell while the panel is on the left.
  const panelIcon = () => $("panel-btn").querySelector(".material-symbol-icon").dataset.icon;
  document.querySelector('input[name="set-side"][value="left"]').click();
  check(`layout@${width}: with the panel on the left, its button moves to the top left, just right of the bell, with the left icons (${panelIcon()})`,
    $("stage").dataset.side === "left" && panelIcon().startsWith("left_panel_") && ruleStyle('.stage[data-side="left"] #panel-btn', "left") === "64px" &&
    ruleStyle('.stage[data-side="left"] #panel-btn', "right") === "auto");
  document.querySelector('input[name="set-side"][value="right"]').click();
  check(`layout@${width}: and back at the top right with the right icons on the right (${panelIcon()})`,
    $("stage").dataset.side === "right" && panelIcon().startsWith("right_panel_") && ruleStyle("#panel-btn", "right") === "116px");

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
  const messagesBeforeVolume = messages.entries().length;
  press("[");
  check(`layout@${width}: [ lowers the volume by the step (${volumeBefore} to ${$("volume").value}), with no message`,
    Number($("volume").value) === volumeBefore - 5 && messages.entries().length === messagesBeforeVolume);
  // The elapsed time takes the total's shape, so its width never changes within an item.
  const shapes = [[0, 0, "0:00 / 0:00"], [36, 97, "0:36 / 1:37"], [587, 1392, "09:47 / 23:12"], [746, 6517, "0:12:26 / 1:48:37"], [3723, 36000, "01:02:03 / 10:00:00"]];
  const shaped = shapes.map(([elapsed, total]) => window.mockup.formatPosition?.(elapsed, total));
  check(`layout@${width}: the elapsed time takes the total's shape, with hours only when the total has them (${shaped.join(", ")})`,
    shaped.every((text, i) => text === shapes[i][2]));
  const longVideo = items.findIndex((item) => item.type === "video" && playable(item) && item.duration >= 600);
  window.mockup.choose(longVideo);
  const [startShown, lengthShown] = $("time-display").textContent.split(" / ");
  check(`layout@${width}: a video of ten minutes or more starts at 00:00, as wide as its length (${$("time-display").textContent})`,
    longVideo >= 0 && startShown === "00:00" && startShown.length === lengthShown.length);
  // From an hour, every duration shows hours: the seek row's, the header's, and the Stats tab's. No item runs an hour,
  // so one does for a moment.
  const lengthBefore = items[longVideo].duration;
  items[longVideo].duration = 6517;
  window.mockup.choose(longVideo);
  const statsDuration = [...$("stats-body").querySelectorAll("dt")].find((el) => el.textContent === "Duration")?.nextElementSibling.textContent;
  check(`layout@${width}: an hour-long video shows hours in the seek row, the header, and the Stats tab (${$("time-display").textContent}, ${$("np-duration").textContent}, ${statsDuration})`,
    $("time-display").textContent === "0:00:00 / 1:48:37" && $("np-duration").textContent === "1:48:37" && statsDuration === "1:48:37");
  items[longVideo].duration = lengthBefore;
  // Frame stepping on comma and period, only while a video is paused.
  window.mockup.choose(3);
  const videoReadings = await barReadings();
  check(`layout@${width}: the bar moves every animation frame while a video plays (${videoReadings.map((value) => value.toFixed(2)).join(", ")})`, movesEachFrame(videoReadings));
  $("play-btn").click();
  const pausedReadings = await barReadings();
  check(`layout@${width}: and stops while it is paused (${pausedReadings.map((value) => value.toFixed(2)).join(", ")})`, new Set(pausedReadings).size === 1);
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
  check(`layout@${width}: Save applies the changes to every selected item (${newest()})`,
    pair.every((id) => items[id].tags.has(none.key) && !items[id].tags.has(one.key)) && said("Updated tags on 2 items.") &&
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
  check(`layout@${width}: the items leave the grid (${newest()})`, !tiles().some((t) => t.getAttribute("aria-label") === removedName) && said("Removed 2 items from the library."));
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
  // While the server asks for pairing, every request answers 401, which shows only the prompt: nothing in place, no
  // notice. happy-dom keeps an element's computed style after a class changes, so a fresh copy is measured.
  const hiddenByStyle = (el) => {
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    el.after(copy);
    const hidden = window.getComputedStyle(copy).display === "none";
    copy.remove();
    return hidden;
  };
  const presetLabel = () => $("lib-preset").selectedOptions[0]?.textContent;
  openTab("library");
  check(`layout@${width}: while the server asks for pairing, the grid shows nothing and the presets stay on Loading... (${gridText()}; ${presetLabel()})`,
    tiles().length === 0 && gridText() === "" && presetLabel() === "Loading..." && $("lib-preset").disabled);
  while (window.mockup.history().index < window.mockup.history().ids.length - 1) $("next-btn").click();
  const unpairedHistory = window.mockup.history().ids.join();
  const unpairedFavorite = items.find((item) => item.name === np())?.favorite;
  $("next-btn").click();
  await tick();
  $("favorite-btn").click();
  check(`layout@${width}: and a random pick or a favorite shows no notice and changes nothing`,
    openDialogs().length === 0 && window.mockup.history().ids.join() === unpairedHistory && items.find((item) => item.name === np())?.favorite === unpairedFavorite);
  openTab("tags");
  openTab("filter");
  check(`layout@${width}: and the Tags tab shows no tags and the Filter tab's sections nothing`,
    $("tags-body").textContent === "" && hiddenByStyle(document.querySelector('#filter-body > [data-subpanel="general"]')));
  $("filter-refresh").click();
  $("filter-apply").click();
  check(`layout@${width}: and the Filter tab's Refresh and Apply show no notice`, openDialogs().length === 0);
  $("open-autotag").click();
  $("autotag-scan").click();
  await tick();
  check(`layout@${width}: and an Auto Tag scan leaves its status empty and its results as before any scan (${$("autotag-status").textContent})`,
    $("autotag-status").textContent === "" && $("autotag-results").querySelector(".autotag-empty")?.textContent === "Scan to find files whose names contain a tag's name." && openDialogs().length === 0);
  $("autotag-close").click();
  openTab("library");
  input($("pair-token"), "x");
  input($("pair-token"), "");
  check(`layout@${width}: an emptied pairing token is not flagged and disables Pair`, !$("pair-token").hasAttribute("aria-invalid") && $("pair-btn").disabled);
  input($("pair-token"), "wrong");
  $("pair").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`layout@${width}: a wrong token says Pairing failed. and keeps the prompt`, notice() === "Pairing failed." && !$("pair").hidden);
  dismissNotices();
  situation("reconnecting");
  input($("pair-token"), "abc123");
  $("pair").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`layout@${width}: pairing while the server is stopped says it couldn't reach the server (${notice()})`, notice() === "Pairing failed: Couldn't reach the server." && !$("pair").hidden);
  dismissNotices();
  situation("connected");
  input($("pair-token"), "abc123");
  $("pair").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`layout@${width}: Pair hides the prompt`, $("pair").hidden && said("Paired.") && !document.body.classList.contains("pairing"));
  check(`layout@${width}: and once paired the grid, the presets, and the tags load (${tiles().length} tiles; ${presetLabel()})`,
    tiles().length > 0 && presetLabel() !== "Loading..." && $("tags-body").textContent !== "" && !hiddenByStyle(document.querySelector('#filter-body > [data-subpanel="general"]')));
  $("mock-ios-volume").click();
  check(`layout@${width}: with the gain stage running, a read-only volume, as on iOS, keeps its slider`, !$("volume-wrap").hidden && standIn.gains.length === 1);
  // Library controls collapse, and the preset and randomization dropdowns share a row.
  openTab("library");
  check(`layout@${width}: preset and randomization sit in one row`, $("lib-preset").parentElement === $("lib-mode").parentElement && $("lib-preset").parentElement.classList.contains("lib-pair"));
  const libraryOrder = [...$("lib-controls").querySelectorAll("select, button, input")].map((el) => el.id).join(",");
  check(`layout@${width}: the Library tab's controls are preset, randomization, sort with its direction, then search, after the Filters line (${libraryOrder})`,
    libraryOrder === "lib-preset,lib-mode,lib-sort,lib-dir,lib-search" &&
    !!($("lib-filters").compareDocumentPosition($("lib-controls")) & window.Node.DOCUMENT_POSITION_FOLLOWING));
  check(`layout@${width}: the header has no preset or randomization dropdown`,
    !document.querySelector(".top-bar select") && !document.querySelector('.top-bar [aria-label="Choose preset"], .top-bar [aria-label="Choose randomization mode"]'));
  const collapseSays = (title, label, expanded) =>
    $("lib-collapse").title === title && $("lib-collapse").getAttribute("aria-label") === label && $("lib-collapse").getAttribute("aria-expanded") === expanded;
  check(`layout@${width}: while open, the collapse button says Hide controls & filters (${$("lib-collapse").title}, ${$("lib-collapse").getAttribute("aria-label")})`,
    !$("lib-controls").classList.contains("is-collapsed") && collapseSays("Hide controls & filters", "Hide library controls and filters", "true"));
  $("lib-collapse").click();
  check(`layout@${width}: the controls and the Filters line collapse, stay collapsed on this device, and say so (${$("lib-collapse").title}, ${$("lib-collapse").getAttribute("aria-label")})`,
    $("lib-controls").classList.contains("is-collapsed") && $("lib-filters").classList.contains("is-collapsed") && window.localStorage.getItem("rr-mockup.libCollapsed") === "true" &&
    collapseSays("Show controls & filters", "Show library controls and filters", "false"));
  $("lib-collapse").click();
  // A phone on its side: the header hides, the panel opens as the overlay, and the player's indicator still shows.
  $("mock-short").click();
  check(`layout@${width}: a short touch screen gets the full-screen player layout and the overlay`, document.body.classList.contains("short-screen") && $("stage").classList.contains("is-overlay"));
  situation("reconnecting");
  check(`layout@${width}: there the player shows the reconnecting indicator`, indicatorText() === "Reconnecting…");
  $("mock-pairing").click();
  check(`layout@${width}: but not while the server asks for pairing, whose prompt shows instead`, $("player-indicator").hidden);
  $("mock-pairing").click();
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
  // The page's height follows the browser's toolbars in a tab and is the whole screen in an installed app. happy-dom
  // drops `dvh` and `lvh` and its display mode is always `browser`, so the check reads the rules' text.
  const installed = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) => rule.media?.mediaText.includes("display-mode: standalone"))
    .flatMap((rule) => Array.from(rule.cssRules));
  const installedRule = (selector) => installed.find((rule) => rule.selectorText === selector);
  check(`layout@${width}: the page's height is the dynamic viewport in a tab and the large one in an installed app, with pseudo-fullscreen`,
    window.getComputedStyle(document.documentElement).getPropertyValue("--page-height") === "100dvh" &&
      installedRule(":root")?.style.getPropertyValue("--page-height") === "100lvh" &&
      installedRule(".stage.fullscreen-pseudo")?.style.height === "var(--page-height)");
  // A phone on its side hides the header, and shows it while the server asks for pairing.
  const topBar = document.querySelector(".top-bar");
  $("mock-short").click();
  check(`layout@${width}: a phone on its side hides the header`, !displayed(topBar));
  $("mock-pairing").click();
  check(`layout@${width}: there the header shows while the server asks for pairing`, displayed(topBar) && !$("pair").hidden);
  $("mock-pairing").click();
  $("mock-short").click();
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
  check(`layout@${width}: a favorite from another device pops up, naming the file (${newest()})`,
    /^(Added to|Removed from) favorites on another device$/.test(newest()) && toastTexts().includes(newest()) && !!messages.entries()[0].detail && messages.entries()[0].kind === "devices");

  // Lasting states: the Mockup tab starts and ends each, and the indicator shows the first in its order.
  const lastingBox = (id) => $("mock-lasting").querySelector(`input[value="${id}"]`);
  const toggleLasting = (id, on) => change(lastingBox(id), on);
  toggleLasting("refresh", true);
  check(`layout@${width}: a library refresh shows its stage and progress, only while the controls show (${indicatorText()})`,
    indicatorText() === "Library refresh: Starting (0%)" && $("player-indicator").classList.contains("follows-controls") && lastingBox("refresh").checked);
  check(`layout@${width}: and each stage reads by its label (${window.mockup.refreshStages})`,
    window.mockup.refreshStages.join() === "Starting,Refreshing sources,Sorting names,Fingerprinting files,Scanning durations,Scanning loudness,Generating thumbnails");
  toggleLasting("loading", true);
  await tick();
  check(`layout@${width}: Loading… comes before a refresh (${indicatorText()})`, indicatorText() === "Loading…" && lastingBox("loading").checked);
  toggleLasting("reconnecting", true);
  check(`layout@${width}: and Reconnecting… before both, which the Server choice follows (${indicatorText()})`,
    indicatorText() === "Reconnecting…" && document.querySelector('input[name="mock-situation"][value="reconnecting"]').checked);
  $("notify-btn").click();
  const nowRows = () => [...$("notify-list").querySelectorAll('[data-part="now"] .notify-entry')].map((row) => row.querySelector(".notify-text").textContent);
  check(`layout@${width}: the list shows all three under Now, in order (${nowRows()})`,
    nowRows().length === 3 && nowRows()[0] === "Reconnecting…" && nowRows()[1] === "Loading…" && nowRows()[2].startsWith("Library refresh:"));
  $("notify-btn").click();
  toggleLasting("reconnecting", false);
  toggleLasting("loading", false);
  check(`layout@${width}: ending them leaves the refresh (${indicatorText()})`, indicatorText().startsWith("Library refresh:") && !lastingBox("loading").checked && !lastingBox("reconnecting").checked);
  toggleLasting("refresh", false);
  check(`layout@${width}: unchecking a library refresh finishes it, with its result in a popup (${newest()})`,
    said("Library refresh finished") && messages.entries()[0].detail.startsWith("Source: no changes · Fingerprint:") && $("player-indicator").hidden && !lastingBox("refresh").checked);
  toggleLasting("incompatible", true);
  check(`layout@${width}: a failed compatibility check is a lasting state too (${indicatorText()})`, indicatorText() === "Server not compatible");
  toggleLasting("incompatible", false);
  check(`layout@${width}: and unchecking it reconnects as normal`, $("player-indicator").hidden && document.querySelector('input[name="mock-situation"][value="connected"]').checked);

  // Loading… counts its half second once, from the first hold until every hold ends, so a pick and its media load are
  // one loading period: a 350 ms pick and a 300 ms load show it from half a second in until the media loads.
  window.mockup.hooks.instant = false;
  queue.push(0);
  press("r");
  await sleep(575);
  const loadingMidway = indicatorText();
  await sleep(300);
  window.mockup.hooks.instant = true;
  check(`layout@${width}: Loading… shows half a second into a pick and its media load (${loadingMidway}), and goes once the media loads`,
    loadingMidway === "Loading…" && $("player-indicator").hidden && np() === items[0].name);

  // Test notifications: a warning stays, a notice goes to the list, at most three show, and Dismiss closes one.
  test("refresh-failed");
  const warning = messages.toasts().find((toast) => toast.classList.contains("is-warning"));
  check(`layout@${width}: a failed refresh is a warning that stays until it's closed (${newest()})`,
    said("Library refresh failed") && !!warning && warning.remaining === 0 && !toastTexts().includes("Library refresh finished"));
  test("notice");
  check(`layout@${width}: an error shows in the dialog, not a popup, and the list keeps it (${notice()})`,
    notice() === "Saving presets failed (500)." && newest() === "Saving presets failed (500)." && !toastTexts().includes("Saving presets failed (500)."));
  dismissNotices();
  test("burst");
  check(`layout@${width}: four at once show three, newest last, and the cap closes the oldest that isn't a warning (${toastTexts()})`,
    messages.toasts().length === 3 && toastTexts()[0] === "Library refresh failed" && toastTexts().at(-1) === "Path copied.");
  // While three warnings show, a new popup goes to the list only, and the bell counts it.
  ["Second", "Third"].forEach((which) => messages.notify({ kind: "refresh", level: "warning", text: `${which} warning`, key: `warning-${which}` }));
  const unreadBeforeWarnings = messages.unread();
  test("actions");
  check(`layout@${width}: while three warnings show, a new popup goes to the list only, and the bell counts it (${toastTexts()})`,
    messages.toasts().length === 3 && messages.toasts().every((toast) => toast.classList.contains("is-warning")) && newest() === "Added to favorites" &&
    !toastTexts().includes("Added to favorites") && messages.unread() === unreadBeforeWarnings + 1);
  const shownBefore = messages.toasts().length;
  messages.toasts()[0].querySelector('[aria-label="Dismiss"]').click();
  await tick();
  check(`layout@${width}: Dismiss closes a popup`, messages.toasts().length < shownBefore);
  messages.dismissAll();
  // Pointing at a popup pauses its time, and a second pause, such as keyboard focus on its Dismiss while the mouse is
  // over it, takes nothing more off. A pen points as a mouse does.
  test("actions");
  const paused = messages.toasts().at(-1);
  paused.dispatchEvent(new window.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await sleep(400);
  paused.querySelector('[aria-label="Dismiss"]').focus();
  check(`layout@${width}: pointing at a popup and then focusing it keeps its time (${paused.remaining} of 5000 ms)`, paused.remaining > 4900);
  paused.querySelector('[aria-label="Dismiss"]').blur();
  paused.dispatchEvent(new window.PointerEvent("pointerleave", { pointerType: "mouse" }));
  messages.dismissAll();
  test("actions");
  const penned = messages.toasts().at(-1);
  penned.dispatchEvent(new window.PointerEvent("pointerenter", { pointerType: "pen" }));
  check(`layout@${width}: a pen pointing at a popup pauses it too`, penned.hover === true);
  messages.dismissAll();
  // While the list is open nothing pops up, and a popup showing with a new message's key closes, since it would now be
  // out of date: the list shows the new message.
  test("refresh-failed");
  $("notify-btn").click();
  test("refresh");
  check(`layout@${width}: while the list is open, a new message closes the popup with its key (${toastTexts()})`,
    !toastTexts().includes("Library refresh failed") && !toastTexts().includes("Library refresh finished") && newest() === "Library refresh finished");
  $("notify-btn").click();
  $("notify-btn").blur();
  messages.dismissAll();
  $("notify-btn").click();
  $("notify-list").querySelector('[data-act="settings"]').click();
  check(`layout@${width}: the list's Notification settings opens the Settings tab at Show popups, with its settings expanded`,
    $("notify-list").hidden && !$("tab-settings").hidden && document.activeElement === $("set-popups") && $("set-popups-more").open);
  $("set-popups-more").open = false;
  closePanel();
  $("notify-btn").click();
  $("notify-list").querySelector('[data-act="clear"]').click();
  check(`layout@${width}: Clear empties the list`, messages.entries().length === 0 && !$("notify-list").querySelector(".notify-empty").hidden && $("notify-list").querySelector('[data-act="clear"]').disabled);
  press("p");
  check(`layout@${width}: opening the panel closes the list${width < 800 ? ", and the overlay panel stops popups making room for the controls" : ""}`,
    $("notify-list").hidden && !$("panel").hidden && $("stage").classList.contains("covers-player") === width < 800);
  closePanel();
  check(`layout@${width}: closing it lets them make room again`, !$("stage").classList.contains("covers-player"));
  // A swipe to either side on a touch screen closes a popup, and a short one leaves it.
  const swipe = (toast, dx) => {
    toast.dispatchEvent(new window.PointerEvent("pointerdown", { pointerType: "touch", clientX: 100, bubbles: true }));
    window.dispatchEvent(new window.PointerEvent("pointermove", { pointerType: "touch", clientX: 100 + dx }));
    window.dispatchEvent(new window.PointerEvent("pointerup", { pointerType: "touch", clientX: 100 + dx }));
  };
  test("actions");
  const swiped = messages.toasts().at(-1);
  swipe(swiped, 30);
  await tick();
  const keptAfterShortSwipe = messages.toasts().includes(swiped);
  swipe(swiped, -80);
  await tick();
  check(`layout@${width}: a swipe past 64 px to either side closes a popup, and a short one leaves it`, keptAfterShortSwipe && !messages.toasts().includes(swiped));
  // At the top, popups start below the bar of corner buttons, and on a player narrower than 600 px below the indicator;
  // at the bottom, they rise above the player's controls while those show.
  check(`layout@${width}: popups at the top start at 64 px, or 104 px on a narrow player, and at the bottom rise to 112 px above the controls`,
    ruleStyle('.toasts[data-pos^="top"]', "top") === "64px" && ruleStyle('.player-col.is-narrow .toasts[data-pos^="top"]', "top") === "104px" &&
    ruleStyle('.stage:not(.covers-player) .media-container.controls-visible ~ .toasts[data-pos^="bottom"]', "bottom") === "112px");
  // The list closes on its Close and on the bell, giving focus back to the bell, and on a press outside it, leaving
  // focus alone.
  $("notify-btn").click();
  $("notify-list").querySelector('[data-act="close"]').click();
  const focusAfterClose = document.activeElement === $("notify-btn");
  $("notify-btn").click();
  $("notify-btn").click();
  const focusAfterBell = document.activeElement === $("notify-btn");
  $("notify-btn").click();
  document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  check(`layout@${width}: the list closes on Close and the bell, giving focus back to the bell, and on a press outside it, leaving focus alone`,
    focusAfterClose && focusAfterBell && $("notify-list").hidden && document.activeElement !== $("notify-btn"));
  // The list keeps the last 50 messages.
  for (let i = 0; i < 55; i++) messages.notify({ kind: "actions", text: `Message ${i}`, key: `kept-${i}` });
  check(`layout@${width}: the list keeps the last 50 messages, newest first (${messages.entries().length})`,
    messages.entries().length === 50 && newest() === "Message 54" && messages.entries().at(-1).text === "Message 5");
  messages.dismissAll();
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
  const adminMessages = window.mockup.notifications;
  const adminNewest = () => adminMessages.entries()[0]?.text || "";
  const adminSaid = (text) => adminNewest() === text && adminMessages.toasts().some((toast) => toast.textContent.includes(text));
  check(`admin@${width}: there is no status line, and the bell is at the end of the admin bar, which stays on a phone on its side, not in the header`,
    !$("status") && !document.querySelector(".status") && $("notify-btn")?.parentElement === document.querySelector("#admin .admin-bar") &&
    $("notify-btn") === document.querySelector("#admin .admin-bar").lastElementChild && !document.querySelector(".top-bar .notify-btn") && !!$("toasts"));
  const rows = () => [...$("backup-list").querySelectorAll(".list-row")].map((row) => row.firstChild.textContent);
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
  };
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
  const remap = topDialog().querySelector("#remap-0");
  input(remap, "media/videos");
  const importButton = button(topDialog(), "Import");
  check(`backups@${width}: a remap path that is not valid is flagged and disables Import without an icon`,
    remap.getAttribute("aria-invalid") === "true" && importButton.disabled && !importButton.classList.contains("shows-problem") && !importButton.hasAttribute("aria-disabled"));
  input(remap, "/media/videos");
  check(`backups@${width}: correcting it enables Import`, !remap.hasAttribute("aria-invalid") && !importButton.disabled);
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
  const adminMessages = window.mockup.notifications;
  const adminNewest = () => adminMessages.entries()[0]?.text || "";
  const adminSaid = (text) => adminNewest() === text && adminMessages.toasts().some((toast) => toast.textContent.includes(text));
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
  const disabledNoIcon = (el) => el.disabled && !el.classList.contains("shows-problem") && !el.hasAttribute("aria-disabled");
  check(`admin@${width}: an empty source path is not flagged and disables Add Source`, !$("source-path").hasAttribute("aria-invalid") && disabledNoIcon($("source-add-btn")));
  input($("source-path"), "/media/videos");
  check(`admin@${width}: an existing source's folder is flagged and disables Add Source without an icon`,
    $("source-path").getAttribute("aria-invalid") === "true" && disabledNoIcon($("source-add-btn")));
  input($("source-path"), "media/new");
  check(`admin@${width}: so does a path that isn't a full path`, $("source-path").getAttribute("aria-invalid") === "true" && disabledNoIcon($("source-add-btn")));
  input($("source-path"), "/media/new");
  check(`admin@${width}: a new folder enables Add Source`, !$("source-path").hasAttribute("aria-invalid") && !$("source-add-btn").disabled);
  input($("source-path"), "");
  document.querySelector('#source-list [title="Edit source"]').click();
  const sourceName = topDialog().querySelector("input");
  input(sourceName, "phone BACKUP");
  check(`admin@${width}: Edit Source flags another source's name and disables Save without an icon`,
    sourceName.getAttribute("aria-invalid") === "true" && disabledNoIcon(button(topDialog(), "Save")));
  input(sourceName, "");
  check(`admin@${width}: an emptied source name is not flagged and disables Save`, !sourceName.hasAttribute("aria-invalid") && disabledNoIcon(button(topDialog(), "Save")));
  input(sourceName, "Videos");
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
  check(`admin@${width}: and review closes, saying what it deleted (${$("dup-state").textContent} / ${adminNewest()})`,
    $("review").hidden && !$("admin").hidden && $("dup-state").textContent === "Deleted 1 file." && adminSaid("Deleted 1 duplicate file."));
  const sourceBox = document.querySelector("#source-list input.switch");
  sourceBox.click();
  sourceBox.dispatchEvent(new window.Event("change"));
  check(`admin@${width}: a source change says every open copy of ReelRoulette follows it (${adminNewest()})`,
    adminSaid("Videos disabled. ReelRoulette updates the library everywhere it's open."));
  sourceBox.click();
  sourceBox.dispatchEvent(new window.Event("change"));
  check(`admin@${width}: one Refresh Sources button for the whole list`, !!$("sources-refresh") && !document.querySelector('#source-list [aria-label^="Refresh"]'));
  check(`admin@${width}: Export Library is a plain download, with no ellipsis`, $("export").textContent.trim().endsWith("Export Library"));
  // The control token: Save without a change saves at once; a changed token asks first, since it signs other machines out.
  let adminCount = adminMessages.entries().length;
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: saving Control with the token unchanged asks nothing (${adminNewest()})`, !topDialog() && adminSaid("Control settings saved."));
  adminCount = adminMessages.entries().length;
  input($("control-token"), "new-token-1234");
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: a changed token asks first, warning other machines will be signed out (${topDialog()?.textContent.slice(0, 60)})`,
    topDialog()?.textContent.includes("Other machines will be signed out") && button(topDialog(), "Change Token")?.classList.contains("btn-danger") &&
    document.activeElement?.textContent.trim() === "Cancel" && adminMessages.entries().length === adminCount && $("control-token").closest(".field").textContent.includes("Changing it signs them out."));
  button(topDialog(), "Cancel").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: Cancel saves nothing`, !topDialog() && adminMessages.entries().length === adminCount);
  $("control-save").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  button(topDialog(), "Change Token").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: Change Token saves it`, !topDialog() && adminSaid("Control settings saved.") && adminMessages.entries().length === adminCount + 1);
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
