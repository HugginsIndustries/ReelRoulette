# Linux Minimum Dependencies Audit (Desktop LibVLC vs Server FFmpeg)

Report-only investigation of the **smallest** OS package sets that satisfy ReelRoulette on Linux, and a **VM test matrix** to confirm them. No application code, install commands, or documentation outside this file were changed.

**Motivation (operator-verified on Fedora 43 KDE):** A clean VM already had **`vlc-libs`** and several **`vlc-plugin*`** packages (pulled in by Phonon, not by the user). The desktop **`DllImport` resolver** loaded **`libvlc.so.5`**, the app started with **no dependency dialog**, and video was **black** until RPM Fusion was enabled and **`ffmpeg-free`** was swapped for **`ffmpeg`** — **without installing the `vlc` player package at any point**. Recommending the full **`vlc`** metapackage for a media player app is therefore likely overspecified; this audit separates facts from candidates and defines tests to pick a final minimal set.

---

## Section A — What the app actually requires at runtime

### A.1 Desktop — native library loading and LibVLC initialization

**Mechanism:** On Linux, `LinuxLibVlcNativeResolver.EnsureRegistered()` runs at the start of `TryInitializeLibVlc()` and registers `NativeLibrary.SetDllImportResolver` on the **LibVLCSharp** assembly. Only the name **`libvlc`** is handled; it is mapped via `NativeLibrary.TryLoad` to **`libvlc.so.5`**, then **`libvlc.so`** as fallback. All other library names return **`IntPtr.Zero`** (default CLR resolution).

```17:48:src/clients/desktop/ReelRoulette.DesktopApp/LinuxLibVlcNativeResolver.cs
    internal static void EnsureRegistered()
    {
        if (!OperatingSystem.IsLinux())
        {
            return;
        }
        // ...
        NativeLibrary.SetDllImportResolver(typeof(LibVLC).Assembly, Resolve);
    }

    private static IntPtr Resolve(string libraryName, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (!string.Equals(libraryName, "libvlc", StringComparison.Ordinal))
        {
            return IntPtr.Zero;
        }

        ReadOnlySpan<string> candidates = ["libvlc.so.5", "libvlc.so"];
        foreach (var candidate in candidates)
        {
            if (NativeLibrary.TryLoad(candidate, out var handle))
            {
                return handle;
            }
        }

        return IntPtr.Zero;
    }
```

**Initialization path (Linux):** `NativeBinaryHelper.GetLibVlcPath()` returns empty on Linux (no bundled tree under `runtimes/linux-x64/native/libvlc`). The app calls **`Core.Initialize()`** with **no directory path**. LibVLCSharp on Linux does **not** preload libraries via `LoadLibVLC`; the first `[DllImport("libvlc")]` (during `EnsureVersionsMatch()` inside `Initialize`) triggers loading through the resolver.

```106:147:src/clients/desktop/ReelRoulette.DesktopApp/Program.cs
    private static bool TryInitializeLibVlc()
    {
        LinuxLibVlcNativeResolver.EnsureRegistered();
        // ...
        if (!initialized)
        {
            try
            {
                LibVLCSharp.Shared.Core.Initialize();
                initialized = true;
                libVlcSource = "system (default)";
```

**Failure gating:** If initialization throws (library not loadable), `TryInitializeLibVlc()` returns false, `LinuxLibVlcMissing` is set, and the **Linux native dependency dialog** runs after Avalonia starts (`App.axaml.cs`). That dialog is keyed only on **LibVLC load failure**, not on playback quality.

**Runtime desktop needs (logical, not yet minimal packages):**

| Need | Role |
|------|------|
| **`libvlc.so.5`** (or resolvable **`libvlc.so`**) on the dynamic linker path | Satisfies LibVLCSharp P/Invokes via the resolver |
| **`libvlccore`** (typically **`libvlccore.so.9`**) | Loaded transitively when `libvlc.so.5` is opened; LibVLCSharp does not P/Invoke it separately on Linux |
| **VLC plugin modules** under the distro’s VLC plugin directory (e.g. demux, decoder/avcodec or ffmpeg bridge, video output) | Required for decode and for embedding video in `LibVLCSharp.Avalonia` `VideoView`; LibVLC discovers plugins from the **system install prefix** when using system `libvlc` — the app does **not** set `VLC_PLUGIN_PATH` on Linux for system LibVLC (only for **Windows bundled** LibVLC in `Program.cs`) |
| **Compatible FFmpeg/libraries for the VLC ffmpeg/avcodec plugin** | Operator-verified on Fedora: **`vlc-plugin-ffmpeg`** (or equivalent) links against whichever **FFmpeg** libraries are installed; **`ffmpeg-free`** vs RPM Fusion **`ffmpeg`** affected decode without reinstalling VLC packages |

