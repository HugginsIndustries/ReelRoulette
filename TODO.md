# TODO

## About This Document

This document tracks planned features and enhancements for ReelRoulette. Items are organized by priority level based on user impact, implementation complexity, and frequency of use.

### Priority System

- **P1 (High Priority)**: Critical features that significantly improve user experience, fix major pain points, or are frequently needed. Should be implemented first.
- **P2 (Medium Priority)**: Useful enhancements that improve workflow and user satisfaction but aren't critical. Implement after P1 items.
- **P3 (Low Priority)**: Nice-to-have features for future consideration. Lower impact or niche use cases. Consider implementing based on user demand.

### Entry Format

Each TODO entry follows this structure:

- **Title**: Brief descriptive name
- **Priority**: P1, P2, or P3
- **Impact**: Expected user benefit (High/Medium/Low)
- **Description**: What the feature does and why it's needed
- **Implementation**: Technical approach and key requirements
- **Notes**: Additional context, challenges, or dependencies

---

## P1 - High Priority

### Background Refresh of Imported Sources

- **Priority**: P1
- **Impact**: High - Automates frequent manual workflow
- **Description**: Automatically detect and add new files in imported source folders without requiring manual re-import. Currently, users must manually refresh sources in the Manage Sources dialog to pick up new videos, which is easy to forget.
- **Implementation**:
  - Add `FileSystemWatcher` for each enabled library source
  - Monitor for new video files (.mp4, .mkv, .avi, etc.)
  - Debounce file changes (wait 2 seconds after last change before processing)
  - Automatically create `LibraryItem` for new files and scan metadata
  - Show toast/status notification: "Found 3 new videos in Movies"
  - Add settings:
    - Enable/disable auto-refresh globally or per-source
    - Scan frequency: Immediate, 5 min, hourly, on app start only
    - Notification preferences (show/hide, sound)
  - Handle missing files:
    - Option to auto-remove from library
    - Option to flag/mark missing (show in separate view)
    - Manual "Refresh All Sources" button as fallback
  - Pause monitoring when app is minimized (battery/resource consideration)
- **Notes**: Consider reliability on network drives. FileSystemWatcher can be flaky over SMB/network shares. May need periodic manual scan as backup.

---

## P2 - Medium Priority

### Customizable Keyboard Shortcuts

- **Priority**: P2
- **Impact**: Medium - Respects user muscle memory and preferences
- **Description**: Allow users to customize existing keyboard shortcuts. The app has comprehensive hardcoded shortcuts (K=play/pause, J/L=seek, F=favorite, B=blacklist, etc.) but users cannot rebind them to match their preferred workflow or other apps (e.g., Space for play/pause like VLC).
- **Implementation**:
  - Add "Keyboard Shortcuts..." menu item in View or Edit menu
  - Create `KeyboardShortcutsDialog` with scrollable list of all actions
  - Display current key binding next to each action
  - Click to rebind: Show "Press new key..." and capture next keypress
  - Conflict detection: Warn if key is already bound to another action
  - "Reset to Defaults" button to restore original bindings
  - Store custom bindings in `settings.json` under `KeyboardShortcuts` property
  - Refactor `OnGlobalKeyDown` to lookup action from keybinding dictionary
  - Add "Show Keyboard Shortcuts" in Help menu (read-only reference)
  - Support modifier keys: Ctrl, Shift, Alt combinations
- **Notes**:
  - Current shortcuts: F11=fullscreen, K=play/pause, J=seek back, L=seek forward, R=random, Left/Right=prev/next, F=favorite, A=auto-play, M=mute, B=blacklist, T=always-on-top, P=player-view, 1-5=toggle panels, comma/period=volume, O=browse, Q=quit
  - Some keys should remain system-reserved (Alt+F4, etc.)
  - Consider conflicts with menu accelerators

### Batch Operations in Library Panel

- **Priority**: P2
- **Impact**: Medium - Saves significant time when managing multiple videos
- **Description**: Add multi-select support for batch operations in Library panel. Currently, favoriting 20 videos requires clicking each one individually and pressing F 20 times.
- **Implementation**:
  - Multi-select support:
    - Ctrl+Click: Add/remove individual item from selection
    - Shift+Click: Select range between last selected and clicked item
    - Ctrl+A: Select all visible items (respects current filter)
  - Visual indication of selected items (light highlight color, checkbox column optional)
  - Show selection count in status: "15 items selected" or in Library panel header
  - Batch action context menu (right-click on selection):
    - Add to Favorites
    - Remove from Favorites
    - Add to Blacklist
    - Remove from Blacklist
    - Add Tags... (opens tag dialog, applies to all)
    - Remove Tags... (shows tags common to selection)
    - Remove from Library (confirmation: "Remove 15 videos?")
    - Clear Playback Stats
  - Keyboard shortcuts work on selection or current item if nothing selected
  - Selection persists across search/filter/sort changes (track by item ID)
  - Clear selection when closing Library panel or changing sources
- **Notes**: Example workflows: Select videos 1-50 → Add tag "Season 1", Select all under 30s → Blacklist, Select all favorites → Clear stats

### Smart Playlists (Saved Filter Configurations)

- **Priority**: P2
- **Impact**: Medium - Quick access to commonly used filter combinations
- **Description**: Allow users to save current filter configurations as named playlists for instant recall. Currently, applying a complex filter combination (favorites + never played + under 5 min + with audio) requires manually setting 4-5 checkboxes every time.
- **Implementation**:
  - Add `Playlist` data model: Name, FilterState, SortOrder (optional), Icon (optional)
  - Store playlists in `playlists.json` in AppData
  - UI additions:
    - "Save Current Filters as Playlist..." button in FilterDialog
    - Playlist dropdown in Library panel (above or beside view preset dropdown)
    - "Manage Playlists..." menu item opens `ManagePlaylistsDialog`
  - ManagePlaylistsDialog features:
    - List saved playlists with preview of filter settings
    - Rename, duplicate, delete playlists
    - Reorder (drag-drop or up/down buttons)
    - Edit playlist filters (opens FilterDialog in edit mode)
  - Built-in/default playlists (shown if user has none):
    - "Never Played" - Videos with play count = 0
    - "Favorites" - IsFavorite = true
    - "Recent Additions" - Added within last 7 days
    - "Long Form" - Duration > 10 minutes
    - "Quick Clips" - Duration < 1 minute
    - "No Audio" - HasAudio = false
  - Quick-apply: Select playlist from dropdown → FilterState loads instantly
  - Show active playlist name in Library panel header
