import { Fragment } from "preact";
import type { StatsFileView, StatsLibraryView } from "../stats/statsModel";
import { useApp } from "./appContext";
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
 * The file's name and full path, with Show in File Manager where the server offers it and Copy Path everywhere else,
 * as an icon button named by its tooltip, then once they load its rating, its stats, and its tags in a row of their
 * own, which a file without tags doesn't show.
 */
function FileStats({ file }: { file: StatsFileView }) {
  const { statsTab } = useApp();
  return (
    <>
      <p class="stats-file-name">{file.name}</p>
      <div class="stats-path">
        <code>{file.path}</code>
        {file.canShowInFileManager ? (
          <button type="button" class="icon-btn" aria-label="Show in File Manager" title="Show in File Manager" onClick={() => void statsTab.showInFileManager()}>
            <span class="material-symbol-icon" aria-hidden="true">folder_open</span>
          </button>
        ) : (
          <button type="button" class="icon-btn" aria-label="Copy Path" title="Copy Path" onClick={(event) => void statsTab.copyPath(event.currentTarget)}>
            <span class="material-symbol-icon" aria-hidden="true">content_copy</span>
          </button>
        )}
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
                <span key={tag} class="stats-tag">{tag}</span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
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
