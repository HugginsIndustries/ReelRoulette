#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$PublishDir
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found in PATH."
    exit 1
}

$webUiProjectDir = Join-Path $RepoRoot "src" "clients" "web" "ReelRoulette.WebUI"
$webUiDistPath = Join-Path $webUiProjectDir "dist"
$sharedIconPath = Join-Path $RepoRoot "assets" "HI.ico"

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

$publishWebRoot = Join-Path $PublishDir "wwwroot"
New-Item -ItemType Directory -Force -Path $publishWebRoot | Out-Null
Copy-Item -Recurse -Force (Join-Path $webUiDistPath "*") $publishWebRoot
Copy-Item -Force $sharedIconPath (Join-Path $publishWebRoot "HI.ico")
