#!/usr/bin/env pwsh
# Clears check states and Failed: and Skipped: notes in the testing checklist, and fills in the
# test date and the release version from .version without any -dev.N suffix.
#   -Path         checklist to reset (default: the repo's docs/checklists/testing-checklist.md)
#   -VersionPath  version file to read (default: the repo's .version)
param(
    [switch]$KeepMetadata,
    [switch]$RemoveWaived,
    [string]$Path,
    [string]$VersionPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$checklistPath = if ($Path) { $Path } else { Join-Path $repoRoot "docs" "checklists" "testing-checklist.md" }
if (-not $VersionPath) {
    $VersionPath = Join-Path $repoRoot ".version"
}

if (-not (Test-Path $checklistPath)) {
    throw "Checklist file not found: $checklistPath"
}

# The checklist names the release being prepared, not the dev build it is tested on.
function Get-ReleaseVersion {
    if (-not (Test-Path $VersionPath)) {
        throw "Version file not found: $VersionPath"
    }
    $version = (Get-Content -Path $VersionPath -Raw).Trim()
    $bare = $version.TrimStart("v") -replace '-dev\.\d+$', ''
    if ($bare -notmatch '^\d+\.\d+\.\d+$') {
        throw "Invalid version '$version' in ${VersionPath}. Expected a version such as v0.14.0 or v0.14.0-dev.3."
    }
    return "v$bare"
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

$releaseVersion = if ($KeepMetadata.IsPresent) { $null } else { Get-ReleaseVersion }
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$raw = Get-Content -Path $checklistPath -Raw
$lines = $raw -split "\r?\n"
$updatedLines = New-Object System.Collections.Generic.List[string]
$removedNote = $false

foreach ($line in $lines) {
    # Failed: and Skipped: notes belong to the previous pass; the backlog item each names tracks the issue.
    if ($line -match '^\s*-\s*(Failed|Skipped):') {
        $removedNote = $true
        continue
    }
    # Drop a blank line that removing a note would leave doubled.
    $previousBlank = $updatedLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($updatedLines[$updatedLines.Count - 1])
    if ($removedNote -and $previousBlank -and [string]::IsNullOrWhiteSpace($line)) {
        $removedNote = $false
        continue
    }
    $removedNote = $false

    $nextLine = $line

    if (-not $KeepMetadata.IsPresent) {
        $nextLine = Update-MetadataLine -Line $nextLine -Prefix "Test date/time" -Value $timestamp
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

$newline = if ($raw -match "\r\n") { "`r`n" } else { "`n" }
$nextRaw = [string]::Join($newline, $updatedLines)
if ($raw -ceq $nextRaw) {
    Write-Host "No change: $checklistPath"
    exit 0
}

Set-Content -Path $checklistPath -Value $nextRaw -NoNewline
Write-Host "Updated: $checklistPath"
