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

async function load(name, width) {
  console.log(`  loading ${name}@${width}`);
  const window = new Window({ width, height: 800, url: "https://mockup.test/" + name, settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
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

for (const name of ["index", "validation", "desktop-notice"]) {
  const { errors } = await load(name, 1280);
  check(`${name}: no script errors ${errors.join("; ")}`, errors.length === 0);
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
  const { document, errors, window } = await load("layout", width);
  const $ = (id) => document.getElementById(id);
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
  };
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  const nativeCalls = [];
  for (const name of ["confirm", "prompt", "alert"]) window[name] = () => nativeCalls.push(name);
  const openDialogs = () => [...document.querySelectorAll("dialog.app-dialog")];
  const topDialog = () => openDialogs().at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  const pressEscape = (dialog) => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
  // Next can land on a file this browser can't play, whose notice then needs its OK.
  const dismissNotices = () => {
    for (const dialog of openDialogs().reverse()) {
      if (dialog.textContent.includes("isn't supported") || dialog.textContent.includes("not found")) button(dialog, "OK").click();
    }
  };
  const next = () => {
    $("next-btn").click();
    dismissNotices();
  };
  check(`layout@${width}: no script errors on load ${errors.join("; ")}`, errors.length === 0);
  check(`layout@${width}: panel starts closed and playing`, $("panel").hidden && $("play-chip").textContent.includes("Playing"));
  const corner = [...document.querySelectorAll(".overlay-corner-btn")].map((b) => b.id).join(",");
  check(`layout@${width}: the player's corner buttons are ${corner}`, corner === "panel-btn,favorite-btn,blacklist-btn");
  check(`layout@${width}: the header has no settings icon`, !$("header-settings") && !!$("header-admin"));
  $("next-btn").click();
  $("next-btn").click();
  check(`layout@${width}: Next moves from videos to a photo (${$("np-name").textContent})`, $("np-name").textContent.endsWith(".jpg") && $("seek").disabled);
  $("next-btn").click();
  check(`layout@${width}: and back to a video`, $("np-name").textContent.endsWith(".mp4") && !$("seek").disabled);
  $("panel-btn").click();
  const overlay = $("stage").classList.contains("is-overlay");
  check(`layout@${width}: the panel button opens the panel on its last tab (Library) as ${overlay ? "overlay" : "side panel"}`,
    !$("panel").hidden && !$("tab-library").hidden && overlay === (width < 800) && $("panel-btn").getAttribute("aria-expanded") === "true");
  check(`layout@${width}: open state remembered`, window.localStorage.getItem("rr-mockup.open") === "true");
  check(`layout@${width}: Responsive Auto-Pause ${overlay ? "pauses" : "keeps playing"}`,
    $("play-chip").textContent.includes(overlay ? "Auto-Paused" : "Playing"));
  $("tab-btn-filter").click();
  const min = $("filter-min");
  input(min, "1:7x");
  const apply = $("filter-apply");
  const applyKids = [...apply.children].map((c) => c.className.split(" ")[0]).join(",");
  check(`layout@${width}: strict parser flags 1:7x; Apply held with its icon after the label (${applyKids})`,
    min.getAttribute("aria-invalid") === "true" && apply.getAttribute("aria-disabled") === "true" && applyKids === "btn-label,btn-problem");
  check(`layout@${width}: the tooltip sits inside the field`, min.closest(".vfield").contains(document.getElementById(min.getAttribute("aria-describedby"))));
  document.querySelector('[data-sub="presets"]').click();
  apply.click();
  check(`layout@${width}: held Apply goes to the field and keeps the panel open`,
    !document.querySelector('[data-subpanel="general"]').hidden && document.activeElement === min && !$("panel").hidden && $("status").textContent === "Ready");
  input(min, "1:30");
  document.querySelector('[data-sub="presets"]').click();
  const presetNames = () => [...document.querySelectorAll(".filter-preset-row")].map((r) => r.dataset.key).join(",");
  const rowButtons = [...document.querySelector(".filter-preset-row").querySelectorAll("button")].map((b) => b.title).join(",");
  check(`layout@${width}: preset rows have a handle and Edit only (${rowButtons})`, rowButtons === "Drag to reorder,Edit preset");
  key(document.querySelector(".filter-preset-row .drag-handle"), "ArrowDown");
  check(`layout@${width}: ArrowDown on a preset's handle moves it (${presetNames()}) and keeps focus on it`,
    presetNames() === "Short clips,Favorites,Photos only,Long videos" && document.activeElement?.closest(".filter-preset-row")?.dataset.key === "Favorites" && $("filter-apply-label").textContent === "Apply*");
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
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: confirming deletes the preset and closes both dialogs (${presetNames()})`, openDialogs().length === 0 && !presetNames().includes("Long videos"));
  const dot = (id) => !$(id).querySelector(".unsaved-dot").hidden;
  check(`layout@${width}: unsaved Filter changes mark the Filter tab and the panel button`,
    dot("tab-btn-filter") && dot("panel-btn") && !dot("tab-btn-tags") && $("tab-btn-filter").getAttribute("aria-label") === "Filter, unsaved changes" && $("panel-btn").getAttribute("aria-label").endsWith(", unsaved changes"));
  apply.click();
  check(`layout@${width}: Apply clears the dots`, !dot("tab-btn-filter") && !dot("panel-btn"));
  check(`layout@${width}: valid Apply applies${overlay ? " and closes the overlay" : " and stays open"}`,
    $("status").textContent === "Filters applied." && $("panel").hidden === overlay);
  check(`layout@${width}: closing resumes playback`, overlay ? $("play-chip").textContent.includes("Playing") : true);
  if ($("panel").hidden) $("panel-btn").click();
  check(`layout@${width}: reopening comes back on the last tab (Filter)`, !$("tab-filter").hidden);
  $("tab-btn-tags").click();
  const chipButtons = [...document.querySelector("#tags-body .tag-chip").querySelectorAll("button")].map((b) => b.title).join(",");
  check(`layout@${width}: chips have no delete (${chipButtons})`, chipButtons === "Add tag,Remove tag,Edit tag");
  const header = document.querySelector('#tags-body [data-key="people"] .tag-category-header');
  const headerButtons = [...header.querySelectorAll("button")].map((b) => b.className.split(" ")[0]).join(",");
  check(`layout@${width}: category headers hold a handle, the name, and Edit, with no arrows (${headerButtons})`,
    headerButtons === "drag-handle,tag-category-toggle,icon-btn" && !header.querySelector('[title="Move category up"]'));
  header.querySelector(".tag-category-toggle").click();
  const peopleGrid = document.querySelector('#tags-body [data-key="people"] .tag-grid');
  check(`layout@${width}: clicking the header's name collapses the category`, peopleGrid.hidden && header.querySelector(".tag-category-toggle").getAttribute("aria-expanded") === "false");
  header.click();
  check(`layout@${width}: clicking the header itself expands it again`, !peopleGrid.hidden);
  const categoryOrder = () => [...document.querySelectorAll("#tags-body .tag-category")].map((c) => c.dataset.key).join(",");
  key(document.querySelector('#tags-body [data-key="events"] .drag-handle'), "ArrowDown");
  check(`layout@${width}: Uncategorized stays last (${categoryOrder()})`, categoryOrder() === "people,places,events,uncategorized");
  key(document.querySelector('#tags-body [data-key="events"] .drag-handle'), "ArrowUp");
  check(`layout@${width}: ArrowUp moves a category (${categoryOrder()}) and Save turns on`, categoryOrder() === "people,events,places,uncategorized" && !$("tags-save").disabled);
  document.querySelector('#tags-body [data-key="places"] [title="Edit category"]').click();
  const categoryDialog = topDialog();
  const categoryName = categoryDialog.querySelector("input");
  input(categoryName, "people");
  check(`layout@${width}: a taken category name is flagged and Save held`,
    categoryName.getAttribute("aria-invalid") === "true" && button(categoryDialog, "Save").getAttribute("aria-disabled") === "true");
  button(categoryDialog, "Delete").click();
  check(`layout@${width}: category Delete asks with today's wording`, topDialog().textContent.includes('Delete category "Places"? Tags will become Uncategorized.'));
  button(topDialog(), "Delete").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: confirming removes it (${categoryOrder()})`, !categoryOrder().includes("places") && openDialogs().length === 0);
  document.querySelector('#tags-body [title="Edit tag"]').click();
  const tagDialog = topDialog();
  const name = tagDialog.querySelector("input");
  input(name, "");
  check(`layout@${width}: emptied tag name flagged and Save held`,
    name.getAttribute("aria-invalid") === "true" && button(tagDialog, "Save").getAttribute("aria-disabled") === "true");
  button(tagDialog, "Delete").click();
  button(topDialog(), "Delete").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: Delete in Edit Tag removes the chip`, ![...document.querySelectorAll("#tags-body .tag-chip-label")].some((l) => l.textContent === "Alice"));
  $("tags-add-category").click();
  check(`layout@${width}: New Category opens as an in-app dialog`, topDialog()?.querySelector("h3")?.textContent === "New Category");
  pressEscape(topDialog());
  // The Tags tab follows the playing item unless it has unsaved changes to its item's tags.
  const line = $("tags-target");
  const edited = $("np-name").textContent;
  document.querySelector('#tags-body .tag-chip [title="Add tag"]').click();
  next();
  check(`layout@${width}: with unsaved tag changes the tab stays on its item and names it ("${line.textContent}")`,
    !line.hidden && line.textContent === `Editing tags for ${edited}` && $("np-name").textContent !== edited);
  $("panel-close").click();
  check(`layout@${width}: closing the panel keeps them, without asking, and the panel button shows the dot`,
    $("panel").hidden && openDialogs().length === 0 && dot("panel-btn") && $("panel-btn").getAttribute("aria-label") === "Open panel, unsaved changes");
  $("panel-btn").click();
  $("tab-btn-library").click();
  $("tab-btn-tags").click();
  check(`layout@${width}: reopening and switching tabs keeps them (Tags dot, Save lit, line shown)`,
    dot("tab-btn-tags") && !$("tags-save").disabled && !line.hidden);
  $("tags-save").click();
  check(`layout@${width}: after Save it follows the playing item, and the dots go`, line.hidden && !dot("tab-btn-tags") && !dot("panel-btn"));
  next();
  check(`layout@${width}: with no unsaved changes it follows`, line.hidden);
  document.querySelector('#tags-body .tag-chip [title="Remove tag"]').click();
  next();
  $("tags-refresh").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: Refresh asks "Discard changes?" with Cancel focused`,
    topDialog()?.textContent.includes("Discard changes?") && document.activeElement?.textContent.trim() === "Cancel" && !line.hidden);
  button(topDialog(), "Discard").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: after discarding it follows and nothing is pending`, line.hidden && $("tags-save").disabled);
  check(`layout@${width}: no browser dialog was used (${nativeCalls.join(",")})`, nativeCalls.length === 0);
  $("open-autotag").click();
  check(`layout@${width}: Auto Tag opens`, !$("autotag").hidden);
  $("autotag-close").click();
  $("panel-btn").click();
  // A photo: the scrub bar stays visible and disabled, and fills only with Autoplay on.
  $("tab-btn-library").click();
  $("lib-preset").value = "Photos only";
  $("lib-preset").dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 520));
  $("lib-grid").querySelector(".lib-tile").click();
  if (!$("panel").hidden) $("panel-close").click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  const seek = $("seek");
  check(`layout@${width}: on a photo the scrub bar shows, disabled, filling with Autoplay (${seek.value} / ${seek.max}, "${$("time-display").textContent}")`,
    seek.disabled && Number(seek.value) > 0 && $("time-display").textContent.includes("/ 00:05") && $("mute-btn").disabled);
  $("autoplay-btn").click();
  check(`layout@${width}: with Autoplay off it stays empty`, Number(seek.value) === 0 && $("time-display").textContent === "");
  $("autoplay-btn").click();
  dismissNotices();

  // Stats: the file name opens it; Copy Path off the server machine, Show in File Manager on it.
  $("np-name").click();
  check(`layout@${width}: the file name opens the Stats tab on the current file`,
    !$("panel").hidden && !$("tab-stats").hidden && $("stats-body").textContent.includes($("np-name").textContent) && $("stats-body").textContent.includes("Copy Path"));
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
  check(`layout@${width}: the shortcut reference lists the bindings`, $("shortcut-list").querySelectorAll("dt").length === 15);

  // Keyboard shortcuts, ignored while typing.
  const press = (k, target = document.body, extra = {}) =>
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
  $("panel-close").click();
  dismissNotices();
  press("2");
  check(`layout@${width}: 2 opens the Filter tab`, !$("panel").hidden && !$("tab-filter").hidden);
  press("2");
  check(`layout@${width}: 2 again closes the panel`, $("panel").hidden);
  const volumeBefore = Number($("volume").value);
  press(",");
  check(`layout@${width}: comma lowers the volume by the step (${volumeBefore} to ${$("volume").value})`, Number($("volume").value) === volumeBefore - 5);
  $("panel-btn").click();
  $("tab-btn-library").click();
  const before = $("play-chip").textContent;
  press("k", $("lib-search"));
  check(`layout@${width}: K in the search box types instead of pausing`, $("play-chip").textContent === before);

  // Multi-select and bulk actions; removing from the library is an admin action.
  $("lib-preset").value = "";
  $("lib-preset").dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 520));
  $("lib-select").click();
  const tiles = () => [...$("lib-grid").querySelectorAll(".lib-tile")];
  check(`layout@${width}: selection marks the tiles as checkboxes`, tiles()[0].getAttribute("role") === "checkbox" && !$("bulk-bar").hidden);
  tiles()[0].click();
  tiles()[1].click();
  check(`layout@${width}: two taps select two (${$("bulk-count").textContent})`, $("bulk-count").textContent === "2 selected" && tiles()[0].classList.contains("is-selected"));
  $("bulk-actions").click();
  $("bulk-menu").querySelector('[data-bulk="tags"]').click();
  check(`layout@${width}: Edit tags for 2 items opens`, topDialog()?.textContent.includes("Edit tags for 2 items"));
  pressEscape(topDialog());
  const removedName = tiles()[0].getAttribute("aria-label");
  $("bulk-actions").click();
  $("bulk-menu").querySelector('[data-bulk="remove"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: Remove from library asks for the control token first`, topDialog()?.querySelector("h3")?.textContent === "Control token");
  input(topDialog().querySelector("input"), "secret-token");
  topDialog().querySelector('button[type="submit"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: then asks to remove, with the delete-from-disk option`, topDialog()?.textContent.includes("Remove 2 items from the library?") && topDialog().textContent.includes("Also delete the files from disk"));
  button(topDialog(), "Remove").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`layout@${width}: the items leave the grid (${$("status").textContent})`, !tiles().some((t) => t.getAttribute("aria-label") === removedName) && $("status").textContent === "Removed 2 items from the library.");
  $("bulk-exit").click();

  // The browser-playable option and the format notice.
  const avi = tiles().find((t) => t.getAttribute("aria-label").endsWith(".avi"));
  avi.click();
  check(`layout@${width}: an .avi says its format isn't supported (${topDialog()?.textContent.slice(0, 60)})`,
    topDialog()?.textContent.includes("format (.avi) isn't supported in this browser") && $("play-chip").textContent.includes("Can't play"));
  button(topDialog(), "OK").click();
  if ($("panel").hidden) $("panel-btn").click();
  $("tab-btn-filter").click();
  document.querySelector('[data-sub="general"]').click();
  $("filter-playable").click();
  $("filter-playable").dispatchEvent(new window.Event("change", { bubbles: true }));
  $("filter-apply").click();
  await new Promise((resolve) => setTimeout(resolve, 520));
  if ($("panel").hidden) $("panel-btn").click();
  $("tab-btn-library").click();
  await new Promise((resolve) => setTimeout(resolve, 520));
  check(`layout@${width}: with it on, no .avi or .wmv tiles show, and the filter line says so (${$("lib-filters").textContent})`,
    !tiles().some((t) => /\.(avi|wmv)$/.test(t.getAttribute("aria-label"))) && $("lib-filters").textContent.includes("Only files this browser can play"));

  // Pairing prompt and read-only volume.
  $("mock-pairing").click();
  check(`layout@${width}: the pairing prompt shows in the header`, !$("pair").hidden);
  input($("pair-token"), "x");
  input($("pair-token"), "");
  check(`layout@${width}: an emptied pairing token is flagged and Pair held`, $("pair-token").getAttribute("aria-invalid") === "true" && $("pair-btn").getAttribute("aria-disabled") === "true");
  input($("pair-token"), "abc123");
  $("pair").dispatchEvent(new window.Event("submit", { cancelable: true }));
  check(`layout@${width}: Pair hides the prompt`, $("pair").hidden && $("status").textContent === "Paired.");
  $("mock-ios-volume").click();
  check(`layout@${width}: a read-only volume hides the slider`, $("volume-wrap").hidden);
  check(`layout@${width}: no browser dialog was used anywhere (${nativeCalls.join(",")})`, nativeCalls.length === 0);
  check(`layout@${width}: no script errors anywhere ${errors.join("; ")}`, errors.length === 0);
}