- **Notes**: Playlists are essentially named FilterState snapshots. Consider adding "Auto-load playlist on startup" option.

### Video Thumbnail Generation and Display

- **Priority**: P2
- **Impact**: Medium - Enables visual browsing and identification
- **Description**: Generate and display thumbnail images for videos in Library panel. Currently, only filename and path are shown, making visual identification difficult for large libraries.
- **Implementation**:
  - Thumbnail generation:
    - Use FFmpeg to extract frame at 10% of video duration (or first non-black frame)
    - Store as JPEG in `AppData/ReelRoulette/thumbnails/{sourceId}/{hash}.jpg`
    - Filename: MD5 hash of full video path
    - Generate asynchronously during import or on-demand
  - UI integration:
    - Add thumbnail column to Library panel ItemTemplate (left of filename)
    - Lazy load thumbnails as user scrolls (with virtualization)
    - Show placeholder/loading icon while generating
    - Optional: Grid view mode toggle (list vs grid like YouTube/Netflix)
  - Settings:
    - Thumbnail size: Small (64x64), Medium (128x128), Large (256x256)
    - Generation timing: On import, on first view, manual batch only
    - Cache limit: 500MB, 1GB, 2GB, unlimited
    - LRU eviction when cache limit reached
  - Menu items:
    - "Generate Thumbnails for Library" - Batch generate with progress bar
    - "Clear Thumbnail Cache" - Free up disk space
  - Performance considerations:
    - Generate max 5 thumbnails concurrently (FFmpeg is CPU-intensive)
    - Skip generation if file is on slow network drive (detect and warn)
    - Cache metadata (video dimensions, frame count) to pick better extraction point
- **Notes**: 1000 thumbnails at 128x128 ≈ 50-100MB. Priority increases with virtualization (easy to add thumbnail column).

### Enhanced Logging for Loudness/Duration Scanning

- **Priority**: P2
- **Impact**: Medium - Better troubleshooting and user awareness
- **Description**: Add comprehensive logging and reporting for duration/loudness scan operations. Currently, scan results don't distinguish between successful scans of silent videos vs actual errors.
- **Implementation**:
  - Classify scan results:
    - **Success**: Video scanned successfully, metadata retrieved
    - **No Audio**: Successful scan but video has no audio stream (informational, not an error)
    - **Warning**: Failed to scan file (I/O error, timeout, format not supported) - non-fatal
    - **Error**: Critical failure (FFmpeg crash, corrupted file beyond recovery)
  - Maintain separate counters for each category during scan
  - Show scan summary dialog after completion:

    ```text
    Scan Complete
    ✓ 950 videos scanned successfully
    ℹ 30 videos have no audio
    ⚠ 15 files failed to scan
    ✗ 5 files had critical errors
    
    [View Details] [Export Report] [OK]
    ```

  - Detailed view shows:
    - List of files in each category
    - Error messages for failed scans
    - Option to retry failed scans
  - Export report as text file for support/troubleshooting
  - Add logging to `last.log` with categories clearly marked
  - Update status line during scan: "Scanning 234/1000 (15 warnings)"
- **Notes**: Helps users understand why some videos aren't playing or being included in filters. Particularly useful for large imports.

### Tag Categories or Hierarchical Tags

- **Priority**: P2
- **Impact**: Medium - Better organization for users with many tags
- **Description**: Extend tag system to support categories or hierarchical organization. Currently, all tags are flat, which becomes unwieldy with 50+ tags.
- **Implementation**:
  - Data model options:
    - **Option A**: Notation-based: "Genre:Action", "Mood:Relaxing", "Source:YouTube"
    - **Option B**: Separate category field in `Tag` object
  - Update `ManageTagsDialog`:
    - Group tags by category in TreeView or grouped list
    - "Add Category" button to create new category
    - Drag-drop tags between categories
    - Category-level operations: Rename category, delete category (keep tags)
  - Tag autocomplete improvements:
    - Show category in dropdown: "Genre: Action" or "Action (Genre)"
    - Filter by category: Type "genre:" to see only genre tags
    - Smart suggestions based on video filename/path
  - Tag filtering in FilterDialog:
    - Group tags by category for easier browsing
    - "All Tags in Category" checkbox (select all Genre tags at once)
  - Maintain backward compatibility:
    - Read old flat tags as "Uncategorized" category
    - Allow mixing flat and categorized tags
- **Notes**: Example categories: Genre, Mood, Creator, Series, Quality, Language, Year. Consider exporting category structure as JSON for backup.

### File Metadata Sync (Import/Export Tags and Metadata)

