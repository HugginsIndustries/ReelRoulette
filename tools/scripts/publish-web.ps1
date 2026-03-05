param(
    [string]$VersionId = "",
    [string]$DeployRoot = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm was not found in PATH."
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$webProjectDir = (Resolve-Path (Join-Path $repoRoot "src\clients\web\ReelRoulette.WebUI")).Path
if ([string]::IsNullOrWhiteSpace($DeployRoot)) {
    $DeployRoot = Join-Path $repoRoot ".web-deploy"
}

if ([string]::IsNullOrWhiteSpace($VersionId)) {
    $VersionId = [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")
}

$versionDir = Join-Path $DeployRoot "versions\$VersionId"
if (Test-Path $versionDir) {
    throw "Version '$VersionId' already exists at '$versionDir'."
}

New-Item -ItemType Directory -Force -Path (Join-Path $DeployRoot "versions") | Out-Null

Push-Location $webProjectDir
try {
    if (-not $SkipInstall.IsPresent) {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE."
    }

    New-Item -ItemType Directory -Force -Path $versionDir | Out-Null
    Copy-Item -Path (Join-Path $webProjectDir "dist\*") -Destination $versionDir -Recurse -Force
}
finally {
    Pop-Location
}

$versionMetadata = @{
    versionId = $VersionId
    publishedUtc = [DateTimeOffset]::UtcNow.ToString("O")
} | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $versionDir "version-info.json") -Value $versionMetadata -NoNewline

Write-Output "Published web version '$VersionId' to '$versionDir'."
