#!/usr/bin/env pwsh
param(
    [string]$Version,
    [switch]$NoDocUpdates,
    [switch]$NoUpdateDesktopVersion,
    [switch]$NoRegenerateContracts,
    [switch]$NoRunVerify
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$versionFilePath = Join-Path $repoRoot ".version"

function Test-ReleaseVersionFormat {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    if ($Value -match '^v\d+\.\d+\.\d+\.\d+') {
        throw "Four-part versions like '$Value' are not supported. Use semver2 (for example v1.2.3 or v1.2.3-dev.1)."
    }

    if ($Value -notmatch '^v\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$') {
        throw "Invalid version format '$Value'. Expected a v-prefixed semver2 string (for example v0.12.0-dev or v0.12.0-dev.2)."
    }
}

function Get-BareSemver {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $trimmed = $Value.Trim()
    if ($trimmed.StartsWith("v")) {
        return $trimmed.Substring(1)
    }
    return $trimmed
}

function Read-ReleaseVersionFromFile {
    if (-not (Test-Path $versionFilePath)) {
        throw ".version file not found at $versionFilePath"
    }

    $raw = (Get-Content -Path $versionFilePath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw ".version file is empty."
    }

    Test-ReleaseVersionFormat -Value $raw
    return $raw
}

function Write-ReleaseVersionFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    Test-ReleaseVersionFormat -Value $Value
    $normalized = $Value.Trim()
    Set-Content -Path $versionFilePath -Value $normalized -NoNewline
    Write-Host "Updated: $versionFilePath"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Read-ReleaseVersionFromFile
}
else {
    $Version = $Version.Trim()
    if (-not $Version.StartsWith("v")) {
        $Version = "v$Version"
    }
    Write-ReleaseVersionFile -Value $Version
}

$bareVersion = Get-BareSemver -Value $Version

function Set-FileContentIfChanged {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$NewContent
    )

    $current = Get-Content -Path $Path -Raw
    if ($current -ceq $NewContent) {
        Write-Host "No change: $Path"
        return $false
    }

    Set-Content -Path $Path -Value $NewContent -NoNewline
    Write-Host "Updated: $Path"
    return $true
}

function Update-OpenApiVersion {
    $path = Join-Path $repoRoot "shared" "api" "openapi.yaml"
    $raw = Get-Content -Path $path -Raw
    $pattern = '(?s)(info:\s*\r?\n\s*title:\s*ReelRoulette API\s*\r?\n\s*version:\s*)([^\r\n]+)'
    if (-not [regex]::IsMatch($raw, $pattern)) {
        throw "Failed to find OpenAPI info.version in $path"
    }
    $next = [regex]::Replace($raw, $pattern, "`${1}$bareVersion")
    Set-FileContentIfChanged -Path $path -NewContent $next | Out-Null
}

