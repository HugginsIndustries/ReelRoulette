// Shared by the mockup pages.
"use strict";

// The mockups carry only the icons they use, looked up by codepoint instead of by ligature, so markup can keep
// the WebUI's `<span class="material-symbol-icon">name</span>` form.
const ICON_CODEPOINTS = /*@ICON_CODEPOINTS@*/ {};

function setIcon(el, name) {
  el.dataset.icon = name;
  el.textContent = String.fromCodePoint(ICON_CODEPOINTS[name] || 0xe000);
  el.setAttribute("aria-hidden", "true");
}

function hydrateIcons(root) {
  (root || document).querySelectorAll(".material-symbol-icon:not([data-icon])").forEach((el) => {
    setIcon(el, el.textContent.trim());
  });
}

function iconSpan(name, extraClass) {
  const span = document.createElement("span");
  span.className = "material-symbol-icon" + (extraClass ? " " + extraClass : "");
  setIcon(span, name);
  return span;
}

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("rr-mockup." + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("rr-mockup." + key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable for file:// pages or private windows; the mockup still works without it.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem("rr-mockup." + key);
    } catch {
      // As above.
    }
  }
};

// Theme follows the system as the WebUI does, unless the mockup options override it.
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pref = store.get("theme", "system");
  const dark = pref === "system" ? systemDark.matches : pref === "dark";
  document.documentElement.classList.toggle("theme-light", !dark);
  document.documentElement.classList.toggle("theme-dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#1a1a1a" : "#eceff4");
}
systemDark.addEventListener("change", applyTheme);
applyTheme();

// The strict duration parser for the WebUI: whole MM:SS or HH:MM:SS with seconds and minutes under 60, or a
// plain number of seconds. Today's parser reads "1:7x" as 1:07 and "12abc" as 12 seconds; this one rejects both.
function parseDuration(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  let match = /^(\d+):(\d{1,2})$/.exec(raw);
  if (match) {
    const [m, s] = [Number(match[1]), Number(match[2])];
    return s < 60 ? m * 60 + s : "invalid";
  }
  match = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (match) {
    const [h, m, s] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return m < 60 && s < 60 ? h * 3600 + m * 60 + s : "invalid";
  }
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : "invalid";
}
// A duration as the WebUI's Filter tab shows it: MM:SS under an hour, HH:MM:SS from one hour up, each part two digits.
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const two = (n) => String(n).padStart(2, "0");
  const [hours, minutes, secs] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return hours >= 1 ? `${two(hours)}:${two(minutes)}:${two(secs)}` : `${two(minutes)}:${two(secs)}`;
}

const DURATION_PROBLEM = "Use MM:SS, HH:MM:SS, or seconds.";
function checkDuration(value) {
  return parseDuration(value) === "invalid" ? { message: DURATION_PROBLEM } : null;
}

/**
 * A field using the validation pattern. `check(value)` returns null when the value is valid, `{ empty: true }` for
 * an empty required field, or `{ message }` for any other problem. An empty required field is never flagged: the
 * action that needs it is disabled instead. Any other problem is flagged as it is typed, and `holdAction` decides
 * whether it disables or holds the action.
 * `partners` are other controls checked with this one, such as the other dropdown of a pair: they are marked and
 * described with it, and focusing one shows the tooltip too. The icon and tooltip stay with `input`.
 */
const allFields = new Set();
let tipCounter = 0;

