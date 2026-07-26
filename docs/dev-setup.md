# Development Setup

This guide covers local setup, run paths, verification gates, packaging, and release-version workflow for the current ReelRoulette runtime.

## Prerequisites

- .NET SDK (matching solution target; verify with `dotnet --version`)
- Node.js + npm (for WebUI build/verify; verify with `node --version` and `npm --version`)
- PowerShell Core (`pwsh`) for repository scripts under `tools/scripts/` (for example `pwsh ./tools/scripts/run-server.ps1`).
  - Windows: install PowerShell 7+ with `winget install Microsoft.PowerShell` so `pwsh` is on your PATH. Built-in Windows PowerShell 5.1 is not enough for scripts that rely on PowerShell 7+; use `pwsh` after install (restart the terminal or Cursor if `pwsh` is not found until PATH refreshes).
  - Linux (Arch Linux, CachyOS, and similar): install from the AUR, for example `paru -S powershell-bin` or `yay -S powershell-bin`; that package provides `pwsh` on your PATH.
- VLC / LibVLC for desktop video playback when running from source; FFmpeg (with `ffprobe` on `PATH`) on the **server** for library refresh (duration, loudness, thumbnails). Install from your OS on Linux and for local Windows `dotnet run`. **Velopack** Windows server packages bundle FFmpeg/ffprobe; Windows desktop packages bundle LibVLC. Linux AppImages bundle neither—LibVLCSharp requires the unversioned **`libvlc.so`** symlink: use **`libvlc-dev`** on Debian/Ubuntu/Mint, **`vlc-devel`** on Fedora and openSUSE (Packman on openSUSE), in addition to **`vlc`**. If the desktop AppImage is launched without LibVLC, it shows a copy-paste install command for the detected distro family.

## Key Projects

- Desktop app: `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj`
- Core domain: `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- Server transport: `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`
- Default runtime host: `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj`
- WebUI client: `src/clients/web/ReelRoulette.WebUI/ReelRoulette.WebUI.csproj`
- Core tests: `src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj`
- System-check harness: `src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj`

## Recommended Local Run Paths

### Run ServerApp (default consolidated runtime)

- Direct:
  - Windows (`net10.0-windows`): `dotnet run --framework net10.0-windows --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj`
  - Linux/macOS (`net10.0`): `dotnet run --framework net10.0 --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` (Avalonia tray when the session supports it; otherwise headless)
- Scripted (from repo root):
  - `pwsh ./tools/scripts/run-server.ps1`

Runtime notes:

- API, SSE, media, and WebUI are served from the same host.
- Operator UI is available at `/operator`.
- Runtime config for WebUI is served at `/runtime-config.json` when WebUI is enabled.
- Default listen URL/port is `http://localhost:45123` unless overridden by runtime settings or script parameters.
- Windows runtime uses tray-hosted ServerApp behavior (no visible command prompt when launched as app binary). On Linux, tray appears when a status notifier/tray is available; otherwise the host runs headless deterministically.
- `Launch Server on Startup` can be toggled from tray and Operator control settings and applies immediately (no restart required).
- **Linux packaged/binary:** XDG autostart writes `reelroulette-server.desktop` with `Exec=`/`Path=` from the stable server path (**`APPIMAGE`** when running an AppImage, so autostart does not capture `/tmp/.mount_*`); ServerApp sets ASP.NET `ContentRootPath` to `AppContext.BaseDirectory` so login autostart still loads `appsettings` and `wwwroot` when cwd is not the install folder.

### Run ServerApp with WebUI rebuild

Use when you want to ensure web assets are freshly rebuilt before startup:

- `pwsh ./tools/scripts/run-server-rebuild.ps1`

### Run Desktop app

- **`dotnet run`** on Windows uses the **VideoLAN.LibVLC.Windows** NuGet copy under **`libvlc/win-x64/`** in the build output. Packaged Windows desktop builds load **`runtimes/win-x64/native/libvlc/`** instead.
- `dotnet run --project ./src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj`

