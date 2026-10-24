import { useRef } from "preact/hooks";
import { autoTagFileChecked, type AutoTagResults, type AutoTagRowView } from "../tags/autoTagModel";
import type { TagEditorView } from "../tags/tagEditor";
import { useApp } from "./appContext";
import { Dialog } from "./Dialog";

function Icon({ name }: { name: string }) {
  return <span class="material-symbol-icon">{name}</span>;
}

/**
 * Auto Tag, over the whole page while it shows. It is rendered in the stage, beside the in-app dialogs, so it covers
 * the player and the panel, in fullscreen too.
 */
export function AutoTag() {
  const { tagEditor } = useApp();
  return tagEditor.autoTagOpen.value ? <AutoTagDialog view={tagEditor.view.value} /> : null;
}

/**
 * Auto Tag's in-app dialog. Escape, or the browser closing it, does what the X does, which waits while a scan runs. It
 * has no outside to click. Focus starts on the X.
 */
function AutoTagDialog({ view }: { view: TagEditorView | null }) {
  const { tagEditor } = useApp();
  const close = useRef<HTMLButtonElement>(null);
  const autoTag = view?.autoTag;
  const scanning = autoTag?.scanning ?? false;
  return (
    <Dialog
      id="autotag"
      class="autotag-overlay"
      labelledBy="autotag-title"
      onCancel={() => tagEditor.closeAutoTag()}
      initialFocus={close}
      backdropCancels={false}
      stayOpen={() => tagEditor.autoTagOpen.peek()}
    >
      <div class="autotag-head">
        <h2 id="autotag-title">Auto Tag</h2>
        <button ref={close} class="icon-btn" type="button" id="autotag-close" aria-label="Close" title="Close" disabled={scanning} onClick={() => tagEditor.closeAutoTag()}><Icon name="close" /></button>
      </div>
      <div class="autotag-row">
        <label><input type="checkbox" id="autotag-full" checked={autoTag?.scanFull ?? false} onChange={(event) => tagEditor.setScanFullLibrary(event.currentTarget.checked)} /> Scan full library</label>
        <label><input type="checkbox" id="autotag-all" checked={autoTag?.viewAll ?? false} onChange={(event) => tagEditor.setViewAll(event.currentTarget.checked)} /> View all matches</label>
      </div>
      <p class="filter-hint autotag-hint">Use Scan Files to find matching tags. File name matching ignores extension.</p>
      <div class="autotag-row">
        <button class="btn" type="button" id="autotag-select-all" onClick={() => tagEditor.selectAll()}>Select all</button>
        <button class="btn" type="button" id="autotag-deselect-all" onClick={() => tagEditor.deselectAll()}>Deselect all</button>
        <button class="btn autotag-scan" type="button" id="autotag-scan" disabled={scanning} onClick={() => void tagEditor.scan()}>Scan Files</button>
      </div>
      <div class="autotag-progress" id="autotag-progress" hidden={!scanning}></div>
      <div class="autotag-status" id="autotag-status">{autoTag?.status ?? ""}</div>
      <div class="autotag-results themed-scrollbar" id="autotag-results">
        {view ? <Results results={view.results} /> : null}
      </div>
      <div class="autotag-footer">
        <button class="btn" type="button" id="autotag-cancel" disabled={scanning} onClick={() => tagEditor.cancelAutoTag()}>Cancel</button>
        <button class="btn" type="button" id="autotag-apply" disabled={!view?.autoTagApplyPending} onClick={() => tagEditor.applyAutoTag()}>Apply</button>
      </div>
    </Dialog>
  );
}

/** The header and every row share one column template, so each count sits under its own header. */
function Results({ results }: { results: AutoTagResults }) {
  if (results.kind === "placeholder") {
    return <p class="autotag-empty">{results.text}</p>;
  }
  if (results.kind === "hint") {
    return <p class="filter-hint">{results.text}</p>;
  }
  return (
    <>
      <div class="autotag-table-head"><span></span><span>Apply</span><span>Tag / File</span><span class="autotag-count">Total matched</span><span class="autotag-count">To be changed</span></div>
      {results.rows.map((entry) => (
        <ResultRow key={entry.row.rowId} entry={entry} />
      ))}
    </>
  );
}

function ResultRow({ entry }: { entry: AutoTagRowView }) {
  const { tagEditor } = useApp();
  const { row } = entry;
  return (
    <div class="autotag-result">
      <div class="autotag-row-main">
        <button type="button" class="icon-btn" aria-label={row.expanded ? "Collapse" : "Expand"} onClick={() => tagEditor.toggleRowExpanded(row.rowId)}><Icon name={row.expanded ? "expand_more" : "chevron_right"} /></button>
        <input type="checkbox" aria-label={`Apply ${row.tagName}`} checked={entry.checked} indeterminate={entry.indeterminate} disabled={entry.disabled} onChange={(event) => tagEditor.checkRow(row.rowId, event.currentTarget.checked)} />
        <span class="autotag-tag">{row.tagName || ""}</span>
        <span class="autotag-count">{row.totalMatchedCount}</span>
        <span class="autotag-count">{row.wouldChangeCount}</span>
      </div>
      {row.expanded ? (
        <div class="autotag-files">
          {entry.files.map((file) => (
            <label key={file.itemId} class="autotag-file">
              <input type="checkbox" checked={autoTagFileChecked(file)} disabled={!file.needsChange} title={file.needsChange ? undefined : "Already has this tag"} onChange={(event) => tagEditor.checkFile(row.rowId, file.itemId, event.currentTarget.checked)} />
              <span title={file.fullPath || ""}>{file.displayPath || file.fullPath || ""}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