**LibVLC instance options:** The desktop creates `new LibVLC(enableDebugLogs: false, "--intf", "dummy")` — a **dummy interface**, not the Qt or ncurses VLC GUI.

```888:891:src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs
            // Create LibVLC instances (Core.Initialize() called in Program.cs).
            // --intf dummy avoids VLC spawning a separate controller window; embedding uses VideoView's native handle.
            _libVLC = new LibVLC(enableDebugLogs: false, "--intf", "dummy");
            _mediaPlayer = new MediaPlayer(_libVLC);
```

**VLC application / GUI / `vlc` binary:** Repository search shows **no** invocation of `/usr/bin/vlc`, `vlc.exe`, or a VLC GUI process. Playback is entirely in-process via LibVLCSharp. **Nothing in the app requires the VLC media player application, Qt interface package, or ncurses UI** — only the shared library, core library, and appropriate **plugins** (and their codec/FFmpeg dependencies).

### A.2 Server — `ffmpeg` and `ffprobe`

Linux **AppImages do not bundle** FFmpeg. `RefreshPipelineService` resolves tools as:

1. Bundled path under `AppContext.BaseDirectory/runtimes/linux-x64/native/ffmpeg` or `ffprobe` if present (Windows Velopack layout; **not** present on Linux AppImage).
2. Otherwise bare executable names on **`PATH`**: **`ffprobe`** and **`ffmpeg`**.

```1932:1963:src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs
    private static string ResolveFfprobePath()
    {
        // ... bundled under runtimes/{rid}/native/ffprobe if File.Exists ...
        return RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffprobe.exe" : "ffprobe";
    }

    private static string ResolveFfmpegPath()
    {
        // ... bundled under runtimes/{rid}/native/ffmpeg if File.Exists ...
        return RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg";
    }
```

**Uses:** **`ffprobe`** — duration probing during library refresh; **`ffmpeg`** — thumbnail frame extraction, loudness (`ebur128`), with graceful degradation when `VerifyFfmpegAsync` fails (stages complete with “unavailable” messaging rather than crashing the host).

The **desktop client does not** call `ResolveFfprobePath` / `ResolveFfmpegPath`; those are **server-only**.

### A.3 Combined install commands today

`LinuxNativeDependencyInstructions` emits **one copy-paste block per family** that installs **both** FFmpeg (server) and VLC (desktop) when the dialog appears — e.g. Debian-like `ffmpeg vlc`, Fedora RPM Fusion + swap + `vlc ffmpeg`, openSUSE Packman `ffmpeg vlc vlc-codecs`, Arch `ffmpeg vlc`. A user running **only the server** or **only the desktop** still receives the combined command if they hit the **desktop** LibVLC-missing dialog; the server has **no equivalent dialog** for missing FFmpeg on Linux (refresh stages degrade instead).

---

## Section B — Candidate minimal package sets per distro family

**Legend:** **Verified** = confirmed by operator on a real VM or by official package index metadata cited here. **Unverified** = plausible minimal set to test in Section C; must not be treated as final until tests pass.

### B.1 Debian-like (Linux Mint, Ubuntu, Debian)

