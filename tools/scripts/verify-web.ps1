param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm was not found in PATH."
    exit 1
}

$webProjectDir = Join-Path $PSScriptRoot "..\..\src\clients\web\ReelRoulette.WebUI"
$resolvedWebProjectDir = (Resolve-Path $webProjectDir).Path

Push-Location $resolvedWebProjectDir
try {
    if (-not $SkipInstall.IsPresent) {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    npm run verify
    if ($LASTEXITCODE -ne 0) {
        throw "npm run verify failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
