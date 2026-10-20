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

// Every red badge on a page, on a held action or a Filter section's tab, is the fields' outlined icon at 18 px on its
// button's top-right corner, out of the button's flow, so the button keeps its width when it shows. Returns how many
// there are, or 0 when one isn't.
function cornerBadges(window) {
  const badges = [...window.document.querySelectorAll(".btn-problem, .filter-tab .tab-problem")];
  const onCorner = (badge) => {
    const style = window.getComputedStyle(badge);
    return window.getComputedStyle(badge.parentElement).position === "relative" && style.position === "absolute" && style.top === "-6px" &&
      style.right === "-6px" && style.fontSize === "18px" && style.fontFamily.includes("Material Symbols Outlined");
  };
  return badges.every(onCorner) ? badges.length : 0;
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
for (const name of ["index", "validation", "recovery", "layout", "admin"]) {
  const { document, errors } = await load(name, 1280);
  check(`${name}: no script errors ${errors.join("; ")}`, errors.length === 0);
  check(`${name}: the page icon is logo-icon.svg`, document.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute("href") === logoIcon);
  if (name === "recovery") check("recovery: the title shows the icon", document.querySelector("h1 img")?.getAttribute("src") === logoIcon && document.querySelector("h1").textContent === "ReelRoulette Recovery");
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
  // Add Preset is an icon button, so its examples' notes name it by its accessible name, and pressing one marks its note
  // rather than its icon, so the button keeps its size.
  const presetSpecimens = pinned.filter((input) => input.dataset.check === "preset").map((input) => input.closest(".specimen"));
  const lastNoteLine = (specimen) => specimen.querySelector(".attrs").textContent.split("\n").pop();
  check(`validation: the Add Preset examples' notes name it Add preset (${presetSpecimens.map(lastNoteLine).join(", ")})`,
    presetSpecimens.map(lastNoteLine).join(", ") === "Add preset: disabled, Add preset: disabled, Add preset: available");
  const availableAdd = presetSpecimens[2].querySelector("[data-action]");
  const addIcon = availableAdd.querySelector(".btn-label");
  const addIconText = addIcon.textContent;
  availableAdd.click();
  check(`validation: pressing an available Add Preset example marks its note and leaves its icon as it was (${lastNoteLine(presetSpecimens[2])})`,
    addIcon.dataset.icon === "add" && addIcon.textContent === addIconText && lastNoteLine(presetSpecimens[2]) === "Add preset: available ✓");
  const typed = pinned[0];
  typed.value = "12:x";
  typed.dispatchEvent(new window.Event("input"));
  const tip = document.getElementById(typed.getAttribute("aria-describedby") || "none");
  check("validation: typing a bad duration flags it and describes it", typed.getAttribute("aria-invalid") === "true" && tip?.textContent === "Use MM:SS, HH:MM:SS, or seconds.");
  typed.value = "12:07";
  typed.dispatchEvent(new window.Event("input"));
  check("validation: correcting it clears aria-invalid and the description", !typed.hasAttribute("aria-invalid") && !typed.hasAttribute("aria-describedby"));
  const [jumpApply, other] = document.querySelectorAll("[data-apply]");
  // Apply, the one held action with a dot, turns its dot red in place of the badge.
  const errorColor = window.getComputedStyle(document.documentElement).getPropertyValue("--error").trim();
  const jumpDotColor = () => window.getComputedStyle(jumpApply.querySelector(".unsaved-dot")).backgroundColor;
  check(`validation: one Apply, aria-disabled with its dot red and no badge (${jumpDotColor()}, ${errorColor})`,
    !other && jumpApply.getAttribute("aria-disabled") === "true" && jumpApply.classList.contains("shows-problem") && !jumpApply.disabled &&
    !!errorColor && jumpDotColor() === errorColor && !jumpApply.querySelector(".btn-problem"));
  const mini = document.querySelector('[data-mini="jump"]');
  mini.querySelector('[data-sub="tags"]').click();
  jumpApply.click();
  check("validation: Apply switches to General and focuses the field, applying nothing",
    mini.querySelector('[data-sub="general"]').classList.contains("is-active") && document.activeElement === mini.querySelector("[data-min]") && jumpApply.classList.contains("has-pending") && !jumpApply.disabled);

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
    mini.querySelector('[data-sub="general"]').classList.contains("is-active") && document.activeElement === miniBlMode && jumpApply.classList.contains("has-pending") && !jumpApply.disabled);
  // A setting's field saves only on Enter or when it is left, and then shows the value saved. A save that changes the
  // value shows the green check in the red icon's place and says "Saved"; going back from a value that is not valid,
  // or a save that leaves the value as it was, shows neither.
  const setting = document.getElementById("spec-advance");
  const inUse = () => document.querySelector("[data-setting-out]").textContent;
  const settingWrap = setting.closest(".vfield");
  // The check is the font's glyph, one character, not its name as text.
  const shownAsGlyph = (icon) => icon?.dataset.icon === "check_circle" && icon.textContent.length === 1;
  const savedShown = () => settingWrap.classList.contains("is-saved") && shownAsGlyph(settingWrap.querySelector(".vfield-saved"));
  const savedSaid = () => settingWrap.querySelector('[aria-live="polite"]')?.textContent ?? null;
  const typeSetting = (value) => {
    setting.value = value;
    setting.dispatchEvent(new window.Event("input"));
  };
  const enterSetting = () => setting.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  setting.focus();
  typeSetting("");
  check("validation: an emptied setting's field is flagged, and the value in use stays", setting.getAttribute("aria-invalid") === "true" && inUse() === "In use: 10 seconds");
  setting.blur();
  check("validation: leaving it shows the value saved again, unflagged, with no check", setting.value === "10" && !setting.hasAttribute("aria-invalid") && !savedShown() && savedSaid() === "");
  setting.focus();
  typeSetting("120");
  await new Promise((resolve) => setTimeout(resolve, 750));
  check("validation: a setting's field saves nothing while it is typed, however long typing pauses", inUse() === "In use: 10 seconds" && !savedShown());
  enterSetting();
  check('validation: and saves on Enter, showing the green check and saying "Saved"', inUse() === "In use: 120 seconds" && savedShown() && savedSaid() === "Saved");
  typeSetting("0120");
  enterSetting();
  check("validation: a save that leaves the value as it was shows no check", inUse() === "In use: 120 seconds" && !savedShown() && savedSaid() === "");
  typeSetting("90");
  setting.blur();
  check("validation: leaving the field saves too, with the check", inUse() === "In use: 90 seconds" && setting.value === "90" && savedShown() && savedSaid() === "Saved");
  await new Promise((resolve) => setTimeout(resolve, 2100));
  check("validation: the check goes after about two seconds", !savedShown() && savedSaid() === "");

  // The red icons and the saved check fade in and out over 250 ms on their opacity: each stays rendered while it fades
  // out, then goes. A dropdown's keeps its place while it fades.
  const iconFade = (icon) => (icon.classList.contains("fade-shown") ? "shown" : icon.classList.contains("fade-rendered") ? "fading" : "gone");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fadeIcons = () => [mini.querySelector('[data-sub="general"] .tab-problem'), miniBlMode.closest(".vfield").querySelector(".vfield-icon")].map(iconFade);
  check(`validation: General's badge and the pair's icon show (${fadeIcons()})`, fadeIcons().every((state) => state === "shown"));
  miniBlMode.value = "excluded";
  miniBlMode.dispatchEvent(new window.Event("change"));
  check(`validation: correcting the pair fades them out, each rendered while it fades (${fadeIcons()})`,
    !jumpApply.classList.contains("shows-problem") && fadeIcons().every((state) => state === "fading"));
  await sleep(300);
  check(`validation: and then they are gone (${fadeIcons()})`, fadeIcons().every((state) => state === "gone"));
  miniBlMode.value = "only";
  miniBlMode.dispatchEvent(new window.Event("change"));
  check(`validation: they fade in again as the pair is flagged again (${fadeIcons()})`, fadeIcons().every((state) => state === "shown"));
  const savedIcon = settingWrap.querySelector(".vfield-saved");
  setting.focus();
  typeSetting("45");
  enterSetting();
  typeSetting("abc");
  check(`validation: typing after a save fades the check out as the red icon fades in (${iconFade(savedIcon)}, ${iconFade(setting.closest(".vfield").querySelector(".vfield-icon"))})`,
    iconFade(savedIcon) === "fading" && iconFade(setting.closest(".vfield").querySelector(".vfield-icon")) === "shown");
  await sleep(300);
  check("validation: and the check is gone once faded", iconFade(savedIcon) === "gone");
  const settingTip = settingWrap.querySelector(".vfield-tip");
  const tipTop = settingTip.style.top;
  check(`validation: the flagged field's tooltip shows while it has focus (${iconFade(settingTip)})`, iconFade(settingTip) === "shown");
  setting.blur();
  check(`validation: leaving the field fades the tooltip out where it was (${iconFade(settingTip)}, ${settingTip.style.top})`, iconFade(settingTip) === "fading" && settingTip.style.top === tipTop);
  await sleep(300);
  check("validation: and the tooltip is gone once faded", iconFade(settingTip) === "gone");
  const css = [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n");
  const iconSelectors = ".vfield-icon,\n.vfield-saved,\n.btn-problem,\n.held-dot,\n.filter-tab .tab-problem,\n.vfield-tip";
  check("validation: the icons, the held dot, and the tooltip fade on opacity over 250 ms, and not with reduced motion",
    css.includes(`${iconSelectors} {\n  display: none;\n  opacity: 0;\n  transition: opacity 250ms ease;\n}`) &&
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.vfield-icon,\s*\.vfield-saved,\s*\.btn-problem,\s*\.held-dot,\s*\.filter-tab \.tab-problem,\s*\.vfield-tip \{ transition: none; \}/.test(css));
  check(`validation: each held action's and section tab's badge sits on its corner, out of its flow (${cornerBadges(window)})`, cornerBadges(window) >= 5);
  // The specimen's Apply applies its changes, leaving Apply and Discard changes disabled until the next change.
  const miniDiscard = mini.querySelector("[data-discard]");
  const miniFooter = [...mini.querySelectorAll(".filter-footer button")].map((b) => b.querySelector(".material-symbol-icon").dataset.icon).join(",");
  check(`validation: the specimen's footer is the Filter tab's icon buttons (${miniFooter})`, miniFooter === "filter_alt_off,undo,save");
  const miniType = (selector, value) => {
    const field = mini.querySelector(selector);
    field.value = value;
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  miniBlMode.value = "excluded";
  miniBlMode.dispatchEvent(new window.Event("change", { bubbles: true }));
  miniType("[data-min]", "2:00");
  jumpApply.click();
  check("validation: a valid Apply applies, disabling Apply and Discard changes",
    jumpApply.disabled && !jumpApply.classList.contains("has-pending") && jumpApply.querySelector(".unsaved-dot").hidden && miniDiscard.disabled);
  miniType("[data-max]", "5:00");
  check("validation: and a change enables them again, with Apply's dot",
    !jumpApply.disabled && jumpApply.classList.contains("has-pending") && !jumpApply.querySelector(".unsaved-dot").hidden && !miniDiscard.disabled);
  check(`validation: no script errors after interaction ${errors.join("; ")}`, errors.length === 0);
}

{
  // A held action moves to its field as a tap does: after its section shows, it focuses the field without
  // preventScroll and scrolls nothing first, so the browser brings the field into view, and above the keyboard.
  const { document, window, errors } = await load("validation", 390);
  const mini = document.querySelector('[data-mini="jump"]');
  const min = mini.querySelector("[data-min]");
  const scrolled = [];
  window.Element.prototype.scrollIntoView = function () {
    scrolled.push(this);
  };
  const focusCalls = [];
  const focus = min.focus.bind(min);
  min.focus = (options) => {
    focusCalls.push({ preventScroll: !!options?.preventScroll, generalShown: !mini.querySelector('[data-subpanel="general"]').hidden });
    focus(options);
  };
  mini.querySelector('[data-sub="tags"]').click();
  mini.querySelector("[data-apply]").click();
  check(`validation: a held Apply shows General, then focuses its field as a tap does, with no scroll first (${JSON.stringify(focusCalls)}, ${scrolled.length})`,
    document.activeElement === min && focusCalls.length === 1 && !focusCalls[0].preventScroll && focusCalls[0].generalShown && scrolled.length === 0 && errors.length === 0);
}

{
  // With reduced motion, the icons show and hide at once.
  const reduceMotion = (window) => {
    const ownMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => (query.includes("prefers-reduced-motion") ? { ...ownMatchMedia(query), matches: true, media: query } : ownMatchMedia(query));
  };
  const { document, errors, window } = await load("validation", 1280, "", reduceMotion);
  const setting = document.getElementById("spec-advance");
  const icon = setting.closest(".vfield").querySelector(".vfield-icon");
  const savedIcon = setting.closest(".vfield").querySelector(".vfield-saved");
  setting.focus();
  setting.value = "abc";
  setting.dispatchEvent(new window.Event("input"));
  const flagged = icon.classList.contains("fade-shown") && icon.classList.contains("fade-rendered");
  const tip = setting.closest(".vfield").querySelector(".vfield-tip");
  const tipShown = tip.classList.contains("fade-shown");
  setting.value = "30";
  setting.dispatchEvent(new window.Event("input"));
  const tipGoneAtOnce = !tip.classList.contains("fade-rendered");
  setting.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const savedShownAtOnce = savedIcon.classList.contains("fade-shown");
  setting.value = "31";
  setting.dispatchEvent(new window.Event("input"));
  check("validation, reduced motion: the red icon, its tooltip, and the saved check show and hide at once",
    flagged && tipShown && tipGoneAtOnce && !icon.classList.contains("fade-rendered") && savedShownAtOnce && !savedIcon.classList.contains("fade-rendered"));
  setting.blur();
  check(`validation, reduced motion: no script errors ${errors.join("; ")}`, errors.length === 0);
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
  // The player's corners, measured on a fresh element in its place, since happy-dom keeps an element's computed style
  // after an ancestor's class changes.
  const playerCorners = () => {
    const probe = document.createElement("div");
    probe.className = "media-container";
    $("media").after(probe);
    const style = window.getComputedStyle(probe);
    const corners = `${style.borderRadius} ${style.clipPath}`;
    probe.remove();
    return corners;
  };
  const press = (k, target = document.body, extra = {}) =>
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
  const nativeCalls = [];
  for (const name of ["confirm", "prompt", "alert"]) window[name] = () => nativeCalls.push(name);
  const openDialogs = () => [...document.querySelectorAll("dialog.app-dialog")];
  const topDialog = () => openDialogs().at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  const pressEscape = (dialog) => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
  const notice = () => topDialog()?.querySelector(".dialog-message")?.textContent || "";
  // Presets go by id, so a check finds one by the name it shows: an option's value, a row, or a row's name.
  const presetValue = (select, name) => [...select.options].find((option) => option.textContent === name)?.value ?? "missing";
  const choosePresetNamed = (name) => change($("filter-preset-select"), presetValue($("filter-preset-select"), name));
  // happy-dom keeps `selectedOptions` as it was when a check sets `value`, so the name is read from the value.
  const presetNameIn = (select) => [...select.options].find((option) => option.value === select.value)?.textContent;
  const chosenPresetName = () => presetNameIn($("filter-preset-select"));
  const presetRowName = (row) => row?.querySelector(".filter-preset-name")?.textContent;
  const presetRowNamed = (name) => [...document.querySelectorAll(".filter-preset-row")].find((row) => presetRowName(row) === name);
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
  check(`layout@${width}: each held action's and section tab's badge sits on its corner, out of its flow (${cornerBadges(window)})`, cornerBadges(window) >= 3);
  // Nothing plays until a tap or Play.
  check(`layout@${width}: nothing plays at first, and the player shows the start hint`,
    !$("empty-state").hidden && $("empty-state").textContent === "Tap to play, or open the panel to choose a preset or filter." && $("panel").hidden && $("np-name").parentElement.hidden && chip().includes("Nothing playing"));
  check(`layout@${width}: before anything plays, the scrub bar is disabled and the time shows 0:00 / 0:00 (${$("time-display").textContent})`,
    $("seek").disabled && $("time-display").textContent === "0:00 / 0:00");
  const muteLit = () => $("mute-btn").classList.contains("active");
  const muteIcon = () => $("mute-btn").querySelector(".material-symbol-icon").dataset.icon;
  const mutedAtFirst = muteLit();
  const volumeAtFirst = $("volume").value;
  $("mute-btn").click();
  check(`layout@${width}: before anything plays, Mute is enabled and shows whether sound is muted (${muteIcon()})`,
    !$("mute-btn").disabled && muteLit() === !mutedAtFirst && muteIcon() === (mutedAtFirst ? "volume_up" : "volume_off"));
  // Mute moves the volume slider to 0, still enabled, and remembers the volume, which unmuting brings back.
  const sliderWhileMuted = `${$("volume").value}${$("volume").disabled ? " disabled" : ""}`;
  $("mute-btn").click();
  check(`layout@${width}: Mute moves the volume slider to 0, still enabled, and unmuting brings back the volume (${volumeAtFirst}, ${sliderWhileMuted}, then ${$("volume").value})`,
    !mutedAtFirst && volumeAtFirst === "100" && sliderWhileMuted === "0" && $("volume").value === volumeAtFirst);
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
  // The count line reads "{matching} / {total}", and screen readers hear it in words. The total counts the library
  // before the filter, as the server's search baseline does.
  const libraryTotal = () => window.mockup.items.filter((item) => !item.removed).length;
  const summaryShown = () => $("lib-summary").querySelector('[aria-hidden="true"]')?.textContent;
  const summarySpoken = () => $("lib-summary").querySelector(".vh")?.textContent;
  const summarySays = (matching, total) => summaryShown() === `${matching} / ${total}` && summarySpoken() === `${matching} of ${total} items`;
  check(`layout@${width}: the library loads its tiles, and the count line reads "{matching} / {total}" (${summaryShown()} | ${summarySpoken()})`,
    tiles().length > 20 && summarySays(tiles().length, libraryTotal()));
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
  // Random sits right of Next and left of Loop, and picks from anywhere in the history, adding the pick at the end and
  // keeping the plays ahead. The pick is the item playing, so the checks below start from the same one.
  const transportIds = [...document.querySelectorAll(".overlay-controls-transport .overlay-btn")].map((button) => button.id);
  check(`layout@${width}: Random, with the casino icon, sits between Next and Loop (${transportIds.join()})`,
    transportIds.join() === "prev-btn,play-btn,next-btn,random-btn,loop-btn,autoplay-btn,fullscreen-btn" &&
    $("random-btn").querySelector(".material-symbol-icon").dataset.icon === "casino" && $("random-btn").getAttribute("aria-label") === "Random");
  const historyBeforeRandom = window.mockup.history().ids;
  queue.push(2);
  $("random-btn").click();
  const historyAfterRandom = window.mockup.history();
  check(`layout@${width}: Random from the middle of the history adds its pick at the end, keeping the plays ahead (${historyAfterRandom.ids.join()})`,
    np() === items[2].name && historyAfterRandom.ids.join() === [...historyBeforeRandom, 2].join() &&
    historyAfterRandom.index === historyAfterRandom.ids.length - 1);
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
  check(`layout@${width}: Escape closes the list and leaves focus on the page`, $("notify-list").hidden && document.activeElement === document.body);
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
  // The footer's icon buttons, as the Tags tab's, each with a tooltip. Apply and Discard changes compare the tab with the
  // applied filter and the saved presets: with no changes both are disabled, and a change put back is none.
  const filterFooterButtons = [...document.querySelectorAll("#tab-filter .filter-footer button")];
  const footerSays = filterFooterButtons.map((b) => `${b.querySelector(".material-symbol-icon").dataset.icon}:${b.getAttribute("aria-label")}:${b.title}`).join(",");
  check(`layout@${width}: the Filter tab's footer is icon buttons with tooltips (${footerSays})`,
    footerSays === "filter_alt_off:Clear all filters:Clear all filters,undo:Discard changes:Discard changes,save:Apply:Apply" && filterFooterButtons.every((b) => b.classList.contains("icon-btn")));
  const apply = $("filter-apply");
  const applyDot = () => !apply.querySelector(".unsaved-dot").hidden;
  const filterTabDot = () => !$("tab-btn-filter").querySelector(".unsaved-dot").hidden;
  const changesShown = () => !apply.disabled && apply.classList.contains("has-pending") && applyDot() && !$("filter-discard").disabled && filterTabDot();
  const noChangesShown = () => apply.disabled && !apply.classList.contains("has-pending") && !applyDot() && $("filter-discard").disabled && !filterTabDot();
  // Clear all is disabled while the tab's filter is the default one, which the mockup starts with.
  const clearOff = () => $("filter-clear").disabled;
  check(`layout@${width}: with nothing to apply, Apply and Discard changes are disabled and Apply shows no dot, and with the default filter so is Clear all`,
    noChangesShown() && clearOff());
  change($("filter-fav"), true);
  check(`layout@${width}: a change turns Apply orange with the tabs' dot and enables Discard changes and Clear all`, changesShown() && !clearOff());
  change($("filter-fav"), false);
  check(`layout@${width}: putting it back disables them again, and the tab's dot goes`, noChangesShown() && clearOff());
  document.querySelector('[data-sub="presets"]').click();
  const presetHandle = (index) => document.querySelectorAll(".filter-preset-row")[index].querySelector(".drag-handle");
  key(presetHandle(0), "ArrowDown");
  const presetMoved = changesShown();
  key(presetHandle(1), "ArrowUp");
  check(`layout@${width}: moving a preset is a change, and moving it back is none, and neither enables Clear all, which compares the filter`, presetMoved && noChangesShown() && clearOff());
  // Choose Preset only chooses the preset Load and Update act on, starting on None with the default filter. Load and
  // Update are icon buttons beside it. Load puts the chosen preset's filter in the tab, or the default filter for None,
  // and is disabled, saying nothing more, while the filter already is that one. No preset may hold the default filter or
  // a preset's filter, the chosen preset's included: Add Preset, even with a name, and Update are disabled and say why,
  // Update saying first that it needs a chosen preset, and a filter no preset has enables them.
  const defaultReason = "Choose a filter to save as a preset.";
  const saysWhy = (id, reason) => $(id).disabled && $(id).title === reason && !$(id).classList.contains("shows-problem") &&
    document.getElementById($(id).getAttribute("aria-describedby") || "none")?.textContent === reason;
  // Without a reason, a button shows its own tooltip.
  const enabledQuietly = (id, ownTitle) => !$(id).disabled && $(id).title === ownTitle && !$(id).hasAttribute("aria-describedby");
  const loadOffQuietly = () => $("filter-load-preset").disabled && $("filter-load-preset").title === "Load preset" &&
    !$("filter-load-preset").hasAttribute("aria-describedby");
  const iconButton = (id, icon, label) => $(id).classList.contains("icon-btn") && $(id).getAttribute("aria-label") === label &&
    $(id).querySelector(".material-symbol-icon").dataset.icon === icon;
  const neverPlayedBox = () => [...document.querySelectorAll('[data-subpanel="general"] .filter-stack > label')]
    .find((label) => label.textContent.trim() === "Only never played").querySelector("input");
  check(`layout@${width}: Load and Update are icon buttons after Choose Preset, sync named Load preset and save named Update preset`,
    iconButton("filter-load-preset", "sync", "Load preset") && iconButton("filter-update-preset", "save", "Update preset") &&
    $("filter-preset-select").nextElementSibling === $("filter-load-preset") && $("filter-load-preset").nextElementSibling === $("filter-update-preset"));
  check(`layout@${width}: Add Preset is an icon button after the new preset's name, add named Add preset`,
    iconButton("filter-add-preset", "add", "Add preset") && $("filter-new-preset").closest(".vfield").nextElementSibling === $("filter-add-preset"));
  input($("filter-new-preset"), "Mine");
  check(`layout@${width}: with the default filter on None, Load is disabled quietly, Add Preset says why, and Update says it needs a preset (${$("filter-heading").textContent}, ${$("filter-update-preset").title})`,
    $("filter-heading").textContent === "Preset: None" && $("filter-preset-select").value === "" && clearOff() && loadOffQuietly() &&
    saysWhy("filter-add-preset", defaultReason) && saysWhy("filter-update-preset", "Choose a preset to update."));
  choosePresetNamed("Favorites");
  check(`layout@${width}: choosing Favorites loads nothing and is no change, enables Load, and Update gives the default filter's reason (${$("filter-heading").textContent}, ${$("filter-update-preset").title})`,
    $("filter-heading").textContent === "Preset: None" && !$("filter-fav").checked && noChangesShown() &&
    enabledQuietly("filter-load-preset", "Load preset") && saysWhy("filter-update-preset", defaultReason));
  change($("filter-fav"), true);
  const favoritesReason = 'Preset "Favorites" already has this filter.';
  check(`layout@${width}: the Favorites sample preset's filter disables Add Preset and Update, naming it, and Load quietly (${$("filter-update-preset").title})`,
    $("filter-heading").textContent === "Preset: Favorites" && loadOffQuietly() &&
    saysWhy("filter-add-preset", favoritesReason) && saysWhy("filter-update-preset", favoritesReason));
  change(neverPlayedBox(), true);
  check(`layout@${width}: a filter no preset has enables all three, with no reason left, and Choose Preset stays on Favorites`,
    enabledQuietly("filter-add-preset", "Add preset") && enabledQuietly("filter-update-preset", "Update preset") &&
    enabledQuietly("filter-load-preset", "Load preset") && chosenPresetName() === "Favorites");
  $("filter-load-preset").click();
  check(`layout@${width}: Load puts Favorites' filter in the tab (${$("filter-heading").textContent})`,
    $("filter-fav").checked && !neverPlayedBox().checked && $("filter-heading").textContent === "Preset: Favorites" && loadOffQuietly());
  change($("filter-preset-select"), "");
  key(presetHandle(0), "ArrowDown");
  $("filter-load-preset").click();
  check(`layout@${width}: Load on None puts the default filter in the tab and keeps the preset list's changes (${$("filter-heading").textContent})`,
    !$("filter-fav").checked && $("filter-heading").textContent === "Preset: None" && loadOffQuietly() && changesShown() &&
    presetRowName(document.querySelectorAll(".filter-preset-row")[1]) === "Favorites");
  key(presetHandle(1), "ArrowUp");
  input($("filter-new-preset"), "");
  document.querySelector('[data-sub="tags"]').click();
  // Each click redraws the chips, so the first chip's Include is looked up again.
  const firstInclude = () => document.querySelector('#filter-tag-categories button[title="Include"]');
  firstInclude().click();
  const tagIncluded = changesShown();
  firstInclude().click();
  check(`layout@${width}: including a tag is a change, and removing it again is none`, tagIncluded && noChangesShown());
  // A category's match mode and the Combine setting are part of the filter: ANY (OR) is a change, and ALL (AND) again is
  // none.
  const peopleMode = () => document.querySelector('#filter-tag-categories select[aria-label="Match mode for People"]');
  change(peopleMode(), "OR");
  const localChanged = changesShown();
  change(peopleMode(), "AND");
  const localBack = noChangesShown();
  change($("filter-global"), "OR");
  const globalChanged = changesShown();
  change($("filter-global"), "AND");
  check(`layout@${width}: a match mode set to ANY (OR) is a change, and ALL (AND) again is none, for a category and the combination`,
    localChanged && localBack && globalChanged && noChangesShown() && $("filter-heading").textContent === "Preset: None");
  document.querySelector('[data-sub="general"]').click();
  // A duration typed, left, then emptied is no limit again, as one emptied before it is left.
  for (const field of [$("filter-min"), $("filter-max")]) {
    field.focus();
    input(field, "2:00");
    field.dispatchEvent(new window.Event("change", { bubbles: true }));
    field.blur();
    const typedAndLeft = changesShown();
    field.focus();
    input(field, "");
    check(`layout@${width}: a ${field.getAttribute("aria-label").toLowerCase()} typed, left, and emptied is no change, as one emptied before it is left`,
      typedAndLeft && noChangesShown() && clearOff());
    field.blur();
  }
  // The same with a browser's events: an input event per keystroke as it is typed, its change event and blur as it is
  // left, and an input event per character as it is erased, a valid duration and one that isn't, for both fields.
  for (const field of [$("filter-min"), $("filter-max")]) {
    for (const text of ["1:00", "abc"]) {
      field.focus();
      for (let length = 1; length <= text.length; length++) input(field, text.slice(0, length));
      field.dispatchEvent(new window.Event("change", { bubbles: true }));
      field.blur();
      const typedAndLeft = changesShown();
      field.focus();
      for (let length = text.length - 1; length >= 0; length--) input(field, text.slice(0, length));
      const erasedInField = noChangesShown() && clearOff();
      field.dispatchEvent(new window.Event("change", { bubbles: true }));
      field.blur();
      check(`layout@${width}: a ${field.getAttribute("aria-label").toLowerCase()} of "${text}" typed a key at a time, left, and erased is no change, in the field and after leaving it`,
        typedAndLeft && erasedInField && noChangesShown() && clearOff());
    }
  }
  const min = $("filter-min");
  input(min, "1:7x");
  const applyKids = [...apply.children].map((c) => c.className.split(" ")[0]).join(",");
  // happy-dom keeps an element's computed style after an ancestor's class changes, so the dot's color is read from a
  // fresh copy of Apply.
  const applyDotColor = () => {
    const copy = apply.cloneNode(true);
    apply.after(copy);
    const color = window.getComputedStyle(copy.querySelector(".unsaved-dot")).backgroundColor;
    copy.remove();
    return color;
  };
  const heldDotColor = applyDotColor();
  const errorColor = () => window.getComputedStyle(document.documentElement).getPropertyValue("--error").trim();
  const heldIconOpacity = window.getComputedStyle(apply.querySelector(".btn-label")).opacity;
  check(`layout@${width}: strict parser flags 1:7x; Apply is held, its icon dims, and its dot turns red, with no badge (${applyKids}; ${heldIconOpacity}, ${heldDotColor})`,
    min.getAttribute("aria-invalid") === "true" && apply.getAttribute("aria-disabled") === "true" && !apply.disabled && applyKids === "btn-label,unsaved-dot" &&
    applyDot() && !!errorColor() && heldDotColor === errorColor() && heldIconOpacity === "0.5" && apply.classList.contains("has-pending") &&
    apply.title === "Correct the minimum duration to apply.");
  check(`layout@${width}: the tooltip sits inside the field`, min.closest(".vfield").contains(document.getElementById(min.getAttribute("aria-describedby"))));
  document.querySelector('[data-sub="presets"]').click();
  const messagesBeforeApply = messages.entries().length;
  apply.click();
  check(`layout@${width}: held Apply goes to the field, keeps the panel open, and sends no message`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === min && !$("panel").hidden && messages.entries().length === messagesBeforeApply);
  input(min, "1:30");
  document.querySelector('[data-sub="presets"]').click();
  const presetNames = () => [...document.querySelectorAll(".filter-preset-row")].map(presetRowName).join(",");
  const rowButtons = [...document.querySelector(".filter-preset-row").querySelectorAll("button")].map((b) => b.title).join(",");
  check(`layout@${width}: preset rows have a handle and Edit only (${rowButtons})`, rowButtons === "Drag to reorder,Edit preset");
  check(`layout@${width}: the mockup has many presets (${document.querySelectorAll(".filter-preset-row").length})`, document.querySelectorAll(".filter-preset-row").length >= 12);
  key(document.querySelector(".filter-preset-row .drag-handle"), "ArrowDown");
  check(`layout@${width}: ArrowDown on a preset's handle moves it and keeps focus on it`,
    presetNames().startsWith("Short clips,Favorites,Photos only,Long videos,") && presetRowName(document.activeElement?.closest(".filter-preset-row")) === "Favorites" && !apply.disabled && apply.classList.contains("has-pending"));
  presetRowNamed("Long videos").querySelector('[title="Edit preset"]').click();
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
  // A duration still being typed is a change for Apply and the dots.
  const appliedMin = min.value;
  input(min, "7:07");
  check(`layout@${width}: a duration being typed marks the Filter tab, the panel button, and Apply`,
    dot("tab-btn-filter") && dot("panel-btn") && !apply.disabled && apply.classList.contains("has-pending") && applyDot());
  input(min, appliedMin);
  check(`layout@${width}: the dots go once the typed duration is the applied one again`, !dot("tab-btn-filter") && !dot("panel-btn"));
  check(`layout@${width}: valid Apply applies${overlay ? " and closes the overlay" : " and stays open"}`,
    said("Filters applied.") && $("panel").hidden === overlay);
  check(`layout@${width}: closing resumes playback`, overlay ? chip().includes("Playing") : true);
  if ($("panel").hidden) $("panel-btn").click();
  check(`layout@${width}: reopening comes back on the last tab (Filter)`, !$("tab-filter").hidden);
  // Presets that would take each other's names, or filters, in a loop can't be saved in any order, so Apply shows as
  // unavailable, turning its dot red as a held Apply does, names each preset in the loop, and says to apply in two steps. Pressing it
  // shows the reason in a notice, since a phone or tablet shows no tooltip, and saves and applies nothing. A chain of
  // renames, each taking the name the next one frees, applies.
  document.querySelector('[data-sub="presets"]').click();
  const renamePreset = (from, to) => {
    presetRowNamed(from).querySelector('[title="Edit preset"]').click();
    input(topDialog().querySelector("input"), to);
    button(topDialog(), "Save").click();
  };
  const blockedSaying = (reason) => !apply.disabled && apply.getAttribute("aria-disabled") === "true" && apply.title === reason &&
    document.getElementById(apply.getAttribute("aria-describedby") || "none")?.textContent === reason &&
    apply.classList.contains("has-pending") && applyDot() && apply.classList.contains("shows-problem") && applyDotColor() === errorColor();
  const savedPresetList = () => [...$("lib-preset").options].map((option) => option.textContent).join(",");
  const savedBeforeLoops = savedPresetList();
  renamePreset("Favorites", "Spare");
  renamePreset("Short clips", "Favorites");
  renamePreset("Spare", "Short clips");
  const nameSwap = 'Presets "Favorites" and "Short clips" would take each other\'s names. Apply in two steps: give one of them another name, apply, then rename it.';
  check(`layout@${width}: two presets swapping names block Apply, whose dot turns red as a held Apply's does, naming both (${apply.title}, ${applyDotColor()})`,
    blockedSaying(nameSwap));
  apply.click();
  check(`layout@${width}: pressing the blocked Apply shows the reason in a notice, and saves and applies nothing (${notice()})`,
    notice() === nameSwap && newest() === nameSwap && savedPresetList() === savedBeforeLoops && !$("panel").hidden && blockedSaying(nameSwap));
  dismissNotices();
  $("filter-discard").click();
  renamePreset("Photos only", "Spare");
  renamePreset("Favorites", "Photos only");
  renamePreset("Short clips", "Favorites");
  renamePreset("Spare", "Short clips");
  check(`layout@${width}: three presets rotating names block Apply, naming all three in the list's order (${apply.title})`,
    blockedSaying('Presets "Favorites", "Photos only", and "Short clips" would take each other\'s names. Apply in two steps: give one of them another name, apply, then rename it.'));
  $("filter-discard").click();
  renamePreset("Photos only", "Pictures");
  renamePreset("Favorites", "Photos only");
  renamePreset("Short clips", "Favorites");
  check(`layout@${width}: a chain of renames doesn't block Apply (${apply.title})`,
    changesShown() && !apply.hasAttribute("aria-disabled") && apply.title === "Apply");
  $("filter-discard").click();
  // Two presets swap filters through a filter of Favorites' own on the way, since no two presets may share one.
  choosePresetNamed("Favorites");
  $("filter-load-preset").click();
  change(neverPlayedBox(), true);
  $("filter-update-preset").click();
  choosePresetNamed("Short clips");
  change(neverPlayedBox(), false);
  $("filter-update-preset").click();
  choosePresetNamed("Favorites");
  change($("filter-fav"), false);
  change(document.querySelectorAll('input[name="media"]')[1], true);
  input($("filter-max"), "2:00");
  change($("filter-max"), "2:00");
  $("filter-update-preset").click();
  const filterSwap = 'Presets "Short clips" and "Favorites" would take each other\'s filters. Apply in two steps: give one of them another filter, apply, then update it.';
  check(`layout@${width}: two presets swapping filters block Apply, naming both (${apply.title})`, blockedSaying(filterSwap));
  apply.click();
  check(`layout@${width}: and pressing it shows the filters' reason in a notice (${notice()})`,
    notice() === filterSwap && savedPresetList() === savedBeforeLoops);
  dismissNotices();
  choosePresetNamed("Short clips");
  change(neverPlayedBox(), true);
  $("filter-update-preset").click();
  check(`layout@${width}: giving one of them another filter breaks the loop, and Apply can apply again (${apply.title})`,
    changesShown() && !apply.hasAttribute("aria-disabled") && apply.title === "Apply");
  $("filter-discard").click();

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

  // Favorites only with Blacklisted only matches nothing: the pair is flagged and holds every action that uses it. Update
  // acts on the chosen preset, which starts over on the heading's each time the Presets section shows, so Favorites is
  // loaded first.
  openTab("filter");
  document.querySelector('[data-sub="presets"]').click();
  choosePresetNamed("Favorites");
  $("filter-load-preset").click();
  document.querySelector('[data-sub="general"]').click();
  change($("filter-fav"), true);
  change($("filter-fav-mode"), "only");
  change($("filter-bl-mode"), "only");
  const pairTip = document.getElementById($("filter-fav-mode").getAttribute("aria-describedby") || "none");
  check(`layout@${width}: Favorites only with Blacklisted only flags both dropdowns, with one icon after Blacklisted, and marks General`,
    $("filter-fav-mode").getAttribute("aria-invalid") === "true" && $("filter-bl-mode").getAttribute("aria-invalid") === "true" &&
    pairTip?.textContent === "Nothing is both a favorite and blacklisted. Use excluded for one of them." && $("filter-bl-mode").closest(".vfield").contains(pairTip) &&
    document.querySelector('.filter-tab[data-sub="general"]').classList.contains("has-problem") &&
    document.querySelector('.filter-tab[data-sub="general"] .tab-problem').classList.contains("fade-shown"));
  // An icon fades out: it is rendered while it fades, then not.
  const iconFade = (icon) => (icon.classList.contains("fade-shown") ? "shown" : icon.classList.contains("fade-rendered") ? "fading" : "gone");
  const heldWithIcon = (id) => $(id).getAttribute("aria-disabled") === "true" && $(id).classList.contains("shows-problem") && iconFade($(id).querySelector(".btn-problem")) === "shown";
  const heldWithRedDot = () => apply.getAttribute("aria-disabled") === "true" && apply.classList.contains("shows-problem") && applyDot() && applyDotColor() === errorColor();
  const disabledNoIconId = (id) => disabledNoIcon($(id));
  // A held icon button's look, read from a fresh copy, as Apply's dot is: its icon dims, and Update and Add Preset show a
  // red dot where Apply's sits, in place of the badge.
  const heldLook = (id, selector) => {
    const copy = $(id).cloneNode(true);
    $(id).after(copy);
    const style = window.getComputedStyle(copy.querySelector(selector));
    const read = { opacity: style.opacity, background: style.backgroundColor, position: style.position, top: style.top, right: style.right };
    copy.remove();
    return read;
  };
  const heldWithDot = (id) => {
    const dot = $(id).querySelector(".held-dot");
    const look = dot && heldLook(id, ".held-dot");
    return $(id).getAttribute("aria-disabled") === "true" && $(id).classList.contains("shows-problem") && !$(id).querySelector(".btn-problem") &&
      !!dot && iconFade(dot) === "shown" && look.background === errorColor() && look.position === "absolute" && look.top === "6px" &&
      look.right === "6px" && heldLook(id, ".btn-label").opacity === "0.5";
  };
  check(`layout@${width}: the pair holds Apply and Update, whose icon dims and shows the red dot where Apply's sits, and Add Preset stays disabled while its name is empty`,
    heldWithRedDot() && heldWithDot("filter-update-preset") && disabledNoIconId("filter-add-preset") &&
    $("filter-update-preset").title === "Change Favorites or Blacklisted first.");
  document.querySelector('[data-sub="presets"]').click();
  const messagesBeforePair = messages.entries().length;
  $("filter-update-preset").click();
  check(`layout@${width}: held Update goes to the Blacklisted dropdown and sends no message`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === $("filter-bl-mode") && messages.entries().length === messagesBeforePair);
  change($("filter-bl"), false);
  const pairIcons = () => [document.querySelector('.filter-tab[data-sub="general"] .tab-problem'), $("filter-bl-mode").closest(".vfield").querySelector(".vfield-icon")].map(iconFade);
  check(`layout@${width}: turning Blacklisted off clears the pair and lets Apply proceed with its dot orange again, and General's and the pair's icons fade out (${pairIcons()})`,
    !$("filter-fav-mode").hasAttribute("aria-invalid") && !$("filter-bl-mode").hasAttribute("aria-invalid") && !$("filter-apply").hasAttribute("aria-disabled") &&
    applyDot() && applyDotColor() !== errorColor() && pairIcons().every((state) => state === "fading"));
  await new Promise((resolve) => setTimeout(resolve, 300));
  check(`layout@${width}: and are gone once faded (${pairIcons()})`, pairIcons().every((state) => state === "gone"));
  input($("filter-min"), "1:7x");
  check(`layout@${width}: a duration that is not valid holds Update too, and Add Preset stays disabled while its name is empty`,
    heldWithDot("filter-update-preset") && disabledNoIconId("filter-add-preset") && $("filter-update-preset").title === "Correct the minimum duration first.");
  document.querySelector('[data-sub="presets"]').click();
  $("filter-new-preset").focus();
  input($("filter-new-preset"), "FAVORITES");
  const takenPresetTip = document.getElementById($("filter-new-preset").getAttribute("aria-describedby") || "none");
  check(`layout@${width}: a taken preset name is flagged and disables Add Preset without an icon, even while a duration holds it ("${takenPresetTip?.textContent}")`,
    $("filter-new-preset").getAttribute("aria-invalid") === "true" && takenPresetTip?.textContent === "Use a name no other preset has." &&
    disabledNoIconId("filter-add-preset") && document.querySelector('.filter-tab[data-sub="presets"]').classList.contains("has-problem") &&
    iconFade(document.querySelector('.filter-tab[data-sub="presets"] .tab-problem')) === "shown");
  input($("filter-new-preset"), "Unique name");
  check(`layout@${width}: with a new name, the duration holds Add Preset, whose icon dims and shows the red dot, as Update's does, saying why (${$("filter-add-preset").title})`,
    heldWithDot("filter-add-preset") && !$("filter-add-preset").disabled && $("filter-add-preset").title === "Correct the minimum duration first.");
  $("filter-add-preset").click();
  check(`layout@${width}: held Add Preset goes to the duration and adds nothing`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === $("filter-min") && $("filter-new-preset").value === "Unique name");
  input($("filter-min"), "");
  $("filter-add-preset").click();
  const addedPreset = $("filter-preset-list").lastElementChild;
  check(`layout@${width}: Add Preset adds the preset last and moves to its drag handle`,
    presetRowName(addedPreset) === "Unique name" && document.activeElement === addedPreset.querySelector(".drag-handle") && $("filter-new-preset").value === "");
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
  openTab("library");
  await tick();
  check(`layout@${width}: with a filter applied, the count line's total is still the whole library (${summaryShown()})`,
    tiles().length > 0 && tiles().length < libraryTotal() && summarySays(tiles().length, libraryTotal()));
  input($("lib-search"), "beach");
  await tick();
  const beachTotal = window.mockup.items.filter((item) => !item.removed && item.name.toLowerCase().includes("beach")).length;
  check(`layout@${width}: and with a search typed too, the total is the search's matches (${summaryShown()})`,
    beachTotal > 0 && beachTotal < libraryTotal() && summarySays(tiles().length, beachTotal));
  input($("lib-search"), "");
  await tick();
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
  check(`layout@${width}: with a filter applied that isn't the default, Clear all is enabled`, !clearOff() && apply.disabled);
  $("filter-clear").click();
  check(`layout@${width}: right after Clear all, before Apply, Clear all is disabled and Apply has the change`, clearOff() && changesShown());
  $("filter-apply").click();
  await tick();
  check(`layout@${width}: Clear all filters then Apply hides the Filters line`, $("lib-filters").hidden);
  openTab("library");

  // Choosing a preset applies its filter, and a change to that filter stars it.
  const choosePreset = (name) => change($("lib-preset"), name ? presetValue($("lib-preset"), name) : "");
  choosePreset("Photos only");
  await tick();
  check(`layout@${width}: choosing a preset in the Library tab applies its filter (${tiles().length} tiles)`,
    tiles().length > 0 && tiles().every((t) => t.getAttribute("aria-label").endsWith(".jpg")) && $("lib-filters").textContent === "Filters: Photos only" && document.querySelectorAll('input[name="media"]')[2].checked);
  await applyFilter(true, "only", true, "excluded");
  check(`layout@${width}: changing its filter stars it (${$("lib-preset").selectedOptions[0]?.textContent}, ${$("filter-heading").textContent})`,
    $("lib-preset").value === "*" && $("lib-preset").selectedOptions[0].textContent === "Photos only*" && $("filter-heading").textContent === "Preset: Photos only*");
  openTab("filter");
  // Each time the Presets section comes into view, however it got there, Choose Preset starts over on the preset the
  // heading names, here Photos only, the base of "Photos only*", with or without unsaved changes, and a choice lasts
  // while the section stays in view.
  const presetsSub = () => document.querySelector('[data-sub="presets"]');
  presetsSub().click();
  check(`layout@${width}: the Presets section shows Choose Preset on the base of the heading's starred preset (${$("filter-heading").textContent}, ${chosenPresetName()})`,
    $("filter-heading").textContent === "Preset: Photos only*" && chosenPresetName() === "Photos only");
  const wayIn = (way, comeBack) => {
    choosePresetNamed("Beach days");
    const kept = chosenPresetName();
    comeBack();
    check(`layout@${width}: ${way} starts Choose Preset over on Photos only, and the choice lasted until then (${kept}, ${chosenPresetName()})`,
      kept === "Beach days" && chosenPresetName() === "Photos only" && !presetsSub().hidden && presetsSub().classList.contains("is-active"));
  };
  wayIn("its sub-tab", () => {
    document.querySelector('[data-sub="tags"]').click();
    presetsSub().click();
  });
  wayIn("the Filter panel tab", () => {
    $("tab-btn-library").click();
    $("tab-btn-filter").click();
  });
  wayIn("an arrow key on the panel tabs", () => {
    $("tab-btn-library").click();
    key($("tab-btn-library"), "ArrowRight");
  });
  wayIn("the panel opening on it", () => {
    closePanel();
    $("panel-btn").click();
  });
  wayIn("the Filter tab's key", () => {
    $("tab-btn-library").click();
    press("2");
  });
  wayIn("the Library tab's Filters line", () => {
    $("tab-btn-library").click();
    $("lib-filters").click();
  });
  change(document.querySelectorAll('input[name="media"]')[1], true);
  wayIn("its sub-tab, with unsaved changes too,", () => {
    document.querySelector('[data-sub="general"]').click();
    presetsSub().click();
  });
  change(document.querySelectorAll('input[name="media"]')[2], true);
  document.querySelector('[data-sub="general"]').click();
  change($("filter-fav"), false);
  check(`layout@${width}: putting the filter back to match its preset clears the star in the heading at once (${$("filter-heading").textContent})`,
    $("filter-heading").textContent === "Preset: Photos only" && !$("filter-apply").disabled);
  $("filter-apply").click();
  await tick();
  check(`layout@${width}: and in the dropdown once applied (${$("lib-preset").selectedOptions[0]?.textContent})`,
    presetNameIn($("lib-preset")) === "Photos only" && ![...$("lib-preset").options].some((option) => option.value === "*"));
  openTab("library");
  choosePreset("");
  await tick();
  check(`layout@${width}: None goes back to the default filter`, $("lib-filters").hidden && !$("filter-fav").checked);
  openTab("filter");
  document.querySelector('[data-sub="presets"]').click();
  choosePresetNamed("Favorites");
  $("filter-load-preset").click();
  document.querySelector('[data-sub="general"]').click();
  check(`layout@${width}: choosing a preset in the Filter tab and Load loads its filter into the tab`, $("filter-fav").checked && $("filter-fav-mode").value === "only" && $("filter-heading").textContent === "Preset: Favorites");
  $("filter-discard").click();
  check(`layout@${width}: and Discard changes puts the applied filter back, leaving the Filter tab open (${overlay ? "overlay" : "side panel"})`,
    !$("filter-fav").checked && !$("panel").hidden && !$("tab-filter").hidden);
  // The heading names the working filter's preset, which a duration still being typed isn't in, and only its star
  // follows the text, so text passed through on the way, an emptied field or one that reads as another preset's filter,
  // doesn't change the preset.
  const typedHeadings = [];
  const typeDuration = (field, texts) => {
    field.focus();
    for (const text of texts) {
      input(field, text);
      typedHeadings.push($("filter-heading").textContent);
    }
    field.dispatchEvent(new window.Event("change", { bubbles: true }));
    typedHeadings.push($("filter-heading").textContent);
    field.blur();
  };
  const loadPresetInTab = (name) => {
    document.querySelector('[data-sub="presets"]').click();
    choosePresetNamed(name);
    $("filter-load-preset").click();
    document.querySelector('[data-sub="general"]').click();
    return $("filter-heading").textContent;
  };
  const shortHeading = loadPresetInTab("Short clips");
  typeDuration($("filter-max"), ["02:", "02", "0", "", "3", "3:", "3:0", "3:00"]);
  check(`layout@${width}: Short clips' maximum backspaced to empty and typed again stays on Short clips, starred (${[...new Set(typedHeadings)].join(", ")})`,
    shortHeading === "Preset: Short clips" && typedHeadings.every((heading) => heading === "Preset: Short clips*"));
  $("filter-discard").click();
  typedHeadings.length = 0;
  const photosHeading = loadPresetInTab("Photos only");
  change(document.querySelectorAll('input[name="media"]')[1], true);
  typeDuration($("filter-max"), ["2:00", "2:0", "2:", "2", ""]);
  check(`layout@${width}: a maximum typed that reads as Short clips' filter on the way keeps Photos only, starred (${[...new Set(typedHeadings)].join(", ")})`,
    photosHeading === "Preset: Photos only" && typedHeadings.every((heading) => heading === "Preset: Photos only*"));
  $("filter-discard").click();
  // Add Preset and Update read a duration as its field reads, before the field is left, so one that reads as another
  // preset's filter disables them, naming that preset. Once the field is read the heading names that preset, and Choose
  // Preset stays where it was put.
  loadPresetInTab("Photos only");
  change(document.querySelectorAll('input[name="media"]')[1], true);
  $("filter-max").focus();
  input($("filter-max"), "2:00");
  const shortReason = 'Preset "Short clips" already has this filter.';
  check(`layout@${width}: a maximum typed that reads as Short clips' filter disables Add Preset and Update, naming it (${$("filter-update-preset").title}, ${$("filter-heading").textContent})`,
    $("filter-heading").textContent === "Preset: Photos only*" && saysWhy("filter-add-preset", shortReason) && saysWhy("filter-update-preset", shortReason));
  $("filter-max").dispatchEvent(new window.Event("change", { bubbles: true }));
  $("filter-max").blur();
  check(`layout@${width}: once the field is read, the heading names Short clips, Choose Preset stays on Photos only, and both still name Short clips (${$("filter-heading").textContent}, ${chosenPresetName()})`,
    $("filter-heading").textContent === "Preset: Short clips" && chosenPresetName() === "Photos only" &&
    saysWhy("filter-add-preset", shortReason) && saysWhy("filter-update-preset", shortReason));
  $("filter-discard").click();
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
  change($("filter-fav"), true);
  $("filter-apply").click();
  check(`layout@${width}: Apply while reconnecting says it couldn't save the presets (${notice()})`, notice() === "Saving presets failed: Couldn't reach the server.");
  dismissNotices();
  $("filter-discard").click();
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
  // Expanded, the header keeps the count, and shows the dot while the category holds unsaved changes.
  const usedToggle = () => tagSection(usedCategory.id).querySelector(".tag-category-toggle");
  const usedDot = () => tagSection(usedCategory.id).querySelector(".unsaved-dot");
  usedToggle().click();
  check(`layout@${width}: expanded, the header still counts the item's tags in it (${usedToggle().getAttribute("aria-label")})`,
    !collapsedNow(tagSection(usedCategory.id)) && !tagSection(usedCategory.id).querySelector(".category-count").hidden &&
    tagSection(usedCategory.id).querySelector(".category-count").textContent === String(usedCount) && usedToggle().getAttribute("aria-label").includes(usedBadge.title));
  const usedChipAdd = () => tagSection(usedCategory.id).querySelector('.tag-chip [title="Add tag"]');
  usedChipAdd().click();
  check(`layout@${width}: and shows the dot while it holds an unsaved change, its name saying both (${usedToggle().getAttribute("aria-label")})`,
    !collapsedNow(tagSection(usedCategory.id)) && !usedDot().hidden && usedToggle().getAttribute("aria-label").endsWith(", unsaved changes") &&
    usedToggle().getAttribute("aria-label").includes(`${usedCount} ${usedCount === 1 ? "tag" : "tags"} on this item`));
  usedChipAdd().click();
  check(`layout@${width}: and loses the dot once the change is undone`, usedDot().hidden && !usedToggle().getAttribute("aria-label").includes("unsaved changes"));
  usedToggle().click();
  // A category none of whose tags are in use hides its count.
  const unusedCategory = window.mockup.tags.find((category) => category.chips.length && !category.chips.some((chip) => playingItem.tags.has(chip.key)));
  const unusedCount = () => tagSection(unusedCategory.id).querySelector(".category-count");
  const unusedLabel = () => tagSection(unusedCategory.id).querySelector(".tag-category-toggle").getAttribute("aria-label");
  check(`layout@${width}: a category with none of its tags in use hides its count, in both tabs (${unusedLabel()})`,
    unusedCount().hidden && unusedLabel() === unusedCategory.name && filterSection(unusedCategory.id).querySelector(".category-count").hidden);
  const orderBefore = categoryOrder();
  key(document.querySelector('#tags-body [data-key="trips"] .drag-handle'), "ArrowDown");
  check(`layout@${width}: the last category can't move below Uncategorized`, categoryOrder() === orderBefore && categoryOrder().endsWith(",trips,uncategorized"));
  key(document.querySelector('#tags-body [data-key="events"] .drag-handle'), "ArrowUp");
  const tagsSaveDot = () => !$("tags-save").querySelector(".unsaved-dot").hidden;
  check(`layout@${width}: ArrowUp moves a category (${categoryOrder().split(",").slice(0, 3)}) and Save turns on, with the orange dot`,
    categoryOrder().startsWith("people,events,places,") && !$("tags-save").disabled && tagsSaveDot());
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
  check(`layout@${width}: after discarding it follows and nothing is pending, and Save's dot goes`, line.hidden && $("tags-save").disabled && !tagsSaveDot());
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
  const filterToggle = () => filterSection("people").querySelector(".tag-category-toggle");
  const peopleMatch = filterSection("people").querySelector(".tag-category-header select");
  check(`layout@${width}: a Filter category's match control has no Local label, and its name and tooltip say what it is (${peopleMatch?.getAttribute("aria-label")}, ${peopleMatch?.title})`,
    peopleMatch?.getAttribute("aria-label") === "Match mode for People" && peopleMatch.title === "Match mode" &&
    !filterSection("people").querySelector(".tag-category-header").textContent.includes("Local"));
  filterToggle().click();
  check(`layout@${width}: expanded, the Filter category keeps its count and dot, its name saying both (${filterToggle().getAttribute("aria-label")})`,
    !collapsedNow(filterSection("people")) && !filterSection("people").querySelector(".category-count").hidden && filterSection("people").querySelector(".category-count").textContent === "1" &&
    !filterSection("people").querySelector(".unsaved-dot").hidden && filterToggle().getAttribute("aria-label") === "People, 1 tag in the filter, unsaved changes");
  filterToggle().click();
  $("filter-discard").click();
  check(`layout@${width}: Discard changes clears both`, filterSection("people").querySelector(".category-count").hidden && filterSection("people").querySelector(".unsaved-dot").hidden);
  // Apply makes the tab's tags the applied ones, so a category's dot goes, collapsed or expanded, and its count follows
  // the filter.
  const peopleDot = () => !filterSection("people").querySelector(".unsaved-dot").hidden;
  const peopleCount = () => filterSection("people").querySelector(".category-count");
  filterSection("people").querySelector('[title="Include"]').click();
  $("filter-apply").click();
  openTab("filter");
  check(`layout@${width}: after Apply, a collapsed Filter category's dot goes and its count stays`,
    collapsedNow(filterSection("people")) && !peopleDot() && !peopleCount().hidden && peopleCount().textContent === "1");
  filterToggle().click();
  filterSection("people").querySelector('[title="Include"]').click();
  const expandedDot = peopleDot();
  $("filter-apply").click();
  openTab("filter");
  check(`layout@${width}: after Apply, an expanded Filter category's dot goes too`,
    expandedDot && !collapsedNow(filterSection("people")) && !peopleDot() && peopleCount().hidden);
  filterToggle().click();
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
  // Mute and the volume slider stay enabled on a photo, and what they set there applies to the next video. The volume
  // is set first, since moving the slider while muted unmutes.
  const volumeBeforePhoto = $("volume").value;
  const volumeOnPhoto = volumeBeforePhoto === "30" ? "40" : "30";
  input($("volume"), volumeOnPhoto);
  $("mute-btn").click();
  check(`layout@${width}: on a photo, Mute and the volume slider stay enabled, and Mute shows muted with the slider at 0 (${muteIcon()}, ${$("volume").value})`,
    !$("mute-btn").disabled && !$("volume").disabled && muteLit() && muteIcon() === "volume_off" && $("volume").value === "0");
  $("autoplay-btn").click();
  check(`layout@${width}: turning Autoplay on starts the photo's full time from then (${$("time-display").textContent})`,
    !seek.disabled && !$("play-btn").disabled && Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:10" && playIcon() === "pause");
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
  check(`layout@${width}: dragging the scrub bar moves the timer's position (${$("time-display").textContent})`, $("time-display").textContent === "0:02 / 0:10");
  $("loop-btn").click();
  check(`layout@${width}: with Loop on, Play and the scrub bar are disabled, and the time shows 0:00 / 0:00 (${$("time-display").textContent})`,
    $("play-btn").disabled && seek.disabled && $("time-display").textContent === "0:00 / 0:00");
  $("loop-btn").click();
  check(`layout@${width}: turning Loop off shows the photo's timer again with the time it kept (${$("time-display").textContent})`,
    !$("play-btn").disabled && !seek.disabled && $("time-display").textContent === "0:02 / 0:10");
  $("autoplay-btn").click();
  check(`layout@${width}: turning Autoplay off clears the timer, and Autoplay is remembered`,
    Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:00" && $("play-btn").disabled && window.localStorage.getItem("rr-mockup.autoplay") === "false");
  $("autoplay-btn").click();
  check(`layout@${width}: turning it on again starts the full time, not where the timer was (${$("time-display").textContent})`, $("time-display").textContent === "0:00 / 0:10");
  // Once the timer ends, Play and the bar are disabled, with the time at 0:00 / 0:00, while the next pick fails here.
  situation("noanswer");
  input(seek, 9.95);
  await sleep(200);
  check(`layout@${width}: once a photo's timer ends, Play and the bar are disabled and the time shows 0:00 / 0:00 until the next item plays (${chip()}, ${$("time-display").textContent}, ${notice()})`,
    $("play-btn").disabled && seek.disabled && Number(seek.value) === 0 && $("time-display").textContent === "0:00 / 0:00" && chip().includes("Photo timer ended") &&
    notice() === "No response from the server. Try again.");
  dismissNotices();
  situation("connected");
  $("autoplay-btn").click();
  // Space plays or pauses a video as K does, and leaves a focused button to its own action.
  window.mockup.choose(3);
  const nextVideoSound = `${muteIcon()}, ${$("volume").value}`;
  $("mute-btn").click();
  check(`layout@${width}: the next video plays muted, as set on the photo, and unmuting brings back the volume set there (${nextVideoSound}, then ${$("volume").value})`,
    nextVideoSound === "volume_off, 0" && !muteLit() && $("volume").value === volumeOnPhoto);
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

  // Stats: each audio row as the server's loudness scan leaves the item, Last played as the time before this play, and
  // what the tab says in place of its stats.
  const statValue = (label) => [...$("stats-body").querySelectorAll("dt")].find((el) => el.textContent === label)?.nextElementSibling.textContent;
  const audioRows = () => ["Has audio", "Loudness", "True peak"].map(statValue).join(", ");
  const videoWhere = (test) => items.findIndex((item) => item.type === "video" && playable(item) && test(item));
  const audioCases = [
    ["a measured video", (item) => item.hasAudio === true && item.loudness > -70 && item.peak != null, (item) => `Yes, ${item.loudness.toFixed(1)} LUFS, ${item.peak.toFixed(1)} dBTP`],
    ["a video without a peak yet", (item) => item.hasAudio === true && item.loudness > -70 && item.peak == null, (item) => `Yes, ${item.loudness.toFixed(1)} LUFS, Not measured`],
    ["a video without audio", (item) => item.hasAudio === false, () => "No, N/A, N/A"],
    ["a video not scanned yet", (item) => item.hasAudio == null, () => "Unknown, Unknown, Not measured"]
  ];
  for (const [label, test, expected] of audioCases) {
    const index = videoWhere(test);
    if (index >= 0) window.mockup.choose(index);
    check(`layout@${width}: Stats shows ${label} as ${index >= 0 ? audioRows() : "no such item"}`, index >= 0 && audioRows() === expected(items[index]));
  }
  const agoCases = [
    ["days", (ms) => ms >= 86400e3, /^(1 day|\d+ days) ago$/],
    ["hours", (ms) => ms >= 3600e3 && ms < 86400e3, /^(1 hour|\d+ hours) ago$/],
    ["minutes", (ms) => ms >= 60e3 && ms < 3600e3, /^\d+ min ago$/]
  ];
  for (const [unit, test, shape] of agoCases) {
    const index = videoWhere((item) => item.lastPlayedAt != null && test(Date.now() - item.lastPlayedAt));
    if (index >= 0) window.mockup.choose(index);
    check(`layout@${width}: Last played counts ${unit} for a play that long ago (${statValue("Last played")})`, index >= 0 && shape.test(statValue("Last played")));
  }
  const neverPlayed = videoWhere((item) => item.lastPlayedAt == null);
  window.mockup.choose(neverPlayed);
  const firstPlay = statValue("Last played");
  window.mockup.choose(neverPlayed);
  check(`layout@${width}: Last played is the time before this play: Never on a first play, Just now on the next (${firstPlay}, ${statValue("Last played")})`,
    firstPlay === "Never" && statValue("Last played") === "Just now");
  const card = (label) => [...$("stats-body").querySelectorAll(".stat-card")].find((el) => el.lastChild.textContent === label)?.firstChild.textContent;
  const liveVideos = items.filter((item) => !item.removed && item.type === "video");
  check(`layout@${width}: the audio cards count only videos whose audio is known (${card("Videos with audio")} with, ${card("Videos without audio")} without)`,
    card("Videos with audio") === liveVideos.filter((item) => item.hasAudio === true).length.toLocaleString() &&
      card("Videos without audio") === liveVideos.filter((item) => item.hasAudio === false).length.toLocaleString() &&
      liveVideos.some((item) => item.hasAudio == null));
  const statsHints = () => [...$("stats-body").querySelectorAll(".filter-hint")].map((el) => el.textContent);
  document.querySelector('input[name="mock-stats-load"][value="failed"]').click();
  const [fileSection, librarySection] = $("stats-body").querySelectorAll(".stats-section");
  check(`layout@${width}: a failed first load says so once, in place of the cards, and the current file keeps its name and path (${statsHints().join(" | ")})`,
    statsHints().length === 1 && librarySection.textContent.includes("Stats load failed: HTTP 500") &&
      !$("stats-body").querySelector("dl, .stats-grid") && fileSection.textContent.includes(np()) && !!fileSection.querySelector(".stats-path"));
  document.querySelector('input[name="mock-stats-load"][value="removed"]').click();
  const [removedFile, removedLibrary] = $("stats-body").querySelectorAll(".stats-section");
  check(`layout@${width}: a playing file the server no longer has shows only its name and path, and the library's cards load (${removedLibrary.querySelectorAll(".stat-card").length} cards)`,
    statsHints().length === 0 && !removedFile.querySelector("dl") && removedFile.querySelector(".stats-file-name")?.textContent === np() &&
      !!removedFile.querySelector(".stats-path") && removedLibrary.querySelectorAll(".stat-card").length === 11);
  document.querySelector('input[name="mock-stats-load"][value="loads"]').click();
  window.mockup.situation("nolibrary");
  check(`layout@${width}: running without a library, Stats shows the server's message (${statsHints().join(" | ")})`,
    statsHints().length === 1 && statsHints()[0].startsWith("Running without a library.") && !$("stats-body").querySelector("dl, .stats-grid"));
  window.mockup.situation("connected");
  check(`layout@${width}: and its stats again once the server has one`, !!$("stats-body").querySelector("dl") && !!$("stats-body").querySelector(".stats-grid"));

  // Settings: Advance after is a setting's field. A value that is not valid is flagged while the field has focus and is
  // not kept; a valid one is saved only on Enter or when the field is left, with the green check; leaving the field, or
  // the Settings tab hiding or the panel closing, shows the value saved again.
  $("tab-btn-settings").click();
  const advance = $("set-advance");
  const keptAdvance = () => window.localStorage.getItem("rr-mockup.advanceAfter");
  // The check is the font's glyph, one character, not its name as text.
  const advanceSaved = () => {
    const wrap = advance.closest(".vfield");
    const icon = wrap.querySelector(".vfield-saved");
    return wrap.classList.contains("is-saved") && icon?.dataset.icon === "check_circle" && icon.textContent.length === 1;
  };
  check(`layout@${width}: Advance after starts at 10`, advance.value === "10");
  advance.focus();
  input(advance, "0");
  check(`layout@${width}: Advance after flags 0 and keeps 10`, advance.getAttribute("aria-invalid") === "true" && keptAdvance() === null);
  advance.blur();
  check(`layout@${width}: leaving Advance after with 0 shows 10 again, unflagged, with no check`, advance.value === "10" && !advance.hasAttribute("aria-invalid") && !advanceSaved());
  advance.focus();
  ["1", "12", "120"].forEach((text) => input(advance, text));
  await sleep(750);
  check(`layout@${width}: Advance after saves nothing while it is typed`, keptAdvance() === null);
  key(advance, "Enter");
  check(`layout@${width}: and saves 120 on Enter, never 1 or 12, with the green check`, keptAdvance() === "120" && advanceSaved());
  input(advance, "1");
  input(advance, "");
  await sleep(750);
  check(`layout@${width}: clearing it with Backspace keeps 120`, keptAdvance() === "120" && advance.getAttribute("aria-invalid") === "true" && !advanceSaved());
  $("tab-btn-library").click();
  $("tab-btn-settings").click();
  check(`layout@${width}: the Settings tab hiding shows 120 again, unflagged`, advance.value === "120" && !advance.hasAttribute("aria-invalid"));
  input(advance, "abc");
  closePanel();
  openTab("settings");
  check(`layout@${width}: and so does the panel closing`, advance.value === "120" && !advance.hasAttribute("aria-invalid"));
  input(advance, "8");
  key(advance, "Enter");
  check(`layout@${width}: Advance after keeps 8 at once on Enter`, !advance.hasAttribute("aria-invalid") && keptAdvance() === "8");
  advance.blur();
  check(`layout@${width}: the shortcut reference lists the bindings, H among them`, $("shortcut-list").querySelectorAll("dt").length === 17 &&
    [...$("shortcut-list").querySelectorAll("dt")].some((dt) => dt.textContent === "H"));
  const escRow = [...$("shortcut-list").querySelectorAll("dt")].find((dt) => dt.textContent === "Esc")?.nextElementSibling.textContent;
  check(`layout@${width}: Esc's line names what it closes, in order (${escRow})`, escRow === "Close the top dialog, the notifications list, or the panel, stop selecting, or leave fullscreen");
  const sectionNames = [...$("settings-body").querySelectorAll(".settings-section h3")].map((h) => h.textContent).join(", ");
  check(`layout@${width}: Settings is in sections: ${sectionNames}`, sectionNames === "Playback, Audio, Player controls, Appearance, Notifications, Panel, Keyboard shortcuts, Diagnostics");
  const sectionOf = (id) => $(id).closest(".settings-section").querySelector("h3").textContent;
  check(`layout@${width}: each setting sits in its section`,
    sectionOf("set-advance") === "Playback" && sectionOf("set-ambient") === "Appearance" && document.querySelector('input[name="set-seek"]').closest(".settings-section").querySelector("h3").textContent === "Playback" &&
    document.querySelector('input[name="set-volstep"]').closest(".settings-section").querySelector("h3").textContent === "Audio" && sectionOf("set-hide-after") === "Player controls");
  const volumeSteps = [...document.querySelectorAll('input[name="set-volstep"]')];
  check(`layout@${width}: the volume step offers ${volumeSteps.map((radio) => radio.closest("label").textContent.trim()).join(", ")}, with ${volumeSteps.find((radio) => radio.checked)?.value}% chosen by default`,
    volumeSteps.map((radio) => radio.value).join() === "1,2,5,10" && volumeSteps.map((radio) => radio.closest("label").textContent.trim()).join() === "1%,2%,5%,10%" &&
    volumeSteps.find((radio) => radio.checked)?.value === "5");
  const settingsText = $("settings-body").textContent;
  check(`layout@${width}: no mockup notes, desktop asides, or key badges in the setting labels`,
    !settingsText.includes("photo duration, renamed") && !settingsText.includes("as on the desktop") && !settingsText.includes("desktop's player view") &&
    !$("settings-body").querySelector(".setting-label kbd") && !settingsText.includes("step one frame"));
  check(`layout@${width}: Keyboard shortcuts starts collapsed, with a chevron`, !$("set-shortcuts").open && !!$("set-shortcuts").querySelector("summary .setting-more-chevron"));
  check(`layout@${width}: Loudness normalization sits in Audio, right under Enhanced audio, and Compression right under it`,
    sectionOf("set-loudness") === "Audio" && $("set-loudness").closest(".setting").previousElementSibling === $("set-enhanced-audio").closest(".setting") &&
    $("set-compression").closest(".setting").previousElementSibling === $("set-loudness").closest(".setting"));

  {
    // Autoplay modes and Loop stops autoplay. The check moves the page's clock on, so an item's timer or length passes at
    // once, and the page's own interval then acts on it.
    const loopStops = $("set-loop-stops");
    check(`layout@${width}: Loop stops autoplay sits in Playback after Advance after, on by default, with its hint`,
      sectionOf("set-loop-stops") === "Playback" && loopStops.closest(".setting").previousElementSibling === $("set-advance").closest(".setting") && loopStops.checked &&
      $("set-loop-stops-hint").textContent.startsWith("With Autoplay and Loop on, the item repeats and nothing advances."));
    const realNow = window.performance.now.bind(window.performance);
    let skipped = 0;
    window.performance.now = () => realNow() + skipped;
    const skip = async (seconds) => {
      skipped += seconds * 1000;
      await sleep(300);
    };
    const setAdvanceAfter = (seconds) => {
      openTab("settings");
      advance.focus();
      input(advance, String(seconds));
      key(advance, "Enter");
      advance.blur();
    };
    const autoplayMode = (value) => document.querySelector(`input[name="set-autoplay"][value="${value}"]`).click();
    const setButton = (id, on) => {
      if ($(id).classList.contains("active") !== on) $(id).click();
    };
    const playingNow = () => {
      const { ids, index } = window.mockup.history();
      return ids[index];
    };
    const begin = (item) => window.mockup.choose(item.id);
    const position = () => Number($("seek").value);
    const playableVideos = items.filter((item) => item.type === "video" && playable(item));
    const shortVideo = playableVideos.reduce((a, b) => (b.duration < a.duration ? b : a));
    // Advance after is 10 seconds longer than the shortest video, so it is shorter than the timer and the rest are longer.
    const timer = shortVideo.duration + 10;
    const longVideo = playableVideos.find((item) => item.duration > 3 * timer + 60);
    const nextVideo = playableVideos.find((item) => item !== shortVideo && item !== longVideo);
    const loopPhoto = items.find((item) => item.type === "photo" && playable(item));
    const autoplayWasOn = $("autoplay-btn").classList.contains("active");
    const loopWasOn = $("loop-btn").classList.contains("active");
    setAdvanceAfter(timer);
    closePanel();
    setButton("autoplay-btn", true);
    setButton("loop-btn", true);

    // Loop stops autoplay on: with Autoplay and Loop on, nothing advances, and a repeat records no other play.
    autoplayMode("normal");
    begin(longVideo);
    let plays = longVideo.plays;
    await skip(longVideo.duration + 1);
    check(`layout@${width}: in Normal mode, with Autoplay and Loop on, a video repeats whole, without advancing or counting another play (${$("time-display").textContent})`,
      playingNow() === longVideo.id && position() < 2 && longVideo.plays === plays);
    begin(loopPhoto);
    plays = loopPhoto.plays;
    await skip(timer + 1);
    check(`layout@${width}: and a photo stays, with Play and the bar disabled, as only its timer starts over (${chip()})`,
      playingNow() === loopPhoto.id && $("play-btn").disabled && $("seek").disabled && chip().includes("Photo looping") && loopPhoto.plays === plays);
    autoplayMode("timer");
    await skip(timer + 1);
    check(`layout@${width}: a photo stays in Timer mode too`, playingNow() === loopPhoto.id && chip().includes("Photo looping"));
    // Timer mode's repeating stretch: Advance after seconds from the start of the item, from where a seek lands, or from
    // where the video is when the stretch starts to apply, up to the video's end when that comes first, shown faintly
    // on the scrub bar.
    const stretch = $("seek-loop");
    const shownStretch = () => (stretch.hidden ? "hidden" : `${stretch.style.getPropertyValue("--loop-from")}–${stretch.style.getPropertyValue("--loop-to")}`);
    const showsStretch = (from, to, duration) =>
      !stretch.hidden && Math.abs(Number(stretch.style.getPropertyValue("--loop-from")) - from / duration) < 0.005 &&
      Math.abs(Number(stretch.style.getPropertyValue("--loop-to")) - to / duration) < 0.005;
    check(`layout@${width}: the scrub bar sits in a wrapper with the stretch behind it, hidden while no stretch repeats`,
      $("seek").parentElement === $("seek-wrap") && stretch.parentElement === $("seek-wrap") && stretch.hidden);
    begin(longVideo);
    plays = longVideo.plays;
    check(`layout@${width}: in Timer mode, a video longer than Advance after shows its first Advance after seconds faintly on the bar (${shownStretch()})`,
      showsStretch(0, timer, longVideo.duration));
    await skip(timer + 1);
    check(`layout@${width}: and repeats them, without counting another play (${$("time-display").textContent})`,
      playingNow() === longVideo.id && position() < 2 && longVideo.plays === plays);
    const landing = Math.round(longVideo.duration / 2);
    input($("seek"), landing);
    check(`layout@${width}: a seek starts the stretch where it lands (${shownStretch()})`, showsStretch(landing, landing + timer, longVideo.duration));
    await skip(timer + 1);
    check(`layout@${width}: and the video repeats from there (${$("time-display").textContent})`, playingNow() === longVideo.id && position() >= landing && position() < landing + 2);
    press("l");
    check(`layout@${width}: so does a seek by L (${shownStretch()})`, showsStretch(position(), position() + timer, longVideo.duration) && position() >= landing + 5);
    const nearEnd = longVideo.duration - 5;
    input($("seek"), nearEnd);
    check(`layout@${width}: a stretch that would run past the end stops at it (${shownStretch()})`, showsStretch(nearEnd, longVideo.duration, longVideo.duration));
    await skip(6);
    check(`layout@${width}: and repeats from where the seek landed (${$("time-display").textContent})`, playingNow() === longVideo.id && position() >= nearEnd && position() < nearEnd + 2);
    const endStretch = longVideo.duration - timer;
    input($("seek"), longVideo.duration);
    check(`layout@${width}: a seek to the end starts the stretch Advance after seconds before it, and the video there (${shownStretch()})`,
      showsStretch(endStretch, longVideo.duration, longVideo.duration) && position() >= endStretch && position() < endStretch + 1);
    await skip(timer + 1);
    check(`layout@${width}: and repeats from there (${$("time-display").textContent})`, playingNow() === longVideo.id && position() >= endStretch && position() < endStretch + 2);
    setButton("loop-btn", false);
    check(`layout@${width}: with Loop off, the bar shows no stretch`, stretch.hidden);
    begin(longVideo);
    await skip(timer / 2);
    const turnedOnAt = position();
    setButton("loop-btn", true);
    check(`layout@${width}: turning Loop on starts the stretch where the video is (${shownStretch()})`, showsStretch(turnedOnAt, turnedOnAt + timer, longVideo.duration));
    await skip(timer + 1);
    check(`layout@${width}: and it repeats from there (${$("time-display").textContent})`, playingNow() === longVideo.id && position() >= turnedOnAt && position() < turnedOnAt + 2);
    // A video that played to its end with Autoplay and Loop off starts the stretch as a seek to its end does.
    setButton("loop-btn", false);
    setButton("autoplay-btn", false);
    begin(longVideo);
    input($("seek"), longVideo.duration - 1);
    await skip(2);
    const endedChip = chip();
    setButton("autoplay-btn", true);
    setButton("loop-btn", true);
    check(`layout@${width}: turning Autoplay and Loop on at a video's end starts the stretch Advance after seconds before it, and the video there (${endedChip}, ${shownStretch()})`,
      endedChip.includes("Ended") && showsStretch(endStretch, longVideo.duration, longVideo.duration) && position() >= endStretch && position() < endStretch + 1);
    $("play-btn").click();
    await skip(timer + 1);
    check(`layout@${width}: and once played, it repeats from there (${$("time-display").textContent})`, playingNow() === longVideo.id && position() >= endStretch && position() < endStretch + 2);
    begin(shortVideo);
    check(`layout@${width}: a shorter one's stretch is the whole video (${shownStretch()})`, showsStretch(0, shortVideo.duration, shortVideo.duration));
    await skip(shortVideo.duration + 1);
    const shortRepeated = position() < 2;
    await skip(timer);
    check(`layout@${width}: and it repeats whole, without advancing`, shortRepeated && playingNow() === shortVideo.id);
    input($("seek"), shortVideo.duration);
    check(`layout@${width}: a seek to its end starts the stretch at 0, and the video there (${shownStretch()})`,
      showsStretch(0, shortVideo.duration, shortVideo.duration) && position() < 1);
    autoplayMode("normal");
    check(`layout@${width}: in Normal mode, the bar shows no stretch`, stretch.hidden);
    autoplayMode("timer");

    // Loop stops autoplay off: autoplay goes on with Loop on.
    change(loopStops, false);
    check(`layout@${width}: Loop stops autoplay is kept on this device`, window.localStorage.getItem("rr-mockup.loopStopsAutoplay") === "false");
    autoplayMode("normal");
    begin(loopPhoto);
    check(`layout@${width}: with it off, a photo with Loop on shows its timer on the bar, and Play works (${chip()})`,
      !$("play-btn").disabled && !$("seek").disabled && chip().includes("Photo timer"));
    queue.push(nextVideo.id);
    await skip(timer + 1);
    check(`layout@${width}: and advances after Advance after`, playingNow() === nextVideo.id);
    begin(shortVideo);
    plays = shortVideo.plays;
    await skip(shortVideo.duration + 1);
    const normalShortRepeated = playingNow() === shortVideo.id && position() < 2;
    await skip(10);
    const finishesRepeat = playingNow() === shortVideo.id;
    queue.push(nextVideo.id);
    await skip(shortVideo.duration);
    check(`layout@${width}: in Normal mode, a video shorter than Advance after repeats until it has run, finishes the repeat in progress, then advances`,
      normalShortRepeated && finishesRepeat && playingNow() === nextVideo.id && shortVideo.plays === plays);
    begin(longVideo);
    await skip(timer + 1);
    const pastTimer = playingNow() === longVideo.id;
    queue.push(nextVideo.id);
    await skip(longVideo.duration);
    check(`layout@${width}: and a longer one plays on past it, then advances at its end`, pastTimer && playingNow() === nextVideo.id);
    autoplayMode("timer");
    begin(longVideo);
    queue.push(nextVideo.id);
    await skip(timer + 1);
    check(`layout@${width}: in Timer mode, a video longer than Advance after advances at it`, playingNow() === nextVideo.id);
    begin(shortVideo);
    await skip(shortVideo.duration + 1);
    const timerShortRepeated = playingNow() === shortVideo.id && position() < 2;
    queue.push(nextVideo.id);
    await skip(10);
    check(`layout@${width}: and a shorter one repeats until it has run, then advances`, timerShortRepeated && playingNow() === nextVideo.id);

    // Timer mode with Loop off: every item advances after the timer, and pausing a video holds it.
    setButton("loop-btn", false);
    begin(longVideo);
    await skip(timer / 2);
    $("play-btn").click();
    await skip(timer * 2);
    const heldWhilePaused = playingNow() === longVideo.id;
    $("play-btn").click();
    queue.push(nextVideo.id);
    await skip(timer / 2 + 1);
    check(`layout@${width}: with Loop off, Timer mode advances an unfinished video after Advance after, and pausing it holds the timer`,
      heldWhilePaused && playingNow() === nextVideo.id);
    begin(shortVideo);
    queue.push(nextVideo.id);
    await skip(shortVideo.duration + 1);
    check(`layout@${width}: and a video shorter than Advance after advances at its end`, playingNow() === nextVideo.id);

    // With Autoplay off, Loop works as before in either mode: a video repeats whole.
    setButton("autoplay-btn", false);
    setButton("loop-btn", true);
    begin(longVideo);
    await skip(timer + 1);
    const pastFirstSeconds = position() > timer;
    await skip(longVideo.duration);
    check(`layout@${width}: with Autoplay off, Loop repeats a video whole in Timer mode too`, pastFirstSeconds && playingNow() === longVideo.id && position() < 2);

    // A photo the user paused runs on once Loop hides its bar, since Play can't resume it then, and keeps its time.
    change(loopStops, true);
    setButton("loop-btn", false);
    setButton("autoplay-btn", true);
    begin(loopPhoto);
    await skip(3);
    $("play-btn").click();
    const pausedAt = $("time-display").textContent;
    $("loop-btn").click();
    check(`layout@${width}: turning Loop on runs a photo timer the user paused, as Play is disabled then (${chip()})`, chip().includes("Photo looping") && $("play-btn").disabled);
    $("loop-btn").click();
    check(`layout@${width}: and turning it off shows the timer again with its time kept (${pausedAt}, ${$("time-display").textContent})`,
      pausedAt.startsWith("0:03 /") && $("time-display").textContent === pausedAt && chip().includes("Photo timer"));
    autoplayMode("normal");
    setButton("autoplay-btn", autoplayWasOn);
    setButton("loop-btn", loopWasOn);
    setAdvanceAfter(8);
  }
  const diagValues =[...$("settings-body").querySelectorAll(".diag dd")].map((value) => value.textContent);
  check(`layout@${width}: Diagnostics show the ids in full, and the client type and device name as the WebUI builds them`,
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(diagValues[0]) && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(diagValues[1]) &&
    $("diag-type").textContent === "web" && $("diag-device").textContent.startsWith("Web Browser (") && $("diag-device").textContent.endsWith(")"));
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
  check(`layout@${width}: the player keeps its rounded corners in fullscreen (${playerCorners()})`, playerCorners() === "8px inset(0 round 8px)");
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
  key($("set-hide-after"), "Enter");
  check(`layout@${width}: and keeps 1, with the green check`, window.localStorage.getItem("rr-mockup.hideAfter") === "1" && $("set-hide-after").closest(".vfield").classList.contains("is-saved"));
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
  // A touch moving over the player isn't activity, and a tap shows them through its click, which then lands on the
  // player, so a tap where a hidden button sits only shows them.
  $("media").dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, pointerType: "touch" }));
  check(`layout@${width}: a touch moving over the player doesn't show them`, !controlsUp());
  $("media").click();
  check(`layout@${width}: and a tap's click does`, controlsUp());
  await sleep(1300);
  // A press on a control restarts the countdown, as a tap on one does on the iPad, where Safari leaves it no focus.
  moveOverPlayer();
  await sleep(700);
  $("loop-btn").dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
  await sleep(700);
  check(`layout@${width}: a press on a control restarts the countdown`, controlsUp());
  await sleep(600);
  check(`layout@${width}: and they hide once it runs out from there`, !controlsUp());
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
  // A photo's timer ending as autoplay moves on isn't a pause, so the controls stay hidden, as in the app.
  const autoplayWas = $("autoplay-btn").classList.contains("active");
  const loopWas = $("loop-btn").classList.contains("active");
  if (!autoplayWas) $("autoplay-btn").click();
  if (loopWas) $("loop-btn").click();
  window.mockup.choose(2);
  queue.push(3);
  await sleep(1300);
  input($("seek"), Number($("seek").max) - 0.05);
  await sleep(200);
  check(`layout@${width}: a photo's timer ending as autoplay moves on leaves them hidden (${np()})`, !controlsUp() && np() === items[3].name);
  if (!autoplayWas) $("autoplay-btn").click();
  if (loopWas) $("loop-btn").click();
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
  key($("set-hide-after"), "Enter");

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
  // The volume indicator: the percentage, with Mute's icon, centered over the player, outside the controls, at a low
  // opacity, and hidden from screen readers, since the slider carries the value.
  const volumeIndicator = $("volume-indicator");
  const volumeText = () => $("volume-indicator-text").textContent;
  const volumeShown = () => volumeIndicator.classList.contains("is-shown") && window.getComputedStyle(volumeIndicator).opacity === "0.7";
  const indicatorStyle = window.getComputedStyle(volumeIndicator);
  check(`layout@${width}: the notch shows the volume indicator, centered over the player outside the controls (${volumeText()}, ${indicatorStyle.opacity}, ${indicatorStyle.transform})`,
    volumeShown() && volumeText() === "55%" && volumeIndicator.querySelector(".material-symbol-icon").dataset.icon === muteIcon() &&
    volumeIndicator.parentElement === $("media") && !$("overlay-controls").contains(volumeIndicator) && volumeIndicator.getAttribute("aria-hidden") === "true" &&
    indicatorStyle.position === "absolute" && indicatorStyle.top === "50%" && indicatorStyle.left === "50%" && indicatorStyle.transform === "translate(-50%, -50%)");
  $("media").classList.remove("controls-visible");
  check(`layout@${width}: and it stays shown while the controls are hidden (${window.getComputedStyle(volumeIndicator).opacity})`, volumeShown());
  $("media").classList.add("controls-visible");
  // Each step below starts with the indicator hidden, so it shows only if that step shows it.
  const hideVolumeIndicator = () => volumeIndicator.classList.remove("is-shown");
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
  hideVolumeIndicator();
  const photoPrevented = wheel(-100);
  const photoWheelShown = volumeShown() && volumeText() === "60%";
  hideVolumeIndicator();
  touches("touchstart", [300, 340]);
  const photoDragPrevented = touches("touchmove", [270, 310]);
  touches("touchend", []);
  check(`layout@${width}: on a photo the wheel and a two-finger drag set the volume too, a step each, and still don't scroll the page, each showing the indicator (${volumeNow()}, ${volumeText()})`,
    volumeNow() === 65 && photoPrevented && photoDragPrevented && photoWheelShown && volumeShown() && volumeText() === "65%");
  window.mockup.choose(3);
  check(`layout@${width}: and the next video plays at the level set on the photo (${volumeNow()})`, volumeNow() === 65);
  input($("volume"), "55");
  hideVolumeIndicator();
  touches("touchstart", [300, 340]);
  const dragPrevented = touches("touchmove", [240, 280]);
  touches("touchend", []);
  check(`layout@${width}: two fingers dragged up 60 px raise it two steps, claimed from the browser, with the indicator (${volumeNow()}, ${volumeText()})`,
    volumeNow() === 65 && dragPrevented && window.getComputedStyle($("media")).touchAction === "none" && controlsUp() && volumeShown() && volumeText() === "65%");
  await sleep(850);
  check(`layout@${width}: the indicator fades out 800 ms after the volume stops changing (${window.getComputedStyle(volumeIndicator).opacity})`,
    !volumeIndicator.classList.contains("is-shown") && window.getComputedStyle(volumeIndicator).opacity === "0");
  input($("volume"), "60");
  check(`layout@${width}: the slider doesn't show it`, !volumeIndicator.classList.contains("is-shown"));
  // The muted-volume rules. Raising the volume while muted, by the slider, the wheel, a two-finger drag, or ], unmutes
  // and starts from 0; lowering it while muted changes nothing; and lowering it to 0 while not muted mutes, unmuting
  // then bringing back the volume from before the change that reached 0. A slider drag runs from its press to its
  // release, and a two-finger drag from its second finger to its fingers lifting.
  const slide = (...values) => {
    $("volume").dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    values.forEach((value) => input($("volume"), String(value)));
    document.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
  };
  // Each move's distance up, in px; a negative one moves down.
  const dragTwoFingers = (...ups) => {
    let y = 300;
    touches("touchstart", [y, y + 40]);
    ups.forEach((up) => touches("touchmove", [(y -= up), y + 40]));
    touches("touchend", []);
  };
  const sound = () => `${muteLit() ? "muted" : "unmuted"} ${$("volume").value}`;
  const unmute = () => {
    if (muteLit()) $("mute-btn").click();
    return $("volume").value;
  };
  input($("volume"), "60");
  $("mute-btn").click();
  slide(10, 30);
  const slidUp = sound();
  $("mute-btn").click();
  check(`layout@${width}: raising the slider while muted unmutes from 0, so Mute then remembers the new volume, not the old (${slidUp}, then ${unmute()})`,
    slidUp === "unmuted 30" && $("volume").value === "30");
  const raisedWhileMuted = (raise) => {
    input($("volume"), "60");
    $("mute-btn").click();
    raise();
    const raised = sound();
    $("mute-btn").click();
    return `${raised}, then ${unmute()}`;
  };
  const raises = [raisedWhileMuted(() => wheel(-100)), raisedWhileMuted(() => dragTwoFingers(30)), raisedWhileMuted(() => press("]"))];
  check(`layout@${width}: a wheel notch, a two-finger drag, or ] up while muted unmutes and starts from 0, a step up, and Mute then remembers that (${raises.join("; ")})`,
    raises.every((raised) => raised === "unmuted 5, then 5"));
  input($("volume"), "60");
  $("mute-btn").click();
  hideVolumeIndicator();
  wheel(100);
  const loweredIndicator = `${volumeShown() ? "shown" : "hidden"} ${volumeText()} ${volumeIndicator.querySelector(".material-symbol-icon").dataset.icon}`;
  dragTwoFingers(-30);
  press("[");
  const lowered = sound();
  check(`layout@${width}: lowering the volume while muted, by a wheel notch, a two-finger drag, or [, changes nothing, though the indicator shows 0% with Mute's icon (${lowered}, ${loweredIndicator}, then ${unmute()})`,
    lowered === "muted 0" && loweredIndicator === "shown 0% volume_off" && $("volume").value === "60");
  input($("volume"), "40");
  slide(25, 10, 0);
  const slidToZero = `${sound()} ${muteIcon()}`;
  check(`layout@${width}: dragging the slider to 0 mutes, and unmuting brings back the volume from where the drag started (${slidToZero}, then ${unmute()})`,
    slidToZero === "muted 0 volume_off" && $("volume").value === "40");
  $("mute-btn").click();
  slide(20, 0);
  const backToZero = sound();
  check(`layout@${width}: a slider drag that starts muted, raises the volume, and comes back to 0 leaves the remembered volume as it was (${backToZero}, then ${unmute()})`,
    backToZero === "muted 0" && $("volume").value === "40");
  input($("volume"), "15");
  dragTwoFingers(-30, -30, -30);
  const draggedToZero = sound();
  check(`layout@${width}: two fingers dragged down to 0 mute, and unmuting brings back the volume from where the drag started (${draggedToZero}, then ${unmute()})`,
    draggedToZero === "muted 0" && $("volume").value === "15");
  const steppedToZero = (step) => {
    input($("volume"), "8");
    step();
    step();
    const stepped = sound();
    return `${stepped}, then ${unmute()}`;
  };
  const stepsToZero = [steppedToZero(() => wheel(100)), steppedToZero(() => press("["))];
  check(`layout@${width}: a wheel notch or [ down to 0 mutes, and unmuting brings back the volume from before that notch or press (${stepsToZero.join("; ")})`,
    stepsToZero.every((stepped) => stepped === "muted 0, then 3"));
  // It fades in quickly and out a little slower; with reduced motion it shows and hides at once.
  const allRules = (rules) => [...rules].flatMap((rule) => [rule, ...(rule.cssRules ? allRules(rule.cssRules) : [])]);
  const reducedIndicatorRules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    .filter((rule) => rule.conditionText?.includes("prefers-reduced-motion"))
    .flatMap((rule) => allRules(rule.cssRules)).filter((rule) => rule.selectorText?.includes(".volume-indicator"));
  const reducedSelectors = reducedIndicatorRules.filter((rule) => rule.style.transition === "none").flatMap((rule) => rule.selectorText.split(",").map((part) => part.trim()));
  check(`layout@${width}: the indicator fades in over 120 ms and out over 250 ms, and not at all with reduced motion (${ruleStyle(".volume-indicator", "transition")}, ${ruleStyle(".volume-indicator.is-shown", "transition-duration")}, ${reducedSelectors.join(" | ")})`,
    ruleStyle(".volume-indicator", "transition") === "opacity 0.25s" && ruleStyle(".volume-indicator.is-shown", "transition-duration") === "0.12s" &&
    reducedSelectors.includes(".volume-indicator") && reducedSelectors.includes(".volume-indicator.is-shown"));
  check(`layout@${width}: the player is clipped by a rounded shape as well, which keeps its corners on iOS (${window.getComputedStyle($("media")).clipPath})`,
    /^inset\(0(px)? round /.test(window.getComputedStyle($("media")).clipPath));
  // The player keeps its rounded corners in every view: no rule, the browser's fullscreen included, gives it others.
  const cornerRules = (rules) => [...rules].flatMap((rule) => [rule, ...(rule.cssRules ? cornerRules(rule.cssRules) : [])]);
  const playerCornerRules = cornerRules([...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]))
    .filter((rule) => rule.selectorText?.includes("media-container") && rule.selectorText.split(",").some((part) => part.trim().endsWith(".media-container")))
    .filter((rule) => rule.style?.borderRadius || rule.style?.clipPath || rule.style?.getPropertyValue("--player-radius"))
    .map((rule) => rule.selectorText);
  check(`layout@${width}: and only the player's own rule sets its corners, so they stay rounded in fullscreen and on a phone on its side (${playerCornerRules.join(" | ")})`,
    playerCornerRules.join() === ".media-container");
  input($("volume"), "100");

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
  // Each slider is named by its label alone, and the value shown is its value text.
  const sliderNames = ["rate", "fade", "blur", "dark", "light", "saturation"].map((key) => {
    const slider = $(`set-ambient-${key}`);
    return `${document.getElementById(slider.getAttribute("aria-labelledby"))?.textContent}=${slider.getAttribute("aria-valuetext")}`;
  });
  check(`layout@${width}: its sliders are named by their labels, with the value shown as their value text (${sliderNames.join(", ")})`,
    sliderNames.join() === "Update rate=1 per second,Fade time=2 s,Blur=64 px,Strength in the dark theme=50%,Strength in the light theme=75%,Saturation=100%");
  setSlider("rate", 4);
  check(`layout@${width}: and a slider's value text follows it as it moves (${$("set-ambient-rate").getAttribute("aria-valuetext")})`,
    $("set-ambient-rate").getAttribute("aria-valuetext") === "4 per second");
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
  // margin, 2 px, neither slider's wrapper adds any, and the time takes its own width, with its digits all one width.
  const styleOf = (el) => window.getComputedStyle(el);
  const unset = (value) => value === "" || value === "0px";
  const seekRow = document.querySelector(".overlay-seek-row");
  const timeStyle = styleOf($("time-display"));
  const wrapStyles = [styleOf($("seek-wrap")), styleOf($("volume-wrap"))];
  const sliderMargins = [$("seek"), $("volume")].map((el) => `${styleOf(el).marginLeft} ${styleOf(el).marginRight}`);
  check(`layout@${width}: the scrub bar, the time, Mute, and the volume slider sit the row's 12 px gap apart (gap ${styleOf(seekRow).gap}, slider margins ${sliderMargins.join(", ")}, time ${timeStyle.minWidth || "no minimum"} ${timeStyle.textAlign || "start"} ${timeStyle.fontVariantNumeric})`,
    [...seekRow.children].map((el) => el.id).join() === "seek-wrap,time-display,mute-btn,volume-wrap" && styleOf(seekRow).gap === "12px" &&
    sliderMargins.every((margins) => margins === "0px 0px") &&
    wrapStyles.every((wrapStyle) => [wrapStyle.marginLeft, wrapStyle.marginRight, wrapStyle.paddingLeft, wrapStyle.paddingRight].every(unset)) &&
    timeStyle.minWidth === "" && timeStyle.textAlign === "" && timeStyle.fontVariantNumeric === "tabular-nums");
  // Mute keeps its 44 px target, and its box reaches into the gap above the row and the padding below it, so the row stays
  // as tall as its 24 px sliders and the controls don't move. The transport row no longer holds it.
  const muteStyle = styleOf($("mute-btn"));
  // A margin no rule sets reads as empty, which is none.
  const pixels = (value) => parseFloat(value) || 0;
  const muteRowHeight = pixels(muteStyle.height) + pixels(muteStyle.marginTop) + pixels(muteStyle.marginBottom);
  check(`layout@${width}: Mute keeps its 44 px target without making the seek row taller than its sliders (${muteStyle.width} by ${muteStyle.height}, ${muteRowHeight} px in the row, sliders ${styleOf($("seek")).height})`,
    muteStyle.width === "44px" && muteStyle.height === "44px" && muteRowHeight <= parseFloat(styleOf($("seek")).height) && styleOf($("volume")).height === "24px" &&
    pixels(muteStyle.marginTop) >= -pixels(styleOf(document.querySelector(".overlay-controls")).gap) - 4 &&
    pixels(muteStyle.marginBottom) >= -pixels(styleOf(document.querySelector(".overlay-controls")).paddingBottom) &&
    !document.querySelector(".overlay-controls-transport #mute-btn"));
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
  // ? is no shortcut: Firefox takes it for its quick find. On most keyboards it is Shift+/, so it arrives with Shift held.
  press("?", document.body, { shiftKey: true });
  check(`layout@${width}: ? does nothing, since Firefox takes it`, $("panel").hidden);
  $("set-shortcuts").open = false;
  closePanel();
  press("h");
  check(`layout@${width}: H opens Settings with the shortcuts expanded`, !$("panel").hidden && !$("tab-settings").hidden && $("set-shortcuts").open && document.activeElement === $("set-shortcuts").querySelector("summary"));
  $("set-shortcuts").open = false;
  closePanel();
  press("h", $("lib-search"));
  check(`layout@${width}: but not while typing`, $("panel").hidden);
  press("2");
  check(`layout@${width}: 2 opens the Filter tab`, !$("panel").hidden && !$("tab-filter").hidden);
  press("2");
  check(`layout@${width}: 2 again closes the panel`, $("panel").hidden);
  const volumeBefore = Number($("volume").value);
  const messagesBeforeVolume = messages.entries().length;
  $("volume-indicator").classList.remove("is-shown");
  press("[");
  check(`layout@${width}: [ lowers the volume by the step (${volumeBefore} to ${$("volume").value}), with no message, and shows the volume indicator (${$("volume-indicator-text").textContent})`,
    Number($("volume").value) === volumeBefore - 5 && messages.entries().length === messagesBeforeVolume &&
    $("volume-indicator").classList.contains("is-shown") && $("volume-indicator-text").textContent === `${volumeBefore - 5}%`);
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
  // A focused slider keeps its own keys, and every other key is a shortcut there, as after a mouse drag of the bar.
  const nameBeforeSlider = $("np-name").textContent;
  press("ArrowRight", $("seek"));
  check(`layout@${width}: → on the focused scrub bar is the bar's, not Next`, $("np-name").textContent === nameBeforeSlider);
  press("k", $("seek"));
  check(`layout@${width}: but K there pauses (${chip()})`, chip().includes("Paused"));
  press(" ", $("seek"));
  check(`layout@${width}: and Space there plays (${chip()})`, chip().includes("Playing"));
  // A held key repeats only seeks, frame steps, and volume steps.
  const favoriteBeforeHeld = $("favorite-btn").classList.contains("active");
  press("f", document.body, { repeat: true });
  check(`layout@${width}: a held F acts once, not again on each repeat`, $("favorite-btn").classList.contains("active") === favoriteBeforeHeld);
  press("k");
  const seekBeforeHeld = Number($("seek").value);
  press("l", document.body, { repeat: true });
  check(`layout@${width}: and a held L keeps seeking (${seekBeforeHeld.toFixed(2)} to ${Number($("seek").value).toFixed(2)})`,
    Math.abs(Number($("seek").value) - Math.min(items[3].duration, seekBeforeHeld + 5)) < 0.01);
  press("k");
  // A held key that acts once still keeps its repeats from the browser, so holding Space doesn't scroll.
  const heldSpaceLeft = press(" ", document.body, { repeat: true });
  check(`layout@${width}: a held Space acts once and keeps the browser from scrolling (${chip()})`, !heldSpaceLeft && chip().includes("Playing"));
  // A key that closes the panel, Esc included, leaves focus on the page, so Space plays or pauses afterwards.
  for (const closeKey of ["Escape", "s", "p"]) {
    press("h");
    press(closeKey, document.activeElement);
    const focusAfterClose = document.activeElement;
    const chipAfterClose = chip();
    press(" ", document.activeElement);
    check(`layout@${width}: ${closeKey} closing the panel leaves focus on the page, so Space then plays or pauses (${chipAfterClose} to ${chip()})`,
      $("panel").hidden && focusAfterClose === document.body && chip() !== chipAfterClose);
    press(" ");
  }
  // With the bell's list open, its title has focus, which Space doesn't activate, so Space plays or pauses.
  $("notify-btn").click();
  const listFocus = document.activeElement?.id;
  const chipBeforeList = chip();
  press(" ", document.activeElement);
  check(`layout@${width}: Space with the bell's list open, focus on ${listFocus}, plays or pauses (${chipBeforeList} to ${chip()})`,
    listFocus === "notify-title" && chip() !== chipBeforeList);
  press("Escape", document.activeElement);
  const focusAfterList = document.activeElement;
  const chipAfterList = chip();
  press(" ", document.activeElement);
  check(`layout@${width}: Esc closing the bell's list leaves focus on the page, so Space then plays or pauses (${chipAfterList} to ${chip()})`,
    $("notify-list").hidden && focusAfterList === document.body && chip() !== chipAfterList);
  // There is no frame after the last, so . does nothing within it.
  press("k");
  const timeBeforeEnd = Number($("seek").value);
  const seekTo = (time) => {
    $("seek").value = String(time);
    $("seek").dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const lastFrame = items[3].duration - 0.01;
  seekTo(lastFrame);
  press(".");
  check(`layout@${width}: . does nothing within the last frame (${Number($("seek").value).toFixed(2)} of ${items[3].duration}, ${chip()})`,
    Math.abs(Number($("seek").value) - lastFrame) < 0.001 && !chip().includes("stepped"));
  seekTo(timeBeforeEnd);
  press("k");
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
  const bulkIcon = (id) => $(id).querySelector(".material-symbol-icon").dataset.icon;
  check(`layout@${width}: the bar's Stop selecting and Select all are icon buttons, deselect and select_all, with tooltips (${bulkIcon("bulk-exit")}, ${bulkIcon("bulk-all")})`,
    bulkIcon("bulk-exit") === "deselect" && $("bulk-exit").title === "Stop selecting" && bulkIcon("bulk-all") === "select_all" &&
    $("bulk-all").classList.contains("icon-btn") && $("bulk-all").textContent.trim() === $("bulk-all").querySelector(".material-symbol-icon").textContent &&
    $("bulk-all").title === "Select all" && $("bulk-all").getAttribute("aria-label") === "Select all");
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
  check(`layout@${width}: and the player keeps its rounded corners there (${playerCorners()})`, playerCorners() === "8px inset(0 round 8px)");
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
  // A refused preset save names the server's reason, here its reason for a write the catalog doesn't take.
  const sampleNotice = "Saving presets failed: The preset change couldn't be saved.";
  check(`layout@${width}: an error shows in the dialog, not a popup, and the list keeps it (${notice()})`,
    notice() === sampleNotice && newest() === sampleNotice && !toastTexts().includes(sampleNotice));
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
  // iOS: a media element's volume is read-only, so the volume works through a Web Audio gain stage, started on the
  // first tap. The slider shows from the start, since a control hides only because of a user setting, and a volume set
  // before the stage runs is the level it starts at; the wheel and the slider then set its gain.
  const { setup, gains, mediaCalls } = standInAudio();
  // Loudness normalization off, so the gain is the volume on the video's stand-in level alone; the loudness run checks
  // how the two combine.
  const withoutNormalization = (w) => {
    setup(w);
    w.localStorage.setItem("rr-mockup.normalization", "false");
  };
  const { document, errors, window } = await load("layout", 390, "?instant", withoutNormalization);
  const $ = (id) => document.getElementById(id);
  document.getElementById("mock-ios-volume").click();
  window.mockup.choose(3);
  const chord = window.mockup.standInLevel(window.mockup.items[3]);
  const wheelUp = () => $("media").dispatchEvent(new window.WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
  $("volume").value = "50";
  $("volume").dispatchEvent(new window.Event("input"));
  wheelUp();
  const volumeBefore = Number($("volume").value);
  check(`ios: with the volume read-only and no gain stage yet, the slider shows and the wheel sets the volume (${volumeBefore})`,
    !$("volume-wrap").hidden && volumeBefore === 55 && gains.length === 0);
  // A touch's pointerdown carries no user activation on iOS, so the gain stage waits for its pointerup.
  document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  check(`ios: a tap's pointerdown doesn't start the gain stage, and the slider stays (${gains.length} gain nodes)`, gains.length === 0 && !$("volume-wrap").hidden);
  document.body.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  check(`ios: its pointerup starts the gain stage at the volume set before it (${gains.length} gain node, gain ${gains[0]?.gain.value})`,
    gains.length === 1 && !$("volume-wrap").hidden && Math.abs(gains[0].gain.value - (volumeBefore / 100) * chord) < 1e-9);
  wheelUp();
  check(`ios: the wheel then raises the volume, and the gain follows it (${$("volume").value}, gain ${gains[0]?.gain.value})`,
    Number($("volume").value) === Math.min(100, volumeBefore + 5) && Math.abs(gains[0].gain.value - (Number($("volume").value) / 100) * chord) < 1e-9);
  const param = gains[0].gain;
  const lastCall = () => param.calls.at(-1);
  const glides = (call, level) => call?.[0] === "glide" && Math.abs(call[1] - level) < 1e-9 && call[2] > 0 && call[2] <= 0.03;
  check(`ios: playing a video started the sound from silence and faded it in (${JSON.stringify(param.calls.slice(0, 2))})`,
    param.calls[0]?.[0] === "set" && param.calls[0][1] === 0 && glides(param.calls[1], (volumeBefore / 100) * chord) && mediaCalls[0] === "play");
  check(`ios: a volume step glides to its level instead of jumping (${JSON.stringify(lastCall())})`, glides(lastCall(), (Number($("volume").value) / 100) * chord));
  $("play-btn").click();
  const pausedAtOnce = mediaCalls.at(-1) === "pause";
  check(`ios: pause fades the sound out first (${JSON.stringify(lastCall())})`, glides(lastCall(), 0) && !pausedAtOnce);
  await new Promise((resolve) => setTimeout(resolve, 100));
  check("ios: and stops it once it is silent", mediaCalls.at(-1) === "pause");
  $("play-btn").click();
  check(`ios: play fades it back in from silence (${JSON.stringify(param.calls.slice(-2))})`,
    param.calls.at(-2)?.[0] === "set" && param.calls.at(-2)[1] === 0 && glides(lastCall(), (Number($("volume").value) / 100) * chord) && mediaCalls.at(-1) === "play");
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
  check(`enhanced: Enhanced audio starts on, in Audio, with its description (${toggle.closest(".setting").querySelector(".setting-hint").textContent})`,
    toggle.checked && toggle.closest(".settings-section").querySelector("h3").textContent === "Audio" &&
    toggle.closest(".setting").querySelector(".setting-hint").textContent === "Processes audio in the app, for loudness normalization and compression.");
  document.body.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
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
  const chord = window.mockup.standInLevel(window.mockup.items[3]);
  check(`enhanced: directly, the volume sets the element's own volume, on the video's stand-in level (${direct.volume.toFixed(4)})`,
    Math.abs(direct.volume - 0.4 * chord) < 1e-9 && !$("volume-wrap").hidden);
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
  document.body.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const notice = [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  const turnOff = notice && [...notice.querySelectorAll("button")].find((b) => b.textContent.trim() === "Turn off Enhanced audio");
  check(`audio-fails: the next tap shows the notice (${notice?.querySelector(".dialog-message")?.textContent.slice(0, 45)})`,
    !!notice && notice.querySelector(".dialog-message").textContent === "Audio processing couldn't start on this device. Turn off Enhanced audio to play sound directly." &&
    !!turnOff && gains.length === 0 &&
    document.activeElement?.textContent.trim() === "OK");
  turnOff.click();
  window.mockup.choose(3);
  check("audio-fails: its button turns Enhanced audio off for this device, and the sound then plays directly",
    !$("set-enhanced-audio").checked && window.localStorage.getItem("rr-mockup.enhancedAudio") === "false" && !document.querySelector("dialog.app-dialog") && playedBy.length === 1 && !playedBy[0].paused);
  check(`audio-fails: no script errors ${errors.join("; ")}`, errors.length === 0);
}

{
  // Loudness normalization, on by default: its settings sit in an expandable section like Ambient mode's, and are
  // disabled while Enhanced audio is off, as Compression is. It sets the gain stage by the gain rule: a cut in full, and a
  // boost held to the smallest of what the item needs, the boost limit, and its headroom, the -1 dBTP ceiling minus its
  // peak plus 6 dB with Allow limiting on, as a linear gain on the volume and the video's stand-in level. An item
  // without a peak is only cut.
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
  // A setting's field saves a valid value at once on Enter.
  const enter = (el, value) => {
    input(el, value);
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  };
  const stored = (key) => JSON.parse(window.localStorage.getItem("rr-mockup." + key) ?? "null");
  const toggle = $("set-loudness");
  const more = $("set-loudness-more");
  const target = (value) => document.querySelector(`input[name="set-loud-target"][value="${value}"]`);
  const targets = [...document.querySelectorAll('input[name="set-loud-target"]')].map((radio) => radio.closest("label").textContent.trim());
  const labels = [...more.querySelectorAll(".setting-label")].map((el) => el.textContent).join(", ");
  check(`loudness: the option starts on, with its hint (${$("set-loudness-hint").textContent})`,
    toggle.checked && !toggle.disabled && $("set-loudness-hint").textContent === "Evens out loudness between videos.");
  check(`loudness: its settings are an expandable section with their defaults (${labels})`,
    more.tagName === "DETAILS" && !more.open && more.querySelector("summary").lastChild.textContent === "Loudness normalization settings" &&
    !!more.querySelector("summary .setting-more-chevron") && labels === "Target loudness, Target, Boost quiet videos by up to" &&
    target("auto").checked && $("set-loud-manual").hidden && $("set-loud-manual-target").value === "-18" && $("set-loud-boost").value === "15" &&
    $("set-loud-limiting").checked && $("set-loud-reset").closest("fieldset") === $("set-loudness-fields"));
  check(`loudness: Target loudness offers ${targets.join(", ")}`,
    targets.join() === "AutomaticThe library's baseline, -20.4 LUFS.,Quieter-23 LUFS,Standard-18 LUFS,Louder-14 LUFS,Manual" &&
    target("manual").closest(".choice-stack").contains($("set-loud-manual")));
  check(`loudness: Allow limiting has its hint (${$("set-loud-limiting").closest("label").querySelector("small").textContent})`,
    $("set-loud-limiting").closest("label").querySelector("small").textContent === "Lets quiet videos with loud moments get louder by limiting those moments.");
  check("loudness: the target field uses the full keyboard, since the numeric keypads on iOS have no minus key",
    !$("set-loud-manual-target").hasAttribute("inputmode") && $("set-loud-boost").getAttribute("inputmode") === "numeric");
  const compression = $("set-compression");
  check(`loudness: Compression starts off, with its hint (${$("set-compression-hint").textContent})`,
    !compression.checked && !compression.disabled && $("set-compression-hint").textContent === "Evens out loudness within a video.");
  change(compression, true);
  check("loudness: Compression is kept per device", stored("compression") === true);
  change(compression, false);
  document.body.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const items = window.mockup.items;
  const play = (item) => window.mockup.choose(items.indexOf(item));
  const param = gains.at(-1).gain;
  const volume = Number($("volume").value) / 100;
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  // The gain for an item's adjustment: on the volume and the level its stand-in chord plays at, its own loudness.
  const gainFor = (item, db) => volume * window.mockup.standInLevel(item) * Math.pow(10, db / 20);
  const signed = (db) => `${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`;
  // The Stats tab's Adjustment shows what normalization applies.
  const adjustment = () => {
    const dt = [...$("stats-body").querySelectorAll("dt")].find((el) => el.textContent === "Adjustment");
    return dt?.nextElementSibling.textContent;
  };
  const video = (test) => items.find(test);
  // Louder than every target, so each one cuts it.
  const loud = video((item) => item.loudness > -14 && item.peak != null);
  const roomy = video((item) => item.loudness < -21 && item.peak != null && -1 - item.peak + 6 >= -18 - item.loudness);
  const peaky = video((item) => item.loudness < -18 && item.peak != null && -1 - item.peak + 6 < -18 - item.loudness && -1 - item.peak > 0);
  const peakless = video((item) => item.loudness != null && item.loudness < -18 && item.peak == null);
  // Not the missing file, which playback skips.
  const unmeasured = video((item) => item.hasAudio === null && !item.missing);
  check("loudness: the mockup has a loud video, a quiet one with headroom, one limited by its peak, one without a peak, and one not scanned",
    !!loud && !!roomy && !!peaky && !!peakless && !!unmeasured);
  // The gain rule's checks run at Standard's -18 LUFS. Automatic, the default, is checked with the other targets.
  change(target("standard"), true);
  // Each video's chord plays at its own stand-in loudness: off, a loud and a quiet video sound different; on, they even
  // out at the target, and one whose peak holds its boost back stays quieter by the boost it misses.
  const levelOf = (item) => {
    play(item);
    return param.level;
  };
  change(toggle, false);
  const offLoud = levelOf(loud);
  const offRoomy = levelOf(roomy);
  check(`loudness: off, each video's chord plays at its own loudness (${offLoud.toFixed(4)} for ${loud.loudness} LUFS, ${offRoomy.toFixed(4)} for ${roomy.loudness} LUFS)`,
    offLoud > offRoomy && close(offLoud / offRoomy, Math.pow(10, (loud.loudness - roomy.loudness) / 20)));
  change(toggle, true);
  const onLoud = levelOf(loud);
  const onRoomy = levelOf(roomy);
  const onPeaky = levelOf(peaky);
  const missed = -18 - peaky.loudness - (-1 - peaky.peak + 6);
  check(`loudness: on, they even out at the target (${onLoud.toFixed(4)}, ${onRoomy.toFixed(4)}), and one held back by its peak stays ${missed.toFixed(1)} dB quieter (${onPeaky.toFixed(4)})`,
    close(onLoud, onRoomy) && close(onPeaky / onLoud, Math.pow(10, -missed / 20)));
  play(loud);
  const cut = -18 - loud.loudness;
  check(`loudness: a loud video is cut in full to Standard's -18 LUFS (${param.level.toFixed(4)}, ${adjustment()} for ${loud.loudness} LUFS)`,
    close(param.level, gainFor(loud, cut)) && adjustment() === signed(cut));
  play(roomy);
  const boost = -18 - roomy.loudness;
  check(`loudness: a quiet video with headroom is boosted in full (${adjustment()} for ${roomy.loudness} LUFS, ${roomy.peak} dBTP)`,
    close(param.level, gainFor(roomy, boost)) && adjustment() === signed(boost));
  enter($("set-loud-boost"), "3");
  check(`loudness: the boost limit holds it back, without "limited by peak" (${adjustment()})`,
    close(param.level, gainFor(roomy, 3)) && adjustment() === "+3.0 dB" && stored("normalizationSettings").boostLimit === 3 && param.calls.at(-1)[0] === "glide" &&
    $("set-loud-boost").closest(".vfield").classList.contains("is-saved"));
  enter($("set-loud-boost"), "15");
  play(peaky);
  const allowed = -1 - peaky.peak + 6;
  check(`loudness: a quiet video's headroom plus the limiter allowance holds it back (${adjustment()} for ${peaky.loudness} LUFS, ${peaky.peak} dBTP)`,
    close(param.level, gainFor(peaky, allowed)) && adjustment() === `${signed(allowed)} (limited by peak)`);
  change($("set-loud-limiting"), false);
  const headroom = -1 - peaky.peak;
  check(`loudness: with Allow limiting off, its headroom alone holds it back (${adjustment()})`,
    close(param.level, gainFor(peaky, headroom)) && adjustment() === `${signed(headroom)} (limited by peak)` && stored("normalizationSettings").allowLimiting === false &&
    param.calls.at(-1)[0] === "glide");
  // A peak above the ceiling leaves no headroom: the video plays unadjusted rather than cut.
  const peakBefore = peaky.peak;
  peaky.peak = -0.5;
  play(loud);
  play(peaky);
  check(`loudness: a quiet video whose peak is above the ceiling isn't turned down (${adjustment()})`,
    close(param.level, gainFor(peaky, 0)) && adjustment() === "+0.0 dB (limited by peak)");
  // With no boost allowed, the headroom has nothing to hold back.
  enter($("set-loud-boost"), "0");
  check(`loudness: with a boost limit of 0, its peak holds nothing back (${adjustment()})`,
    close(param.level, gainFor(peaky, 0)) && adjustment() === "+0.0 dB");
  enter($("set-loud-boost"), "15");
  peaky.peak = peakBefore;
  change($("set-loud-limiting"), true);
  // A boost that fits the headroom exactly, in the tenths of a dB the scan measures, isn't held back by a subtraction's
  // rounding: -18 - -32.7 is 14.700000000000003 against a headroom of 14.7.
  const loudnessBefore = peaky.loudness;
  Object.assign(peaky, { loudness: -32.7, peak: -9.7 });
  play(loud);
  play(peaky);
  check(`loudness: a boost that just fits the headroom isn't limited by peak (${adjustment()} for -32.7 LUFS, -9.7 dBTP)`,
    close(param.level, gainFor(peaky, 14.7)) && adjustment() === "+14.7 dB");
  Object.assign(peaky, { loudness: loudnessBefore, peak: peakBefore });
  play(peakless);
  check(`loudness: a quiet video without a peak isn't boosted (${adjustment()} for ${peakless.loudness} LUFS)`, close(param.level, gainFor(peakless, 0)) && adjustment() === "+0.0 dB");
  play(unmeasured);
  check(`loudness: a video without loudness data plays at the volume (${adjustment()})`, close(param.level, gainFor(unmeasured, 0)) && adjustment() === "N/A");
  play(loud);
  change(target("quieter"), true);
  check(`loudness: Quieter cuts to -23 LUFS (${adjustment()})`, close(param.level, gainFor(loud, -23 - loud.loudness)) && adjustment() === signed(-23 - loud.loudness) &&
    stored("normalizationSettings").target === "quieter" && param.calls.at(-1)[0] === "glide");
  change(target("louder"), true);
  check(`loudness: Louder cuts to -14 LUFS (${adjustment()})`, close(param.level, gainFor(loud, -14 - loud.loudness)) && adjustment() === signed(-14 - loud.loudness));
  change(target("auto"), true);
  check(`loudness: Automatic cuts to the library's baseline (${adjustment()})`, close(param.level, gainFor(loud, -20.4 - loud.loudness)) && adjustment() === signed(-20.4 - loud.loudness));
  change(target("manual"), true);
  check("loudness: Manual shows its target", !$("set-loud-manual").hidden && stored("normalizationSettings").target === "manual");
  enter($("set-loud-manual-target"), "-30");
  check(`loudness: Manual's target applies at once (${param.level.toFixed(4)}, ${adjustment()})`,
    close(param.level, gainFor(loud, -30 - loud.loudness)) && stored("normalizationSettings").manualTarget === -30 && adjustment() === signed(-30 - loud.loudness));
  input($("set-loud-manual-target"), "-5");
  input($("set-loud-boost"), "25");
  check("loudness: a target above -10 LUFS and a boost above 24 dB are flagged and not kept, and the gain stays",
    $("set-loud-manual-target").getAttribute("aria-invalid") === "true" && $("set-loud-boost").getAttribute("aria-invalid") === "true" &&
    stored("normalizationSettings").manualTarget === -30 && stored("normalizationSettings").boostLimit === 15 && close(param.level, gainFor(loud, -30 - loud.loudness)));
  input($("set-loud-manual-target"), "-51");
  input($("set-loud-boost"), "2.5");
  check("loudness: a target below -50 LUFS and a boost that isn't a whole number are flagged",
    $("set-loud-manual-target").getAttribute("aria-invalid") === "true" && $("set-loud-boost").getAttribute("aria-invalid") === "true");
  input($("set-loud-manual-target"), "-30");
  input($("set-loud-boost"), "15");
  change(toggle, false);
  check(`loudness: off, the gain is the volume on the video's own level (${param.level.toFixed(4)}), and Stats shows the Adjustment as ${adjustment()}`,
    close(param.level, gainFor(loud, 0)) && adjustment() === "Off" && stored("normalization") === false);
  change(toggle, true);
  // The loudest any video can play at is Manual's highest target, which is no louder than the volume.
  enter($("set-loud-manual-target"), "-10");
  enter($("set-loud-boost"), "24");
  const loudest = Math.max(...items.filter((item) => item.loudness != null && !item.missing).map(levelOf));
  check(`loudness: at Manual's highest target and the most boost, no video plays past the volume (${loudest.toFixed(4)} at ${volume})`, loudest <= volume + 1e-9);
  play(loud);
  change($("set-enhanced-audio"), false);
  check(`loudness: with Enhanced audio off, the options and their settings are disabled, with "${$("set-loudness-hint").textContent}"`,
    toggle.disabled && toggle.checked && $("set-loudness-fields").disabled && $("set-loudness-hint").textContent === "Needs Enhanced audio." &&
    compression.disabled && $("set-compression-fields").disabled && $("set-compression-hint").textContent === "Needs Enhanced audio." && !!playedBy.at(-1) && !playedBy.at(-1).paused && adjustment() === "Off");
  change($("set-enhanced-audio"), true);
  check("loudness: turning Enhanced audio back on enables them",
    !toggle.disabled && !$("set-loudness-fields").disabled && $("set-loudness-hint").textContent === "Evens out loudness between videos." &&
    !compression.disabled && !$("set-compression-fields").disabled && $("set-compression-hint").textContent === "Evens out loudness within a video.");
  $("set-loud-reset").click();
  check("loudness: Reset to defaults restores each setting, with no check, and forgets the stored ones",
    target("auto").checked && $("set-loud-manual").hidden && $("set-loud-manual-target").value === "-18" && $("set-loud-boost").value === "15" &&
    $("set-loud-limiting").checked && !$("set-loud-manual-target").hasAttribute("aria-invalid") && stored("normalizationSettings") === null && toggle.checked &&
    !more.querySelector(".vfield.is-saved"));
  check(`loudness: no script errors ${errors.join("; ")}`, errors.length === 0);
}

{
  // Compression's settings sit in an expandable section like Loudness normalization's: Strength is Light, Medium, by
  // default, Strong, or Custom. Custom's values show only while Custom is chosen, start at Medium's, are kept while
  // another option is chosen, and Reset to Medium puts back Medium's.
  const { document, errors, window } = await load("layout", 1280, "?instant");
  const $ = (id) => document.getElementById(id);
  const change = (el, value) => {
    el.checked = value;
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  const enter = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  };
  const stored = () => JSON.parse(window.localStorage.getItem("rr-mockup.compressionSettings") ?? "null");
  const more = $("set-compression-more");
  const custom = $("set-comp-custom");
  const preset = (value) => document.querySelector(`input[name="set-comp-preset"][value="${value}"]`);
  const presets = [...document.querySelectorAll('input[name="set-comp-preset"]')].map((radio) => radio.closest("label").textContent.trim());
  const fields = ["threshold", "ratio", "knee", "attack", "release", "makeup"].map((name) => $(`set-comp-${name}`));
  const values = () => fields.map((field) => field.value).join();
  const MEDIUM = { threshold: -24, ratio: 4, knee: 6, attack: 5, release: 250, makeup: 9.7 };
  const labels = [...custom.querySelectorAll(".setting-label")].map((label) => label.textContent).join();
  const units = fields.map((field) => field.closest(".filter-row").lastElementChild.textContent).join();
  const hints = [...custom.querySelectorAll(".setting-hint")].map((hint) => hint.textContent);
  check(`compression: its settings are an expandable section, closed at first, with Strength's options (${presets.join(", ")})`,
    more.tagName === "DETAILS" && !more.open && more.querySelector("summary").lastChild.textContent === "Compression settings" &&
    !!more.querySelector("summary .setting-more-chevron") && $("set-compression").closest(".setting").contains(more) &&
    $("set-comp-preset-label").textContent === "Strength" &&
    presets.join("|") === "LightEvens out the loudest moments a little.|MediumBrings loud and quiet moments closer.|" +
      "StrongKeeps loud and quiet moments close, for quiet listening.|CustomSet each value yourself.");
  check(`compression: Medium is chosen by default, and Custom's values hide under Custom, at Medium's (${values()})`,
    preset("medium").checked && custom.hidden && preset("custom").closest(".choice-stack").contains(custom) && values() === Object.values(MEDIUM).join());
  check(`compression: Custom's values have their labels, units, and hints (${labels})`,
    labels === "Threshold,Ratio,Knee,Attack,Release,Makeup gain" && units === "dB,to 1,dB,ms,ms,dB" &&
    hints.join("|") === "Lower turns down more of the sound; higher, only the loudest moments.|Higher turns loud moments down harder.|" +
      "Higher starts turning down more gradually, for a softer effect.|Lower catches sudden loud sounds faster; higher lets their first moment through.|" +
      "Lower brings the sound back up faster; higher sounds smoother.|Higher raises the whole sound after compression. At 0 dB, only loud moments are turned down." &&
    custom.querySelector(".setting-hint").previousElementSibling === fields[0].closest(".filter-row") &&
    $("set-comp-reset").textContent === "Reset to Medium" && custom.lastElementChild === $("set-comp-reset"));
  check("compression: Threshold uses the full keyboard, since iOS's numeric keypads have no minus key, and the others a keypad",
    !fields[0].hasAttribute("inputmode") && fields.slice(1).every((field) => ["decimal", "numeric"].includes(field.getAttribute("inputmode"))));
  change(preset("custom"), true);
  check("compression: choosing Custom shows its values, and the choice is kept per device", !custom.hidden && stored()?.preset === "custom");
  enter(fields[1], "6");
  enter(fields[5], "3");
  check("compression: Custom's values are kept per device", stored()?.custom.ratio === 6 && stored()?.custom.makeup === 3);
  enter(fields[1], "25");
  enter(fields[3], "2.5");
  check("compression: a value outside its range, or a fraction of a ms, is flagged and not kept",
    fields[1].getAttribute("aria-invalid") === "true" && fields[3].getAttribute("aria-invalid") === "true" &&
    stored()?.custom.ratio === 6 && stored()?.custom.attack === 5);
  enter(fields[1], "6");
  enter(fields[3], "5");
  // Each value outside its range is flagged with the Settings tab's tooltip, which says the range, as Manual's target's does.
  const messages = fields.map((field) => {
    enter(field, "5000");
    const tip = document.getElementById(field.getAttribute("aria-describedby") ?? "");
    const message = tip && field.closest(".vfield").contains(tip) && tip.getAttribute("role") === "tooltip" ? tip.textContent : null;
    enter(field, String(MEDIUM[field.id.replace("set-comp-", "")]));
    return message;
  });
  check(`compression: each of Custom's values outside its range is flagged with the tooltip saying its range (${messages.join(" | ")})`,
    messages.join("|") === "Use a number from -100 to 0 dB.|Use a number from 1 to 20.|Use a number from 0 to 40 dB.|" +
      "Use a whole number from 0 to 1000 ms.|Use a whole number from 0 to 1000 ms.|Use a number from 0 to 24 dB.");
  enter(fields[1], "6");
  enter(fields[5], "3");
  change(preset("light"), true);
  check("compression: choosing another option hides Custom's values and keeps them",
    custom.hidden && stored()?.preset === "light" && stored()?.custom.ratio === 6 && stored()?.custom.makeup === 3);
  change(preset("custom"), true);
  check("compression: Custom shows its own values again", fields[1].value === "6" && fields[5].value === "3");
  $("set-comp-reset").click();
  check("compression: Reset to Medium puts back Medium's values, staying on Custom",
    values() === Object.values(MEDIUM).join() && preset("custom").checked && JSON.stringify(stored()?.custom) === JSON.stringify(MEDIUM));
  change($("set-enhanced-audio"), false);
  check("compression: with Enhanced audio off, Compression and its settings are disabled", $("set-compression").disabled && $("set-compression-fields").disabled);
  change($("set-enhanced-audio"), true);
  check(`compression: no script errors ${errors.join("; ")}`, errors.length === 0);
}

{
  // Preset changes from another device, which the Mockup tab's Events stand in for: each reaches the preset dropdown at
  // once and the Filter tab by its merge, with one Other devices popup, and a change to the preset this device has
  // applied that changes what it plays keeps its own.
  const { document, errors, window } = await load("layout", 1280, "?instant");
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
  const topDialog = () => [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  const messages = window.mockup.notifications;
  const toastText = (toast) => toast.querySelector(".toast-text > div").textContent;
  const newest = () => messages.entries()[0]?.text || "";
  const said = (text) => newest() === text && messages.toasts().some((toast) => toastText(toast) === text) && messages.entries()[0].kind === "devices";
  // The popups showing with a key, the dropdown's presets and the one it shows, by name, and the Filter tab's presets.
  const keyed = (key) => messages.toasts().filter((toast) => toast.dataset.key === key).map(toastText);
  const dropdownNames = () => [...$("lib-preset").options].filter((option) => option.value && option.value !== "*").map((option) => option.textContent);
  const dropdownShows = () => [...$("lib-preset").options].find((option) => option.value === $("lib-preset").value)?.textContent;
  const choosePreset = (name) => change($("lib-preset"), [...$("lib-preset").options].find((option) => option.textContent === name).value);
  const rowNames = () => [...document.querySelectorAll(".filter-preset-row .filter-preset-name")].map((el) => el.textContent);
  const filtersLine = () => $("lib-filters").textContent;
  const neverPlayedBox = () => [...$("filter-body").querySelectorAll("label")].find((label) => label.textContent.trim() === "Only never played").querySelector("input");
  const videosOnly = () => document.querySelectorAll('input[name="media"]')[1].checked;
  const unsavedShown = () => $("filter-apply").classList.contains("has-pending") && !$("filter-discard").disabled;

  check(`presets: with None applied, Your preset's changes are disabled, and a note says to pick a preset first (${$("mock-presets-note").textContent})`,
    $("mock-your-updated").disabled && $("mock-your-deleted").disabled && !$("mock-preset-renamed").disabled && !$("mock-presets-burst").disabled &&
    !$("mock-presets-note").hidden && $("mock-presets-note").textContent === "To change your preset, pick one in the preset dropdown first.");
  $("mock-preset-added").click();
  check(`presets: a preset added on another device shows last in the dropdown and the Filter tab, with its popup (${newest()})`,
    said('Preset "Dogs" added on another device') && dropdownNames().at(-1) === "Dogs" && rowNames().at(-1) === "Dogs" && keyed("presets").length === 1);
  $("mock-preset-renamed").click();
  check(`presets: a rename names the old name and the new, and its popup replaces the add's, which shares its key (${keyed("presets")})`,
    said('Preset "Favorites" renamed to "Puppies" on another device') && keyed("presets").join() === 'Preset "Favorites" renamed to "Puppies" on another device' &&
    dropdownNames()[0] === "Puppies" && rowNames()[0] === "Puppies");
  $("mock-preset-updated").click();
  check(`presets: an update names the preset (${newest()})`, said('Preset "Puppies" updated on another device') && keyed("presets").length === 1);
  $("mock-preset-deleted").click();
  check(`presets: a delete leaves the dropdown and the Filter tab (${newest()})`,
    said('Preset "Dogs" deleted on another device') && !dropdownNames().includes("Dogs") && !rowNames().includes("Dogs"));
  const entriesBeforeBurst = messages.entries().length;
  $("mock-presets-burst").click();
  check(`presets: an add, a rename, and a delete in one burst collapse into one popup (${newest()}, ${messages.entries().length - entriesBeforeBurst} new)`,
    said("3 presets changed on another device") && messages.entries().length === entriesBeforeBurst + 1 && keyed("presets").length === 1 &&
    dropdownNames().at(-1) === "Dogs" && dropdownNames()[0] === "Kittens" && !dropdownNames().includes("Summer") && rowNames().join() === dropdownNames().join());

  // Photos only applied, unchanged, and the Filter tab holding an unsaved rename, with the applied filter as its working
  // filter: an update to Photos only applies its new filter, in the tab too, and the rename stays.
  choosePreset("Photos only");
  await tick();
  check("presets: with a preset applied, Your preset's changes are enabled and the note hides",
    !$("mock-your-updated").disabled && !$("mock-your-deleted").disabled && $("mock-presets-note").hidden);
  $("panel-btn").click();
  $("tab-btn-filter").click();
  document.querySelector('[data-sub="presets"]').click();
  [...document.querySelectorAll(".filter-preset-row")].find((row) => row.querySelector(".filter-preset-name").textContent === "Cooking").querySelector('[title="Edit preset"]').click();
  input(topDialog().querySelector("input"), "Cooking at home");
  button(topDialog(), "Save").click();
  const appliedBefore = filtersLine();
  $("mock-your-updated").click();
  await tick();
  check(`presets: another device's update to your preset, applied unchanged, applies its new filter and reloads the library, with its own popup (${filtersLine()}, ${dropdownShows()}, ${newest()})`,
    said('Your preset "Photos only" was updated on another device. The library has been updated.') && keyed("your-preset").length === 1 &&
    dropdownShows() === "Photos only" && $("lib-preset").value !== "*" && /^Filters: Videos only · Min \d\d:\d\d$/.test(filtersLine()) && filtersLine() !== appliedBefore);
  check(`presets: the Filter tab's working filter, the applied one unchanged, takes the new filter, and its unsaved rename stays (${$("filter-heading").textContent})`,
    $("filter-heading").textContent === "Preset: Photos only" && videosOnly() && $("filter-min").value !== "" && rowNames().includes("Cooking at home") && !rowNames().includes("Cooking") && unsavedShown());
  // A working filter that differs from the applied one stays as the user left it.
  change(neverPlayedBox(), true);
  const minBefore = $("filter-min").value;
  const appliedThen = filtersLine();
  $("mock-your-updated").click();
  await tick();
  check(`presets: a later update applies its filter, and the Filter tab's working filter, changed, stays as the user left it (${filtersLine()}, ${$("filter-heading").textContent})`,
    said('Your preset "Photos only" was updated on another device. The library has been updated.') && keyed("your-preset").length === 1 &&
    filtersLine() !== appliedThen && /^Filters: Videos only · Min \d\d:\d\d$/.test(filtersLine()) && dropdownShows() === "Photos only" &&
    neverPlayedBox().checked && $("filter-min").value === minBefore && $("filter-heading").textContent === "Preset: Photos only*" && rowNames().includes("Cooking at home") && unsavedShown());
  // Applied as modified, starred, your preset's update keeps the filter and shows the ordinary popup.
  $("filter-apply").click();
  const appliedModified = filtersLine();
  const entriesBeforeModified = messages.entries().length;
  $("mock-your-updated").click();
  await tick();
  check(`presets: an update to your preset while its filter shows as modified keeps the filter, still starred, with the ordinary popup (${dropdownShows()}, ${newest()})`,
    said('Preset "Photos only" updated on another device') && keyed("presets").join() === 'Preset "Photos only" updated on another device' &&
    messages.entries().length === entriesBeforeModified + 1 && dropdownShows() === "Photos only*" && $("lib-preset").value === "*" && filtersLine() === appliedModified &&
    filtersLine().includes("Only never played"));
  // Deleting your preset keeps its filter applied, shown as None*.
  choosePreset("Beach days");
  await tick();
  const appliedBeach = filtersLine();
  $("mock-your-deleted").click();
  await tick();
  check(`presets: another device's delete of your preset keeps its filter applied, shown as None*, with its own popup (${filtersLine()}, ${dropdownShows()}, ${$("filter-heading").textContent}, ${newest()})`,
    said('Your preset "Beach days" was deleted on another device. Its filter is still applied.') && keyed("your-preset").length === 1 &&
    filtersLine() === appliedBeach && appliedBeach === "Filters: 1 tag" && dropdownShows() === "None*" && $("lib-preset").value === "*" &&
    !dropdownNames().includes("Beach days") && !rowNames().includes("Beach days") && $("filter-heading").textContent === "Preset: None*" &&
    $("mock-your-updated").disabled && $("mock-your-deleted").disabled);
  const devicesKind = document.querySelector('input[name="set-popup-kind"][value="devices"]').closest("label").querySelector("small").textContent;
  check(`presets: the Settings tab's Other devices popups name preset changes (${devicesKind})`, devicesKind === "Favorites, blacklist, and preset changes made on another device.");
  check(`presets: no script errors ${errors.join("; ")}`, errors.length === 0);
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
  check(`admin@${width}: each held action's badge sits on its corner, out of its flow (${cornerBadges(window)})`, cornerBadges(window) >= 6);
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
  check(`admin@${width}: clients show their id and OS`, ["web-3f9c2e81 · Windows", "web-a71d09c4 · iOS", "web-55be2f10 · Android"].every((text) => clients.includes(text)));
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
  check(`admin@${width}: the sources are the lines' second brackets (${$("log-svc").textContent})`, ["server", "webui"].every((source) => $("log-svc").textContent.includes(source)) && !$("log-svc").textContent.includes("desktop"));
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
    counts.includes("API sessions: 3") && counts.includes("Control sessions: 1") && counts.includes("Event streams: 3") &&
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
  check(`recovery@${width}: the held Continue's badge sits on its corner, out of its flow (${cornerBadges(window)})`, cornerBadges(window) === 1);
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

console.log(failures ? `${failures} failed` : "all passed");
for (const w of windows) await w.happyDOM.abort();
process.exit(failures ? 1 : 0);
