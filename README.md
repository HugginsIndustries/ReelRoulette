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
- **VLC / LibVLC** for **desktop** video playback when running from source. **FFmpeg** (including **`ffprobe` on your `PATH`**) on the **server** host for library refresh (duration, loudness, thumbnails, and related probes). Install these from your OS packages on Linux—AppImages do **not** bundle them. The desktop app loads the system **`libvlc.so.5`** soname directly; on most distros you install **LibVLC libraries and plugins** only (not the full VLC media player metapackage where packages are split). On **Arch-like** distros the **`vlc`** package remains monolithic. On **Windows**, use distro-equivalent installs on your `PATH` for local `dotnet run` (official **Velopack** server packages bundle FFmpeg/ffprobe; desktop packages bundle LibVLC).

## Quick Start

These paths are for **people who want to run packaged builds**. If you are changing code, skip to [Developing from source](#developing-from-source).

Official **installers** for stable tags are on **[GitHub Releases](https://github.com/HugginsIndustries/ReelRoulette/releases)** (Velopack **`Setup.exe`** on Windows, **`.AppImage`** on Linux). The release pipeline also publishes **Velopack update feeds** to Backblaze B2 for future in-app updates; **installed apps do not check or apply updates yet**—upgrade by installing a newer release build. You usually want **two pieces**: the **server** (hosts your library, API, WebUI, Operator) and optionally the **desktop** app (a native client). The **WebUI** is served by the server at the root URL once the server is running.

### Windows

1. From the latest **stable** GitHub release (or your dev feed URL), download the **server** and (optionally) **desktop** **`Setup.exe`** installers produced by Velopack.
2. Run each installer. Installs are **per-user** under `%LocalAppData%` (no elevation, no MSI, no Program Files layout). Desktop and Start Menu shortcuts are created when the installer offers them.
3. Start the **server** first. Open **[http://localhost:45123/operator](http://localhost:45123/operator)** in a browser for the Operator UI, or connect the desktop app to that server. The tray icon (when available) can open Operator, refresh the library, and toggle “launch on startup.”
4. **Upgrades:** download and run a newer **`Setup.exe`** from GitHub Releases when you want a new version. In-app update prompts and background feed checks are **not implemented yet** (packaged apps only run **`VelopackApp` install/update/uninstall hooks** when Velopack drives those operations).

### Linux

1. Download the **server** and (optionally) **desktop** **`.AppImage`** from the latest GitHub release or your feed mirror.
2. Make the file executable and run it, for example:

   ```bash
   chmod +x ~/Downloads/ReelRoulette.Server-*.AppImage
   ~/Downloads/ReelRoulette.Server-*.AppImage
   ```

   Keeping copies under **`~/Applications`** (or another directory you control) is a common convention; create the folder if you use it. The AppImage works from any location.

   On first launch (and whenever you move the file and run it again), the server and desktop apps **register themselves** in your application menu (`reelroulette-server` / `reelroulette-desktop`) and refresh the shortcut to point at the current AppImage path. No installer or `--install` step is required.

   **AppImage runtime:** most builds need **FUSE 2** on the host (`libfuse2`, or **`libfuse2t64`** on newer Ubuntu-based releases). If the AppImage will not start, install that package or run with **`--appimage-extract-and-run`**.

3. Install **FFmpeg** (with **`ffprobe`**) and **LibVLC** (libraries/plugins per your distro—the dependency dialog’s copy-paste command is verified minimal) before relying on playback and library refresh—Linux packages do not bundle those tools. If the **desktop** AppImage starts but LibVLC is missing, it shows a dialog with a **copy-paste command** for your distribution instead of exiting silently.
4. **Upgrades:** download a newer **`.AppImage`** from GitHub Releases and run it (replace or rename your copy as you prefer). In-app update checks are **not implemented yet**.

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
- PWA / home-screen icons: `assets/HI-256.png` and `assets/HI-512.png` are resized with **`sharp`** (devDependency) into `public/icons/icon-192.png` (**192×192**), `public/icons/icon-512.png` (**512×512**), and `public/icons/apple-touch-icon.png` (**180×180**) so `manifest.webmanifest` `sizes` matches the PNGs
- PWA installability on **Chromium/Android**: `public/sw.js` is a minimal root-scoped service worker (network-only `fetch`) registered from the client in secure contexts so **Install app** can yield a standalone shell together with `manifest.webmanifest`; the server serves `sw.js` with `Cache-Control: no-store` so updates are not stuck behind caching
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
- Tray and Operator expose the same `Launch Server on Startup` toggle; it writes `reelroulette-server.desktop` under your XDG autostart directory with `Exec=` targeting the stable server binary (from **`APPIMAGE`** when you run a Velopack **AppImage**, otherwise the process path) and `Path=` set to that binary’s directory. If an older autostart entry still points at `/tmp/.mount_*`, toggle startup off and on once to refresh it.

### WebUI HTTPS on Tailscale (PWA/Home Screen)

If your devices already use Tailscale, the most reliable way to run the WebUI in a secure context is:

1. Ensure the server can be reached from your tailnet (for example enable LAN binding in Control Settings or configure `CoreServer:ListenUrl` to a non-loopback bind such as `http://0.0.0.0:45123`).
2. Use **Tailscale Serve** to terminate HTTPS on your tailnet domain and proxy to the local server URL (for example `http://127.0.0.1:45123`).
3. Open the resulting HTTPS URL from another tailnet device (iPad/Android) and use browser install flow (**Add to Home Screen** / **Install app**). On **Android**, prefer **Chrome** (or another Chromium browser) for install so the service worker meets installability; **Firefox for Android** may keep browser chrome for home-screen shortcuts.

ReelRoulette WebUI runtime config is generated from the incoming request host/scheme (`/runtime-config.json`), so loading via the Tailscale HTTPS origin keeps API and SSE on the same HTTPS origin automatically.

Tailscale CLI flags can vary by version; use the current Tailscale docs for `serve` setup details: [https://tailscale.com/kb/1312/serve](https://tailscale.com/kb/1312/serve).

Build WebUI and run server app:

```bash
pwsh ./tools/scripts/run-server-rebuild.ps1
```

Set release-aligned version surfaces in one step (repo-root `.version` is the source of truth; bare semver is written to consumers):

```bash
pwsh ./tools/scripts/set-release-version.ps1 -Version v0.12.0-dev.15
```

Omit `-Version` to read the current value from `.version` and fan out without changing the file. By default this also updates the desktop app `<Version>`, regenerates WebUI OpenAPI contracts (`npm run generate:contracts`), and runs solution build/test, WebUI verify, and deploy smoke. Pass `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, and/or `-NoRunVerify` to skip any of those. Use `-NoDocUpdates` to leave `README.md` / `docs/dev-setup.md` release command examples unchanged.

Packaged-server smoke (Linux, Velopack AppImage):

```bash
./tools/scripts/verify-linux-packaged-server-smoke.sh
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

## Known Issues

### Windows: Avalonia system tray reliability

`ReelRoulette.ServerApp` shows a **system tray** icon when a desktop session is available. On **Windows**, that UI uses **Avalonia** (`TrayIcon` / notification area integration). On some setups the tray can be **unreliable** compared to Linux or macOS—for example the icon or context menu may not appear, may appear late, or may not survive Explorer/shell restarts the way native Win32 tray apps typically do.

The **HTTP server and Operator UI are unaffected**. If the tray is missing or unusable, open **[http://localhost:45123/operator](http://localhost:45123/operator)** (or your configured listen URL with `/operator`) for refresh, restart, stop, and settings. The process may still be running even when no tray icon is visible; use Operator or Task Manager to confirm.

## Packaging and releases

ReelRoulette ships through **Velopack** only. The **`.github/workflows/release.yml`** workflow (tag push or manual dispatch) builds self-contained **ServerApp** and **DesktopApp** outputs for **Windows** and **Linux**, stages WebUI assets for server legs, bundles Windows native dependencies in CI, packs with **`vpk`**, and publishes update feeds to **Backblaze B2**. Stable tag releases also mirror install artifacts onto the existing **GitHub release**. **Runtime update checking and apply-from-feed in the apps are a follow-up slice**; today both hosts call **`VelopackApp` hooks** at startup so install/update/uninstall hook invocations work when Velopack runs them.

### Maintainer flow

1. Set the repo version and align contract/project surfaces:

   ```bash
   pwsh ./tools/scripts/set-release-version.ps1 -Version v0.12.0-dev.15
   ```

2. Commit, push, and create/publish the GitHub release notes for the tag.
3. Push the **`v*`** tag (must match `.version` exactly). The release workflow validates the tag, builds all matrix legs, and uploads to B2 (and GitHub for stable).

Repo-root **`.version`** holds the canonical release version (v-prefixed semver2). **Server** packaging delegates WebUI build and static asset staging to **`stage-webui-assets.ps1`**, copying built assets into published **`wwwroot`**.

### Local verification

- **Linux packaged server smoke:** `./tools/scripts/verify-linux-packaged-server-smoke.sh` (builds a Velopack server AppImage if you omit a path, then curls `/health`, `/api/version`, `/control/status`, `/operator` headlessly).
- Windows release legs run on GitHub-hosted runners; local Windows pack is optional.

See `docs/dev-setup.md` for channel names, dev vs stable tiers, and troubleshooting.

## Documentation Map

- Current implemented capability inventory: `CONTEXT.md`
- Milestone planning and tracking: `MILESTONES.md`
- API contract and endpoint/event behavior: `docs/api.md`
- Local setup and development workflows: `docs/dev-setup.md`
- Domain-level implementation inventory: `docs/domain-inventory.md`
- Contributor/agent workflow notes: `AGENTS.md`

## Third-Party Components

ReelRoulette integrates **VideoLAN VLC / LibVLC** and **FFmpeg** (including **ffprobe**). They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.

**Windows** release **server** packages bundle **FFmpeg** and **ffprobe** (CI-acquired build). **Windows** **desktop** packages bundle **LibVLC** under **`runtimes/win-x64/native/libvlc/`**. **Linux** packages bundle **no** LibVLC or FFmpeg; install **LibVLC libraries/plugins** and **ffmpeg/ffprobe** from your distribution (see the desktop dependency dialog or README prerequisites).
