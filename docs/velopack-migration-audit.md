# Velopack Migration Audit

Report-only inventory of current packaging, versioning, application entry points, native dependencies, and path assumptions in the ReelRoulette repository. No code or tooling changes were made to produce this document.

---

## Section 1 — Project and output inventory

### ReelRoulette.ServerApp

| Property | Value |
|----------|-------|
| **`.csproj` path** | `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` |
| **`AssemblyName`** | Not set in `.csproj`; SDK default is **`ReelRoulette.ServerApp`** (matches publish output base name). |
| **`RootNamespace`** | Not set in `.csproj`; SDK default is **`ReelRoulette.ServerApp`**. |
| **`TargetFramework(s)`** | **`net10.0;net10.0-windows`** (multi-target). |

**Direct project references:**

- `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`

**Transitive reference:** `ReelRoulette.Core` (also referenced directly).

### Avalonia desktop client (`ReelRoulette.DesktopApp`)

| Property | Value |
|----------|-------|
| **`.csproj` path** | `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj` |
| **`AssemblyName`** | **`ReelRoulette.DesktopApp`** (explicit). |
| **`RootNamespace`** | Not set in `.csproj`; SDK default is **`ReelRoulette.DesktopApp`**. Application code uses namespace **`ReelRoulette`** in `Program.cs`. |
| **`TargetFramework(s)`** | **`net10.0`** (single target). |

**Direct project references:**

- `src/clients/desktop/ReelRoulette.LibraryArchive/ReelRoulette.LibraryArchive.csproj`
- `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`

### ServerApp publish target framework by platform

Packaging scripts choose the TFM explicitly via `dotnet publish -f`:

| Platform | Script | `-f` value | Evidence |
|----------|--------|------------|----------|
| **Windows** | `tools/scripts/package-serverapp-win-portable.ps1`, `package-serverapp-win-inno.ps1` | **`net10.0-windows`** | Lines 111 and 149 respectively: `-f net10.0-windows` |
| **Linux** | `tools/scripts/package-serverapp-linux-portable.sh` (and AppImage, which calls it) | **`net10.0`** | Line 92: `-f net10.0` |

**What determines the choice:** Each packaging script hard-codes the TFM matching the host OS packaging path. Windows scripts use `net10.0-windows` (sets `OutputType=WinExe` in the `.csproj` for that TFM). Linux scripts use `net10.0` (sets `OutputType=Exe`). There is no shared selector beyond script authorship; `full-release.ps1` invokes the platform-specific script for the current OS.

The `.csproj` defines TFM-conditional output types:

```9:14:src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj
  <PropertyGroup Condition="'$(TargetFramework)'=='net10.0'">
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <PropertyGroup Condition="'$(TargetFramework)'=='net10.0-windows'">
    <OutputType>WinExe</OutputType>
  </PropertyGroup>
```

Local dev helpers mirror the same split (`run-server.ps1` uses `net10.0-windows` on Windows, `net10.0` elsewhere).

### `dotnet publish` executable filenames and publish mode

All packaging scripts use **`--self-contained true`**, **`PublishSingleFile=false`**, **`PublishTrimmed=false`**.

| App | RID | Published executable filename |
|-----|-----|-------------------------------|
| **ServerApp** | `win-x64` | **`ReelRoulette.ServerApp.exe`** |
| **ServerApp** | `linux-x64` | **`ReelRoulette.ServerApp`** (extensionless; packaging scripts `chmod +x`) |
| **DesktopApp** | `win-x64` | **`ReelRoulette.DesktopApp.exe`** |
| **DesktopApp** | `linux-x64` | **`ReelRoulette.DesktopApp`** (extensionless; packaging scripts `chmod +x`) |

Evidence from Linux portable wrappers:

```114:126:tools/scripts/package-serverapp-linux-portable.sh
cat > "$STAGING_DIR/run-server.sh" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# Native libraries (e.g. custom VLC install): prepend to LD_LIBRARY_PATH if needed.
exec ./ReelRoulette.ServerApp "$@"
WRAPPER
chmod +x "$STAGING_DIR/run-server.sh"

if [[ -f "$STAGING_DIR/ReelRoulette.ServerApp" ]]; then
  chmod +x "$STAGING_DIR/ReelRoulette.ServerApp"
fi
```

Windows portable `PACKAGE_INFO.txt` documents `Run: ReelRoulette.ServerApp.exe` / `Run: ReelRoulette.DesktopApp.exe`.

### Icon assets usable for packaging

Shared repo assets under `assets/`:

| Path | Format | Dimensions | Used for |
|------|--------|------------|----------|
| **`assets/HI.ico`** | MS Windows icon resource (multi-size ICO; includes **256×256** and **128×128** PNG-encoded entries) | 256×256, 128×128 (among others) | **Windows:** ServerApp `ApplicationIcon`, copied to publish output and `wwwroot`; DesktopApp `ApplicationIcon` + Avalonia resource; Inno `SetupIconFile` |
| **`assets/HI-256.png`** | PNG | **256×256** | **Linux:** AppImage menu/icons (`256x256/apps`); tarball install script fetches for Freedesktop icons |
| **`assets/HI-512.png`** | PNG | **512×512** | **Linux:** AppImage menu/icons (`512x512/apps`); tarball install script fetches for Freedesktop icons |

Evidence (file inspection on Linux):

```
assets/HI.ico:     MS Windows icon resource - 6 icons, 256x256 ... 128x128 ...
assets/HI-256.png: PNG image data, 256 x 256
assets/HI-512.png: PNG image data, 512 x 512
```