function Update-ServerAssetsVersion {
    $path = Join-Path $repoRoot "src" "core" "ReelRoulette.Server" "Services" "ServerStateService.cs"
    $raw = Get-Content -Path $path -Raw
    $pattern = 'assetsVersion:\s*"[^"]+"'
    if (-not [regex]::IsMatch($raw, $pattern)) {
        throw "Failed to find assetsVersion in $path"
    }
    $next = [regex]::Replace($raw, $pattern, "assetsVersion: `"$bareVersion`"", 1)
    Set-FileContentIfChanged -Path $path -NewContent $next | Out-Null
}

function Update-ContractTestsAssetsVersion {
    $path = Join-Path $repoRoot "src" "core" "ReelRoulette.Core.Tests" "ServerContractTests.cs"
    $raw = Get-Content -Path $path -Raw
    if (-not [regex]::IsMatch($raw, 'assetsVersion:\s*"[^"]+"')) {
        throw "Failed to find test assetsVersion fixture in $path"
    }
    if (-not [regex]::IsMatch($raw, 'Assert\.Equal\("[^"]+",\s*response\.AssetsVersion\);')) {
        throw "Failed to find AssetsVersion assertion in $path"
    }
    $next = $raw
    $next = [regex]::Replace($next, 'assetsVersion:\s*"[^"]+"', "assetsVersion: `"$bareVersion`"", 1)
    $next = [regex]::Replace($next, 'Assert\.Equal\("[^"]+",\s*response\.AssetsVersion\);', "Assert.Equal(`"$bareVersion`", response.AssetsVersion);", 1)
    Set-FileContentIfChanged -Path $path -NewContent $next | Out-Null
}

function Update-WebAuthBootstrapTestAssetsVersion {
    $path = Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI" "src" "test" "authBootstrap.test.ts"
    $raw = Get-Content -Path $path -Raw
    if (-not [regex]::IsMatch($raw, 'assetsVersion:\s*"[^"]+"')) {
        throw "Failed to find auth bootstrap test assetsVersion in $path"
    }
    $next = [regex]::Replace($raw, 'assetsVersion:\s*"[^"]+"', "assetsVersion: `"$bareVersion`"", 1)
    Set-FileContentIfChanged -Path $path -NewContent $next | Out-Null
}

function Update-ReadmeVersionExamples {
    $path = Join-Path $repoRoot "README.md"
    $raw = Get-Content -Path $path -Raw

    if (-not [regex]::IsMatch($raw, 'set-release-version\.ps1(?: -Version [^\s`]+)?')) {
        throw "Failed to find set-release-version command version in $path"
    }
    if (-not [regex]::IsMatch($raw, 'full-release\.ps1 -Version [^\s`]+')) {
        throw "Failed to find full-release command version in $path"
    }

    $next = $raw
    $next = [regex]::Replace($next, 'set-release-version\.ps1(?: -Version [^\s`]+)?', "set-release-version.ps1 -Version $Version", 1)
    $next = [regex]::Replace($next, 'full-release\.ps1 -Version [^\s`]+', "full-release.ps1 -Version $Version", 1)
    Set-FileContentIfChanged -Path $path -NewContent $next | Out-Null
}

function Update-DevSetupVersionExamples {
    $path = Join-Path $repoRoot "docs" "dev-setup.md"
    $raw = Get-Content -Path $path -Raw

    if (-not [regex]::IsMatch($raw, 'set-release-version\.ps1 -Version [^\s`]+')) {
        throw "Failed to find set-release-version command version in $path"
    }
    if (-not [regex]::IsMatch($raw, 'full-release\.ps1 -Version [^\s`]+')) {
        throw "Failed to find full-release command version in $path"
    }

    $next = $raw
    $next = [regex]::Replace($next, 'set-release-version\.ps1 -Version [^\s`]+', "set-release-version.ps1 -Version $Version", 1)
    $next = [regex]::Replace($next, 'full-release\.ps1 -Version [^\s`]+', "full-release.ps1 -Version $Version", 1)
    Set-FileContentIfChanged -Path $path -NewContent $next | Out-Null
}

function Update-ReleaseDocsVersion {
    Update-ReadmeVersionExamples
    Update-DevSetupVersionExamples
}

function Set-ProjectVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectPath
    )

    [xml]$xml = Get-Content -Path $ProjectPath -Raw
    $projectNode = $xml.Project
    if (-not $projectNode) {
        throw "Invalid project file: $ProjectPath"
    }

    $propertyGroup = $projectNode.PropertyGroup | Select-Object -First 1
    if (-not $propertyGroup) {
        $propertyGroup = $xml.CreateElement("PropertyGroup")
        $projectNode.AppendChild($propertyGroup) | Out-Null
    }

    $versionNode = $propertyGroup.SelectSingleNode("Version")
    if (-not $versionNode) {
        $versionNode = $xml.CreateElement("Version")
        $propertyGroup.AppendChild($versionNode) | Out-Null
    }

    if ($versionNode.InnerText -eq $bareVersion) {
        Write-Host "No change: $ProjectPath"
        return
    }

    $versionNode.InnerText = $bareVersion
    $xml.Save($ProjectPath)
    Write-Host "Updated: $ProjectPath"
}

Push-Location $repoRoot
try {
    Write-Host "Applying release version $Version (bare semver $bareVersion)..."

    Update-OpenApiVersion
    Update-ServerAssetsVersion
    Update-ContractTestsAssetsVersion
    Update-WebAuthBootstrapTestAssetsVersion

    Set-ProjectVersion -ProjectPath (Join-Path $repoRoot "src" "core" "ReelRoulette.ServerApp" "ReelRoulette.ServerApp.csproj")
    Set-ProjectVersion -ProjectPath (Join-Path $repoRoot "src" "clients" "desktop" "ReelRoulette.LibraryArchive" "ReelRoulette.LibraryArchive.csproj")
    if (-not $NoUpdateDesktopVersion.IsPresent) {
        Set-ProjectVersion -ProjectPath (Join-Path $repoRoot "src" "clients" "desktop" "ReelRoulette.DesktopApp" "ReelRoulette.DesktopApp.csproj")
    }
    if (-not $NoDocUpdates.IsPresent) {
        Update-ReleaseDocsVersion
    }

    if (-not $NoRegenerateContracts.IsPresent) {
        Write-Host "Regenerating WebUI OpenAPI contracts..."
        Push-Location (Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI")
        try {
            npm run generate:contracts
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        finally {
            Pop-Location
        }
    }

    if (-not $NoRunVerify.IsPresent) {
        Write-Host "Running solution build+test..."
        dotnet build ReelRoulette.sln
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        dotnet test ReelRoulette.sln
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        Write-Host "Running WebUI verify..."
        Push-Location (Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI")
        try {
            npm run verify
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        finally {
            Pop-Location
        }

        Write-Host "Running single-origin deploy smoke verify..."
        & (Join-Path $PSScriptRoot "verify-web-deploy.ps1")
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    Write-Host "Release version update complete."
}
finally {
    Pop-Location
}
