import { Fragment } from "preact";
import { useRef } from "preact/hooks";
import type { StatsFileView, StatsLibraryView } from "../stats/statsModel";
import { useApp } from "./appContext";
import { useMenuSurface } from "./Menu";
import { RatingStars } from "./RatingStars";
import { StatCards, StatCardsMessage } from "./StatCards";

/**
 * The panel's Stats tab, as the mockup lays it out: Show exact times in its header, orange while on, then the playing
 * file first, since the header's file name opens the tab, then the library's cards.
 */
export function StatsTab() {
  const { statsTab } = useApp();
  const view = statsTab.view.value;
  const exactTimes = statsTab.exactTimes.value;
  return (
    <div id="stats-tab" class="stats-tab">
      <div class="stats-tab-header">
        <h2>Stats</h2>
        <button
          id="stats-exact-times-btn"
          class={exactTimes ? "icon-btn active" : "icon-btn"}
          type="button"
          aria-label="Show exact times"
          title="Show exact times"
          onClick={() => statsTab.toggleExactTimes()}
        >
          <span class="material-symbol-icon" aria-hidden="true">calendar_clock</span>
        </button>
      </div>
      <div id="stats-body" class="stats-body themed-scrollbar">
        <section class="stats-section">
          <h3>Current file</h3>
          {view.file ? <FileStats file={view.file} /> : <p class="filter-hint">Nothing is playing yet.</p>}
        </section>
        <section class="stats-section">
          <h3>Library</h3>
          <LibraryStats library={view.library} />
        </section>
      </div>
    </div>
  );
}

/**
 * The file's name and full path, each with a menu that copies them or shows the file in the file manager, then once
 * they load its rating, its stats, and its tags in a row of their own, which a file without tags doesn't show, each
 * with a menu that filters by it.
 */
function FileStats({ file }: { file: StatsFileView }) {
  const { statsTab, playingMenus } = useApp();
  const name = useRef<HTMLParagraphElement>(null);
  const path = useRef<HTMLDivElement>(null);
  useMenuSurface(name, playingMenus.fileGroups, { open: playingMenus.show });
  useMenuSurface(path, playingMenus.fileGroups, { open: playingMenus.show });

  return (
    <>
      <p class="stats-file-name menu-surface" ref={name}>{file.name}</p>
      <div class="stats-path menu-surface" ref={path}>
        <code>{file.path}</code>
      </div>
      {file.rows ? (
        <>
          <div class="stats-rating">
            <span class="stats-rating-label">Rating</span>
            <RatingStars rating={file.rating} onSet={statsTab.setRating} />
          </div>
          <dl class="stats-table">
            {file.rows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
          {file.tags.length > 0 ? (
            <div class="stats-tags">
              {file.tags.map((tag) => (
                <StatsTag key={tag} name={tag} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** One of the file's tags, whose menu filters by it while the Filter tab's filter doesn't include it already. */
function StatsTag({ name }: { name: string }) {
  const { tagMenus } = useApp();
  const element = useRef<HTMLSpanElement>(null);
  useMenuSurface(element, () => tagMenus.statsTagGroups(name));
  return <span class="stats-tag menu-surface" ref={element}>{name}</span>;
}

/** The library's cards, or a message in their place, such as why they couldn't load. */
function LibraryStats({ library }: { library: StatsLibraryView }) {
  if (library.kind === "message") {
    return <StatCardsMessage text={library.text} />;
  }
  if (library.kind === "none") {
    return null;
  }
  return <StatCards cards={library.cards} />;
}