Desktop behavior notes:

- Desktop is API/SSE thin-client orchestration for migrated flows.
- Desktop playback can run local-first with API fallback (or force API mode via settings).

## API and Control Surfaces (High-Signal)

- Metadata and compatibility:
  - `/health`
  - `/api/version`
  - `/api/capabilities`
- Core events:
  - `/api/events`
- Operator/control plane:
  - `/operator`
  - `/control/status`
  - `/control/settings`
  - `/control/startup`
  - `/control/pair`
  - `/control/restart`
  - `/control/stop`
  - `/control/logs/server`
  - `/control/testing`

## Verification Workflow

### Baseline gates

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`

### WebUI verification

From `src/clients/web/ReelRoulette.WebUI`:

- `npm install` (first run)
- `npm run verify`
- `npm run dev`/`npm run build` auto-sync shared assets into WebUI `public/`:
  - `assets/HI.ico` -> `public/HI.ico`
  - PWA icons: `scripts/sync-shared-icon.mjs` uses **`sharp`** to write `public/icons/icon-192.png` (192×192), `public/icons/icon-512.png` (512×512), and `public/icons/apple-touch-icon.png` (180×180) from `assets/HI-256.png` / `HI-512.png` (manifest `sizes` must match pixel dimensions)
  - PWA service worker: `public/sw.js` (copied to `dist/` root) is registered from `src/main.ts` in secure contexts; network-only `fetch` handler satisfies Chromium installability for standalone install on Android Chrome. `ServerApp` sets `Cache-Control: no-store` for `sw.js` when serving WebUI static files.
  - `assets/fonts/MaterialSymbolsOutlined.var.ttf` -> `public/assets/fonts/MaterialSymbolsOutlined.var.ttf`

Optional helper scripts:

- `pwsh ./tools/scripts/verify-web.ps1`
- `pwsh ./tools/scripts/verify-web-deploy.ps1`

### Optional system checks

- `dotnet run --project ./src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj -- --verbose`

For broader manual passes, use `docs/checklists/testing-checklist.md` and `pwsh ./tools/scripts/reset-checklist.ps1`.

## Auth, CORS, and Runtime Settings Notes

- Pairing/auth is server enforced via `/api/pair` and runtime policy.
- Browser-client CORS and cookie behavior is controlled by `CoreServer` settings.
- Some settings changes require restart to fully apply (for example listen/auth/WebUI availability changes); use `/control/restart` or restart the process.
- `FormOptions.MultipartBodyLengthLimit` is set to **512 MB** in `src/core/ReelRoulette.ServerApp/Program.cs` for any future multipart endpoints; **no shipped API route currently uses multipart uploads**, so this is host-level configuration only for now.

## Logging and Diagnostics

- Server diagnostics are available through `last.log` and `/control/logs/server`.
- Clients can relay logs to server ingestion endpoint:
  - `POST /api/logs/client`
- Connected client/session diagnostics are available in Operator UI and `/control/status`.

## User data locations

Per-user data uses .NET `Environment.SpecialFolder` mappings:

- **Linux** (XDG): config / roaming (`ApplicationData`) → `~/.config/ReelRoulette/` (includes `library.json`). Local cache (`LocalApplicationData`) → `~/.local/share/ReelRoulette/` (thumbnails in `thumbnails/`).
- **Windows**: config / roaming (`ApplicationData`) → `%APPDATA%/ReelRoulette/`. Local cache (`LocalApplicationData`) → `%LOCALAPPDATA%/ReelRoulette/` (thumbnails in `thumbnails/`).

## Velopack packaging and release

All shipping packages are produced by **`.github/workflows/release.yml`** (tag push or `workflow_dispatch`). The workflow:

- Validates `.version` against the requested tag.
- Builds **ServerApp** and **DesktopApp** self-contained for `win-x64` and `linux-x64`.
- Stages WebUI via **`stage-webui-assets.ps1`** on server legs.
- Bundles Windows FFmpeg (server) and relocates NuGet LibVLC (desktop) inline on Windows legs.
- Packs with **`vpk`** and uploads feeds to Backblaze B2; stable tags also mirror assets to GitHub Releases.

Windows output is a per-user **`Setup.exe`** (no MSI). Linux output is a Velopack **AppImage**-style bundle. Update channels follow `{os}-{component}` for stable and `{os}-{component}-dev` for dev builds.

**Linux AppImage menu integration:** When `APPIMAGE` is set (running the downloaded `.AppImage` file), ServerApp and DesktopApp reconcile a Freedesktop launcher under `$XDG_DATA_HOME/applications/` (default `~/.local/share/applications/`) and hicolor icons on every startup—silent, no first-run flag. `dotnet run` and Windows builds skip registration. Dangling entries after deleting an AppImage are not removed automatically.

**Installed runtime:** ServerApp and DesktopApp call **`VelopackApp.Build().Run()`** at startup so Velopack **install/update/uninstall hook** invocations work. There is **no** `UpdateManager` / feed check / in-app “update available” flow yet—users upgrade by installing a newer build from GitHub Releases (or a future client slice will use the B2 feeds).

### Packaged-server smoke (Linux)

After local changes that affect server packaging, run:

```bash
./tools/scripts/verify-linux-packaged-server-smoke.sh
```

With no argument, the script publishes and `vpk pack`s a server AppImage (matching the workflow shape), then runs it headlessly with `--appimage-extract-and-run` when FUSE is unavailable. It checks `/health`, `/api/version`, `/control/status`, and `/operator`. It isolates **`XDG_CONFIG_HOME`** and **`XDG_DATA_HOME`** so menu registration and settings do not touch your real `~/.config` or `~/.local/share` tree.

## Release Versioning

Repo-root **`.version`** holds the canonical release version as a single v-prefixed semver2 line (for example `v0.12.0-dev`). Use one command to align release-version surfaces:

- `pwsh ./tools/scripts/set-release-version.ps1 -Version v0.12.0-dev.12`
- Omit `-Version` to read `.version` and fan out without changing the file.
- By default, the script also updates the desktop app `<Version>`, runs `npm run generate:contracts` in WebUI, runs solution build/test plus WebUI verify and `verify-web-deploy.ps1`, and updates release command examples in `README.md` and `docs/dev-setup.md`.
- Use `-NoDocUpdates` to skip the README/dev-setup example updates.
- Use `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, and/or `-NoRunVerify` to skip desktop version, contract regeneration, or the verify steps respectively.

