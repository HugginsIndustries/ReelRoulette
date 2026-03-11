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
$installerOutDir = Join-Path $repoRoot "$OutputRoot\installer"
$issPath = Join-Path $repoRoot "tools\installer\ReelRoulette.ServerApp.iss"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $installerOutDir | Out-Null

Push-Location $repoRoot
try {
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
        -f net9.0-windows `
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
