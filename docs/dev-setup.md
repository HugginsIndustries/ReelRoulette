# Development Setup

This guide covers local setup, run paths, verification gates, packaging, and release-version workflow for the current ReelRoulette runtime.

## Prerequisites

- .NET SDK (matching solution target; verify with `dotnet --version`)
- Node.js + npm (for WebUI build/verify; verify with `node --version` and `npm --version`)
- PowerShell Core (`pwsh`) for repository scripts under `tools/scripts/` (for example `pwsh ./tools/scripts/run-server.ps1`).
  - Linux (Arch Linux, CachyOS, and similar): install from the AUR, for example `paru -S powershell-bin` or `yay -S powershell-bin`; that package provides `pwsh` on your PATH.
- Windows packaging only:
  - Inno Setup 6 (for installer builds)
- FFmpeg (with `ffprobe` on `PATH`) and VLC / LibVLC for full desktop playback and media helper behavior; required for Linux portable desktop tarballs (not bundled there). Windows desktop portable packaging can stage native copies via `package-desktop-win-portable.ps1` when not using repo-local `runtimes/` assets.

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

### Run ServerApp with WebUI rebuild

Use when you want to ensure web assets are freshly rebuilt before startup:

- `pwsh ./tools/scripts/run-server-rebuild.ps1`

### Run Desktop app

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

## Logging and Diagnostics

- Server diagnostics are available through `last.log` and `/control/logs/server`.
- Clients can relay logs to server ingestion endpoint:
  - `POST /api/logs/client`
- Connected client/session diagnostics are available in Operator UI and `/control/status`.

## User data locations

Per-user data uses .NET `Environment.SpecialFolder` mappings:

- **Linux** (XDG): config / roaming (`ApplicationData`) → `~/.config/ReelRoulette/` (includes `library.json`). Local cache (`LocalApplicationData`) → `~/.local/share/ReelRoulette/` (thumbnails in `thumbnails/`).
- **Windows**: config / roaming (`ApplicationData`) → `%APPDATA%/ReelRoulette/`. Local cache (`LocalApplicationData`) → `%LOCALAPPDATA%/ReelRoulette/` (thumbnails in `thumbnails/`).

## Windows Packaging

### Portable package

- `pwsh ./tools/scripts/package-serverapp-win-portable.ps1`
- `pwsh ./tools/scripts/package-desktop-win-portable.ps1`

### Inno installer package

- `pwsh ./tools/scripts/package-serverapp-win-inno.ps1`
- `pwsh ./tools/scripts/package-desktop-win-inno.ps1`

Packaging notes:

- Server packaging scripts auto-detect version from `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` when `-Version` is not passed.
- Desktop packaging scripts auto-detect version from `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj` when `-Version` is not passed.
- Desktop packaging scripts stage native desktop runtime dependencies into publish output (`runtimes/win-x64/native`) at package time.
- Desktop native dependency staging prefers local repo runtimes when available; otherwise scripts acquire dependencies via Chocolatey (`ffmpeg` for `ffprobe.exe`, `vlc` for LibVLC files).
- Server packaging scripts run WebUI build and bundle static assets into ServerApp publish output (`wwwroot`) so packaged runtime includes WebUI and Operator favicon.
- Server publish output includes `HI.ico` at app root for tray icon loading (from shared `assets/HI.ico`).
- Shared app/installer/web icon source is `assets/HI.ico`.
- Inno script auto-detects `ISCC.exe` from PATH/common install locations/registry.
- Server installer task:
  - `Create Desktop Shortcut` (default checked).
- Desktop installer task:
  - `Create Desktop Shortcut` (default checked).

## Release Versioning

Use one command to align release-version surfaces:

- `pwsh ./tools/scripts/set-release-version.ps1 -Version 0.11.0-dev -UpdateDesktopVersion -RegenerateContracts -RunVerify`
- By default, this script also updates release command examples in `README.md` and `docs/dev-setup.md`.
- Use `-NoDocUpdates` to skip those docs updates when needed.

This updates:

- OpenAPI `info.version`
- server `assetsVersion` in `/api/version` response
- release-version test fixtures
- server app project `<Version>`
- desktop project `<Version>`

Then package server and desktop as needed:

- `pwsh ./tools/scripts/package-serverapp-win-portable.ps1`
- `pwsh ./tools/scripts/package-serverapp-win-inno.ps1`
- `pwsh ./tools/scripts/package-desktop-win-portable.ps1`
- `pwsh ./tools/scripts/package-desktop-win-inno.ps1`
- or run the chained flow:
  - `pwsh ./tools/scripts/full-release.ps1 -Version 0.11.0-dev`

Reset manual testing checklist state for a fresh run:

- `pwsh ./tools/scripts/reset-checklist.ps1`
- `pwsh ./tools/scripts/reset-checklist.ps1 -KeepMetadata`
- `pwsh ./tools/scripts/reset-checklist.ps1 -RemoveWaived`

GitHub release asset upload flow:

- Push your final release commit.
- Manually create/publish the tag release on GitHub with your own release notes.
- `package-windows.yml` runs on `v*` tag push, builds packages, verifies the release exists for that tag, and uploads generated `.zip`/`.exe` files to that release.
- Re-runs replace matching asset names via `gh release upload --clobber`.

## Linux packaging (portable)

From the repository root (requires `bash`, `dotnet`, `npm`, `tar` on `PATH`):

- Server portable tarball (WebUI built and copied into published `wwwroot`, self-contained `linux-x64`, symbols omitted from the package tree):

```bash
./tools/scripts/package-serverapp-linux-portable.sh
```

- Desktop portable tarball (self-contained `linux-x64`; **does not** bundle `ffmpeg`/`ffprobe` or LibVLC—install distro packages so playback and helpers resolve):

```bash
./tools/scripts/package-desktop-linux-portable.sh
```

Optional arguments for both scripts: `-Version <ver>`, `-Configuration <cfg>`, `-OutputRoot <path>` (default `artifacts/packages`).

Artifacts:

- `artifacts/packages/portable/ReelRoulette-Server-{Version}-linux-x64.tar.gz`
- `artifacts/packages/portable/ReelRoulette-Desktop-{Version}-linux-x64.tar.gz`

Each archive contains a single top-level directory with the executable, `run-server.sh` or `run-desktop.sh` (executable), `README.txt`, and `PACKAGE_INFO.txt`. Extract, then run `./run-server.sh` or `./run-desktop.sh` from that directory.

When `-Version` is omitted, scripts read `<Version>` from the corresponding `.csproj` (same behavior as Windows packaging scripts).

On Linux, `pwsh ./tools/scripts/full-release.ps1 -Version <ver>` runs `set-release-version` (with your flags), then the two Linux portable scripts above, and skips Inno installer steps (Windows-only).

## Troubleshooting

- WebUI changes not appearing:
  - run `pwsh ./tools/scripts/run-server-rebuild.ps1` to rebuild before run.
- Version/capability startup blocks:
  - check `/api/version` and `/api/capabilities` output against expected client requirements.
- Installer build fails:
  - confirm Inno Setup 6 is installed; rerun `package-serverapp-win-inno.ps1` or `package-desktop-win-inno.ps1`.
