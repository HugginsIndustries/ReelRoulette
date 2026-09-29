# API Baseline

This document is the practical API integration baseline for ReelRoulette clients and contributors.
It describes current behavior and endpoint surfaces without roadmap/milestone history.

## Source of Truth

- Canonical contract: `shared/api/openapi.yaml`
- If this document and OpenAPI disagree, OpenAPI is authoritative.
- Keep this file focused on integration semantics, not implementation history.

## Contract Principles

- Core/server owns authoritative domain logic and persisted state.
- Desktop and WebUI are API/SSE orchestration and rendering clients.
- Migrated flows must not reintroduce client-local mutation fallbacks.
- API + SSE semantics are shared across clients for behavior parity.

## Version and Capability Contract

`GET /api/version` provides compatibility and capability metadata:

- `appVersion`
- `apiVersion`
- `assetsVersion`
- `minimumCompatibleApiVersion`
- `supportedApiVersions[]`
- `capabilities[]`

Client expectations:

- Clients validate API compatibility before enabling API-required flows.
- Clients validate required capability flags at startup.
- Capability checks are used to gate behavior when server support is missing.

`GET /api/capabilities` exposes explicit runtime capabilities for feature detection.

## Auth and Pairing

Pairing endpoints:

- `GET /api/pair?token=...`
- `POST /api/pair` with `{ "token": "..." }`

Protected-route behavior:

- Unpaired requests return `401` when auth is required.
- Localhost trust can be enabled for local development workflows.
- LAN access requires valid pairing/session when auth is enabled.

Session/cookie behavior:

- Server issues generated session-id cookies (not raw pairing token values).
- Cookie policy is runtime-configurable (same-site, secure mode, session duration).
- Auth middleware validates session cookie first; optional legacy fallback paths can be enabled.

## CORS and Cookie Runtime Policy

Runtime controls include:

- `EnableCors`
- `CorsAllowedOrigins[]`
- `CorsAllowCredentials`
- Pairing cookie policy options

Recommended profiles:

- Localhost dev: allow local web origins; relaxed cookie policy appropriate for local HTTP.
- LAN/prod-style: HTTPS + explicit origins + credentials + secure cookie settings.

## Web Runtime Configuration (WebUI)

Web client bootstraps runtime config from:

1. `window.__REEL_ROULETTE_RUNTIME_CONFIG`
2. `/runtime-config.json`

Required keys:

- `apiBaseUrl` (absolute `http`/`https` API root)
- `sseUrl` (absolute `http`/`https` SSE URL, typically `/api/events`)

Optional keys:

- `pairToken` (dev/local bootstrap only)

Validation behavior:

- Missing required keys or non-http(s) URLs fail startup with explicit config errors.
- URL normalization handles trailing slashes.

## Eventing Contract (SSE)

`GET /api/events` uses a stable envelope shape:

- `revision`
- `eventType`
- `timestamp`
- `payload`

Reconnect/resync behavior:

- Client reconnects with `Last-Event-ID` (or `lastEventId` query fallback).
- Optional `clientId` / `sessionId` hints support continuity and self-event suppression.
- Server replays buffered events newer than last revision when available.
- If replay gap exceeds retention, server emits `resyncRequired`.
- WebUI reloads the loaded library list and does not post an item-state read with an empty path list. Desktop still requests favorite and blacklist for a specific path via `POST /api/library-states`.
- WebUI library overlay: `resyncRequired` reloads the loaded list-query window whether the overlay is shown or hidden. It does not post an empty item-state read. Favorite, blacklist, playback, and tag updates patch that window or reload it the same way.
- `playbackRecorded` includes `playCount`, `lastPlayedUtc`, and `previousLastPlayedUtc`. `previousLastPlayedUtc` is the last-played time from before this play, and is null when the file had never been played. Clients copy `playCount` and `lastPlayedUtc` onto a loaded tile when those fields are present. Desktop shows `previousLastPlayedUtc` on the current file.

## Error and Simulation Semantics

- Deterministic missing-media behavior returns:
  - `404 { "error": "Media not found" }` on `GET /api/media/{idOrToken}`.
- API/version/capability/disconnect simulation controls are exposed via control-plane testing endpoints.
- Simulation behavior is intended to exercise real client error-handling paths.

## Current Endpoint Surface

### Health and pairing

- `GET /health`
- `GET /api/pair`
- `POST /api/pair`

### Compatibility and capability

- `GET /api/version`
- `GET /api/capabilities`

### Library, playback, presets, sources

- `GET /api/presets`
- `POST /api/presets`
- `POST /api/presets/match`
- `POST /api/random`
- `POST /api/play/{itemId}`
- `GET /api/sources`
- `POST /api/sources/import`
- `POST /api/sources/{sourceId}/enabled`

