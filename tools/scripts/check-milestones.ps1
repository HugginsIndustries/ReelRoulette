#!/usr/bin/env pwsh
# Checks MILESTONES.md against its maintenance rules. Read-only.
#   -Path <file>      check another file instead of the repo's MILESTONES.md
#   -Staged           check the staged MILESTONES.md
#   -BaseRef <ref>    also check that Completed Milestones only grew by newly moved entries since <ref>
#   -BasePath <file>  same as -BaseRef, with the base read from a file
#   -Release          with a release tag as the base, skip checking that new completed entries
#                     existed in the base, since a release's milestones are often planned after it
param(
    [string]$Path,
    [switch]$Staged,
    [string]$BaseRef,
    [string]$BasePath,
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# Whole-word milestone ID, so "MP3" or "P2P" in prose is not an ID.
$idPattern = '(?<![A-Za-z0-9_])[MP]\d+[a-z]?\d*(?![A-Za-z0-9_])'
$headerPattern = '^### ([MP]\d+[a-z]?\d*) - (.+?)\s*$'

if ($Path -and $Staged.IsPresent) {
    throw "Use either -Path or -Staged, not both."
}
if ($BaseRef -and $BasePath) {
    throw "Use either -BaseRef or -BasePath, not both."
}
if ($Release.IsPresent -and -not ($BaseRef -or $BasePath)) {
    throw "-Release needs -BaseRef or -BasePath."
}

function Get-GitFileText {
    param([string]$Spec)

    $previousEncoding = [Console]::OutputEncoding
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    try {
        $output = & git -C $repoRoot show $Spec 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "git show $Spec failed: $($output -join ' ')"
        }
        return ($output -join "`n")
    }
    finally {
        [Console]::OutputEncoding = $previousEncoding
    }
}

function Get-Document {
    param([string]$Text)

    $lines = $Text -split "\r?\n"
    $sections = New-Object System.Collections.Generic.List[object]
    $milestones = New-Object System.Collections.Generic.List[object]
    $lineSections = New-Object string[] $lines.Count
    $currentSection = ""

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^## (.+?)\s*$') {
            $currentSection = $Matches[1]
            $sections.Add([pscustomobject]@{ Name = $currentSection; Start = $i })
        }
        $lineSections[$i] = $currentSection
        if ($lines[$i] -match $headerPattern) {
            $milestones.Add([pscustomobject]@{
                Id = $Matches[1]
                Title = $Matches[2]
                Index = $i
                Section = $currentSection
            })
        }
    }

    # Each milestone body runs to the next ### or ## header, without trailing blank lines.
    foreach ($milestone in $milestones) {
        $end = $milestone.Index + 1
        while ($end -lt $lines.Count -and $lines[$end] -notmatch '^#{2,3} ') {
            $end++
        }
        $last = $end - 1
        while ($last -gt $milestone.Index -and [string]::IsNullOrWhiteSpace($lines[$last])) {
            $last--
        }
        $milestone | Add-Member -NotePropertyName Body -NotePropertyValue (($lines[$milestone.Index..$last]) -join "`n")
    }

    return [pscustomobject]@{
        Lines = $lines
        LineSections = $lineSections
        Sections = $sections
        Milestones = $milestones
    }
}

function Get-NormalizedTitle {
    param([string]$Text)
    return (($Text -replace '`', '') -replace '\s+', ' ').Trim().ToLowerInvariant()
}

# Returns how many characters of $Text from $Position are one milestone title (with an optional
# leading "the "), or -1 when no title starts there. Longest titles are tried first, so a title
# containing commas or "and" is matched whole.
function Get-TitleMatchLength {
    param([string]$Text, [int]$Position, [string[]]$Titles)

    $start = $Position
    if ($Text.Substring($start).StartsWith("the ")) {
        $start += 4
    }
    foreach ($title in $Titles) {
        if ($Text.Substring($start).StartsWith($title)) {
            return ($start - $Position) + $title.Length
        }
    }
    return -1
}

