import type { RuntimeConfig } from "./types/runtimeConfig";
import { startApp } from "./app";

export function renderApp(container: HTMLElement, config: RuntimeConfig): void {
  container.innerHTML = `
    <header class="top-bar">
      <div class="top-bar-title">
        <h1>ReelRoulette</h1>
        <div id="pair-section" class="pair-section" style="display:none">
          <label>Pairing token: <input type="text" id="pair-token" placeholder="Enter token"></label>
          <button id="pair-btn">Pair</button>
        </div>
      </div>
      <select id="preset-select" aria-label="Choose preset">
        <option value="">Loading...</option>
      </select>
      <select id="randomization-mode-select" aria-label="Choose randomization mode">
        <option value="SmartShuffle">Smart Shuffle</option>
        <option value="PureRandom">Pure Random</option>
        <option value="WeightedRandom">Weighted Random</option>
        <option value="SpreadMode">Spread Mode</option>
        <option value="WeightedWithSpread">Weighted with Spread</option>
      </select>
      <div class="photo-duration-wrap">
        <label>Photo Duration: <input type="number" id="photo-duration" min="1" max="300" step="1" value="15" aria-label="Photo duration in seconds"><span class="unit">s</span></label>
      </div>
      <div id="now-playing" class="now-playing" style="display:none">
        <span id="now-playing-name"></span>
        <span id="now-playing-duration" class="muted"></span>
      </div>
    </header>
    <main>
      <div id="media-container" class="media-container">
        <video id="video" playsinline preload="auto" style="display:none"></video>
        <img id="photo" alt="Photo" style="display:none">
        <div id="empty-state" class="empty-state">Select a preset and click here</div>
        <div id="overlay-controls" class="overlay-controls">
          <button id="favorite-btn" class="overlay-btn icon-glyph-base icon-glyph-toggle overlay-toggle overlay-corner-btn" aria-label="Favorite" title="Favorite"><span class="material-symbol-icon">favorite</span></button>
          <button id="blacklist-btn" class="overlay-btn icon-glyph-base icon-glyph-toggle overlay-toggle overlay-corner-btn" aria-label="Blacklist" title="Blacklist"><span class="material-symbol-icon">thumb_down</span></button>
          <div class="overlay-controls-row">
            <button id="prev-btn" class="overlay-btn icon-glyph-base icon-glyph-button" aria-label="Previous" title="Previous"><span class="material-symbol-icon">skip_previous</span></button>
            <button id="play-btn" class="overlay-btn icon-glyph-base icon-glyph-button overlay-btn-play" aria-label="Play/Pause" title="Play/Pause"><span class="material-symbol-icon">play_arrow</span></button>
            <button id="next-btn" class="overlay-btn icon-glyph-base icon-glyph-button" aria-label="Next" title="Next"><span class="material-symbol-icon">skip_next</span></button>
            <button id="tag-edit-btn" class="overlay-btn icon-glyph-base icon-glyph-button" aria-label="Edit Tags" title="Edit Tags"><span class="material-symbol-icon">tag</span></button>
            <button id="loop-btn" class="overlay-btn icon-glyph-base icon-glyph-toggle overlay-toggle" aria-label="Loop" title="Loop"><span class="material-symbol-icon">repeat_one</span></button>
            <button id="autoplay-btn" class="overlay-btn icon-glyph-base icon-glyph-toggle overlay-toggle" aria-label="Autoplay" title="Autoplay"><span class="material-symbol-icon">autoplay</span></button>
            <button id="fullscreen-btn" class="overlay-btn icon-glyph-base icon-glyph-button" aria-label="Fullscreen" title="Fullscreen"><span class="material-symbol-icon">fullscreen</span></button>
          </div>
          <div id="seek-row" class="overlay-seek-row" style="display:none">
            <input type="range" id="seek-slider" min="0" max="100" value="0" aria-label="Seek">
            <span id="time-display">0:00 / 0:00</span>
          </div>
        </div>
      </div>
    </main>
    <div id="tag-editor" class="tag-editor" style="display:none">
      <div class="tag-editor-header">
        <h2>Tag Editor</h2>
        <div class="tag-editor-actions">
          <button id="tag-editor-refresh-btn" class="icon-glyph-base icon-glyph-button" title="Refresh" aria-label="Refresh"><span class="material-symbol-icon">refresh</span></button>
          <button id="tag-editor-close-btn" class="icon-glyph-base icon-glyph-button" title="Close" aria-label="Close"><span class="material-symbol-icon">close</span></button>
        </div>
      </div>
      <div id="tag-editor-body" class="tag-editor-body"></div>
      <div class="tag-editor-footer">
        <button id="tag-editor-add-category-btn" class="icon-glyph-base icon-glyph-button" title="Add category" aria-label="Add category"><span class="material-symbol-icon">add</span></button>
        <select id="tag-editor-category-select"></select>
        <input id="tag-editor-new-tag" type="text" placeholder="New tag name">
        <button id="tag-editor-add-tag-btn" class="icon-glyph-base icon-glyph-button" title="Add tag" aria-label="Add tag"><span class="material-symbol-icon">add</span></button>
        <button id="tag-editor-apply-btn" class="icon-glyph-base icon-glyph-button" title="Apply" aria-label="Apply"><span class="material-symbol-icon">save</span></button>
      </div>
      <div id="tag-edit-modal" class="tag-edit-modal" style="display:none">
        <div class="tag-edit-modal-card">
          <h3>Edit Tag</h3>
          <label for="tag-edit-name">Tag Name</label>
          <input id="tag-edit-name" type="text" autocomplete="off">
          <label for="tag-edit-category">Category</label>
          <select id="tag-edit-category"></select>
          <div class="tag-edit-modal-actions">
            <button id="tag-edit-cancel-btn" type="button">Cancel</button>
            <button id="tag-edit-save-btn" type="button">Save</button>
          </div>
        </div>
      </div>
    </div>
    <div id="status" class="status status-bottom"></div>
    <div id="mobile-diagnostics" class="status diagnostics-mobile" style="display:none"></div>
  `;
  startApp(config);
}

export function renderStartupError(container: HTMLElement, message: string): void {
  container.innerHTML = `
    <main>
      <h1>ReelRoulette WebUI</h1>
      <section class="card error">
        <h2>Runtime Configuration Error</h2>
        <p>${message}</p>
        <p>
          Provide \`window.__REEL_ROULETTE_RUNTIME_CONFIG\` before boot, or host a valid
          \`/runtime-config.json\`.
        </p>
      </section>
    </main>
  `;
}