This updates:

- `.version` (when `-Version` is supplied)
- OpenAPI `info.version`
- server `assetsVersion` in `/api/version` response
- release-version test fixtures
- server app project `<Version>`
- `ReelRoulette.LibraryArchive` project `<Version>`
- desktop project `<Version>`

GitHub / B2 release flow:

- Run `set-release-version.ps1`, commit, and push.
- Create/publish the GitHub release notes for the tag.
- Push the **`v*`** tag matching `.version`. **`release.yml`** builds all matrix legs and publishes to B2 (stable also uploads to GitHub).

Reset manual testing checklist state for a fresh run:

- `pwsh ./tools/scripts/reset-checklist.ps1`
- `pwsh ./tools/scripts/reset-checklist.ps1 -KeepMetadata`
- `pwsh ./tools/scripts/reset-checklist.ps1 -RemoveWaived`

## Troubleshooting

- WebUI changes not appearing:
  - run `pwsh ./tools/scripts/run-server-rebuild.ps1` to rebuild before run.
- Version/capability startup blocks:
  - check `/api/version` and `/api/capabilities` output against expected client requirements.
- Velopack release workflow failures:
  - confirm `.version` matches the tag; inspect the failing matrix leg log (Windows ffprobe gate, LibVLC presence gate, or pack/upload steps).
- Packaged Linux server smoke failures:
  - re-run `./tools/scripts/verify-linux-packaged-server-smoke.sh` and inspect server stdout/stderr from the script.
