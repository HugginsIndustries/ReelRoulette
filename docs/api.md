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
- The WebUI is the only client, an API/SSE orchestration and rendering layer.
- Server-owned flows must not gain client-local mutation fallbacks.

## Version and Capability Contract

`GET /api/version` provides compatibility and capability metadata:

- `appVersion`
- `apiVersion`
- `assetsVersion`
- `minimumCompatibleApiVersion`
- `supportedApiVersions[]`
- `capabilities[]`
- `libraryState` and `libraryMessage`, as `GET /control/status` reports them. The route answers without a library, so a client learns from it why library routes and the event stream answer 503.

The server reports `apiVersion` 2, `minimumCompatibleApiVersion` 2, and `supportedApiVersions` `["2"]`. Version 2 names library items only by catalog id on every route that takes an item id, and clears every item's playback stats only on an explicit `allItems`, so a client written for version 1, such as the retired desktop app, refuses the server, and the WebUI refuses a server that isn't version 2.

Client expectations:

- Clients validate API compatibility before enabling API-required flows.
- Clients validate required capability flags at startup.
- Capability checks are used to gate behavior when server support is missing.

`GET /api/capabilities` exposes explicit runtime capabilities for feature detection.

Both routes return the same list. One capability depends on the caller: `api.showInFileManager` is listed only for a localhost request, as Auth and Pairing defines it, while the server has a desktop session to open a file manager in, so it says whether `POST /api/show-in-file-manager/{itemId}` would be accepted from that caller. The WebUI treats it as optional and offers Show in File Manager only when it is listed.

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
- Cookie policy is runtime-configurable (same-site `Lax` or `Strict`, secure mode, session duration). In the default `Request` secure mode, a cookie is `Secure` when the client used HTTPS, including through a proxy.
- Auth middleware validates session cookie first; optional legacy fallback paths can be enabled.

Control-plane auth (`/control/*`):

- Localhost requests are trusted on every control route, including the testing routes. A request to the server's own LAN address from the server machine counts as localhost. A request through a reverse proxy does not, even when the proxy runs on the server machine.
- A non-localhost request returns `403` while remote connections are off. Otherwise it needs a control session cookie (`rr_admin`) from `POST /control/pair`, or the control token as a `Bearer` header when legacy token auth is allowed, and returns `401` without one. A `token` query parameter is never accepted on control routes, so the control token stays out of URLs and request logs. There is no setting that turns this off.
- The server generates a control token on start when none is set and saves it as `controlRuntime.adminSharedToken` in `core-settings.json` in the server data folder. The Operator shows it under Control Settings.
- `POST /control/pair` with the token in its JSON body returns `200` and sets the admin cookie; there is no `GET` form. A wrong or missing token returns `401` and logs a warning with the remote address to `last.log`, never the token.
- Changing the token through `POST /control/settings` ends every control session. A non-localhost caller gets a fresh admin cookie in the same response, so the rest of its save goes through.
- A control session also authorizes `/api` requests.

## Cookie Runtime Policy

Runtime controls include the pairing cookie policy options.

Recommended profiles:

- Localhost dev: relaxed cookie policy appropriate for local HTTP.
- LAN/prod-style: HTTPS + secure cookie settings.

The WebUI and the API share one origin, directly or through a proxy, so the server has no CORS policy.

## Web Runtime Configuration (WebUI)

Web client bootstraps runtime config from `/runtime-config.json`.

Required keys:

- `apiBaseUrl` (absolute `http`/`https` API root)
- `sseUrl` (absolute `http`/`https` SSE URL, typically `/api/events`)

Optional keys:

- `pairToken` (sent only to a caller that pairing already accepts)

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
- Client reconnects with `Last-Event-ID` (or `lastEventId` query fallback), including 0. The WebUI resumes with the last event ID, and takes the revision of a `resyncRequired` it receives. A client with no revision yet takes the `streamOpened` revision; `streamOpened` never moves a revision the client already holds.
- Optional `clientId` / `sessionId` hints support continuity and self-event suppression.
- Server replays buffered events newer than last revision when available.
- If replay gap exceeds retention, server emits `resyncRequired`. A last event ID ahead of the current revision, as after a server restart, also gets `resyncRequired` with reason `revisionGap`.
- `refreshStatusChanged` progress for each refresh stage is published at most every 400–500 ms; each stage's completion event is always published.
- WebUI reloads the loaded library list.
- WebUI Library tab: `resyncRequired` reloads the loaded list-query window whether the tab is shown or hidden. Favorite, blacklist, playback, tag, and rating updates patch that window or reload it the same way.
- WebUI presets: each `presetCatalogChanged`, the page's own changes included, and each `resyncRequired` reload the presets, a burst sharing one reload. The WebUI tells another device's changes from its own by `clientId`, a missing one counting as another device's, and what changed by comparing the reloaded list with each preset as it held it when the event came. When another device changes the filter of the preset the page has applied unchanged, or a resync finds it changed, the page applies the new filter.
- WebUI Filter and Tags tabs: while it shows, the Filter tab loads its sources, tags, and presets again on `tagCatalogChanged`, `sourceStateChanged`, and `resyncRequired`, and while it shows without unsaved changes, the Tags tab loads its tags again on `tagCatalogChanged` and `resyncRequired`, a burst sharing one load. A hidden tab loads when it next shows. `sourceStateChanged` is published only when a source is enabled or disabled.
- When the server starts stopping, it ends every open stream normally. Clients reconnect as after any dropped stream.
- `playbackRecorded` includes `itemId`, `playCount`, `lastPlayedUtc`, and `previousLastPlayedUtc`. `previousLastPlayedUtc` is the last-played time from before this play, and is null when the file had never been played. Clients copy `playCount` and `lastPlayedUtc` onto a loaded tile when those fields are present. The WebUI's Stats tab shows `previousLastPlayedUtc` on the current file, holding an event that comes before its item starts, as a library play's does, until it starts.
- `itemStateChanged` includes `itemId`, `path`, `isFavorite`, `isBlacklisted`, and `previousIsFavorite` and `previousIsBlacklisted`, the values from before this change, and `clientId`, the client that made the change, from its favorite or blacklist request, or null when the request named none. The event goes to every client, the one that made the change too. The WebUI uses the previous values for an item outside the loaded window, which reloads that window only when the change brings the item into the filter.
- `itemRatingChanged` includes `itemId`, `path`, `rating`, and `previousRating`, the rating before this change, each in stars or null for none, and `clientId`, the client that made the change, from its rating request, or null when the request named none. `POST /api/rating` publishes it only when the rating changed, and it goes to every client, the one that made the change too. The WebUI's Stats tab, and the player's star and the stars it opens, show the new rating at once, unless a change made on this device is still waiting or on its way, the Stats tab loads again, and the WebUI pops up a change whose `clientId` isn't its own, one without a client id counting as another device's. The Library tab puts the new rating on a loaded tile, and reloads its loaded window only when the change can alter what it shows or its order: under Only unrated or a minimum rating when `rating` takes a loaded tile out, or `rating` and `previousRating` show an item outside it comes in, and under the Rating sort for any change.
- `itemTagsChanged` includes `resolvedItemIds`, the catalog item ids of the files the change applies to. The WebUI matches tiles and its own saves by them.
- The WebUI matches every item event to loaded tiles, the playing item, and its item-state cache by item id only, so two files whose paths differ only in case stay apart. It names items by id in favorite, blacklist, rating, record-playback, and tag-editor requests.

## Error and Simulation Semantics

- Deterministic missing-media behavior returns:
  - `404 { "error": "Media not found" }` on `GET /api/media/{token}`.
- A file that is there but can't be read, such as on a stalled drive or share or one the server isn't allowed to read, returns `503 { "error": "Media can't be read" }` on `GET /api/media/{token}`, and `503` with code `play_media_unreadable` on `POST /api/play/{itemId}`. Both routes open the file to decide, so a `404` for a known token or id means the file is missing, and each writes a warning line to `last.log` naming the error's type, without the path. A stalled share can hold the answer for as long as the open waits.
- A `GET /api/media/{token}` response still being sent when the server starts stopping is cut off, so a player that has stopped reading does not hold up shutdown.
- **Running without a library:** when the server cannot use its catalog, every `/api` route answers **503** `ErrorResponse` with the reason in `error` and `code` set to `library_newer` (a newer version of ReelRoulette saved the catalog, and it was left unchanged), `library_damaged` (the catalog is not a database, is corrupt, or has another schema, and was moved aside to `library.db.refused`, or a refused file from an earlier start is still there), `library_missing` (there is no catalog, but catalog backups exist), or `library_unreadable` (a catalog file could not be opened or read at the moment, for example because another program has it locked, and it was left unchanged). Routes that work without a library stay open: `/api/version`, `/api/capabilities`, `/api/pair`, `/api/web-runtime/settings`, `/api/backup/settings`, `/api/refresh/settings`, and `/api/logs/client`. Events, sources, and presets are refused too. A caller that is not paired still gets **401** first. `GET /api/version` and `GET /control/status` report the same state, and `/control/*` routes, including restart, stop, and update, keep working.
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
- `POST /api/presets/create`
- `POST /api/presets/{presetId}/update`
- `POST /api/presets/{presetId}/rename`
- `POST /api/presets/reorder`
- `POST /api/presets/{presetId}/delete`
- `POST /api/random`
- `POST /api/random/cycle`
- `POST /api/random/reset`
- `POST /api/play/{itemId}`
- `POST /api/show-in-file-manager/{itemId}`
- `GET /api/sources`
- `POST /api/sources/import`
- `POST /api/sources/{sourceId}/enabled`