class ValidatedField {
  constructor(input, check, options) {
    const opts = options || {};
    this.input = input;
    this.check = check;
    this.pinned = !!opts.pinned;
    this.partners = opts.partners || [];
    this.hover = false;
    this.wrap = input.closest(".vfield");
    this.icon = this.wrap.querySelector(".vfield-icon");
    this.listeners = [];
    this.tip = document.createElement("div");
    this.tip.className = "vfield-tip";
    this.tip.id = "field-tip-" + ++tipCounter;
    this.tip.setAttribute("role", "tooltip");
    // Inside the field, so it shows in fullscreen and above a dialog; fixed, so scrolling bodies don't clip it.
    this.wrap.appendChild(this.tip);

    input.addEventListener("input", () => this.update());
    [input, ...this.partners].forEach((control) => {
      control.addEventListener("focus", () => this.place());
      control.addEventListener("blur", () => this.place());
    });
    this.icon.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") {
        this.hover = true;
        this.place();
      }
    });
    this.icon.addEventListener("pointerleave", () => {
      this.hover = false;
      this.place();
    });
    // A tap on the icon focuses the field, which shows the tooltip on touch screens.
    this.icon.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse") {
        event.preventDefault();
        input.focus();
      }
    });
    allFields.add(this);
    this.update();
  }

  get problem() {
    return this.input.disabled ? null : this.check(this.input.value);
  }

  /** An empty required field is never flagged. */
  get flagged() {
    const problem = this.problem;
    return !!problem && !problem.empty;
  }

  /** True while the action that uses this field can't proceed, for any problem. */
  get holds() {
    return !!this.problem;
  }

  /** True while the field is an empty required one, which disables the action that needs it. */
  get disables() {
    return !!this.problem?.empty;
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  dispose() {
    allFields.delete(this);
  }

  reset(value) {
    if (value !== undefined) this.input.value = value;
    this.update();
  }

  update() {
    const problem = this.problem;
    const flagged = this.flagged;
    this.wrap.classList.toggle("is-invalid", flagged);
    if (flagged) this.tip.textContent = problem.message;
    [this.input, ...this.partners].forEach((control) => {
      if (flagged) {
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-describedby", this.tip.id);
      } else {
        control.removeAttribute("aria-invalid");
        control.removeAttribute("aria-describedby");
      }
    });
    this.place();
    this.listeners.forEach((listener) => listener());
  }

  /** Moves the user to the field and shows what it expects. */
  reveal() {
    this.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
    this.input.focus({ preventScroll: true });
    setTimeout(() => this.place(), 350);
  }

  place() {
    const shown =
      this.flagged &&
      (this.pinned || this.hover || [this.input, ...this.partners].includes(document.activeElement)) &&
      this.wrap.offsetParent !== null &&
      this.inScrollView();
    this.tip.classList.toggle("is-shown", shown);
    if (!shown) return;
    const icon = this.icon.getBoundingClientRect();
    const tip = this.tip.getBoundingClientRect();
    const margin = 8;
    const above = icon.top - tip.height - 10 >= margin;
    const top = above ? icon.top - tip.height - 10 : icon.bottom + 10;
    let left = icon.right + 6 - tip.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - tip.width - margin));
    this.tip.dataset.place = above ? "above" : "below";
    this.tip.style.top = `${Math.round(top)}px`;
    this.tip.style.left = `${Math.round(left)}px`;
    const arrowRight = left + tip.width - (icon.left + icon.width / 2) - 5;
    this.tip.style.setProperty("--arrow-right", `${Math.max(6, Math.round(arrowRight))}px`);
  }

  inScrollView() {
    const scroller = this.wrap.closest(".scroll-y");
    if (!scroller) return true;
    const view = scroller.getBoundingClientRect();
    const icon = this.icon.getBoundingClientRect();
    return icon.bottom > view.top && icon.top < view.bottom;
  }
}

/**
 * The Filter tab's Favorites and Blacklisted filters, checked as a pair: Favorites only with Blacklisted only matches
 * nothing, since no item is both. The icon sits after the Blacklisted dropdown, which a held action moves to. A
 * dropdown's change updates it; call `update()` after a checkbox changes and the dropdowns' disabled state follows.
 */
const FLAG_PAIR_PROBLEM = "Nothing is both a favorite and blacklisted. Use excluded for one of them.";
function flagPairField(favBox, favMode, blBox, blMode, options) {
  const check = () => (favBox.checked && favMode.value === "only" && blBox.checked && blMode.value === "only" ? { message: FLAG_PAIR_PROBLEM } : null);
  const field = new ValidatedField(blMode, check, { ...options, partners: [favMode] });
  [favMode, blMode].forEach((select) => select.addEventListener("change", () => field.update()));
  return field;
}

