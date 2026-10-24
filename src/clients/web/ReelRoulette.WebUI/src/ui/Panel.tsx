import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { PANEL_TABS, type PanelTab } from "../panel/panelHost";
import { useApp } from "./appContext";
import { FilterDialog } from "./FilterDialog";
import { LibraryOverlay } from "./LibraryOverlay";
import { RandomizationTab } from "./RandomizationTab";
import { ScreenBoundary } from "./ScreenBoundary";
import { SettingsTab } from "./SettingsTab";
import { StatsTab } from "./StatsTab";
import { TagEditor } from "./TagEditor";

const TABS: Record<PanelTab, { label: string; icon: string }> = {
  library: { label: "Library", icon: "browse" },
  tags: { label: "Tags", icon: "tag" },
  stats: { label: "Stats", icon: "bar_chart" },
  filter: { label: "Filter", icon: "filter_alt" },
  randomization: { label: "Randomization", icon: "casino" },
  settings: { label: "Settings", icon: "settings" }
};

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
  const tags = useRef<HTMLElement>(null);
  const stats = useRef<HTMLElement>(null);
  const filter = useRef<HTMLElement>(null);
  const randomization = useRef<HTMLElement>(null);
  const settings = useRef<HTMLElement>(null);

  // The pages' own effects have run by now, so a tab remembered open can start once the server has been checked.
  useLayoutEffect(() => {
    panel.attach({
      stage: aside.current!.parentElement!,
      panel: aside.current!,
      handle: handle.current!,
      pages: {
        library: library.current!,
        tags: tags.current!,
        stats: stats.current!,
        filter: filter.current!,
        randomization: randomization.current!,
        settings: settings.current!
      }
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
        <section id="panel-page-tags" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-tags" hidden ref={tags}>
          <ScreenBoundary screen="tags" relay={relay}>
            <TagEditor />
          </ScreenBoundary>
        </section>
        <section id="panel-page-stats" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-stats" hidden ref={stats}>
          <ScreenBoundary screen="stats" relay={relay}>
            <StatsTab />
          </ScreenBoundary>
        </section>
        <section id="panel-page-filter" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-filter" hidden ref={filter}>
          <ScreenBoundary screen="filter" relay={relay}>
            <FilterDialog />
          </ScreenBoundary>
        </section>
        <section id="panel-page-randomization" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-randomization" hidden ref={randomization}>
          <ScreenBoundary screen="randomization" relay={relay}>
            <RandomizationTab />
          </ScreenBoundary>
        </section>
        <section id="panel-page-settings" class="panel-page" role="tabpanel" aria-labelledby="panel-tab-settings" hidden ref={settings}>
          <ScreenBoundary screen="settings" relay={relay}>
            <SettingsTab />
          </ScreenBoundary>
        </section>
      </aside>
    </>
  );
}

/**
 * The row of icon-only tabs, and the panel's Close. While the Filter or Tags tab holds unsaved changes, an orange dot
 * marks its icon and its name says so.
 */
function PanelTabs() {
  const { panel, unsaved } = useApp();
  const shown = panel.tab.value;
  // The Library, Stats, Randomization, and Settings tabs hold no changes, so they have no dot.
  const dots: Record<PanelTab, boolean | null> = { library: null, stats: null, randomization: null, settings: null, ...unsaved.value };
  return (
    <div class="panel-tabs">
      <div class="panel-tablist" role="tablist" aria-label="Panel tabs">
        {PANEL_TABS.map((name) => {
          const { label, icon } = TABS[name];
          const held = dots[name];
          return (
            <button key={name} type="button" id={`panel-tab-${name}`} class="tab panel-tab" role="tab" aria-selected={name === shown ? "true" : "false"} aria-label={held ? `${label}, unsaved changes` : label} title={held ? `${label} (unsaved changes)` : label} onClick={() => void panel.showTab(name)}>
              <span class="material-symbol-icon">{icon}</span>
              {held === null ? null : <span class="unsaved-dot" hidden={!held}></span>}
            </button>
          );
        })}
      </div>
      <span class="panel-tabs-spacer"></span>
      <button type="button" id="panel-close-btn" class="icon-glyph-base icon-glyph-button panel-close" aria-label="Close panel" title="Close" onClick={() => void panel.close()}>
        <span class="material-symbol-icon">close</span>
      </button>
    </div>
  );
}

/**
 * The handle between the player and the panel. Dragging it sets the panel's width within its limits; the width is
 * remembered once the drag ends. A click that doesn't drag leaves the remembered width, which can be wider than the
 * window allows.
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

  return (
    <div id="panel-handle" class={dragging ? "panel-handle is-dragging" : "panel-handle"} hidden ref={element} onPointerDown={onPointerDown}>
      <span class="handle-grip"></span>
    </div>
  );
}