**WebUI-only icons** (not used by desktop/server native packaging scripts, but present for PWA): `src/clients/web/ReelRoulette.WebUI/public/icons/` — generated at build time by `scripts/sync-shared-icon.mjs` as **192×192**, **512×512**, and **180×180** PNGs from `HI-256.png` / `HI-512.png`.

**No dedicated Linux `.desktop` icon beyond the shared PNGs** is checked into `assets/` for the desktop client; AppImage and install scripts reuse `HI-256.png` / `HI-512.png` with stems `reelroulette-server` / `reelroulette-desktop`.

---

## Section 2 — Application entry points

### ReelRoulette.ServerApp

**Entry location:** Top-level statements in `src/core/ReelRoulette.ServerApp/Program.cs` (no explicit `Main` method; compiler-generated entry calls the top-level code).

Quoted entry and dispatch:

```24:31:src/core/ReelRoulette.ServerApp/Program.cs
try
{
    await RunAsync(args);
}
catch (OperationCanceledException ex) when (IsExpectedLinuxShutdownCancellation(ex))
{
    Console.Error.WriteLine($"Ignoring expected Linux shutdown cancellation: {ex.Message}");
}
```

### ReelRoulette.DesktopApp

**Entry location:** `src/clients/desktop/ReelRoulette.DesktopApp/Program.cs`, class `ReelRoulette.Program`.

Quoted `Main`:

```19:21:src/clients/desktop/ReelRoulette.DesktopApp/Program.cs
    [STAThread]
    public static void Main(string[] args)
    {
```

(Full method continues through LibVLC initialization and `BuildAvaloniaApp().StartWithClassicDesktopLifetime(args)` at lines 65–151.)

### ServerApp startup sequence before Kestrel binds and before tray initializes

Execution order derived from `Program.cs` `RunAsync` and related helpers:

1. **Global handler registration** — `TaskScheduler.UnobservedTaskException` handler for Linux tray shutdown noise (lines 16–22).
2. **`RunAsync(args)` entered.**
3. **`WebApplication.CreateBuilder`** — `ContentRootPath = AppContext.BaseDirectory`, `Args = args` (lines 37–41). Ensures packaged runs resolve `appsettings.json` and `wwwroot` from the install directory regardless of cwd.
4. **`ServerRuntimeOptions.FromConfiguration`** — reads `appsettings.json`, environment variables, and command-line configuration (line 42).
5. **`CoreSettingsService` construction** — **disk I/O:** loads `%ApplicationData%/ReelRoulette/core-settings.json`; may backfill/persist defaults and run backup logic (lines 43–44, service ctor in `CoreSettingsService.cs`).
6. **`GetWebRuntimeSettings` + `ApplyWebRuntimeSettingsToRuntimeOptions`** — applies persisted web runtime settings to in-memory listen URL/auth options (lines 44–45).
7. **`ServerAppOptions.FromConfiguration`** — reads `ServerApp` section from configuration (line 48).
8. **`ResetServerLastLog`** — **disk I/O:** truncates/creates `%ApplicationData%/ReelRoulette/last.log` (line 49).
9. **`builder.WebHost.UseUrls(runtimeOptions.ListenUrl)`** — configures listen URL; **does not bind yet** (line 51).
10. **DI registration** — `AddReelRouletteServer`, CORS, hosted services, etc. (lines 52–74).
11. **`builder.Build()`** — builds the `WebApplication` pipeline (line 76).
12. **Endpoint mapping** — API, control plane, operator UI, restart, startup launch, WebUI static files (lines 77–90).
13. **`CreateStartupLaunchService`** — selects Windows registry, Linux XDG, or headless stub implementation (lines 84, 222–237); **no registration write at startup** unless later invoked via API/tray.
14. **`CreateHostUi`** — **headless vs tray branch** via `SupportsTrayHostUi()` (lines 92, 170–219):
    - Windows/macOS: tray supported.
    - Linux: tray if `DISPLAY`, `WAYLAND_DISPLAY`, or `DBUS_SESSION_BUS_ADDRESS` is set; else headless.
    - Returns `AvaloniaTrayHostUi` or `HeadlessHostUi`.
15. **`ApplicationStarted` callback registered** — will call `hostUi.Start()` **after** the host starts (lines 93–97). Tray is **not** initialized before this point.
16. **`ApplicationStopping` callback registered** — synchronous `hostUi.StopAsync` on shutdown (lines 99–121).
17. **`await app.RunAsync()`** — **Kestrel binds and accepts connections here** (line 123).
18. **On `ApplicationStarted`:** `hostUi.Start()` runs — **Avalonia tray initializes after Kestrel is listening** (lines 93–97).

**Not present in ServerApp startup:**

- **No single-instance check.**
- **No mutex acquisition.**
- **No custom command-line parser** beyond ASP.NET Core configuration binding (see below).

### Command-line argument parsing

#### ServerApp

Uses standard ASP.NET Core configuration from `args` passed to `WebApplication.CreateBuilder`. Documented/scripted examples:

| Argument / pattern | Behavior |
|--------------------|----------|
| `--CoreServer:ListenUrl=<url>` | Overrides listen URL (e.g. `verify-linux-packaged-server-smoke.sh`, `verify-web-deploy.ps1`) |
| `--ServerApp:WebUiStaticRootPath=<path>` | Overrides WebUI static root (`verify-web-deploy.ps1`) |
| Other `Section:Key=value` pairs | Bound to matching configuration sections (`CoreServer`, `ServerApp`, etc.) per `appsettings.json` schema |