# A Depends on value is one or more titles joined by ", ", " and ", or ", and ". A title may be
# followed by an explanation starting ", which", ", whose", or ", so". Returns $null when every
# reference resolves, otherwise the problem.
function Test-DependsOn {
    param([string]$Value, [string[]]$Titles)

    $text = (Get-NormalizedTitle $Value).TrimEnd('.')
    $position = 0
    while ($true) {
        $length = Get-TitleMatchLength -Text $text -Position $position -Titles $Titles
        if ($length -lt 0) {
            return "no milestone title matches '$($text.Substring($position))'"
        }
        $position += $length
        if ($position -ge $text.Length) {
            return $null
        }

        $rest = $text.Substring($position)
        if ($rest -match '^(, and |, | and )') {
            $next = $position + $Matches[1].Length
            if ((Get-TitleMatchLength -Text $text -Position $next -Titles $Titles) -ge 0) {
                $position = $next
                continue
            }
            if ($rest -notmatch '^, (which|whose|so) ') {
                return "no milestone title matches '$($text.Substring($next))'"
            }
        }
        if ($rest -match '^, (which|whose|so) ') {
            # Skip the explanation up to a following ", and <title>", or to the end.
            $searchFrom = $position + $Matches[0].Length
            $resumeAt = -1
            while ($true) {
                $separator = $text.IndexOf(", and ", $searchFrom)
                if ($separator -lt 0) {
                    break
                }
                if ((Get-TitleMatchLength -Text $text -Position ($separator + 6) -Titles $Titles) -ge 0) {
                    $resumeAt = $separator + 6
                    break
                }
                $searchFrom = $separator + 1
            }
            if ($resumeAt -lt 0) {
                return $null
            }
            $position = $resumeAt
            continue
        }
        return "unexpected text after a milestone title: '$rest'"
    }
}

function Get-CompletedIntro {
    param($Document)

    $section = $Document.Sections | Where-Object { $_.Name -eq "Completed Milestones" } | Select-Object -First 1
    if (-not $section) {
        return $null
    }
    $end = $section.Start + 1
    while ($end -lt $Document.Lines.Count -and $Document.Lines[$end] -notmatch '^#{2,3} ') {
        $end++
    }
    return (($Document.Lines[($section.Start + 1)..($end - 1)]) -join "`n").Trim()
}

# Load the document and the optional base.
if ($Staged.IsPresent) {
    $label = "MILESTONES.md (staged)"
    $text = Get-GitFileText ":MILESTONES.md"
}
else {
    if (-not $Path) {
        $Path = Join-Path $repoRoot "MILESTONES.md"
    }
    if (-not (Test-Path $Path)) {
        throw "File not found: $Path"
    }
    $label = Split-Path $Path -Leaf
    $text = Get-Content -Path $Path -Raw
}

$base = $null
if ($BaseRef) {
    $base = Get-Document (Get-GitFileText "${BaseRef}:MILESTONES.md")
}
elseif ($BasePath) {
    if (-not (Test-Path $BasePath)) {
        throw "Base file not found: $BasePath"
    }
    $base = Get-Document (Get-Content -Path $BasePath -Raw)
}

$doc = Get-Document $text
$problems = New-Object System.Collections.Generic.List[object]
function Add-Problem {
    param([int]$Index, [string]$Message)
    $problems.Add([pscustomobject]@{ Line = $Index + 1; Message = $Message })
}

$trackedSections = @("Active Milestones", "Planned Milestones")

# 1. IDs appear only in section headers, the tracker line, and the Planned Releases outline.
# Completed Milestones is history; the base comparison below guards it instead.
for ($i = 0; $i -lt $doc.Lines.Count; $i++) {
    $section = $doc.LineSections[$i]
    $line = $doc.Lines[$i]
    if ($section -in @("Planned Releases", "Completed Milestones")) {
        continue
    }
    if ($line -match $headerPattern -or $line -match '^Last milestone completed:') {
        continue
    }
    foreach ($match in [regex]::Matches($line, $idPattern)) {
        Add-Problem $i "milestone ID '$($match.Value)' outside section headers, the tracker line, and the Planned Releases outline"
    }
}

# 2. The outline and the sections agree.
$headerIds = @{}
foreach ($milestone in $doc.Milestones) {
    if ($headerIds.ContainsKey($milestone.Id)) {
        Add-Problem $milestone.Index "milestone ID '$($milestone.Id)' heads more than one section (first on line $($headerIds[$milestone.Id].Index + 1))"
        continue
    }
    $headerIds[$milestone.Id] = $milestone
}

$outlineIds = @{}
for ($i = 0; $i -lt $doc.Lines.Count; $i++) {
    if ($doc.LineSections[$i] -ne "Planned Releases" -or $doc.Lines[$i] -notmatch '^- ') {
        continue
    }
    foreach ($match in [regex]::Matches($doc.Lines[$i], $idPattern)) {
        $id = $match.Value
        if ($outlineIds.ContainsKey($id)) {
            Add-Problem $i "'$id' is listed in the Planned Releases outline more than once (also line $($outlineIds[$id] + 1))"
            continue
        }
        $outlineIds[$id] = $i
        if (-not $headerIds.ContainsKey($id)) {
            Add-Problem $i "'$id' is in the Planned Releases outline but has no milestone section"
        }
    }
}