**Source import:** `POST /api/sources/import` trims trailing directory separators on `rootPath` before persist/match (Windows drive roots such as `D:\` stay a volume root, not `D:`), defaults `displayName` to the last path segment when the request name is blank, and treats slash-variants of the same folder as one source. The import enumerates the folder before it takes the catalog lock, then inserts new items and updates existing ones in one transaction. It matches an existing item by path and keeps that item's id, tags, favorite, blacklist, and playback stats. It does not remove items that are missing on disk. `GET /api/sources` and `GET /api/library/stats` return that derived folder name when stored `displayName` is empty; they do not write the derived name into the catalog. `GET /api/sources` and `POST /api/sources/{sourceId}/enabled` read catalog rows, so a newly imported source is listed and can be enabled or disabled without a restart. Setting the flag a source already has does not publish `sourceStateChanged`.

**Random playback filter payload:** `POST /api/random` accepts optional `presetId` (matches a stored preset's **id**, exactly) and optional inline `filterState` (JSON object). A filter state has the same fields in random requests, library queries, and presets, and OpenAPI's `FilterState` schema names them with their defaults. Fields the schema doesn't name, such as the retired `tagMatchMode` in old presets, are accepted and ignored by filtering and by the WebUI's preset matching. The server also ignores the older `favoritesOnly` and `excludeBlacklisted`, which the catalog's upgrade to schema version 5 rewrote into the modes in every stored preset, so each stored preset filters as it did. `favoritesMode` and `blacklistedMode` are each `off`, `only`, or `excluded`, read in any case. Any other value, including null or a number, counts as missing: a missing `favoritesMode` is `off`, and a missing `blacklistedMode` is `excluded`. The upgrade wrote each stored preset's modes by the rule the server read them with before: a known mode wins, and otherwise `favoritesOnly` true is `only` and anything else is `off`, and `excludeBlacklisted` false is `off` and anything else, including a missing field, is `excluded`. `src/core/ReelRoulette.Core.Tests/Fixtures/filter-mode-resolution.json` locks that rule in the upgrade. The WebUI reads and writes only the modes, never the older booleans. `audioFilter`, `mediaTypeFilter`, and the values of `categoryLocalMatchModes` are an integer or a name in any case, and the server and the WebUI read them alike: an unknown name or null reads as the default, and a category entry with one is dropped. `shared/fixtures/filter-enum-values.json` locks that reading, and the server's and the WebUI's reading of the modes. An item is never both favorite and blacklisted, so `only` for both matches nothing; the server accepts that pairing rather than rejecting it. When both are supplied, the server resolves eligibility from **`filterState` first** (inline wins). A `presetId` of `all-media`, which is never a preset's id, picks with the default filter. Without a `filterState`, any other `presetId` that is no preset's id, a preset's name included, returns **404**. Eligibility is the library list filter for enabled sources, plus the request's video and photo options. When nothing is eligible, the answer's `item` is null and its cycle numbers are all 0. A library with no items returns **503**, as does one the server can't read, each without a `code`. Clients send a full `filterState` on every random request. `presetId` is included only when the applied filter still equals that preset's filter. For `minDuration` / `maxDuration`, a JSON number is seconds and a string is .NET `TimeSpan` text, such as **`HH:MM:SS`** or `d.HH:MM:SS.fffffff`, so the string `"90"` is 90 days, not 90 seconds, and two-part `H:MM` strings are hours and minutes, not minutes and seconds. The WebUI decides which saved preset the applied filter equals, and Core's `FilterStateComparison` compares filters by the same rule. It compares the Favorites and Blacklisted modes, treats a missing or `null` `globalMatchMode` as `true` (AND) the same as filtering does, compares included and excluded tags as case-insensitive sets and `includedSourceIds` as sets, compares `categoryLocalMatchModes` by key in any order, treats a missing tag or source list as empty, ignores empty tag and source names, and treats an empty `categoryLocalMatchModes`, or a category's AND entry, as none. `shared/fixtures/preset-filter-equality.json`, which Core and the WebUI both read, locks that comparison. Both compare `onlyBrowserPlayable` and `onlyUnrated`, each missing equal to false, and `minRating`, missing equal to null, as is a value that isn't a rating. Both also compare `addedRange` and `createdRange` by the choice, a preset's name or a custom range's days, so `last30Days` differs from a custom range of the same days, and the WebUI reads them as the server does, locked to `shared/fixtures/filter-date-ranges.json`.

**Random pick options:** `POST /api/random` takes an optional `options` object. Each option takes its default when it is missing. `shuffle`, on by default, leaves out the items picked on the device within the window until every eligible item has been, and then starts a new cycle whose first pick is never the last pick. `rememberPlaysForDays` is that window: 1, 7, 30, or 90 days, 30 by default, or null for until every eligible item has been picked; any other value reads as 30. `spreadByFolder`, on by default, leaves out the items in the folders of the device's last 16 picks, or of half the eligible set's folder count, rounded down, when that is fewer, unless those folders hold every item left; a folder is the item's immediate parent. `spreadByTags` is `off` by default, or `allTags` or `byCategory`, read in any case, and null or any other value reads as `off`: it makes items whose tags came up in the device's last 16 eligible picks beyond their share of the eligible set less likely, rarer tags more so, counting every tag, or under `byCategory` only the tags of the categories in `spreadCategoryIds`, where null counts as none and an id no category has is ignored. Having no tags counts as a tag of its own, and a tag an item holds that isn't in the tag list has no category. `favorLessPlayed` makes items with fewer plays, and those not played lately, more likely; `favorNewlyAdded` and `favorNewlyCreated` give the items added, or created, in the last 14 days one 20% share of the picks, newer ones more, and with both on an item counts from the later date; and `favorHigherRated` makes higher-rated items more likely, an unrated item counting as 2.5 stars. Each is off by default, and with every option off picks are pure random. Every pick goes into a memory the server keeps for each `clientId`, by item id and pick time, whatever the options; requests without a `clientId` share one. A change to the filter or the options keeps it, and a server restart clears it. Each pick drops the memory of every device whose last pick is past the window it was picked with, so a device on null keeps its memory until the server restarts. The answer's `cycle` holds the device's Shuffle cycle numbers after the pick: `picked`, the eligible items picked within the window, `eligible`, and `remaining`, which with `picked` adds up to `eligible`. `POST /api/random/cycle` takes the same body and answers those numbers as they stand, without picking or changing the memory, with the same 400, 404, and 503 answers as a pick. `POST /api/random/reset` (`{ "clientId"? }`) clears the device's Shuffle memory and its last pick and answers **`204`**; the last 16 picks that Spread by folder and Spread by tags look at stay, so the next pick still skips recent folders. Each pick writes one `last.log` line naming the options that are on and the window, such as `Random pick options=shuffle,spreadByFolder remember=30d eligible=812 elapsedMs=41.`, without ids or paths.

**Browser-playable filter:** `onlyBrowserPlayable` true keeps photos and only the videos whose container a browser can play: a file name ending in `.mp4`, `.m4v`, or `.webm`, in any case (`BrowserPlayableContainers` in Core). Videos in any other container, such as `.mkv`, `.avi`, `.wmv`, or `.mov`, are left out of the library query, its counts, and random selection. The list goes by container alone and can't see a file's codecs, so `.mkv` is left out: its files didn't play on an iPad and played with broken audio in desktop Firefox. Missing or false applies no restriction, so a preset saved without the field filters as before.

**Rating filter:** `onlyUnrated` true keeps only items with no rating. `minRating`, in stars from 0.5 to 5 in half-star steps, keeps items rated at or above it, so it leaves unrated items out, and with `onlyUnrated` true nothing matches; the server applies that pairing as sent rather than rejecting it. The library query, its counts, and random selection apply both. A `minRating` that isn't a rating, such as a string, 3.2, or 0, reads as no minimum, as `ItemRating` reads a rating, and `shared/fixtures/filter-min-rating.json` locks that reading. A missing or false `onlyUnrated` and a missing or null `minRating` apply no restriction, so a preset saved without the fields filters as before.

**Date filter:** `addedRange` keeps items whose date added falls in a range, and `createdRange` items whose date created, the file's modified time, does; the two can be used together. An item's date added is when the source stage of the refresh that found its file started, or its modified time for a file the library held before the catalog recorded dates added. Items `POST /api/sources/import` inserts have none. Each field is a preset, `last7Days`, `last30Days`, `last90Days`, or `thisYear`, read in any case, or a custom range, `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }`. A filter holds the choice, never resolved dates, so a preset holding `last30Days` always means the last 30 days. The server resolves a range each time it filters, in its own time zone and to whole days: `last7Days` is today and the 6 days before it, `last30Days` and `last90Days` likewise, `thisYear` is 1 January to 31 December, and a custom range covers its first and last days. The library query, its counts, and random selection apply both, and an item without that date is left out. An unknown preset, a date that isn't one, a custom range without both dates, and one that ends before it starts read as no limit, and `shared/fixtures/filter-date-ranges.json` locks that reading. A missing or null field applies no restriction, so a preset saved without the fields filters as before.

**Presets:** Each preset has an id of its own, kept across renames, which `GET /api/presets` returns, the per-preset routes take in their path, and `presetCatalogChanged` carries. `POST /api/presets/create` (`{ name, filterState, clientId? }`) adds a preset after every other one, with a new id, `POST /api/presets/{presetId}/update` (`{ filterState, clientId? }`) replaces its filter, and `POST /api/presets/{presetId}/rename` (`{ name, clientId? }`) renames it, each answering with the preset as written (`PresetResponse`). `POST /api/presets/reorder` (`{ presetIds, clientId? }`) takes every preset's id once, in the new order, and changes nothing else, and `POST /api/presets/{presetId}/delete` (an optional `{ clientId? }`) deletes one; both answer 200 with no body. Names are trimmed. No preset may hold the default filter (**400**), another preset's filter by the comparison above (**409**, with `error` naming that preset), or another preset's name, ignoring case (**409**); a preset keeps its own filter and may take its own name in another case. An empty name or a filter state that isn't an object is **400**, an id no preset has is **404**, and an order that doesn't name every preset once is **409**. A write the catalog doesn't take, because it throws, as when another write holds the catalog past its busy timeout, or changes no row, as when the catalog lacks a preset the server holds after an earlier failed write, answers **500** with the server's reason, changes and publishes nothing, and writes a `last.log` warning. Each write publishes `presetCatalogChanged` with the preset's id, or a null `presetId` for a reorder, and the request's `clientId`, so a client can tell its own change from another device's. The WebUI's Filter tab saves each preset it changed with these routes, one at a time: deletes, then renames, then filter updates, then new presets, then one reorder, with each rename after the one that frees its name and each update after the one that frees its filter, so none is refused for a name or filter another of its own changes gives up. Changes that would have presets take each other's names or filters, in a loop, can't be sent in any order, so the tab doesn't send them. Tag rename and delete update the presets that hold the tag, keeping their ids, are never refused for the filters they leave, and publish no `presetCatalogChanged`, so clients see the presets they change through `tagCatalogChanged`. When their preset write fails, the presets the server holds still change, and `last.log` gets a warning. Presets live in a catalog table, and core settings stay in `core-settings.json`.

**Direct item play:** `POST /api/play/{itemId}` requests playback by persisted library **`id`** (the path segment is **not** `fullPath`). The server reads that item and whether its source is enabled, and does not load the rest of the catalog. Optional JSON body `{ "clientId"?, "sessionId"?, "recordPlayback"? }`: the identity fields match identity propagation on other playback endpoints, and `recordPlayback: false` answers the same without updating play count or last played or publishing `playbackRecorded`, which the WebUI sends only to get a fresh media URL for the item playing now, whose play has already counted, as when a server restart dropped its media token. Without it, or with `true`, the play counts. Success returns `PlaybackItemResponse`, the item a random pick's `item` carries (`id` is the full path, `itemId` the catalog item id, and `integratedLoudness` and `peakDb` the loudness scan's integrated loudness in LUFS and true peak in dBTP, or null where it hasn't measured them, which the WebUI's loudness normalization reads, and `rating` the item's rating in stars, from 0.5 to 5 in half-star steps, or null for none, which the WebUI's player shows, also from a history step's answer) and updates play count / last-played server-side with a `playbackRecorded` SSE event—do **not** call `POST /api/record-playback` for the same play start. Blacklist does **not** block this endpoint. Errors use `ErrorResponse` with optional machine-readable `code` (for example `play_item_not_found`, `play_media_missing`, `play_source_disabled`, `play_unsupported_media`, `play_item_id_invalid`, `play_media_unreadable`) and HTTP statuses **`404`** (unknown id or missing file), **`409`** (disabled source), **`415`** (extension not in the server's supported list, `SupportedMediaExtensions`), and **`503`** (the file is there but can't be read, with `play_media_unreadable`, or the server has no library). WebUI library tile activation and every step through the WebUI's history, by Next, Previous, autoplay, or a skip, use this endpoint.

**Show in File Manager:** `POST /api/show-in-file-manager/{itemId}` opens the server machine's file manager with the item's file selected, by persisted library **`id`**, never a path, and answers **`204`**. It is accepted only from localhost, as Auth and Pairing defines it, so a request through a reverse proxy is refused even on the server machine. On Windows the server starts Explorer with `/select,"<path>"`. On Linux it calls `org.freedesktop.FileManager1.ShowItems` on the session bus, which selects the file in Dolphin, Nautilus, and other file managers that implement it, and when that call fails, or there is no session bus, it opens the file's folder with `xdg-open`. Neither goes through a shell. Errors use `ErrorResponse` with `code`: **`403`** `file_manager_not_local` for any other caller, **`409`** `file_manager_unavailable` when the server has no desktop session (on Linux, neither `DISPLAY` nor `WAYLAND_DISPLAY` is set) or runs on another system, **`404`** `file_manager_item_not_found` for an unknown id and `file_manager_file_missing` when the file isn't on disk, and **`500`** `file_manager_failed` when the file manager couldn't be started. Each request writes one `Show in file manager` line to `last.log` with the item id and the outcome, without the path. The WebUI's Stats tab offers it beside the playing file's path when `api.showInFileManager` is listed, and Copy Path otherwise.
- `POST /api/library/query` — browse path for filter, search, sort, and paging. Order is enabled sources, then a filename or relative-path substring search, then `filterState`, then sort. The body accepts `filterState` (omitted or null applies no filter predicates), `search`, `sortMode` (`Name`, `LastPlayed`, `PlayCount`, `Duration`, `DateAdded`, `DateCreated`, `Rating`; default `Name`, where `DateAdded` sorts by the date added and `DateCreated` by the file's modified time), `sortDescending` (default false; direction applies only to the primary key), `offset` (default 0), and `limit` (default 100, maximum 10,000, so a client can reload the window it has loaded in one request). Search is an invariant-lowercase substring and stays accent-sensitive. Selected and excluded tags match an item's tags, and find their category, by the invariant-lowercase fold the catalog identifies tags by. Name sort is accent-sensitive and ignores case. Null last-played, duration, date added, date created, and rating sort as the minimum. Ties break by filename ascending, then item id ascending, including when the primary sort is descending. The response has `items`, `totalCount` (after search and filter), and `searchBaselineCount` (after search, before filter). Items carry `duration` as `hh:mm:ss` in whole seconds and `durationSeconds` as a number when the catalog has a duration, `integratedLoudness` in LUFS when the loudness scan has measured it, `peakDb`, the true peak in dBTP, when the scan has measured it, and `dateAddedUtc` and `dateCreatedUtc`, the date added and the file's modified time as ISO UTC strings, when the catalog has them; a missing value is left out rather than sent as null. Listed items include `hasThumbnail`, `thumbnailVersion`, `thumbnailWidth`, and `thumbnailHeight` for that page only. Dimensions come from the item row when both are positive. `hasThumbnail` is whether that item's JPEG exists. `thumbnailVersion` is present when it does, is opaque, and changes whenever the JPEG is written again. Missing files stay in the result. Every page returns both counts. The server caches them by catalog revision, search, and filter, and every committed catalog write raises the revision, so a later page of the same query does not count again. Each request writes one `Library query` line to `last.log` with its elapsed time. Invalid sort, paging, or a non-object `filterState` returns **400** `{ error }`.
- `POST /api/library/item` — one catalog item by its catalog id. A full path finds no item. The body matches a list-query item (tags, favorite, blacklist, rating, play count, last played, duration, audio, loudness, and the dates added and created) and does not add thumbnail fields. A rated item carries `rating` in stars, from 0.5 to 5 in half-star steps, and an unrated one leaves it out. A blank id returns **400**. A missing item returns **404**.
- `GET /api/library/catalog-checkpoint` — a standalone SQLite copy of the live catalog, produced while `library.db` is open. The response is `application/octet-stream` and does not depend on a WAL sidecar. No client calls it.
- `GET /api/library/stats` — global totals and per-source totals from one SQL pass grouped by source id and media type, plus `baselineLoudnessLufs`. The global totals include `rated`, the items with a rating. An item counts toward the source whose id it holds, ignoring case, and is a photo when its media type is photo and a video otherwise. Durations are summed in whole seconds. The baseline is the 75th percentile of integrated loudness for videos that have audio, including items on disabled sources, and is −18 LUFS when none qualify.
- `POST /api/favorite`, `POST /api/blacklist`, `POST /api/record-playback`, and `POST /api/playback/clear-stats` update SQLite catalog rows. Favorite, blacklist, and record-playback name the item in `itemId`, and clear-stats names items in `itemIds`, each by catalog id only; a full path finds no item, and favorite, blacklist, and record-playback answer **404** for an unknown id. Favorite and blacklist take an optional `clientId`, which the WebUI sends and `itemStateChanged` carries back. A favorite clears blacklist, and a blacklist clears favorite. `itemStateChanged` and `playbackRecorded` stay the same events. `POST /api/record-playback` returns `accepted`, `itemId`, `revision`, `playCount`, and `lastPlayedUtc`. Clear-stats with `allItems: true` clears every row that has a play count or a last-played time, and an `itemIds` list clears only those items. A request with neither, or with both, is refused with **400** and clears nothing. `resyncRequired` with reason `playbackStatsCleared` is published only when at least one row was cleared. Favorite and blacklist answer with `LibraryStateResponse`: the item's id, path, favorite, blacklist, and the revision of the `itemStateChanged` event they published.
- `POST /api/rating` sets an item's rating, named in `itemId` by catalog id only, to `rating`, in stars, a multiple of 0.5 from 0.5 to 5, or clears it with null; a request without `rating` clears it too. It takes an optional `clientId`, which `itemRatingChanged` carries back. It answers **400** for an empty id or any other rating, and **404** for an unknown id. It answers with the item's id, its rating, and the revision of the `itemRatingChanged` event it published, which it publishes only when the rating changed; the rating the item already has answers with the server's current revision. A rating is independent of favorite and blacklist, so neither changes. The catalog stores it as a whole number of half stars, from 1 to 10, with no value for none.

### Web runtime settings

- `GET /api/web-runtime/settings`
- `POST /api/web-runtime/settings`
- Web runtime snapshot fields include `enabled`, `port`, `bindOnLan` (shown as **Allow remote connections**), `mdnsEnabled` (defaults to `true`; when `false`, remote connections still apply but the server does not advertise `{lanHostname}.local` on the network), `lanHostname`, `authMode`, and `sharedToken`.

### Backup settings

- `GET /api/backup/settings`
- `POST /api/backup/settings`
- Backup snapshot fields are `enabled` (default `true`), `minimumBackupGapMinutes` (default 360, clamped to 1–10080), and `numberOfBackups` (default 8, clamped to 1–100). `POST` returns the stored snapshot after clamping. Settings persist in `core-settings.json`. The same settings govern both catalog backups (`library.db.backup.*`) and settings backups (`core-settings.json.backup.*`), each kept in `backups/` with its own gap and count. Catalog backup rotation counts and trims only valid backups at the current catalog schema version, oldest first. Backups at another schema version and files it does not recognize stay in `backups/` and count toward neither the limit nor the gap.

### Tag editor

- Item/tag/category operations are API-driven.
- Batch-oriented contracts support multi-item updates.
- Tag-editor model reads, item-tag add and remove, category and tag upsert, rename, and delete, and `POST /api/autotag/apply` update SQLite catalog rows. Tag-editor reads and item-tag edits match an item by catalog id only, and auto-tag apply's `itemPaths` by full path. A model read with no item ids returns categories and tags. Categories are ordered by `sortOrder`, then by name. Tags are ordered by name. Names are compared lower-cased by character code, with an exact character-code comparison when they differ only in case, so `_` sorts after digits and before letters and `{|}~` sort after letters. The WebUI sorts tag and category names, including tags still pending in the editor and auto-tag scan rows, with this same rule. The server and WebUI order is guaranteed identical only for ASCII names, because JavaScript `toLowerCase` and .NET `ToLowerInvariant` lower-case some non-ASCII letters differently (for example, a final sigma). Uncategorized is included in that response when the table has no such row, and that read does not write one. The tag table is the catalog's tag list. An item can still hold a tag name that is not in that table. The WebUI shows that same delta on the current file and loaded tiles while the request runs. A failed request restores tags an event has not already confirmed. Every `itemTagsChanged` event carries `resolvedItemIds`. The save's own exact `itemTagsChanged` event updates the tiles loaded now and does not apply that delta a second time. `POST /api/tag-editor/rename-tag` publishes `itemTagsChanged` for the files that had the tag when the visible name changes, with the new name added and the old name removed, `catalogReplacedTag` set to the old name, and `catalogReplacementTag` set to the new name, and still publishes `tagCatalogChanged`. A rename that keeps the same display name publishes only `tagCatalogChanged`. `POST /api/tag-editor/delete-tag` publishes `itemTagsChanged` for the files that had the tag, with that name removed and `catalogReplacedTag` set to it, and still publishes `tagCatalogChanged`. A per-item edit leaves both catalog fields unset. The WebUI replaces or removes that name in the applied filter and saved presets before it patches or reloads, including on another device. A rename or delete of a tag no file has publishes only `tagCatalogChanged`, without the old name, so on it the WebUI clears a kept Auto Tag scan that names a tag the event's tags leave out.
- A change the catalog doesn't take is refused with **409** and a reason the WebUI shows after the step that failed: a new tag already in the category it names, a rename or delete of a tag the catalog doesn't have, a delete of a category it doesn't have, or an item-tag edit that changes nothing. An item-tag edit naming no item still in the library is refused with **404**. A category upsert is refused only for a blank id or name, with **400**.

- `POST /api/tag-editor/model`
- `POST /api/tag-editor/apply-item-tags`
- `POST /api/tag-editor/upsert-category`
- `POST /api/tag-editor/upsert-tag`
- `POST /api/tag-editor/rename-tag`
- `POST /api/tag-editor/delete-tag`
- `POST /api/tag-editor/delete-category`

### Refresh pipeline

- Refresh runs as a unified core-owned pipeline with ordered stages.
- Source refresh, fingerprint, duration, and loudness write their own catalog columns as each file finishes. A favorite, tag, blacklist, or playback change that commits during a stage stays. Source refresh still adds, removes, and renames items, except that a disabled source, a source whose folder is missing, and a source whose folder lists no media files while the catalog holds items from it, such as a drive or share that isn't mounted, lose none of their items. In that last case, `last.log` gets a warning naming the folder, and the refresh status's `keptSources` lists the source by its id with the number of items kept, without the folder, since the status goes to every client. The list starts empty with each run. Folder import still leaves missing files until refresh.
- The loudness stage measures each video's integrated loudness and true peak with ffmpeg's `ebur128` filter, one video at a time, so a scan over a network share leaves room for playback from it. A value the scan doesn't measure is stored as none, and a track it measures as digital silence, at the −70 LUFS floor with a `-inf` peak, counts as no audio, the same as a file without an audio track, in the audio filter, the library stats, and the baseline. A scan that fails keeps the stored loudness and peak and records its error, and the next refresh scans that video again. Each result records the loudness analysis version it was scanned under, and a video with audio scanned under an older version is scanned again, so after an upgrade that changes the analysis the next refresh scans every video with audio.
- The thumbnail stage reads catalog rows. A stored revision that matches the item's fingerprint, size, and write time is reused without walking that source file. A new item, a changed revision, or a missing JPEG is generated. The stage writes that item's revision, width, and height as the item finishes, including a dimension fill when the revision already matches. A favorite, tag, blacklist, or playback change that commits during the stage stays. A cancel leaves thumbnail columns already written. When the stage completes, a JPEG whose item id is not in the catalog is deleted, and the finished refresh's summary reports that cleanup. Opening the catalog does not delete those files. A cancel during cleanup leaves the remaining files for the next thumbnail stage that completes. An item that source refresh removes loses its thumbnail metadata, and its JPEG is removed when that cleanup runs. There is no thumbnail file-count or byte cap. JPEG files stay in the local thumbnail directory.
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
- `POST /api/autotag/scan` — body `scanFullLibrary`. The scan reads catalog rows. `scanFullLibrary: true` scans every item, and `false` scans enabled sources only (zero enabled sources scans nothing). Each matched file carries its `itemId` beside `fullPath`.
- `POST /api/autotag/apply` returns `applied`, one entry per tag that was newly written, with only the files that gained that tag by item id in `changedItemIds`. When any file gains a tag, it publishes one `itemTagsChanged` event per tag that was newly applied, listing only the files that gained that tag in `resolvedItemIds`, and one `tagCatalogChanged` event.

### Media, thumbnail, events, client logs

- `GET /api/media/{token}` — streams the file a playback token names, from the `mediaUrl` of `POST /api/random` or `POST /api/play/{itemId}`. A catalog item id or a full path is not a token and returns **404**, and so does every token issued before the server last started, since tokens live only in its memory. A missing file returns **404**, and one that is there but can't be read **503**.
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
- runtime auth/config expectations change.

Keep this document concise and current-state only.
Do not add milestone references or implementation chronology.
