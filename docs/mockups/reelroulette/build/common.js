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
