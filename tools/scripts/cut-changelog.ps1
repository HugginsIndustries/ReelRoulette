#!/usr/bin/env pwsh
# Cuts the [Unreleased] changelog section into a release section, leaves a fresh empty
# [Unreleased], and updates the footer compare links. Changes nothing if any check fails.
#   -Version  release version, for example 0.14.0 or v0.14.0
#   -Name     release name, for example "Cleanup and Polish"
#   -Date     release date as yyyy-MM-dd (default: today)
#   -Path     changelog to cut (default: the repo's CHANGELOG.md)
param(
    [string]$Version,
    [string]$Name,
    [string]$Date,
    [string]$Path
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$headings = @("Added", "Changed", "Deprecated", "Removed", "Fixed", "Security")
$emDash = [char]0x2014

if (-not $Path) {
    $Path = Join-Path $repoRoot "CHANGELOG.md"
}
if (-not (Test-Path $Path)) {
    throw "Changelog not found: $Path"
}

$bareVersion = if ($Version) { $Version.Trim().TrimStart("v") } else { "" }
if ($bareVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid -Version '$Version'. Expected a release version such as 0.14.0 or v0.14.0."
}
if ([string]::IsNullOrWhiteSpace($Name)) {
    throw "-Name is required (the release name, for example `"Cleanup and Polish`")."
}
if (-not $Date) {
    $Date = Get-Date -Format "yyyy-MM-dd"
}
if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') {
    throw "Invalid -Date '$Date'. Expected yyyy-MM-dd."
}

$raw = Get-Content -Path $Path -Raw
$newline = if ($raw -match "\r\n") { "`r`n" } else { "`n" }
$lines = $raw -split "\r?\n"

$escapedVersion = [regex]::Escape($bareVersion)
if ($lines | Where-Object { $_ -match "^## \[$escapedVersion\]" -or $_ -match "^\[$escapedVersion\]:" }) {
    throw "CHANGELOG already has a [$bareVersion] section or footer link."
}

# Locate [Unreleased] and the --- separator that ends it.
$unreleasedIndex = [array]::FindIndex($lines, [Predicate[string]] { param($l) $l -match '^## \[Unreleased\]\s*$' })
if ($unreleasedIndex -lt 0) {
    throw "No '## [Unreleased]' section found."
}
$nextSectionIndex = -1
for ($i = $unreleasedIndex + 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^## ') {
        $nextSectionIndex = $i
        break
    }
}
if ($nextSectionIndex -lt 0) {
    throw "No release section found after [Unreleased]."
}
$separatorIndex = -1
for ($i = $nextSectionIndex - 1; $i -gt $unreleasedIndex; $i--) {
    if ($lines[$i] -match '^---\s*$') {
        $separatorIndex = $i
        break
    }
}
if ($separatorIndex -lt 0) {
    throw "Expected a '---' line between [Unreleased] and the next release section."
}

# Split [Unreleased] into its headings, keeping each heading's entries as written.
$sections = New-Object System.Collections.Generic.List[object]
$current = $null
for ($i = $unreleasedIndex + 1; $i -lt $separatorIndex; $i++) {
    $line = $lines[$i]
    if ($line -match '^### (.+?)\s*$') {
        $heading = $Matches[1]
        if ($heading -notin $headings) {
            throw "[Unreleased] has a '### $heading' heading. Expected only: $($headings -join ', ')."
        }
        $current = [pscustomobject]@{ Heading = $heading; Lines = New-Object System.Collections.Generic.List[string] }
        $sections.Add($current)
        continue
    }
    if ($null -eq $current) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            throw "[Unreleased] has text before its first heading (line $($i + 1))."
        }
        continue
    }
    $current.Lines.Add($line)
}

$kept = New-Object System.Collections.Generic.List[object]
foreach ($section in $sections) {
    $content = @($section.Lines)
    $first = 0
    $last = $content.Count - 1
    while ($first -le $last -and [string]::IsNullOrWhiteSpace($content[$first])) { $first++ }
    while ($last -ge $first -and [string]::IsNullOrWhiteSpace($content[$last])) { $last-- }
    if ($first -le $last) {
        $kept.Add([pscustomobject]@{ Heading = $section.Heading; Lines = $content[$first..$last] })
    }
}
if ($kept.Count -eq 0) {
    throw "[Unreleased] has no entries to release."
}

# Update the footer links: [Unreleased] compares the new version with HEAD, and the new version
# compares the previous one with it.
$footerIndex = [array]::FindIndex($lines, [Predicate[string]] { param($l) $l -match '^\[Unreleased\]:' })
if ($footerIndex -lt 0) {
    throw "No '[Unreleased]: ...' footer link found."
}
if ($lines[$footerIndex] -notmatch '^\[Unreleased\]:\s*(?<base>\S+)/compare/(?<previous>v\S+?)\.\.\.HEAD\s*$') {
    throw "Could not parse the footer link '$($lines[$footerIndex])'. Expected '[Unreleased]: <repo>/compare/v<previous>...HEAD'."
}
$repoUrl = $Matches["base"]
$previousTag = $Matches["previous"]

$result = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $unreleasedIndex; $i++) {
    $result.Add($lines[$i])
}

$result.Add("## [Unreleased]")
$result.Add("")
foreach ($heading in $headings) {
    $result.Add("### $heading")
    $result.Add("")
}
$result.Add("---")
$result.Add("")

$result.Add("## [$bareVersion] $emDash $($Name.Trim()) ($Date)")
$result.Add("")
foreach ($section in $kept) {
    $result.Add("### $($section.Heading)")
    $result.Add("")
    foreach ($line in $section.Lines) {
        $result.Add($line)
    }
    $result.Add("")
}
$result.Add("---")
$result.Add("")

for ($i = $nextSectionIndex; $i -lt $lines.Count; $i++) {
    if ($i -eq $footerIndex) {
        $result.Add("[Unreleased]: $repoUrl/compare/v$bareVersion...HEAD")
        $result.Add("[$bareVersion]: $repoUrl/compare/$previousTag...v$bareVersion")
        continue
    }
    $result.Add($lines[$i])
}

Set-Content -Path $Path -Value ([string]::Join($newline, $result)) -NoNewline
Write-Host "Updated: $Path"
Write-Host "Released [$bareVersion] $emDash $($Name.Trim()) ($Date) with: $(($kept | ForEach-Object { $_.Heading }) -join ', ')"
