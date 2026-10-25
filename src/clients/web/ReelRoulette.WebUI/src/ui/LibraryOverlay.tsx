import { useLayoutEffect, useRef } from "preact/hooks";
import { FILTER_SUMMARY_LABEL, FILTER_SUMMARY_SEPARATOR } from "../filter/filterSummaryModel";
import { ALL_SELECTED_REASON } from "../library/library";
import { getSortLabel, LIBRARY_SORT_MODES } from "../library/libraryBrowseModel";
import { TILE_CHECK_CLASS } from "../library/libraryGridTile";
import type { LibraryOverlayMessage } from "../library/libraryOverlayModel";
import { listenForTilePress, type TilePress } from "../library/libraryTilePress";
import { RANDOM_LINE_LABEL } from "../random/randomOptions";
import { useApp } from "./appContext";
import { Icon } from "./Icon";
import { useLightDismiss } from "./LightDismiss";

/** The item id of the tile an event landed on, if any. */
function tileItemId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const tile = target.closest(".library-grid-tile[data-item-id]");
  return tile?.getAttribute("data-item-id") || null;
}

/** Whether an event landed on a tile's check icon. */
function onTileCheck(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(`.${TILE_CHECK_CLASS}`);
}

/**
 * The Library tab: its header with the count line and the collapse button, the Filters line, the Random line, the
 * controls (preset and search, then sort with its direction), the body with the grid or a message, and, while
 * selecting, the selection bar. The controls and both lines collapse together. The panel shows and hides the tab's
 * page.
 */
export function LibraryOverlay() {
  const { library, store, settings } = useApp();
  const selecting = library.selection.active.value;

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
  // The tiles show their file names only with the Settings tab's option, and their check icons while selecting, which
  // the stylesheet reads from these classes, so the grid's tiles aren't rendered again.
  const classes = ["library-overlay", settings.tileNames.value ? "show-tile-names" : null, selecting ? "is-selecting" : null];
  return (
    <div id="library-overlay" class={classes.filter(Boolean).join(" ")}>
      <div class="library-overlay-header">
        <h2>Library</h2>
        <p id="library-overlay-summary" class="library-overlay-summary" hidden={summary === null}>
          {summary}
        </p>
        <button
          id="library-controls-toggle"
          class="icon-glyph-base icon-glyph-button library-controls-toggle"
          type="button"
          aria-label={collapsed ? "Show library controls and filters" : "Hide library controls and filters"}
          title={collapsed ? "Show controls & filters" : "Hide controls & filters"}
          onClick={library.toggleControls}
        >
          <span class="material-symbol-icon" aria-hidden="true">{collapsed ? "unfold_more" : "unfold_less"}</span>
        </button>
      </div>
      <FilterSummary collapsed={collapsed} />
      <RandomLine collapsed={collapsed} />
      <div id="library-controls" class={collapsed ? "library-controls is-collapsed" : "library-controls"}>
        <div class="library-controls-pair">
          <PresetSelect />
          <input id="library-search-input" class="library-overlay-search" type="search" placeholder="Search…" aria-label="Search library" autocomplete="off" value={controls.searchQuery} disabled={blocked} onInput={(event) => library.setSearch(event.currentTarget.value)} />
        </div>
        <div class="library-controls-sort">
          <select id="library-sort-select" class="library-overlay-sort-select" aria-label="Sort library" value={controls.sortMode} disabled={blocked} onChange={(event) => library.setSortMode(event.currentTarget.value)}>
            {LIBRARY_SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>{getSortLabel(mode)}</option>
            ))}
          </select>
          <button id="library-sort-direction-btn" class="library-overlay-sort-direction" type="button" aria-label="Toggle sort direction" disabled={blocked} onClick={library.toggleSortDirection}>{library.directionLabel.value}</button>
        </div>
      </div>
      {body.kind === "grid" ? (
        <LibraryGrid key="grid" />
      ) : (
        <div key="status" id="library-overlay-body" class="library-overlay-body">
          {body.kind === "message" ? <LibraryMessage message={body.message} /> : null}
        </div>
      )}
      <SelectionBar />
    </div>
  );
}

