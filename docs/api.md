# API Baseline

This document is the practical API integration baseline for ReelRoulette clients and contributors.
It describes current behavior and endpoint surfaces without roadmap/milestone history.

## Source of Truth

- Canonical contract: `shared/api/openapi.yaml`
- If this document and OpenAPI disagree, OpenAPI is authoritative.
- OpenAPI lists every `/api/*` and `/control/*` route the server maps, plus `/health`. Only the WebUI shell (`/`), `/runtime-config.json`, and the Operator page (`/operator`) are left out. A test compares the spec's paths with the server's route mappings.
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

- Pairing covers `/api` routes only. Unpaired `/api` requests return `401` when auth is required. The WebUI's files, `/runtime-config.json`, `/operator`, and `/health` load without a session.
- Localhost trust can be enabled for local development workflows. Localhost means a direct connection from the server machine: from loopback, or to the server's own LAN address from that address. A request through a reverse proxy is not localhost, even when the proxy runs on the server machine, and neither is a request with no remote address.
- Requests from other devices require valid pairing/session when auth is enabled.

Remote connections:

- With **Allow remote connections** (`bindOnLan`) off, every request from another device returns `403` on every path, directly or through a proxy. API and control routes answer with an `ErrorResponse`, other paths with plain text.

Reverse proxies:

- Forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`) are applied only from loopback, one hop. From such a proxy, the request takes the client's address, scheme, and host, so cookies and `/runtime-config.json` follow the proxy's HTTPS address. Forwarded headers from any other address are ignored, and the first such request from each address writes a warning to `last.log`.
- Any forwarding header, including `Forwarded` and `X-Real-IP`, makes a request non-local, whether or not it was applied.
- `GET /api/events` sends `X-Accel-Buffering: no` so nginx does not buffer events.

Session/cookie behavior:

- Server issues generated session-id cookies (not raw pairing token values).
- Cookie policy is runtime-configurable (same-site, secure mode, session duration). In the default `Request` secure mode, a cookie is `Secure` when the client used HTTPS, including through a proxy. A cookie that would be `SameSite=None` without `Secure` is sent as `Lax`, since browsers reject it.
- Auth middleware validates session cookie first; optional legacy fallback paths can be enabled.

Control-plane auth (`/control/*`):

- Localhost requests are trusted on every control route, including the testing routes. A request to the server's own LAN address from the server machine counts as localhost. A request through a reverse proxy does not, even when the proxy runs on the server machine.
- A non-localhost request returns `403` while remote connections are off. Otherwise it needs a control session cookie (`rr_admin`) from `POST /control/pair`, or the control token as a `Bearer` header when legacy token auth is allowed, and returns `401` without one. A `token` query parameter is never accepted on control routes, so the control token stays out of URLs and request logs. There is no setting that turns this off.
- The server generates a control token on start when none is set and saves it as `controlRuntime.adminSharedToken` in `core-settings.json` in the server data folder. The Operator shows it under Control Settings.
- `POST /control/pair` with the token in its JSON body returns `200` and sets the admin cookie; there is no `GET` form. A wrong or missing token returns `401` and logs a warning with the remote address to `last.log`, never the token.
- Changing the token through `POST /control/settings` ends every control session. A non-localhost caller gets a fresh admin cookie in the same response, so the rest of its save goes through.
- A control session also authorizes `/api` requests.

## CORS and Cookie Runtime Policy

Runtime controls include:

- `EnableCors`
- `CorsAllowedOrigins[]`
- `CorsAllowCredentials`
- Pairing cookie policy options

Recommended profiles:

- Localhost dev: allow local web origins; relaxed cookie policy appropriate for local HTTP.
- LAN/prod-style: HTTPS + explicit origins + credentials + secure cookie settings.
- Configured origins can use `http` or `https`; an origin with its scheme's default port matches one without it. The server's own localhost and LAN origins use the scheme it listens on. The WebUI served through a proxy is same-origin and needs no CORS entry.

## Web Runtime Configuration (WebUI)

Web client bootstraps runtime config from:

1. `window.__REEL_ROULETTE_RUNTIME_CONFIG`
2. `/runtime-config.json`

Required keys:

- `apiBaseUrl` (absolute `http`/`https` API root)
- `sseUrl` (absolute `http`/`https` SSE URL, typically `/api/events`)

Optional keys:

- `pairToken` (dev/local bootstrap only)

Served by the server, `/runtime-config.json` loads for every caller. `apiBaseUrl` and `sseUrl` use the scheme and host the caller used, which through a proxy on the server machine are the proxy's. `pairToken` is included only for a caller that `/api` pairing already accepts, so a device that is not paired gets the pairing prompt.

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

- A stream opened without a last event ID starts with `streamOpened` (payload `currentRevision`), whose envelope revision is the server's current revision and is not a new one. It is sent only on such a stream, before any other event.
- Client reconnects with `Last-Event-ID` (or `lastEventId` query fallback), including 0. Desktop and WebUI both resume with the last event ID, and a client takes the revision of a `resyncRequired` it receives. A client with no revision yet takes the `streamOpened` revision; `streamOpened` never moves a revision the client already holds.
- Optional `clientId` / `sessionId` hints support continuity and self-event suppression.
- Server replays buffered events newer than last revision when available.
- If replay gap exceeds retention, server emits `resyncRequired`. A last event ID ahead of the current revision, as after a server restart, also gets `resyncRequired` with reason `revisionGap`.
- `refreshStatusChanged` progress for each refresh stage is published at most every 400–500 ms; each stage's completion event is always published.
- WebUI reloads the loaded library list and does not post an item-state read with an empty path list. Desktop still requests favorite and blacklist for a specific path via `POST /api/library-states`.
- WebUI library overlay: `resyncRequired` reloads the loaded list-query window whether the overlay is shown or hidden. It does not post an empty item-state read. Favorite, blacklist, playback, and tag updates patch that window or reload it the same way.
- When the server starts stopping, it ends every open stream normally. Clients reconnect as after any dropped stream.
- `playbackRecorded` includes `itemId`, `path`, `playCount`, `lastPlayedUtc`, and `previousLastPlayedUtc`. `path` is the catalog's full path for that item, also when the request named it by id. `previousLastPlayedUtc` is the last-played time from before this play, and is null when the file had never been played. Clients copy `playCount` and `lastPlayedUtc` onto a loaded tile when those fields are present. Desktop shows `previousLastPlayedUtc` on the current file.
- `itemStateChanged` includes `itemId`, `path`, `isFavorite`, `isBlacklisted`, and `previousIsFavorite` and `previousIsBlacklisted`, the values from before this change. The WebUI uses the previous values for an item outside the loaded window, which reloads that window only when the change brings the item into the filter. The desktop still reloads for any change that could.
- `itemTagsChanged` includes `itemIds`, the files as the change named them, and `resolvedItemIds`, the catalog item ids of those files. `itemIds` lists what a tag apply request sent, which can be full paths, and the full paths for auto-tag apply. The WebUI matches tiles and its own saves by `resolvedItemIds`. The desktop matches `itemIds` by id or path.
- The WebUI matches every item event to loaded tiles, the playing item, and its item-state cache by item id only, so two files whose paths differ only in case stay apart. It names items by id in favorite, blacklist, record-playback, and tag-editor requests. The desktop still matches by path, ignoring case.

## Error and Simulation Semantics

- Deterministic missing-media behavior returns:
  - `404 { "error": "Media not found" }` on `GET /api/media/{idOrToken}`.
- A `GET /api/media/{idOrToken}` response still being sent when the server starts stopping is cut off, so a player that has stopped reading does not hold up shutdown.
- **Running without a library:** when the server cannot use its catalog, every `/api` route answers **503** `ErrorResponse` with the reason in `error` and `code` set to `library_newer` (a newer version of ReelRoulette saved the catalog, and it was left unchanged), `library_damaged` (the catalog is not a database, is corrupt, or has another schema, and was moved aside to `library.db.refused`, or a refused file from an earlier start is still there), `library_missing` (there is no catalog, but catalog backups exist), or `library_unreadable` (a catalog file could not be opened or read at the moment, for example because another program has it locked, and it was left unchanged). Routes that work without a library stay open: `/api/version`, `/api/capabilities`, `/api/pair`, `/api/web-runtime/settings`, `/api/backup/settings`, `/api/refresh/settings`, and `/api/logs/client`. Events, sources, and presets are refused too. A caller that is not paired still gets **401** first. `GET /control/status` reports the same state, and `/control/*` routes, including restart, stop, and update, keep working.
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
- `POST /api/random`
- `POST /api/play/{itemId}`
- `GET /api/sources`
- `POST /api/sources/import`
- `POST /api/sources/{sourceId}/enabled`

**Source import:** `POST /api/sources/import` trims trailing directory separators on `rootPath` before persist/match (Windows drive roots such as `D:\` stay a volume root, not `D:`), defaults `displayName` to the last path segment when the request name is blank, and treats slash-variants of the same folder as one source. The import enumerates the folder before it takes the catalog lock, then inserts new items and updates existing ones in one transaction. It matches an existing item by path and keeps that item's id, tags, favorite, blacklist, and playback stats. It does not remove items that are missing on disk. `GET /api/sources` and `GET /api/library/stats` return that derived folder name when stored `displayName` is empty; they do not write the derived name into the catalog. `GET /api/sources` and `POST /api/sources/{sourceId}/enabled` read catalog rows, so a newly imported source is listed and can be enabled or disabled without a restart. Setting the flag a source already has does not publish `sourceStateChanged`.

**Random playback filter payload:** `POST /api/random` accepts optional `presetId` (matches stored preset **name**) and optional inline `filterState` (JSON object). When both are supplied, the server resolves eligibility from **`filterState` first** (inline wins). Eligibility is the library list filter for enabled sources, plus the request's video and photo options. An empty eligible set returns an empty object. A library with no items returns **503**. Clients send a full `filterState` on every random request. `presetId` is included only when the applied filter still equals that named preset. For `minDuration` / `maxDuration`, prefer string **`HH:MM:SS`** (or a numeric duration in seconds) so values align with server `TimeSpan` parsing; two-part `H:MM` strings are interpreted as hours and minutes, not minutes and seconds. `filterState` has no `tagMatchMode`. A request or saved preset that still carries it is accepted and filtering ignores it. The server does not compare filters with presets: each client decides which saved preset the applied filter equals. Both ignore `tagMatchMode`, treat a missing or `null` `globalMatchMode` as `true` (AND) the same as filtering does, compare included and excluded tags as case-insensitive sets and `includedSourceIds` as sets, compare `categoryLocalMatchModes` by key in any order, treat a missing tag or source list as empty, ignore empty tag and source names, and treat an empty `categoryLocalMatchModes` as none. `shared/fixtures/preset-filter-equality.json` locks that comparison on both clients. Tag matching is guaranteed identical on both clients only for ASCII names, as with tag ordering, because JavaScript `toUpperCase` and .NET `ToUpperInvariant` upper-case some non-ASCII letters differently (for example, `ß`). `POST /api/presets` replaces the entire preset catalog in the catalog table (array of `{ name, filterState }`). Tag rename and delete update those rows. Core settings stay in `core-settings.json`.

**Direct item play:** `POST /api/play/{itemId}` requests playback by persisted library **`id`** (the path segment is **not** `fullPath`). The server reads that item and whether its source is enabled, and does not load the rest of the catalog. Optional JSON body `{ "clientId"?, "sessionId"? }` matches identity propagation on other playback endpoints. Success returns the same JSON shape as `POST /api/random` (`RandomResponse`: `id` is the full path and `itemId` the catalog item id) and updates play count / last-played server-side with a `playbackRecorded` SSE event—do **not** call `POST /api/record-playback` for the same play start. Blacklist does **not** block this endpoint. Errors use `ErrorResponse` with optional machine-readable `code` (for example `play_item_not_found`, `play_media_missing`, `play_source_disabled`, `play_unsupported_media`, `play_item_id_invalid`) and HTTP statuses **`404`** (unknown id or missing file), **`409`** (disabled source), **`415`** (extension not in the server playable allowlist). Desktop library grid activation and WebUI library tile activation use this endpoint; desktop Previous/Next navigation through its playback timeline still uses path-based play + `record-playback`.
- `POST /api/library/query` — browse path for filter, search, sort, and paging. Order is enabled sources, then a filename or relative-path substring search, then `filterState`, then sort. The body accepts `filterState` (omitted or null applies no filter predicates), `search`, `sortMode` (`Name`, `LastPlayed`, `PlayCount`, `Duration`, `DateAdded`; default `Name`), `sortDescending` (default false; direction applies only to the primary key), `offset` (default 0), and `limit` (default 100, maximum 10,000, so a client can reload the window it has loaded in one request). Search is an invariant-lowercase substring and stays accent-sensitive. Name sort is accent-sensitive and ignores case. Null last-played, duration, and last-write sort as the minimum. Ties break by filename ascending, then item id ascending, including when the primary sort is descending. The response has `items`, `totalCount` (after search and filter), and `searchBaselineCount` (after search, before filter). Items carry `duration` as `hh:mm:ss` in whole seconds and `durationSeconds` as a number when the catalog has a duration. Listed items include `hasThumbnail`, `thumbnailVersion`, `thumbnailWidth`, and `thumbnailHeight` for that page only. Dimensions come from the item row when both are positive. `hasThumbnail` is whether that item's JPEG exists. `thumbnailVersion` is present when it does, is opaque, and changes whenever the JPEG is written again. Missing files stay in the result. Every page returns both counts. The server caches them by catalog revision, search, and filter, and every committed catalog write raises the revision, so a later page of the same query does not count again. Each request writes one `Library query` line to `last.log` with its elapsed time. Invalid sort, paging, or a non-object `filterState` returns **400** `{ error }`.
- `POST /api/library/item` — one catalog item by id or full path. The body matches a list-query item (tags, favorite, blacklist, play count, last played, duration, audio, and loudness) and does not add thumbnail fields. A blank id returns **400**. A missing item returns **404**.
- `GET /api/library/catalog-checkpoint` — a standalone SQLite copy of the live catalog, produced while `library.db` is open. The response is `application/octet-stream` and does not depend on a WAL sidecar. Desktop library export saves this file.
- `GET /api/library/stats` — global totals and per-source totals from one SQL pass grouped by source id and media type, plus `baselineLoudnessLufs`. An item counts toward the source whose id it holds, ignoring case, and is a photo when its media type is photo and a video otherwise. Durations are summed in whole seconds. The baseline is the 75th percentile of integrated loudness for videos that have audio, including items on disabled sources, and is −18 LUFS when none qualify.
- `POST /api/library-states` — favorite and blacklist for the requested paths only. Matching is case-insensitive. An empty path list, or a list of blank paths, returns no items and does not load the catalog. A path that is not in the library is omitted.
- `POST /api/favorite`, `POST /api/blacklist`, `POST /api/record-playback`, and `POST /api/playback/clear-stats` update SQLite catalog rows. They match an item by catalog id or full path. A favorite clears blacklist, and a blacklist clears favorite. `itemStateChanged` and `playbackRecorded` stay the same events. `POST /api/record-playback` returns `accepted`, `itemId`, `revision`, `playCount`, and `lastPlayedUtc`. Clear-stats with no path list clears every row that has a play count or a last-played time. A path list clears only those items. `resyncRequired` with reason `playbackStatsCleared` is published only when at least one row was cleared.

### Web runtime settings

- `GET /api/web-runtime/settings`
- `POST /api/web-runtime/settings`
- Web runtime snapshot fields include `enabled`, `port`, `bindOnLan` (shown as **Allow remote connections**), `mdnsEnabled` (defaults to `true`; when `false`, remote connections and CORS still apply but the server does not advertise `{lanHostname}.local` on the network), `lanHostname`, `authMode`, and `sharedToken`.

### Backup settings

- `GET /api/backup/settings`
- `POST /api/backup/settings`
- Backup snapshot fields are `enabled` (default `true`), `minimumBackupGapMinutes` (default 360, clamped to 1–10080), and `numberOfBackups` (default 8, clamped to 1–100). `POST` returns the stored snapshot after clamping. Settings persist in `core-settings.json`. The same settings govern both catalog backups (`library.db.backup.*`) and settings backups (`core-settings.json.backup.*`), each kept in `backups/` with its own gap and count. Catalog backup rotation counts and trims only valid backups at the current catalog schema version, oldest first. Backups at another schema version and files it does not recognize stay in `backups/` and count toward neither the limit nor the gap.

### Tag editor

- Item/tag/category operations are API-driven.
- Batch-oriented contracts support multi-item updates.
- Tag-editor model reads, item-tag add and remove, category and tag upsert, rename, and delete, and `POST /api/autotag/apply` update SQLite catalog rows. They match an item by catalog id or full path. A model read with no item ids returns categories and tags. Categories are ordered by `sortOrder`, then by name. Tags are ordered by name. Names are compared lower-cased by character code, with an exact character-code comparison when they differ only in case, so `_` sorts after digits and before letters and `{|}~` sort after letters. Desktop and WebUI sort tag and category names, including tags still pending in the editor and auto-tag scan rows, with this same rule. The server, desktop, and WebUI order is guaranteed identical only for ASCII names, because JavaScript `toLowerCase` and .NET `ToLowerInvariant` lower-case some non-ASCII letters differently (for example, a final sigma). Uncategorized is included in that response when the table has no such row, and that read does not write one. The tag table is the catalog's tag list. An item can still hold a tag name that is not in that table. Desktop and WebUI close the editor and show that same delta on the current file and loaded tiles while the request runs. A failed request restores tags an event has not already confirmed. Every `itemTagsChanged` event carries `resolvedItemIds` beside `itemIds`. The save's own exact `itemTagsChanged` event updates the tiles loaded now and does not apply that delta a second time. `POST /api/tag-editor/rename-tag` publishes `itemTagsChanged` for the files that had the tag when the visible name changes, with the new name added and the old name removed, `catalogReplacedTag` set to the old name, and `catalogReplacementTag` set to the new name, and still publishes `tagCatalogChanged`. A rename that keeps the same display name publishes only `tagCatalogChanged`. `POST /api/tag-editor/delete-tag` publishes `itemTagsChanged` for the files that had the tag, with that name removed and `catalogReplacedTag` set to it, and still publishes `tagCatalogChanged`. A per-item edit leaves both catalog fields unset. Desktop and WebUI replace or remove that name in the applied filter and saved presets before they patch or reload, including on the other client.

- `POST /api/tag-editor/model`
- `POST /api/tag-editor/apply-item-tags`
- `POST /api/tag-editor/upsert-category`
- `POST /api/tag-editor/upsert-tag`
- `POST /api/tag-editor/rename-tag`
- `POST /api/tag-editor/delete-tag`
- `POST /api/tag-editor/delete-category`

### Refresh pipeline

- Refresh runs as a unified core-owned pipeline with ordered stages.
- Source refresh, fingerprint, duration, and loudness write their own catalog columns as each file finishes. A favorite, tag, blacklist, or playback change that commits during a stage stays. Source refresh still adds, removes, and renames items. Folder import still leaves missing files until refresh.
- The thumbnail stage reads catalog rows. A stored revision that matches the item's fingerprint, size, and write time is reused without walking that source file. A new item, a changed revision, or a missing JPEG is generated. The stage writes that item's revision, width, and height as the item finishes, including a dimension fill when the revision already matches. A favorite, tag, blacklist, or playback change that commits during the stage stays. A cancel leaves thumbnail columns already written. When the stage completes, a JPEG whose item id is not in the catalog is deleted, and the status line reports that cleanup. Opening the catalog does not delete those files. A cancel during cleanup leaves the remaining files for the next thumbnail stage that completes. An item that source refresh removes loses its thumbnail metadata, and its JPEG is removed when that cleanup runs. There is no thumbnail file-count or byte cap. JPEG files stay in the local thumbnail directory.
- A catalog backup for a refresh is taken after that refresh finishes and still follows the backup gap. A shorter backup gap applies on the next catalog save.
- `POST /api/refresh/start` rejects overlap (`409`).
- `GET /api/refresh/status` + SSE events provide projection state.
- Thumbnails are generated by the server pipeline and served via API paths.

- `POST /api/refresh/start`
- `GET /api/refresh/status`
- `GET /api/refresh/settings`
- `POST /api/refresh/settings`
- Refresh settings fields are `autoRefreshEnabled`, `autoRefreshIntervalMinutes` (clamped to 5–1440), `forceRescanLoudness`, `forceRescanDuration`, and `fingerprintScanMaxDegreeOfParallelism` (clamped to 1–16). Each force flag makes the next refresh rescan that stage for every item, and the server clears it once that stage ends, unless the refresh is canceled. Clearing a force flag leaves the other settings as saved. `POST /api/refresh/settings` schedules the next automatic refresh one interval from when the settings are saved.

### Duplicates and auto-tag

- Duplicate scan item payload includes per-item duplicate metadata (`itemId`, path/source identity, favorite/blacklist flags, play count) and `tagCount` for faster keep/delete review.
- `POST /api/duplicates/scan` reads catalog rows. Groups are items whose fingerprint status is ready and whose fingerprint is set. Pending, failed, and stale fingerprints stay excluded. Scope is the current source, all enabled sources, or every item.
- `POST /api/duplicates/apply` deletes the non-kept files and catalog rows and leaves the kept item. A missing file is reported with its `itemId` and `fullPath`, and that row stays.
- `POST /api/autotag/scan` — body `scanFullLibrary` and `itemIds` (library item `fullPath` values). The scan reads catalog rows. `scanFullLibrary: true` scans every item and ignores `itemIds`. `scanFullLibrary: false` with no `itemIds` scans enabled sources only (zero enabled sources scans nothing). A non-empty `itemIds` list scans those full paths. Each matched file carries its `itemId` beside `fullPath`.
- `POST /api/autotag/apply` returns `assignmentsAdded`, `changedItemPaths`, `changedItemIds`, and `applied` (one entry per tag that was newly written, with only the files that gained that tag, by path and by item id). When any file gains a tag, it publishes one `itemTagsChanged` event per tag that was newly applied, listing only the files that gained that tag by full path in `itemIds` and by item id in `resolvedItemIds`, and one `tagCatalogChanged` event.

### Media, thumbnail, events, client logs

- `GET /api/media/{idOrToken}`
- `GET /api/thumbnail/{itemId}` — the item's thumbnail JPEG, or **404**. Every 200 and 304 response has an ETag and `Last-Modified`, and a matching `If-None-Match` or `If-Modified-Since` returns **304**. With `v` equal to the item's current `thumbnailVersion`, the response is `Cache-Control: private, max-age=31536000, immutable`. Without `v`, or with an older one, it is `no-cache`.
- `GET /api/events`
- `POST /api/logs/client`

### Control plane (operator/runtime)

- `GET /control/settings` / `POST /control/settings` — `ControlRuntimeSettingsSnapshot` includes `adminAuthMode` (read-only: always `TokenRequired`, and a posted value is ignored), `adminSharedToken` (the control token; `POST` rejects an empty value and `restartRequired` is always `false`), and optional `devChannelEnabled` (defaults to `false` / stable update channel; when toggled, the server runs an immediate Velopack **check** against the persisted value and continues periodic **check-only** background polls on schedule).

- `GET /control/startup` / `POST /control/startup` — Launch Server on Startup. `GET` returns `supported`, `launchServerOnStartup`, and `message`. `POST` takes `{ launchServerOnStartup }` and returns `accepted`, `supported`, `launchServerOnStartup`, and `message`, with **409** and the same body when the change is not applied (for example, an unsupported platform, or a server run through `dotnet` rather than its app binary on Linux).

- `GET /control/update/status` — current Velopack self-update phase (`notInstalled`, `idle`, `noReleases`, `checkFailed`, `upToDate`, `updateAvailable`, `downloading`, `updateReady`, `restarting`), running/target versions when relevant, and `velopackInstalled`.
- `POST /control/update/check` — query the configured feed; does not download or apply.
- `POST /control/update/download` — download the update from the last successful check; does not apply.
- `POST /control/update/apply` — apply a downloaded update and restart the server process (operator UI disconnects).

- `GET /control/status` — `ControlStatusResponse`. `libraryState` is `ready`, `newer`, `damaged`, `missing`, or `unreadable`, with the same meanings as the `library_*` error codes, and `libraryMessage` says why there is no library and what to do, or is null when the state is `ready`. The Operator page shows that message. `isHealthy` does not change with the library state.
- `GET /control/settings`
- `POST /control/settings`
- `GET /control/startup`
- `POST /control/startup`
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
