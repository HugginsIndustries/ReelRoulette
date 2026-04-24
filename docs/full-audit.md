# ReelRoulette Repository Full Audit

This document is a consolidated, report-only audit covering server/core, desktop, WebUI, and tooling layers of the ReelRoulette repository. Findings are grouped by layer and ordered by severity (high → medium → low).

Each finding uses the following structure:

- **File:** path and line numbers (when applicable).
- **Issue:** one-line description of the problem.
- **Layer:** `server/core`, `core`, `desktop`, `WebUI`, or `tooling`.
- **Severity:** `low`, `medium`, or `high`.
- **Action:** recommended remediation.

Style nits and speculative items are intentionally excluded.

---

## Table of contents

- [Server / Core](#server--core)
  - [High severity](#high-severity)
  - [Medium severity](#medium-severity)
  - [Low severity](#low-severity)
- [Core (`ReelRoulette.Core`) and `ServerApp`](#core-reelrouletteCore-and-serverapp)
  - [High severity](#high-severity-1)
  - [Medium severity](#medium-severity-1)
  - [Low severity](#low-severity-1)
- [Desktop client](#desktop-client)
  - [High severity](#high-severity-2)
  - [Medium severity](#medium-severity-2)
  - [Low severity](#low-severity-2)
- [WebUI](#webui)
  - [High severity](#high-severity-3)
  - [Medium severity](#medium-severity-3)
  - [Low severity](#low-severity-3)
- [Tooling and scripts](#tooling-and-scripts)
  - [High severity](#high-severity-4)
  - [Medium severity](#medium-severity-4)
  - [Low severity](#low-severity-4)

---

## Server / Core

### High severity

#### 1. `/control/*` admin plane unauthenticated when `AdminAuthMode != "TokenRequired"`

- **File:** `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (lines 91–104); `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (lines 164–213).
- **Issue:** `AuthorizeControlPlaneAsync` only enforces auth when `BindOnLan` is true AND `AdminAuthMode == "TokenRequired"`. With `BindOnLan=true` (the LAN exposure case the policy is meant to protect) and the default `AdminAuthMode = "Off"`, any non-local caller can hit `/control/status` (live session IDs, `ListenUrl`, telemetry), `POST /control/settings`, `/control/logs/server`, and operator testing endpoints.
- **Layer:** server/core
- **Severity:** high
- **Action:** Require an authenticated admin session for all `/control/*` routes (except `/control/pair`) whenever non-local; flip default `AdminAuthMode` to `TokenRequired` when LAN binding is enabled, or fail-fast at startup if LAN + `Off`.

#### 2. `AllowLegacyTokenAuth` defaults to `true`, accepting tokens via query string

- **File:** `src/core/ReelRoulette.Server/Hosting/ServerRuntimeOptions.cs` (line 14); `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (lines 144–146).
- **Issue:** Long-lived pairing tokens accepted in `?token=…` leak via browser history, proxies, `Referer`, and access logs.
- **Layer:** server/core
- **Severity:** high
- **Action:** Default to `false`; deprecate query token entirely; keep only cookie + `Authorization: Bearer` for header-only clients.

#### 3. No cross-writer coordination on `library.json`

- **File:** `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs` (e.g. lines 608, 648, 756, 896, 1135, 1304+ `SaveLibraryJsonAsync`); `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs` (e.g. line 1131 `SaveLibraryRoot`); `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (`PersistSourceStates`, lines 925–978).
- **Issue:** Three services independently `LoadLibraryRoot` → mutate → `SaveLibraryRoot` (or async equivalent) without a shared lock or atomic replace. Concurrent saves are last-writer-wins and silently drop favorites/tags/playback stats/refresh updates.
- **Layer:** server/core
- **Severity:** high
- **Action:** Centralize all library reads/writes behind one service with a single lock (or per-file `Mutex` / file lock); use temp-file + atomic rename for every save.

#### 4. Thumbnail path built from JSON-derived `itemId` without validation

- **File:** `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs` (`GetThumbnailPath`, line 221; callers at 1197, 1266, 1715).
- **Issue:** `Path.Combine(_thumbnailDir, $"{itemId}.jpg")`. While `itemId` is normally a server-generated GUID, `library.json` is treated as untrusted input elsewhere (parse-and-recover), and a hand-edited or imported file with `..` segments would write/delete files outside `_thumbnailDir`.
- **Layer:** server/core
- **Severity:** high (defense-in-depth)
- **Action:** Validate `itemId` against `^[A-Za-z0-9_-]+$` (or `Guid.TryParseExact`) and verify `Path.GetFullPath` stays under `_thumbnailDir`.

### Medium severity

#### 5. Pairing secret divergence between `ServerRuntimeOptions.PairingToken` and `WebRuntimeSettings.SharedToken`

- **File:** `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (lines 906–934 pair handler); `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs` (lines 340–347); `src/core/ReelRoulette.ServerApp/Program.cs` (`TryLaunchReplacementProcess`, lines 1280–1284, picks `SharedToken`).
- **Issue:** `/api/pair` validates only `runtimeOptions.PairingToken`, but the operator UI persists `WebRuntimeSettings.SharedToken` and the restart path passes `SharedToken` to the replacement child. After a restart the pair token can change without operator awareness; before restart, edits to `SharedToken` have no effect.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Drive pairing from one canonical persisted secret; sync at load and on update.

#### 6. `WebRuntimeSettings.AuthMode` is persisted but middleware ignores it

- **File:** `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs` (lines 346–347); `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (line 36 only reads `RequireAuth`).
- **Issue:** Operators who set `AuthMode = "Off"` may believe API auth is disabled while the middleware still enforces `RequireAuth`.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Either honor `AuthMode` in middleware/pairing or stop persisting/exposing the field.

#### 7. Non-constant-time comparison of secrets

- **File:** `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (lines 138, 146); `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (lines 1045–1057).
- **Issue:** `string.Equals(token, expectedToken, StringComparison.Ordinal)` allows timing differentiation.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Use `CryptographicOperations.FixedTimeEquals` over UTF-8 bytes (with length normalization).

#### 8. `RemoteIpAddress == null` treated as local

- **File:** `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (lines 149–155).
- **Issue:** Bypasses auth for ambiguous connections (e.g. broken proxy or forwarded-headers misconfiguration).
- **Layer:** server/core
- **Severity:** medium
- **Action:** Treat null as non-local; opt-in to forwarded-headers with a strict known-proxies allowlist where needed.

#### 9. `SameSite=None` allowed without `Secure`

- **File:** `src/core/ReelRoulette.Server/Hosting/PairingCookiePolicy.cs` (lines 17–44).
- **Issue:** Browsers reject `None` + non-Secure; weakens cross-site protections.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Force `Secure=true` whenever `SameSite=None`, or fail at startup.

#### 10. CORS hard-coded to HTTP only

- **File:** `src/core/ReelRoulette.Server/Hosting/DynamicCorsOriginRegistry.cs` (lines 131–146, 232–243); `src/core/ReelRoulette.Server/Hosting/ServerRuntimeOptions.cs` (lines 17–21).
- **Issue:** Origin normalization rejects `https:`; rebuilt LAN origins are always `http://…`. Breaks credentialed CORS for HTTPS frontends and steers operators toward downgrade-only deployments.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Allow `https` origins; rebuild scheme based on listener.

#### 11. `ServerMediaTokenStore` has no expiry/eviction

- **File:** `src/core/ReelRoulette.Server/Services/ServerMediaTokenStore.cs` (entire type).
- **Issue:** Tokens map paths for the lifetime of the process; unbounded growth and indefinite token validity.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Add TTL + LRU cap; tie token lifetime to playback session.

#### 12. `ServerLogService.Read` walks the entire log on every request

- **File:** `src/core/ReelRoulette.Server/Services/ServerLogService.cs` (lines 31–43).
- **Issue:** `File.ReadLines + Where + TakeLast` is O(file size) for `/control/logs/server`.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Tail from end with a reverse chunk reader, cap log size, or maintain a bounded in-memory ring.

#### 13. `LibraryOperationsService.LoadLibraryRoot` swallows all parse errors and returns empty

- **File:** `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs` (lines 1115–1128).
- **Issue:** Corrupt or transiently unreadable `library.json` is indistinguishable from an empty library; a subsequent save can overwrite the bad file with empty data.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Log at error, refuse to save when load failed, surface a degraded state.

#### 14. `LibraryPlaybackService.LoadItems` returns stale cache on parse failure without updating timestamp

- **File:** `src/core/ReelRoulette.Server/Services/LibraryPlaybackService.cs` (lines 415–419).
- **Issue:** Repeated failures leave clients on indefinitely stale data; `_cachedLibraryWriteUtc` already advanced means the failed parse will not be retried with new content.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Either clear cache on failure or record a "failed generation" so the next call re-parses.

#### 15. `LibraryPlaybackService._clientRandomizationStates` unbounded

- **File:** `src/core/ReelRoulette.Server/Services/LibraryPlaybackService.cs` (lines 19, 127–133).
- **Issue:** Per-`ClientId` state grows without eviction; high-cardinality or attacker-supplied IDs cause memory growth.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Cap size, LRU eviction, length validation on `ClientId`.

#### 16. Manual refresh ignores host shutdown

- **File:** `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs` (lines 171–193, `TryStartManual` passes `CancellationToken.None`).
- **Issue:** Manual runs continue reading/writing library + thumbnails during shutdown, racing the host stop.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Pass `IHostApplicationLifetime.ApplicationStopping` (linked with the run token).

#### 17. `ffmpeg` / `ffprobe` stderr not consumed

- **File:** `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs` (`TryExtractVideoFrameAtOffsetAsync`, lines 1580–1586; `GetVideoDurationAsync`, ~1976–1985; `VerifyFfmpegAsync`, ~2047–2049).
- **Issue:** `RedirectStandardError = true` but stderr reads are not awaited; a chatty child can fill the pipe and deadlock the pipeline.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Consume both pipes asynchronously to completion.

#### 18. Bootstrap `ItemId` ≠ canonical item id

- **File:** `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (lines 766–777).
- **Issue:** `_itemStates[path].Payload.ItemId = path` while `LibraryOperationsService` uses the JSON `id` GUID elsewhere — clients see two distinct identifiers for the same item across APIs.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Use `node["id"]` when present and fall back to path.

#### 19. `OperatorTestingService` mutations protected only by middleware policy

- **File:** `src/core/ReelRoulette.Server/Services/OperatorTestingService.cs` (entire); `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (lines 220–247, 249–266).
- **Issue:** The endpoints add their own `IsTestingControlAuthorized` gate, but it again only kicks in when `AdminAuthMode == "TokenRequired"`. Combined with finding 1, fault injection (`ForceApiUnavailable`, `ForceSseDisconnect`, version mismatch) is reachable from LAN with default settings.
- **Layer:** server/core
- **Severity:** medium (high together with finding 1)
- **Action:** Always require an authenticated admin session for testing/state mutation routes.

#### 20. Auth/secret fields in DTOs encourage credential leakage

- **File:** `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` (lines 155–158 `PairRequest.Token`, 278–286 `WebRuntimeSettingsSnapshot.SharedToken`, 288–292 `ControlRuntimeSettingsSnapshot.AdminSharedToken`).
- **Issue:** Any handler or logger that serializes these types can leak secrets; today `GET /control/settings` returns admin tokens to authorized callers.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Split read DTOs (token redacted) from write DTOs; never log; verify all serializers.

#### 21. `AppendClientLog` does not sanitize newlines/control chars

- **File:** `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs` (lines 1082–1100).
- **Issue:** Client-controlled `Message` written verbatim into `last.log` allows log injection and forged log lines.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Single-line escape control chars; cap length; allowlist `level`.

#### 22. `ImportSource` build of dictionary can throw on duplicate paths

- **File:** `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs` (lines 91–99).
- **Issue:** `ToDictionary(..., OrdinalIgnoreCase)` throws when a source has two items with the same `fullPath` (different casing or hand-edited duplicates), aborting import.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Use `TryAdd` / group with explicit duplicate handling and warn in response.

#### 23. Destructive duplicate cleanup persists a partial state if `SaveLibraryRoot` throws

- **File:** `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs` (`ApplyDuplicateSelection`, ~lines 925–958).
- **Issue:** Files may already be deleted but the JSON write fails; library now disagrees with disk.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Wrap save in try/catch and report partial-failure structured response; consider all-or-nothing.

#### 24. `PersistSettings` writes JSON non-atomically

- **File:** `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs` (lines 373–388).
- **Issue:** A crash mid-write can leave `core-settings.json` truncated.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Write to temp + atomic rename; pair with backup retention already implemented.

#### 25. `CoreSettingsService.LoadSettings` swallows all exceptions silently

- **File:** `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs` (lines 308–368).
- **Issue:** Disk/permission/corruption issues degrade silently to defaults.
- **Layer:** server/core
- **Severity:** medium
- **Action:** Log warnings; surface health status.

### Low severity

#### 26. `ApiTelemetryService` reverses queues per read

- **File:** `src/core/ReelRoulette.Server/Services/ApiTelemetryService.cs` (lines 56–75).
- **Issue:** `Queue.Reverse()` (O(n)) on every control status poll.
- **Layer:** server/core
- **Severity:** low
- **Action:** Use a ring buffer or pre-reversed storage.

#### 27. `ServerSessionStore.GetActiveSessions` LINQ under global lock

- **File:** `src/core/ReelRoulette.Server/Auth/ServerSessionStore.cs` (lines 72–90).
- **Issue:** `Where`, `OrderByDescending`, and `ToList` execute under the global session lock, prolonging contention when many sessions exist.
- **Layer:** server/core
- **Severity:** low
- **Action:** Snapshot under lock, then sort/project outside.

#### 28. Allowed-origins mutated on `ServerRuntimeOptions` from registry

- **File:** `src/core/ReelRoulette.Server/Hosting/DynamicCorsOriginRegistry.cs` (lines 123–148).
- **Issue:** `RebuildAllowedOrigins` replaces `ServerRuntimeOptions.CorsAllowedOrigins` while CORS uses `IsAllowed`; concurrent readers can see torn or inconsistent snapshots.
- **Layer:** server/core
- **Severity:** low
- **Action:** Keep allowed origins inside the registry; expose via interface.

#### 29. `LibraryPlaybackService` last-writer-wins for duplicate `fullPath`

- **File:** `src/core/ReelRoulette.Server/Services/LibraryPlaybackService.cs` (lines 255–262).
- **Issue:** `itemsByKey[item.FullPath] = item` silently keeps the last row when duplicates exist; filtering/eligibility can disagree with the rest of the pipeline.
- **Layer:** server/core
- **Severity:** low
- **Action:** Detect and log duplicates centrally when building the library index.

---

## Core (`ReelRoulette.Core`) and `ServerApp`

### High severity

#### 30. Restart/stop "in progress" flag is permanently set on success

- **File:** `src/core/ReelRoulette.ServerApp/Program.cs` (`RestartCoordinator.TryRestartAsync` / `TryStopAsync`, lines ~1171–1271).
- **Issue:** `_restartInProgress` is set to `1` and only cleared when `accepted == false`. After a successful restart-or-stop request the flag stays set forever; subsequent restart/stop calls always return "already in progress" until the process actually exits. If the scheduled stop is cancelled or fails, the second attempt returns the wrong message.
- **Layer:** core (server-app)
- **Severity:** high
- **Action:** Reset the flag in the scheduled `_lifetime.StopApplication` callback's failure path, or transition to a state machine (`Idle` / `Pending` / `Stopping` / `Failed`).

#### 31. Pairing token passed to child via environment

- **File:** `src/core/ReelRoulette.ServerApp/Program.cs` (`TryLaunchReplacementProcess`, lines 1334–1348).
- **Issue:** `CoreServer__PairingToken` is set on the child `ProcessStartInfo.Environment`; on Linux any local user can read `/proc/<pid>/environ`, exposing the shared/pairing secret.
- **Layer:** core (server-app)
- **Severity:** high (on multi-user hosts)
- **Action:** Pass via stdin or a short-lived `0600` file; or document and enforce single-user requirement.

#### 32. `NormalizeRelativeForDestinationRoot` does not strip `..` segments

- **File:** `src/core/ReelRoulette.Core/Storage/LibraryRelativePath.cs` (lines 93–121).
- **Issue:** Returned path can still contain `..`. If any caller does `Path.Combine(libraryRoot, relative)` without subsequent containment check, media or backup operations could resolve outside the library root (classic traversal). The other helper `TrySplitNormalizedPathSegments` rejects `..` (line 210), but the destination-root variant does not.
- **Layer:** core
- **Severity:** high (pending caller audit)
- **Action:** Reject `..` segments here too, or have every consumer call `Path.GetFullPath` and verify containment.

### Medium severity

#### 33. `bash -lc` script with interpolated paths for replacement launch

- **File:** `src/core/ReelRoulette.ServerApp/Program.cs` (lines 1312–1326).
- **Issue:** Interpolating `processPath`, `entryAssemblyPath`, host, and port into a single shell string is fragile (paths with `"` or backslashes break it) and a future change risks injection if any segment becomes attacker-controlled.
- **Layer:** core (server-app)
- **Severity:** medium
- **Action:** Re-implement port-wait in managed code (`TcpClient` poll) and `Process.Start` `dotnet` with `ArgumentList`; no shell.

#### 34. Eligible-set "signature" uses 32-bit `HashCode`

- **File:** `src/core/ReelRoulette.Core/Randomization/RandomSelectionEngineCore.cs` (lines 9–24).
- **Issue:** Two distinct eligible sets can collide and reuse stale shuffle state.
- **Layer:** core
- **Severity:** medium
- **Action:** Use SHA-256 over canonicalized ordered paths, or compare contents.

#### 35. `FilterSetBuilder` mixes case sensitivity for source IDs

- **File:** `src/core/ReelRoulette.Core/Filtering/FilterSetBuilder.cs` (lines 23–35).
- **Issue:** `enabledSourceIds` is ordinal (case-sensitive); `includedSourceIds` is `OrdinalIgnoreCase`. Mismatched casing can silently drop items from results.
- **Layer:** core
- **Severity:** medium
- **Action:** Use `OrdinalIgnoreCase` consistently.

#### 36. `WithoutAudioOnly` excludes videos with `HasAudio == null`

- **File:** `src/core/ReelRoulette.Core/Filtering/FilterSetBuilder.cs` (lines 48–57).
- **Issue:** Items whose audio metadata has not been scanned yet are filtered out, which often hides newly added videos.
- **Layer:** core
- **Severity:** medium
- **Action:** Define explicit semantics (treat `null` as eligible or as an "unknown" bucket); align with API and docs.

#### 37. `JsonFileStorageService.Load` swallows IO/JSON errors and returns defaults

- **File:** `src/core/ReelRoulette.Core/Storage/JsonFileStorageService.cs` (lines 24–51).
- **Issue:** Same masking risk as finding 13; can lead to a silent overwrite-with-defaults on the next save.
- **Layer:** core
- **Severity:** medium
- **Action:** Distinguish missing-file from corrupt; quarantine before defaulting.

#### 38. `Save` fallback can lose prior good file

- **File:** `src/core/ReelRoulette.Core/Storage/JsonFileStorageService.cs` (lines 63–74).
- **Issue:** If `File.Replace` is unsupported, the fallback `Copy` + `Delete` pattern lacks an explicit safe-rollback if interrupted.
- **Layer:** core
- **Severity:** medium
- **Action:** Always temp-write, keep prior file, then atomic rename.

#### 39. `TagMutationService.RenameTag` allows duplicate names

- **File:** `src/core/ReelRoulette.Core/Tags/TagMutationService.cs` (lines 5–28).
- **Issue:** No uniqueness check; renaming can produce two `CoreTag` rows with the same case-insensitive name.
- **Layer:** core
- **Severity:** medium
- **Action:** Reject or merge if the target name already exists in scope.

#### 40. Linux XDG `.desktop` `Exec=` over-quotes the path

- **File:** `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs` (lines 136–158).
- **Issue:** Embedded `"` in `Exec=` violates the Desktop Entry Spec; some session managers parse this incorrectly and skip the autostart entry.
- **Layer:** core (server-app)
- **Severity:** medium
- **Action:** Follow XDG `Exec` quoting (escape spaces and special chars per spec).

#### 41. `SelectSmartShuffle` linear scan per dequeue

- **File:** `src/core/ReelRoulette.Core/Randomization/RandomSelectionEngineCore.cs` (lines 91–104).
- **Issue:** O(n) `Any` per pick → O(n²) overall on large libraries.
- **Layer:** core
- **Severity:** medium (performance)
- **Action:** Maintain a `HashSet<string>` of eligible paths.

#### 42. Synchronous file hash on caller thread

- **File:** `src/core/ReelRoulette.Core/Fingerprints/FileFingerprintService.cs` (lines 16–30).
- **Issue:** `File.OpenRead` + sync hash blocks; can stall the request or UI when called on hot paths.
- **Layer:** core
- **Severity:** medium (performance)
- **Action:** Use async streaming hash with cancellation.

### Low severity

#### 43. Operator HTML page interpolates user input via `innerHTML`

- **File:** `src/core/ReelRoulette.ServerApp/Program.cs` (~lines 875–884, "save settings status").
- **Issue:** Injects `next.local` / `next.lan` strings into `innerHTML` without escaping. Operator-only context, but a footgun.
- **Layer:** core (server-app)
- **Severity:** low
- **Action:** Use `textContent` or escape.

#### 44. Linux autostart "enabled" detection is brittle

- **File:** `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs` (lines 44–51).
- **Issue:** Treats any file without `Hidden=true` as enabled; malformed entries may report enabled while not actually valid for the session manager.
- **Layer:** core (server-app)
- **Severity:** low
- **Action:** Parse `Hidden` / `X-GNOME-Autostart-enabled` explicitly; validate `Exec` exists.

---

## Desktop client

### High severity

_No standalone high-severity findings. The high-impact UI/behavioral risks compound with server findings 1, 2, 19, and 31._

### Medium severity

#### 45. `OpenFileLocation` (Windows) interpolates path into `explorer.exe` argument string

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs` (lines 4917–4927).
- **Issue:** `Arguments = $"/select,\"{path}\""` does not escape embedded `"`. A media file with a `"` in its name (reachable via stored library JSON or network shares with synthetic names) breaks parsing or alters behavior.
- **Layer:** desktop
- **Severity:** medium
- **Action:** Use `ProcessStartInfo.ArgumentList` with manual `/select,<full-path>` build, or `IShellExecute`-based reveal.

#### 46. SSE `data:` accumulator in `CoreServerApiClient` has no size cap

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/CoreServerApiClient.cs` (lines 540–584).
- **Issue:** A misbehaving or hostile server can stream an unbounded `data:` payload and cause OOM in the desktop client.
- **Layer:** desktop
- **Severity:** medium
- **Action:** Cap aggregated payload (e.g. 4 MB); on overflow, drop and reset `dataBuilder`.

#### 47. `UpdateLibraryPanel` cancels CTS without disposing

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs` (~lines 2313–2320).
- **Issue:** Rapid panel updates leak `CancellationTokenSource` instances and registrations until GC.
- **Layer:** desktop
- **Severity:** medium
- **Action:** `using` / `Dispose()` previous CTS after `Cancel`.

#### 48. `LibraryArchiveMigration` writes ZIP entries via sync IO on async path

- **File:** `src/clients/desktop/ReelRoulette.LibraryArchive/LibraryArchiveMigration.cs` (lines 331–344, 346 `WriteExportZipAsync`).
- **Issue:** `File.OpenRead` + `CopyTo` blocks the calling sync context; large libraries stall the UI thread when invoked from it.
- **Layer:** desktop
- **Severity:** medium
- **Action:** Use `FileOptions.Asynchronous` + `CopyToAsync(es, ct)`, or wrap entire export in `Task.Run`.

#### 49. `LogSanitizer` does not redact secrets

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/LogSanitizer.cs` (entire).
- **Issue:** Only path/tag/filename redaction; if any caller logs `Authorization`, `SharedToken`, query strings, or settings payloads, they reach `/api/logs/client`.
- **Layer:** desktop
- **Severity:** medium
- **Action:** Add patterns for bearer tokens, `*Token*=…`, query secrets.

#### 50. Library refresh hot path duplicates work and allocates large transient sets

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs` (~lines 2388–2430); `src/clients/desktop/ReelRoulette.DesktopApp/RandomSelectionEngine.cs` (~lines 57–66); `src/clients/desktop/ReelRoulette.DesktopApp/FilterService.cs` (~lines 27–36, 64–67).
- **Issue:** Per-call `.ToList()` + per-call `BuildItemMap` over the entire library; debounced panel refresh repeats this for large libraries.
- **Layer:** desktop
- **Severity:** medium (performance)
- **Action:** Cache filter snapshot keyed by filter generation; avoid per-call full copies.

#### 51. Trust of user-configured `_coreServerBaseUrl`

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs` (~7704–7707); `src/clients/desktop/ReelRoulette.DesktopApp/CoreServerApiClient.cs` (HTTP client uses default TLS settings).
- **Issue:** No host allowlist or pinning; LAN HTTP usage means a wrong URL or local attacker on that port is trusted as the API.
- **Layer:** desktop
- **Severity:** medium (environment-dependent)
- **Action:** Default to loopback; warn for non-`https` / non-loopback; document trust boundary.

### Low severity

#### 52. `ClientLogRelay.Log` is fire-and-forget without backpressure

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/ClientLogRelay.cs` (lines 28–61).
- **Issue:** Unbounded outbound HTTP work can queue under load and hold the process longer on exit.
- **Layer:** desktop
- **Severity:** low
- **Action:** Bounded channel with a single worker and shutdown cancellation.

#### 53. `DispatcherTimer`s not stopped on window close

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs` (`OnClosed`, ~1147–1202).
- **Issue:** `_updateLibraryPanelDebounceTimer`, `_libraryGridResizeDebounceTimer`, and `_volumeSliderDebounceTimer` are never stopped or unsubscribed on close.
- **Layer:** desktop
- **Severity:** low
- **Action:** Stop, unsubscribe `Tick`, and null references in `OnClosed`.

#### 54. `AppDataManager` first-access logs full data path

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/AppDataManager.cs` (~lines 21–24).
- **Issue:** Full resolved app-data path reaches `ClientLogRelay` (relay only sanitizes message body).
- **Layer:** desktop
- **Severity:** low
- **Action:** Redact or hash before relaying.

#### 55. `FingerprintCoordinator` logs raw `itemPath`

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/FingerprintCoordinator.cs` (~lines 199–203).
- **Issue:** Bypasses the path redaction applied elsewhere; full media paths can reach the log relay.
- **Layer:** desktop
- **Severity:** low
- **Action:** Route through `LogSanitizer.Sanitize` or log a stable item id.

#### 56. Logs include `CoreClientId` / `CoreSessionId` verbatim

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs` (~line 7745).
- **Issue:** Sensitive correlation identifiers exposed in clear text.
- **Layer:** desktop
- **Severity:** low
- **Action:** Log truncated hashes only.

#### 57. `CoreServerApiClient` POSTs return only bool/null

- **File:** `src/clients/desktop/ReelRoulette.DesktopApp/CoreServerApiClient.cs` (~lines 141–200).
- **Issue:** Callers cannot distinguish transport errors, auth failures, and conflicts; UI may believe state changes applied.
- **Layer:** desktop
- **Severity:** low
- **Action:** Return structured result so the UI can reconcile transport vs server-side failures.

---

## WebUI

### High severity

#### 58. Static `pairToken` shipped as a public asset

- **File:** `src/clients/web/ReelRoulette.WebUI/public/runtime-config.json` (line 4).
- **Issue:** The repo ships `"pairToken": "reelroulette-dev-token"` in a file fetched anonymously by the browser at `/runtime-config.json`. The same default appears in `tools/scripts/run-server.ps1`, `tools/scripts/run-server-rebuild.ps1`, and `src/core/ReelRoulette.ServerApp/appsettings.json`. If the operator forgets to overwrite, anyone reaching `/runtime-config.json` (or the LAN host) gets the API pair token, and the WebUI auto-pairs (`src/clients/web/ReelRoulette.WebUI/src/app.js` line 3112). The default propagates to packaged builds via `tools/scripts/publish-web.ps1` (line 47, copies `dist/*` verbatim).
- **Layer:** WebUI
- **Severity:** high
- **Action:** Remove `pairToken` from the committed file; rely on user-entered token; have `verify-build-output.mjs` reject any `pairToken` in `dist/runtime-config.json` for production builds.

#### 59. `renderStartupError` renders error message via `innerHTML`

- **File:** `src/clients/web/ReelRoulette.WebUI/src/shell.ts` (lines 145–158).
- **Issue:** `${message}` is interpolated into HTML. The message currently comes from `error.message` in `loadRuntimeConfig` (`src/main.ts` lines 43–45) and is benign today, but `parseRuntimeConfig` and the fetch result body could in the future include attacker-controlled values (e.g. proxy responses), and this is a classic DOM XSS sink.
- **Layer:** WebUI
- **Severity:** high (defense-in-depth, easy to weaponize on regression)
- **Action:** Use `textContent` for the dynamic message; keep the static template separate.

### Medium severity

#### 60. `pairToken` is a first-class field in the runtime config schema

- **File:** `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts` (lines 56–62); `src/clients/web/ReelRoulette.WebUI/src/types/runtimeConfig.ts`; `src/clients/web/ReelRoulette.WebUI/public/runtime-config.json`.
- **Issue:** Encourages operators to embed pairing secrets in a file the browser fetches anonymously.
- **Layer:** WebUI
- **Severity:** medium
- **Action:** Treat pairing tokens as one-time user input (session/cookie flow); remove from runtime config.

#### 61. `authBootstrap` does not catch errors from `pairWithToken` / `getVersionJson`

- **File:** `src/clients/web/ReelRoulette.WebUI/src/auth/authBootstrap.ts` (lines 91–108).
- **Issue:** These throws bubble out instead of producing the consistent `AuthBootstrapResult { authorized: false, message }` shape used elsewhere.
- **Layer:** WebUI
- **Severity:** medium
- **Action:** Wrap in try/catch and map to a typed result.

#### 62. SSE `resyncRequired` handling not serialized

- **File:** `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts` (lines 160–165).
- **Issue:** Multiple events fire `void handleResyncRequired(...)` concurrently; overlapping authoritative requeries leave UI/connection state inconsistent.
- **Layer:** WebUI
- **Severity:** medium
- **Action:** Coalesce or serialize via in-flight promise or short debounce.

#### 63. `clientId` / `sessionId` in SSE URL query parameters

- **File:** `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts` (line 131); `src/clients/web/ReelRoulette.WebUI/src/events/eventEnvelope.ts` (lines 12–34).
- **Issue:** Long-lived identifiers leak via access logs, proxies, and browser history.
- **Layer:** WebUI
- **Severity:** medium
- **Action:** Move to cookie (already `withCredentials: true`) or a short-lived signed URL.

#### 64. `clientId` / `sessionId` persisted to `localStorage` / `sessionStorage`

- **File:** `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts` (lines 32–59).
- **Issue:** Any XSS in the origin can read them.
- **Layer:** WebUI
- **Severity:** medium
- **Action:** Keep in memory unless persistence is mandatory; pair with strong CSP.

#### 65. `verify-build-output.mjs` validation is weaker than `parseRuntimeConfig`

- **File:** `src/clients/web/ReelRoulette.WebUI/scripts/verify-build-output.mjs` (lines 42–52).
- **Issue:** Passes builds with non-URL strings or paths in `apiBaseUrl` that the runtime parser would reject.
- **Layer:** WebUI
- **Severity:** medium
- **Action:** Reuse `parseRuntimeConfig` (or a shared validator) in the verifier.

### Low severity

#### 66. `response.json()` not guarded by content-type / parse error handling

- **File:** `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts` (lines 109, 124, 155); `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts` (lines 83–84).
- **Issue:** Error bodies that are HTML or empty can throw or yield misleading parsed shapes.
- **Layer:** WebUI
- **Severity:** low
- **Action:** Check `Content-Type` and wrap with try/catch.

#### 67. Service worker has no offline shell

- **File:** `src/clients/web/ReelRoulette.WebUI/public/sw.js` (lines 11–13).
- **Issue:** Fetch handler always delegates to `fetch(event.request)`; navigation and assets fail offline (by design per comment, but a real operational limitation for installed PWAs).
- **Layer:** WebUI
- **Severity:** low
- **Action:** Minimal cache strategy if offline-installed PWA matters; otherwise document.

---

## Tooling and scripts

### High severity

#### 68. `curl | bash` from a moving `main` branch

- **File:** `tools/scripts/install-linux-from-github.sh` (lines 4, 7–8 documented usage).
- **Issue:** Documented install pattern fetches the install script from a non-pinned branch; combined with finding 69 it is a high-risk supply-chain vector.
- **Layer:** tooling
- **Severity:** high
- **Action:** Pin to a specific tag/commit in docs; recommend "download then inspect then run."

#### 69. No checksum or signature verification of GitHub release assets

- **File:** `tools/scripts/install-linux-from-github.sh` (lines 90–124, 130–145).
- **Issue:** Both AppImage and tarball paths download and execute with TLS only. A compromised release/account/CDN yields arbitrary code execution.
- **Layer:** tooling
- **Severity:** high
- **Action:** Publish per-asset SHA-256 (or Sigstore) and verify before install; fail closed.

#### 70. `fetch-native-deps.ps1` pulls `ffmpeg-release-essentials.zip` from a rolling URL

- **File:** `tools/scripts/fetch-native-deps.ps1` (lines 97–104).
- **Issue:** Rolling URL means builds are not reproducible; an upstream change immediately affects all CI/local runs and the produced installer.
- **Layer:** tooling
- **Severity:** high (supply chain / reproducibility)
- **Action:** Pin to a versioned URL; record the expected SHA-256 in the repo and verify.

### Medium severity

#### 71. FFmpeg ZIP and `.sha256` come from the same origin

- **File:** `tools/scripts/fetch-native-deps.ps1` (lines 102–107, 133–137).
- **Issue:** A compromise of the origin/CDN serves matching ZIP + hash; verification is non-binding.
- **Layer:** tooling
- **Severity:** medium
- **Action:** Pin hash in-repo or use an independent hash channel.

#### 72. `-Repo owner/repo` in the installer accepts arbitrary GitHub repos

- **File:** `tools/scripts/install-linux-from-github.sh` (lines 30–35, 90–92).
- **Issue:** Typo or social engineering can install attacker binaries.
- **Layer:** tooling
- **Severity:** medium
- **Action:** Default-only canonical repo; require an explicit `--allow-foreign-repo` flag and prominent warning.

#### 73. Tarball top-level inferred from `head -n1` of `tar -tzf`

- **File:** `tools/scripts/install-linux-from-github.sh` (lines 133–145).
- **Issue:** `./` entries or non-directory first members yield a wrong `TOP` / `VERSION` and a broken or unsafe install path.
- **Layer:** tooling
- **Severity:** medium
- **Action:** Parse with a deterministic rule (only depth-1 directories; reject ambiguous layouts) or include a manifest in the tarball.

#### 74. `run-server-rebuild.ps1` runs `npm run build` without `npm install`

- **File:** `tools/scripts/run-server-rebuild.ps1` (lines 28–34).
- **Issue:** Inconsistent with `verify-web-deploy.ps1` and `publish-web.ps1`; clean clones or stale `node_modules` produce broken or stale builds.
- **Layer:** tooling
- **Severity:** medium
- **Action:** Add an install step gated by `-SkipInstall`.

#### 75. Full release on Linux rebuilds WebUI twice

- **File:** `tools/scripts/full-release.ps1` (lines 117–124) → `tools/scripts/package-serverapp-linux-appimage.sh` (lines 48–51) and the portable script.
- **Issue:** Both packagers run `npm install` + `npm run build` for the same WebUI tree; doubles network/CPU/disk and risks divergence between the two artifacts.
- **Layer:** tooling
- **Severity:** medium (perf + correctness)
- **Action:** Build WebUI once at the top level and pass the artifact path; or expose a `--web-prebuilt` switch.

#### 76. `run-server.ps1` echoes the dev pair token to console

- **File:** `tools/scripts/run-server.ps1` (lines 41–42).
- **Issue:** Token visible in shells, transcripts, and screenshots; combined with the static `reelroulette-dev-token` default this normalizes a known secret.
- **Layer:** tooling
- **Severity:** medium
- **Action:** Mask unless `-ShowToken` is passed; read from env/secret store.

### Low severity

#### 77. Inno Setup scripts omit `PrivilegesRequired`

- **File:** `tools/installer/ReelRoulette.Desktop.iss` (lines 15–30); `tools/installer/ReelRoulette.ServerApp.iss` (lines 15–30).
- **Issue:** Behavior depends on Inno defaults and can surprise CI/enterprise installs expecting explicit elevation or per-user installs.
- **Layer:** tooling
- **Severity:** low
- **Action:** Set explicitly to match `{autopf}` expectations.

#### 78. `[Files]` uses `ignoreversion`

- **File:** `tools/installer/ReelRoulette.Desktop.iss` (line ~35–36); `tools/installer/ReelRoulette.ServerApp.iss` (line ~35–36).
- **Issue:** Can mask certain upgrade/versioning mistakes (same filename, different content) during updates.
- **Layer:** tooling
- **Severity:** low
- **Action:** Drop unless required; rely on installer version rules.
