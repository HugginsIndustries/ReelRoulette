param(
    [string]$DeployRoot = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($DeployRoot)) {
    $DeployRoot = Join-Path $repoRoot ".web-deploy"
}

$manifestPath = Join-Path $DeployRoot "active-manifest.json"
if (-not (Test-Path $manifestPath)) {
    throw "Active manifest does not exist at '$manifestPath'."
}

$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($manifest.previousVersion)) {
    throw "No previousVersion is available for rollback."
}

$rollbackVersion = [string]$manifest.previousVersion
$rollbackVersionDir = Join-Path $DeployRoot "versions\$rollbackVersion"
if (-not (Test-Path $rollbackVersionDir)) {
    throw "Rollback version '$rollbackVersion' does not exist at '$rollbackVersionDir'."
}

$activeVersion = [string]$manifest.activeVersion
$newManifest = @{
    activeVersion = $rollbackVersion
    previousVersion = $activeVersion
    activatedUtc = [DateTimeOffset]::UtcNow.ToString("O")
} | ConvertTo-Json -Depth 4

$tmpPath = "$manifestPath.tmp"
Set-Content -Path $tmpPath -Value $newManifest -NoNewline
Move-Item -Path $tmpPath -Destination $manifestPath -Force

Write-Output "Rolled back web version '$activeVersion' -> '$rollbackVersion'."
