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

function Resolve-PackageVersion {
    param(
        [string]$ExplicitVersion,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitVersion)) {
        $value = $ExplicitVersion.Trim()
        if ($value.StartsWith("v")) {
            $value = $value.Substring(1)
        }
        return $value
    }

    $versionFile = Join-Path $RepoRoot ".version"
    if (-not (Test-Path $versionFile)) {
        Write-Error ".version file not found at $versionFile"
        exit 1
    }

    $value = (Get-Content -Path $versionFile -Raw).Trim()
    if ($value.StartsWith("v")) {
        $value = $value.Substring(1)
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = "dev"
    }
    return $value
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $repoRoot "src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"
$Version = Resolve-PackageVersion -ExplicitVersion $Version -RepoRoot $repoRoot

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

    & (Join-Path $PSScriptRoot "stage-webui-assets.ps1") -RepoRoot $repoRoot -PublishDir $publishDir
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($Runtime -eq "win-x64") {
        & (Join-Path $PSScriptRoot "stage-native-deps.ps1") -RepoRoot $repoRoot -PublishDir $publishDir -Component server
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
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