**AppImage-only arguments** (`--help`, `-h`, `--install`) are handled by the **bash `AppRun` wrapper** in `tools/scripts/lib/appimage-helpers.sh`, not by the .NET process. The .NET ServerApp does not implement `--install`.

**Unrecognized arguments:** No custom parser exists. Non-configuration arguments are not explicitly handled in application code; behavior follows ASP.NET Core / hosting defaults (configuration-style `--Section:Key=Value` tokens are consumed; others are not documented in-repo).

#### DesktopApp

`args` is passed to `StartWithClassicDesktopLifetime(args)` only. **No application-specific argument handling** was found in the desktop codebase (grep for `GetCommandLineArgs`, custom parsers, etc. returned no matches).

**Unrecognized arguments:** Not handled explicitly; Avalonia/desktop lifetime receives them with no documented custom behavior in this repository.

### Update-check / self-update mechanisms

**Neither app implements an update-check, version-check, or self-update mechanism** in application code. Repository search found no Velopack, AutoUpdater, or similar integration.

Related but distinct:

- **API version/capability gating** between desktop/WebUI clients and server (`/api/version`, `/api/capabilities`) — compatibility checks, not self-update.
- **`RestartCoordinator.TryLaunchReplacementProcess`** — self-**restart** on operator/tray request when `EnableSelfRestart` is true; launches a new process via `Environment.ProcessPath`, not a download/update flow.

---

## Section 3 — WebUI build and static assets

### How Vite output reaches server `wwwroot`

**There is no MSBuild target in `ReelRoulette.ServerApp.csproj` that builds or copies WebUI assets.**

WebUI reaches the published server through **packaging scripts** (and dev helpers), as a **separate step after `dotnet publish`**:

1. `npm install` + `npm run build` in `src/clients/web/ReelRoulette.WebUI`
2. Copy `dist/*` → `{publishDir}/wwwroot/`
3. Copy `assets/HI.ico` → `{publishDir}/wwwroot/HI.ico`

Evidence (Windows server portable):

```83:127:tools/scripts/package-serverapp-win-portable.ps1
    Push-Location $webUiProjectDir
    try {
        npm install
        ...
        npm run build
        ...
    }
    ...
    dotnet publish $projectPath `
        ...
    $publishWebRoot = Join-Path $publishDir "wwwroot"
    New-Item -ItemType Directory -Force -Path $publishWebRoot | Out-Null
    Copy-Item -Recurse -Force (Join-Path $webUiDistPath "*") $publishWebRoot
    Copy-Item -Force $sharedIconPath (Join-Path $publishWebRoot "HI.ico")
```

Linux server portable mirrors the same pattern (`package-serverapp-linux-portable.sh` lines 73–110).

**At runtime (dev):** `tools/scripts/run-server.ps1` sets `ServerApp__WebUiStaticRootPath` to `src/clients/web/ReelRoulette.WebUI/dist` when unset.

**At runtime (published):** `Program.cs` resolves static root — explicit config path, repo `dist` fallback for dev layouts, then **`{ContentRootPath}/wwwroot`**:

```1093:1119:src/core/ReelRoulette.ServerApp/Program.cs
static string? ResolveWebUiStaticRoot(string contentRootPath, string? explicitPath)
{
    ...
    var localWwwroot = Path.Combine(contentRootPath, "wwwroot");
    if (Directory.Exists(localWwwroot))
    {
        return localWwwroot;
    }

    return null;
}
```

**`tools/scripts/publish-web.ps1`** publishes WebUI to `.web-deploy/versions/{VersionId}/` for versioned deploy experiments; it is **not** wired into `dotnet publish` or the main packaging scripts.

### npm scripts in WebUI package

From `src/clients/web/ReelRoulette.WebUI/package.json`:

| Script | Command |
|--------|---------|
| `sync:icon` | `node ./scripts/sync-shared-icon.mjs` |
| `predev` | `npm run sync:icon` |
| `prebuild` | `npm run sync:icon` |
| `dev` | `vite` |
| `build` | `vite build` |
| `preview` | `vite preview` |
| `generate:contracts` | `openapi-typescript ...` |
| `verify:contracts` | `node ./scripts/verify-openapi-contracts-fresh.mjs` |
| `typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| `test` | `vitest run` |
| `verify:build-output` | `node ./scripts/verify-build-output.mjs` |
| **`verify`** | **`npm run verify:contracts && npm run typecheck && npm run test && npm run build && npm run verify:build-output`** |

### What `npm run verify` checks

1. **`verify:contracts`** — Regenerates OpenAPI TypeScript to a temp file and asserts `src/types/openapi.generated.ts` matches (staleness gate).
2. **`typecheck`** — TypeScript compile check.
3. **`test`** — Vitest unit tests.
4. **`build`** — Vite production build to `dist/`.
5. **`verify:build-output`** — Asserts `dist/` contains `index.html`, `runtime-config.json`, `manifest.webmanifest`, `sw.js`, PWA icons (192/512/apple-touch), `assets/`, and valid runtime-config JSON fields.

### What `tools/scripts/verify-web-deploy.ps1` checks

1. Runs `npm install` + `npm run build` in WebUI.
2. Starts ServerApp via `dotnet run` with `--ServerApp:WebUiStaticRootPath={dist}` and a test listen URL.
3. Smoke tests: `/health` 200, `/` non-empty HTML, `/runtime-config.json` with `Cache-Control: no-store` and correct URLs, fingerprinted `/assets/*` with immutable cache, `/api/capabilities` 200, `/control/settings` GET/POST 200.

