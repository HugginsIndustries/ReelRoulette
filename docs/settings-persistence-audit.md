# Settings Persistence Audit (`core-settings.json` / `devChannelEnabled`)

Report-only investigation of how `core-settings.json` is written, how `devChannelEnabled` flows through load and persist, and which paths can explain a confirmed forensic pattern: a backup snapshot containing `"devChannelEnabled": true` in `controlRuntime`, followed ~17 seconds later by a live file where only that field reverted to `false` while `refresh`, `backup`, and `webRuntime` remained byte-identical. No code or tooling changes were made to produce this document.

---

## Forensic summary (operator-provided)

| Observation | Implication |
|-------------|-------------|
| Backup at 22:02:33 contains `"devChannelEnabled": true` | `CreateBackupIfNeeded` copied the on-disk file **before** a write at that time; disk already held `true` immediately prior to that persist. |
| Live `core-settings.json` mtime 22:02:50, `"devChannelEnabled": false` | A later persist left `false` as the final on-disk value. |
| Other three top-level sections byte-identical between backup and final file | Both writes serialized the same in-memory `refresh`, `backup`, and `webRuntime` snapshots; only `controlRuntime.devChannelEnabled` differed at serialize time. |
| Server process that read the reverted file started at 22:06:10 | The reverting write(s) occurred in the **prior** session, not during that startup. |
| `minimumBackupGapMinutes` = 60 | Only the first persist in the window created a backup; the 22:02:50 write did not. |

---

## Section A — Every write path to `core-settings.json`

### A.1 Canonical writer: `CoreSettingsService.PersistSettings`

All structured server persistence of `core-settings.json` goes through one private method. It always writes the **full** document from four **shared readonly field** instances (`_refreshSettings`, `_backupSettings`, `_webRuntimeSettings`, `_controlRuntimeSettings`):

```377:392:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
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

**ControlRuntime source on every persist:** the live `_controlRuntimeSettings` instance for **that** `CoreSettingsService` object—not a freshly constructed snapshot for section-scoped updates.

There is no API to persist a single section; refresh/backup/web/control update methods mutate their section’s fields (or assign from an incoming snapshot for control only), then call `PersistSettings`.

### A.2 Callers of `PersistSettings` (complete list)

`PersistSettings` is `private`; grep shows **five** call sites, all in `CoreSettingsService.cs`:

| # | Location | Trigger | `createBackup` | Mutates before persist |
|---|----------|---------|----------------|-------------------------|
| 1 | Constructor, lines 42–44 | `LoadSettings` returned `NeedsStartupBackfillPersist == true` | `false` | None (writes loaded in-memory state) |
| 2 | `UpdateRefreshSettings`, line 149 | POST `/api/refresh/settings`, `RefreshPipelineService.UpdateSettings`, `ConsumeRefreshRescanFlags` | default `true` | `_refreshSettings` only |
| 3 | `UpdateBackupSettings`, line 174 | POST `/api/backup/settings` | default `true` | `_backupSettings` only |
| 4 | `UpdateWebRuntimeSettings`, line 221 | POST `/api/web-runtime/settings` (only if `changed == true`) | default `true` | `_webRuntimeSettings` only |
| 5 | `UpdateControlRuntimeSettings`, line 272 | POST `/control/settings` (only if validation passes) | default `true` | `_controlRuntimeSettings` (`AdminAuthMode`, `AdminSharedToken`, `DevChannelEnabled`) |

Constructor also calls `CreateBackupIfNeeded()` at line 46 **without** persisting (backup of existing file only).

**HTTP / service indirection (same underlying persist):**

```769:786:src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs
        app.MapGet("/api/refresh/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetRefreshSettings());
        });

        app.MapPost("/api/refresh/settings", (RefreshSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateRefreshSettings(snapshot));
        });

        app.MapGet("/api/backup/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetBackupSettings());
        });

        app.MapPost("/api/backup/settings", (BackupSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateBackupSettings(snapshot));
        });
```

```838:845:src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs
        app.MapGet("/api/web-runtime/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetWebRuntimeSettings());
        });

        app.MapPost("/api/web-runtime/settings", (WebRuntimeSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateWebRuntimeSettings(snapshot));
        });
