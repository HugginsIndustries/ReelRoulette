# LibVLC Native Loading on Linux — Feasibility Audit

Report-only investigation of whether the ReelRoulette desktop app can load system LibVLC on Linux when only the **runtime** package is installed (versioned `libvlc.so.5` present, unversioned `libvlc.so` absent). No application code, packages, or dependency-instruction mappings were changed to produce this document.

**Investigation host:** CachyOS (this machine has `/usr/lib64/libvlc.so` present via the development symlink layout; it cannot reproduce the runtime-only failure locally.)

---

## Executive answer

**Yes.** The app can load LibVLC on Linux with only the runtime package installed, **without** requiring users to install `libvlc-dev` / `vlc-devel` solely for the unversioned symlink.

**Recommended mechanism:** Register `NativeLibrary.SetDllImportResolver` against the **LibVLCSharp** assembly **before** any call to `LibVLCSharp.Shared.Core.Initialize()` (or any other LibVLCSharp API that P/Invokes `libvlc`). On Linux only, when `libraryName` is `"libvlc"`, load the versioned soname via `NativeLibrary.Load("libvlc.so.5")` (or `TryLoad`) and return that handle. Returning `IntPtr.Zero` for other names preserves default resolution.

**Wire-in point:** `Program.cs` → `TryInitializeLibVlc()` (or a small Linux-only helper invoked at the very start of that method), **before** `Core.Initialize()` / `new LibVLC()`. Must remain **Linux-gated** so Windows continues to use bundled LibVLC via `Core.Initialize(bundledLibVlcPath)` and explicit `LoadLibVLC` (Section F).

**Empirical confirmation on this machine:** The resolver callback fired with `libraryName=libvlc` only; redirecting to `libvlc.so.5` allowed `Core.Initialize()`, `new LibVLC()`, and media creation to succeed.

**Remaining verification:** Any shipped fix must be validated on a **clean Fedora 43 or openSUSE Leap 16.0 VM** with **only** the VLC runtime package (no `vlc-devel` / dev symlink), because this investigation machine already has `libvlc.so`.

---

## Package versions (resolved)

| Package | Version | Source |
|---------|---------|--------|
| `LibVLCSharp.Avalonia` | **3.9.7** | `ReelRoulette.DesktopApp.csproj` |
| `LibVLCSharp` (transitive) | **3.9.7** | `libvlcsharp.avalonia/3.9.7/libvlcsharp.avalonia.nuspec` dependency |
| `VideoLAN.LibVLC.Windows` | 3.0.23 | Windows bundled tree only (unchanged by Linux fix) |

NuGet cache paths used for inspection: `~/.nuget/packages/libvlcsharp/3.9.7/`, `~/.nuget/packages/libvlcsharp.avalonia/3.9.7/`.

