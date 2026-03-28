# ReelRoulette

ReelRoulette is a server-first media randomizer with thin desktop and web clients.

## What This Repo Runs

- `ReelRoulette.ServerApp` is the default runtime host.
- The server app serves:
  - API endpoints (`/api/*`)
  - SSE endpoint (`/api/events`)
  - media streaming (`/api/media/{idOrToken}`)
  - WebUI static assets
  - Operator UI (`/operator`)
- Control-plane/admin operations are exposed under `/control/*` (status, settings, pair, restart, stop, testing, logs).
- Desktop and WebUI act as API/SSE clients; server/core owns authoritative domain state.

## Prerequisites

- .NET SDK version compatible with this repo's `TargetFramework` values.
- Node.js and npm (for WebUI build/verify flows).
- PowerShell Core (`pwsh`) for `tools/scripts/*.ps1` helpers (for example `pwsh ./tools/scripts/run-server.ps1`).
  - Linux (Arch Linux, CachyOS, and similar): install from the AUR, for example `paru -S powershell-bin` or `yay -S powershell-bin`; that package provides `pwsh` on your PATH.
- `bash` and `tar` on your `PATH` if you run Linux portable packaging (`./tools/scripts/package-serverapp-linux-portable.sh`, `./tools/scripts/package-desktop-linux-portable.sh`); both are available by default on typical Linux and macOS environments.
- Windows installer builds additionally need Inno Setup 6 (`iscc`); see `docs/dev-setup.md`.
- **FFmpeg** (including **`ffprobe` on your `PATH`**) and **VLC / LibVLC** are recommended for full media behavior (desktop playback, probing, and server-side features that shell out to these tools). Install them from your OS or distro packages when developing or running **Linux** portable tarballs—those artifacts **do not** bundle FFmpeg or LibVLC. **Windows** desktop portable packaging can stage `ffprobe` and LibVLC into the output when you run `package-desktop-win-portable.ps1` (see `docs/dev-setup.md`).

## Quick Start

From the repository root:

```bash
dotnet build ReelRoulette.sln
```

Run the server app:

```bash
# Windows (tray + no-console path):
dotnet run --framework net10.0-windows --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj

# Windows (system tray validation via app binary):
dotnet build ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj -f net10.0-windows
./src/core/ReelRoulette.ServerApp/bin/Debug/net10.0-windows/ReelRoulette.ServerApp.exe

# Linux/macOS (tray when available, otherwise headless):
dotnet run --framework net10.0 --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj
```

Run the desktop client:

```bash
dotnet run --project ./src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj
```

Run the WebUI dev server:

```bash
cd ./src/clients/web/ReelRoulette.WebUI
npm install
npm run dev
```

`npm run dev` and `npm run build` automatically sync shared assets into WebUI `public/`, including:

- app icon: `assets/HI.ico` -> `public/HI.ico`
- Material Symbols font: `assets/fonts/MaterialSymbolsOutlined.var.ttf` -> `public/assets/fonts/MaterialSymbolsOutlined.var.ttf`

## Helper Scripts

Run server app directly:

```bash
pwsh ./tools/scripts/run-server.ps1
```

Default listen URL: `http://localhost:45123`.

Windows runtime note:

- `ReelRoulette.ServerApp` runs as a tray-hosted runtime on Windows (no command prompt window when launched as app binary).
- Tray menu provides quick actions for opening `/operator`, starting library refresh, restarting server, and stop/exit.
- Tray and Operator UI both expose `Launch Server on Startup` control; changes apply immediately and do not require restart.

Build WebUI and run server app:

```bash
pwsh ./tools/scripts/run-server-rebuild.ps1
```

Set release-aligned version surfaces in one step:

```bash
pwsh ./tools/scripts/set-release-version.ps1 -Version 0.11.0-dev -UpdateDesktopVersion -RegenerateContracts -RunVerify
```

## Verification

Solution test gate:

```bash
dotnet test ReelRoulette.sln
```

WebUI verify gate:

```bash
cd ./src/clients/web/ReelRoulette.WebUI
npm run verify
```

Single-origin server/web deploy smoke verification:

```bash
pwsh ./tools/scripts/verify-web-deploy.ps1
```

Optional core system checks:

```bash
dotnet run --project ./src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj -- --verbose
```

Manual test guide:

- `docs/checklists/testing-checklist.md`
- `pwsh ./tools/scripts/reset-checklist.ps1` resets testing-checklist metadata/checklist state for a new pass.

## Packaging

Linux portable (self-contained `linux-x64` tarballs, `bash` + `dotnet` + `npm` + `tar`): see `docs/dev-setup.md` (`package-serverapp-linux-portable.sh`, `package-desktop-linux-portable.sh`). On Linux, `pwsh ./tools/scripts/full-release.ps1 -Version …` builds Linux portables and skips Inno installers.

### Windows

- Server portable package: `pwsh ./tools/scripts/package-serverapp-win-portable.ps1`
- Server Inno installer package: `pwsh ./tools/scripts/package-serverapp-win-inno.ps1`
- Desktop portable package: `pwsh ./tools/scripts/package-desktop-win-portable.ps1`
- Desktop Inno installer package: `pwsh ./tools/scripts/package-desktop-win-inno.ps1`
- If `-Version` is omitted:
  - server packaging scripts auto-use `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` `<Version>`,
  - desktop packaging scripts auto-use `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj` `<Version>`.
- Server packaging scripts rebuild and bundle WebUI static assets into published output (`wwwroot`), including `/HI.ico`.
- Server runtime publish output includes `HI.ico` at app root for tray icon loading, sourced from shared `assets/HI.ico`.
- Desktop packaging scripts stage native desktop dependencies into published output (`runtimes/win-x64/native`) during packaging.
- Desktop native staging prefers local repo runtimes when present; otherwise scripts acquire dependencies via Chocolatey (`ffmpeg` + `vlc`).
- Installer metadata (setup/start-menu/uninstall display) uses shared `assets/HI.ico`.
- Server installer includes `Create Desktop Shortcut` task (default checked).
- Desktop installer includes `Create Desktop Shortcut` task (default checked).

Simple release flow (example `0.11.0-dev`):

```bash
pwsh ./tools/scripts/full-release.ps1 -Version 0.11.0-dev
```

On Linux hosts this runs version alignment and produces `artifacts/packages/portable/*.tar.gz` for server and desktop; Windows hosts produce `.zip` portable outputs and Inno installers as before.

GitHub release asset flow:

- Push your final release commit.
- Manually create the GitHub tag/release and publish your own release notes.
- Tag push triggers `package-windows.yml`, which builds server + desktop packages.
- Workflow verifies the release already exists for that tag, then uploads `artifacts/packages/**/*.zip` and `artifacts/packages/**/*.exe` to that release (`--clobber` on reruns).

## Documentation Map

- Current implemented capability inventory: `CONTEXT.md`
- Milestone planning and tracking: `MILESTONES.md`
- API contract and endpoint/event behavior: `docs/api.md`
- Local setup and development workflows: `docs/dev-setup.md`
- Domain-level implementation inventory: `docs/domain-inventory.md`
- Contributor/agent workflow notes: `AGENTS.md`

## Third-Party Components

ReelRoulette integrates **VideoLAN VLC / LibVLC** and **FFmpeg** (including **ffprobe**). They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.

Windows desktop **portable** packages built with the repo script may **include** copies of those native components in the publish output. **Linux** portable desktop packages and typical **Linux/macOS dev** setups use **system-installed** FFmpeg and VLC instead (not shipped inside the tarball).