let placeQueued = false;
function placeAllTips() {
  if (placeQueued) return;
  placeQueued = true;
  requestAnimationFrame(() => {
    placeQueued = false;
    allFields.forEach((field) => field.place());
  });
}
window.addEventListener("scroll", placeAllTips, true);
window.addEventListener("resize", placeAllTips);

/**
 * Wires an action button to the fields it uses.
 * - An empty required field disables the action: it dims, and pressing it does nothing. So does any problem in a
 *   field `beside()` returns: a field that sits right next to the action, such as a new name beside its Add button, or
 *   a field of the dialog the action is in, since the dialog has the user's attention. The field's own icon and
 *   tooltip say why. A field in `beside()` is also one of `fields()`. Disabling wins over holding.
 * - Otherwise a flagged field elsewhere holds it: the button's label dims, it reads as unavailable, and the red icon
 *   shows on its right. Pressing it does nothing but take the user to the first field that holds it.
 */
function holdAction(button, fields, options) {
  const opts = options || {};
  const ownTitle = button.getAttribute("title");
  const describe = document.createElement("span");
  describe.className = "vh";
  describe.id = (button.id || "action") + "-held";
  button.after(describe);

  function disabled() {
    return fields().some((field) => field.disables) || (opts.beside ? opts.beside().some((field) => field.holds) : false);
  }

  function blocker() {
    return disabled() ? null : fields().find((field) => field.holds) || null;
  }

  function refresh() {
    button.disabled = disabled();
    const field = blocker();
    const held = !!field;
    button.classList.toggle("shows-problem", held);
    if (held) {
      button.setAttribute("aria-disabled", "true");
      describe.textContent = opts.reason ? opts.reason(field) : "Correct the field first.";
      button.setAttribute("aria-describedby", describe.id);
      button.title = describe.textContent;
    } else {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-describedby");
      if (ownTitle === null) button.removeAttribute("title");
      else button.title = ownTitle;
    }
  }

  button.addEventListener(
    "click",
    (event) => {
      const field = blocker();
      if (!field) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (opts.beforeReveal) opts.beforeReveal(field);
      field.reveal();
    },
    true
  );

  fields().forEach((field) => field.onChange(refresh));
  refresh();
  return { refresh };
}

/**
 * The WebUI's dialog: a themed modal that stacks above any dialog already open, so a confirmation opens
 * over the dialog that asked for it. Escape or a click outside closes only the top one, and focus returns to where
 * it was. It opens inside the first showing element marked `data-dialog-host` (on the main page, the fullscreen stage)
 * so it shows in fullscreen.
 */
let dialogCounter = 0;
function openDialog({ content, labelledBy, role, onClose }) {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  if (labelledBy) dialog.setAttribute("aria-labelledby", labelledBy);
  if (role) dialog.setAttribute("role", role);
  dialog.append(content);
  // The first host that is showing: a dialog inside a hidden view, such as admin behind duplicate review, would leave the
  // page inert with nothing to answer.
  const host = [...document.querySelectorAll("[data-dialog-host]")].find((el) => !el.closest("[hidden]"));
  (host || document.body).append(dialog);
  const returnTo = document.activeElement;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    if (dialog.open && dialog.close) dialog.close();
    dialog.remove();
    if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus({ preventScroll: true });
    if (onClose) onClose(result);
    placeAllTips();
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close(false);
  });
  // The dialog's content fills its box, so a click whose target is the dialog itself landed on the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close(false);
  });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return { dialog, close };
}

function dialogButton(label, className, type) {
  const button = document.createElement("button");
  button.type = type || "button";
  button.className = className ? `btn ${className}` : "btn";
  const text = document.createElement("span");
  text.className = "btn-label";
  text.textContent = label;
  button.append(text);
  return button;
}