LibVLCSharp upstream source references in this report: Git tag **3.9.7** on [videolan/libvlcsharp](https://github.com/videolan/libvlcsharp) (`raw.githubusercontent.com/videolan/libvlcsharp/3.9.7/...`).

---

## Section A — How LibVLCSharp locates and loads the library on Linux

### A.1 Mechanism: `[DllImport("libvlc")]` via the CLR, not a custom Linux loader

On desktop targets, LibVLCSharp declares native entry points with `[DllImport(Constants.LibraryName, ...)]` where `Constants.LibraryName` is the string **`"libvlc"`** (not a path, not `libvlc.so.5`):

```12:14:https://raw.githubusercontent.com/videolan/libvlcsharp/3.9.7/src/LibVLCSharp/Shared/Core/Constants.cs
        internal const string LibraryName = "libvlc";
#endif
        internal const string CoreLibraryName = "libvlccore";
```

Example (first use during initialization — version check):

```csharp
// libvlcsharp 3.9.7 — src/LibVLCSharp/Shared/Core/Core.cs
[DllImport(Constants.LibraryName, CallingConvention = CallingConvention.Cdecl,
    EntryPoint = "libvlc_get_version")]
internal static extern IntPtr LibVLCVersion();
```

All LibVLC API P/Invokes (e.g. `libvlc_new` in `LibVLC.cs`) use the same `Constants.LibraryName` (`"libvlc"`).

**Windows/macOS (non-Linux):** `Core.LoadLibVLC()` explicitly loads **`libvlccore`** then **`libvlc`** from disk using `LoadLibraryW` / `dlopen` on constructed paths (`libvlccore.dll` / `libvlc.dll` or `.dylib`). That path is **not executed on Linux** (Section B).

**Linux:** There is **no** LibVLCSharp call to `NativeLibrary.Load`, `dlopen`, or `LoadLibVLC` during normal startup. The native library is loaded implicitly when the CLR resolves the first `[DllImport("libvlc")]` — typically `libvlc_get_version` inside `EnsureVersionsMatch()` from `Core.Initialize()`.

### A.2 .NET filename probing for `[DllImport("libvlc")]` on Linux

For a simple name without path separators and **without** an embedded `.so` suffix, the managed loader uses `LibraryNameVariation.DetermineLibraryNameVariations` (mirrors CoreCLR `DetermineLibNameVariations`). For `libName = "libvlc"` the variations are, in order:

1. `libvlc` + `.so` → **`libvlc.so`**
2. `lib` + `libvlc` + `.so` → **`liblibvlc.so`**
3. `libvlc` (no suffix)
4. `lib` + `libvlc` → **`liblibvlc`**

Source: [dotnet/runtime `LibraryNameVariation.Unix.cs`](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Runtime/Loader/LibraryNameVariation.Unix.cs) (`else` branch when `containsSuffix` is false).

Each candidate is passed to `dlopen` via the default library search path ( `LD_LIBRARY_PATH`, `DT_RPATH`, `/etc/ld.so.cache`, etc.).

**Crucially, the probe list does not include `libvlc.so.5`, `libvlc.so.5.6.1`, or any other versioned soname.**

Therefore, on distros that ship only **`libvlc.so.5`** (and the real ELF file) but **not** the unversioned **`libvlc.so`** symlink, every variant above fails. That matches the observed failure on clean Fedora 43 / openSUSE Leap 16.0 VMs with runtime-only VLC installs, and the success after installing the development package that adds `libvlc.so` → `libvlc.so.5`.

### A.3 Why `liblibvlc.so` does not help

Distros name the shared object **`libvlc.so.5`**, not `liblibvlc.so`. The extra `lib` prefix variant does not align with VLC’s published soname.

---

## Section B — What `Core.Initialize` does on Linux

### B.1 Public entry point

```csharp
// libvlcsharp 3.9.7 — src/LibVLCSharp/Shared/Core/Core.Desktop.cs
public static void Initialize(string? libvlcDirectoryPath = null)
{
    DisableMessageErrorBox();
    InitializeDesktop(libvlcDirectoryPath);
#if !NETSTANDARD1_1
    EnsureVersionsMatch();
#endif
    LibVLCLoaded = true;
}
```

### B.2 Linux-specific `InitializeDesktop` — no explicit load, no directory support

```csharp
// libvlcsharp 3.9.7 — src/LibVLCSharp/Shared/Core/Core.Desktop.cs
static void InitializeDesktop(string? libvlcDirectoryPath = null)
{
    if(PlatformHelper.IsLinux)
    {
        if (!string.IsNullOrEmpty(libvlcDirectoryPath))
        {
            throw new InvalidOperationException($"Using {nameof(libvlcDirectoryPath)} is not supported on the Linux platform. " +
                $"The recommended way is to have the libvlc librairies in /usr/lib. Use LD_LIBRARY_PATH if you need more customization");
        }
        return;
    }
    LoadLibVLC(libvlcDirectoryPath);
}
```

**Plain summary:**

| Platform | `Core.Initialize()` with path | Effect |
|----------|------------------------------|--------|
| **Linux** | Path **ignored** (empty only allowed) | Does **not** call `LoadLibVLC`. Does **not** set plugin paths inside LibVLCSharp. Sets `_libvlcLoaded` only after `EnsureVersionsMatch()`, which **does** trigger `[DllImport("libvlc")]` loading via the CLR. |
| **Windows** | Path optional | Calls `LoadLibVLC(path)` → explicit `LoadLibraryW` on **`libvlccore.dll`** and **`libvlc.dll`** under that directory (or search paths). |

So on Linux, passing a directory (as the desktop app does for Windows bundled LibVLC) **cannot** redirect library loading today — it throws if non-null.

The desktop app’s Linux path calls `Core.Initialize()` with **no** argument after bundled path is absent (`Program.cs` → `TryInitializeLibVlc`).

### B.3 `VLC_PLUGIN_PATH` and plugins

- ReelRoulette sets **`VLC_PLUGIN_PATH`** only when initializing **bundled** Windows LibVLC (`Program.cs` combines `bundledLibVlcPath` + `plugins`).
- LibVLCSharp **does not** set `VLC_PLUGIN_PATH` on Linux during `Initialize`.
- Once **`libvlc.so.5`** loads successfully, LibVLC normally discovers plugins from standard install locations (e.g. `/usr/lib/vlc/plugins`, distro-specific paths under `/usr/lib64`). **`VLC_PLUGIN_PATH`** remains an optional override if a future scenario required it; it is **not** required for the soname/symlink problem described in this audit.
- Plugin discovery is **separate** from the initial CLR load of `libvlc.so` / `libvlc.so.5`; the failure mode reported by users occurs **before** plugin loading, at native library resolution.

---

## Section C — `DllImportResolver` intercept (empirical test)

Scratch console app under **`/tmp/libvlc-resolver-test`** (deleted after test; confirmed removed):

- Target: `net10.0`
- Package: `LibVLCSharp` **3.9.7**
- `NativeLibrary.SetDllImportResolver(typeof(LibVLC).Assembly, ...)`

### C.1 Does the callback fire?

**Yes.** On the first `Core.Initialize()`:

```
RESOLVER libraryName=libvlc assembly=LibVLCSharp searchPath=
```

- **Exact name string:** `libvlc` (no `lib` prefix, no `.so` suffix in the callback argument).
- **Count for Initialize alone:** 1 invocation.
- When the resolver returned **`IntPtr.Zero`**, the runtime **fell back** to default probing and `Core.Initialize()` still succeeded on this machine (because `libvlc.so` exists here).

### C.2 Redirect to `libvlc.so.5`

With resolver logic:

```csharp
if (libraryName == "libvlc" && NativeLibrary.TryLoad("libvlc.so.5", out var handle))
    return handle;
```

Results:

- `Core.Initialize()` succeeded.
- `new LibVLC()` and `new Media(...)` succeeded.
- Resolver invoked **5 times** during the test run; **every** invocation used `libraryName=libvlc`.
- **`libvlccore` was never requested** as a separate `libraryName` in the resolver callback.

**Interpretation:** On Linux, LibVLCSharp does not P/Invoke `libvlccore` directly. Loading `libvlc.so.5` pulls `libvlccore` in via the dynamic linker (`DT_NEEDED`) from standard system paths (typically versioned `libvlccore.so.9` already present with runtime VLC packages).

### C.3 Soname-only `NativeLibrary.Load("libvlc.so.5")`

**Confirmed:** No absolute path was required on this machine; `TryLoad("libvlc.so.5")` succeeded using the dynamic linker’s normal search (consistent with `ldconfig -p` listing `libvlc.so.5`).

---

## Section D — Discovering the versioned library at runtime

If the resolver maps `"libvlc"` → `NativeLibrary.Load("libvlc.so.5")`, **path discovery is unnecessary** on typical distro installs where `libvlc.so.5` is registered in the linker cache.

| Approach | Pros | Cons |
|----------|------|------|
| **`NativeLibrary.Load("libvlc.so.5")` / `TryLoad`** | Uses the same search order as any native app; works across `/usr/lib`, `/usr/lib64`, multiarch paths without hardcoding | Fails if a distro ever shipped LibVLC without registering the soname in `ld.so.cache` (unusual for packaged VLC) |
| **`dlopen("libvlc.so.5")` via resolver** | Same as above | Same |
| **Parse `ldconfig -p`** | Explicit, introspectable | Shelling out or parsing `ld.so.cache` is heavier; redundant if soname load works |
| **Probe fixed directory list** | Predictable in minimal containers | Fragile across distros/architectures; must maintain matrix |
| **Read `/proc/self/maps` / `VLC_LIB_PATH`** | — | Not standard; avoid |

**Most robust for this app:** Resolver + **`TryLoad("libvlc.so.5")`**, with optional fallback to **`TryLoad("libvlc.so")`** (dev symlink layout) for environments that already have the unversioned name.

### Major version in soname (`.so.5`)

- LibVLC **3.x** uses **`libvlc.so.5`** on current Fedora, openSUSE, Debian, Arch (stable VLC 3).
- LibVLCSharp **3.9.7** enforces matching **major** versions between LibVLCSharp and native LibVLC (`EnsureVersionsMatch()`).
- **LibVLC 4** is in development and would imply a different soname major and a future LibVLCSharp major; hardcoding **`libvlc.so.5`** is appropriate for the current ReelRoulette stack (LibVLCSharp 3.x + system VLC 3).
- A defensive implementation could try `libvlc.so.5` then `libvlc.so.4` only if the project ever targets LibVLC 4 — not required for the present failure mode.

---

## Section E — Symlink-creation fallback (if resolver were unavailable)

**Assessment:** Poor fit compared to the resolver, and **does not integrate with `Core.Initialize(path)` on Linux** because LibVLCSharp **throws** if `libvlcDirectoryPath` is non-null on Linux.

Possible but awkward alternatives:

1. **App-owned directory + symlinks** (`libvlc.so` → copy of or symlink to versioned file) + set **`LD_LIBRARY_PATH`** to that directory **before** the first P/Invoke. This bypasses LibVLCSharp’s directory API but requires early startup ordering, writable app data, and likely **mirroring `libvlccore`** if the linker cannot resolve it when only loading via a fake `libvlc.so` in an non-standard directory.
2. **Symlink only for `libvlc.so`** in app data while still relying on system `libvlccore` — may work if `dlopen` on the symlink loads dependencies from default paths; behavior is distro-dependent and harder to reason about than loading `libvlc.so.5` directly.

**Plugin path:** A private symlink directory does **not** relocate VLC plugins; system plugin paths should still apply when the loaded `libvlc.so.5` is the system binary.

Given Section C, **the resolver approach is strictly preferable**; symlink fallback is a contingency only if resolver registration were impossible (it is possible).

---

## Section F — Windows must remain unaffected

### F.1 Current Windows bundled loading (unchanged by Linux resolver)

1. **`NativeBinaryHelper.GetLibVlcPath()`** returns `AppContext.BaseDirectory/runtimes/win-x64/native/libvlc` when that directory exists (from **`VideoLAN.LibVLC.Windows`** NuGet content).
2. **`TryInitializeLibVlc`** sets **`VLC_PLUGIN_PATH`** to `{bundled}/plugins` and calls **`Core.Initialize(bundledLibVlcPath)`**.
3. On non-Linux, **`InitializeDesktop`** calls **`LoadLibVLC`**, which loads **`libvlccore.dll`** and **`libvlc.dll`** from that folder via **`LoadLibraryW`** — not via `[DllImport]` resolution first.

Linux resolver wiring must be guarded with **`RuntimeInformation.IsOSPlatform(OSPlatform.Linux)`** (or equivalent) and must run **only** on Linux. Windows never registers the resolver (or the resolver is a no-op returning `IntPtr.Zero` on non-`libvlc` names only on Linux).

No change to **`VideoLAN.LibVLC.Windows`**, **`NativeBinaryHelper`**, or the `runtimes/win-x64/native/libvlc/` layout is required for the Linux fix.

---

## Section G — Implementation notes (for a future change; not done in this audit)

Suggested shape (documentation only):

1. Early in `TryInitializeLibVlc()` on Linux, call `NativeLibrary.SetDllImportResolver` on `typeof(LibVLC).Assembly` (or `typeof(Core).Assembly` — same assembly).
2. Map `"libvlc"` → `NativeLibrary.TryLoad("libvlc.so.5", out h) ? h : IntPtr.Zero`.
3. Leave **`LinuxNativeDependencyInstructions`** and dependency dialogs unchanged until the fix is verified on runtime-only VMs and shipped.

Logging resolver failures to `last.log` would aid field diagnosis without reverting to dev-package instructions prematurely.

---

## Verification performed for this document

| Check | Result |
|-------|--------|
| LibVLCSharp 3.9.7 source review (GitHub tag 3.9.7) | Complete |
| .NET `LibraryNameVariation.Unix.cs` probe order | Documented |
| `/tmp` scratch resolver test | Complete; scratch tree **deleted** |
| `dotnet build ReelRoulette.sln` | Run after report add (see below) |
| Clean VM runtime-only reproduction | **Not run** (required before shipping) |

---

## References

- LibVLCSharp 3.9.7: `Core.cs`, `Core.Desktop.cs`, `Constants.cs`, `LibVLC.cs`
- .NET runtime: `LibraryNameVariation.Unix.cs`
- ReelRoulette: `Program.cs` (`TryInitializeLibVlc`), `NativeBinaryHelper.cs`, `LinuxNativeDependencyInstructions.cs` (comments describe current symlink requirement; intentionally not modified)