### Does published ServerApp output contain WebUI without an additional step?

**No.** A bare `dotnet publish` of ServerApp does **not** populate `wwwroot` with WebUI assets in this repository. Packaging scripts always run the npm build + copy steps **after** publish.

**Evidence:** Packaging scripts (quoted above) and absence of WebUI copy targets in `ReelRoulette.ServerApp.csproj`. `docs/dev-setup.md` states: *"Server packaging scripts run WebUI build and bundle static assets into ServerApp publish output (`wwwroot`)"*.

The published **packaged** tree (after packaging script completes) **does** include WebUI under `wwwroot/` because the script copies `dist/` there before staging the final artifact.

---

## Section 4 — Native dependencies

### `tools/scripts/fetch-native-deps.ps1`

**Platform:** Windows only (exits with error on non-Windows).

**Downloads / copies:**

| Component | Source | Destination | Validation |
|-----------|--------|-------------|------------|
| **FFmpeg + ffprobe** | `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip` | `runtimes/win-x64/native/ffmpeg.exe`, `ffprobe.exe` | SHA-256 from `${url}.sha256`; version stamp from `${url}.ver` stored in `runtimes/win-x64/native/.versions.json` |
| **LibVLC** | Primary: NuGet global cache `videolan.libvlc.windows/{version}/build/x64/*` after `dotnet restore` on DesktopApp csproj; fallback: `https://get.videolan.org/vlc/{ver}/win64/vlc-{ver}-win64.zip` | `runtimes/win-x64/native/libvlc/` (includes `libvlc.dll`, `plugins/`) | SHA-256 on mirror fallback; presence checks for `libvlc.dll` and `plugins/` at end |

**Skip logic:** Reuses existing files when `.versions.json` matches remote FFmpeg version and LibVLC package version unless `-Force`.

### Which app requires which native dependency

| Dependency | Required by | Expected runtime location (Windows) | Expected runtime location (Linux) |
|------------|-------------|-------------------------------------|-----------------------------------|
| **FFmpeg / ffprobe** | **ServerApp** (refresh pipeline: duration, loudness, thumbnails) | Bundled in **Windows packages:** `{AppDir}/runtimes/win-x64/native/ffmpeg.exe` and `ffprobe.exe`. Resolution code also falls back to bare `ffmpeg.exe` / `ffprobe.exe` on PATH. | **Not bundled.** `ResolveFfmpegPath` / `ResolveFfprobePath` fall back to **`ffmpeg`** / **`ffprobe` on PATH** (distro packages). Documented in portable `README.txt` and AppImage `--help`. |
| **LibVLC** | **DesktopApp** (local playback via LibVLCSharp) | Bundled in **Windows desktop packages:** `{AppDir}/runtimes/win-x64/native/libvlc/`. `NativeBinaryHelper.GetLibVlcPath()` probes that path first. | **Not bundled.** `Program.cs` tries bundled path (empty on Linux packages), then `Core.Initialize()` system LibVLC. Portable/AppImage docs expect **distro VLC/LibVLC**. |

Server resolution (quoted):

```1949:1963:src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs
    private static string ResolveFfmpegPath()
    {
        var exeDir = AppContext.BaseDirectory;
        var rid = GetRuntimeIdentifier();
        if (!string.IsNullOrWhiteSpace(rid))
        {
            var exeName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg";
            var bundled = Path.Combine(exeDir, "runtimes", rid, "native", exeName);
            if (File.Exists(bundled))
            {
                return bundled;
            }
        }

        return RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg";
    }
```

Desktop bundled path probe:

```22:34:src/clients/desktop/ReelRoulette.DesktopApp/NativeBinaryHelper.cs
                var exeDir = AppContext.BaseDirectory;
                var rid = GetRuntimeIdentifier();
                ...
                var libVlcDir = Path.Combine(exeDir, "runtimes", rid, "native", "libvlc");

                _cachedLibVlcPath = Directory.Exists(libVlcDir) ? libVlcDir : "";
```

### Automatic invocation of `fetch-native-deps.ps1`

**Not invoked by `dotnet build` or `dotnet publish` directly.** Invoked **conditionally from Windows packaging scripts** when `runtimes/win-x64/native/` is incomplete.

**Call sites (grep):**

- `tools/scripts/package-serverapp-win-portable.ps1` — function `Invoke-EnsureWinX64NativeDeps`
- `tools/scripts/package-serverapp-win-inno.ps1` — same
- `tools/scripts/package-desktop-win-portable.ps1` — same
- `tools/scripts/package-desktop-win-inno.ps1` — same

Typical guard (server portable):

```26:32:tools/scripts/package-serverapp-win-portable.ps1
    $need = -not (Test-Path (Join-Path $nativeRoot "ffmpeg.exe")) `
        -or -not (Test-Path (Join-Path $nativeRoot "ffprobe.exe")) `
        -or -not (Test-Path (Join-Path $nativeRoot "libvlc\libvlc.dll"))
    if ($need) {
        $fetch = Join-Path $PSScriptRoot "fetch-native-deps.ps1"
        & $fetch -RepoRoot $Root
    }
```

**Manual invocation:** Documented in `README.md`, `docs/dev-setup.md`, and `CONTEXT.md` for Windows developers: `pwsh ./tools/scripts/fetch-native-deps.ps1`.

