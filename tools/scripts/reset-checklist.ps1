param(
    [switch]$KeepMetadata,
    [switch]$RemoveWaived
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$checklistPath = Join-Path $repoRoot "docs\testing-checklist.md"
$serverAppProjectPath = Join-Path $repoRoot "src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"

if (-not (Test-Path $checklistPath)) {
    throw "Checklist file not found: $checklistPath"
}
if (-not (Test-Path $serverAppProjectPath)) {
    throw "Server app project file not found: $serverAppProjectPath"
}

function Get-CanonicalVersion {
    [xml]$projectXml = Get-Content -Path $serverAppProjectPath -Raw
    $version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "Could not resolve <Version> from $serverAppProjectPath"
    }
    return [string]$version
}

function Get-CurrentBranchName {
    try {
        $branch = (& git rev-parse --abbrev-ref HEAD 2>$null).Trim()
        if ([string]::IsNullOrWhiteSpace($branch)) {
            return "unknown"
        }
        return $branch
    }
    catch {
        return "unknown"
    }
}

function Update-MetadataLine {
    param(
        [string]$Line,
        [string]$Prefix,
        [string]$Value
    )

    $escapedPrefix = [regex]::Escape($Prefix)
    if ($Line -match "^- ${escapedPrefix}:") {
        return "- ${Prefix}: $Value"
    }
    return $Line
}

$version = Get-CanonicalVersion
$branch = Get-CurrentBranchName
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$releaseVersion = "v$version"

$raw = Get-Content -Path $checklistPath -Raw
$lines = $raw -split "\r?\n"
$updatedLines = New-Object System.Collections.Generic.List[string]

foreach ($line in $lines) {
    $nextLine = $line

    if (-not $KeepMetadata.IsPresent) {
        $nextLine = Update-MetadataLine -Line $nextLine -Prefix "Test date/time" -Value $timestamp
        $nextLine = Update-MetadataLine -Line $nextLine -Prefix "Branch/commit" -Value "$branch / pending"
        $nextLine = Update-MetadataLine -Line $nextLine -Prefix "Release version" -Value $releaseVersion
    }

    if ($nextLine -match '^\s*-\s*\[(x|X| )\]\s') {
        $isWaived = $nextLine -match '\(waived\)'
        if ($isWaived -and -not $RemoveWaived.IsPresent) {
            $nextLine = [regex]::Replace($nextLine, '\[(x|X| )\]', '[x]', 1)
        }
        else {
            $nextLine = [regex]::Replace($nextLine, '\[(x|X| )\]', '[ ]', 1)
            if ($RemoveWaived.IsPresent) {
                $nextLine = [regex]::Replace($nextLine, '\s*\(waived\)', '')
            }
        }
    }

    $updatedLines.Add($nextLine)
}

$nextRaw = [string]::Join("`r`n", $updatedLines)
if ($raw -ceq $nextRaw) {
    Write-Host "No change: $checklistPath"
    exit 0
}

Set-Content -Path $checklistPath -Value $nextRaw -NoNewline
Write-Host "Updated: $checklistPath"