**Source import:** `POST /api/sources/import` trims trailing directory separators on `rootPath` before persist/match (Windows drive roots such as `D:\` stay a volume root, not `D:`), defaults `displayName` to the last path segment when the request name is blank, and treats slash-variants of the same folder as one source. The import enumerates the folder before it takes the catalog lock, then inserts new items and updates existing ones in one transaction. It matches an existing item by path and keeps that item's id, tags, favorite, blacklist, and playback stats. It does not remove items that are missing on disk, and it does not load the full catalog document. `GET /api/sources` and `GET /api/library/stats` return that derived folder name when stored `displayName` is empty; they do not write the derived name into the catalog.

**Random playback filter payload:** `POST /api/random` accepts optional `presetId` (matches stored preset **name**) and optional inline `filterState` (JSON object). When both are supplied, the server resolves eligibility from **`filterState` first** (inline wins). Eligibility is the library list filter for enabled sources, plus the request's video and photo options, and does not load the full catalog document. An empty eligible set returns an empty object. A library with no items returns **503**. Clients send a full `filterState` on every random request. `presetId` is included only when the applied filter still equals that named preset. For `minDuration` / `maxDuration`, prefer string **`HH:MM:SS`** (or a numeric duration in seconds) so values align with server `TimeSpan` parsing; two-part `H:MM` strings are interpreted as hours and minutes, not minutes and seconds. `POST /api/presets` replaces the entire preset catalog (array of `{ name, filterState }`).

**Direct item play:** `POST /api/play/{itemId}` requests playback by persisted library **`id`** (the path segment is **not** `fullPath`). The server reads that item and whether its source is enabled, and does not load the rest of the catalog. Optional JSON body `{ "clientId"?, "sessionId"? }` matches identity propagation on other playback endpoints. Success returns the same JSON shape as `POST /api/random` (`RandomResponse`) and updates play count / last-played server-side with a `playbackRecorded` SSE event—do **not** call `POST /api/record-playback` for the same play start. Blacklist does **not** block this endpoint. Errors use `ErrorResponse` with optional machine-readable `code` (for example `play_item_not_found`, `play_media_missing`, `play_source_disabled`, `play_unsupported_media`, `play_item_id_invalid`) and HTTP statuses **`404`** (unknown id or missing file), **`409`** (disabled source), **`415`** (extension not in the server playable allowlist). Desktop library grid/list activation and WebUI library tile activation use this endpoint; other desktop replay entry points (favorites, recently played, timeline) may still use path-based play + `record-playback`.
- `POST /api/library/query` — browse path for filter, search, sort, and paging. Order is enabled sources, then a filename or relative-path substring search, then `filterState`, then sort. The body accepts `filterState` (omitted or null applies no filter predicates), `search`, `sortMode` (`Name`, `LastPlayed`, `PlayCount`, `Duration`, `DateAdded`; default `Name`), `sortDescending` (default false; direction applies only to the primary key), `offset` (default 0), and `limit` (default 100, maximum 500). Search is an invariant-lowercase substring and stays accent-sensitive. Name sort is accent-sensitive and ignores case. Null last-played, duration, and last-write sort as the minimum. Ties break by filename ascending, then item id ascending, including when the primary sort is descending. The response has `items`, `totalCount` (after search and filter), and `searchBaselineCount` (after search, before filter). Listed items include `hasThumbnail`, `thumbnailWidth`, and `thumbnailHeight` for that page only. Missing files stay in the result. Invalid sort, paging, or a non-object `filterState` returns **400** `{ error }`.
- `POST /api/library/item` — one catalog item by id or full path. The body matches a list-query item (tags, favorite, blacklist, play count, last played, duration, audio, and loudness) and does not add thumbnail fields. A blank id returns **400**. A missing item returns **404**. The read does not load the full catalog document.
- `GET /api/library/stats` — global totals and per-source totals from SQL aggregates, plus `baselineLoudnessLufs`. The figures match the previous full-catalog walk, including whole-second durations. The baseline is the 75th percentile of integrated loudness for videos that have audio, including items on disabled sources, and is −18 LUFS when none qualify. The read does not load the full catalog document.
- `POST /api/library-states` — favorite and blacklist for the requested paths only. Matching is case-insensitive. An empty path list, or a list of blank paths, returns no items and does not load the catalog. A path that is not in the library is omitted.
- `POST /api/favorite`, `POST /api/blacklist`, `POST /api/record-playback`, and `POST /api/playback/clear-stats` update SQLite catalog rows. They match an item by catalog id or full path and do not load the full catalog document. A favorite clears blacklist, and a blacklist clears favorite. `itemStateChanged` and `playbackRecorded` stay the same events. Clear-stats with no path list clears every row that has a play count or a last-played time. A path list clears only those items. `resyncRequired` with reason `playbackStatsCleared` is published only when at least one row was cleared.

### Web runtime settings

- `GET /api/web-runtime/settings`
- `POST /api/web-runtime/settings`
- Web runtime snapshot fields include `enabled`, `port`, `bindOnLan`, `mdnsEnabled` (defaults to `true`; when `false`, LAN binding and CORS still apply but the server does not advertise `{lanHostname}.local` on the network), `lanHostname`, `authMode`, and `sharedToken`.

### Tag editor

- Item/tag/category operations are API-driven.
- Batch-oriented contracts support multi-item updates.
- Compatibility sync endpoints remain available.
- Tag-editor model reads, item-tag add and remove, category and tag upsert, rename, and delete, and `POST /api/autotag/apply` update SQLite catalog rows. They match an item by catalog id or full path and do not load the full catalog document. A model read with no item ids returns categories and tags. Uncategorized is included in that response when the table has no such row, and that read does not write one. `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags` still load the full catalog document. Desktop and WebUI close the editor and show that same delta on the current file and loaded tiles while the request runs. A failed request restores tags an event has not already confirmed. The save's own exact `itemTagsChanged` event updates the tiles loaded now and does not apply that delta a second time. `POST /api/tag-editor/rename-tag` publishes `itemTagsChanged` for the files that had the tag when the visible name changes, with the new name added and the old name removed, `catalogReplacedTag` set to the old name, and `catalogReplacementTag` set to the new name, and still publishes `tagCatalogChanged`. A rename that keeps the same display name publishes only `tagCatalogChanged`. `POST /api/tag-editor/delete-tag` publishes `itemTagsChanged` for the files that had the tag, with that name removed and `catalogReplacedTag` set to it, and still publishes `tagCatalogChanged`. A per-item edit leaves both catalog fields unset. Desktop and WebUI replace or remove that name in the applied filter and saved presets before they patch or reload, including on the other client.

- `POST /api/tag-editor/model`
- `POST /api/tag-editor/apply-item-tags`
- `POST /api/tag-editor/upsert-category`
- `POST /api/tag-editor/upsert-tag`
- `POST /api/tag-editor/rename-tag`
- `POST /api/tag-editor/delete-tag`
- `POST /api/tag-editor/delete-category`
- `POST /api/tag-editor/sync-catalog`
- `POST /api/tag-editor/sync-item-tags`

### Refresh pipeline

- Refresh runs as a unified core-owned pipeline with ordered stages.
- `POST /api/refresh/start` rejects overlap (`409`).
- `GET /api/refresh/status` + SSE events provide projection state.
- Thumbnails are generated by the server pipeline and served via API paths.

- `POST /api/refresh/start`
- `GET /api/refresh/status`
- `GET /api/refresh/settings`
- `POST /api/refresh/settings`

### Duplicates and auto-tag

- Duplicate scan item payload includes per-item duplicate metadata (`itemId`, path/source identity, favorite/blacklist flags, play count) and `tagCount` for faster keep/delete review.
- `POST /api/duplicates/scan` reads catalog rows and does not load the full catalog document. Groups are items whose fingerprint status is ready and whose fingerprint is set. Pending, failed, and stale fingerprints stay excluded. Scope is the current source, all enabled sources, or every item.
- `POST /api/duplicates/apply` deletes the non-kept files and catalog rows and leaves the kept item. A missing file is reported and that row stays. The apply does not load the full catalog document.
- `POST /api/autotag/scan` — body `scanFullLibrary` and `itemIds` (library item `fullPath` values). The scan reads catalog rows and does not load the full catalog document. `scanFullLibrary: true` scans every item and ignores `itemIds`. `scanFullLibrary: false` with no `itemIds` scans enabled sources only (zero enabled sources scans nothing). A non-empty `itemIds` list scans those full paths.
- `POST /api/autotag/apply` returns `assignmentsAdded`, `changedItemPaths`, and `applied` (one entry per tag that was newly written, with only the files that gained that tag). When any file gains a tag, it publishes one `itemTagsChanged` event per tag that was newly applied, listing only the files that gained that tag, and one `tagCatalogChanged` event.

### Media, thumbnail, events, client logs

- `GET /api/media/{idOrToken}`
- `GET /api/thumbnail/{itemId}`
- `GET /api/events`
- `POST /api/logs/client`

### Control plane (operator/runtime)

- `GET /control/settings` / `POST /control/settings` — `ControlRuntimeSettingsSnapshot` includes `adminAuthMode`, optional `adminSharedToken`, and optional `devChannelEnabled` (defaults to `false` / stable update channel; when toggled, the server runs an immediate Velopack **check** against the persisted value and continues periodic **check-only** background polls on schedule).

- `GET /control/update/status` — current Velopack self-update phase (`notInstalled`, `idle`, `noReleases`, `checkFailed`, `upToDate`, `updateAvailable`, `downloading`, `updateReady`, `restarting`), running/target versions when relevant, and `velopackInstalled`.
- `POST /control/update/check` — query the configured feed; does not download or apply.
- `POST /control/update/download` — download the update from the last successful check; does not apply.
- `POST /control/update/apply` — apply a downloaded update and restart the server process (operator UI disconnects).

- `GET /control/status`
- `GET /control/settings`
- `POST /control/settings`
- `GET /control/startup`
- `POST /control/startup`
- `GET /control/pair`
- `POST /control/pair`
- `POST /control/restart`
- `POST /control/stop`
- `GET /control/logs/server`
- `GET /control/testing`
- `POST /control/testing/update`
- `POST /control/testing/reset`

## Maintenance Rules

Update this file when:

- endpoint surfaces change,
- request/response semantics change,
- compatibility/capability policy changes,
- runtime auth/CORS/config expectations change.

Keep this document concise and current-state only.
Do not add milestone references or implementation chronology.