### Linux native dependency satisfaction and documentation

Linux packaging **does not download or bundle** FFmpeg or LibVLC. Expectations are documented in:

- `tools/scripts/package-serverapp-linux-portable.sh` — `README.txt` inside tarball
- `tools/scripts/package-desktop-linux-portable.sh` — `README.txt`
- `tools/scripts/lib/appimage-helpers.sh` — `--help` text in AppRun
- `README.md` — Prerequisites and Third-Party Components
- `docs/dev-setup.md` — Prerequisites and Linux packaging sections
- `CONTEXT.md` — operational surfaces bullet on Windows vs Linux native deps

Example tarball README (server):

```136:148:tools/scripts/package-serverapp-linux-portable.sh
cat > "$STAGING_DIR/README.txt" << 'EOF'
ReelRoulette Server (Linux portable)

This package is self-contained: a separate .NET runtime install is not required.

Native prerequisites are not bundled. Install ffmpeg (including ffprobe) and VLC /
LibVLC from your distribution if you need media features that depend on them.
...
EOF
```

---

## Section 5 — Current packaging surface

### Files under `tools/scripts/`, `tools/installer/`, `.github/workflows/`

#### `tools/scripts/`

| File | Role |
|------|------|
| `fetch-native-deps.ps1` | Windows-only: download/stage FFmpeg and LibVLC into `runtimes/win-x64/native/` |
| `full-release.ps1` | Chained release packaging on current OS (optional `set-release-version`, then all platform-appropriate package scripts) |
| `set-release-version.ps1` | Fan-out release version to OpenAPI, assetsVersion, csproj `<Version>`, docs, optional verify |
| `package-serverapp-win-portable.ps1` | Windows server self-contained publish + WebUI → `wwwroot` + native FFmpeg → portable ZIP |
| `package-serverapp-win-inno.ps1` | Same publish staging as portable, then Inno Setup installer EXE |
| `package-desktop-win-portable.ps1` | Windows desktop self-contained publish + LibVLC staging → portable ZIP |
| `package-desktop-win-inno.ps1` | Same publish staging as desktop portable, then Inno Setup installer EXE |
| `package-serverapp-linux-portable.sh` | Linux server self-contained publish + WebUI → `wwwroot` → `.tar.gz` + `run-server.sh` |
| `package-desktop-linux-portable.sh` | Linux desktop self-contained publish → `.tar.gz` + `run-desktop.sh` |
| `package-serverapp-linux-appimage.sh` | Builds server portable tar, then assembles AppImage via helpers |
| `package-desktop-linux-appimage.sh` | Builds desktop portable tar, then assembles AppImage via helpers |
| `lib/appimage-helpers.sh` | Shared AppImage assembly, AppRun (`--help`, `--install`), desktop entries |
| `install-linux-from-github.sh` | End-user install from GitHub latest release (AppImage preferred, tar fallback) |
| `install-linux-local.sh` | Copy locally built AppImages to `~/.local/share/ReelRoulette/` and run `--install` |
| `verify-linux-packaged-server-smoke.sh` | Headless HTTP smoke against packaged server tar (`/health`, `/api/version`, `/control/status`, `/operator`) |
| `verify-web.ps1` | Wrapper: `npm run verify` in WebUI |
| `verify-web-deploy.ps1` | WebUI build + single-origin ServerApp integration smoke |
| `publish-web.ps1` | Versioned copy of WebUI `dist/` to `.web-deploy/versions/` |
| `run-server.ps1` | Dev helper: env vars + `dotnet run` ServerApp with dist path |
| `run-server-rebuild.ps1` | Dev helper: rebuild WebUI then run server (not fully enumerated here; same family as `run-server.ps1`) |
| `reset-checklist.ps1` | Resets manual testing checklist state in `docs/checklists/testing-checklist.md` |

#### `tools/installer/`

| File | Role |
|------|------|
| `ReelRoulette.ServerApp.iss` | Inno Setup script for server Windows installer |
| `ReelRoulette.Desktop.iss` | Inno Setup script for desktop Windows installer |

#### `.github/workflows/`

| File | Role |
|------|------|
| `ci.yml` | PR/push CI: build/test (Linux + Windows), WebUI `npm run verify` |
| `package-windows.yml` | Tag or manual dispatch: Windows portable ZIPs + Inno EXEs; upload artifacts and attach to GitHub release on tag |
| `package-linux.yml` | Tag or manual dispatch: Linux portable tarballs + AppImages; packaged-server smoke; upload artifacts and attach to release on tag |

### End-to-end flow: `full-release.ps1`

**Version supply:**

- With **`-Version <ver>`:** runs `set-release-version.ps1` first (unless skipped internally), then passes `-Version` to each packaging script.
- **Without `-Version`:** skips `set-release-version`; each packaging script reads `<Version>` from its target `.csproj`.

**Steps (in order):**

1. Set release version + verify (conditional)
2. Package server portable (Windows or Linux only)
3. Package server installer (Windows Inno only; skipped on Linux)
4. Package desktop portable (Windows or Linux)
5. Package desktop installer (Windows Inno only)
6. Package server AppImage (Linux only)
7. Package desktop AppImage (Linux only)

**Artifact output roots:** `artifacts/packages/` with subfolders `portable/`, `installer/` (Windows), `appimage/` (Linux). Intermediate publishes under `artifacts/publish/`.

### Artifact naming convention

