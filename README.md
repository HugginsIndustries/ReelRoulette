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

These paths are for **people who want to run packaged builds**. If you are changing code, skip to [Developing from source](#developing-from-source).

Official downloads live on **[GitHub Releases](https://github.com/HugginsIndustries/ReelRoulette/releases)**. You usually want **two pieces**: the **server** (hosts your library, API, WebUI, Operator) and optionally the **desktop** app (a native client). The **WebUI** is served by the server at the root URL once the server is running.

### Windows

1. **Installer (easiest)**  
   On the latest release, download the **server** installer (`ReelRoulette-Server-…-win-x64-setup.exe`) and (optionally) the **desktop** installer (`ReelRoulette-Desktop-…-win-x64-setup.exe`). Run each file and follow the prompts. The installers can add Start Menu / desktop shortcuts (those options are on by default).

2. **Portable ZIP (no installer)**  
   Download the matching **portable** ZIPs instead (`ReelRoulette-Server-…-win-x64.zip`, `ReelRoulette-Desktop-…-win-x64.zip`). Extract each to its own folder and run `ReelRoulette.ServerApp.exe` or `ReelRoulette.DesktopApp.exe` inside. Nothing is written to Program Files; you can delete the folder to uninstall.

3. **First run**  
   Start the **server** first. By default, open **[http://localhost:45123/operator](http://localhost:45123/operator)** in a browser for the Operator UI, or use the desktop app to connect to that server. The Windows tray icon (when available) can open Operator, refresh the library, and toggle “launch on startup.”

### Linux

1. **Install script (recommended if you use the terminal a little)**  
   You need **`curl`** and **`jq`** installed (e.g. from your distro packages). Then either clone this repo and run from the root:

   ```bash
   ./tools/scripts/install-linux-from-github.sh server
   ./tools/scripts/install-linux-from-github.sh desktop
   ```

   …or download and pipe the script (same effect; installs under `~/.local/bin` and `~/.local/share` only, **no sudo**):

   ```bash
   curl -fsSL https://raw.githubusercontent.com/HugginsIndustries/ReelRoulette/main/tools/scripts/install-linux-from-github.sh | bash -s -- server
   ```

   Run the same command again with `desktop` instead of `server` if you want the desktop client. The script prefers an **AppImage** from the latest release if one is attached; otherwise it uses the **portable `.tar.gz`**. To target a fork, set `REELROULETTE_GITHUB_REPO=owner/repo` or pass `-Repo owner/repo`. See `docs/dev-setup.md` for `-Branch` / icon source details.

2. **AppImage by hand**  
   From Releases, download `ReelRoulette-Server-{version}-linux-x64.AppImage` and (optionally) `ReelRoulette-Desktop-{version}-linux-x64.AppImage`. In a terminal:

   ```bash
   chmod +x ./ReelRoulette-Server-0.11.0-dev-linux-x64.AppImage
   ./ReelRoulette-Server-0.11.0-dev-linux-x64.AppImage --install
   ```

   `--install` registers a menu entry and icons in your user account (still no sudo). Run the AppImage again without `--install` to start the app. Use `./ReelRoulette-*.AppImage --help` for native dependency notes (FFmpeg/VLC).

3. **Portable tarball**  
   Download `ReelRoulette-Server-…-linux-x64.tar.gz` and/or `ReelRoulette-Desktop-…-linux-x64.tar.gz`, extract, then from the extracted folder run `./run-server.sh` or `./run-desktop.sh`.

4. **Media tools on Linux**  
   Linux packages **do not** bundle FFmpeg or VLC. Install **`ffmpeg`** (with **`ffprobe`** on your `PATH`) and **VLC / LibVLC** from your distribution for full server and desktop media behavior.

### Developing from source

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
pwsh ./tools/scripts/set-release-version.ps1 -Version 0.11.0-dev
```

By default this also updates the desktop app `<Version>`, regenerates WebUI OpenAPI contracts (`npm run generate:contracts`), and runs the same verify steps as `full-release.ps1` when you pass `-Version` there (solution build/test, WebUI verify, deploy smoke). Pass `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, and/or `-NoRunVerify` to skip any of those. Use `-NoDocUpdates` to leave `README.md` / `docs/dev-setup.md` release command examples unchanged. `full-release.ps1` forwards those `-No*` switches to `set-release-version.ps1` when `-Version` is set; if you omit `-Version` on `full-release.ps1`, the version/verify step is skipped and packaging reads `<Version>` from each `.csproj`.

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

Scripts run from the **repository root** unless noted. Optional flags (`-Version`, `-Configuration`, `-OutputRoot`) are documented in `docs/dev-setup.md`.

### Linux

**Prerequisites:** `bash`, `dotnet`, `npm`, and `tar` on your `PATH` for portable tarballs; **[`appimagetool`](https://github.com/AppImage/AppImageKit)** on your `PATH` as well if you build AppImages.

**Portable tarballs** (self-contained `linux-x64`, symbols stripped, no `.pdb` in the tree, `README.txt` for native prerequisites):

```bash
./tools/scripts/package-serverapp-linux-portable.sh
./tools/scripts/package-desktop-linux-portable.sh
```

Outputs: `artifacts/packages/portable/ReelRoulette-Server-{Version}-linux-x64.tar.gz` and `ReelRoulette-Desktop-{Version}-linux-x64.tar.gz`.

**AppImages** (invoke the portable scripts first, then assemble the image):

```bash
./tools/scripts/package-serverapp-linux-appimage.sh
./tools/scripts/package-desktop-linux-appimage.sh
```

Outputs: `artifacts/packages/appimage/ReelRoulette-Server-{Version}-linux-x64.AppImage` and `ReelRoulette-Desktop-{Version}-linux-x64.AppImage`.

**End-user install helper** (fetches latest GitHub release; prefers AppImage, falls back to portable `.tar.gz`; needs `curl` and `jq`):

```bash
./tools/scripts/install-linux-from-github.sh server
./tools/scripts/install-linux-from-github.sh desktop
```

Linux portable and AppImage packages **do not** bundle FFmpeg or LibVLC; the install script and AppImage `--help` describe expecting distro packages on the target system.

### Windows

**Prerequisites:** `dotnet`, `npm`, and `pwsh`; **Inno Setup 6** (`iscc`) for installer builds. See `docs/dev-setup.md`.

```bash
pwsh ./tools/scripts/package-serverapp-win-portable.ps1
pwsh ./tools/scripts/package-serverapp-win-inno.ps1
pwsh ./tools/scripts/package-desktop-win-portable.ps1
pwsh ./tools/scripts/package-desktop-win-inno.ps1
```

- Desktop packaging stages native dependencies into `runtimes/win-x64/native` when possible; otherwise the script uses Chocolatey to pull **`ffmpeg`** and **`vlc`** for staging.
- Installer metadata (setup, Start Menu, uninstall entry) uses shared `assets/HI.ico`.
- Server and desktop installers include a **Create Desktop Shortcut** task (checked by default).

### General

- If **`-Version`** is omitted on any package script, the version is taken from `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` (server) or `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj` (desktop), matching the Windows/Linux script pairs above.
- **Server** packaging (all platforms) rebuilds the WebUI and copies static assets into published **`wwwroot`**, including `/HI.ico`; the published server also carries `HI.ico` at the app root for tray icon loading (from `assets/HI.ico`).
- **Chained release build**: with `-Version <ver>`, runs `set-release-version.ps1` (same defaults as under **Helper Scripts**; optional `-NoDocUpdates`, `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, `-NoRunVerify` are forwarded), then platform-appropriate packaging. Omit `-Version` to skip `set-release-version` and package using each component’s `.csproj` `<Version>`.

```bash
pwsh ./tools/scripts/full-release.ps1 -Version 0.11.0-dev
```

On **Linux**, this produces `artifacts/packages/portable/*.tar.gz` and `artifacts/packages/appimage/*.AppImage` for server and desktop (AppImage steps require `appimagetool`); Inno installer steps are skipped. On **Windows**, it produces portable `.zip` outputs and Inno **`.exe`** installers.

**GitHub Releases upload (Windows + Linux packages on tag):**

- Push your final release commit, then create/publish the GitHub tag and release with your notes.
- A `v*` tag push runs **`package-windows.yml`** and **`package-linux.yml`** in parallel. Each workflow builds its platform’s packages, checks that the release already exists for that tag, then uploads assets to that release (`gh release upload --clobber` on reruns):
  - Windows: `artifacts/packages/**/*.zip` and `artifacts/packages/**/*.exe`
  - Linux: `artifacts/packages/**/*.tar.gz` and `artifacts/packages/**/*.AppImage`
- You can also run either workflow manually via **Actions → Package Windows / Package Linux → Run workflow** (optional version input).

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
