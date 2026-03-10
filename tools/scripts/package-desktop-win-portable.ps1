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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $repoRoot "source\ReelRoulette.csproj"

if ([string]::IsNullOrWhiteSpace($Version)) {
    [xml]$projectXml = Get-Content -Path $projectPath -Raw
    $Version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = "dev"
    }
}

$publishDir = Join-Path $repoRoot "artifacts\publish\desktop-$Runtime"
$packageRoot = Join-Path $repoRoot $OutputRoot
$stagingDir = Join-Path $packageRoot "portable\ReelRoulette-Desktop-$Version-$Runtime"
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

    Copy-Item -Recurse -Force (Join-Path $publishDir "*") $stagingDir
    @(
        "ReelRoulette Desktop portable package",
        "Version: $Version",
        "Runtime: $Runtime",
        "",
        "Run: ReelRoulette.exe"
    ) | Set-Content -Path (Join-Path $stagingDir "PACKAGE_INFO.txt")

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath
    Write-Host "Portable package created: $zipPath"
}
finally {
    Pop-Location
}