- **Priority**: P2
- **Impact**: Medium - Enables portability and standards-compliant metadata management
- **Description**: Sync tags and metadata between ReelRoulette's library database and actual video file metadata. Currently, tags and metadata exist only in `library.json`, making them non-portable. Users cannot import existing file tags from other applications (Windows File Explorer, video editors) or export ReelRoulette tags for use elsewhere. This feature would read/write standard metadata fields using TagLibSharp (already installed).
- **Implementation**:
  - **Phase 1 - Tag Import**:
    - Read tags from video file metadata during import/refresh operations
    - Use `TagLib.File.Create()` to access file tags/keywords field
    - Field mapping by format:
      - MP4/M4V: Use iTunes-style keywords/tags field
      - MKV: Use Matroska tags (custom "KEYWORDS" or "TAGS" tag)
      - Other formats: Fall back to parsing `Tag.Comment` field
    - Merge strategy options (user configurable):
      - **Union**: Combine file tags + library tags (default)
      - **File Overwrites Library**: Replace library tags with file tags
      - **Library Overwrites File**: Keep library tags, ignore file tags
    - Show import summary: "Imported 45 tags from 120 video files"
  - **Phase 2 - Tag Export**:
    - Add "Export Tags to File Metadata" context menu option in Library panel
    - Write `LibraryItem.Tags` to proper tags/keywords metadata field
    - Batch export: "Export Tags for All Videos" in Library menu
    - Optional auto-export on tag change (setting: `MetadataSync.AutoExport`)
    - Confirmation dialog before writing (warns about file modification)
    - Handle locked files gracefully (skip if video is playing)
  - **Phase 3 - Extended Metadata Support**:
    - Import additional metadata fields during scan (separate from tags):
      - Genre (Tag.Genres array - actual genre like "Action", "Documentary")
      - Year (Tag.Year)
      - Artist/Creator (Tag.FirstPerformer)
      - Title (Tag.Title)
      - Album/Series (Tag.Album)
      - Comment (Tag.Comment)
      - Rating (Tag.Rating)
    - Store in `LibraryItem.ExtendedMetadata` dictionary
    - Display metadata in Library panel: Show Genre, Year, Artist, Album columns (sortable, not filterable)
    - Add metadata filtering to FilterDialog (consistent with existing filter patterns):
      - **Genre filter**: Multi-select buttons identical to Tag filter (AND/OR logic toggle)
      - **Artist filter**: Multi-select buttons identical to Tag filter (AND/OR logic toggle)
      - **Album/Series filter**: Multi-select buttons identical to Tag filter (AND/OR logic toggle)
      - **Year filter**: Min/Max year inputs identical to Duration filter ("no min", "no max" options)
    - Expand ItemTagsDialog (rename to "Manage Tags & Metadata") to edit all metadata fields
    - Support batch metadata editing via P2 "Batch Operations in Library Panel":
      - Select multiple videos → Edit Metadata → Apply to all selected
      - Batch-editable fields: Tags, Genre, Year, Artist, Album/Series, Comment, Rating
      - Title is NOT batch-editable (typically unique per video)
      - "Clear Metadata" batch operation (clears all fields except Title)
    - Export all extended metadata when writing tags (preserve all fields)
  - **Settings UI**:
    - Add settings to "Metadata Sync" tab in Settings Dialog (requires P2 "Centralized Settings Dialog")
    - Replace placeholder message with actual controls:
      - Enable/disable auto-import on refresh (checkbox, default: enabled)
      - Enable/disable auto-export on tag change (checkbox, default: disabled)
      - Choose tag format (radio buttons: Native keywords, Comment field, Both - default: Native keywords)
      - Warn before writing to files (checkbox, default: enabled)
      - Merge strategy (dropdown: Union, File Overwrites Library, Library Overwrites File - default: Union)
  - **Error Handling**:
    - Catch `TagLib.UnsupportedFormatException` for incompatible formats
    - Skip read-only files, network drives with access issues
    - Log errors to `last.log` with file paths
    - Show summary: "45 succeeded, 3 failed (read-only), 2 unsupported formats"
- **Notes**:
  - Format compatibility: MP4/M4V (excellent), MKV (good), AVI (limited), MOV (good)
  - TagLibSharp already installed, no new dependencies needed
  - Performance consideration: Batch operations could be slow (50-100ms per file)
  - Should provide "Backup" warning before first export operation
  - Cross-feature integration:
    - Requires P2 "Centralized Settings Dialog": Dialog must exist first, this feature adds Metadata Sync tab
    - Requires P2 "Batch Operations in Library Panel": Batch metadata editing for multiple videos
    - Works with P1 "Background Refresh": Auto-import tags when new files detected
    - Complements P2 "Tag Categories": Could map file genres to tag categories
  - Makes P3 "Video Metadata Editor" redundant: This syncs with actual file, that was for library-only metadata
  - ItemTagsDialog should be renamed to ItemMetadataDialog or similar to reflect expanded scope

### Playback History Analytics and Visualization

- **Priority**: P2
- **Impact**: Medium - Interesting insights for engaged users
- **Description**: Add visual analytics for playback history and library statistics. Current stats are basic text counters. Users who engage heavily with the app would appreciate trends and patterns.
- **Implementation**:
  - Create new "Statistics" window (Library → View Statistics)
  - Charts to implement (using ScottPlot or LiveCharts library):
    - **Line chart**: Videos played per day/week/month over time
    - **Bar chart**: Top 20 most-played videos
    - **Pie chart**: Favorites vs non-favorites play ratio
    - **Histogram**: Video duration distribution in library
    - **Tag cloud**: Most common tags, weighted by usage/play count
    - **Heatmap**: Play times by hour of day and day of week
    - **Source distribution**: Videos per source (bar chart)
    - **Completion rate**: Videos played once vs multiple times
  - Date range selector: Last 7 days, 30 days, 90 days, 1 year, All time
  - Export functionality:
    - Export chart as PNG/SVG image
    - Export data as CSV or JSON for external analysis
  - Summary statistics panel:
    - Total watch time (sum of all play durations)
    - Average videos per day
    - Longest play streak (consecutive days with plays)
    - Most active day/time
- **Notes**: Power user feature. Consider making this extensible (plugin architecture) for custom charts. Most useful with 6+ months of playback history.

### Remember Playback Position

