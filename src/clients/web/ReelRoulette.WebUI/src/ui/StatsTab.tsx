import { Fragment } from "preact";
import type { StatsFileView, StatsLibraryView } from "../stats/statsModel";
import { useApp } from "./appContext";

/**
 * The panel's Stats tab, as the mockup lays it out: the playing file first, since the header's file name opens the tab,
 * then the library's cards.
 */
export function StatsTab() {
  const { statsTab } = useApp();
  const view = statsTab.view.value;
  return (
    <div id="stats-tab" class="stats-tab">
      <div class="stats-tab-header">
        <h2>Stats</h2>
      </div>
      <div id="stats-body" class="stats-body themed-scrollbar">
        <section class="stats-section" aria-labelledby="stats-file-heading">
          <h3 id="stats-file-heading">Current file</h3>
          {view.file ? <FileStats file={view.file} /> : <p class="filter-hint">Nothing is playing yet.</p>}
        </section>
        <section class="stats-section" aria-labelledby="stats-library-heading">
          <h3 id="stats-library-heading">Library</h3>
          <LibraryStats library={view.library} />
        </section>
      </div>
    </div>
  );
}

/** The file's name and full path, then its stats once they load. */
function FileStats({ file }: { file: StatsFileView }) {
  return (
    <>
      <p class="stats-file-name">{file.name}</p>
      <div class="stats-path">
        <code>{file.path}</code>
      </div>
      {file.rows ? (
        <dl class="stats-table">
          {file.rows.map((row) => (
            <Fragment key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </Fragment>
          ))}
          <dt>Tags</dt>
          <dd>
            {file.tags.length > 0 ? (
              <div class="stats-tags">
                {file.tags.map((tag) => (
                  <span key={tag} class="stats-tag">{tag}</span>
                ))}
              </div>
            ) : (
              "None"
            )}
          </dd>
        </dl>
      ) : null}
    </>
  );
}

/** The library's cards, or a message in their place, such as why they couldn't load. */
function LibraryStats({ library }: { library: StatsLibraryView }) {
  if (library.kind === "message") {
    return (
      <p class="filter-hint is-error" role="alert">
        {library.text}
      </p>
    );
  }
  if (library.kind === "none") {
    return null;
  }
  return (
    <div class="stats-grid">
      {library.cards.map((card) => (
        <div key={card.label} class="stat-card">
          <div class="value">{card.value}</div>
          <div class="label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