| App | Platform | Package type | Filename pattern | Output directory |
|-----|----------|--------------|------------------|------------------|
| Server | Windows | Portable | `ReelRoulette-Server-{Version}-win-x64.zip` | `artifacts/packages/portable/` |
| Server | Windows | Inno installer | `ReelRoulette-Server-{Version}-win-x64-setup.exe` | `artifacts/packages/installer/` |
| Desktop | Windows | Portable | `ReelRoulette-Desktop-{Version}-win-x64.zip` | `artifacts/packages/portable/` |
| Desktop | Windows | Inno installer | `ReelRoulette-Desktop-{Version}-win-x64-setup.exe` | `artifacts/packages/installer/` |
| Server | Linux | Portable tarball | `ReelRoulette-Server-{Version}-linux-x64.tar.gz` | `artifacts/packages/portable/` |
| Desktop | Linux | Portable tarball | `ReelRoulette-Desktop-{Version}-linux-x64.tar.gz` | `artifacts/packages/portable/` |
| Server | Linux | AppImage | `ReelRoulette-Server-{Version}-linux-x64.AppImage` | `artifacts/packages/appimage/` |
| Desktop | Linux | AppImage | `ReelRoulette-Desktop-{Version}-linux-x64.AppImage` | `artifacts/packages/appimage/` |

Inno `OutputBaseFilename` definitions:

```24:24:tools/installer/ReelRoulette.ServerApp.iss
OutputBaseFilename=ReelRoulette-Server-{#AppVersion}-win-x64-setup
```

```24:24:tools/installer/ReelRoulette.Desktop.iss
OutputBaseFilename=ReelRoulette-Desktop-{#AppVersion}-win-x64-setup
```

**Stable install names (Linux AppImage after `--install` or `install-linux-local.sh`):**

- `~/.local/share/ReelRoulette/ReelRoulette-Server-linux-x64.AppImage`
- `~/.local/share/ReelRoulette/ReelRoulette-Desktop-linux-x64.AppImage`

(version segment stripped from artifact basename)

### Linux install scripts behavior

#### `install-linux-from-github.sh`

- **AppImage path:** Downloads latest matching asset, installs to `REELROULETTE_LOCAL_APPIMAGE_DIR` or **`~/.local/share/ReelRoulette/`** with stable filename, runs **`$DEST --install`** to register menu + icons.
- **Tarball fallback:** Extracts to **`~/.local/share/ReelRoulette/{server|desktop}/{version}/`**, creates **`~/.local/bin/{reelroulette-server|reelroulette-desktop}`** symlink to `run-server.sh` / `run-desktop.sh`, writes **`~/.local/share/applications/{reelroulette-server|reelroulette-desktop}.desktop`**, fetches **HI-256/512 PNG** icons from GitHub raw `assets/`.

#### `install-linux-local.sh`

- Copies built `artifacts/packages/appimage/ReelRoulette-*.AppImage` → **`~/.local/share/ReelRoulette/`** (stable names), runs each with **`--install`**.

#### AppImage `--install` (via `appimage-helpers.sh` AppRun)

- Writes desktop file to **`$HOME/.local/share/applications/{icon_stem}.desktop`**
- Installs PNG icons to **`~/.local/share/icons/hicolor/{256x256,512x512}/apps/`**
- Desktop **`Exec=`** uses **`$APPIMAGE`** path (stable on-disk AppImage location)

#### Windows Inno installers

- Default install dir: **`{autopf}\ReelRoulette Server`** / **`{autopf}\ReelRoulette Desktop`**
- Start Menu + optional desktop shortcut to **`{app}\ReelRoulette.ServerApp.exe`** / **`ReelRoulette.DesktopApp.exe`**

---

## Section 6 — Versioning

### Places version is defined or injected

| Location | Current example / role |
|----------|------------------------|
| `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` | `<Version>0.12.0-dev</Version>` — server assembly/package version |
| `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj` | `<Version>0.12.0-dev</Version>` — desktop assembly/package version |
| `src/clients/desktop/ReelRoulette.LibraryArchive/ReelRoulette.LibraryArchive.csproj` | `<Version>0.11.0-dev</Version>` — **separate/stale relative to main apps** |
| `src/clients/web/ReelRoulette.WebUI/package.json` | `"version": "0.1.0"` — npm package only; **not** aligned by `set-release-version.ps1` |
| `shared/api/openapi.yaml` | `info.version: 0.12.0-dev` |
| `src/core/ReelRoulette.Server/Services/ServerStateService.cs` | `assetsVersion: "0.12.0-dev"` in `/api/version` payload |
| `src/core/ReelRoulette.Core.Tests/ServerContractTests.cs` | Test fixture `assetsVersion` + assertion |
| `src/clients/web/ReelRoulette.WebUI/src/test/authBootstrap.test.ts` | Test fixture `assetsVersion` |
| `src/Directory.Build.props` | **No version properties** |
| `tools/scripts/set-release-version.ps1` | `-Version` parameter drives fan-out |
| `tools/scripts/full-release.ps1` | Optional `-Version` forwarded to packaging scripts |
| `tools/scripts/package-*.ps1` / `package-*.sh` | Optional `-Version`; else read from target `.csproj` |
| `.github/workflows/package-windows.yml` | `inputs.version` default `"0.9.0"`; tag push uses `github.ref_name` stripped of `v` prefix |
| `.github/workflows/package-linux.yml` | Same pattern as Windows workflow |
| `README.md` / `docs/dev-setup.md` | Example commands updated by `set-release-version.ps1` |