foreach ($milestone in $doc.Milestones) {
    if ($milestone.Section -in $trackedSections -and -not $outlineIds.ContainsKey($milestone.Id)) {
        Add-Problem $milestone.Index "'$($milestone.Id) - $($milestone.Title)' is missing from the Planned Releases outline"
    }
}

# 3. Every Depends on reference in Active and Planned names an existing milestone.
$titles = @($doc.Milestones | ForEach-Object { Get-NormalizedTitle $_.Title } | Sort-Object -Unique | Sort-Object Length -Descending)
for ($i = 0; $i -lt $doc.Lines.Count; $i++) {
    if ($doc.LineSections[$i] -notin $trackedSections) {
        continue
    }
    $at = $doc.Lines[$i].IndexOf("Depends on:")
    if ($at -lt 0) {
        continue
    }
    $value = $doc.Lines[$i].Substring($at + "Depends on:".Length).Trim()
    $problem = Test-DependsOn -Value $value -Titles $titles
    if ($problem) {
        Add-Problem $i "Depends on: $problem"
    }
}

# 4. Against a base, Completed Milestones only grew by entries moved in from other sections.
if ($base) {
    $intro = Get-CompletedIntro $doc
    $baseIntro = Get-CompletedIntro $base
    $completedSection = $doc.Sections | Where-Object { $_.Name -eq "Completed Milestones" } | Select-Object -First 1
    $completedLine = if ($completedSection) { $completedSection.Start } else { 0 }
    if ($null -ne $baseIntro -and $intro -cne $baseIntro) {
        Add-Problem $completedLine "the Completed Milestones introduction changed"
    }

    $current = @($doc.Milestones | Where-Object { $_.Section -eq "Completed Milestones" })
    $previous = @($base.Milestones | Where-Object { $_.Section -eq "Completed Milestones" })
    $currentByHeader = @{}
    foreach ($milestone in $current) {
        $currentByHeader["$($milestone.Id) - $($milestone.Title)"] = $milestone
    }
    $previousHeaders = @{}
    foreach ($milestone in $previous) {
        $previousHeaders["$($milestone.Id) - $($milestone.Title)"] = $true
    }

    # Entries already completed in the base must be unchanged and keep their order.
    $lastIndex = -1
    foreach ($old in $previous) {
        $header = "$($old.Id) - $($old.Title)"
        if (-not $currentByHeader.ContainsKey($header)) {
            Add-Problem $completedLine "completed milestone '$header' was removed or renamed"
            continue
        }
        $new = $currentByHeader[$header]
        if ($new.Body -cne $old.Body) {
            Add-Problem $new.Index "completed milestone '$header' changed"
        }
        if ($new.Index -lt $lastIndex) {
            Add-Problem $new.Index "completed milestone '$header' moved out of its original order"
        }
        $lastIndex = [Math]::Max($lastIndex, $new.Index)
    }

    # New entries go above the old ones and, unless the base is a release, must have been milestones
    # outside Completed in the base.
    $firstOld = ($current | Where-Object { $previousHeaders.ContainsKey("$($_.Id) - $($_.Title)") } | Select-Object -First 1)
    $baseOthers = @($base.Milestones | Where-Object { $_.Section -ne "Completed Milestones" })
    foreach ($milestone in $current) {
        $header = "$($milestone.Id) - $($milestone.Title)"
        if ($previousHeaders.ContainsKey($header)) {
            continue
        }
        if ($firstOld -and $milestone.Index -gt $firstOld.Index) {
            Add-Problem $milestone.Index "newly completed milestone '$header' must go above the existing completed entries"
        }
        if ($Release.IsPresent) {
            continue
        }
        $known = $baseOthers | Where-Object { $_.Id -eq $milestone.Id -or (Get-NormalizedTitle $_.Title) -eq (Get-NormalizedTitle $milestone.Title) }
        if (-not $known) {
            Add-Problem $milestone.Index "newly completed milestone '$header' was not an active or planned milestone in the base"
        }
    }
}

if ($problems.Count -gt 0) {
    foreach ($problem in ($problems | Sort-Object Line)) {
        Write-Host "${label}:$($problem.Line): $($problem.Message)"
    }
    Write-Host "FAIL: $($problems.Count) problem(s) in $label"
    exit 1
}

$scope = if ($base) { "" } else { " (Completed Milestones not compared; pass -BaseRef to check it)" }
Write-Host "OK: $label passed milestone checks$scope"
exit 0
