#!/usr/bin/env pwsh
# Checks MILESTONES.md and MILESTONES-COMPLETED.md against their maintenance rules, and that active
# and planned entries follow MILESTONES.md's Entry Format. Read-only.
#   -Path <file>               check another file instead of the repo's MILESTONES.md
#   -CompletedPath <file>      the completed history to check with it; defaults to the repo's
#                              MILESTONES-COMPLETED.md only when -Path is not given
#   -Staged                    check the staged MILESTONES.md and MILESTONES-COMPLETED.md
#   -BaseRef <ref>             also check that the completed history only grew by newly moved entries since <ref>
#   -BasePath <file>           same as -BaseRef, with the base MILESTONES.md read from a file
#   -BaseCompletedPath <file>  with -BasePath, the base completed history (required)
#   -Release                   with a release tag as the base, skip checking that new completed entries
#                              existed in the base, since a release's milestones are often planned after it
# A base must keep its completed history in MILESTONES-COMPLETED.md; an older base is refused.
param(
    [string]$Path,
    [string]$CompletedPath,
    [switch]$Staged,
    [string]$BaseRef,
    [string]$BasePath,
    [string]$BaseCompletedPath,
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# Whole-word milestone ID, so "MP3" or "P2P" in prose is not an ID.
$idPattern = '(?<![A-Za-z0-9_])[MP]\d+[a-z]?\d*(?![A-Za-z0-9_])'
$headerPattern = '^### ([MP]\d+[a-z]?\d*) - (.+?)\s*$'
$completedSectionName = "Completed Milestones"

# The Entry Format's vocabulary, in its order.
$statusValues = @("⏳ Planned", "🚧 In Progress", "✅ Complete")
$headerBulletNames = @("Status", "Goal", "Depends on", "Design")
$sliceSectionName = "{Name} slice"
$sectionNames = @("Decisions", "Slices", $sliceSectionName, "Scope", "Traps", "Acceptance", "Evidence", "Release checks", "Not included")
$partNames = @("Scope", "Traps", "Acceptance", "Evidence")
$bannedPhrases = @("at this edit", "(decided in", "(decided while")

if (($Path -or $CompletedPath) -and $Staged.IsPresent) {
    throw "Use either -Path and -CompletedPath or -Staged, not both."
}
if ($CompletedPath -and -not $Path) {
    throw "-CompletedPath needs -Path."
}
if ($BaseRef -and $BasePath) {
    throw "Use either -BaseRef or -BasePath, not both."
}
if ($BaseCompletedPath -and -not $BasePath) {
    throw "-BaseCompletedPath needs -BasePath."
}
if ($Release.IsPresent -and -not ($BaseRef -or $BasePath)) {
    throw "-Release needs -BaseRef or -BasePath."
}
if (($BaseRef -or $BasePath) -and $Path -and -not $CompletedPath) {
    throw "Comparing against a base needs the completed history; pass -CompletedPath with -Path."
}
if ($BasePath -and -not $BaseCompletedPath) {
    throw "-BasePath needs -BaseCompletedPath, the base's completed history."
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
        $milestone | Add-Member -NotePropertyName Last -NotePropertyValue $last
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

# A Not included value names the milestone that covers the boundary after "which is". The title may
# be followed by more explanation after ", " or ". ". Returns $null when every reference resolves,
# otherwise the problem.
function Test-NotIncluded {
    param([string]$Value, [string[]]$Titles)

    $text = (Get-NormalizedTitle $Value).TrimEnd('.')
    foreach ($match in [regex]::Matches($text, '(?<![a-z])which is ')) {
        $position = $match.Index + $match.Length
        $length = Get-TitleMatchLength -Text $text -Position $position -Titles $Titles
        if ($length -lt 0) {
            return "no milestone title matches '$($text.Substring($position))'"
        }
        $rest = $text.Substring($position + $length)
        if ($rest -and $rest -notmatch '^(, |\. )') {
            return "unexpected text after a milestone title: '$rest'"
        }
    }
    return $null
}

# Splits a markdown table row into its trimmed cells.
function Get-TableCells {
    param([string]$Line)

    $text = $Line.Trim()
    if ($text.StartsWith("|")) {
        $text = $text.Substring(1)
    }
    if ($text.EndsWith("|")) {
        $text = $text.Substring(0, $text.Length - 1)
    }
    return @($text -split '\|' | ForEach-Object { $_.Trim() })
}

# Checks one entry, from its header at $From to its last line at $To, against the Entry Format.
# Returns the problems as objects with the line index and the message.
function Get-EntryFormatProblems {
    param([string[]]$Lines, [int]$From, [int]$To)

    $found = New-Object System.Collections.Generic.List[object]
    function Add-Found {
        param([int]$Index, [string]$Message)
        $found.Add([pscustomobject]@{ Index = $Index; Message = $Message })
    }

    # A --- separator after the entry is not part of it.
    while ($To -gt $From -and ($Lines[$To] -eq "---" -or [string]::IsNullOrWhiteSpace($Lines[$To]))) {
        $To--
    }

    for ($i = $From; $i -le $To; $i++) {
        foreach ($phrase in $bannedPhrases) {
            if ($Lines[$i].IndexOf($phrase, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Add-Found $i "'$phrase' is not allowed; state facts and decisions as settled"
            }
        }
    }

    # Header bullets: Status and Goal, then Depends on and Design when present, and nothing else.
    $first = $From + 1
    while ($first -le $To -and $Lines[$first] -notmatch '^#### ') {
        $first++
    }
    $bullets = @{}
    $lastRank = -1
    for ($i = $From + 1; $i -lt $first; $i++) {
        $line = $Lines[$i]
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        $rank = -1
        if ($line -match '^- \*\*(.+?)\*\*:\s*(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim()
            $rank = [Array]::IndexOf($headerBulletNames, $name)
        }
        if ($rank -lt 0) {
            Add-Found $i "only the Status, Goal, Depends on, and Design bullets go before the first section"
            continue
        }
        if ($bullets.ContainsKey($name)) {
            Add-Found $i "the $name bullet appears more than once"
            continue
        }
        $bullets[$name] = [pscustomobject]@{ Index = $i; Value = $value }
        if ($rank -lt $lastRank) {
            Add-Found $i "the $name bullet is out of order; header bullets go Status, Goal, Depends on, Design"
        }
        $lastRank = [Math]::Max($lastRank, $rank)
        if (-not $value) {
            Add-Found $i "the $name bullet is empty"
        }
        elseif ($name -eq "Status" -and $statusValues -cnotcontains $value) {
            Add-Found $i "unknown Status '$value'; use ⏳ Planned, 🚧 In Progress, or ✅ Complete"
        }
    }
    foreach ($name in @("Status", "Goal")) {
        if (-not $bullets.ContainsKey($name)) {
            Add-Found $From "has no $name bullet"
        }
    }
    $status = if ($bullets.ContainsKey("Status") -and $statusValues -ccontains $bullets["Status"].Value) { $bullets["Status"].Value } else { $null }

    # Sections: allowed names, in the template's order, each once and none empty.
    $sections = New-Object System.Collections.Generic.List[object]
    for ($i = $first; $i -le $To; $i++) {
        if ($Lines[$i] -match '^#### (.+?)\s*$') {
            $sections.Add([pscustomobject]@{ Name = $Matches[1]; Index = $i; End = $To; Slice = $null })
        }
    }
    for ($k = 0; $k -lt $sections.Count - 1; $k++) {
        $sections[$k].End = $sections[$k + 1].Index - 1
    }
    $seen = @{}
    $lastRank = -1
    foreach ($section in $sections) {
        if ($section.Name -cmatch '^(.+) slice$') {
            $section.Slice = $Matches[1]
            $rank = [Array]::IndexOf($sectionNames, $sliceSectionName)
        }
        else {
            $rank = [Array]::IndexOf($sectionNames, $section.Name)
        }
        if ($rank -lt 0) {
            Add-Found $section.Index "unknown section '$($section.Name)'"
            continue
        }
        if ($seen.ContainsKey($section.Name)) {
            Add-Found $section.Index "the '$($section.Name)' section appears more than once"
            continue
        }
        $seen[$section.Name] = $section
        if ($rank -lt $lastRank) {
            Add-Found $section.Index "the '$($section.Name)' section is out of order; sections go Decisions, Slices, the slice sections (or Scope, Traps, Acceptance, Evidence), Release checks, Not included"
        }
        $lastRank = [Math]::Max($lastRank, $rank)
        $hasContent = $false
        for ($i = $section.Index + 1; $i -le $section.End; $i++) {
            if (-not [string]::IsNullOrWhiteSpace($Lines[$i])) {
                $hasContent = $true
                break
            }
        }
        if (-not $hasContent) {
            Add-Found $section.Index "the '$($section.Name)' section is empty"
        }
        if ($section.Name -ceq "Release checks") {
            for ($i = $section.Index + 1; $i -le $section.End; $i++) {
                if ($Lines[$i] -match '^- ' -and $Lines[$i] -cnotmatch '^- (Agent|Manual): ') {
                    Add-Found $i "a Release checks bullet does not start with 'Agent: ' or 'Manual: '"
                }
            }
        }
    }

    $slicesSection = if ($seen.ContainsKey("Slices")) { $seen["Slices"] } else { $null }
    $sliceSections = @($seen.Values | Where-Object { $_.Slice } | Sort-Object Index)
    if (-not $slicesSection -and $sliceSections.Count -eq 0) {
        # An entry without slices: Scope, Traps, Acceptance, and Evidence sections, with the Evidence rule on the entry's Status.
        foreach ($name in @("Scope", "Acceptance")) {
            if (-not $seen.ContainsKey($name)) {
                Add-Found $From "has no Slices section, so it needs a top-level $name section"
            }
        }
        if ($status -ceq "✅ Complete" -and -not $seen.ContainsKey("Evidence")) {
            Add-Found $From "is ✅ Complete but has no Evidence section"
        }
        if ($status -ceq "⏳ Planned" -and $seen.ContainsKey("Evidence")) {
            Add-Found $seen["Evidence"].Index "is ⏳ Planned but has an Evidence section"
        }
        return $found
    }

    foreach ($name in @("Scope", "Traps", "Acceptance", "Evidence")) {
        if ($seen.ContainsKey($name)) {
            Add-Found $seen[$name].Index "has slices, so its $name belongs in the slice sections"
        }
    }
    if (-not $slicesSection) {
        foreach ($section in $sliceSections) {
            Add-Found $section.Index "the '$($section.Name)' section needs a Slices section listing it"
        }
    }

    # The Slices table: a header, a separator, then one valid row per slice.
    $rows = New-Object System.Collections.Generic.List[object]
    if ($slicesSection) {
        $tableLines = 0
        $statusesKnown = $true
        for ($i = $slicesSection.Index + 1; $i -le $slicesSection.End; $i++) {
            $line = $Lines[$i]
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }
            if ($line -notmatch '^\s*\|') {
                Add-Found $i "the Slices section holds only its table"
                continue
            }
            $cells = Get-TableCells $line
            $tableLines++
            if ($tableLines -eq 1) {
                if (($cells -join "|") -cne "Slice|Status|Delivers") {
                    Add-Found $i "the Slices table's header must be '| Slice | Status | Delivers |'"
                }
                continue
            }
            if ($tableLines -eq 2) {
                if ($cells.Count -eq 3 -and -not ($cells | Where-Object { $_ -notmatch '^:?-+:?$' })) {
                    continue
                }
                Add-Found $i "the Slices table has no separator row under its header"
            }
            if ($cells.Count -ne 3) {
                Add-Found $i "a Slices table row has $($cells.Count) cells; rows have Slice, Status, and Delivers cells"
                $statusesKnown = $false
                continue
            }
            $name, $rowStatus, $delivers = $cells
            if (-not $name) {
                Add-Found $i "a Slices table row has no slice name"
                $statusesKnown = $false
                continue
            }
            if ($statusValues -cnotcontains $rowStatus) {
                Add-Found $i "slice '$name' has unknown status '$rowStatus' in the Slices table; use ⏳ Planned, 🚧 In Progress, or ✅ Complete"
                $rowStatus = $null
                $statusesKnown = $false
            }
            if (-not $delivers) {
                Add-Found $i "slice '$name' has no Delivers text in the Slices table"
            }
            if ($rows | Where-Object { $_.Name -ceq $name }) {
                Add-Found $i "slice '$name' is in the Slices table more than once"
                continue
            }
            $rows.Add([pscustomobject]@{ Name = $name; Status = $rowStatus; Index = $i })
        }
        if ($tableLines -gt 0 -and $rows.Count -eq 0 -and $statusesKnown) {
            Add-Found $slicesSection.Index "the Slices table has no rows"
        }

        # Rows and slice sections match by name and order.
        $rowNames = @($rows | ForEach-Object { $_.Name })
        $sectionSlices = @($sliceSections | ForEach-Object { $_.Slice })
        foreach ($row in $rows) {
            if ($sectionSlices -cnotcontains $row.Name) {
                Add-Found $row.Index "slice '$($row.Name)' in the Slices table has no '$($row.Name) slice' section"
            }
        }
        foreach ($section in $sliceSections) {
            if ($rowNames -cnotcontains $section.Slice) {
                Add-Found $section.Index "the '$($section.Name)' section has no row in the Slices table"
            }
        }
        $listed = @($rows | Where-Object { $sectionSlices -ccontains $_.Name })
        $present = @($sliceSections | Where-Object { $rowNames -ccontains $_.Slice })
        for ($k = 0; $k -lt $present.Count; $k++) {
            if ($present[$k].Slice -cne $listed[$k].Name) {
                Add-Found $present[$k].Index "the '$($present[$k].Name)' section is out of the Slices table's order, which lists '$($listed[$k].Name)' here"
                break
            }
        }

        # The entry's Status agrees with its slices.
        if ($status -and $rows.Count -gt 0 -and $statusesKnown) {
            $expected = if (-not ($rows | Where-Object { $_.Status -cne "⏳ Planned" })) { "⏳ Planned" }
                elseif (-not ($rows | Where-Object { $_.Status -cne "✅ Complete" })) { "✅ Complete" }
                else { "🚧 In Progress" }
            if ($status -cne $expected) {
                Add-Found $bullets["Status"].Index "Status is $status but its slices make it $expected"
            }
        }
    }

    # Each slice section: Scope, Traps, Acceptance, and Evidence parts, in that order, each with content.
    foreach ($section in $sliceSections) {
        $slice = $section.Slice
        $parts = @{}
        $current = $null
        $reportedText = $false
        $lastRank = -1
        for ($i = $section.Index + 1; $i -le $section.End; $i++) {
            $line = $Lines[$i]
            if ($line -match '^\*\*(.+?)\*\*\s*$') {
                $label = $Matches[1]
                $rank = [Array]::IndexOf($partNames, $label)
                # Content under an unknown or repeated label is not counted toward another part.
                $current = [pscustomobject]@{ Index = $i; HasContent = $false }
                if ($rank -lt 0) {
                    Add-Found $i "slice '$slice' has an unknown part '$label'"
                    continue
                }
                if ($parts.ContainsKey($label)) {
                    Add-Found $i "slice '$slice' has the $label part more than once"
                    continue
                }
                if ($rank -lt $lastRank) {
                    Add-Found $i "slice '$slice' has its $label part out of order; parts go Scope, Traps, Acceptance, Evidence"
                }
                $lastRank = [Math]::Max($lastRank, $rank)
                $parts[$label] = $current
                continue
            }
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }
            if ($current) {
                $current.HasContent = $true
            }
            elseif (-not $reportedText) {
                Add-Found $i "slice '$slice' has text before its first part"
                $reportedText = $true
            }
        }
        foreach ($label in $partNames) {
            if ($parts.ContainsKey($label) -and -not $parts[$label].HasContent) {
                Add-Found $parts[$label].Index "slice '$slice' has an empty $label part"
            }
        }
        foreach ($label in @("Scope", "Acceptance")) {
            if (-not $parts.ContainsKey($label)) {
                Add-Found $section.Index "slice '$slice' has no $label part"
            }
        }
        $row = $rows | Where-Object { $_.Name -ceq $slice } | Select-Object -First 1
        if ($row -and $row.Status -ceq "✅ Complete" -and -not $parts.ContainsKey("Evidence")) {
            Add-Found $section.Index "slice '$slice' is ✅ Complete but has no Evidence part"
        }
        if ($row -and $row.Status -ceq "⏳ Planned" -and $parts.ContainsKey("Evidence")) {
            Add-Found $parts["Evidence"].Index "slice '$slice' is ⏳ Planned but has an Evidence part"
        }
    }

    return $found
}

function Test-GitFile {
    param([string]$Spec)

    & git -C $repoRoot cat-file -e $Spec 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Read-File {
    param([string]$FilePath, [string]$What)

    if (-not (Test-Path $FilePath)) {
        throw "${What} not found: $FilePath"
    }
    return (Get-Content -Path $FilePath -Raw)
}

function Get-CompletedIntro {
    param($Document)

    $section = $Document.Sections | Where-Object { $_.Name -eq $completedSectionName } | Select-Object -First 1
    if (-not $section) {
        return $null
    }
    $end = $section.Start + 1
    while ($end -lt $Document.Lines.Count -and $Document.Lines[$end] -notmatch '^#{2,3} ') {
        $end++
    }
    return (($Document.Lines[($section.Start + 1)..($end - 1)]) -join "`n").Trim()
}

function Get-CompletedMilestones {
    param($Document)

    if (-not $Document) {
        return @()
    }
    return @($Document.Milestones | Where-Object { $_.Section -eq $completedSectionName })
}

# Load the documents and the optional base.
$completedText = $null
if ($Staged.IsPresent) {
    $label = "MILESTONES.md (staged)"
    $completedLabel = "MILESTONES-COMPLETED.md (staged)"
    $text = Get-GitFileText ":MILESTONES.md"
    $completedText = Get-GitFileText ":MILESTONES-COMPLETED.md"
}
else {
    if (-not $Path) {
        $Path = Join-Path $repoRoot "MILESTONES.md"
        $CompletedPath = Join-Path $repoRoot "MILESTONES-COMPLETED.md"
    }
    $label = Split-Path $Path -Leaf
    $text = Read-File $Path "File"
    if ($CompletedPath) {
        $completedLabel = Split-Path $CompletedPath -Leaf
        $completedText = Read-File $CompletedPath "File"
    }
}

$base = $null
$baseCompleted = $null
if ($BaseRef) {
    $base = Get-Document (Get-GitFileText "${BaseRef}:MILESTONES.md")
    if (-not (Test-GitFile "${BaseRef}:MILESTONES-COMPLETED.md")) {
        throw "${BaseRef} has no MILESTONES-COMPLETED.md; the checker compares only against bases that keep completed milestones in their own file."
    }
    $baseCompleted = Get-Document (Get-GitFileText "${BaseRef}:MILESTONES-COMPLETED.md")
}
elseif ($BasePath) {
    $base = Get-Document (Read-File $BasePath "Base file")
    $baseCompleted = Get-Document (Read-File $BaseCompletedPath "Base completed file")
}

$doc = Get-Document $text
$completedDoc = if ($null -ne $completedText) { Get-Document $completedText } else { $null }
$problems = New-Object System.Collections.Generic.List[object]
function Add-Problem {
    param([int]$Index, [string]$Message, [switch]$Completed)
    $problems.Add([pscustomobject]@{
        File = if ($Completed.IsPresent) { $completedLabel } else { $label }
        Order = if ($Completed.IsPresent) { 1 } else { 0 }
        Line = $Index + 1
        Message = $Message
    })
}

$trackedSections = @("Active Milestones", "Planned Milestones")
$completed = Get-CompletedMilestones $completedDoc

# 1. IDs appear only in section headers, the tracker line, and the Planned Releases outline.
# The completed history lives in its own file; the base comparison below guards it instead.
for ($i = 0; $i -lt $doc.Lines.Count; $i++) {
    $section = $doc.LineSections[$i]
    $line = $doc.Lines[$i]
    if ($section -in @("Planned Releases", $completedSectionName)) {
        continue
    }
    if ($line -match $headerPattern -or $line -match '^Last milestone completed:') {
        continue
    }
    foreach ($match in [regex]::Matches($line, $idPattern)) {
        Add-Problem $i "milestone ID '$($match.Value)' outside section headers, the tracker line, and the Planned Releases outline"
    }
}

# 2. The completed history is in its own file, inside its Completed Milestones section.
$strayCompleted = $doc.Sections | Where-Object { $_.Name -eq $completedSectionName } | Select-Object -First 1
if ($strayCompleted) {
    Add-Problem $strayCompleted.Start "the Completed Milestones section belongs in MILESTONES-COMPLETED.md"
}
if ($completedDoc) {
    if (-not ($completedDoc.Sections | Where-Object { $_.Name -eq $completedSectionName })) {
        Add-Problem 0 "has no '## Completed Milestones' section" -Completed
    }
    foreach ($milestone in $completedDoc.Milestones) {
        if ($milestone.Section -ne $completedSectionName) {
            Add-Problem $milestone.Index "milestone '$($milestone.Id) - $($milestone.Title)' is outside the Completed Milestones section" -Completed
        }
    }
}

# 3. The outline and the sections agree, counting completed entries as sections.
$allMilestones = @($doc.Milestones | ForEach-Object { [pscustomobject]@{ Milestone = $_; Completed = $false } }) +
    @($completed | ForEach-Object { [pscustomobject]@{ Milestone = $_; Completed = $true } })
$headerIds = @{}
foreach ($entry in $allMilestones) {
    $milestone = $entry.Milestone
    if ($headerIds.ContainsKey($milestone.Id)) {
        $first = $headerIds[$milestone.Id]
        $firstFile = if ($first.Completed) { $completedLabel } else { $label }
        Add-Problem $milestone.Index "milestone ID '$($milestone.Id)' heads more than one section (first at ${firstFile}:$($first.Milestone.Index + 1))" -Completed:$entry.Completed
        continue
    }
    $headerIds[$milestone.Id] = $entry
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

# 4. Every reference in a Depends on bullet, and every milestone a Not included section's bullet names
# after "which is", in Active and Planned names an existing milestone, completed ones included.
$titles = @($allMilestones | ForEach-Object { Get-NormalizedTitle $_.Milestone.Title } | Sort-Object -Unique | Sort-Object Length -Descending)
$inNotIncluded = $false
for ($i = 0; $i -lt $doc.Lines.Count; $i++) {
    if ($doc.Lines[$i] -match '^#{1,4} ') {
        $inNotIncluded = $doc.Lines[$i] -cmatch '^#### Not included\s*$'
    }
    if ($doc.LineSections[$i] -notin $trackedSections) {
        continue
    }
    if ($doc.Lines[$i] -match '^- \*\*Depends on\*\*: (.+)$') {
        $problem = Test-DependsOn -Value $Matches[1].Trim() -Titles $titles
        if ($problem) {
            Add-Problem $i "Depends on: $problem"
        }
    }
    if ($inNotIncluded -and $doc.Lines[$i] -match '^- (.+)$') {
        $problem = Test-NotIncluded -Value $Matches[1].Trim() -Titles $titles
        if ($problem) {
            Add-Problem $i "Not included: $problem"
        }
    }
}

# 5. Every active and planned entry follows the Entry Format, including one with only its header.
foreach ($milestone in $doc.Milestones) {
    if ($milestone.Section -notin $trackedSections) {
        continue
    }
    foreach ($found in (Get-EntryFormatProblems -Lines $doc.Lines -From $milestone.Index -To $milestone.Last)) {
        Add-Problem $found.Index "'$($milestone.Id) - $($milestone.Title)': $($found.Message)"
    }
}

# 6. Against a base, the completed history only grew by entries moved in from MILESTONES.md.
if ($base) {
    $baseIntro = Get-CompletedIntro $baseCompleted
    $intro = Get-CompletedIntro $completedDoc
    $completedSection = $completedDoc.Sections | Where-Object { $_.Name -eq $completedSectionName } | Select-Object -First 1
    $completedLine = if ($completedSection) { $completedSection.Start } else { 0 }
    if ($null -ne $baseIntro -and $intro -cne $baseIntro) {
        Add-Problem $completedLine "the Completed Milestones introduction changed" -Completed
    }

    $current = $completed
    $previous = @(Get-CompletedMilestones $baseCompleted)
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
            Add-Problem $completedLine "completed milestone '$header' was removed or renamed" -Completed
            continue
        }
        $new = $currentByHeader[$header]
        if ($new.Body -cne $old.Body) {
            Add-Problem $new.Index "completed milestone '$header' changed" -Completed
        }
        if ($new.Index -lt $lastIndex) {
            Add-Problem $new.Index "completed milestone '$header' moved out of its original order" -Completed
        }
        $lastIndex = [Math]::Max($lastIndex, $new.Index)
    }

    # New entries go above the old ones and, unless the base is a release, must have been active or
    # planned milestones in the base MILESTONES.md.
    $firstOld = ($current | Where-Object { $previousHeaders.ContainsKey("$($_.Id) - $($_.Title)") } | Select-Object -First 1)
    $baseOthers = $base.Milestones
    foreach ($milestone in $current) {
        $header = "$($milestone.Id) - $($milestone.Title)"
        if ($previousHeaders.ContainsKey($header)) {
            continue
        }
        if ($firstOld -and $milestone.Index -gt $firstOld.Index) {
            Add-Problem $milestone.Index "newly completed milestone '$header' must go above the existing completed entries" -Completed
        }
        if ($Release.IsPresent) {
            continue
        }
        $known = $baseOthers | Where-Object { $_.Id -eq $milestone.Id -or (Get-NormalizedTitle $_.Title) -eq (Get-NormalizedTitle $milestone.Title) }
        if (-not $known) {
            Add-Problem $milestone.Index "newly completed milestone '$header' was not an active or planned milestone in the base" -Completed
        }
    }
}

$checked = if ($completedDoc) { "$label and $completedLabel" } else { $label }
if ($problems.Count -gt 0) {
    foreach ($problem in ($problems | Sort-Object Order, Line)) {
        Write-Host "$($problem.File):$($problem.Line): $($problem.Message)"
    }
    Write-Host "FAIL: $($problems.Count) problem(s) in $checked"
    exit 1
}

$scope = if ($base) { "" } elseif ($completedDoc) { " (completed history not compared; pass -BaseRef to check it)" } else { " (no completed history given)" }
Write-Host "OK: $checked passed milestone checks$scope"
exit 0
