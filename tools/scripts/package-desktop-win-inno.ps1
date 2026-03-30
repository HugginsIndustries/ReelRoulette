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

function Resolve-IsccPath {
    $fromPath = Get-Command iscc -ErrorAction SilentlyContinue
    if ($fromPath) {
        return $fromPath.Source
    }

    $candidates = @()
    $programFilesX86 = ${env:ProgramFiles(x86)}
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $candidates += (Join-Path $programFilesX86 "Inno Setup 6\ISCC.exe")
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $candidates += (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
    }

    $regKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe"
    )
    foreach ($key in $regKeys) {
        $item = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
        if ($item -and $item.PSObject.Properties.Name -contains "(default)" -and $item.'(default)') {
            $candidates += [string]$item.'(default)'
        }
        if ($item -and $item.InstallLocation) {
            $candidates += (Join-Path ([string]$item.InstallLocation) "ISCC.exe")
        }
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate) {
            return [string]$candidate
        }
    }

    return $null
}

$isccPath = Resolve-IsccPath
if (-not $isccPath) {
    Write-Error "Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 or add ISCC.exe to PATH."
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $repoRoot "src\clients\desktop\ReelRoulette.DesktopApp\ReelRoulette.DesktopApp.csproj"
$sharedIconPath = Join-Path $repoRoot "assets\HI.ico"

if ([string]::IsNullOrWhiteSpace($Version)) {
    [xml]$projectXml = Get-Content -Path $projectPath -Raw
    $Version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = "dev"
    }
}

$publishDir = Join-Path $repoRoot "artifacts\publish\desktop-$Runtime"
$installerOutDir = Join-Path $repoRoot "$OutputRoot\installer"
$issPath = Join-Path $repoRoot "tools\installer\ReelRoulette.Desktop.iss"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $installerOutDir | Out-Null

Push-Location $repoRoot
try {
    Invoke-EnsureWinX64NativeDeps -Root $repoRoot

    if (-not (Test-Path $sharedIconPath)) {
        Write-Error "Shared icon was not found at $sharedIconPath."
        exit 1
    }

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

    & $isccPath `
        "/DAppVersion=$Version" `
        "/DSourceDir=$publishDir" `
        "/DOutputDir=$installerOutDir" `
        "/DSharedIconPath=$sharedIconPath" `
        "$issPath"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "iscc failed with code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    Write-Host "Installer package created in: $installerOutDir"
}
finally {
    Pop-Location
}
