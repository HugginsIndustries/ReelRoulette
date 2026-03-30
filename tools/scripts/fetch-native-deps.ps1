#!/usr/bin/env pwsh
# Fetches Windows win-x64 native binaries into repo-local runtimes/ (gitignored).
# Same script for local dev and CI; packaging scripts invoke this when artifacts are missing.
param(
    [string]$RepoRoot = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
            [System.Runtime.InteropServices.OSPlatform]::Windows))) {
    Write-Error "fetch-native-deps.ps1 is only supported on Windows."
    exit 1
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$desktopCsproj = Join-Path $RepoRoot "src\clients\desktop\ReelRoulette.DesktopApp\ReelRoulette.DesktopApp.csproj"
$nativeOut = Join-Path $RepoRoot "runtimes\win-x64\native"
$versionsPath = Join-Path $nativeOut ".versions.json"

New-Item -ItemType Directory -Force -Path $nativeOut | Out-Null

function Get-NuGetGlobalPackagesPath {
    $lines = @(dotnet nuget locals global-packages -l 2>&1 | ForEach-Object { "$_" })
    foreach ($line in $lines) {
        if ($line -match 'global-packages:\s*(.+)') {
            return $matches[1].Trim()
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($env:NUGET_PACKAGES)) {
        return $env:NUGET_PACKAGES.Trim()
    }
    return (Join-Path $env:USERPROFILE ".nuget\packages")
}

function Get-LibVlcWindowsPackageVersion {
    param([Parameter(Mandatory = $true)][string]$CsprojPath)
    if (-not (Test-Path -LiteralPath $CsprojPath)) {
        return "3.0.21"
    }
    [xml]$cx = Get-Content -LiteralPath $CsprojPath -Raw
    foreach ($ig in @($cx.Project.ItemGroup)) {
        if ($null -eq $ig.PackageReference) { continue }
        foreach ($pr in @($ig.PackageReference)) {
            if ($pr.Include -eq "VideoLAN.LibVLC.Windows" -and $pr.Version) {
                return [string]$pr.Version
            }
        }
    }
    return "3.0.21"
}

function Read-VersionsState {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    try {
        return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Write-VersionsState {
    param(
        [string]$Path,
        [hashtable]$Data
    )
    ($Data | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $Path -Encoding utf8
}

function Invoke-Download {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$OutFile
    )
    Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing
}

# --- FFmpeg / ffprobe (gyan.dev release essentials ZIP) ---
$ffZipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$ffShaUrl = "${ffZipUrl}.sha256"
$ffVerUrl = "${ffZipUrl}.ver"

Write-Host "[native-deps] FFmpeg: checking release build metadata..."
$remoteFfVer = (Invoke-WebRequest -Uri $ffVerUrl -UseBasicParsing).Content.Trim()
$expectedFfSha = (Invoke-WebRequest -Uri $ffShaUrl -UseBasicParsing).Content.Trim()
if ($expectedFfSha -match '^([a-fA-F0-9]{64})') {
    $expectedFfSha = $matches[1]
}

$versions = @{}
$stateObj = Read-VersionsState -Path $versionsPath
if ($null -ne $stateObj) {
    foreach ($prop in $stateObj.PSObject.Properties) {
        $versions[$prop.Name] = $prop.Value
    }
}

$ffmpegPath = Join-Path $nativeOut "ffmpeg.exe"
$ffprobePath = Join-Path $nativeOut "ffprobe.exe"
$skipFf = (-not $Force) `
    -and (Test-Path -LiteralPath $ffmpegPath) `
    -and (Test-Path -LiteralPath $ffprobePath) `
    -and ($versions['ffmpegZipVer'] -eq $remoteFfVer)

if ($skipFf) {
    Write-Host "[native-deps] FFmpeg: already present (release zip ver $remoteFfVer); skip (use -Force to re-download)."
}
else {
    Write-Host "[native-deps] FFmpeg: fetching $ffZipUrl"
    $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("reelroulette-ffmpeg-" + [Guid]::NewGuid().ToString("n"))
    $zipPath = Join-Path $tmpRoot "ffmpeg-release-essentials.zip"
    New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
    try {
        Invoke-Download -Uri $ffZipUrl -OutFile $zipPath
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash
        if ($actual.ToLowerInvariant() -ne $expectedFfSha.ToLowerInvariant()) {
            throw "FFmpeg ZIP SHA-256 mismatch: expected $expectedFfSha, got $actual"
        }
        Write-Host "[native-deps] FFmpeg: checksum OK (SHA-256)."

        $extractDir = Join-Path $tmpRoot "extract"
        New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

        $binFf = Get-ChildItem -Path $extractDir -Recurse -Filter "ffmpeg.exe" -File -ErrorAction SilentlyContinue |
            Select-Object -First 1
        $binFp = Get-ChildItem -Path $extractDir -Recurse -Filter "ffprobe.exe" -File -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $binFf -or -not $binFp) {
            throw "FFmpeg archive did not contain ffmpeg.exe and ffprobe.exe under $extractDir"
        }
        Copy-Item -LiteralPath $binFf.FullName -Destination $ffmpegPath -Force
        Copy-Item -LiteralPath $binFp.FullName -Destination $ffprobePath -Force
        Write-Host "[native-deps] FFmpeg: installed ffmpeg.exe and ffprobe.exe -> $nativeOut"
    }
    finally {
        Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$versions['ffmpegZipVer'] = $remoteFfVer
$versions['ffmpegSha256'] = $expectedFfSha

# --- LibVLC ---
$libVlcVer = Get-LibVlcWindowsPackageVersion -CsprojPath $desktopCsproj
$libVlcDir = Join-Path $nativeOut "libvlc"
$libVlcDll = Join-Path $libVlcDir "libvlc.dll"

$skipLv = (-not $Force) `
    -and (Test-Path -LiteralPath $libVlcDll) `
    -and ($versions.ContainsKey('libvlcPackageVersion')) `
    -and ($versions['libvlcPackageVersion'] -eq $libVlcVer)

if ($skipLv) {
    Write-Host "[native-deps] LibVLC: already present (VideoLAN.LibVLC.Windows $libVlcVer); skip (use -Force to re-fetch)."
}
else {
    $nugetRoot = Get-NuGetGlobalPackagesPath
    $pkgDir = Join-Path $nugetRoot "videolan.libvlc.windows\$libVlcVer"
    $nugetX64 = Join-Path $pkgDir "build\x64"

    if (-not (Test-Path -LiteralPath (Join-Path $nugetX64 "libvlc.dll"))) {
        Write-Host "[native-deps] LibVLC: restoring $desktopCsproj (populate NuGet global-packages)..."
        dotnet restore $desktopCsproj
        if ($LASTEXITCODE -ne 0) {
            Write-Error "dotnet restore failed with code $LASTEXITCODE"
            exit $LASTEXITCODE
        }
    }

    if (Test-Path -LiteralPath (Join-Path $nugetX64 "libvlc.dll")) {
        Write-Host "[native-deps] LibVLC: using NuGet cache (VideoLAN.LibVLC.Windows $libVlcVer; no separate download)."
        Write-Host "[native-deps] LibVLC: extracting from $nugetX64"
        if (Test-Path -LiteralPath $libVlcDir) {
            Remove-Item -LiteralPath $libVlcDir -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $libVlcDir | Out-Null
        Copy-Item -Path (Join-Path $nugetX64 "*") -Destination $libVlcDir -Recurse -Force
        $versions['libvlcPackageVersion'] = $libVlcVer
        $versions['libvlcSource'] = "nuget"
        Write-Host "[native-deps] LibVLC: installed under $libVlcDir"
    }
    else {
        # Official mirror fallback (same major.minor as NuGet package)
        $vlcZipUrl = "https://get.videolan.org/vlc/$libVlcVer/win64/vlc-${libVlcVer}-win64.zip"
        $vlcShaUrl = "${vlcZipUrl}.sha256"
        Write-Host "[native-deps] LibVLC: NuGet layout missing; fetching $vlcZipUrl"
        $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("reelroulette-vlc-" + [Guid]::NewGuid().ToString("n"))
        $zipPath = Join-Path $tmpRoot "vlc-win64.zip"
        New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
        try {
            $expectedVlcSha = (Invoke-WebRequest -Uri $vlcShaUrl -UseBasicParsing).Content.Trim()
            if ($expectedVlcSha -match '^([a-fA-F0-9]{64})') {
                $expectedVlcSha = $matches[1]
            }
            Invoke-Download -Uri $vlcZipUrl -OutFile $zipPath
            $actualV = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash
            if ($actualV.ToLowerInvariant() -ne $expectedVlcSha.ToLowerInvariant()) {
                throw "VLC ZIP SHA-256 mismatch: expected $expectedVlcSha, got $actualV"
            }
            Write-Host "[native-deps] LibVLC: checksum OK (SHA-256)."

            $extractDir = Join-Path $tmpRoot "extract"
            New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
            Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
            $vlcRoot = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
            if (-not $vlcRoot) {
                throw "VLC archive had no top-level directory under $extractDir"
            }
            if (Test-Path -LiteralPath $libVlcDir) {
                Remove-Item -LiteralPath $libVlcDir -Recurse -Force
            }
            New-Item -ItemType Directory -Force -Path $libVlcDir | Out-Null
            Copy-Item -Path (Join-Path $vlcRoot.FullName "*") -Destination $libVlcDir -Recurse -Force
            $versions['libvlcPackageVersion'] = $libVlcVer
            $versions['libvlcSource'] = "videolan-mirror"
            Write-Host "[native-deps] LibVLC: installed from VideoLAN mirror under $libVlcDir"
        }
        finally {
            Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$versions['lastUpdated'] = (Get-Date).ToUniversalTime().ToString("o")
Write-VersionsState -Path $versionsPath -Data $versions

if (-not (Test-Path -LiteralPath $ffmpegPath) -or -not (Test-Path -LiteralPath $ffprobePath)) {
    Write-Error "FFmpeg staging incomplete."
    exit 1
}
if (-not (Test-Path -LiteralPath $libVlcDll)) {
    Write-Error "LibVLC staging incomplete (missing libvlc.dll)."
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $libVlcDir "plugins"))) {
    Write-Error "LibVLC staging incomplete (missing plugins directory)."
    exit 1
}

Write-Host "[native-deps] Done. Native outputs: $nativeOut"