| Package / set | Status | Notes |
|---------------|--------|-------|
| **`libvlc5`** | **Verified** (Debian Bookworm package index) | Ships **`/usr/lib/x86_64-linux-gnu/libvlc.so.5`**; depends on **`libvlccore9`**. |
| **`libvlccore9`** | **Verified** (transitive via `libvlc5`) | Core library for LibVLC 3.x. |
| **`vlc-plugin-base`** | **Unverified** (candidate) | Debian splits “base plugins”; likely needed for demux/access/core decode chain. |
| **`vlc-plugin-video-output`** | **Unverified** (candidate) | Video output plugins for embedding (vout). |
| **`vlc`** (metapackage) | **Unverified** (likely superset) | Pulls player binary, Qt plugin, and many plugins — **GUI/binary candidate for removal** from recommendations if slimmer set works. |
| **`libvlc-dev`** | **Not required** | Resolver loads **`libvlc.so.5`**; dev symlink not needed (already shipped in app). |
| **`ffmpeg`** | **Verified** (server need) | Debian **`ffmpeg`** package provides **`ffmpeg`** and **`ffprobe`** on `PATH` (standard layout). |

**Provisional minimal desktop candidate (unverified):** `libvlc5` + `vlc-plugin-base` + `vlc-plugin-video-output` (exact plugin set to be tuned in VM tests — may need additional `vlc-plugin-*` for specific codecs).

**Provisional server candidate (unverified):** `ffmpeg` alone (if `ffprobe` is included, as on typical Debian installs).

### B.2 Fedora (43+)

| Package / set | Status | Notes |
|---------------|--------|-------|
| **`vlc-libs`** | **Verified** (operator: present on clean Fedora 43 KDE via Phonon; provides **`libvlc.so.5`**) | Subpackage exists on Fedora Packages site (`vlc-libs`, `vlc-gui-qt`, `vlc-cli`, …). |
| **`vlc`** (player metapackage) | **Verified not required for load** (operator: app started without **`vlc`** installed) | **GUI/player candidate for removal** from install instructions. |
| **`vlc-plugins-base`**, **`vlc-plugins-video-out`**, **`vlc-plugin-ffmpeg`** | **Unverified** (candidates) | Operator saw multiple **`vlc-plugin*`** on clean KDE; exact minimal subset unknown. **`vlc-plugin-ffmpeg`** ties decode to system FFmpeg libs. |
| **`vlc-gui-qt`**, **`vlc-cli`**, **`vlc-devel`** | **Unverified** (likely removable) | GUI/CLI/devel — not referenced by ReelRoulette code. |
| RPM Fusion + **`ffmpeg`** (swap from **`ffmpeg-free`**) | **Verified** (operator) | **Decode/playback** fixed with swap alone; no VLC package install. Default **`ffmpeg-free`** insufficient for typical H.264/HEVC decode in VLC’s ffmpeg plugin. |
| **`ffmpeg-free`** only | **Verified insufficient** (operator: black video) | Not a ReelRoulette-specific check — LibVLC decode path. |

**Provisional minimal desktop candidate (unverified):** On a system **without** Phonon-pulled VLC: **`vlc-libs`** + minimal **`vlc-plugin*`** set (test matrix below) — **not** **`vlc`**. On KDE clean snapshot, **first measure what Phonon already installed** before adding packages.

**Provisional server candidate (unverified):** RPM Fusion **`ffmpeg`** (includes **`ffprobe`**).

**Open question:** Fedora **Workstation (GNOME)** clean snapshot may **lack** Phonon-related **`vlc-libs`** — behavior may differ from **Fedora KDE**. Test separately if a GNOME VM is available; do not assume KDE baseline applies.

### B.3 openSUSE (Leap 16.0 / Tumbleweed + Packman)

| Package / set | Status | Notes |
|---------------|--------|-------|
| **`libvlc5`**, **`libvlccore9`** | **Unverified** (candidates; naming per operator/Packman listings) | Library SONAME alignment with LibVLC 3 / `.so.5`. |
| **`vlc-noX`** | **Unverified** (candidate) | Described in Packman as non-GUI VLC portion — may be slimmer than full **`vlc`**. |
| **`vlc-codecs`** | **Unverified** (candidate) | In current dialog command; likely codec/plugin bundle. |
| **`vlc`**, **`vlc-qt`** | **Unverified** (GUI candidates for removal) | Qt/GUI-oriented; app uses **`--intf dummy`**. |
| Packman **`ffmpeg`** | **Unverified** (server + possibly LibVLC decode) | Required for server; may affect VLC plugin decode similar to Fedora. |

