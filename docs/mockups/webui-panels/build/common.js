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

// The strict duration parser proposed for the WebUI: whole MM:SS or HH:MM:SS with seconds and minutes under 60, or a
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
 * A field using the validation pattern. `check(value)` returns null when the value is valid, or `{ message, empty }`.
 * An empty required field (`empty: true`) is flagged only once the user has typed in it, but still holds its action.
 */
const allFields = new Set();
let tipCounter = 0;

class ValidatedField {
  constructor(input, check, options) {
    const opts = options || {};
    this.input = input;
    this.check = check;
    this.pinned = !!opts.pinned;
    this.touched = !!opts.touched;
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

    input.addEventListener("input", () => {
      this.touched = true;
      this.update();
    });
    input.addEventListener("focus", () => this.place());
    input.addEventListener("blur", () => this.place());
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

  get flagged() {
    const problem = this.problem;
    return !!problem && !(problem.empty && !this.touched);
  }

  /** True while the action that uses this field can't proceed. */
  get holds() {
    return !!this.problem;
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  dispose() {
    allFields.delete(this);
  }

  reset(value) {
    if (value !== undefined) this.input.value = value;
    this.touched = false;
    this.update();
  }

  update() {
    const problem = this.problem;
    const flagged = this.flagged;
    this.wrap.classList.toggle("is-invalid", flagged);
    if (flagged) {
      this.tip.textContent = problem.message;
      this.input.setAttribute("aria-invalid", "true");
      this.input.setAttribute("aria-describedby", this.tip.id);
    } else {
      this.input.removeAttribute("aria-invalid");
      this.input.removeAttribute("aria-describedby");
    }
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
      (this.pinned || this.hover || document.activeElement === this.input) &&
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
 * Wires an action button to the fields it uses. While any of them holds the action, the button's label dims and it
 * reads as unavailable; when one of them is flagged, the red icon shows on its right too. Pressing it does nothing
 * but take the user to the first field that holds it.
 */
function holdAction(button, fields, options) {
  const opts = options || {};
  const describe = document.createElement("span");
  describe.className = "vh";
  describe.id = (button.id || "action") + "-held";
  button.after(describe);

  function blocker() {
    return fields().find((field) => field.holds) || null;
  }

  function refresh() {
    const field = blocker();
    const held = !!field;
    button.classList.toggle("shows-problem", held && fields().some((f) => f.flagged));
    if (held) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
    if (held) {
      describe.textContent = opts.reason ? opts.reason(field) : "Correct the field first.";
      button.setAttribute("aria-describedby", describe.id);
      button.title = describe.textContent;
    } else {
      button.removeAttribute("aria-describedby");
      button.removeAttribute("title");
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
 * The WebUI's dialog, as proposed: a themed modal that stacks above any dialog already open, so a confirmation opens
 * over the dialog that asked for it. Escape or a click outside closes only the top one, and focus returns to where
 * it was. It opens inside the element marked `data-dialog-host` (the fullscreen stage) so it shows in fullscreen.
 */
let dialogCounter = 0;
function openDialog({ content, labelledBy, role, onClose }) {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  if (labelledBy) dialog.setAttribute("aria-labelledby", labelledBy);
  if (role) dialog.setAttribute("role", role);
  dialog.append(content);
  (document.querySelector("[data-dialog-host]") || document.body).append(dialog);
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
 * A dialog with one name field that uses the validation pattern, Save held while the name is not valid, and an
 * optional Delete that asks first in a dialog stacked above. `extra(body)` can add fields after the name.
 */
function nameDialog({ title, label, value, check, holdReason, onSave, deleteMessage, onDelete, extra }) {
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
  input.type = "text";
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
  const save = dialogButton("Save", "", "submit");
  save.append(iconSpan("error", "btn-problem"));
  if (onDelete) {
    const remove = dialogButton("Delete", "btn-danger");
    remove.addEventListener("click", async () => {
      if (await confirmDialog({ message: deleteMessage(), confirmLabel: "Delete", danger: true })) {
        onDelete();
        close();
      }
    });
    actions.append(remove);
  }
  actions.append(spacer, cancel, save);
  form.append(actions);

  const field = new ValidatedField(input, check);
  const { close } = openDialog({ content: form, labelledBy: heading.id, onClose: () => field.dispose() });
  field.reset(value || "");
  holdAction(save, () => [field], { reason: holdReason });
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