/**
 * Asks before an action. Cancel starts focused, so Enter never confirms by default; the confirming button names the
 * action, such as a red Delete.
 */
function confirmDialog({ message, confirmLabel, danger }) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.className = "dialog-body";
    const text = document.createElement("p");
    text.className = "dialog-message";
    text.id = `dialog-message-${++dialogCounter}`;
    text.textContent = message;
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const cancel = dialogButton("Cancel");
    const confirm = dialogButton(confirmLabel || "OK", danger ? "btn-danger" : "");
    const spacer = document.createElement("span");
    spacer.className = "dialog-spacer";
    actions.append(spacer, cancel, confirm);
    body.append(text, actions);
    const { close } = openDialog({ content: body, labelledBy: text.id, role: "alertdialog", onClose: (result) => resolve(!!result) });
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    cancel.focus();
  });
}

/**
 * A dialog with one name field that uses the validation pattern, Save disabled while the name is empty or has another
 * problem, such as a taken name, and an optional Delete that asks first in a dialog stacked above. `deleteLabel`
 * renames Delete, in the dialog and in its confirmation, for an action that deletes nothing, such as removing a source.
 * `extra(body)` can add fields after the name.
 */
function nameDialog({ title, label, value, check, onSave, deleteMessage, onDelete, deleteLabel, extra, saveLabel, inputType, onClose }) {
  const id = `dialog-field-${++dialogCounter}`;
  const form = document.createElement("form");
  form.className = "dialog-body";
  form.noValidate = true;
  const heading = document.createElement("h3");
  heading.id = `${id}-title`;
  heading.textContent = title;
  const labelEl = document.createElement("label");
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  const wrap = document.createElement("span");
  wrap.className = "vfield";
  const input = document.createElement("input");
  input.className = "ctl";
  input.type = inputType || "text";
  input.id = id;
  input.autocomplete = "off";
  wrap.append(input, iconSpan("error", "vfield-icon"));
  form.append(heading, labelEl, wrap);
  if (extra) extra(form);
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const spacer = document.createElement("span");
  spacer.className = "dialog-spacer";
  const cancel = dialogButton("Cancel");
  const save = dialogButton(saveLabel || "Save", "", "submit");
  save.append(iconSpan("error", "btn-problem"));
  if (onDelete) {
    const remove = dialogButton(deleteLabel || "Delete", "btn-danger");
    remove.addEventListener("click", async () => {
      if (await confirmDialog({ message: deleteMessage(), confirmLabel: deleteLabel || "Delete", danger: true })) {
        onDelete();
        close();
      }
    });
    actions.append(remove);
  }
  actions.append(spacer, cancel, save);
  form.append(actions);

  const field = new ValidatedField(input, check);
  const { close } = openDialog({
    content: form,
    labelledBy: heading.id,
    onClose: (result) => {
      field.dispose();
      if (onClose) onClose(!!result);
    }
  });
  field.reset(value || "");
  holdAction(save, () => [field], { beside: () => [field] });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (field.holds) return;
    onSave(input.value.trim(), form);
    close(true);
  });
  cancel.addEventListener("click", () => close(false));
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
  return { close, form, field };
}

/** A notice: something the user must see, with one OK. */
function noticeDialog({ title, message }) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.className = "dialog-body";
    const text = document.createElement("p");
    text.className = "dialog-message";
    text.id = `dialog-message-${++dialogCounter}`;
    text.textContent = message;
    if (title) {
      const heading = document.createElement("h3");
      heading.textContent = title;
      body.append(heading);
    }
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const spacer = document.createElement("span");
    spacer.className = "dialog-spacer";
    const ok = dialogButton("OK");
    actions.append(spacer, ok);
    body.append(text, actions);
    const { close } = openDialog({ content: body, labelledBy: text.id, role: "alertdialog", onClose: () => resolve() });
    ok.addEventListener("click", () => close(true));
    ok.focus();
    // The notifications list keeps every notice too, so one closed too quickly can be read again.
    if (activeNotifications) activeNotifications.record({ text: message, detail: title || "" });
  });
}