**Provisional minimal desktop candidate (unverified):** Packman repo + **`libvlc5`** / **`libvlccore9`** + **`vlc-noX`** or plugin subset + **`vlc-codecs`** — exact set **only** via VM tests.

**Provisional server candidate (unverified):** Packman **`ffmpeg`**.

### B.4 Arch-like (CachyOS, Arch, Manjaro)

| Package / set | Status | Notes |
|---------------|--------|-------|
| **`vlc`** | **Unverified** (likely monolithic) | Arch **`vlc`** PKGBUILD typically ships libs, plugins, and **`/usr/bin/vlc`** in one package; splitting may be impractical. If monolithic, **`vlc`** remains the correct **single** desktop package even though the **binary is unused** by ReelRoulette. |
| **`ffmpeg`** | **Verified** (server need, standard Arch package) | Provides **`ffmpeg`** and **`ffprobe`**. |

**Provisional minimal desktop candidate (unverified):** **`vlc`** (until proven otherwise on Arch) — test whether a smaller combination exists (e.g. AUR splits); official repos may not offer lib-only split.

---

## Section C — VM test matrix (Christian)

**Global conventions**

- Restore the **clean snapshot** for each VM before that distro’s section.
- Use a **recent desktop AppImage or dev build** with the **Linux LibVLC resolver** (same as current mainline).
- **Test media:** H.264 MP4 (and optionally HEVC) from the library or a known sample URL/file.
- **Pass — load:** App main window appears, **no** Linux dependency dialog.
- **Pass — playback:** Visible video (not black frame) and audible audio if the clip has audio.
- **Pass — server tools:** `command -v ffprobe && ffprobe -version` and `command -v ffmpeg && ffmpeg -version` succeed **after** the server-oriented install step.
- **Fail:** Dependency dialog; immediate exit on non-Linux paths; persistent black video with “playing” UI; missing `ffprobe`/`ffmpeg` after server install step.

Replace **`/path/to/ReelRoulette.Desktop.AppImage`** and **`/path/to/ReelRoulette.Server.AppImage`** with published dev paths.

---

### C.1 Linux Mint (Debian-like)

**1. Baseline inventory**

```bash
dpkg -l | grep -iE 'vlc|libvlc|ffmpeg' || true
ls -la /usr/lib/x86_64-linux-gnu/libvlc.so* 2>/dev/null || ls -la /usr/lib/*/libvlc.so* 2>/dev/null
test -e /usr/lib/x86_64-linux-gnu/libvlc.so && echo "libvlc.so: yes" || echo "libvlc.so: no"
command -v ffprobe || echo "ffprobe: missing"
command -v ffmpeg || echo "ffmpeg: missing"
```

**Expected on clean snapshot:** Likely **no** `libvlc.so.5` or **no** VLC packages; **`ffprobe`/`ffmpeg` missing** unless preinstalled.

**2. Launch desktop (no install)**

```bash
/path/to/ReelRoulette.Desktop.AppImage
```

**Expected:** **Dependency dialog** (LibVLC cannot load). Dismiss and exit cleanly.

**3. Minimal install — candidate set (unverified)**

```bash
sudo apt update
sudo apt install -y ffmpeg libvlc5 vlc-plugin-base vlc-plugin-video-output
```

If playback fails (black or error), **do not** edit commands in-repo yet — note failure and try adding **`vlc-plugin-access-extra`** or, as control, **`vlc`**, in a **follow-up test run** (document result only).

**4. Re-check files and tools**

```bash
dpkg -l | grep -iE 'vlc|libvlc|ffmpeg'
ls -la /usr/lib/x86_64-linux-gnu/libvlc.so*
test -e /usr/lib/x86_64-linux-gnu/libvlc.so && echo "libvlc.so: yes" || echo "libvlc.so: no"
command -v ffprobe && ffprobe -version | head -1
command -v ffmpeg && ffmpeg -version | head -1
```

**Expected:** **`libvlc.so.5` exists**; **`libvlc.so` may be absent** (resolver still OK); **`ffprobe`/`ffmpeg` present**.

**5. Launch desktop and play video**

```bash
/path/to/ReelRoulette.Desktop.AppImage
```

**Expected:** **No dialog**; playback **pass** criteria above.

**6. Server-only check (same VM, after step 3)**