```

```194:217:src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs
        app.MapGet("/control/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetControlRuntimeSettings());
        });

        app.MapPost("/control/settings", (HttpContext context, ControlRuntimeSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            var devChannelBefore = settings.GetControlRuntimeSettings().DevChannelEnabled;
            var (appliedSettings, applyResult) = settings.UpdateControlRuntimeSettings(snapshot);
            if (applyResult.Accepted)
            {
                var devChannelAfter = settings.GetControlRuntimeSettings().DevChannelEnabled;
                if (devChannelBefore != devChannelAfter)
                {
                    context.RequestServices.GetService<IServerUpdateChannelCoordinator>()?.NotifyDevChannelChanged();
                }
            }

            return Results.Ok(new
            {
                settings = appliedSettings,
                result = applyResult
            });
        });
```

`RefreshPipelineService` delegates refresh/web updates to the injected singleton:

```141:158:src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs
    public RefreshSettingsSnapshot UpdateSettings(RefreshSettingsSnapshot snapshot)
    {
        lock (_runLock)
        {
            var updated = _coreSettings.UpdateRefreshSettings(snapshot);
            ScheduleNextAutoRunFromNowLocked();
            return updated;
        }
    }

    public WebRuntimeSettingsSnapshot UpdateWebRuntimeSettings(WebRuntimeSettingsSnapshot snapshot)
    {
        return _coreSettings.UpdateWebRuntimeSettings(snapshot);
    }
