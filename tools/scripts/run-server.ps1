#!/usr/bin/env pwsh
# Builds the WebUI and runs the server from the repo, on your real settings, serving a copy of that build, so a later
# build changes nothing the running server serves until this script runs again. First installs the WebUI's packages
# with npm ci when node_modules is missing or package-lock.json changed since the last install.
[CmdletBinding()]
param(
    [int]$Port = 45123,
    [switch]$RequireAuth,
    [switch]$DisableLocalhostTrust,
    [string]$Framework = "",
    [string]$PairingToken = "reelroulette-dev-token"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "webui-packages.ps1")

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet SDK not found in PATH."
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found in PATH."
    exit 1
}

$listenUrl = "http://localhost:$Port"
$healthUrl = "http://localhost:$Port/health"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path
$webUiProjectDir = Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI"
$webUiDist = Join-Path $webUiProjectDir "dist"
$webUiCopy = Join-Path $repoRoot "artifacts" "run-server" "webui"
$serverAppProject = Join-Path $repoRoot "src" "core" "ReelRoulette.ServerApp" "ReelRoulette.ServerApp.csproj"

$installReason = Get-WebUiPackageInstallReason -WebUiPath $webUiProjectDir

$env:CoreServer__ListenUrl = $listenUrl
$env:CoreServer__RequireAuth = if ($RequireAuth.IsPresent) { "true" } else { "false" }
# Remote access follows the saved Allow remote connections setting; this clears a value left in the session.
$env:CoreServer__BindOnLan = "false"
$env:CoreServer__TrustLocalhost = if ($DisableLocalhostTrust.IsPresent) { "false" } else { "true" }
$env:CoreServer__PairingToken = $PairingToken
$env:ServerApp__WebUiStaticRootPath = $webUiCopy

Push-Location $webUiProjectDir
try {
    Install-WebUiPackages -WebUiPath $webUiProjectDir

    Write-Host "Building WebUI..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm run build failed with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $webUiDist)) {
    Write-Error "WebUI build output was not found at $webUiDist."
    exit 1
}

# Copy-Item into an existing folder would nest the build inside it, so the old copy goes first.
if (Test-Path -LiteralPath $webUiCopy) {
    Remove-Item -LiteralPath $webUiCopy -Recurse -Force
}
New-Item -ItemType Directory -Path (Split-Path $webUiCopy) -Force | Out-Null
Copy-Item -LiteralPath $webUiDist -Destination $webUiCopy -Recurse

$framework = if ([string]::IsNullOrWhiteSpace($Framework)) {
    if ($IsWindows) { "net10.0-windows" } else { "net10.0" }
}
else {
    $Framework
}

Write-Host "Starting ReelRoulette.ServerApp..."
Write-Host "  Listen URL: $listenUrl"
Write-Host "  Health URL: $healthUrl"
Write-Host "  WebUI static root: $webUiCopy"
Write-Host "  WebUI packages: $(if ($installReason) { "installed, $installReason" } else { "up to date, install skipped" })"
Write-Host "  Require auth: $($RequireAuth.IsPresent)"
Write-Host "  Remote connections: the saved Allow remote connections setting"
Write-Host "  Trust localhost: $(-not $DisableLocalhostTrust.IsPresent)"
if ($RequireAuth.IsPresent) {
    Write-Host "  Pairing token: $PairingToken"
}
Write-Host "Verification hint: GET $healthUrl"

dotnet run --framework $framework --project $serverAppProject
if ($LASTEXITCODE -ne 0) {
    Write-Error "ServerApp exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}
