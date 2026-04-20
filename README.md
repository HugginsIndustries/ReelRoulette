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
- **VLC / LibVLC** for **desktop** video playback. **FFmpeg** (including **`ffprobe` on your `PATH`**) on the **server** host for library refresh (duration, loudness, thumbnails, and related probes). Linux portable tarballs **do not** bundle these; install from your distro. On **Windows**, after cloning, run **`pwsh ./tools/scripts/fetch-native-deps.ps1` once** so `runtimes/win-x64/native/` contains **FFmpeg/ffprobe** (server) and **LibVLC** (desktop); packaging scripts fetch the same artifacts automatically when that folder is incomplete. Use **`-Force`** on that script to re-download. Official **Windows** portable/installer builds from this repo **bundle** those binaries into the published output; **Linux** users rely on distro packages instead.

## Quick Start

These paths are for **people who want to run packaged builds**. If you are changing code, skip to [Developing from source](#developing-from-source).

Official downloads live on **[GitHub Releases](https://github.com/HugginsIndustries/ReelRoulette/releases)**. You usually want **two pieces**: the **server** (hosts your library, API, WebUI, Operator) and optionally the **desktop** app (a native client). The **WebUI** is served by the server at the root URL once the server is running; it supports the same API-backed playback filters and presets as the desktop **Filter Media** dialog (overlay control with a `filter_alt` icon), and a tabbed tag overlay (**Edit Tags** / **Auto Tag**) aligned with the desktop Auto Tag workflow over the API.

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

   …or download and pipe the script (same effect; AppImages install to `~/.local/share/ReelRoulette/` under stable filenames; portable tarball fallback uses `~/.local/share` and a `~/.local/bin` symlink; **no sudo**):

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
   Linux packages **do not** bundle FFmpeg or VLC. Install **VLC / LibVLC** for desktop playback. For the **server**, install **`ffmpeg`** with **`ffprobe`** on your **`PATH`** for library refresh (duration, loudness, thumbnails).

**Local build install (developers):** After packaging AppImages (`./tools/scripts/package-serverapp-linux-appimage.sh` and `./tools/scripts/package-desktop-linux-appimage.sh`), run `./tools/scripts/install-linux-local.sh` to copy them to `~/.local/share/ReelRoulette/` under stable names and re-register menu entries (`--install`). See `docs/dev-setup.md`.

### Developing from source

From the repository root:

```bash
dotnet build ReelRoulette.sln
```

On **Windows**, from the repo root, run native dependency acquisition once before local server/desktop runs (see **Prerequisites**): `pwsh ./tools/scripts/fetch-native-deps.ps1`.

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
- PWA / home-screen icons: `assets/HI-256.png` and `assets/HI-512.png` are resized with **`sharp`** (devDependency) into `public/icons/icon-192.png` (**192×192**), `public/icons/icon-512.png` (**512×512**), and `public/icons/apple-touch-icon.png` (**180×180**) so `manifest.webmanifest` `sizes` matches the PNGs
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

Linux runtime note:

- Tray is used when a graphical session is available; otherwise the server runs headless.
- Tray and Operator expose the same `Launch Server on Startup` toggle; it writes `reelroulette-server.desktop` under your XDG autostart directory with `Exec=` targeting the stable server binary (from **`APPIMAGE`** when you run the **AppImage**, otherwise the process path) and `Path=` set to that binary’s directory so login startup matches `./run-server.sh` working-directory behavior. If you use the AppImage and an older autostart entry still points at `/tmp/.mount_*`, toggle startup off and on once to refresh it.

### WebUI HTTPS on Tailscale (PWA/Home Screen)

If your devices already use Tailscale, the most reliable way to run the WebUI in a secure context is:

1. Ensure the server can be reached from your tailnet (for example enable LAN binding in Control Settings or configure `CoreServer:ListenUrl` to a non-loopback bind such as `http://0.0.0.0:45123`).
2. Use **Tailscale Serve** to terminate HTTPS on your tailnet domain and proxy to the local server URL (for example `http://127.0.0.1:45123`).
3. Open the resulting HTTPS URL from another tailnet device (iPad/Android) and use browser install flow (**Add to Home Screen** / **Install app**).

ReelRoulette WebUI runtime config is generated from the incoming request host/scheme (`/runtime-config.json`), so loading via the Tailscale HTTPS origin keeps API and SSE on the same HTTPS origin automatically.

Tailscale CLI flags can vary by version; use the current Tailscale docs for `serve` setup details: [https://tailscale.com/kb/1312/serve](https://tailscale.com/kb/1312/serve).

Build WebUI and run server app:

```bash
pwsh ./tools/scripts/run-server-rebuild.ps1
```

Set release-aligned version surfaces in one step:

```bash
pwsh ./tools/scripts/set-release-version.ps1 -Version 0.11.0
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

## Known Issues

### Windows: Avalonia system tray reliability

`ReelRoulette.ServerApp` shows a **system tray** icon when a desktop session is available. On **Windows**, that UI uses **Avalonia** (`TrayIcon` / notification area integration). On some setups the tray can be **unreliable** compared to Linux or macOS—for example the icon or context menu may not appear, may appear late, or may not survive Explorer/shell restarts the way native Win32 tray apps typically do.

The **HTTP server and Operator UI are unaffected**. If the tray is missing or unusable, open **[http://localhost:45123/operator](http://localhost:45123/operator)** (or your configured listen URL with `/operator`) for refresh, restart, stop, and settings. The process may still be running even when no tray icon is visible; use Operator or Task Manager to confirm.

## Packaging

Scripts run from the **repository root** unless noted. Optional flags (`-Version`, `-Configuration`, `-OutputRoot`) are documented in `docs/dev-setup.md`.

### Linux Packaging

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

**Local install** (copies those AppImages to `~/.local/share/ReelRoulette/` with stable names and runs `--install`): `./tools/scripts/install-linux-local.sh`.

**End-user install helper** (fetches latest GitHub release; prefers AppImage, falls back to portable `.tar.gz`; needs `curl` and `jq`):

```bash
./tools/scripts/install-linux-from-github.sh server
./tools/scripts/install-linux-from-github.sh desktop
```

Linux portable and AppImage packages **do not** bundle FFmpeg or LibVLC; the install script and AppImage `--help` describe expecting distro packages on the target system.

### Windows Packaging

**Prerequisites:** `dotnet`, `npm`, and `pwsh`; **Inno Setup 6** (`iscc`) for installer builds. See `docs/dev-setup.md`.

```bash
pwsh ./tools/scripts/package-serverapp-win-portable.ps1
pwsh ./tools/scripts/package-serverapp-win-inno.ps1
pwsh ./tools/scripts/package-desktop-win-portable.ps1
pwsh ./tools/scripts/package-desktop-win-inno.ps1
```

- Windows packaging calls **`fetch-native-deps.ps1`** when `runtimes/win-x64/native/` is missing **ffmpeg.exe**, **ffprobe.exe**, or **libvlc** assets, then stages **FFmpeg/ffprobe** into the **server** publish output and **LibVLC** into the **desktop** publish output from that same folder (see `docs/dev-setup.md`).
- Installer metadata (setup, Start Menu, uninstall entry) uses shared `assets/HI.ico`.
- Server and desktop installers include a **Create Desktop Shortcut** task (checked by default).

### General

- If **`-Version`** is omitted on any package script, the version is taken from `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` (server) or `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj` (desktop), matching the Windows/Linux script pairs above.
- **Server** packaging (all platforms) rebuilds the WebUI and copies static assets into published **`wwwroot`**, including `/HI.ico`; the published server also carries `HI.ico` at the app root for tray icon loading (from `assets/HI.ico`).
- **Chained release build**: with `-Version <ver>`, runs `set-release-version.ps1` (same defaults as under **Helper Scripts**; optional `-NoDocUpdates`, `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, `-NoRunVerify` are forwarded), then platform-appropriate packaging. Omit `-Version` to skip `set-release-version` and package using each component’s `.csproj` `<Version>`.

```bash
pwsh ./tools/scripts/full-release.ps1 -Version 0.11.0
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

**Windows** release **server** packages produced by this repository bundle **FFmpeg** and **ffprobe** from the [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) **release essentials** build. **Windows** **desktop** packages bundle **LibVLC** from the **VideoLAN.LibVLC.Windows** NuGet layout (or the official VideoLAN mirror when the cache is unavailable). **Linux** users install **FFmpeg/ffprobe** (server refresh) and **VLC/LibVLC** (desktop playback) from their distribution; Linux portable tarballs do not ship those binaries inside the archive.
