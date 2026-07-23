#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$PublishDir,
    [Parameter(Mandatory = $true)]
    [ValidateSet("server", "desktop")]
    [string]$Component
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
    Write-Error "stage-native-deps.ps1 is Windows-only (bundles runtimes/win-x64/native assets)."
    exit 1
}

$nativeRoot = Join-Path $RepoRoot "runtimes" "win-x64" "native"
$need = -not (Test-Path (Join-Path $nativeRoot "ffmpeg.exe")) `
    -or -not (Test-Path (Join-Path $nativeRoot "ffprobe.exe")) `
    -or -not (Test-Path (Join-Path $nativeRoot "libvlc" "libvlc.dll"))
if ($need) {
    $fetch = Join-Path $PSScriptRoot "fetch-native-deps.ps1"
    & $fetch -RepoRoot $RepoRoot
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

switch ($Component) {
    "server" {
        $src = Join-Path $RepoRoot "runtimes" "win-x64" "native"
        $dest = Join-Path $PublishDir "runtimes" "win-x64" "native"
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        foreach ($exe in @("ffmpeg.exe", "ffprobe.exe")) {
            $from = Join-Path $src $exe
            if (-not (Test-Path -LiteralPath $from)) {
                Write-Error "Missing $exe under $src. Run pwsh ./tools/scripts/fetch-native-deps.ps1 from the repo root."
                exit 1
            }
            Copy-Item -LiteralPath $from -Destination (Join-Path $dest $exe) -Force
        }
    }
    "desktop" {
        $nativeDir = Join-Path $PublishDir "runtimes" "win-x64" "native"
        $libVlcTargetDir = Join-Path $nativeDir "libvlc"
        $libVlcSourceDir = Join-Path $RepoRoot "runtimes" "win-x64" "native" "libvlc"
        New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
        if (-not (Test-Path (Join-Path $libVlcSourceDir "libvlc.dll"))) {
            Write-Error "LibVLC not found at $libVlcSourceDir. Run pwsh ./tools/scripts/fetch-native-deps.ps1 from the repo root."
            exit 1
        }
        if (Test-Path $libVlcTargetDir) {
            Remove-Item -Recurse -Force $libVlcTargetDir
        }
        New-Item -ItemType Directory -Force -Path $libVlcTargetDir | Out-Null
        Copy-Item -Recurse -Force (Join-Path $libVlcSourceDir "*") $libVlcTargetDir

        if (-not (Test-Path (Join-Path $libVlcTargetDir "libvlc.dll"))) {
            Write-Error "Desktop package is missing libvlc.dll after native asset staging."
            exit 1
        }
        if (-not (Test-Path (Join-Path $libVlcTargetDir "plugins"))) {
            Write-Error "Desktop package is missing libvlc plugins after native asset staging."
            exit 1
        }
    }
}
