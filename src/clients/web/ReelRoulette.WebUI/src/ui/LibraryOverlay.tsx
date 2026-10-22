import { useLayoutEffect, useRef } from "preact/hooks";
import { FILTER_SUMMARY_LABEL, FILTER_SUMMARY_SEPARATOR } from "../filter/filterSummaryModel";
import { getSortLabel, LIBRARY_SORT_MODES } from "../library/libraryBrowseModel";
import type { LibraryOverlayMessage } from "../library/libraryOverlayModel";
import { RANDOMIZATION_MODES } from "../state/appStore";
import { useApp } from "./appContext";

/** The item id of the tile an event landed on, if any. */
function tileItemId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const tile = target.closest(".library-grid-tile[data-item-id]");
  return tile?.getAttribute("data-item-id") || null;
}

/**
 * The Library tab: its header with the count line and the collapse button, the Filters line, the controls (preset,
 * randomization mode, sort with its direction, and search), and the body with the grid or a message. The controls and
 * the Filters line collapse together. The panel shows and hides the tab's page.
 */
export function LibraryOverlay() {
  const { library, store, settings } = useApp();

  useLayoutEffect(() => {
    library.attach();
    return () => library.detach();
  }, []);

  const controls = library.controls.value;
  const collapsed = library.controlsCollapsed.value;
  const summary = library.summary.value;
  const body = library.body.value;
  // Nothing loads while the server fails the compatibility check or runs without a library, so search and sort have
  // nothing to change.
  const blocked = store.heldBack.value;
  // The tiles show their file names only with the Settings tab's option, which the stylesheet reads from this class, so
  // the grid's tiles aren't rendered again.
  return (
    <div id="library-overlay" class={settings.tileNames.value ? "library-overlay show-tile-names" : "library-overlay"}>
      <div class="library-overlay-header">
        <h2>Library</h2>
        <p id="library-overlay-summary" class="library-overlay-summary" aria-live="polite" hidden={summary === null}>
          <span aria-hidden="true">{summary?.shown}</span>
          <span class="visually-hidden">{summary?.spoken}</span>
        </p>
        <button
          id="library-controls-toggle"
          class="icon-glyph-base icon-glyph-button library-controls-toggle"
          type="button"
          aria-expanded={!collapsed}
          aria-controls="library-filter-summary library-controls"
          aria-label={collapsed ? "Show library controls and filters" : "Hide library controls and filters"}
          title={collapsed ? "Show controls & filters" : "Hide controls & filters"}
          onClick={library.toggleControls}
        >
          <span class="material-symbol-icon" aria-hidden="true">{collapsed ? "unfold_more" : "unfold_less"}</span>
        </button>
      </div>
      <FilterSummary collapsed={collapsed} />
      <div id="library-controls" class={collapsed ? "library-controls is-collapsed" : "library-controls"}>
        <div class="library-controls-pair">
          <PresetSelect />
          <RandomizationModeSelect />
        </div>
        <div class="library-controls-sort">
          <select id="library-sort-select" class="library-overlay-sort-select" aria-label="Sort library" value={controls.sortMode} disabled={blocked} onChange={(event) => library.setSortMode(event.currentTarget.value)}>
            {LIBRARY_SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>{getSortLabel(mode)}</option>
            ))}
          </select>
          <button id="library-sort-direction-btn" class="library-overlay-sort-direction" type="button" aria-label="Toggle sort direction" disabled={blocked} onClick={library.toggleSortDirection}>{library.directionLabel.value}</button>
        </div>
        <input id="library-search-input" class="library-overlay-search" type="search" placeholder="Search…" aria-label="Search library" autocomplete="off" value={controls.searchQuery} disabled={blocked} onInput={(event) => library.setSearch(event.currentTarget.value)} />
      </div>
      {body.kind === "grid" ? (
        <LibraryGrid key="grid" />
      ) : (
        <div key="status" id="library-overlay-body" class="library-overlay-body">
          {body.kind === "message" ? <LibraryMessage message={body.message} /> : null}
        </div>
      )}
    </div>
  );
}

/** One line naming the applied filters, shown while a filter applies. It opens the Filter tab. */
function FilterSummary({ collapsed }: { collapsed: boolean }) {
  const { library } = useApp();
  const parts = library.filterSummary.value;
  return (
    <button
      id="library-filter-summary"
      class={collapsed ? "library-filter-summary is-collapsed" : "library-filter-summary"}
      type="button"
      title="Open the Filter tab"
      hidden={parts.length === 0}
      onClick={() => void library.openFilterTab()}
    >
      <b>{FILTER_SUMMARY_LABEL}</b>
      {parts.join(FILTER_SUMMARY_SEPARATOR)}
    </button>
  );
}

/**
 * While it shows a message in place of the presets (loading, failed, the compatibility check, or running without a
 * library), it is disabled.
 */
function PresetSelect() {
  const { store } = useApp();
  const menu = store.presetMenu.value;
  return (
    <select
      id="preset-select"
      aria-label="Choose preset"
      value={menu.selectedValue}
      disabled={menu.message}
      onChange={(event) => store.pickHeaderPreset(event.currentTarget.value)}
    >
      {menu.entries.map((entry) => (
        <option key={entry.value} value={entry.value}>{entry.label}</option>
      ))}
    </select>
  );
}

function RandomizationModeSelect() {
  const { store } = useApp();
  return (
    <select
      id="randomization-mode-select"
      aria-label="Choose randomization mode"
      value={store.randomizationMode.value}
      onChange={(event) => store.setRandomizationMode(event.currentTarget.value)}
    >
      {RANDOMIZATION_MODES.map((mode) => (
        <option key={mode.value} value={mode.value}>{mode.label}</option>
      ))}
    </select>
  );
}

/**
 * The body while tiles show. The grid controller renders into it, so it has no children here, and it stays the
 * same element while the tiles change, so the scroll position stays.
 */
function LibraryGrid() {
  const { library } = useApp();
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => library.attachGrid(host.current!), []);

  function playTile(event: Event): void {
    const itemId = tileItemId(event.target);
    if (!itemId) {
      return;
    }
    event.preventDefault();
    void library.play(itemId);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      playTile(event);
    }
  }

  return <div id="library-overlay-body" class="library-overlay-body" ref={host} onClick={playTile} onKeyDown={onKeyDown}></div>;
}

function LibraryMessage({ message }: { message: LibraryOverlayMessage }) {
  return (
    <p
      class={message.error ? "library-overlay-status library-overlay-status-error" : "library-overlay-status"}
      role={message.error ? "alert" : undefined}
      aria-live={message.live ? "polite" : undefined}
    >
      {message.text}
    </p>
  );
}