- **Priority**: P2
- **Impact**: Medium - Quality of life improvement for long videos
- **Description**: Remember where each video was paused and automatically resume from that position when played again. Particularly useful for long-form content (tutorials, movies, lectures) that users may watch in multiple sessions.
- **Implementation**:
  - Add `LastPosition` field to `LibraryItem` (TimeSpan, nullable)
  - Update position periodically during playback (every 5 seconds or on pause)
  - On video end, clear the stored position (completed watching)
  - On video load, check if `LastPosition` exists and > 0
  - Show resume dialog: "Resume from [timestamp] or Start from beginning?"
  - Clear all positions option: Playback → "Clear All Resume Positions"
  - Show resume indicator in Library panel (small clock icon or "⏱" next to filename)
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Playback tab:
      - Enable resume feature (checkbox, default: enabled)
      - Auto-resume threshold - don't resume if close to start/end (checkbox, default: enabled)
      - Minimum video length for resume (numeric input, seconds, default: 120)
      - Auto-clear positions older than (dropdown: Never, 7 days, 30 days, 90 days - default: Never)
- **Notes**:
  - Store positions in `library.json` as part of LibraryItem
  - Position should persist across app restarts
  - Consider adding "Resume without asking" option to skip dialog

### Installation and First-Run Setup Wizard

- **Priority**: P2
- **Impact**: Medium - Significantly improves first-run experience and onboarding
- **Description**: Create a guided setup wizard that runs on first launch to help users configure ReelRoulette. Currently, new users must manually discover and configure settings, import library sources, and learn features through trial and error. A setup wizard provides a smooth onboarding experience and ensures proper initial configuration.
- **Implementation**:
  - Detect first run (check for existence of `settings.json` or add `IsFirstRun` flag)
  - Create `SetupWizardWindow.axaml` and `SetupWizardWindow.axaml.cs`
  - Wizard pages (sequential navigation with Next/Back/Skip buttons):
    - **Welcome Page**:
      - App logo and title
      - Brief description of ReelRoulette
      - "Get Started" button to begin setup
      - "Skip Setup" option (uses all defaults)
    - **Library Setup Page**:
      - "Add your first video folder" prompt
      - Folder browser button
      - List of added folders (can add multiple)
      - Option to scan for duration/loudness immediately or later
      - Estimated scan time based on folder size
    - **Playback Preferences Page**:
      - Volume normalization mode selection (simple explanation of each)
      - Loop current video (checkbox, default: enabled)
      - Auto-play next video (checkbox, default: enabled)
      - Start muted (checkbox, default: disabled)
      - No repeats until all played (checkbox, default: enabled)
      - Seek/volume step sizes
    - **Optional Features Page**:
      - Start with Windows (checkbox, default: disabled)
      - Start minimized to taskbar (checkbox, default: disabled)
      - Start minimized to tray (checkbox, default: disabled, grayed out if System Tray not implemented)
      - Minimize to system tray (checkbox, default: disabled, grayed out if System Tray not implemented)
      - Show tray notifications (checkbox, default: enabled, grayed out if System Tray not implemented)
      - Create desktop shortcut (checkbox, default: enabled)
    - **Complete Page**:
      - "Setup complete!" message
      - Summary of configured settings
      - Quick tips: Keyboard shortcuts cheat sheet, filter button location, etc.
      - "Open ReelRoulette" button
  - Store wizard completion flag in `settings.json` (`IsFirstRun = false`)
  - Option to re-run wizard: Help → "Run Setup Wizard Again"
  - During wizard, show progress indicator (Page X of Y)
  - All wizard settings should integrate with existing Settings Dialog
  - Validation rules:
    - **Quick Setup mode**: At least one library source is required (show error if user tries to finish without adding a folder)
    - **Custom Setup mode**: Library source is optional, but show warning if skipped: "You can add library sources later in Settings"
    - **"Skip Setup" button**: Bypasses all validation, uses defaults, marks wizard as complete
    - Path validation: Ensure all added folder paths are valid and accessible
  - Two setup modes:
    - **Quick Setup**: Use sensible defaults, only ask for library folder (1 page, source required)
    - **Custom Setup**: Show all wizard pages (full walkthrough, all pages can be skipped)
  - Wizard window should be modal (blocks main window) and centered on screen
  - Users can close wizard at any time via X button or Cancel (wizard can be re-run later)
- **Notes**:
  - Should feel lightweight and quick (under 2 minutes to complete)
  - Wizard is modal (blocks main window) but can be closed/cancelled at any time
  - Incomplete wizard can be re-run from Help menu - users aren't forced to complete it on first run
  - In Custom Setup, individual pages can be skipped (uses defaults for that page)
  - In Quick Setup, the library folder selection is mandatory (core requirement)
  - Add tooltip help icons on each page explaining options
  - Consider "Import from another video manager" option if feasible
  - After completion, mark `IsFirstRun = false` in settings
  - Desktop shortcut creation may require elevated permissions on some systems
  - Quick Setup mode is recommended for most users (simplicity and speed)
  - Custom Setup mode for power users who want full control over configuration
  - **Settings consistency**: All Optional Features Page settings use identical terminology and defaults as their corresponding Settings Dialog entries:
    - "Start with Windows" → P3 "Start with Windows" feature (default: disabled)
    - "Start minimized to taskbar" → P3 "Start with Windows" feature (default: disabled)
    - "Start minimized to tray" → P3 "Start with Windows" feature (default: disabled, requires System Tray)
    - "Minimize to system tray" → P3 "System Tray Integration" feature (default: disabled)
    - "Show tray notifications" → P3 "System Tray Integration" feature (default: enabled)
  - Group System Tray settings together in wizard UI with explanatory text: "System Tray features (optional)"

---

## P3 - Low Priority

### System Tray Integration