/** "Hide mockup notes": one option, kept on this device, for every page that offers it. */
function initHideMock() {
  const box = document.getElementById("mock-hide-notes");
  const apply = () => document.documentElement.classList.toggle("hide-mock", store.get("hideMock", false));
  if (box) {
    box.checked = store.get("hideMock", false);
    box.addEventListener("change", () => {
      store.set("hideMock", box.checked);
      apply();
    });
  }
  apply();
}

/**
 * Notifications, which replace the status line:
 * - Lasting states, such as Reconnecting…, show as one indicator on the player: the first active one in
 *   `NOTIFY_LASTING_ORDER`. The list shows every active one, with its full text, under Now, on the main page and in
 *   the admin view alike.
 * - One-off messages pop up briefly, as the Settings tab's Notifications section allows, by kind.
 * - The bell, on the player or at the end of the admin view's bar, opens the list of recent messages: every one-off message,
 *   whether it popped up or not, and every notice the in-app dialog showed. Its badge counts the messages that didn't pop up since the list was last
 *   open. The list keeps the last 50 for the page's life; a page refresh clears it.
 * Errors and anything that needs an answer stay in the in-app dialog, and field problems stay in their fields.
 */
const NOTIFY_KINDS = {
  actions: "check_circle",
  devices: "devices",
  refresh: "autorenew",
  skips: "fast_forward",
  connection: "cloud_done",
  error: "error"
};
const NOTIFY_DEFAULTS = {
  popups: true,
  kinds: { actions: true, devices: true, refresh: true, skips: true, connection: true },
  position: "bottom-center",
  fullscreen: true,
  seconds: 5
};
// The lasting states' precedence order: the indicator shows the first active one.
const NOTIFY_LASTING_ORDER = ["reconnecting", "incompatible", "nolibrary", "loading", "refresh"];
const NOTIFY_KEEP = 50;
const POPUPS_AT_ONCE = 3;
let activeNotifications = null;

function notifySettings() {
  const saved = store.get("notify", {}) || {};
  return { ...NOTIFY_DEFAULTS, ...saved, kinds: { ...NOTIFY_DEFAULTS.kinds, ...(saved.kinds || {}) } };
}

