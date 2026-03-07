param()

$ErrorActionPreference = "Stop"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet SDK not found in PATH."
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
    $distPath = Join-Path $repoRoot "src\clients\web\ReelRoulette.WebUI\dist"
    Write-Host "Building WebUI for ServerApp static serving..."

    Push-Location "src\clients\web\ReelRoulette.WebUI"
    try {
        npm install
        npm run build
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $distPath)) {
        Write-Error "WebUI build output was not found at $distPath."
        exit 1
    }

    $env:CoreServer__BindOnLan = "true"
    $env:ServerApp__WebUiStaticRootPath = $distPath
    dotnet run --project ".\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ServerApp exited with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
