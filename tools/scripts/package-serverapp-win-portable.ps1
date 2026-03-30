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
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found in PATH."
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

function Ensure-WinServerNativeAssets {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$PublishDir
    )
    $src = Join-Path $RepoRoot "runtimes\win-x64\native"
    $dest = Join-Path $PublishDir "runtimes\win-x64\native"
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $repoRoot "src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"
$webUiProjectDir = Join-Path $repoRoot "src\clients\web\ReelRoulette.WebUI"
$webUiDistPath = Join-Path $webUiProjectDir "dist"
$sharedIconPath = Join-Path $repoRoot "assets\HI.ico"

if ([string]::IsNullOrWhiteSpace($Version)) {
    [xml]$projectXml = Get-Content -Path $projectPath -Raw
    $Version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = "dev"
    }
}

$publishDir = Join-Path $repoRoot "artifacts\publish\serverapp-$Runtime"
$packageRoot = Join-Path $repoRoot $OutputRoot
$stagingDir = Join-Path $packageRoot "portable\ReelRoulette-Server-$Version-$Runtime"
$zipPath = "$stagingDir.zip"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

Push-Location $repoRoot
try {
    Invoke-EnsureWinX64NativeDeps -Root $repoRoot

    Push-Location $webUiProjectDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm install failed with code $LASTEXITCODE"
            exit $LASTEXITCODE
        }
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm run build failed with code $LASTEXITCODE"
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $webUiDistPath)) {
        Write-Error "WebUI build output was not found at $webUiDistPath."
        exit 1
    }
    if (-not (Test-Path $sharedIconPath)) {
        Write-Error "Shared icon was not found at $sharedIconPath."
        exit 1
    }

    dotnet publish $projectPath `
        -c $Configuration `
        -f net10.0-windows `
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

    $publishWebRoot = Join-Path $publishDir "wwwroot"
    New-Item -ItemType Directory -Force -Path $publishWebRoot | Out-Null
    Copy-Item -Recurse -Force (Join-Path $webUiDistPath "*") $publishWebRoot
    Copy-Item -Force $sharedIconPath (Join-Path $publishWebRoot "HI.ico")

    if ($Runtime -eq "win-x64") {
        Ensure-WinServerNativeAssets -RepoRoot $repoRoot -PublishDir $publishDir
    }

    Copy-Item -Recurse -Force (Join-Path $publishDir "*") $stagingDir
    @(
        "ReelRoulette ServerApp portable package",
        "Version: $Version",
        "Runtime: $Runtime",
        "",
        "Run: ReelRoulette.ServerApp.exe"
    ) | Set-Content -Path (Join-Path $stagingDir "PACKAGE_INFO.txt")

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath
    Write-Host "Portable package created: $zipPath"
}
finally {
    Pop-Location
}