function notifyAgo(time) {
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// `listHost` holds the list: on the main page the stage, so the list shows in fullscreen. `inFullscreen` tells whether the
// player is in fullscreen, where popups show only while Show in fullscreen is on. `onClose` runs whenever the list
// closes, so the player's controls, which stay while it is open, can start their countdown again.
function initNotifications({ button, host, indicator, listHost = document.body, indicatorHidden = () => false, inFullscreen = () => false, onSettings, onClose, instant = false }) {
  let settings = notifySettings();
  const entries = [];
  const lasting = new Map();
  let unread = 0;
  let listOpen = false;
  let timeTimer = 0;
  const badge = button.querySelector(".notify-badge");

  const list = document.createElement("section");
  list.className = "notify-list";
  list.id = "notify-list";
  list.hidden = true;
  list.setAttribute("role", "dialog");
  list.setAttribute("aria-labelledby", "notify-title");
  list.innerHTML =
    '<div class="notify-head"><h2 id="notify-title" tabindex="-1">Notifications</h2>' +
    '<button class="btn" type="button" data-act="clear">Clear</button>' +
    '<button class="icon-btn" type="button" data-act="close" aria-label="Close" title="Close"><span class="material-symbol-icon">close</span></button></div>' +
    '<div class="notify-scroll themed-scrollbar">' +
    '<div data-part="now" hidden><h3 class="notify-group-title">Now</h3><ul class="notify-entries"></ul></div>' +
    '<div data-part="recent"><h3 class="notify-group-title">Recent</h3><ul class="notify-entries"></ul><p class="notify-empty">No notifications yet.</p></div>' +
    "</div>" +
    '<div class="notify-foot"><button class="btn" type="button" data-act="settings"><span class="material-symbol-icon">settings</span>Notification settings</button></div>';
  hydrateIcons(list);
  listHost.append(list);
  button.setAttribute("aria-controls", list.id);
  button.setAttribute("aria-expanded", "false");
  const part = (name) => list.querySelector(`[data-part="${name}"]`);
  const act = (name) => list.querySelector(`[data-act="${name}"]`);
  if (!onSettings) act("settings").parentElement.hidden = true;

  function entryRow({ icon, text, detail, time, kind, level, highlight }) {
    const row = document.createElement("li");
    row.className = "notify-entry";
    row.classList.toggle("is-error", kind === "error");
    row.classList.toggle("is-warning", level === "warning");
    row.classList.toggle("is-unread", !!highlight);
    const label = document.createElement("span");
    label.className = "notify-text";
    label.textContent = text;
    const when = document.createElement("span");
    when.className = "notify-time";
    when.textContent = time ? notifyAgo(time) : "";
    row.append(iconSpan(icon), label, when);
    if (detail) {
      const more = document.createElement("span");
      more.className = "notify-detail";
      more.textContent = detail;
      row.append(more);
    }
    return row;
  }

  function activeLasting() {
    return NOTIFY_LASTING_ORDER.filter((id) => lasting.has(id)).map((id) => ({ id, ...lasting.get(id) }));
  }

  function renderList() {
    const now = activeLasting();
    part("now").hidden = now.length === 0;
    part("now").querySelector("ul").replaceChildren(...now.map((info) =>
      entryRow({ icon: info.icon, text: info.progress ? `${info.title} ${info.progress}` : info.title, detail: info.detail, level: info.warning ? "warning" : "" })));
    const recent = part("recent");
    recent.querySelector("ul").replaceChildren(...entries.map(entryRow));
    recent.querySelector(".notify-group-title").hidden = entries.length === 0;
    recent.querySelector(".notify-empty").hidden = entries.length > 0 || now.length > 0;
    act("clear").disabled = entries.length === 0;
  }

  function renderBadge() {
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    const label = unread ? `Notifications, ${unread} unread` : "Notifications";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  // Under the bell, lined up with its left edge when the bell is in the left half of the screen and its right edge otherwise.
  function placeList() {
    const anchor = button.getBoundingClientRect();
    const width = list.offsetWidth || Math.min(380, window.innerWidth - 16);
    const left = anchor.left < window.innerWidth / 2 ? anchor.left : anchor.right - width;
    list.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    list.style.top = `${Math.round(anchor.bottom + 6)}px`;
    list.style.maxHeight = `${Math.max(220, Math.round(window.innerHeight - anchor.bottom - 18))}px`;
  }

  function openList() {
    listOpen = true;
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    entries.forEach((entry) => {
      entry.highlight = entry.unread;
      entry.unread = false;
    });
    unread = 0;
    renderBadge();
    renderList();
    placeList();
    list.querySelector("#notify-title").focus({ preventScroll: true });
    clearInterval(timeTimer);
    timeTimer = setInterval(renderList, 30000);
  }

  function closeList(returnFocus = true) {
    if (!listOpen) return;
    listOpen = false;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    entries.forEach((entry) => (entry.highlight = false));
    clearInterval(timeTimer);
    if (returnFocus) button.focus({ preventScroll: true });
    onClose?.();
  }

  button.addEventListener("click", () => (listOpen ? closeList() : openList()));
  act("close").addEventListener("click", () => closeList());
  act("clear").addEventListener("click", () => {
    entries.length = 0;
    renderList();
    list.querySelector("#notify-title").focus({ preventScroll: true });
  });
  act("settings").addEventListener("click", () => {
    closeList(false);
    onSettings?.();
  });
  // A press outside closes the list, and Escape closes it before anything else it would close.
  document.addEventListener("pointerdown", (event) => {
    if (listOpen && !list.contains(event.target) && !button.contains(event.target)) closeList(false);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!listOpen || event.key !== "Escape" || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    event.stopPropagation();
    closeList();
  }, true);
  window.addEventListener("resize", () => listOpen && placeList());

  // ---- Popups ----
  const shownToasts = () => [...host.children].filter((toast) => !toast.classList.contains("is-leaving"));
  function dismiss(toast, now = false) {
    if (toast.classList.contains("is-leaving")) return;
    clearTimeout(toast.timer);
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), instant || now ? 0 : 160);
  }
  function resume(toast) {
    if (!toast.remaining || toast.hover || toast.focused) return;
    toast.started = Date.now();
    toast.running = true;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => dismiss(toast), toast.remaining);
  }
  // Takes off only the time since the countdown last ran, so a second pause, such as keyboard focus while the mouse
  // points at it, takes nothing more off.
  function pause(toast) {
    if (!toast.remaining || !toast.running) return;
    toast.running = false;
    clearTimeout(toast.timer);
    toast.remaining = Math.max(800, toast.remaining - (Date.now() - toast.started));
  }
  function newToast(key) {
    const toast = document.createElement("div");
    toast.className = "toast";
    if (key) toast.dataset.key = key;
    toast.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      toast.hover = true;
      pause(toast);
    });
    toast.addEventListener("pointerleave", () => {
      if (!toast.hover) return;
      toast.hover = false;
      resume(toast);
    });
    toast.addEventListener("focusin", () => {
      toast.focused = true;
      pause(toast);
    });
    toast.addEventListener("focusout", () => {
      toast.focused = false;
      resume(toast);
    });
    // A swipe to either side on a touch screen dismisses it.
    toast.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || event.target.closest("button")) return;
      const startX = event.clientX;
      let dx = 0;
      const move = (e) => {
        dx = e.clientX - startX;
        toast.style.transition = "none";
        toast.style.transform = `translateX(${dx}px)`;
        toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        toast.style.transition = "";
        if (Math.abs(dx) > 64) return void dismiss(toast, true);
        toast.style.transform = "";
        toast.style.opacity = "";
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
    return toast;
  }
  function showToast({ icon, text, detail, level }, key) {
    // A popup with the same key, such as a second favorite change, replaces the one showing and starts its time over.
    let toast = key ? shownToasts().find((shown) => shown.dataset.key === key) : null;
    if (!toast) {
      toast = newToast(key);
      toast.classList.toggle("is-warning", level === "warning");
      host.append(toast);
      // The cap never closes a warning: it closes the oldest popups that aren't one.
      const shown = shownToasts();
      shown.filter((old) => !old.classList.contains("is-warning"))
        .slice(0, Math.max(0, shown.length - POPUPS_AT_ONCE))
        .forEach((old) => dismiss(old, true));
    }
    toast.classList.toggle("is-warning", level === "warning");
    const words = document.createElement("div");
    words.className = "toast-text";
    const title = document.createElement("div");
    title.textContent = text;
    words.append(title);
    if (detail) {
      const more = document.createElement("div");
      more.className = "toast-detail";
      more.textContent = detail;
      words.append(more);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-btn";
    close.setAttribute("aria-label", "Dismiss");
    close.title = "Dismiss";
    close.append(iconSpan("close"));
    close.addEventListener("click", () => dismiss(toast));
    toast.replaceChildren(iconSpan(icon), words, close);
    // A warning stays until it is closed.
    clearTimeout(toast.timer);
    toast.running = false;
    toast.remaining = level === "warning" ? 0 : settings.seconds * 1000;
    resume(toast);
    return toast;
  }

  function add(entry) {
    entries.unshift(entry);
    if (entries.length > NOTIFY_KEEP) entries.length = NOTIFY_KEEP;
    renderBadge();
    if (listOpen) renderList();
  }

  /** A one-off message: it pops up if its kind is on, and the list keeps it either way. */
  // While three warnings show, there is no room for a new popup, unless it replaces one with the same key.
  function hasRoom(key) {
    const shown = shownToasts();
    return shown.some((toast) => toast.dataset.key === key) || shown.filter((toast) => toast.classList.contains("is-warning")).length < POPUPS_AT_ONCE;
  }

  // `icon` replaces the kind's where the kind's would mislead, such as a failure of a kind whose icon reads as success.
  function notify({ kind, text, detail = "", key = "", level = "", icon = "" }) {
    const entry = { kind, text, detail, level, icon: icon || (level === "warning" ? "warning" : NOTIFY_KINDS[kind]), time: Date.now(), unread: false };
    const toastKey = key || kind + ":" + text;
    const pops = settings.popups && !!settings.kinds[kind] && !listOpen && (settings.fullscreen || !inFullscreen()) && hasRoom(toastKey);
    if (!pops && !listOpen) {
      entry.unread = true;
      unread += 1;
    }
    add(entry);
    if (pops) showToast(entry, toastKey);
    // While the list is open nothing pops up, so a popup showing with this key would now be out of date: it closes,
    // and the list shows the new message.
    else if (listOpen) shownToasts().filter((toast) => toast.dataset.key === toastKey).forEach((toast) => dismiss(toast));
    return entry;
  }

  /** A message the user has already seen elsewhere, such as a notice, kept in the list only. */
  function record({ kind = "error", text, detail = "" }) {
    add({ kind, text, detail, level: "", icon: NOTIFY_KINDS[kind], time: Date.now(), unread: false });
  }

  function setLasting(id, info) {
    if (info) lasting.set(id, info);
    else lasting.delete(id);
    renderIndicator();
    if (listOpen) renderList();
  }

  function renderIndicator() {
    if (!indicator) return;
    const top = indicatorHidden() ? null : activeLasting()[0];
    indicator.hidden = !top;
    if (!top) return;
    indicator.dataset.state = top.id;
    indicator.classList.toggle("follows-controls", !!top.followsControls);
    indicator.classList.toggle("is-warning", !!top.warning);
    const icon = iconSpan(top.icon, top.spin ? "spins" : "");
    // Its own box, so a long state ends in an ellipsis before the corner buttons.
    const label = document.createElement("span");
    label.className = "player-indicator-text";
    label.textContent = top.title;
    const parts = [icon, label];
    // The percentage changes often, so it is left out of what a screen reader announces.
    if (top.progress) {
      const progress = document.createElement("span");
      progress.setAttribute("aria-hidden", "true");
      progress.textContent = top.progress;
      parts.push(" ", progress);
    }
    indicator.replaceChildren(...parts);
  }

  function applySettings() {
    host.dataset.pos = settings.position;
  }
  applySettings();
  renderBadge();

  activeNotifications = {
    notify,
    record,
    setLasting,
    renderIndicator,
    lasting: () => activeLasting(),
    /** Closes every popup, such as on entering fullscreen while Show in fullscreen is off. */
    dismissAll: () => shownToasts().forEach((toast) => dismiss(toast, true)),
    entries: () => entries.slice(),
    unread: () => unread,
    toasts: shownToasts,
    listShown: () => listOpen,
    openList,
    closeList,
    getSettings: () => JSON.parse(JSON.stringify(settings)),
    updateSettings(change) {
      settings = { ...settings, ...change, kinds: { ...settings.kinds, ...(change.kinds || {}) } };
      store.set("notify", settings);
      applySettings();
    },
    resetSettings() {
      store.remove("notify");
      settings = notifySettings();
      applySettings();
    },
    /** Shows where popups appear and for how long, without adding to the list. */
    preview() {
      return showToast({ icon: "notifications", text: "Popups show here.", detail: `For ${settings.seconds} seconds, unless you point at one or close it.` }, "preview");
    }
  };
  return activeNotifications;
}
