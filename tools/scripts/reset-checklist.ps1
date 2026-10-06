#!/usr/bin/env pwsh
param(
    [switch]$KeepMetadata,
    [switch]$RemoveWaived
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$checklistPath = Join-Path $repoRoot "docs" "checklists" "testing-checklist.md"
$serverAppProjectPath = Join-Path $repoRoot "src" "core" "ReelRoulette.ServerApp" "ReelRoulette.ServerApp.csproj"

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
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$releaseVersion = "v$version"

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
