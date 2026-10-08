import { useLayoutEffect, useRef } from "preact/hooks";
import type { LibraryOverlayMessage } from "../library/libraryOverlayModel";
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
 * The library overlay: header, search and sort toolbar, and the body with the grid or a message. The library
 * shows and hides the overlay by setting its `display`, so its `style` is rendered once and never changed here.
 */
export function LibraryOverlay() {
  const { library } = useApp();
  const overlay = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    library.attach({ overlay: overlay.current! });
    return () => library.detach();
  }, []);

  const controls = library.controls.value;
  const summary = library.summary.value;
  const body = library.body.value;
  return (
    <div id="library-overlay" class="library-overlay" style="display:none" ref={overlay}>
      <div class="library-overlay-header">
        <h2>Library</h2>
        <p id="library-overlay-summary" class="library-overlay-summary" aria-live="polite" hidden={summary === null}>{summary}</p>
        <div class="library-overlay-actions">
          <button id="library-overlay-close-btn" class="icon-glyph-base icon-glyph-button" type="button" title="Close" aria-label="Close" onClick={library.close}><span class="material-symbol-icon">close</span></button>
        </div>
      </div>
      <div id="library-overlay-toolbar" class="library-overlay-toolbar" style={{ display: library.toolbarShown.value ? "flex" : "none" }}>
        <input id="library-search-input" class="library-overlay-search" type="search" placeholder="Search…" aria-label="Search library" autocomplete="off" value={controls.searchQuery} onInput={(event) => library.setSearch(event.currentTarget.value)} />
        <div class="library-overlay-sort-cluster">
          <select id="library-sort-select" class="library-overlay-sort-select" aria-label="Sort library" value={controls.sortMode} onChange={(event) => library.setSortMode(event.currentTarget.value)}>
            <option value="Name">Name</option>
            <option value="LastPlayed">Last played</option>
            <option value="PlayCount">Play count</option>
            <option value="Duration">Duration</option>
            <option value="DateAdded">Date added</option>
          </select>
          <button id="library-sort-direction-btn" class="library-overlay-sort-direction" type="button" aria-label="Toggle sort direction" onClick={library.toggleSortDirection}>{library.directionLabel.value}</button>
        </div>
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