```bash
/path/to/ReelRoulette.Server.AppImage
# Trigger library refresh or inspect operator UI refresh stages for duration/thumbnail progress
```

**Expected:** Refresh stages that need **`ffprobe`/`ffmpeg`** progress without “ffmpeg not found” / perpetual skip (exact UI strings may vary).

---

### C.2 Fedora 43 (KDE — primary)

**1. Baseline inventory**

```bash
rpm -qa | grep -i vlc | sort
rpm -qa | grep -i ffmpeg | sort
ls -la /usr/lib64/libvlc.so* 2>/dev/null
test -e /usr/lib64/libvlc.so && echo "libvlc.so: yes" || echo "libvlc.so: no"
rpm -q vlc 2>/dev/null || echo "vlc package: not installed"
command -v ffprobe || echo "ffprobe: missing"
```

**Expected on clean Fedora 43 KDE (operator):** **`vlc-libs`** and **`vlc-plugin*`** may **already** be installed (Phonon); **`libvlc.so.5` present**; **`vlc` metapackage may be absent**; default **`ffmpeg-free`**.

**2. Launch desktop (before any intentional install)**

```bash
/path/to/ReelRoulette.Desktop.AppImage
```

**Expected (operator):** **No dialog**; app starts; video may be **black** until FFmpeg swap.

**3. RPM Fusion + FFmpeg swap only (operator scenario — verified decode fix)**

```bash
sudo dnf install -y https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm \
  https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm
sudo dnf swap ffmpeg-free ffmpeg --allowerasing
```

**Do not install `vlc` in this step.**

**4. Playback retest**

```bash
/path/to/ReelRoulette.Desktop.AppImage
```

**Expected:** Video **no longer black** (operator outcome).

**5. Minimal LibVLC on a Phonon-free system (unverified — requires extra snapshot or explicit remove)**

Only if a **second snapshot** or **`sudo dnf remove 'vlc*'`** test VM is acceptable:

```bash
# After removal confirms no libvlc.so.5:
sudo dnf install -y vlc-libs vlc-plugins-base vlc-plugins-video-out vlc-plugin-ffmpeg
# Repeat RPM Fusion + ffmpeg swap if needed
```

**Expected to prove:** Smallest **`vlc-*`** set that restores load + playback **without** **`vlc`** / **`vlc-gui-qt`**.

**6. Server tools**

```bash
command -v ffprobe && ffprobe -version | head -1
command -v ffmpeg && ffmpeg -version | head -1
```

After step 3, **Expected:** both on **`PATH`**.

**Open question — Fedora 43 GNOME:** Repeat steps **1–4** on a **GNOME Workstation** clean snapshot if available; record whether **`rpm -qa | grep -i vlc`** is empty and whether the **dependency dialog** appears at step 2.

---

### C.3 openSUSE Leap 16.0

**1. Baseline inventory**

```bash
zypper se -i | grep -iE 'vlc|libvlc|ffmpeg' || true
ls -la /usr/lib64/libvlc.so* 2>/dev/null
test -e /usr/lib64/libvlc.so && echo "libvlc.so: yes" || echo "libvlc.so: no"
command -v ffprobe || echo "ffprobe: missing"
```

**2. Launch desktop (no install)**

```bash
/path/to/ReelRoulette.Desktop.AppImage
```

**Expected:** Likely **dialog** if no LibVLC; record actual behavior.

**3. Minimal install — candidate (unverified)**

```bash
sudo zypper addrepo -cfp 90 'https://ftp.gwdg.de/pub/linux/misc/packman/suse/openSUSE_Leap_$releasever/' packman
sudo zypper refresh
sudo zypper install --allow-vendor-change --from packman ffmpeg libvlc5 libvlccore9 vlc-noX vlc-codecs
```

If playback fails, document and retry with **`vlc`** as **control** (test note only).

**4. Re-check and launch**

Same pattern as Mint: package list, `libvlc.so*`, `ffprobe`/`ffmpeg`, AppImage, playback pass.

**5. Server refresh check** — same as Mint step 6.

---

### C.4 CachyOS (Arch-like)

**1. Baseline inventory**

