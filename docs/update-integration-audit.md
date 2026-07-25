# Update Integration Audit (Velopack Self-Update)

Report-only investigation for adding automatic self-update to **ReelRoulette.ServerApp** and **ReelRoulette.DesktopApp** via Velopack. No application code, packages, contracts, or tooling were changed to produce this document.

**Fixed behavior this report maps against:**

- Download updates fully, then apply-and-restart; never restart on an unconfirmed package.
- **Server:** automatic check, download, apply, restart; headless-capable.
- **Desktop:** same automatic flow, plus a user-visible notice before restart.
- **Stable vs dev channel:** persisted setting per app; server toggle in operator UI (OpenAPI/contract change); desktop toggle in desktop settings UI.
- **Out of scope for this slice:** SSE update-status events; WebUI update toggle (WebUI generated types still change when the shared contract changes).
- **Reference:** PantryDesk `UpdateService` (see Section A note — not present in this repository).

---

## Section A — Velopack UpdateManager mechanics for a long-running server

### PantryDesk reference (not in repo)

**PantryDesk `UpdateService` source code is not in the ReelRoulette repository**, and no prior transcript in this workspace contains its implementation. The canonical Velopack 1.2.0 API surface used here is documented in the **Velopack 1.2.0** NuGet package (`Velopack.xml`) and [Velopack docs](https://docs.velopack.io/reference/cs/Velopack/UpdateManager).

The usual integration pattern (as described in Velopack docs and typical PantryDesk-style services) is:

1. `CheckForUpdatesAsync()` → `UpdateInfo` or `null`
2. `DownloadUpdatesAsync(updateInfo, …)` → packages on disk
3. `ApplyUpdatesAndRestart(updateInfo.TargetFullRelease, restartArgs)` (or `WaitExitThenApplyUpdates` for graceful shutdown)

**Where ReelRoulette must diverge from a single-app PantryDesk-style service:**

| Topic | Typical PantryDesk-style assumption | ReelRoulette requirement |
|--------|-------------------------------------|---------------------------|
| Host count | One app, one feed | **Two** hosts (server + desktop), each with its own `UpdateService` instance |
| Channel naming | Often `VelopackRuntimeInfo.GetOsShortName()` (`win`, `linux`, …) | **`{os}-{component}[-dev]`** (e.g. `linux-server-dev`, `win-desktop`) baked at pack time in `release.yml` |
| Feed layout | Single update base URL | B2 prefix **`reelroulette/{server\|desktop}[-dev]`** plus channel-specific manifest **`releases.{channel}.json`** |
| Server UX | May prompt or stay silent | **Fully automatic**, no operator/WebUI update UI in this slice |
| Desktop UX | May match server | **Automatic** plus **restart explanation** dialog/notice |
| Channel toggle | Optional | **Persisted**; server via **`/control/settings`** contract; desktop via **`desktop-settings.json`** |
| Dev/stable crossover | N/A | Requires **`ExplicitChannel`** + **`AllowVersionDowngrade`** when switching tiers |
| Server restart | Process restart only | Must reconcile with existing **`RestartCoordinator`** (Section B) |
| Core layer | N/A | **No Velopack in `ReelRoulette.Core`** — dependency stays in each host project |

### `CheckForUpdatesAsync`, `DownloadUpdatesAsync`, `ApplyUpdatesAndRestart`

From **Velopack 1.2.0** XML documentation:

**`CheckForUpdatesAsync`:** Returns `null` if no update; otherwise an `UpdateInfo` with the latest release and optional deltas.

**`DownloadUpdatesAsync`:** Downloads the given `UpdateInfo` to the local app packages directory; may use deltas or fall back to full packages; acquires a **global update lock** (concurrent update operations can fail).

**`ApplyUpdatesAndRestart`:** Exits the app **immediately**, applies updates, then **optionally relaunches** with `restartArgs`. Cleanup/state save must happen **before** this call. The user may be prompted if the update needs extra frameworks (relevant mainly on desktop; headless server behavior is not documented in-repo).

**Download-then-apply ordering (required by product decision):** Matches Velopack’s documented three-step flow and satisfies “never restart on an unconfirmed package” when `ApplyUpdatesAndRestart` is only called **after** `DownloadUpdatesAsync` completes successfully on a concrete `UpdateInfo` / `TargetFullRelease`.

### Download while the server is serving

**Inference (not empirically verified in ReelRoulette):** `CheckForUpdatesAsync` / `DownloadUpdatesAsync` perform network I/O and disk writes under Velopack’s update lock. They do not, by themselves, stop Kestrel. In-flight HTTP requests should continue unless the implementation blocks the thread pool extensively or the process exits.

**Cannot confirm from this repo alone:** Whether delta preparation or update lock contention causes noticeable latency under load. **Would confirm with:** load test during `DownloadUpdatesAsync` on a packaged server build.

### `ApplyUpdatesAndRestart` on a headless server

From Velopack docs/XML:

- The **current process exits immediately**; Velopack’s updater applies packages and may **relaunch** the main executable.
- **`restartArgs`** are passed to the relaunched app (constructor param on `ApplyUpdatesAndRestart`).

**Not determined from Velopack docs + ReelRoulette code alone:**

- Whether the relaunched ServerApp receives the same **environment overrides** that `RestartCoordinator.TryLaunchReplacementProcess` sets today (`CoreServer__ListenUrl`, `CoreServer__BindOnLan`, `CoreServer__RequireAuth`, `CoreServer__PairingToken`, `CoreServer__TrustLocalhost`).
- Whether Kestrel **re-binds** to the same URL after Velopack restart.

**ReelRoulette startup today** loads listen/auth from persisted **`core-settings.json`** via `CoreSettingsService` before `UseUrls` (see `Program.cs` lines 47–55, 1391–1405). A Velopack relaunch with **empty `restartArgs`** likely still binds correctly **if** persisted settings remain intact — but **`dotnet`-hosted dev runs** and **non-default listen URLs supplied only via env** at prior launch are risk areas.

**Would confirm with:** packaged ServerApp update drill on Linux and Windows, logging `Environment.ProcessPath`, argv, and effective `ListenUrl` after relaunch.

**Alternative API (Section B):** `WaitExitThenApplyUpdates` launches the updater, waits up to **60 seconds** for graceful exit, then applies and optionally restarts — better aligned with tray teardown than `ApplyUpdatesAndRestart`.

### `ExplicitChannel`, feed URL, and ReelRoulette `CreateManager` inputs

**Published layout** (from `.github/workflows/release.yml`):

```134:141:.github/workflows/release.yml
                channel="${os_key}-${component}${channel_suffix}"
                prefix="reelroulette/${component}${tier_suffix}"
                ...
                feed_urls+=("${PUBLIC_FEED_BASE}/${prefix}/releases.${channel}.json")
```

- **`PUBLIC_FEED_BASE`:** `https://f004.backblazeb2.com/file/hugginsindustries-releases`
- **Stable tier:** `prefix = reelroulette/server` | `reelroulette/desktop`; channels e.g. `linux-server`, `win-desktop`
- **Dev tier:** `prefix = reelroulette/server-dev` | `reelroulette/desktop-dev`; channels e.g. `linux-server-dev`, `win-desktop-dev`

Velopack **`UpdateManager` constructor** (1.2.0): first argument is **`urlOrPath`** — “URL or file path to the **releases feed**” (directory/base), not necessarily the full `releases.{channel}.json` filename; channel selection uses packaged default and/or **`UpdateOptions.ExplicitChannel`**.

**Each host’s factory (conceptual `CreateManager`) should take:**

| Input | Server | Desktop |
|--------|--------|---------|
| `component` | `"server"` | `"desktop"` |
| `osKey` | `"linux"` or `"win"` from runtime OS | same |
| `devChannelEnabled` | from **`core-settings.json`** / control settings (future field) | from **`desktop-settings.json`** (future field) |
| Derived **`tierSuffix`** | `""` or `"-dev"` | same |
| Derived **`ExplicitChannel`** | `{osKey}-server{tierSuffix}` with tierSuffix including `-dev` when dev enabled | `{osKey}-desktop{tierSuffix}` |
| Derived **feed base URL** | `{PUBLIC_FEED_BASE}/reelroulette/server{tierSuffix}` | `{PUBLIC_FEED_BASE}/reelroulette/desktop{tierSuffix}` |
| **`UpdateOptions`** | `ExplicitChannel` set; `AllowVersionDowngrade` per toggle rules below | same |

**Versus PantryDesk:** PantryDesk-style code that sets channel from **`GetOsShortName()` only** is **insufficient** here; ReelRoulette must incorporate **`component`** and optional **`-dev`** suffix in both **channel name** and **B2 prefix**.

When **`devChannelEnabled` changes**, the implementation must **recreate** `UpdateManager` (or equivalent) with the new **prefix + ExplicitChannel** pair; toggling channel alone without changing the feed base URL would point at the wrong manifest tree.

### `AllowVersionDowngrade`

From Velopack **`UpdateOptions`** (1.2.0): when `true`, `CheckForUpdatesAsync` may return a target **lower than** the installed version, or support **lateral** moves when combined with **`ExplicitChannel`**. Auto-apply-on-startup **does not** apply downgrades; explicit **`ApplyUpdatesAndRestart`** (after download) is required.

**Needed for ReelRoulette stable ↔ dev toggle?** **Yes, when dev and stable version numbers cross** (documented Velopack channel-switch scenario). Recommendation for implementation: set **`AllowVersionDowngrade = true`** whenever the persisted dev-channel toggle can switch the effective **`ExplicitChannel`** / feed prefix between stable and dev tiers; still use **download-then-apply** before restart.

---

## Section B — Server restart reconciliation

### `EnableSelfRestart` configuration path

```30:34:src/core/ReelRoulette.ServerApp/appsettings.json
  "ServerApp": {
    "WebUiStaticRootPath": "",
    "EnableSelfRestart": true,
    "OperatorUiPath": "/operator"
  }
```

```1127:1130:src/core/ReelRoulette.ServerApp/Program.cs
file sealed class ServerAppOptions
{
    ...
    public bool EnableSelfRestart { get; set; } = true;
```

Tray restart passes the flag into the coordinator:

```201:205:src/core/ReelRoulette.ServerApp/Program.cs
                onRestart: async cancellationToken =>
                {
                    var coordinator = app.Services.GetRequiredService<RestartCoordinator>();
                    var result = await coordinator.TryRestartAsync("tray-menu-restart", serverAppOptions.EnableSelfRestart, cancellationToken);
```

Operator **`POST /control/restart`** (`MapRestartEndpoints`):

```1000:1007:src/core/ReelRoulette.ServerApp/Program.cs
    app.MapPost("/control/restart", async (HttpContext context, RestartCoordinator restarter) =>
    {
        var result = await restarter.TryRestartAsync("operator-requested", options.EnableSelfRestart, context.RequestAborted);
        return result.Accepted
            ? Results.Ok(result)
            : Results.Json(result, statusCode: StatusCodes.Status409Conflict);
    });
```

When **`EnableSelfRestart` is false**, `TryRestartAsync` still stops the app but **does not** register `ApplicationStopped` replacement launch (replacement only registered inside `if (enableSelfRestart)`).

### `RestartCoordinator` and `TryLaunchReplacementProcess` (full)

```1155:1369:src/core/ReelRoulette.ServerApp/Program.cs
file sealed class RestartCoordinator
{
    private readonly ILogger<RestartCoordinator> _logger;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly CoreSettingsService _settings;
    private readonly ServerRuntimeOptions _runtimeOptions;
    private int _restartInProgress;

    public RestartCoordinator(
        ILogger<RestartCoordinator> logger,
        IHostApplicationLifetime lifetime,
        CoreSettingsService settings,
        ServerRuntimeOptions runtimeOptions)
    {
        _logger = logger;
        _lifetime = lifetime;
        _settings = settings;
        _runtimeOptions = runtimeOptions;
    }

    public async Task<RestartResult> TryRestartAsync(string reason, bool enableSelfRestart, CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _restartInProgress, 1) == 1)
        {
            return new RestartResult(false, "Restart already in progress.");
        }

        var accepted = false;
        try
        {
            _logger.LogInformation("Server restart requested ({Reason}).", reason);
            if (enableSelfRestart)
            {
                // Launch the replacement only after we have fully stopped listening, otherwise the
                // replacement process can race and exit with "address already in use" (observed on Linux).
                _lifetime.ApplicationStopped.Register(() =>
                {
                    if (TryLaunchReplacementProcess(out var launchMessage))
                    {
                        _logger.LogInformation("Replacement server process launch succeeded ({Message}).", launchMessage);
                    }
                    else
                    {
                        _logger.LogWarning("Replacement server process launch failed; restart will behave like stop-only.");
                    }
                });
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                }
                finally
                {
                    _lifetime.StopApplication();
                }
            }, CancellationToken.None);

            accepted = true;
            return new RestartResult(true, "Restart scheduled.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Restart request failed before scheduling shutdown.");
            return new RestartResult(false, "Restart failed before scheduling.");
        }
        finally
        {
            if (!accepted)
            {
                Interlocked.Exchange(ref _restartInProgress, 0);
            }
        }
    }

    public async Task<RestartResult> TryStopAsync(string reason, CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _restartInProgress, 1) == 1)
        {
            return new RestartResult(false, "A lifecycle operation is already in progress.");
        }

        var accepted = false;
        try
        {
            _logger.LogInformation("Server stop requested ({Reason}).", reason);
            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(300), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                }
                finally
                {
                    _lifetime.StopApplication();
                }
            }, CancellationToken.None);

            accepted = true;
            return new RestartResult(true, "Stop scheduled.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Stop request failed before scheduling shutdown.");
            return new RestartResult(false, "Stop failed before scheduling.");
        }
        finally
        {
            if (!accepted)
            {
                Interlocked.Exchange(ref _restartInProgress, 0);
            }
        }
    }

    private bool TryLaunchReplacementProcess(out string message)
    {
        message = "not-started";
        try
        {
            var webRuntime = _settings.GetWebRuntimeSettings();
            var effectiveListenUrl = ServerAppRuntimeHelpers.BuildListenUrlFromWebRuntime(webRuntime, _runtimeOptions.ListenUrl);
            var requireAuth = !string.Equals(webRuntime.AuthMode, "Off", StringComparison.OrdinalIgnoreCase);
            var pairingToken = requireAuth
                ? (string.IsNullOrWhiteSpace(webRuntime.SharedToken) ? _runtimeOptions.PairingToken : webRuntime.SharedToken!.Trim())
                : string.Empty;

            var processPath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(processPath))
            {
                message = "process-path-unavailable";
                return false;
            }

            string fileName;
            string arguments;
            if (IsDotnetHostExecutable(processPath))
            {
                var entryAssemblyPath = Assembly.GetEntryAssembly()?.Location;
                if (string.IsNullOrWhiteSpace(entryAssemblyPath) || !File.Exists(entryAssemblyPath))
                {
                    message = "entry-assembly-path-unavailable";
                    return false;
                }

                // When running via `dotnet ...dll`, Linux can race: we start the replacement before the
                // current process releases its listen port, and the replacement immediately exits.
                // Wait until the listen port is actually free before launching the replacement.
                if (OperatingSystem.IsWindows())
                {
                    fileName = processPath;
                    arguments = $"\"{entryAssemblyPath}\"";
                }
                else
                {
                    var waitHost = "127.0.0.1";
                    var waitPort = 45123;
                    if (Uri.TryCreate(effectiveListenUrl, UriKind.Absolute, out var listenUri))
                    {
                        waitPort = listenUri.Port > 0 ? listenUri.Port : waitPort;
                        waitHost = listenUri.Host is "0.0.0.0" or "::" ? "127.0.0.1" : listenUri.Host;
                    }

                    fileName = "/bin/bash";
                    arguments =
                        "-lc " +
                        $"\"for i in {{1..80}}; do (echo > /dev/tcp/{waitHost}/{waitPort}) >/dev/null 2>&1 && sleep 0.1 || break; done; exec \\\"{processPath}\\\" \\\"{entryAssemblyPath}\\\"\"";
                }
            }
            else
            {
                fileName = processPath;
                arguments = string.Empty;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = Environment.CurrentDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                Environment =
                {
                    ["CoreServer__ListenUrl"] = effectiveListenUrl,
                    ["CoreServer__BindOnLan"] = webRuntime.BindOnLan ? "true" : "false",
                    ["CoreServer__RequireAuth"] = requireAuth ? "true" : "false",
                    ["CoreServer__PairingToken"] = pairingToken,
                    ["CoreServer__TrustLocalhost"] = _runtimeOptions.TrustLocalhost ? "true" : "false"
                }
            });

            message = "replacement-process-started";
            return true;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            return false;
        }
    }

    private static bool IsDotnetHostExecutable(string processPath)
    {
        var name = Path.GetFileNameWithoutExtension(processPath);
        return string.Equals(name, "dotnet", StringComparison.OrdinalIgnoreCase);
    }
}
```

**Behavior summary:** Schedule stop → on **`ApplicationStopped`**, spawn a **new OS process** (same Velopack entry executable or `dotnet` + DLL with Linux port-wait bash wrapper) with **explicit CoreServer__* environment** — **not** Velopack’s updater.

### Interaction with Velopack apply-and-restart — options and risks

**Option 1 — Velopack `ApplyUpdatesAndRestart` only (bypass `RestartCoordinator`)**

- **Pros:** Single relaunch path; Velopack applies staged packages correctly.
- **Risks:**
  - **Skips** `ApplicationStopping` tray teardown sequence (Section B below) unless update code calls `hostUi.StopAsync` first.
  - **Immediate exit** may abort in-flight requests without drain.
  - **Double launch** if code also calls `TryRestartAsync` or registers `ApplicationStopped` replacement.
  - **Listen URL / auth env** may differ from coordinator’s `Process.Start` env unless replicated in `restartArgs` or relied entirely on `core-settings.json`.
  - **Port bind race** on Linux if updater relaunches before port release (coordinator explicitly waits on `/dev/tcp` for `dotnet` runs).

**Option 2 — Download via Velopack, then route “restart” through `RestartCoordinator.TryRestartAsync`**

- **Pros:** Reuses port-wait and **CoreServer__*** env injection; honors existing operator/tray semantics.
- **Risks:**
  - **`TryLaunchReplacementProcess` starts the same version** — it does **not** apply downloaded Velopack packages. **Update would not take effect** unless something else applies packages first.
  - **Not viable** unless paired with **`WaitExitThenApplyUpdates`** or apply-before-stop flow.

**Option 3 — `WaitExitThenApplyUpdates` after graceful shutdown**

- **Pros:** Updater waits for exit; can run **`ApplicationStopping`** tray stop and `StopApplication()` first; matches “download fully, then apply.”
- **Risks:**
  - **60-second** updater wait timeout if shutdown hangs (DBus/Avalonia tray on Linux).
  - Must **not** also register `TryLaunchReplacementProcess` on the same stop (double relaunch).
  - **`restartArgs`** must still be chosen for listen/auth parity.

**Option 4 — Apply in Velopack hook / external updater with manual stop only**

- **Pros:** Clear separation.
- **Risks:** More moving parts; easy to mis-order relative to `VelopackApp.Build().Run()` hook entry at top of `Program.cs`.

**Implementation must choose** among these; this audit does not pick one.

### `ApplicationStopping` / tray-host teardown

```103:125:src/core/ReelRoulette.ServerApp/Program.cs
        app.Lifetime.ApplicationStopping.Register(() =>
        {
            // Complete tray/DBus teardown before the web host finishes stopping. Fire-and-forget StopAsync races
            // Avalonia shutdown and can yield unhandled TaskCanceledException and non-zero exit on Linux.
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(45));
                hostUi.StopAsync(cts.Token).GetAwaiter().GetResult();
            }
            ...
            app.Logger.LogInformation("ReelRoulette.ServerApp is shutting down.");
        });
```

**`ApplyUpdatesAndRestart`:** Documented to exit **immediately** — likely **bypasses** orderly `ApplicationStopping` unless the update service triggers **`IHostApplicationLifetime.StopApplication()`** and waits for shutdown **before** calling apply (or uses **`WaitExitThenApplyUpdates`** instead).

**`RestartCoordinator` path:** Calls `StopApplication()` → should run **`ApplicationStopping`** handlers, then **`ApplicationStopped`** → replacement **`Process.Start`**.

---

## Section C — Settings plumbing and the contract change

### OpenAPI: `/control/settings` (GET and POST)

```188:238:shared/api/openapi.yaml
  /control/settings:
    get:
      summary: Get control-plane settings
      operationId: getControlSettings
      responses:
        "200":
          description: Control settings
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ControlRuntimeSettingsSnapshot"
        ...
    post:
      summary: Apply control-plane settings
      operationId: postControlSettings
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ControlRuntimeSettingsSnapshot"
      responses:
        "200":
          description: Settings apply result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ControlSettingsApplyResponse"
        ...
```

**Schema `ControlRuntimeSettingsSnapshot` today:**

```1424:1436:shared/api/openapi.yaml
    ControlRuntimeSettingsSnapshot:
      type: object
      required:
        - adminAuthMode
      properties:
        adminAuthMode:
          type: string
          enum:
            - Off
            - TokenRequired
        adminSharedToken:
          type: string
          nullable: true
```

### Handlers

```194:207:src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs
        app.MapGet("/control/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetControlRuntimeSettings());
        });

        app.MapPost("/control/settings", (ControlRuntimeSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            var (appliedSettings, applyResult) = settings.UpdateControlRuntimeSettings(snapshot);
            return Results.Ok(new
            {
                settings = appliedSettings,
                result = applyResult
            });
        });
```

### C# contract type

```300:304:src/core/ReelRoulette.Server/Contracts/ApiContracts.cs
public sealed class ControlRuntimeSettingsSnapshot
{
    public string AdminAuthMode { get; set; } = "Off";
    public string? AdminSharedToken { get; set; }
}
```

### `CoreSettingsService`: load, persist, runtime effect

**Path:** `%ApplicationData%/ReelRoulette/core-settings.json` (see constructor lines 35–38 in `CoreSettingsService.cs`).

**Load at startup:** Constructor calls `LoadSettings`; merges JSON sections `refresh`, `backup`, `webRuntime`, `controlRuntime` (lines 286–356).

**Persist:**

```373:388:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
    private void PersistSettings(bool createBackup = true)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        if (createBackup)
        {
            CreateBackupIfNeeded();
        }
        File.WriteAllText(
            _settingsPath,
            JsonSerializer.Serialize(new CoreSettingsDocument
            {
                Refresh = _refreshSettings,
                Backup = _backupSettings,
                WebRuntime = _webRuntimeSettings,
                ControlRuntime = _controlRuntimeSettings
            }, JsonOptions));
    }
```

**Control settings apply:**

```246:279:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
    public (ControlRuntimeSettingsSnapshot Settings, ControlApplyResult Result) UpdateControlRuntimeSettings(ControlRuntimeSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            ...
            if (errors.Count == 0)
            {
                restartRequired =
                    !string.Equals(_controlRuntimeSettings.AdminAuthMode, normalizedAuthMode, StringComparison.Ordinal) ||
                    !string.Equals(_controlRuntimeSettings.AdminSharedToken, normalizedSharedToken, StringComparison.Ordinal);

                _controlRuntimeSettings.AdminAuthMode = normalizedAuthMode;
                _controlRuntimeSettings.AdminSharedToken = normalizedSharedToken;
                PersistSettings();
            }
            return ( ... );
        }
    }
```

**Runtime effect:** Control fields are **read on each request** via `GetControlRuntimeSettings()` in middleware (e.g. admin auth). **`WebRuntimeSettingsChanged`** exists for web runtime only — **no event** today for control-only changes. A new **dev-channel** flag would need either an **`UpdateService` reload hook** on POST success or a server restart policy (product decision).

### End-to-end file list — one boolean `devChannelEnabled` on the server

Assuming OpenAPI property name **`devChannelEnabled`** (camelCase in JSON):

| Step | File |
|------|------|
| Contract source | `shared/api/openapi.yaml` — add property under `ControlRuntimeSettingsSnapshot` |
| Regenerate WebUI types | `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts` via `npm run generate:contracts` |
| Server DTO | `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` — `ControlRuntimeSettingsSnapshot` |
| Persist + API | `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs` — field, `LoadSettings`/`ApplyLoadedSettings`/`Get`/`Update`/`CoreSettingsDocument` |
| Operator UI | `src/core/ReelRoulette.ServerApp/Program.cs` — embedded operator HTML/JS (`loadControlSettings`, `saveControlSettings`, checkbox + label in “Control Settings” card) |
| Tests (likely) | `src/core/ReelRoulette.Core.Tests/CoreSettingsServiceTests.cs` and/or `ServerAuthRegressionTests.cs` |
| Docs (implementation follow-up, not this audit) | `docs/api.md` if control settings are documented there |

**Not required for server toggle:** WebUI Vue/TS components (no new UI in this slice).

### Operator UI typing model

The operator surface uses **hand-written JavaScript** inside **`Program.cs`** (`fetch` + JSON payloads). It does **not** import `openapi.generated.ts`. Operator changes are **manual** against the HTTP contract.

### WebUI contract freshness

`src/clients/web/ReelRoulette.WebUI/scripts/verify-openapi-contracts-fresh.mjs` regenerates from `openapi.yaml` and **fails CI** if `openapi.generated.ts` differs.

`npm run verify` includes **`verify:contracts`** (`package.json`). **`.github/workflows/ci.yml`** runs **`npm run verify`** on WebUI.

**Conclusion:** Adding a field to **`ControlRuntimeSettingsSnapshot`** requires **`npm run generate:contracts`** and committing **`openapi.generated.ts`**, even though WebUI exposes **no new UI** — otherwise **`verify:contracts`** fails.

### Authentication guards

**`/control/*`** (including **`/control/settings`**): When `RequireAuth` is enabled, **`ServerPairingAuthMiddleware`** routes control paths through **`AuthorizeControlPlaneAsync`**:

```71:114:src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs
    private async Task AuthorizeControlPlaneAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/control/pair"))
        {
            await _next(context);
            return;
        }
        ...
        if (IsLocalRequest(context))
        {
            await _next(context);
            return;
        }

        if (!_settings.GetWebRuntimeSettings().BindOnLan)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            ...
        }

        var controlSettings = _settings.GetControlRuntimeSettings();
        var authMode = NormalizeControlAuthMode(controlSettings.AdminAuthMode);
        if (!string.Equals(authMode, "TokenRequired", StringComparison.Ordinal))
        {
            await _next(context);
            return;
        }

        if (IsAuthorized(context, _options.ControlAdminCookieName, controlSettings.AdminSharedToken, ServerSessionStore.ControlScope))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        ...
    }
```

**`/operator` HTML:** Served by **`MapGet(options.OperatorUiPath, …)`** in `Program.cs` — **not** matched as `/control`; **no** pairing middleware on the HTML document itself. Browser **`fetch("/control/settings")`** from that page **does** hit the guards above (localhost bypass; LAN + `TokenRequired` requires control pairing).

The new setting must use the **same `/control/settings` POST** path and therefore the **same guard behavior**.

---

## Section D — Operator UI structure

### How it is served

- **Location:** Single large **raw string literal** in **`MapOperatorUi`** — `src/core/ReelRoulette.ServerApp/Program.cs` starting ~line 333 (`app.MapGet(options.OperatorUiPath, () => { const string htmlTemplate = """`).
- **Default path:** `/operator` (`ServerAppOptions.OperatorUiPath`, `appsettings.json`).
- **Not a separate static file** or frontend build; edits are made **in `Program.cs`**.

### Settings fetch / POST pattern

**Load control settings:**

```892:897:src/core/ReelRoulette.ServerApp/Program.cs
    async function loadControlSettings() {
      const settings = await getJson("/control/settings");
      lastLoadedControlSettings = settings;
      document.getElementById("adminAuthMode").value = settings.adminAuthMode ?? "Off";
      document.getElementById("adminSharedToken").value = settings.adminSharedToken ?? "";
    }
```

**Save (POST JSON snapshot):**

```906:916:src/core/ReelRoulette.ServerApp/Program.cs
    async function saveControlSettings() {
      const payload = {
        adminAuthMode: document.getElementById("adminAuthMode").value || "Off",
        adminSharedToken: document.getElementById("adminSharedToken").value || null
      };

      const response = await getJson("/control/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
```

**Checkbox pattern** (startup launch uses a **separate** `/control/startup` endpoint, but UI pattern is the same):

```560:563:src/core/ReelRoulette.ServerApp/Program.cs
      <div class="inline">
        <input id="launchServerOnStartup" type="checkbox" />
        <label for="launchServerOnStartup" style="margin-top:0;">Launch Server on Startup</label>
      </div>
```

**New dev-channel toggle should:**

1. Add checkbox + label in the **“Control Settings”** card (~lines 551–568).
2. Extend **`loadControlSettings`** to set `checked` from `settings.devChannelEnabled`.
3. Extend **`saveControlSettings` payload** with `devChannelEnabled: document.getElementById("...").checked`.
4. Optionally show **`result.restartRequired`** / message from `ControlApplyResult` if channel changes require server restart (today admin token changes set `restartRequired` in C# only for auth fields — dev channel logic would be new).

---

## Section E — Desktop settings and update surfacing

### Persistence (`desktop-settings.json`)

**Path resolver:**

```43:43:src/clients/desktop/ReelRoulette.DesktopApp/AppDataManager.cs
            return Path.Combine(AppDataDirectory, "desktop-settings.json");
```

**Storage abstraction:**

```6938:6946:src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs
        private static SettingsStorageService<AppSettings> CreateSettingsStorageService()
        {
            return new SettingsStorageService<AppSettings>(new JsonFileStorageOptions<AppSettings>
            {
                FilePathResolver = AppDataManager.GetSettingsPath,
                CreateDefault = () => new AppSettings(),
                SerializerOptions = new JsonSerializerOptions { WriteIndented = true },
                Logger = Log
            });
        }
```

(`SettingsStorageService` in `src/core/ReelRoulette.Core/Storage/CoreStorageServices.cs`.)

**Load:**

```7007:7013:src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs
        private void LoadSettings()
        {
            _isLoadingSettings = true;
            try
            {
            var settingsStorage = CreateSettingsStorageService();
            var settings = settingsStorage.Load();
```

**Save (boolean example — `ForceApiPlayback`):**

```7339:7339:src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs
                settings.ForceApiPlayback = _forceApiPlayback;
```

**Adding a new boolean:** extend nested **`AppSettings`** class (~lines 6880+), **`LoadSettings`**, **`SaveSettingsInternal`**, **`SettingsDialog`** bindings (`.axaml` CheckBox + `.axaml.cs` property), and apply-on-OK path in settings dialog handler (~8600+).

### User-facing notice (Avalonia)

No shared `MessageBox` control file; pattern is **modal `Window` + `ShowDialog`**, e.g. `ManageSourcesDialog.axaml.cs`:

```183:207:src/clients/desktop/ReelRoulette.DesktopApp/ManageSourcesDialog.axaml.cs
                    var msgBox = new Window
                    {
                        Title = "Refresh",
                        Width = 520,
                        Height = 190,
                        WindowStartupLocation = WindowStartupLocation.CenterOwner,
                        Content = new StackPanel { ... TextBlock + Button ... }
                    };
                    ...
                    await msgBox.ShowDialog(this);
```

**Restart notice:** Same pattern from **`MainWindow`** (owner) or a small dedicated dialog — show **before** calling Velopack apply, with short explanation text.

### Defer update until playback idle

**LibVLC state exposed on desktop:**

- **`MediaPlayer? _mediaPlayer`** with **`IsPlaying`**, events **`Playing`**, **`Paused`**, **`Stopped`**, **`EndReached`** (`MainWindow.axaml.cs` ~888–959, ~5165).
- **Photos:** **`_isCurrentlyPlayingPhoto`** + **`_photoDisplayTimer`** (not LibVLC playing) (~102–104, photo timer flow ~4546+).

**Deferral feasibility:** **Feasible** for video/audio via `_mediaPlayer.IsPlaying` and/or `_isCurrentlyPlayingPhoto || _photoDisplayTimer != null`. Update loop can wait until idle before download-complete → notice → apply.

**Product note:** Decided behavior says desktop applies automatically with notice — deferral is **optional polish**, not documented as mandatory; implementation may still restart after idle wait timeout.

### Desktop `UpdateService` placement

- **`ReelRoulette.Core`** must not reference Velopack (no package there today).
- **Place in:** `src/clients/desktop/ReelRoulette.DesktopApp/` — e.g. new **`UpdateService.cs`** (flat project, alongside `Program.cs` / `MainWindow.axaml.cs`), wired from **`Program.cs`** or **`App.axaml.cs`** startup (timer / background loop after Avalonia init).

---

## Section F — Check-loop wiring and service placement

### Server

**Existing hosted service precedent:** `RefreshPipelineService` registered as **`IHostedService`** in `ServerHostComposition.AddReelRouletteServer` (line 39); `WebUiMdnsService` in `Program.cs` (line 60).

**Natural integration:**

- Register **`UpdateHostedService`** (or similar) in **`Program.cs`** **`builder.Services.AddHostedService<…>`** after **`AddReelRouletteServer()`**, implementing periodic + startup check.
- Keep Velopack types in **`ReelRoulette.ServerApp`** only.

**Recommended path:** `src/core/ReelRoulette.ServerApp/Hosting/UpdateService.cs` (+ optional `IHostedService` wrapper in same folder) — matches **`AvaloniaTrayHostUi`**, startup launch services, etc.

### Desktop

- **Startup hook:** after main window loaded or in `App.OnFrameworkInitializationCompleted`, start a **`Timer`** / **`Task`** loop calling desktop **`UpdateService`**.
- **No** Velopack in Core; duplicate service class per host (same as tray/startup patterns on server vs desktop).

---

## Section G — Current published state

| Item | Value |
|------|--------|
| **Repo `.version`** | **`v0.12.0-dev.3`** (file `/.version`) |
| **B2 bucket** | `hugginsindustries-releases` |
| **S3 endpoint (upload)** | `https://s3.us-west-004.backblazeb2.com` |
| **Public feed base (`PUBLIC_FEED_BASE`)** | `https://f004.backblazeb2.com/file/hugginsindustries-releases` |
| **Velopack CLI (`VPK_VERSION`)** | `1.2.0` (matches NuGet **Velopack 1.2.0** in both host `.csproj` files) |

### Dev release channel names (when `.version` contains `-dev`)

From `release.yml`, **`tiers=(dev)` only** for dev tags — published legs use:

| Component | OS | Channel | B2 prefix | Example manifest URL |
|-----------|-----|---------|-----------|----------------------|
| server | linux | `linux-server-dev` | `reelroulette/server-dev` | `{PUBLIC_FEED_BASE}/reelroulette/server-dev/releases.linux-server-dev.json` |
| server | win | `win-server-dev` | `reelroulette/server-dev` | `.../releases.win-server-dev.json` |
| desktop | linux | `linux-desktop-dev` | `reelroulette/desktop-dev` | `.../releases.linux-desktop-dev.json` |
| desktop | win | `win-desktop-dev` | `reelroulette/desktop-dev` | `.../releases.win-desktop-dev.json` |

**Pack IDs at build time:** `ReelRoulette.Server`, `ReelRoulette.Desktop` (`release.yml` lines 91–97).

### Stable channels (when a non-dev tag is released)

Same workflow also builds **stable** tiers (`reelroulette/server`, `reelroulette/desktop` without `-dev` suffix; channels `linux-server`, `win-server`, `linux-desktop`, `win-desktop`).

**Cannot confirm from repo alone:** Which exact artifacts are **currently live on B2** for `v0.12.0-dev.3` (requires bucket listing or successful `curl` of the manifest URLs). **Would confirm with:** HTTP GET of the four dev manifest URLs above and verifying `channel` metadata matches.

---

## Investigation artifacts

- **Created:** this file only (`docs/update-integration-audit.md`).
- **Suggested verification:** `dotnet build ReelRoulette.sln` (no code changes expected).
