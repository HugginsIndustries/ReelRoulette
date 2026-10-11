import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { PANEL_MIN_WIDTH, PANEL_TABS, type PanelTab } from "../panel/panelHost";
import { useApp } from "./appContext";
import { FilterDialog } from "./FilterDialog";
import { LibraryOverlay } from "./LibraryOverlay";
import { ScreenBoundary } from "./ScreenBoundary";
import { TagEditor } from "./TagEditor";

const TABS: Record<PanelTab, { label: string; icon: string }> = {
  library: { label: "Library", icon: "browse" },
  filter: { label: "Filter", icon: "filter_alt" },
  tags: { label: "Tags", icon: "tag" }
};

/** How far the handle's arrow keys move it, and with Shift. */
const HANDLE_STEP = 16;
const HANDLE_STEP_LARGE = 64;

/**
 * The side panel and the handle that resizes it. The panel host shows and hides the panel, the handle, and the tab
 * pages by their `hidden`, so it is rendered once here and never changed; the tab row and the handle render apart
 * from the pages, so choosing a tab or dragging the handle doesn't render the pages again.
 */
export function Panel() {
  const { api, panel } = useApp();
  const handle = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  const library = useRef<HTMLElement>(null);
  const filter = useRef<HTMLElement>(null);
  const tags = useRef<HTMLElement>(null);

  // The pages' own effects have run by now, so a tab remembered open can start once the server has been checked.
  useLayoutEffect(() => {
    panel.attach({
      stage: aside.current!.parentElement!,
      panel: aside.current!,
      handle: handle.current!,
      pages: { library: library.current!, filter: filter.current!, tags: tags.current! }
    });
    return () => panel.detach();
  }, []);

  const relay = api.relayLog;
  return (
    <>
      <PanelHandle element={handle} />
      <aside id="panel" class="panel" aria-label="Panel" hidden ref={aside}>
        <PanelTabs />
        <section id="panel-page-library" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-library" hidden ref={library}>
          <ScreenBoundary screen="library" relay={relay}>
            <LibraryOverlay />
          </ScreenBoundary>
        </section>
        <section id="panel-page-filter" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-filter" hidden ref={filter}>
          <ScreenBoundary screen="filter" relay={relay}>
            <FilterDialog />
          </ScreenBoundary>
        </section>
        <section id="panel-page-tags" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-tags" hidden ref={tags}>
          <ScreenBoundary screen="tags" relay={relay}>
            <TagEditor />
          </ScreenBoundary>
        </section>
      </aside>
    </>
  );
}

/** The row of icon-only tabs, and the panel's Close, which waits while Auto Tag scans as the tag editor's Close did. */
function PanelTabs() {
  const { panel, tagEditor } = useApp();
  const shown = panel.tab.value;
  const scanning = shown === "tags" && (tagEditor.view.value?.autoTag.scanning ?? false);
  return (
    <div class="panel-tabs">
      <div class="panel-tablist" role="tablist" aria-label="Panel tabs">
        {PANEL_TABS.map((name) => {
          const { label, icon } = TABS[name];
          return (
            <button key={name} type="button" id={`panel-tab-${name}`} class="panel-tab" role="tab" aria-selected={name === shown ? "true" : "false"} aria-controls={`panel-page-${name}`} aria-label={label} title={label} onClick={() => void panel.showTab(name)}>
              <span class="material-symbol-icon">{icon}</span>
            </button>
          );
        })}
      </div>
      <span class="panel-tabs-spacer"></span>
      <button type="button" id="panel-close-btn" class="icon-glyph-base icon-glyph-button panel-close" aria-label="Close panel" title="Close" disabled={scanning} onClick={() => void panel.close()}>
        <span class="material-symbol-icon">close</span>
      </button>
    </div>
  );
}

/**
 * The handle between the player and the panel. Dragging it, or its arrow keys, Home, and End, set the panel's width
 * within its limits; the width is remembered once the drag ends or the key is pressed. A click that doesn't drag
 * leaves the remembered width, which can be wider than the window allows.
 */
function PanelHandle({ element }: { element: { current: HTMLDivElement | null } }) {
  const { panel } = useApp();
  const [dragging, setDragging] = useState(false);
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  function onPointerDown(event: PointerEvent): void {
    const handle = element.current;
    if (event.button !== 0 || !handle) {
      return;
    }
    event.preventDefault();
    const half = handle.offsetWidth / 2;
    let dragged = false;
    const move = (moved: PointerEvent) => {
      dragged = true;
      const stage = handle.parentElement!.getBoundingClientRect();
      const width = panel.side.peek() === "right" ? stage.right - moved.clientX - half : moved.clientX - stage.left - half;
      panel.setWidth(width, false);
    };
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      endDrag.current = null;
      setDragging(false);
      if (dragged) {
        panel.setWidth(panel.width.peek(), true);
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    endDrag.current = end;
    setDragging(true);
  }

  function onKeyDown(event: KeyboardEvent): void {
    const grow = panel.side.peek() === "right" ? "ArrowLeft" : "ArrowRight";
    const shrink = panel.side.peek() === "right" ? "ArrowRight" : "ArrowLeft";
    const step = event.shiftKey ? HANDLE_STEP_LARGE : HANDLE_STEP;
    const width = panel.width.peek();
    const next =
      event.key === grow ? width + step
      : event.key === shrink ? width - step
      : event.key === "Home" ? PANEL_MIN_WIDTH
      : event.key === "End" ? panel.maxWidth.peek()
      : null;
    if (next === null) {
      return;
    }
    event.preventDefault();
    panel.setWidth(next, true);
  }

  const width = panel.width.value;
  return (
    <div
      id="panel-handle"
      class={dragging ? "panel-handle is-dragging" : "panel-handle"}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-controls="panel"
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={panel.maxWidth.value}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      hidden
      ref={element}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span class="handle-grip"></span>
    </div>
  );
}