**No explicit `AssemblyVersion`, `FileVersion`, or `InformationalVersion` properties** exist in `.csproj` files (grep returned no matches). SDK derives assembly metadata from `<Version>`.

### `.version` file at repository root

**Does not exist.** No `.version` file was found in the repository root (glob search returned zero files).

### Single source of truth for release version

**De facto:** The **ServerApp and DesktopApp `<Version>` properties** in their `.csproj` files (currently both `0.12.0-dev`), plus **`set-release-version.ps1`** to synchronize related surfaces when cutting a release.

There is **no single machine-readable root file** (such as `.version`) consumed by all tooling. Packaging scripts read `.csproj` when `-Version` is omitted.

### Version format

- **In use:** Three-part numeric with optional **`-dev`** prerelease suffix (e.g. **`0.12.0-dev`**).
- **Four-part versions (e.g. `1.2.3.4`):** **Not defined** anywhere in current version sources. No explicit four-part `AssemblyVersion` overrides were found.

---

## Section 7 — Startup and installed-path assumptions

### "Launch Server on Startup"

#### Windows

**Implementation:** `WindowsStartupLaunchService` — **`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`**, value name **`ReelRoulette.ServerApp`**.

**Stored value:** **Yes — absolute path to the executable**, quoted:

```109:111:src/core/ReelRoulette.ServerApp/Hosting/WindowsStartupLaunchService.cs
            if (enabled)
            {
                runKey.SetValue(RunValueName, QuoteExecutable(executablePath), RegistryValueKind.String);
```

`executablePath` = `Environment.ProcessPath`. **Not available when running under `dotnet` host** (explicitly rejected).

#### Linux

**Implementation:** `LinuxXdgStartupLaunchService` — writes **`~/.config/autostart/reelroulette-server.desktop`** (or `$XDG_CONFIG_HOME/autostart/`).

**Stored value:** **`Exec="{absolute path}"`** where path prefers **`APPIMAGE`** env var when running as AppImage, else **`Environment.ProcessPath`**:

```136:158:src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs
    private static string BuildDesktopEntryContent(string executablePath)
    {
        var lines = new List<string>
        {
            "[Desktop Entry]",
            ...
        };

        var exeDir = Path.GetDirectoryName(executablePath);
        if (!string.IsNullOrEmpty(exeDir))
        {
            lines.Add($"Path={exeDir}");
        }

        lines.Add($"Exec=\"{executablePath}\"");
```

**Also sets `Path=`** to the executable's directory (working directory at login).

AppImage `--install` desktop entries use **`Exec=$APPIMAGE %U`** (stable installed AppImage path), documented in `appimage-helpers.sh`.

### Other absolute executable / install-directory assumptions

| Location | Assumption |
|----------|------------|
| `Program.cs` | `ContentRootPath = AppContext.BaseDirectory` — config, default `wwwroot`, tray icon `HI.ico` beside binaries |
| `Program.cs` `RestartCoordinator.TryLaunchReplacementProcess` | Uses `Environment.ProcessPath` (or `dotnet` + entry assembly path) to spawn replacement server |
| `WindowsStartupLaunchService` / `LinuxXdgStartupLaunchService` | Persist `Environment.ProcessPath` / `APPIMAGE` for autostart |
| `NativeBinaryHelper` | LibVLC under `{AppContext.BaseDirectory}/runtimes/{rid}/native/libvlc` |
| `RefreshPipelineService` | FFmpeg/ffprobe under `{AppContext.BaseDirectory}/runtimes/{rid}/native/` on Windows packages |
| `ResolveSharedIconPath` | Tray icon at `{AppContext.BaseDirectory}/HI.ico` first |
| Linux packaging `run-server.sh` / `run-desktop.sh` | `cd` to script directory (install folder) before exec |
| Inno installers | Shortcuts target `{app}\*.exe` under `{autopf}\ReelRoulette Server|Desktop` |
| `install-linux-from-github.sh` (tarball) | **`Exec=`** points to **`run-server.sh`** inside versioned extract dir; **`~/.local/bin` symlink** to that script |

**Nothing in-repo abstracts “application install root” through a stable symlink** except Linux AppImage stable filenames and `~/.local/bin` launcher symlinks for tarball installs.

### User data, configuration, library state, thumbnails, backups

All paths below are **outside the install directory** (roaming/local app data). **No user data is stored inside the published app folder** by default.

| Data | Location | Owner |
|------|----------|-------|
| **Core settings** | `%ApplicationData%/ReelRoulette/core-settings.json` (Linux: `~/.config/ReelRoulette/`) | Server / `CoreSettingsService` |
| **Library state** | `%ApplicationData%/ReelRoulette/library.json` | Server services |
| **Presets** | `%ApplicationData%/ReelRoulette/presets.json` | `ServerStateService` |
| **Backups** | `%ApplicationData%/ReelRoulette/backups/` | `CoreSettingsService` and related |
| **Thumbnails** | `%LocalApplicationData%/ReelRoulette/thumbnails/` (Linux: `~/.local/share/ReelRoulette/thumbnails/`) | `RefreshPipelineService` |
| **Server log (operator)** | `%ApplicationData%/ReelRoulette/last.log` | `ServerLogService` / `ResetServerLastLog` |
| **Desktop settings** | `%ApplicationData%/ReelRoulette/desktop-settings.json` | `AppDataManager` |
| **Desktop backups dir** | `%ApplicationData%/ReelRoulette/backups/` | `AppDataManager.GetBackupDirectoryPath()` |

Documented in `docs/dev-setup.md` § User data locations.