- **Priority**: P3
- **Impact**: Low - Convenience for users who want minimal taskbar presence
- **Description**: Add system tray icon and minimize-to-tray functionality. Allows app to run in background without taking up taskbar space.
- **Implementation**:
  - Add system tray icon (use existing app icon or create smaller 16x16 variant)
  - When enabled: Minimize button sends app to tray instead of taskbar
  - Tray icon context menu:
    - "Show/Hide Window" (default double-click action)
    - "Play Random Video" (quick action)
    - "Exit" (closes application)
  - Notification on first minimize: "ReelRoulette is still running in system tray"
  - Optional: Show toast notifications for certain events (video ended, timer expired)
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to General tab:
      - Minimize to system tray (checkbox, default: disabled)
      - Show tray notifications (checkbox, default: enabled)
- **Notes**:
  - Windows-specific feature (may need platform detection for cross-platform builds)
  - Tray icon should update if video is playing (optional visual indicator)
  - "Start minimized to tray" setting is part of P3 "Start with Windows" feature

### Start with Windows

- **Priority**: P3
- **Impact**: Low - Convenience for dedicated users
- **Description**: Add option to automatically launch ReelRoulette when Windows starts. Useful for users who use the app daily or want timer-based playback on startup.
- **Implementation**:
  - When enabled: Create registry entry or shortcut in Windows Startup folder
  - Registry path: `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
  - Key name: "ReelRoulette"
  - Value: Path to ReelRoulette.exe
  - Detect if already enabled on settings load (sync checkbox with actual registry state)
  - Admin permissions may be required for registry write
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to General tab:
      - Start with Windows (checkbox, default: disabled)
      - Start minimized to taskbar (checkbox, default: disabled)
      - Start minimized to tray (checkbox, default: disabled, requires P3 "System Tray Integration")
- **Notes**:
  - Windows-specific feature
  - Should handle uninstall scenario (remove registry entry)
  - "Start minimized to taskbar" is a basic OS feature (no dependencies)
  - "Start minimized to tray" requires System Tray Integration to be implemented first
  - May need UAC elevation on first enable

### Playback Speed Control

- **Priority**: P3
- **Impact**: Low - Niche use case for speed watching or slow motion
- **Description**: Add default playback speed setting and runtime speed control. Allows users to watch videos faster (tutorials, lectures) or slower (detailed observation).
- **Implementation**:
  - Apply default speed when video loads
  - Add runtime controls:
    - Keyboard shortcuts: [ = slower, ] = faster, \ = reset to 1x
    - Menu item: Playback → Speed submenu with options: 0.25x, 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x
    - Optional: Show current speed in status bar
  - LibVLC integration: Use `MediaPlayer.SetRate()` method
  - Speed affects video but not audio pitch (use time-stretching)
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Playback tab:
      - Default playback speed (dropdown: 0.25x, 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x - default: 1x)
      - Remember speed per video (checkbox, default: disabled)
- **Notes**:
  - Most useful for educational content or tutorials
  - Audio quality may degrade at extreme speeds (< 0.5x or > 2x)
  - May interact with volume normalization features

### Custom FFmpeg/FFprobe Paths

- **Priority**: P3
- **Impact**: Low - Advanced users with custom builds only
- **Description**: Allow users to specify custom paths for FFmpeg and FFprobe executables. Useful for advanced users who want to use newer versions, custom builds, or system-installed binaries instead of bundled versions.
- **Implementation**:
  - Validation: Check if specified files exist and are executable
  - Test button: Run `ffmpeg -version` to verify working binary
  - Fall back to bundled version if custom path is invalid
  - Update `NativeBinaryHelper.cs` to check settings before using bundled paths
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Advanced tab → FFmpeg/FFprobe section:
      - Use bundled binaries (checkbox, default: enabled)
      - FFmpeg path (text input with Browse button, disabled if using bundled)
      - FFprobe path (text input with Browse button, disabled if using bundled)
      - Test binaries button (shows version info or error)
- **Notes**:
  - Most users should use bundled binaries (simpler, tested)
  - Useful for testing new FFmpeg features or performance
  - Should validate version compatibility (minimum FFmpeg 4.0 or similar)
  - Clear warning: "Custom binaries may cause instability"

### Advanced Logging Controls

- **Priority**: P3
- **Impact**: Low - Primarily for debugging and development
- **Description**: Add user-configurable logging levels and log management. Helps with troubleshooting and reduces log file size for normal users.
- **Implementation**:
  - Log levels:
    - Error: Only log errors and exceptions
    - Warning: Errors + warnings
    - Info: Errors + warnings + informational messages (current behavior)
    - Debug: Everything including detailed operation traces
  - Update logging calls to respect level (filter before writing)
  - Implement log rotation when file size limit reached
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Advanced tab → Logging section:
      - Log level (dropdown: Error, Warning, Info, Debug - default: Info)
      - Log rotation (dropdown: 1MB, 5MB, 10MB, Unlimited - default: 5MB)
      - Open log file button (opens last.log in default text editor)
      - Clear log file button (truncates last.log with confirmation)
- **Notes**:
  - Debug level may impact performance with very verbose logging
  - Consider timestamped log archives (last.log.1, last.log.2, etc.)
  - Useful for troubleshooting scan failures or playback issues
  - Default Info level is good balance for most users

### Cache Management and Limits

- **Priority**: P3
- **Impact**: Low - Disk space management for users with large libraries
- **Description**: Add user-configurable cache size limits and management for various cached data (thumbnails, metadata, preview frames). Helps users control disk space usage and clean up old cached data.
- **Implementation**:
  - Implement cache size tracking and cleanup logic
  - Thumbnail cache cleanup (requires P2 "Video Thumbnail Generation")
  - Metadata cache for raw FFprobe JSON output
  - Preview frames cache (future feature)
  - Library index auto-backup before major operations
  - Cache statistics calculation
  - Low disk space warning system (< 1GB free)
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Advanced tab → Cache section:
      - **Thumbnail cache** (requires P2 "Video Thumbnail Generation"):
        - Limit (dropdown: 100MB, 500MB, 1GB, 2GB, 5GB, Unlimited - default: 1GB)
        - Cleanup strategy (dropdown: LRU, Oldest first, By source)
        - Clear Thumbnail Cache button (shows size freed)
      - **Metadata cache**:
        - Limit (dropdown: 10MB, 50MB, 100MB, Unlimited - default: 50MB)
        - Auto-clear older than (dropdown: 30 days, 90 days, 1 year, Never - default: 90 days)
        - Clear Metadata Cache button
      - **Preview cache** (future feature):
        - Limit (dropdown: 500MB, 1GB, 2GB, 5GB, Unlimited - default: 1GB)
        - Clear Preview Cache button
      - **Library backups**:
        - Keep last N backups (numeric input: 5-50, default: 10)
        - Manage Backups button (opens dialog with backup list)
      - **Cache statistics** (read-only displays):
        - Current thumbnail cache size / items
        - Current metadata cache size / items
        - Current preview cache size / items
        - Last cleanup date
      - Auto-cleanup when limit reached (checkbox, default: enabled)
      - Clear All Caches button (master cleanup with confirmation)
- **Notes**:
  - Thumbnail cache: ~20-50KB per thumbnail at 128x128, so 10,000 thumbnails ≈ 200-500MB
  - Metadata cache: Very small, mostly text, rarely exceeds 100MB even for huge libraries
  - Preview frames: Much larger, 1-5MB per video depending on frame count
  - Each library.json backup: 1-10MB depending on library size
  - Most features are placeholders for future thumbnail/preview features
  - Useful for users with limited disk space or very large libraries

### Performance and Resource Controls

- **Priority**: P3
- **Impact**: Low - Fine-tuning for specific hardware/usage scenarios
- **Description**: Add user-configurable performance options to control how the app uses system resources (CPU, memory, network). Useful for users with slower hardware, network drives, or who want to minimize resource usage.
- **Implementation**:
  - Implement concurrent operation limits for FFmpeg/thumbnails
  - Background throttling logic (requires P1 "Background Refresh")
  - Network timeout and retry handling
  - Library panel virtualization tuning (requires P1 "Library Panel Virtualization")
  - Memory management strategies
  - Hardware acceleration controls
  - Performance monitoring (optional)
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Advanced tab → Performance section:
      - **Performance preset** (dropdown: Low-end PC, Balanced, High-performance, Custom - default: Balanced)
      - **Concurrent Operations**:
        - Max FFmpeg/FFprobe processes (dropdown: 1, 2, 4, 8 - default: 4)
        - Max thumbnail tasks (dropdown: 1, 2, 4, 8 - default: 2, requires P2 "Video Thumbnail Generation")
      - **Background Operations** (requires P1 "Background Refresh"):
        - Scan interval when minimized (dropdown: Immediate, 5min, 30min, Hourly, Disabled - default: 30min)
        - CPU priority (dropdown: Low, Normal, High - default: Low)
        - Pause on low battery (checkbox, default: enabled)
        - Pause when apps fullscreen (checkbox, default: disabled)
      - **Network Drives**:
        - Operation timeout (dropdown: 5s, 10s, 30s, 60s - default: 10s)
        - Retry attempts (dropdown: 0, 1, 3, 5 - default: 3)
        - Skip thumbnails on network (checkbox, default: enabled)
        - Cache file checks (dropdown: 30s, 1min, 5min, Never - default: 1min)
      - **Library Panel** (requires P1 "Library Panel Virtualization"):
        - Pre-render items (dropdown: 10, 20, 50, 100 - default: 20)
        - Render batch size (dropdown: 5, 10, 20, 50 - default: 10)
        - Scroll buffer (dropdown: 250px, 500px, 1000px - default: 500px)
      - **Memory**:
        - Cache strategy (dropdown: Keep all, Unload inactive - default: Keep all)
        - Force GC after operations (checkbox, default: enabled)
        - Video buffer size (dropdown: Auto, 512KB, 1MB, 2MB, 4MB - default: Auto)
      - **UI Rendering**:
        - Hardware acceleration (dropdown: Auto, Enabled, Disabled - default: Auto)
        - Frame rate limit (dropdown: 30, 60, 120 FPS, Unlimited - default: 60 FPS)
        - Smooth scrolling (checkbox, default: enabled)
        - Reduce animations on battery (checkbox, default: enabled)
      - Reset to Defaults button (for performance section only)
- **Notes**:
  - Most users should use default settings (balanced performance)
  - Performance presets auto-configure all settings (Custom allows manual tuning)
  - Concurrent operations: Critical for scan performance with large libraries
  - Network optimizations: Essential for users with NAS/network storage
  - Background throttling: Prevents app from hogging resources when not in focus
  - Memory settings: Useful for users with 8GB RAM or less
  - UI rendering: Hardware acceleration issues rare but possible on older GPUs
  - Most features depend on other TODOs (virtualization, thumbnails, background refresh)

### Export/Import Library Index

- **Priority**: P3
- **Impact**: Low-Medium - Useful for backup and migration
- **Description**: Allow users to export library index to a file and import it on another machine or as backup. Useful for migrating to new PC or recovering from data loss.
- **Implementation**:
  - Add menu items: Library → "Export Library..." and "Import Library..."
  - Export dialog:
    - Save location picker
    - Filename with timestamp: `ReelRoulette_Library_2025-12-15.json`
    - Options:
      - Include settings.json (filters, preferences)
      - Include thumbnails (creates .zip bundle)
      - Include playback stats and tags
  - Import dialog:
    - File picker for exported .json or .zip
    - Import mode selection:
      - **Replace**: Clear existing library, use imported data
      - **Merge**: Combine with existing, update if path matches
      - **Selective**: Show sources in import file, let user choose which to import
    - Path validation: Check if imported paths exist on current system
    - Warning for missing paths: "35 of 100 videos not found on this system"
  - Conflict resolution for merge:
    - If video path exists in both: Keep local stats or overwrite with imported?
    - If source name conflicts: Rename imported source or skip?
- **Notes**: Consider cloud backup integration (auto-export to Dropbox folder). Most users won't need this unless reinstalling OS or migrating machines.

### Undo/Redo System

- **Priority**: P3
- **Impact**: Low-Medium - Safety net for accidental actions
- **Description**: Add undo/redo support for destructive operations. Provides safety net for mistakes like accidentally removing videos from library or mass-blacklisting.
- **Implementation**:
  - Track operations in undo stack (limited to last 20 actions):
    - Remove from library (store LibraryItem)
    - Blacklist/unblacklist (store path and state)
    - Clear playback stats (store old counts)
    - Tag changes (store old tags)
    - Favorite toggle (store old state)
  - Add Edit menu (if not exists) with:
    - "Undo {ActionName}" (Ctrl+Z) - grayed out if nothing to undo
    - "Redo {ActionName}" (Ctrl+Y) - grayed out if nothing to redo
  - Undo stack management:
    - Clear redo stack when new action performed
    - Clear entire stack on app restart (or persist to `undo.json`)
    - Memory limit: Drop oldest operations if stack exceeds limit
  - Visual feedback: Toast notification "Undone: Remove from Library" (2sec)
- **Notes**: Most destructive operations already have confirmation dialogs. Implementation complexity is high relative to benefit. Start with high-value operations (Remove from Library) first.

### Custom Themes and Dark Mode

- **Priority**: P3
- **Impact**: Low - Aesthetic preference, some accessibility benefit
- **Description**: Add theme support with light/dark/custom color schemes. Current UI appears to be light themed with fixed colors.
- **Implementation**:
  - Define theme resource dictionaries in XAML:
    - `LightTheme.axaml` - Current colors
    - `DarkTheme.axaml` - Dark background, light text
    - `HighContrast.axaml` - Accessibility (high contrast colors)
  - Add View → Theme menu with options:
    - Light
    - Dark
    - Auto (follow system theme)
    - High Contrast (accessibility)
  - Store preference in settings.json
  - Apply theme on startup and when changed
  - Ensure all custom controls respect theme colors (buttons, panels, etc.)
  - Test with Windows dark mode and light mode
- **Notes**: Avalonia has built-in theme support (FluentTheme), should be straightforward. Consider this alongside accessibility improvements (font size scaling, screen reader support).

### Advanced Shuffle/Random Modes

- **Priority**: P3
- **Impact**: Low - Niche feature for specific preferences
- **Description**: Add alternative random/shuffle algorithms beyond pure random. Helps users discover less-played videos or create specific viewing patterns.
- **Implementation**:
  - Add "Shuffle Mode" dropdown in playback controls or settings
  - Modes to implement:
    - **Pure Random** (current): Equal probability for all eligible videos
    - **Weighted Random**: Favor less-played videos (probability inversely proportional to play count)
    - **Smart Shuffle**: Play all eligible videos once before repeating (like Spotify)
    - **Chronological**: Oldest added first (FIFO)
    - **Reverse Chronological**: Newest added first
    - **Longest First**: Sort by duration descending
    - **Shortest First**: Sort by duration ascending
  - Store mode preference in settings
  - Update queue building logic in `BuildQueue()` based on selected mode
  - Show current mode in status or tooltip
- **Notes**: Most users are satisfied with pure random. Weighted random might be most valuable (surfaces forgotten gems). Consider user feedback before implementing all modes.

### Duplicate Video Detection

- **Priority**: P3
- **Impact**: Low - Useful for one-time library cleanup
- **Description**: Detect and help remove duplicate videos in library. Useful for users who have collected videos over years and suspect duplicates from re-downloads or file moves.
- **Implementation**:
  - Add Library → "Find Duplicates..." menu item
  - Detection methods (progressively more accurate but slower):
    - **Level 1**: Exact filename match (fast, 100% precision)
    - **Level 2**: File size + duration match (fast, high precision)
    - **Level 3**: Perceptual hash comparison (slow, catches re-encodes)
  - Show results in dialog:
    - Group suspected duplicates together
    - Show filename, path, size, duration for each
    - Preview thumbnails side-by-side (if thumbnail feature implemented)
    - Checkboxes to mark which files to keep vs remove
    - "Keep Highest Quality" auto-select (largest file size)
  - Batch remove marked duplicates with confirmation
  - Report: "Found 15 potential duplicates, removed 8 files"
- **Notes**: Perceptual hashing is complex (would need library like ImageHash ported to video). Start with Level 1 and 2 only. Most users won't need this.

### Video Metadata Editor

- **Priority**: P3
- **Impact**: Low - Edge case, most metadata is auto-detected
- **Description**: Allow manual editing of video metadata stored in library. Useful for correcting scan errors or adding custom information.
- **Implementation**:
  - Add "Edit Metadata..." context menu item in Library panel
  - `EditMetadataDialog` with fields:
    - Title override (default: filename without extension)
    - Custom notes/description (multiline text)
    - Duration override (if scan failed or incorrect)
    - Custom thumbnail upload (override auto-generated)
    - External URL (link to source: YouTube, Vimeo, etc.)
  - Store custom metadata in `LibraryItem.CustomMetadata` property
  - Display custom title in Library panel if set (show override indicator)
  - Use custom duration for filters if set
  - Export/import custom metadata with library export
- **Notes**: Keep it simple - don't try to edit actual video file metadata (too complex, risk of corruption). Focus on library-level annotations only.

### Cloud Sync and Multi-Device Support

- **Priority**: P3
- **Impact**: Low - Complex implementation, narrow use case
- **Description**: Sync library data and playback stats across multiple machines. Useful for users who use ReelRoulette on multiple PCs and want consistent favorites/stats.
- **Implementation**:
  - Cloud storage options:
    - Dropbox/Google Drive/OneDrive (use their APIs)
    - Custom server (self-hosted sync server)
    - WebDAV (generic protocol)
  - Sync data:
    - `library.json` - Full library index
    - `settings.json` - User preferences (optional)
    - Playback stats, favorites, tags, blacklist
  - Conflict resolution:
    - Timestamp-based: Most recent change wins
    - Manual merge: Show conflicts, let user choose
    - Per-field merge: Combine favorites, max play count, etc.
  - Settings:
    - Enable/disable sync
    - Sync provider selection
    - Sync frequency: Manual, every 5 min, on app start/close
    - Exclude certain sources from sync (local-only folders)
  - UI indicators:
    - Sync status in status bar
    - "Sync Now" button
    - Last sync timestamp
- **Notes**: Very complex feature. Requires cloud provider SDKs, authentication, conflict resolution. Consider if user demand warrants the effort. Alternative: Document how to manually sync using cloud folders.

### Grid View for Library Panel

- **Priority**: P3
- **Impact**: Low - Alternative view mode, list view is sufficient
- **Description**: Add thumbnail grid view option for Library panel (like YouTube/Netflix). Provides alternative visual browsing mode.
- **Implementation**:
  - Requires thumbnail generation feature (P2) to be implemented first
  - Add view mode toggle button in Library panel: List/Grid
  - Grid view:
    - Show thumbnails in responsive grid (auto-adjust columns based on panel width)
    - Filename overlay on thumbnail (bottom, semi-transparent background)
    - Play count, favorite star, blacklist indicator as icons on thumbnail
    - Grid item size slider (small/medium/large)
    - Same filtering, sorting, search applies to grid
    - Right-click context menu same as list view
    - Double-click or Enter key plays video
  - Maintain view mode preference in settings
  - Virtualization required for performance with large libraries
- **Notes**: Thumbnail grid is familiar UI pattern but adds complexity. List view with small thumbnails may be sufficient. Consider user feedback before implementing.

---

## Completed Features (Archive)

These features have been fully implemented and are no longer on the TODO list:

- ✅ **Photo Support** - Comprehensive photo support with media type filtering, configurable display duration, and mixed video/photo slideshow functionality (Completed 2025-12-28)
  - Added MediaType enum (Video/Photo) and MediaTypeFilter (All/VideosOnly/PhotosOnly)
  - Library system now scans and categorizes both videos and photos
  - Photo playback using Avalonia Image control with configurable display duration (1-3600s)
  - Image scaling options: Off, Auto (screen-based), Fixed (user-defined max dimensions)
  - Media type filtering integrated into FilterService and FilterDialog
  - Statistics updated to distinguish videos from photos (GlobalTotalVideosKnown, GlobalTotalPhotosKnown, GlobalTotalMediaKnown, etc.)
  - Missing file handling for photos with configurable default behavior
  - Auto-continue playback when missing photos are removed from library
- ✅ **Library Panel Virtualization** - Implemented virtualization in Library panel using ListBox with VirtualizingStackPanel for efficient rendering of large libraries (Completed 2025-12-28)
  - Replaced ItemsControl with ListBox for native virtualization support
  - Only visible items are rendered, dramatically improving performance with 10,000+ item libraries
  - Maintains all existing functionality: search, sort, filters, multi-column layout
  - Smooth scrolling and UI responsiveness even with very large libraries
- ✅ **Centralized Settings Dialog** - Tabbed settings dialog with playback preferences, keyboard shortcuts, and persistence (Completed 2025-12-19)
  - General tab (placeholder) and Playback tab implemented
  - Loop, Auto-play, Mute state, Volume level, No Repeat settings now persist
  - Seek step, Volume step, Volume normalization consolidated into dialog
  - Removed redundant submenus from Playback menu
  - Keyboard shortcut 'S' opens Settings dialog
  - Fixed keyboard shortcuts reliability (window focusable, improved event handling)
  - Fixed recursive settings saves with `_isApplyingSettings` flag
  - Volume level (0-200) persists between sessions
  - Mute state and volume restore correctly after app restart
- ✅ **Source Management UI** - Comprehensive dialog for managing library sources with enable/disable, rename, remove, refresh (Completed 2025-12-15)
- ✅ **Window State Persistence** - Save/restore window position, size, maximized state, panel widths (Completed 2025-12-15)
- ✅ **Tag Management System** - Create, rename, delete tags with usage counts and bulk operations (Completed 2025-12)
- ✅ **Missing File Dialog** - Handle missing videos with locate/remove options (Completed 2025-12)
- ✅ **Playback Statistics** - Track play count, last played, unique videos, total plays (Completed 2025-12)
- ✅ **Volume Normalization** - Multiple modes including library-aware normalization (Completed 2025-12)
- ✅ **Audio Filtering** - Filter by with audio, without audio, or all videos (Completed 2025-12)
- ✅ **Duration and Loudness Scanning** - Async metadata scanning with progress tracking (Completed 2025-12)

---

## Notes and Guidelines

### Implementation Priority

When selecting which TODO to implement next, consider:

1. **User impact**: How many users benefit? How much time does it save?
2. **Frequency of use**: Daily feature vs one-time setup?
3. **Dependencies**: Does it enable other features (e.g., virtualization enables thumbnails)?
4. **Complexity**: Quick wins vs long-term projects
5. **User requests**: What are people asking for?

### Contributing

If implementing a TODO:

1. Update status to "In Progress" with date
2. Create feature branch: `feature/library-virtualization`
3. Update CHANGELOG.md with progress
4. Move to "Completed Features" when done
5. Update documentation and help text

### Feedback

Priorities can shift based on:

- User feedback and feature requests
- Usage analytics (if implemented)
- Pain points discovered during actual use
- Technical discoveries (some features easier/harder than expected)

Have suggestions or want to discuss priorities? Open an issue or discussion on the project repository.