```

Automatic refresh persist after pipeline work (`ConsumeRefreshRescanFlags`):

```1912:1924:src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs
    private void ConsumeRefreshRescanFlags(bool clearDuration, bool clearLoudness)
    {
        try
        {
            var current = _coreSettings.GetRefreshSettings();
            var updated = new RefreshSettingsSnapshot
            {
                AutoRefreshEnabled = current.AutoRefreshEnabled,
                AutoRefreshIntervalMinutes = current.AutoRefreshIntervalMinutes,
                ForceRescanDuration = clearDuration ? false : current.ForceRescanDuration,
                ForceRescanLoudness = clearLoudness ? false : current.ForceRescanLoudness
            };
            _coreSettings.UpdateRefreshSettings(updated);
```

Note: this constructed `RefreshSettingsSnapshot` omits `FingerprintScanMaxDegreeOfParallelism`; `UpdateRefreshSettings` still assigns it from the snapshot (default `0` → clamped to `1`). That can change **refresh** on disk but does not construct a separate `ControlRuntimeSettingsSnapshot`.

### A.3 Other repository writes of `core-settings.json` (bypass `CoreSettingsService`)

| Path | Mechanism | Notes |
|------|-----------|--------|
| `LibraryArchiveMigration` import | `WriteAllTextAtomic(corePath, coreSettingsText)` from zip bytes | Replaces file wholesale while server is expected stopped; does not read in-memory server state. |
| Tests / fixtures | Direct `File.WriteAllText` | Not production runtime. |

No other production C# path writes `core-settings.json`.

### A.4 Per-caller: full document vs section intent; ControlRuntime identity

| Caller | Section intent | Document written | `ControlRuntime` serialized from |
|--------|----------------|------------------|----------------------------------|
| Startup backfill persist | Backfill missing schema | Full | Shared `_controlRuntimeSettings` after `LoadSettings` |
| `UpdateRefreshSettings` | Refresh only | Full | Shared `_controlRuntimeSettings` (unchanged fields) |
| `UpdateBackupSettings` | Backup only | Full | Shared `_controlRuntimeSettings` |
| `UpdateWebRuntimeSettings` | Web runtime only | Full | Shared `_controlRuntimeSettings` |
| `UpdateControlRuntimeSettings` | Control only | Full | Shared `_controlRuntimeSettings` (updated from POST snapshot) |

**Leading hypothesis check:** Refresh/backup/web update paths do **not** build a new `ControlRuntimeSettingsSnapshot` for persistence. They reuse the service’s single mutable `_controlRuntimeSettings` instance. A revert where only `devChannelEnabled` changes while other sections are byte-stable implies either:

1. `_controlRuntimeSettings.DevChannelEnabled` was `false` on the **same** singleton at serialize time while other fields were unchanged, or  
2. A **different** `CoreSettingsService` instance with `_controlRuntimeSettings.DevChannelEnabled == false` called `PersistSettings` (see Section C / dual instance).

### A.5 Every construction site of `ControlRuntimeSettingsSnapshot`

| Site | File:line | `DevChannelEnabled` populated? |
|------|-----------|--------------------------------|
| Default / load bootstrap | `CoreSettingsService.LoadSettings` | Starts `false` (C# default); set from JSON if `parsed.ControlRuntime != null` (line 359) |
| `GetControlRuntimeSettings` | lines 239–244 | Copy from `_controlRuntimeSettings` (return value only; not used for persist) |
| `UpdateControlRuntimeSettings` input | API model binding | From JSON; **omitted property → `false`** |
| Tests | `CoreSettingsServiceTests`, `ServerAuthRegressionTests` | Explicit in tests |

```306:360:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
        var controlRuntime = new ControlRuntimeSettingsSnapshot
        {
            AdminAuthMode = NormalizeAuthMode(options.ControlAdminAuthMode),
            AdminSharedToken = string.IsNullOrWhiteSpace(options.ControlAdminSharedToken) ? null : options.ControlAdminSharedToken.Trim()
        };
        var needsStartupBackfillPersist = !File.Exists(_settingsPath);
        try
        {
            if (File.Exists(_settingsPath))
            {
                var text = File.ReadAllText(_settingsPath);
                var parsed = JsonSerializer.Deserialize<CoreSettingsDocument>(text, JsonOptions);
                if (parsed != null)
                {
                    needsStartupBackfillPersist |= HasMissingTopLevelSettingsSectionsOrFields(text);
                    // ...
                    if (parsed.ControlRuntime != null)
                    {
                        controlRuntime.AdminAuthMode = NormalizeAuthMode(parsed.ControlRuntime.AdminAuthMode);
                        controlRuntime.AdminSharedToken = string.IsNullOrWhiteSpace(parsed.ControlRuntime.AdminSharedToken)
                            ? null
                            : parsed.ControlRuntime.AdminSharedToken.Trim();
                        controlRuntime.DevChannelEnabled = parsed.ControlRuntime.DevChannelEnabled;
                    }
```

There are **no** other production constructions of `ControlRuntimeSettingsSnapshot`.

---

## Section B — Trace `DevChannelEnabled` end to end

### B.1 OpenAPI → C# contract

```1574:1589:shared/api/openapi.yaml
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
        devChannelEnabled:
          type: boolean
          default: false
```

```300:305:src/core/ReelRoulette.Server/Contracts/ApiContracts.cs
public sealed class ControlRuntimeSettingsSnapshot
{
    public string AdminAuthMode { get; set; } = "Off";
    public string? AdminSharedToken { get; set; }
    public bool DevChannelEnabled { get; set; }
}
```

`devChannelEnabled` is **not** in OpenAPI `required`; server DTO has no `[JsonRequired]`. ASP.NET Core JSON binding leaves missing properties at the CLR default (`false`).

### B.2 Load path (`CoreSettingsService`)

1. `LoadSettings` builds `controlRuntime` (admin fields from `ServerRuntimeOptions`, `DevChannelEnabled` default `false`).
2. If file exists and deserializes, merges `parsed.ControlRuntime` including `DevChannelEnabled` when section present.
3. Constructor assigns tuple to readonly fields—**one shared `_controlRuntimeSettings` object** for the lifetime of the service:

```40:41:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
        var loaded = LoadSettings(options);
        (_refreshSettings, _backupSettings, _webRuntimeSettings, _controlRuntimeSettings) = loaded.Settings;
```

4. `ApplyLoadedSettings` (used by `ReloadFromDisk` only) copies all control fields including `DevChannelEnabled`:

```119:121:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
        _controlRuntimeSettings.AdminAuthMode = loaded.ControlRuntime.AdminAuthMode;
        _controlRuntimeSettings.AdminSharedToken = loaded.ControlRuntime.AdminSharedToken;
        _controlRuntimeSettings.DevChannelEnabled = loaded.ControlRuntime.DevChannelEnabled;
```

### B.3 Read path

`GetControlRuntimeSettings` returns a **new snapshot copy**, not a live reference:

```235:245:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
    public ControlRuntimeSettingsSnapshot GetControlRuntimeSettings()
    {
        lock (_lock)
        {
            return new ControlRuntimeSettingsSnapshot
            {
                AdminAuthMode = _controlRuntimeSettings.AdminAuthMode,
                AdminSharedToken = _controlRuntimeSettings.AdminSharedToken,
                DevChannelEnabled = _controlRuntimeSettings.DevChannelEnabled
            };
        }
    }
```

Callers (middleware, `UpdateService`, operator status) cannot mutate persisted state through this return value.

### B.4 Write path (control)

```248:272:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
    public (ControlRuntimeSettingsSnapshot Settings, ControlApplyResult Result) UpdateControlRuntimeSettings(ControlRuntimeSettingsSnapshot snapshot)
    {
        lock (_lock)
        {
            // ... validation ...
            if (errors.Count == 0)
            {
                restartRequired =
                    !string.Equals(_controlRuntimeSettings.AdminAuthMode, normalizedAuthMode, StringComparison.Ordinal) ||
                    !string.Equals(_controlRuntimeSettings.AdminSharedToken, normalizedSharedToken, StringComparison.Ordinal);

                _controlRuntimeSettings.AdminAuthMode = normalizedAuthMode;
                _controlRuntimeSettings.AdminSharedToken = normalizedSharedToken;
                _controlRuntimeSettings.DevChannelEnabled = snapshot.DevChannelEnabled;
                PersistSettings();
            }
```

**Preserves field when:** the POST body includes the intended boolean. **Does not preserve** when: POST omits `devChannelEnabled` (binds `false`) or sends `false`.

`RestartRequired` ignores `DevChannelEnabled` changes (covered by test `UpdateControlRuntimeSettings_DevChannelToggleAlone_ShouldNotRequireRestart`).

### B.5 Serialization shape

`CoreSettingsDocument` uses the same contract types; JSON property names follow `JsonSerializerDefaults.Web` (camelCase). `DevChannelEnabled` → `devChannelEnabled`.

### B.6 In-memory model summary

| Question | Answer |
|----------|--------|
| Single shared mutable control state? | Yes: `_controlRuntimeSettings` per `CoreSettingsService` instance. |
| Copies? | `GetControlRuntimeSettings` and load/bootstrap locals; persist uses shared instance only. |
| `UpdateControlRuntimeSettings` preserves existing `DevChannelEnabled` if omitted from POST? | **No** — assigns `snapshot.DevChannelEnabled` verbatim. |
| Live reference from GET? | **No** — copy returned. |

---

## Section C — What could write ~17s after a control save (same session)

### C.1 Plausible persist triggers (same process, DI singleton)

| Path | Delay plausible? | ControlRuntime on persist | Can set `devChannelEnabled` false without touching other sections’ in-memory values? |
|------|------------------|---------------------------|-------------------------------------------------------------------------------------|
| POST `/control/settings` | User/script second save | From POST snapshot | **Yes** — if body omits or sends `false` |
| POST `/api/web-runtime/settings` | Operator “Apply web runtime settings” | Live `_controlRuntimeSettings` | Only if memory already `false` |
| POST `/api/backup/settings` | Desktop settings dialog (server backup section) | Live shared | Only if memory already `false` |
| POST `/api/refresh/settings` | Desktop settings / API | Live shared | Only if memory already `false` |
| `ConsumeRefreshRescanFlags` after refresh stage | Pipeline duration (seconds–minutes) | Live shared | Only if memory already `false` |
| Constructor backfill persist | Process start only | Loaded state | Not consistent with 22:06 restart timeline |
| Shutdown / hosted services | No `PersistSettings` in `ApplicationStopping` handlers found | — | **No** |

**Cross-section “stale separate ControlRuntime object” on the DI singleton:** **Refuted** for refresh/backup/web paths—they never substitute a default-constructed control snapshot into `PersistSettings`.

**Cross-section write with stale `DevChannelEnabled` on the singleton:** Possible **only if** `_controlRuntimeSettings.DevChannelEnabled` is already `false` in that instance (never updated after load, or reset by a control POST). A successful `UpdateControlRuntimeSettings` with `true` on that instance makes subsequent refresh/backup/web persists keep `true`.

### C.2 POST `/control/settings` with partial JSON (code-backed revert)

Documented smoke script posts **without** `devChannelEnabled`:

```128:128:tools/scripts/verify-web-deploy.ps1
    $controlSettingsPost = Invoke-WebRequest -Uri "$listenUrl/control/settings" -UseBasicParsing -TimeoutSec 5 -Method Post -ContentType "application/json" -Body '{"adminAuthMode":"Off","adminSharedToken":null}'
```

That binding yields `DevChannelEnabled == false` and calls `PersistSettings`, producing exactly the forensic pattern (other sections unchanged from memory, control flag forced false). Whether this ran in the operator’s Linux session is **not** determinable from code alone (would need HTTP/access logs).

### C.3 Operator UI (embedded `/operator`)

| Action | Endpoint | Writes `core-settings.json`? | Reconstructs control runtime? |
|--------|----------|------------------------------|--------------------------------|
| Apply web runtime settings | POST `/api/web-runtime/settings` | Yes (if changed) | No — does not POST control |
| Apply control settings | POST `/control/settings` then POST `/control/startup` | Control POST yes; startup uses XDG/registry only | Control POST replaces all three control fields from form |
| Apply testing state | POST `/control/testing/update` | **No** | No |
| Refresh status / update buttons | GET / POST update endpoints | **No** | No |

Control save payload **includes** `devChannelEnabled`:

```1016:1021:src/core/ReelRoulette.ServerApp/Program.cs
    async function saveControlSettings() {
      const payload = {
        adminAuthMode: document.getElementById("adminAuthMode").value || "Off",
        adminSharedToken: document.getElementById("adminSharedToken").value || null,
        devChannelEnabled: document.getElementById("devChannelEnabled").checked
      };
```

A second “Apply control settings” click with checkbox unchecked (e.g. page loaded before `loadControlSettings` completed, or user intent) would POST `false` and persist the observed diff.

Startup launch is saved in the **same** button handler **after** control POST succeeds; it does not touch `core-settings.json`.

### C.4 Dual `CoreSettingsService` in `ReelRoulette.ServerApp`

```46:48:src/core/ReelRoulette.ServerApp/Program.cs
        var runtimeOptions = ServerRuntimeOptions.FromConfiguration(builder.Configuration);
        var startupSettings = new CoreSettingsService(NullLogger<CoreSettingsService>.Instance, runtimeOptions);
        var startupWebRuntime = startupSettings.GetWebRuntimeSettings();
```

DI registration constructs a **second** instance:

```23:28:src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs
        services.AddSingleton(sp =>
        {
            var logger = sp.GetRequiredService<ILogger<CoreSettingsService>>();
            var options = sp.GetRequiredService<ServerRuntimeOptions>();
            var appDataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
            return new CoreSettingsService(logger, options, appDataRoot);
        });
```

| Instance | Used for | Persists after ctor? |
|----------|----------|----------------------|
| `startupSettings` | Initial listen URL / web runtime merge before `UseUrls` | **Only** ctor (`NeedsStartupBackfillPersist`) |
| DI singleton | All API/operator endpoints, `UpdateService`, `RestartCoordinator`, CORS | All runtime update methods |

**Implication:** An operator control save updates **DI memory and disk**. The early `startupSettings` instance retains its **startup-time** `_controlRuntimeSettings` forever but **cannot** persist again after ctor. It does **not** explain a revert 17 seconds after an operator save unless another code path is found (none in this audit).

Headless `ReelRoulette.Server/Program.cs` registers **one** instance (no pre-DI `startupSettings`).

### C.5 Named paths vs leading hypothesis

| Verdict | Path |
|---------|------|
| **Matches forensic diff pattern with high confidence** | `UpdateControlRuntimeSettings` → `PersistSettings` when `snapshot.DevChannelEnabled` is `false` (including omitted JSON property on POST `/control/settings`). |
| **Does not use stale separate control object; preserves memory on singleton** | `UpdateRefreshSettings`, `UpdateBackupSettings`, `UpdateWebRuntimeSettings` on the **same** singleton after memory holds `true`. |
| **Would require memory already false on persisting instance** | Any cross-section persist listed above. |
| **Not supported for ~17s post-save delay** | Second `CoreSettingsService` (`startupSettings`) post-ctor persist. |

**What would confirm the offending request:** Correlation of `last.log` (or reverse proxy) timestamps with POST `/control/settings` bodies, or server-side request logging for control POST payloads between 22:02:33 and 22:02:50.

---

## Section D — Startup backfill

### D.1 Constructor logic

```40:46:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
        var loaded = LoadSettings(options);
        (_refreshSettings, _backupSettings, _webRuntimeSettings, _controlRuntimeSettings) = loaded.Settings;
        if (loaded.NeedsStartupBackfillPersist)
        {
            PersistSettings(createBackup: false);
        }
        CreateBackupIfNeeded();
```

`NeedsStartupBackfillPersist` is set when:

- File missing, or  
- `HasMissingTopLevelSettingsSectionsOrFields(text)` is true, or  
- File exists but deserialization returns null (schema rewrite).

### D.2 `HasMissingTopLevelSettingsSectionsOrFields` and `devChannelEnabled`

Control section check **stops at** `adminAuthMode` and `adminSharedToken`:

```439:445:src/core/ReelRoulette.Server/Services/CoreSettingsService.cs
            if (!root.TryGetProperty("controlRuntime", out var controlRuntime) ||
                controlRuntime.ValueKind != JsonValueKind.Object ||
                !HasObjectProperty(controlRuntime, "adminAuthMode") ||
                !HasObjectProperty(controlRuntime, "adminSharedToken"))
            {
                return true;
            }
```

**`devChannelEnabled` is not part of the backfill gate.**

### D.3 New field on existing installs

| Scenario | In-memory after load | Unconditional startup persist? |
|----------|----------------------|--------------------------------|
| File predates `devChannelEnabled`, property **absent** | `false` (default / deserialize) | **No**, if other required sections/fields present |
| File missing entire `controlRuntime` section | Defaults from options + false dev channel | **Yes** (missing section triggers backfill) |
| File unparsable | Defaults | **Yes** |

When backfill **does** run, it writes whatever is in memory—including `DevChannelEnabled == false` if the property was absent from JSON— potentially materializing `"devChannelEnabled": false` on disk.

That is a **startup** hazard for new fields, not by itself an explanation for mid-session 22:02:50 revert **unless** paired with a process restart between save and observation (operator timeline rules that out for the final read).

Test evidence for legacy control without dev channel (memory only, no assert on disk after ctor without backfill):

```103:137:src/core/ReelRoulette.Core.Tests/CoreSettingsServiceTests.cs
    public void Constructor_WithLegacyControlRuntimeWithoutDevChannel_ShouldDefaultDevChannelToFalse()
    {
        // ... JSON with controlRuntime without devChannelEnabled ...
        var service = CreateService();
        Assert.False(service.GetControlRuntimeSettings().DevChannelEnabled);
    }
```

---

## Section E — Blast radius

### E.1 General hazard for new settings

| Section | Persist pattern | New field hazard |
|---------|-----------------|------------------|
| Refresh / backup / web / control | Any section update writes **all four** from shared instances | **Yes**, same class of bugs: |
| | | (1) **POST partial body** for a section snapshot resets unmentioned CLR properties to defaults on update (control proven for `bool`). |
| | | (2) **Startup backfill** rewrites entire file from memory; fields not listed in `HasMissingTopLevelSettingsSectionsOrFields` are not backfill triggers but load as defaults until something persists. |
| | | (3) **LoadSettings** constructs section objects without copying new fields from JSON if deserialize/type merge not updated (same pattern as initial `DevChannelEnabled` merge at lines 353–360). |

`devChannelEnabled` is not special in the persistence machinery—it is the newest control field and exhibits default `false` on omission.

Other sections use the same “update method assigns from snapshot” pattern (e.g. refresh assigns every property from POST snapshot). Partial refresh POSTs could reset unspecified fields to defaults similarly.

### E.2 Desktop `desktop-settings.json`

Desktop uses a **separate file** and **single-document** load-merge-save (not four-section merge into server file):

```7280:7303:src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs
        private void SaveSettingsInternal(decimal? intervalValue = null)
        {
            try
            {
                // ...
                var settingsStorage = CreateSettingsStorageService();
                // ...
                var settings = settingsStorage.Load();
                
                // Update MainWindow-managed fields (preserve dialog bounds from existing settings)
```

```6938:6946:src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs
        private static SettingsStorageService<AppSettings> CreateSettingsStorageService()
        {
            return new SettingsStorageService<AppSettings>(new JsonFileStorageOptions<AppSettings>
            {
                FilePathResolver = AppDataManager.GetSettingsPath,
                CreateDefault = () => new AppSettings(),
```

Storage writes one `AppSettings` object atomically (`JsonFileStorageService.Save`); it does **not** share the server’s four-section merge hazard. A future desktop **channel toggle** could still suffer **partial-update** bugs if a code path constructs a new `AppSettings` (or DTO) without loading existing fields first—**different failure mode** from `core-settings.json` cross-section overwrite.

Server-side channel state for ServerApp remains in `core-settings.json` via `CoreSettingsService`.

### E.3 Tests: cross-section survival

| Test | Cross-section? |
|------|----------------|
| `UpdateMethods_ShouldPersistRoundTrip` | Updates all four sections in one test instance, then reloads—**does not** update one section and assert another unchanged. |
| `Constructor_WithLegacyControlRuntimeWithoutDevChannel_ShouldDefaultDevChannelToFalse` | Load only. |
| Backup gap tests | Refresh update + backup file count only. |

**No test** asserts: “after `UpdateControlRuntimeSettings` with `DevChannelEnabled: true`, a subsequent `UpdateRefreshSettings` (or web/backup) leaves `devChannelEnabled` true on disk.”

---

## Section F — Why Linux only (code review)

| Area | Linux-specific settings persist? |
|------|-----------------------------------|
| `CoreSettingsService` path | Uses `Environment.SpecialFolder.ApplicationData` (XDG config on Linux)—same code as Windows. |
| Shutdown | Linux tray / `hostUi.StopAsync` ordering in `Program.cs`—no settings persist hooked. |
| Startup launch | Linux XDG `.desktop` vs Windows registry—**does not** write `core-settings.json`. |
| Hosted services | `UpdateHostedService`, `WebUiMdnsService`, `RefreshPipelineService`—no platform `#if` around persist. |
| Server host | Linux packaged TFM `net10.0` vs Windows `net10.0-windows`—same `CoreSettingsService` source. |

**No platform-specific branch** was found that would cause an extra or omitted persist on Linux alone.

Observed Linux-only behavior may be **timing/workflow** (operator UI usage, refresh pipeline completing, smoke scripts, desktop pushing refresh/backup soon after control save) rather than a Linux code path. Confirming would require request-level timestamps on the Linux run vs the Windows VM session.

---

## Conclusions

1. **Every** runtime write of `core-settings.json` from the server goes through `CoreSettingsService.PersistSettings`, which serializes **all four sections** from in-memory shared snapshot objects.

2. The leading hypothesis—“another persist path serializes a **separately constructed** `ControlRuntimeSettingsSnapshot` missing `DevChannelEnabled`”—is **not supported** for refresh/backup/web update methods. Those paths serialize the live `_controlRuntimeSettings` field.

3. The forensic pattern (only `devChannelEnabled` changes; other sections byte-identical) is **fully consistent** with `UpdateControlRuntimeSettings` + `PersistSettings` when `DevChannelEnabled` is `false` at assign time, most plausibly from POST `/control/settings` with **omitted or false** `devChannelEnabled` while admin fields match.

4. Cross-section persists **can** overwrite `devChannelEnabled` with `false` only if the persisting service instance already holds `false` in memory—e.g. control POST never ran on that instance, or a prior control POST set false—not because refresh constructs a default control snapshot.

5. **`ReelRoulette.ServerApp` constructs two `CoreSettingsService` instances at startup**; only the DI singleton handles operator/API saves. The early instance does not explain a mid-session revert unless a new persist path is discovered.

6. **General hazard:** any new boolean (or value-type) field on a POST-bound snapshot with CLR defaults, plus full-document persist on section-scoped updates, plus incomplete startup backfill field lists.

7. **Desktop** `desktop-settings.json` uses a different persistence pattern; the exact four-section server merge bug does not apply one-for-one; partial object updates remain a separate risk.

8. **Tests** do not guard cross-section field survival for `devChannelEnabled`.

---

## Definition of Done (audit)

| Criterion | Status |
|-----------|--------|
| Sections A–F with quoted code and line references | Done |
| Named write path(s) or explicit “not found” | Done — primary: control POST with false/omitted `devChannelEnabled`; cross-section stale-object hypothesis refuted for refresh/backup/web |
| General vs field-specific hazard | Done — general |
| Desktop vulnerability pattern | Done — separate file; different pattern |
| Single new file only | Intended: `docs/settings-persistence-audit.md` |
| `dotnet build ReelRoulette.sln` | Run separately to confirm no code changes |