**Bundled in install dir (not user data):** `appsettings.json`, `wwwroot/` (after packaging), `HI.ico`, native `runtimes/` (Windows), .NET runtime files.

---

## Section 8 — Documentation and checklist references

Sections referencing Inno Setup, AppImage, portable archives, install scripts, or the current release flow. Format: **heading** — excerpt.

### `README.md`

| Heading | Excerpt |
|---------|---------|
| **Prerequisites** | *"Windows installer builds additionally need Inno Setup 6 (`iscc`)"*; Linux portable packaging scripts; `fetch-native-deps.ps1` for Windows native deps; Linux portable tarballs do not bundle FFmpeg/LibVLC. |
| **Quick Start → Windows** | *"Installer (easiest)… `ReelRoulette-Server-…-win-x64-setup.exe`"*; *"Portable ZIP… `ReelRoulette-Server-…-win-x64.zip`"*. |
| **Quick Start → Linux** | `install-linux-from-github.sh`; AppImage `--install`; portable tarball extract + `run-server.sh`. |
| **Helper Scripts** | XDG autostart / **`APPIMAGE`** stable path note for Launch Server on Startup. |
| **Verification** | `set-release-version.ps1`, `full-release.ps1` behavior and `-No*` switches. |
| **Packaging → Linux Packaging** | Portable tarballs, AppImages, `install-linux-local.sh`, `install-linux-from-github.sh`, artifact paths under `artifacts/packages/`. |
| **Packaging → Windows Packaging** | `package-*-win-*.ps1`, Inno, `fetch-native-deps.ps1` staging. |
| **Packaging → General** | `full-release.ps1 -Version …`; CI tag workflows upload to GitHub release. |
| **Third-Party Components** | Windows bundles FFmpeg/LibVLC; Linux uses distro packages. |

### `docs/dev-setup.md`

| Heading | Excerpt |
|---------|---------|
| **Prerequisites** | PowerShell 7+, Inno Setup 6, `fetch-native-deps.ps1`, Linux portable native prereqs. |
| **Recommended Local Run Paths → Run ServerApp** | Linux packaged/binary autostart + `ContentRootPath = AppContext.BaseDirectory`. |
| **User data locations** | XDG vs Windows paths for library, thumbnails, backups. |
| **Windows Packaging** | Portable + Inno script names; WebUI → `wwwroot`; native staging; desktop shortcut tasks. |
| **Release Versioning** | `set-release-version.ps1`, surfaces updated, `full-release.ps1`, GitHub tag upload flow for `package-windows.yml` / `package-linux.yml`. |
| **Linux packaging (portable)** | Script names, artifact filenames, `run-server.sh` / `run-desktop.sh`. |
| **Linux AppImage (server + Desktop)** | `appimagetool` requirement, `--help` / `--install`. |
| **Install local AppImage build (Linux)** | `install-linux-local.sh`, stable filenames in `~/.local/share/ReelRoulette/`. |
| **Install latest release from GitHub (Linux)** | `install-linux-from-github.sh`, AppImage vs tarball paths. |
| **Troubleshooting → Installer build fails** | Confirm Inno Setup 6; rerun `package-*-win-inno.ps1`. |

### `docs/architecture.md`

| Heading | Excerpt |
|---------|---------|
| **Runtime Host Behavior** (startup launch bullet) | Linux XDG autostart with **`APPIMAGE`** vs process path; content root pinned to `AppContext.BaseDirectory`. |
| **Packaging and Delivery** | Portable and installer outputs; AppImages; GitHub install helper; CI packaging workflows attach artifacts to releases. |

### `CONTEXT.md`

| Heading | Excerpt |
|---------|---------|
| **Current Implemented Capabilities → Server host** | Windows HKCU vs Linux XDG autostart details. |
| **Operational surfaces** | `ci.yml`, `package-windows.yml`, `package-linux.yml`; Linux portable/AppImage scripts; `install-linux-from-github.sh`, `install-linux-local.sh`; Windows Inno desktop shortcut tasks; `fetch-native-deps.ps1`. |
| **Repository Map → tools/scripts/** | `set-release-version.ps1`, `full-release.ps1`, packaging script inventory. |

### `docs/checklists/testing-checklist.md`

| Heading | Excerpt |
|---------|---------|
| **ServerApp Tray + Lifecycle** | Packaged portable/installer server tray/headless behavior. |
| **Packaging + Deployment Smoke** | Windows portable/installer builds; Linux tarballs/AppImages; `install-linux-local.sh`; Inno desktop shortcut default; branding. |
| **CI/Workflow Readiness** | `package-windows.yml` and `package-linux.yml` runnable. |
| **Release sign-off** (if present in tail) | Reference to `full-release.ps1 -Version {VERSION}` for package creation (line ~197 in grep). |

---

## Ambiguities and resolution paths

| Topic | Status |
|-------|--------|
| Exact **assembly file version quadruple** generated at compile time from `<Version>0.12.0-dev</Version>` | Not overridden in repo; would require inspecting built assembly metadata or MSBuild/SDK docs to confirm numeric `AssemblyVersion` mapping for prerelease strings. |
| **Desktop unrecognized CLI args** | No explicit handling; Avalonia default behavior not documented in-repo. |
| **`ReelRoulette.LibraryArchive` version drift** (`0.11.0-dev` vs apps at `0.12.0-dev`) | Observed in csproj; not updated by `set-release-version.ps1` (only ServerApp + DesktopApp). |

---

Report only — no repository changes except this file.
