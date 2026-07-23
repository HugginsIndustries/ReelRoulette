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

function Resolve-IsccPath {
    $fromPath = Get-Command iscc -ErrorAction SilentlyContinue
    if ($fromPath) {
        return $fromPath.Source
    }

    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

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
        if (Test-Path $candidate) {
            return $candidate
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
$projectPath = Join-Path $repoRoot "src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"
$Version = Resolve-PackageVersion -ExplicitVersion $Version -RepoRoot $repoRoot
$sharedIconPath = Join-Path $repoRoot "assets\HI.ico"

$publishDir = Join-Path $repoRoot "artifacts\publish\serverapp-$Runtime"
$installerOutDir = Join-Path $repoRoot "$OutputRoot\installer"
$issPath = Join-Path $repoRoot "tools\installer\ReelRoulette.ServerApp.iss"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $installerOutDir | Out-Null

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