/**
 * While selecting: Select all, Clear selection, how many are selected, and, at the far end, Selection actions, whose
 * menu opens above the bar and closes on a press outside it or Escape.
 */
function SelectionBar() {
  const { library } = useApp();
  const { selection } = library;
  const actions = useRef<HTMLDivElement>(null);
  useLightDismiss({
    open: selection.menuOpen,
    keepsOpen: (target) => !!target && !!actions.current?.contains(target),
    onPressOutside: selection.closeMenu,
    onEscape: selection.closeMenu
  });
  if (!selection.active.value) {
    return null;
  }
  const allSelected = library.allSelected.value;
  return (
    <div id="library-selection-bar" class="library-selection-bar">
      <button
        id="library-select-all"
        class="icon-glyph-base icon-glyph-button"
        type="button"
        aria-label="Select all"
        title={allSelected ? ALL_SELECTED_REASON : "Select all"}
        disabled={allSelected}
        onClick={() => void library.selectAll()}
      >
        <Icon name="select_all" />
      </button>
      <button
        id="library-clear-selection"
        class="icon-glyph-base icon-glyph-button"
        type="button"
        aria-label="Clear selection"
        title="Clear selection"
        onClick={selection.clear}
      >
        <Icon name="deselect" />
      </button>
      <span id="library-selection-count" class="library-selection-count">{`${selection.count.value.toLocaleString()} selected`}</span>
      <div class="library-selection-actions" ref={actions}>
        <button
          id="library-selection-actions"
          class="icon-glyph-base icon-glyph-button"
          type="button"
          aria-label="Selection actions"
          title="Selection actions"
          onClick={selection.toggleMenu}
        >
          <Icon name="more_vert" />
        </button>
        <div id="library-selection-menu" class="library-selection-menu" hidden={!selection.menuOpen.value}></div>
      </div>
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
      class={collapsed ? "library-line is-collapsed" : "library-line"}
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

/** One line naming the random pick options, always shown, in the Filters line's style. It opens the Randomization tab. */
function RandomLine({ collapsed }: { collapsed: boolean }) {
  const { library } = useApp();
  return (
    <button
      id="library-random-line"
      class={collapsed ? "library-line is-collapsed" : "library-line"}
      type="button"
      title="Open the Randomization tab"
      onClick={() => void library.openRandomizationTab()}
    >
      <b>{RANDOM_LINE_LABEL}</b>
      {library.randomLine.value}
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

/**
 * The body while tiles show. The grid controller renders into it, so it has no children here, and it stays the
 * same element while the tiles change, so the scroll position stays. A click on a tile plays it or selects it, and a
 * long press with a finger or a pen selects it, without the click it ends with doing either again.
 */
function LibraryGrid() {
  const { library } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const press = useRef<TilePress | null>(null);

  useLayoutEffect(() => {
    const destroyGrid = library.attachGrid(host.current!);
    const tilePress = listenForTilePress(host.current!, { tileItemId, onLongPress: (itemId) => library.longPressTile(itemId) });
    press.current = tilePress;
    return () => {
      tilePress.dispose();
      press.current = null;
      destroyGrid();
    };
  }, []);

  function chooseTile(event: MouseEvent): void {
    if (press.current?.takeClick()) {
      return;
    }
    const itemId = tileItemId(event.target);
    if (!itemId) {
      return;
    }
    void library.clickTile(itemId, {
      onCheck: onTileCheck(event.target),
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    });
  }

  return <div id="library-overlay-body" class="library-overlay-body" ref={host} onClick={chooseTile}></div>;
}

function LibraryMessage({ message }: { message: LibraryOverlayMessage }) {
  return (
    <p class={message.error ? "library-overlay-status library-overlay-status-error" : "library-overlay-status"}>{message.text}</p>
  );
}
