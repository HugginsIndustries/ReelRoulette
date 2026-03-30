# Development Setup

This guide covers local setup, run paths, verification gates, packaging, and release-version workflow for the current ReelRoulette runtime.

## Prerequisites

- .NET SDK (matching solution target; verify with `dotnet --version`)
- Node.js + npm (for WebUI build/verify; verify with `node --version` and `npm --version`)
- PowerShell Core (`pwsh`) for repository scripts under `tools/scripts/` (for example `pwsh ./tools/scripts/run-server.ps1`).
  - Windows: install PowerShell 7+ with `winget install Microsoft.PowerShell` so `pwsh` is on your PATH. Built-in Windows PowerShell 5.1 is not enough for scripts that rely on PowerShell 7+ (for example OS checks in `full-release.ps1`); use `pwsh` after install (restart the terminal or Cursor if `pwsh` is not found until PATH refreshes).
  - Linux (Arch Linux, CachyOS, and similar): install from the AUR, for example `paru -S powershell-bin` or `yay -S powershell-bin`; that package provides `pwsh` on your PATH.
- Windows packaging only:
  - Inno Setup 6 (for installer builds)
- **Windows developers:** after cloning, run **`pwsh ./tools/scripts/fetch-native-deps.ps1`** once from the repository root. This downloads **FFmpeg/ffprobe** (gyan.dev release essentials ZIP, SHA-256 verified) and materializes **LibVLC** (prefer **VideoLAN.LibVLC.Windows** from the NuGet global cache after `dotnet restore`, else the official VideoLAN mirror with SHA-256 verification) into **`runtimes/win-x64/native/`** (gitignored). Then `dotnet run` for **ServerApp** and **DesktopApp** resolves bundled tools from that path. Pass **`-Force`** to ignore skip rules and re-fetch.
- VLC / LibVLC for desktop video playback; FFmpeg (with `ffprobe` on `PATH`) on the **server** for library refresh (duration, loudness, thumbnails). Linux portable tarballs do not bundle LibVLC or FFmpeg (install from your distro). Windows **packaging** scripts call `fetch-native-deps.ps1` automatically when `runtimes/win-x64/native/` is incomplete, then stage **ffmpeg.exe** / **ffprobe.exe** into the **server** publish tree and **LibVLC** into the **desktop** publish tree—same source folder for both.

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

- **Windows:** run `pwsh ./tools/scripts/fetch-native-deps.ps1` first if `runtimes/win-x64/native/ffmpeg.exe` is missing (see Prerequisites).
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

- **Windows:** run `pwsh ./tools/scripts/fetch-native-deps.ps1` first if `runtimes/win-x64/native/libvlc` is not populated (see Prerequisites).
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
- Windows packaging scripts ensure **`runtimes/win-x64/native/`** via **`fetch-native-deps.ps1`** when **ffmpeg.exe**, **ffprobe.exe**, or **libvlc** are missing, then copy **FFmpeg/ffprobe** into the **server** publish output and **LibVLC** into the **desktop** publish output under `runtimes/win-x64/native/`. Duration and other ffprobe work run in the **server** refresh pipeline, not in the desktop app.
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

- `pwsh ./tools/scripts/set-release-version.ps1 -Version 0.11.0-dev`
- By default, the script also updates the desktop app `<Version>`, runs `npm run generate:contracts` in WebUI, runs solution build/test plus WebUI verify and `verify-web-deploy.ps1`, and updates release command examples in `README.md` and `docs/dev-setup.md`.
- Use `-NoDocUpdates` to skip the README/dev-setup example updates.
- Use `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, and/or `-NoRunVerify` to skip desktop version, contract regeneration, or the verify steps respectively.

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
  - `pwsh ./tools/scripts/full-release.ps1 -Version 0.11.0-dev` (optional `-NoDocUpdates`, `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, `-NoRunVerify` are passed through to `set-release-version.ps1`). Run without `-Version` to skip `set-release-version` and use each `.csproj` `<Version>` in package outputs.

Reset manual testing checklist state for a fresh run:

- `pwsh ./tools/scripts/reset-checklist.ps1`
- `pwsh ./tools/scripts/reset-checklist.ps1 -KeepMetadata`
- `pwsh ./tools/scripts/reset-checklist.ps1 -RemoveWaived`

GitHub release asset upload flow:

- Push your final release commit.
- Manually create/publish the tag release on GitHub with your own release notes.
- On `v*` tag push, **`package-windows.yml`** and **`package-linux.yml`** each run on their respective runners. They build platform packages, verify the release exists for that tag, then upload assets (`gh release upload --clobber` on reruns):
  - Windows: `.zip` / `.exe` under `artifacts/packages/`
  - Linux: `.tar.gz` / `.AppImage` under `artifacts/packages/` (Linux job installs `ffmpeg`, Node 22, .NET SDK 10, and a pinned AppImageKit **12** `appimagetool`; runs `verify-linux-packaged-server-smoke.sh` after packaging for a headless server HTTP smoke against `/health`, `/api/version`, `/control/status`, and `/operator`).
