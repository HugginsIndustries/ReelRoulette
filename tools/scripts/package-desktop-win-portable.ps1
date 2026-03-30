#!/usr/bin/env pwsh
param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$Version = "",
    [string]$OutputRoot = "artifacts\packages"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet SDK not found in PATH."
    exit 1
}

function Invoke-EnsureWinX64NativeDeps {
    param([Parameter(Mandatory = $true)][string]$Root)
    if ($Runtime -ne "win-x64") {
        return
    }
    $nativeRoot = Join-Path $Root "runtimes\win-x64\native"
    $need = -not (Test-Path (Join-Path $nativeRoot "ffmpeg.exe")) `
        -or -not (Test-Path (Join-Path $nativeRoot "ffprobe.exe")) `
        -or -not (Test-Path (Join-Path $nativeRoot "libvlc\libvlc.dll"))
    if ($need) {
        $fetch = Join-Path $PSScriptRoot "fetch-native-deps.ps1"
        & $fetch -RepoRoot $Root
    }
}

function Ensure-WinDesktopNativeAssets {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$PublishDir
    )

    $nativeDir = Join-Path $PublishDir "runtimes\win-x64\native"
    $libVlcTargetDir = Join-Path $nativeDir "libvlc"
    $libVlcSourceDir = Join-Path $RepoRoot "runtimes\win-x64\native\libvlc"
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $repoRoot "src\clients\desktop\ReelRoulette.DesktopApp\ReelRoulette.DesktopApp.csproj"

if ([string]::IsNullOrWhiteSpace($Version)) {
    [xml]$projectXml = Get-Content -Path $projectPath -Raw
    $Version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = "dev"
    }
}

$publishDir = Join-Path $repoRoot "artifacts\publish\desktop-$Runtime"
$packageRoot = Join-Path $repoRoot $OutputRoot
$stagingDir = Join-Path $packageRoot "portable\ReelRoulette-Desktop-$Version-$Runtime"
$zipPath = "$stagingDir.zip"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

Push-Location $repoRoot
try {
    Invoke-EnsureWinX64NativeDeps -Root $repoRoot

    dotnet publish $projectPath `
        -c $Configuration `
        -r $Runtime `
        --self-contained true `
        -p:PublishSingleFile=false `
        -p:PublishTrimmed=false `
        -p:Version=$Version `
        -p:ErrorOnDuplicatePublishOutputFiles=false `
        -o $publishDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "dotnet publish failed with code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    if ($Runtime -eq "win-x64") {
        Ensure-WinDesktopNativeAssets -RepoRoot $repoRoot -PublishDir $publishDir
    }

    Copy-Item -Recurse -Force (Join-Path $publishDir "*") $stagingDir
    @(
        "ReelRoulette Desktop portable package",
        "Version: $Version",
        "Runtime: $Runtime",
        "",
        "Run: ReelRoulette.DesktopApp.exe"
    ) | Set-Content -Path (Join-Path $stagingDir "PACKAGE_INFO.txt")

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath
    Write-Host "Portable package created: $zipPath"
}
finally {
    Pop-Location
}
