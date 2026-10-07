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
- The Operator opens directly on the server machine. From another machine it first asks for the control token, which is shown under Control Settings in the Operator on the server machine. On a server with no browser, the token is `controlRuntime.adminSharedToken` in `core-settings.json` in the server data folder (see [docs/dev-setup.md](docs/dev-setup.md#user-data-locations)). Requests through a reverse proxy count as another machine, even when the proxy runs on the server machine.
- Desktop and WebUI act as API/SSE clients; server/core owns authoritative domain state.

## Prerequisites

- .NET SDK 10.0.1xx, 10.0.112 or a later patch, as pinned in `global.json`. A 10.0.4xx SDK, such as the one Visual Studio installs, is not used.
- Node.js 24, which CI and release use.
- npm (for WebUI build/verify flows).
- PowerShell Core (`pwsh`) for `tools/scripts/*.ps1` helpers (for example `pwsh ./tools/scripts/run-server.ps1`).
  - Linux (Arch Linux, CachyOS, and similar): install from the AUR, for example `paru -S powershell-bin` or `yay -S powershell-bin`; that package provides `pwsh` on your PATH.
- **VLC / LibVLC** for **desktop** video playback when running from source. **FFmpeg** (including **`ffprobe` on your `PATH`**) on the **server** host for library refresh (duration, loudness, thumbnails, and related probes). Install these from your OS packages on Linux—AppImages do **not** bundle them. The desktop app loads the system **`libvlc.so.5`** soname directly; on most distros you install **LibVLC libraries and plugins** only (not the full VLC media player metapackage where packages are split). On **Arch-like** distros the **`vlc`** package remains monolithic. On **Windows**, use distro-equivalent installs on your `PATH` for local `dotnet run` (official **Velopack** server packages bundle FFmpeg/ffprobe; desktop packages bundle LibVLC).

## Quick Start

These paths are for **people who want to run packaged builds**. If you are changing code, skip to [Developing from source](#developing-from-source).

Official **installers** for stable tags are on **[GitHub Releases](https://github.com/HugginsIndustries/ReelRoulette/releases)** (Velopack **`Setup.exe`** on Windows, **`.AppImage`** on Linux). The release pipeline also publishes **Velopack update feeds** to Backblaze B2. **Velopack-installed** server and desktop builds can check, download, and apply updates from Operator or Desktop Settings (stable or preview/dev channel). You usually want **two pieces**: the **server** (hosts your library, API, WebUI, Operator) and optionally the **desktop** app (a native client). The **WebUI** is served by the server at the root URL once the server is running.

### Windows

1. From the latest **stable** GitHub release (or your dev feed URL), download the **server** and (optionally) **desktop** **`Setup.exe`** installers produced by Velopack.
2. Run each installer. Installs are **per-user** under `%LocalAppData%` (no elevation, no MSI, no Program Files layout). Desktop and Start Menu shortcuts are created when the installer offers them.
3. Start the **server** first. Open **[http://localhost:45123/operator](http://localhost:45123/operator)** in a browser for the Operator UI, or connect the desktop app to that server. The tray icon (when available) can open Operator, refresh the library, and toggle “launch on startup.”
4. **Upgrades:** On a Velopack-installed build, use **Check for Updates** in Operator (server) or Desktop **Settings**. Download and Apply are separate confirmed steps; the app does not restart until you apply. You can also install a newer **`Setup.exe`** from GitHub Releases. **v0.11.0** Inno/portable installs use a different layout — replace them with the Velopack **`Setup.exe`** (per-user under `%LocalAppData%`). `dotnet run` / unpackaged sessions are not Velopack-installed and cannot apply feed updates.

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
4. **Upgrades:** On a Velopack AppImage, use **Check for Updates** in Operator (server) or Desktop **Settings**. Download and Apply are separate confirmed steps; the app does not restart until you apply. You can also download a newer **`.AppImage`** from GitHub Releases and run it. **v0.11.0** portable tarballs / legacy AppImages are a different packaging path — replace them with the Velopack **`.AppImage`**. `dotnet run` sessions cannot apply feed updates.

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
- PWA metadata: `manifest.webmanifest` and `public/sw.js`, a minimal root-scoped service worker registered from the client in secure contexts. Chrome installs from the manifest over HTTPS and does not need the worker (see [WebUI over HTTPS](#webui-over-https-install-as-an-app)). The worker intercepts document navigations only; API calls, the event stream, and media go straight to the server. The server serves `sw.js` with `Cache-Control: no-store` so updates are not stuck behind caching
- Material Symbols font: `assets/fonts/MaterialSymbolsOutlined.var.ttf` -> `public/assets/fonts/MaterialSymbolsOutlined.var.ttf`

## WebUI over HTTPS (install as an app)

On Android, Chrome installs the WebUI as an app only over HTTPS on the default port 443, with a certificate the phone trusts. From the plain-HTTP LAN address it only adds a home-screen shortcut that opens in the browser. iOS **Add to Home Screen** works over plain HTTP. The server serves only HTTP, so put an HTTPS reverse proxy in front of it:

- Run the proxy on the server machine and point it at `http://127.0.0.1:45123` (or your port). The server reads forwarded headers only from a proxy that connects from loopback. A proxy on another machine, or one that connects to the server's LAN address, is not supported: the WebUI it serves would call the server over `http://`, which the HTTPS page cannot do.
- Serve the WebUI at the host root, such as `https://reel.example.com/`, not under a path.
- The proxy must send `X-Forwarded-For` and `X-Forwarded-Proto`, and either pass the original `Host` or send `X-Forwarded-Host`. Tailscale Serve and Caddy do this by default. Without `X-Forwarded-For`, requests through the proxy look like they come from the server machine.
- Turn on **Allow remote connections** in the Operator and restart the server when it asks. Off, the server answers only the server machine and refuses requests through the proxy. On, it also serves plain HTTP on the LAN at its port.
- Requests through the proxy count as another device, even from the server machine. With the default auth mode, each device pairs once with the shared token, and the Operator asks for the control token.
- A self-signed certificate that you click through is not expected to be enough for Chrome to offer Install.

### Tailscale Serve

1. In the Tailscale admin console, turn on **MagicDNS** and **HTTPS certificates** for your tailnet. Each phone needs the Tailscale app, connected to the tailnet.
2. On the server machine, run `tailscale serve --bg 45123`. It serves `https://<machine>.<tailnet>.ts.net` on port 443 and proxies to `http://127.0.0.1:45123`. `tailscale serve status` shows it, and `tailscale serve reset` removes every Serve setting on the machine. Flags vary by Tailscale version; see [https://tailscale.com/kb/1312/serve](https://tailscale.com/kb/1312/serve).
3. On the phone, open `https://<machine>.<tailnet>.ts.net/`, pair if asked, then choose **Install app** in Chrome's menu, not **Create shortcut**.

### Another proxy

With [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy) on the server machine, this Caddyfile is enough; Caddy gets a trusted certificate for the name when it can prove it owns it:

```text
reel.example.com {
    reverse_proxy 127.0.0.1:45123
}
```

For nginx and the details of what the server reads, see [docs/dev-setup.md](docs/dev-setup.md#reverse-proxy-and-https).

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

Build WebUI and run server app:

```bash
pwsh ./tools/scripts/run-server-rebuild.ps1
```

Set release-aligned version surfaces in one step (repo-root `.version` is the source of truth; bare semver is written to consumers):

```bash
pwsh ./tools/scripts/set-release-version.ps1 -Version v0.15.0-dev.1
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
- `pwsh ./tools/scripts/reset-checklist.ps1` resets testing-checklist metadata/checklist state, including `Failed:`, `Skipped:`, and `Pending:` notes, for a new pass, and fills Release version from `.version` without its `-dev.N` suffix.
- `pwsh ./tools/scripts/check-milestones.ps1` checks `MILESTONES.md` and `MILESTONES-COMPLETED.md` against their maintenance rules (ID placement, release outline, `Depends on` titles). Add `-BaseRef <ref>` to also check that `MILESTONES-COMPLETED.md` only grew by moved entries, with `-Release` when the base is a release tag.
- `pwsh ./tools/scripts/tests/test-scripts.ps1` runs the milestones checker, changelog cut script, and checklist reset script against their fixtures.

## Packaging and releases

ReelRoulette ships through **Velopack** only. The **`.github/workflows/release.yml`** workflow (tag push or manual dispatch) builds self-contained **ServerApp** and **DesktopApp** outputs for **Windows** and **Linux**, stages WebUI assets for server legs, bundles Windows native dependencies in CI, packs with **`vpk`**, and publishes update feeds to **Backblaze B2**. Stable tag releases also mirror **`Setup.exe`** and **`.AppImage`** onto the existing **GitHub release** (not update packages, feed JSON, or portable zips). **Velopack-installed** builds check those feeds (background check-only, plus operator/Settings **Check → Download → Apply**); both hosts also call **`VelopackApp` hooks** at startup so install/update/uninstall hook invocations work.

### Maintainer flow

1. Set the repo version and align contract/project surfaces:

   ```bash
   pwsh ./tools/scripts/set-release-version.ps1 -Version v0.15.0-dev.1
   ```

2. Cut the changelog's `[Unreleased]` section into the release:

   ```bash
   pwsh ./tools/scripts/cut-changelog.ps1 -Version {VERSION} -Name "{Release Name}"
   ```

3. Commit, push, and create/publish the GitHub release notes for the tag.
4. Push the **`v*`** tag (must match `.version` exactly). The release workflow validates the tag, builds all matrix legs, and uploads to B2 (and GitHub for stable).

Repo-root **`.version`** holds the canonical release version (v-prefixed semver2). **Server** packaging delegates WebUI build and static asset staging to **`stage-webui-assets.ps1`**, copying built assets into published **`wwwroot`**.

### Local verification

- **Linux packaged server smoke:** `./tools/scripts/verify-linux-packaged-server-smoke.sh` (builds a Velopack server AppImage if you omit a path, then curls `/health`, `/api/version`, `/control/status`, `/operator` headlessly).
- Windows release legs run on GitHub-hosted runners; local Windows pack is optional.

See `docs/dev-setup.md` for channel names, dev vs stable tiers, and troubleshooting.

## Documentation Map

- Current implemented capability inventory: `CONTEXT.md`
- Milestone planning and tracking: `MILESTONES.md`
- Completed milestones: `MILESTONES-COMPLETED.md`
- API contract and endpoint/event behavior: `docs/api.md`
- Local setup and development workflows: `docs/dev-setup.md`
- Domain-level implementation inventory: `docs/domain-inventory.md`
- Contributor/agent workflow notes: `AGENTS.md`

## Third-Party Components

ReelRoulette integrates **VideoLAN VLC / LibVLC** and **FFmpeg** (including **ffprobe**). They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.

**Windows** release **server** packages bundle **FFmpeg** and **ffprobe** (CI-acquired build). **Windows** **desktop** packages bundle **LibVLC** under **`runtimes/win-x64/native/libvlc/`**. **Linux** packages bundle **no** LibVLC or FFmpeg; install **LibVLC libraries/plugins** and **ffmpeg/ffprobe** from your distribution (see the desktop dependency dialog or README prerequisites).