- Re-runs replace matching asset names via `gh release upload --clobber`.

## Linux packaging (portable)

From the repository root (requires `bash`, `dotnet`, `npm`, `tar` on `PATH`):

- Server portable tarball (WebUI built and copied into published `wwwroot`, self-contained `linux-x64`, symbols omitted from the package tree):

```bash
./tools/scripts/package-serverapp-linux-portable.sh
```

- Desktop portable tarball (self-contained `linux-x64`; **does not** bundle LibVLC or FFmpeg—install **VLC/LibVLC** for playback; install **ffmpeg**/**ffprobe** on the **server** host for library refresh):

```bash
./tools/scripts/package-desktop-linux-portable.sh
```

Optional arguments for both scripts: `-Version <ver>`, `-Configuration <cfg>`, `-OutputRoot <path>` (default `artifacts/packages`).

Artifacts:

- `artifacts/packages/portable/ReelRoulette-Server-{Version}-linux-x64.tar.gz`
- `artifacts/packages/portable/ReelRoulette-Desktop-{Version}-linux-x64.tar.gz`

Each archive contains a single top-level directory with the executable, `run-server.sh` or `run-desktop.sh` (executable), `README.txt`, and `PACKAGE_INFO.txt`. Extract, then run `./run-server.sh` or `./run-desktop.sh` from that directory.

When `-Version` is omitted, scripts read `<Version>` from the corresponding `.csproj` (same behavior as Windows packaging scripts).

### Linux AppImage (server + Desktop)

Requires [`appimagetool`](https://github.com/AppImage/AppImageKit) on `PATH` in addition to the portable prerequisites. The AppImage scripts invoke the portable scripts first (full publish + tar), then assemble the image.

From the repository root:

```bash
./tools/scripts/package-serverapp-linux-appimage.sh
./tools/scripts/package-desktop-linux-appimage.sh
```

Artifacts: `artifacts/packages/appimage/ReelRoulette-Server-{Version}-linux-x64.AppImage` and `ReelRoulette-Desktop-{Version}-linux-x64.AppImage`. Run `./ReelRoulette-*.AppImage --help` for native prerequisites; run with `--install` once to register a user-local menu entry and icons (no sudo).

### Install local AppImage build (Linux)

After the AppImage scripts above, copy the artifacts into a fixed location and refresh Freedesktop integration (stable filenames without the version segment so repeat installs overwrite the same files):

```bash
./tools/scripts/install-linux-local.sh
```

Default install directory: `~/.local/share/ReelRoulette/` (`ReelRoulette-Server-linux-x64.AppImage`, `ReelRoulette-Desktop-linux-x64.AppImage`). Override with `REELROULETTE_LOCAL_APPIMAGE_DIR`. The script runs each installed AppImage with `--install` and best-effort `update-desktop-database` on `~/.local/share/applications`.

### Install latest release from GitHub (Linux)

Requires `curl` and `jq` on `PATH`. Default repository is `HugginsIndustries/ReelRoulette` (override with `REELROULETTE_GITHUB_REPO` or `-Repo owner/name`). Prefers an AppImage asset on the latest release; falls back to the portable `.tar.gz`.

```bash
./tools/scripts/install-linux-from-github.sh server
./tools/scripts/install-linux-from-github.sh desktop
```

AppImage installs go to `~/.local/share/ReelRoulette/` as `ReelRoulette-{Server|Desktop}-linux-x64.AppImage` (version stripped; same as `install-linux-local.sh`). Override directory with `REELROULETTE_LOCAL_APPIMAGE_DIR`. Portable tarball fallback still extracts under `~/.local/share/ReelRoulette/<server|desktop>/<version>/` and adds a launcher symlink in `~/.local/bin/`.

On Linux, `pwsh ./tools/scripts/full-release.ps1 -Version <ver>` runs `set-release-version.ps1` with the same defaults documented under **Release Versioning** above (and any `-No*` switches you pass), then the two Linux portable scripts, then the two Linux AppImage scripts, and skips Inno installer steps (Windows-only). With no `-Version`, it skips `set-release-version` and packages using `.csproj` versions. AppImage steps require `appimagetool`.

## Troubleshooting

- WebUI changes not appearing:
  - run `pwsh ./tools/scripts/run-server-rebuild.ps1` to rebuild before run.
- Version/capability startup blocks:
  - check `/api/version` and `/api/capabilities` output against expected client requirements.
- Installer build fails:
  - confirm Inno Setup 6 is installed; rerun `package-serverapp-win-inno.ps1` or `package-desktop-win-inno.ps1`.
