(function () {
  const API = window.location.origin;
  const CLIENT_ID_KEY = 'rr_clientId';
  const PHOTO_DURATION_KEY = 'rr_photoDuration';

  function getClientId() {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  }

  function fetchJSON(url, opts = {}) {
    return fetch(url, { credentials: 'include', ...opts }).then(r => {
      if (r.status === 401) throw new Error('Unauthorized');
      return r.json();
    });
  }

  const state = {
    presets: [],
    currentPresetId: '',
    current: null,
    history: [],
    historyIndex: -1,
    loop: false,
    autoplay: false,
    photoDurationSeconds: 15,
    clientId: getClientId()
  };
  let photoTimerId = null;
  let touchStartX = 0, touchStartY = 0, touchWasSwipe = false, touchHandledTap = false, ignoreSwipeTouch = false;
  const SWIPE_THRESHOLD = 50;
  const TAP_THRESHOLD = 10;
  const EVENTS_RETRY_MS = 1000;
  const SSE_STALE_MS = 30000;
  const SSE_WATCHDOG_MS = 5000;
  const RECONCILE_INTERVAL_MS = 5000;
  const ACK_HEARTBEAT_MS = 10000;
  const LIFECYCLE_RECONNECT_COOLDOWN_MS = 3000;

  const el = id => document.getElementById(id);
  const video = el('video');
  const photo = el('photo');
  const presetSelect = el('preset-select');
  const statusEl = el('status');
  const versionEl = el('version');
  const nowPlaying = el('now-playing');
  const nowPlayingName = el('now-playing-name');
  const nowPlayingDuration = el('now-playing-duration');
  const seekRow = el('seek-row');
  const seekSlider = el('seek-slider');
  const timeDisplay = el('time-display');
  const pairSection = el('pair-section');
  const pairToken = el('pair-token');
  const pairBtn = el('pair-btn');
  const fullscreenBtn = el('fullscreen-btn');
  const mediaContainer = el('media-container');
  const overlayControls = el('overlay-controls');
  const prevBtn = el('prev-btn');
  const playBtn = el('play-btn');
  const nextBtn = el('next-btn');
  const favoriteBtn = el('favorite-btn');
  const blacklistBtn = el('blacklist-btn');
  const loopBtn = el('loop-btn');
  const autoplayBtn = el('autoplay-btn');
  mediaContainer.classList.add('controls-visible');

  function setStatus(msg) { statusEl.textContent = msg; }
  function postSyncLog(level, message, extra) {
    var payload = Object.assign({ clientId: state.clientId, level: level, message: message }, extra || {});
    fetch(API + '/api/events/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    }).catch(function (err) {
      console.debug('sync log post failed', err);
    });
  }
  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function normalizePath(p) {
    return (p || '').replace(/\//g, '\\').toLowerCase();
  }

  function basenameFromPath(p) {
    if (!p) return 'Unknown media';
    var normalized = String(p).replace(/\//g, '\\');
    var idx = normalized.lastIndexOf('\\');
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
  }

  function truncateName(name, maxChars) {
    var text = String(name || '');
    var max = Number(maxChars || 45);
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 3)) + '...';
  }

  var itemStateByPath = new Map();
  function cacheItemState(itemId, isFavorite, isBlacklisted, revision) {
    var key = normalizePath(itemId);
    if (!key) return;
    var prev = itemStateByPath.get(key);
    var nextRevision = Number(revision || 0);
    var prevRevision = Number(prev?.revision || 0);
    if (prev && nextRevision > 0 && prevRevision > nextRevision) return;
    itemStateByPath.set(key, { isFavorite: !!isFavorite, isBlacklisted: !!isBlacklisted, revision: nextRevision });
  }

  function applyCachedState(item) {
    if (!item || !item.id) return false;
    var cached = itemStateByPath.get(normalizePath(item.id));
    if (!cached) return false;
    item.isFavorite = !!cached.isFavorite;
    item.isBlacklisted = !!cached.isBlacklisted;
    return true;
  }

  function collectKnownPaths() {
    var paths = [];
    if (state.current?.id) paths.push(state.current.id);
    for (var i = 0; i < state.history.length; i++) {
      var h = state.history[i];
      if (h?.id) paths.push(h.id);
    }
    for (const key of itemStateByPath.keys()) paths.push(key);
    var seen = new Set();
    var unique = [];
    for (var j = 0; j < paths.length; j++) {
      var p = paths[j];
      var norm = normalizePath(p);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      unique.push(p);
    }
    return unique;
  }

  var reconcileInFlight = false;
  function reconcileKnownStates(reason) {
    if (reconcileInFlight) return;
    var paths = collectKnownPaths();
    if (paths.length === 0) return;
    reconcileInFlight = true;
    postSyncLog('info', 'Reconcile start (' + reason + ') paths=' + paths.length);
    fetch(API + '/api/library-states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paths: paths })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('reconcile:' + r.status);
        return r.json();
      })
      .then(function (rows) {
        var list = Array.isArray(rows) ? rows : [];
        for (var i = 0; i < list.length; i++) {
          var row = list[i];
          if (!row?.itemId) continue;
          cacheItemState(row.itemId, row.isFavorite, row.isBlacklisted, row.revision);
          var targetKey = normalizePath(row.itemId);
          for (var j = 0; j < state.history.length; j++) {
            var h = state.history[j];
            if (h && normalizePath(h.id) === targetKey) {
              h.isFavorite = !!row.isFavorite;
              h.isBlacklisted = !!row.isBlacklisted;
            }
          }
          if (state.current && normalizePath(state.current.id) === targetKey) {
            state.current.isFavorite = !!row.isFavorite;
            state.current.isBlacklisted = !!row.isBlacklisted;
          }
        }
        updateToggleButtons();
        postSyncLog('info', 'Reconcile applied (' + reason + ') states=' + list.length);
      })
      .catch(function (err) {
        console.warn('reconcile failed', err);
        postSyncLog('error', 'Reconcile failed (' + reason + '): ' + (err?.message || err));
      })
      .finally(function () {
        reconcileInFlight = false;
      });
  }

  function toggleOverlayControls() {
    if (!state.current) return;
    mediaContainer.classList.toggle('controls-visible');
  }

  function loadPresets() {
    return fetchJSON(API + '/api/presets')
      .then(presets => {
        state.presets = presets || [];
        presetSelect.innerHTML = '<option value="">Choose preset</option>';
        state.presets.forEach(p => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name || p.id;
          presetSelect.appendChild(o);
        });
      })
      .catch(e => {
        presetSelect.innerHTML = '<option value="">Error loading presets</option>';
        setStatus('Error: ' + (e.message || 'Failed to load'));
        if (e.message === 'Unauthorized') pairSection.style.display = 'block';
      });
  }

  function loadVersion() {
    if (!versionEl) return;
    fetchJSON(API + '/api/version')
      .then(v => { versionEl.textContent = 'ReelRoulette v' + (v.appVersion || '?') + ' / API v' + (v.apiVersion || '1'); })
      .catch(() => { versionEl.textContent = 'Offline'; });
  }

  function getRandom() {
    const presetId = presetSelect.value;
    if (!presetId) { setStatus('Select a preset'); return; }
    setStatus('Loading...');
    fetch(API + '/api/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        presetId,
        clientId: state.clientId,
        includeVideos: true,
        includePhotos: true
      })
    })
      .then(r => {
        if (r.status === 401) throw new Error('Unauthorized');
        return r.json();
      })
      .then(data => {
        if (data && data.mediaUrl) {
          state.current = data;
          applyCachedState(state.current);
          state.history = state.history.slice(0, state.historyIndex + 1);
          state.history.push(data);
          state.historyIndex = state.history.length - 1;
          playCurrent();
          setStatus('Playing');
        } else {
          setStatus('No media found');
        }
      })
      .catch(e => {
        setStatus('Error: ' + (e.message || 'Request failed'));
        if (e.message === 'Unauthorized') pairSection.style.display = 'block';
      });
  }

  function clearPhotoTimer() {
    if (photoTimerId) { clearTimeout(photoTimerId); photoTimerId = null; }
  }

  function goPrevious() {
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    state.current = state.history[state.historyIndex];
    playCurrent();
  }

  function goNext() {
    if (state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      state.current = state.history[state.historyIndex];
      playCurrent();
    } else {
      getRandom();
    }
  }

  function updateToggleButtons() {
    if (loopBtn) loopBtn.classList.toggle('active', state.loop);
    if (autoplayBtn) autoplayBtn.classList.toggle('active', state.autoplay);
    if (favoriteBtn) favoriteBtn.classList.toggle('active', state.current?.isFavorite === true);
    if (blacklistBtn) blacklistBtn.classList.toggle('active', state.current?.isBlacklisted === true);
  }

  function playCurrent() {
    const c = state.current;
    if (!c) return;
    applyCachedState(c);
    video.pause();
    video.src = '';
    video.load();
    clearPhotoTimer();
    video.style.display = 'none';
    photo.style.display = 'none';
    el('empty-state').style.display = 'none';
    nowPlaying.style.display = 'block';
    var fullName = c.displayName || '';
    nowPlayingName.textContent = truncateName(fullName, 45);
    nowPlayingName.title = fullName;
    nowPlayingDuration.textContent = c.durationSeconds != null ? fmtTime(c.durationSeconds) : '';

    if (c.mediaType === 'photo') {
      photo.src = c.mediaUrl;
      photo.style.display = 'block';
      seekRow.style.display = 'none';
      var sec = Math.max(1, Math.min(300, state.photoDurationSeconds));
      if (state.loop) {
        var currentId = c.id;
        photoTimerId = setTimeout(function () {
          // Loop takes priority for photos (desktop parity): replay same photo.
          if (state.current && state.current.id === currentId) {
            playCurrent();
          }
        }, sec * 1000);
      } else if (state.autoplay) {
        photoTimerId = setTimeout(function () {
          if (state.historyIndex < state.history.length - 1) goNext();
          else getRandom();
        }, sec * 1000);
      }
    } else {
      video.src = c.mediaUrl;
      video.style.display = 'block';
      seekRow.style.display = 'flex';
      setupVideoEvents();
    }
    updateToggleButtons();
  }

  function toggleFullscreen() {
    if (!state.current) return;
    var doc = document;
    var fs = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!fs) {
      var req = mediaContainer.requestFullscreen || mediaContainer.webkitRequestFullscreen;
      if (req) req.call(mediaContainer);
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) exit.call(doc);
    }
  }

  function setupVideoEvents() {
    video.volume = 1;
    video.loop = state.loop;
    video.onended = () => {
      if (state.autoplay && !state.loop) {
        if (state.historyIndex < state.history.length - 1) goNext();
        else getRandom();
      }
    };
    video.onloadedmetadata = () => {
      seekSlider.max = Math.floor(video.duration) || 100;
      updateTimeDisplay();
    };
    video.ontimeupdate = updateTimeDisplay;
    video.oncanplay = function tryPlay() {
      video.oncanplay = null;
      video.play().catch(function () {});
    };
  }

  function updateTimeDisplay() {
    if (!video.duration) return;
    timeDisplay.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
    seekSlider.value = Math.floor(video.currentTime);
  }

  function onControlAction(e) {
    if (e) e.stopPropagation();
  }

  mediaContainer.addEventListener('click', function (e) {
    if (touchWasSwipe) { touchWasSwipe = false; return; }
    if (touchHandledTap) { touchHandledTap = false; return; }
    if (state.current) {
      toggleOverlayControls();
    } else if (presetSelect.value) {
      getRandom();
    }
  });
  if (overlayControls) {
    overlayControls.addEventListener('touchstart', function (e) { e.stopPropagation(); });
    overlayControls.addEventListener('touchmove', function (e) { e.stopPropagation(); });
    overlayControls.addEventListener('touchend', function (e) { e.stopPropagation(); });
    overlayControls.addEventListener('click', function (e) { e.stopPropagation(); });
  }
  mediaContainer.addEventListener('touchstart', function (e) {
    if (e.target && e.target.closest && e.target.closest('#overlay-controls')) {
      ignoreSwipeTouch = true;
      return;
    }
    ignoreSwipeTouch = false;
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchWasSwipe = false;
    }
  }, { passive: true });
  mediaContainer.addEventListener('touchend', function (e) {
    if (ignoreSwipeTouch) {
      ignoreSwipeTouch = false;
      return;
    }
    if (!e.changedTouches || !e.changedTouches[0]) return;
    var tx = e.changedTouches[0].clientX;
    var ty = e.changedTouches[0].clientY;
    var dx = tx - touchStartX;
    var dy = ty - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      touchWasSwipe = true;
      if (dx > 0) goPrevious();
      else goNext();
    } else if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
      if (state.current) {
        touchHandledTap = true;
        toggleOverlayControls();
      }
    }
  }, { passive: true });

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', e => { onControlAction(e); toggleFullscreen(); });
  nextBtn.addEventListener('click', e => { onControlAction(e); goNext(); });
  prevBtn.addEventListener('click', e => { onControlAction(e); goPrevious(); });
  if (favoriteBtn) favoriteBtn.addEventListener('click', e => {
    onControlAction(e);
    if (!state.current?.id) return;
    var next = !state.current.isFavorite;
    fetch(API + '/api/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: state.current.id, isFavorite: next })
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401) pairSection.style.display = 'block';
        setStatus('Favorite update failed (' + r.status + ')');
        return;
      }
      state.current.isFavorite = next;
      if (next) state.current.isBlacklisted = false;
      // Local optimistic update should not outrank authoritative server SSE revisions.
      cacheItemState(state.current.id, state.current.isFavorite, state.current.isBlacklisted, 0);
      updateToggleButtons();
      setStatus(next ? 'Added to favorites' : 'Removed from favorites');
    });
  });
  if (blacklistBtn) blacklistBtn.addEventListener('click', e => {
    onControlAction(e);
    if (!state.current?.id) return;
    var next = !state.current.isBlacklisted;
    fetch(API + '/api/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: state.current.id, isBlacklisted: next })
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401) pairSection.style.display = 'block';
        setStatus('Blacklist update failed (' + r.status + ')');
        return;
      }
      state.current.isBlacklisted = next;
      if (next) state.current.isFavorite = false;
      // Local optimistic update should not outrank authoritative server SSE revisions.
      cacheItemState(state.current.id, state.current.isFavorite, state.current.isBlacklisted, 0);
      updateToggleButtons();
      setStatus(next ? 'Blacklisted' : 'Removed from blacklist');
    });
  });
  playBtn.addEventListener('click', e => {
    onControlAction(e);
    if (!state.current) { getRandom(); return; }
    if (video.style.display !== 'none') {
      video.paused ? video.play() : video.pause();
    }
  });
  seekSlider.addEventListener('input', () => {
    if (video.duration) video.currentTime = +seekSlider.value;
  });
  loopBtn.addEventListener('click', e => {
    onControlAction(e);
    state.loop = !state.loop;
    if (video.src) video.loop = state.loop;
    if (state.current && state.current.mediaType === 'photo') {
      if (state.loop || state.autoplay) playCurrent();
      else clearPhotoTimer();
    }
    updateToggleButtons();
  });
  autoplayBtn.addEventListener('click', e => {
    onControlAction(e);
    state.autoplay = !state.autoplay;
    if (state.current && state.current.mediaType === 'photo') {
      if (state.loop || state.autoplay) playCurrent();
      else clearPhotoTimer();
    } else if (!state.autoplay) {
      clearPhotoTimer();
    }
    updateToggleButtons();
  });

  var photoDurationInput = el('photo-duration');
  if (photoDurationInput) {
    var saved = localStorage.getItem(PHOTO_DURATION_KEY);
    if (saved != null) {
      var n = parseInt(saved, 10);
      if (!isNaN(n) && n >= 1 && n <= 300) { state.photoDurationSeconds = n; photoDurationInput.value = n; }
    } else { photoDurationInput.value = state.photoDurationSeconds; }
    photoDurationInput.addEventListener('change', function () {
      var n = parseInt(photoDurationInput.value, 10);
      if (!isNaN(n) && n >= 1 && n <= 300) {
        state.photoDurationSeconds = n;
        localStorage.setItem(PHOTO_DURATION_KEY, String(n));
        if (state.current && state.current.mediaType === 'photo' && (state.autoplay || state.loop)) playCurrent();
      }
    });
  }
  presetSelect.addEventListener('change', () => { state.currentPresetId = presetSelect.value; });

  var evtSource = null;
  var evtReconnectTimer = null;
  var sseWatchdogTimer = null;
  var reconcileTimer = null;
  var ackHeartbeatTimer = null;
  var lastSseAt = 0;
  var lastLifecycleReconnectAt = 0;
  var lastAckRevision = 0;
  function sendAck(revision, force) {
    var rev = Number(revision || 0);
    if (!force && (!rev || rev <= lastAckRevision)) return;
    lastAckRevision = rev;
    fetch(API + '/api/events/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: state.clientId, revision: rev })
    }).catch(function (err) {
      console.debug('ack post failed', err);
    });
  }
  function markSseActivity() {
    lastSseAt = Date.now();
  }
  function ensurePeriodicReconcile() {
    if (reconcileTimer) return;
    reconcileTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      reconcileKnownStates('interval');
    }, RECONCILE_INTERVAL_MS);
  }
  function ensureAckHeartbeat() {
    if (ackHeartbeatTimer) return;
    ackHeartbeatTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      sendAck(lastAckRevision, true);
    }, ACK_HEARTBEAT_MS);
  }
  function ensureSseWatchdog() {
    if (sseWatchdogTimer) return;
    sseWatchdogTimer = setInterval(function () {
      if (!lastSseAt) return;
      if (Date.now() - lastSseAt > SSE_STALE_MS) {
        postSyncLog('warn', 'SSE watchdog stale detected, reconnecting');
        scheduleEventsReconnect();
      }
    }, SSE_WATCHDOG_MS);
  }
  function clearEventsReconnectTimer() {
    if (evtReconnectTimer) {
      clearTimeout(evtReconnectTimer);
      evtReconnectTimer = null;
    }
  }
  function scheduleEventsReconnect() {
    if (evtReconnectTimer) return;
    postSyncLog('info', 'SSE reconnect scheduled');
    evtReconnectTimer = setTimeout(function () {
      evtReconnectTimer = null;
      connectEvents();
    }, EVENTS_RETRY_MS);
  }
  function connectEvents() {
    clearEventsReconnectTimer();
    ensureSseWatchdog();
    ensurePeriodicReconcile();
    ensureAckHeartbeat();
    if (evtSource) {
      try { evtSource.close(); } catch (err) { console.warn('eventsource close failed', err); }
      evtSource = null;
    }
    var eventsUrl = API + '/api/events?clientId=' + encodeURIComponent(state.clientId);
    postSyncLog('info', 'SSE connect', { itemId: eventsUrl });
    evtSource = new EventSource(eventsUrl, { withCredentials: true });
    evtSource.onopen = function () {
      markSseActivity();
      postSyncLog('info', 'SSE open');
      reconcileKnownStates('open');
    };
    evtSource.onmessage = function (e) {
      try {
        markSseActivity();
        var data = JSON.parse(e.data);
        if (!data.itemId) return;
        cacheItemState(data.itemId, data.isFavorite, data.isBlacklisted, data.revision);
        var targetKey = normalizePath(data.itemId);
        for (var i = 0; i < state.history.length; i++) {
          var h = state.history[i];
          if (h && normalizePath(h.id) === targetKey) {
            h.isFavorite = !!data.isFavorite;
            h.isBlacklisted = !!data.isBlacklisted;
          }
        }
        var fileName = basenameFromPath(data.itemId);
        if (!!data.isBlacklisted) setStatus('Synced: Blacklisted: ' + fileName);
        else setStatus(!!data.isFavorite ? 'Synced: Added to favorites: ' + fileName : 'Synced: Removed from favorites: ' + fileName);
        if (state.current && normalizePath(state.current.id) === targetKey) {
          state.current.isFavorite = !!data.isFavorite;
          state.current.isBlacklisted = !!data.isBlacklisted;
          updateToggleButtons();
        }
        sendAck(data.revision);
      } catch (err) {
        console.warn('SSE message processing failed', err);
        postSyncLog('error', 'SSE message processing failed: ' + (err?.message || err), { revision: -1 });
      }
    };
    evtSource.addEventListener('ping', function () {
      markSseActivity();
    });
    evtSource.onerror = function () {
      postSyncLog('warn', 'SSE error');
      scheduleEventsReconnect();
    };
  }

  function reconnectForLifecycle(reason) {
    var now = Date.now();
    if (now - lastLifecycleReconnectAt < LIFECYCLE_RECONNECT_COOLDOWN_MS) return;
    lastLifecycleReconnectAt = now;
    postSyncLog('info', 'Lifecycle reconnect: ' + reason);
    connectEvents();
    reconcileKnownStates('lifecycle:' + reason);
  }

  pairBtn.addEventListener('click', () => {
    const token = pairToken.value.trim();
    if (!token) return;
    fetch(API + '/api/pair?token=' + encodeURIComponent(token), { credentials: 'include' })
      .then(r => {
        if (r.ok) { setStatus('Paired'); pairSection.style.display = 'none'; loadPresets(); connectEvents(); reconcileKnownStates('paired'); }
        else setStatus('Pairing failed');
      });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible')
      reconnectForLifecycle('visibility');
  });
  window.addEventListener('focus', function () { reconnectForLifecycle('focus'); });
  window.addEventListener('pageshow', function () { reconnectForLifecycle('pageshow'); });
  window.addEventListener('online', function () { reconnectForLifecycle('online'); });

  loadPresets().then(() => setStatus('Ready'));
  loadVersion();
  updateToggleButtons();
  connectEvents();
})();