```bash
pacman -Q | grep -iE 'vlc|ffmpeg' || true
ls -la /usr/lib/libvlc.so* /usr/lib64/libvlc.so* 2>/dev/null
test -e /usr/lib/libvlc.so -o -e /usr/lib64/libvlc.so && echo "libvlc.so: yes" || echo "libvlc.so: no"
command -v ffprobe || echo "ffprobe: missing"
```

**2. Launch desktop (no install on clean snapshot if possible)**

**Expected:** Dialog if VLC absent; on daily-driver CachyOS may already have **`vlc`** — note **regression-only** if preinstalled.

**3. Minimal install — candidate**

```bash
sudo pacman -S --needed ffmpeg vlc
```

**Purpose:** Confirm **`vlc`** monolith still satisfies load + playback (Arch-like **expected** outcome); record if a smaller set exists.

**4. Server tools + playback** — same pass criteria.

---

### C.5 Negative control — no VLC anywhere

On **any one** VM snapshot with **all** VLC packages removed and **no** minimal install:

```bash
/path/to/ReelRoulette.Desktop.AppImage
```

**Expected:** **Dependency dialog** still appears (LibVLC load failure). Confirms resolver returning zero still triggers existing gating.

---

## Section D — Detection signals for “LibVLC loaded but playback broken” (secondary)

The Fedora case: **`Core.Initialize()` succeeds**, no dialog, **`MediaPlayer`** may enter **Playing**, but video is **black** (decode/FFmpeg mismatch). The current dialog **cannot** catch this.

### D.1 What ReelRoulette already uses

| Signal | Location | Limitation |
|--------|----------|------------|
| **`MediaPlayer.EncounteredError`** | Subscribed in `MainWindow.axaml.cs` | Handler assumes **file not found** messaging; LibVLC **`MediaPlayerEncounteredError`** is a generic fatal error event — **may not fire** for all decode/vout failures (black video with partial pipeline). |
| **`MediaPlayer.Playing` / `Paused` / `Stopped`** | Same | **Playing** can occur without visible frames. |
| **`MediaPlayer.Vout` / `VoutCount`** | LibVLCSharp **3.9.7** (`MediaPlayer.Vout` event, `VoutCount` property) | **Unverified in this repo** whether black Fedora case had **`VoutCount == 0`** after Playing — candidate signal for follow-up. |
| **`MediaPlayer.Buffering`** | Available | Useful for network stalls; unclear for local decode failure. |
| **`enableDebugLogs: false`** on `LibVLC` | `MainWindow.axaml.cs` | Verbose LibVLC logging **disabled** at construction. |

### D.2 LibVLC / LibVLCSharp logging (available, not wired)

LibVLCSharp **`LibVLC.Log`** event (`EventHandler<LogEventArgs>`) with **`LibVLCLogSet`** native callback (see LibVLCSharp 3.9.7 `LibVLC.cs`). Enabling requires subscribing to **`Log`** and/or passing **`enableDebugLogs: true`** in constructor options. LibVLC log lines often include **module names** (`avcodec`, `ffmpeg`, `vout_display`) and error text suitable for **post-hoc** classification — **not** implemented today.

### D.3 Practical detectability summary (facts only)

- **LibVLC load failure:** Detected today via **`TryInitializeLibVlc()`** → dialog.
- **Decode / FFmpeg mismatch (black video):** **Not** detected by install dialog; **may** surface via **`EncounteredError`**, **`Vout`/`VoutCount`**, or **`LibVLC.Log`** — requires empirical correlation on the failing Fedora state (before swap) vs fixed state (after swap). **No fix designed in this audit.**

---

## References (in-repo)

- `docs/libvlc-loading-audit.md` — resolver mechanism and `.so.5` loading
- `LinuxNativeDependencyInstructions.cs` — **current** combined commands (unchanged by this audit)
- `RefreshPipelineService.cs` — FFmpeg/ffprobe resolution

---

## Verification performed for this document

| Check | Result |
|-------|--------|
| Code paths quoted from repository | Complete |
| Package names from Debian/Fedora indices where cited | Partial (Bookworm plugin names; Fedora subpackage names from packages.fedoraproject.org listing) |
| VM tests | **Not run** — matrix for Christian |
| `dotnet build ReelRoulette.sln` | Run after adding this file |