for (const width of [1280, 390]) {
  const { document, errors, window } = await load("admin", width);
  const $ = (id) => document.getElementById(id);
  const input = (el, value) => {
    el.value = value;
    el.dispatchEvent(new window.Event("input"));
  };
  const topDialog = () => [...document.querySelectorAll("dialog.app-dialog")].at(-1);
  const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(label));
  check(`admin@${width}: no script errors on load ${errors.join("; ")}`, errors.length === 0);
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
  check(`admin@${width}: Edit Source holds the name and Remove`, topDialog()?.querySelector("h3")?.textContent === "Edit Source" && !!button(topDialog(), "Delete"));
  topDialog().dispatchEvent(new window.Event("cancel", { cancelable: true }));
  $("dup-scan").click();
  check(`admin@${width}: a duplicate scan opens review inside admin`, !$("review").hidden && $("admin").hidden && $("review-summary").textContent.includes("Keep All"));
  document.querySelector('#review-body .dup-file input[type="radio"]').click();
  document.querySelector('#review-body .dup-file input[type="radio"]').dispatchEvent(new window.Event("change"));
  $("review-apply").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: deleting asks with the counts (${topDialog()?.textContent.slice(0, 40)})`, topDialog()?.textContent.includes("Delete 1 files from 1 groups?"));
  button(topDialog(), "Delete").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(`admin@${width}: and review closes`, $("review").hidden && !$("admin").hidden);
  $("mock-no-library").click();
  check(`admin@${width}: without a library the server card says why and Refresh is off`, !$("no-library").hidden && $("refresh-now").disabled);
  check(`admin@${width}: no script errors anywhere ${errors.join("; ")}`, errors.length === 0);
}

{
  const { document, errors } = await load("desktop-notice", 1280);
  document.getElementById("notice-open").click();
  check(`desktop-notice: Open Web UI closes the notice ${errors.join("; ")}`, document.getElementById("notice").hidden && errors.length === 0);
}

console.log(failures ? `${failures} failed` : "all passed");
for (const w of windows) await w.happyDOM.abort();
process.exit(failures ? 1 : 0);
