import { Component } from "preact";

/**
 * The tag editor, filter dialog, and library overlay markup that `app.js` still owns. It renders once and never
 * updates, so Preact never resets what `app.js` changes, such as a hidden overlay or the library's scroll position.
 */
export class LegacyOverlays extends Component {
  shouldComponentUpdate(): boolean {
    return false;
  }

  render() {
    return (
      <>
        <div id="tag-editor" class="tag-editor" style="display:none">
          <div class="tag-editor-header">
            <h2>Tag Editor</h2>
            <div class="tag-editor-actions">
              <button id="tag-editor-refresh-btn" class="icon-glyph-base icon-glyph-button" title="Refresh" aria-label="Refresh"><span class="material-symbol-icon">refresh</span></button>
              <button id="tag-editor-close-btn" class="icon-glyph-base icon-glyph-button" title="Close" aria-label="Close"><span class="material-symbol-icon">close</span></button>
            </div>
          </div>
          <div class="filter-dialog-tabstrip tag-editor-tabstrip" role="tablist">
            <button type="button" class="filter-tab is-active" role="tab" data-tag-editor-tab="edit" aria-selected="true">Edit Tags</button>
            <button type="button" class="filter-tab" role="tab" data-tag-editor-tab="autotag" aria-selected="false">Auto Tag</button>
          </div>
          <div class="tag-editor-panel-stack">
            <div id="tag-editor-panel-edit" class="tag-editor-panel">
              <div id="tag-editor-body" class="tag-editor-body themed-scrollbar"></div>
            </div>
            <div id="tag-editor-panel-autotag" class="tag-editor-panel" style="display:none">
              <div class="tag-editor-body tag-autotag-body themed-scrollbar">
                <div class="tag-autotag-toolbar">
                  <label class="tag-autotag-check-label"><input type="checkbox" id="tag-autotag-scan-full" /> Scan full library</label>
                  <label class="tag-autotag-check-label"><input type="checkbox" id="tag-autotag-view-all" /> View all matches</label>
                </div>
                <p class="tag-autotag-hint">Use Scan Files to find matching tags. File name matching ignores extension.</p>
                <div class="tag-autotag-actions-row">
                  <button type="button" id="tag-autotag-select-all" class="tag-autotag-row-btn">Select all</button>
                  <button type="button" id="tag-autotag-deselect-all" class="tag-autotag-row-btn">Deselect all</button>
                  <button type="button" id="tag-autotag-scan-btn" class="tag-autotag-scan-btn">Scan Files</button>
                </div>
                <div id="tag-autotag-progress" class="tag-autotag-progress" style="display:none" role="progressbar" aria-label="Scan in progress"></div>
                <div id="tag-autotag-status" class="tag-autotag-status" aria-live="polite"></div>
                <div id="tag-autotag-results" class="tag-autotag-results themed-scrollbar"></div>
              </div>
            </div>
          </div>
          <div class="tag-editor-footer">
            <button id="tag-editor-add-category-btn" class="icon-glyph-base icon-glyph-button" title="Add category" aria-label="Add category"><span class="material-symbol-icon">add</span></button>
            <select id="tag-editor-category-select"></select>
            <input id="tag-editor-new-tag" type="text" placeholder="New tag name" />
            <button id="tag-editor-add-tag-btn" class="icon-glyph-base icon-glyph-button" title="Add tag" aria-label="Add tag"><span class="material-symbol-icon">add</span></button>
            <button id="tag-editor-apply-btn" class="icon-glyph-base icon-glyph-button" title="Save" aria-label="Save"><span class="material-symbol-icon">save</span></button>
          </div>
          <div id="tag-edit-modal" class="tag-edit-modal" style="display:none">
            <div class="tag-edit-modal-card">
              <h3>Edit Tag</h3>
              <label for="tag-edit-name">Tag Name</label>
              <input id="tag-edit-name" type="text" autocomplete="off" />
              <label for="tag-edit-category">Category</label>
              <select id="tag-edit-category"></select>
              <div class="tag-edit-modal-actions">
                <button id="tag-edit-cancel-btn" type="button">Cancel</button>
                <button id="tag-edit-save-btn" type="button">Save</button>
              </div>
            </div>
          </div>
        </div>
        <div id="filter-dialog" class="filter-dialog" style="display:none">
          <div class="filter-dialog-header">
            <h2 id="filter-dialog-heading">Preset: None</h2>
            <div class="filter-dialog-actions">
              <button id="filter-dialog-refresh-btn" class="icon-glyph-base icon-glyph-button" type="button" title="Refresh" aria-label="Refresh"><span class="material-symbol-icon">refresh</span></button>
              <button id="filter-dialog-close-btn" class="icon-glyph-base icon-glyph-button" type="button" title="Close" aria-label="Close"><span class="material-symbol-icon">close</span></button>
            </div>
          </div>
          <div class="filter-dialog-tabstrip" role="tablist">
            <button type="button" class="filter-tab is-active" role="tab" data-filter-tab="general" aria-selected="true">General</button>
            <button type="button" class="filter-tab" role="tab" data-filter-tab="tags" aria-selected="false">Tags</button>
            <button type="button" class="filter-tab" role="tab" data-filter-tab="presets" aria-selected="false">Presets</button>
          </div>
          <div class="filter-dialog-body themed-scrollbar">
            <div id="filter-panel-general" class="filter-panel"></div>
            <div id="filter-panel-tags" class="filter-panel" style="display:none"></div>
            <div id="filter-panel-presets" class="filter-panel" style="display:none"></div>
          </div>
          <div class="filter-dialog-footer">
            <button id="filter-clear-all-btn" type="button">Clear all filters</button>
            <button id="filter-cancel-btn" type="button">Cancel</button>
            <button id="filter-apply-btn" type="button">Apply</button>
          </div>
        </div>
        <div id="library-overlay" class="library-overlay" style="display:none">
          <div class="library-overlay-header">
            <h2>Library</h2>
            <p id="library-overlay-summary" class="library-overlay-summary" aria-live="polite" hidden></p>
            <div class="library-overlay-actions">
              <button id="library-overlay-close-btn" class="icon-glyph-base icon-glyph-button" type="button" title="Close" aria-label="Close"><span class="material-symbol-icon">close</span></button>
            </div>
          </div>
          <div id="library-overlay-toolbar" class="library-overlay-toolbar" style="display:none">
            <input id="library-search-input" class="library-overlay-search" type="search" placeholder="Search…" aria-label="Search library" autocomplete="off" />
            <div class="library-overlay-sort-cluster">
              <select id="library-sort-select" class="library-overlay-sort-select" aria-label="Sort library">
                <option value="Name">Name</option>
                <option value="LastPlayed">Last played</option>
                <option value="PlayCount">Play count</option>
                <option value="Duration">Duration</option>
                <option value="DateAdded">Date added</option>
              </select>
              <button id="library-sort-direction-btn" class="library-overlay-sort-direction" type="button" aria-label="Toggle sort direction">A–Z</button>
            </div>
          </div>
          <div id="library-overlay-body" class="library-overlay-body"></div>
        </div>
      </>
    );
  }
}
