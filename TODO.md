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

### Filter Presets (Saved Filter Configurations)

- **Priority**: P2
- **Impact**: Medium - Quick access to commonly used filter combinations
- **Description**: Allow users to save current filter configurations as named presets for instant recall. Currently, applying a complex filter combination (favorites + never played + under 5 min + with audio) requires manually setting 4-5 checkboxes every time. Filter presets provide quick access to frequently used filter combinations, eliminating repetitive filter setup.
- **Implementation**:
  - Add `FilterPreset` data model: Name, FilterState, SortOrder (optional)
  - Store presets in `settings.json` under `FilterPresets` property
  - UI additions:
    - "Add Preset" button in FilterDialog that saves current filter state with user-provided name
    - Preset dropdown in FilterDialog (above filter controls)
    - "Manage Presets..." menu item opens `ManagePresetsDialog`
  - ManagePresetsDialog features:
    - List saved presets with preview of filter settings
    - Rename, duplicate, delete presets
    - Reorder (drag-drop or up/down buttons)
    - Edit preset filters (opens FilterDialog in edit mode)
  - Quick-apply: Select preset from dropdown → FilterState loads instantly
  - Show active preset name in FilterDialog header
- **Notes**: Filter presets are essentially named FilterState snapshots. No built-in presets - users create their own based on their specific filtering needs.

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
    - Lazy load thumbnails as user scrolls (with virtualization - ✅ Library panel virtualization complete)
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
    - Currently supports flat tags with inclusion/exclusion (✅ Enhanced with tag inclusion/exclusion UI)
    - Group tags by category for easier browsing (enhancement on top of current UI)
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
    - Support batch metadata editing via P2 "Batch Operations in Library Panel" (✅ Completed - batch operations now available):
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
    - Requires P2 "Centralized Settings Dialog": Dialog must exist first, this feature adds Metadata Sync tab (✅ Completed)
    - Requires P2 "Batch Operations in Library Panel": Batch metadata editing for multiple videos (✅ Completed - batch operations now available)
    - Works with P1 "Background Refresh": Auto-import tags when new files detected
    - Complements P2 "Tag Categories": Could map file genres to tag categories
  - Makes P3 "Video Metadata Editor" redundant: This syncs with actual file, that was for library-only metadata
  - ItemTagsDialog now supports batch operations (single or multiple items), but still focuses on tags only. Rename to ItemMetadataDialog when extended metadata support is added.

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

### Enhanced Search and Sorting

- **Priority**: P2
- **Impact**: Medium - Improves library navigation and discovery
- **Description**: Enhance the existing search and sorting capabilities to make it easier to find and organize media in large libraries. Current search is basic filename/path matching, and sorting supports limited criteria.
- **Implementation**:
  - **Search enhancements**:
    - Add tag autocomplete in search box: Type "#" or "@" to trigger tag suggestions
    - Show matching tags as user types (dropdown list of available tags)
    - Support tag search syntax: `tag:Action` or `#Action` to filter by tag
    - Filter search results in real-time as user types
  - **Sorting enhancements**:
    - Add multi-criteria sorting: Primary sort + secondary sort (e.g., Sort by Date Added, then by Duration)
    - Add sort criteria options:
      - Tag count (number of tags assigned)
      - Last played (most recent first or oldest first)
      - File size
      - Resolution (for videos/photos with metadata)
    - Visual indicator showing active sort criteria
    - Remember sort preferences per view preset
- **Notes**: Enhance existing single search box and single sorting system - do not create separate search/sort interfaces. Tag autocomplete helps users quickly find items with specific tags in large libraries.

---

## P3 - Low Priority

### Customizable Keyboard Shortcuts

- **Priority**: P3
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

### Playback History Analytics and Visualization

- **Priority**: P3
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

### Generic Confirmation Dialog Refactoring

- **Priority**: P3
- **Impact**: Low - Code quality and maintainability improvement
- **Description**: Create a generic confirmation dialog class for reuse across the codebase. Currently, confirmation dialogs (like RemoveItemsDialog, MissingFileDialog, etc.) are created separately, leading to code duplication.
- **Implementation**:
  - Create generic `ConfirmDialog` class with configurable title, message, button labels
  - Support for different button combinations (OK/Cancel, Yes/No, Remove/Cancel, etc.)
  - Refactor existing confirmation dialogs to use the generic dialog
  - Maintain backward compatibility during refactoring
- **Notes**: Low priority enhancement for code maintainability. Consider after more urgent features are complete.

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

### Advanced Settings (Cache and Performance Controls)

- **Priority**: P3
- **Impact**: Low - Fine-tuning for specific hardware/usage scenarios and disk space management
- **Description**: Combined advanced settings for cache management and performance controls. Allows users to fine-tune how the app uses system resources (CPU, memory, network, disk) and manage cached data. Useful for users with slower hardware, network drives, limited disk space, or who want to optimize resource usage.
- **Implementation**:
  - **Cache Management**:
    - Thumbnail cache cleanup (requires P2 "Video Thumbnail Generation"):
      - Limit (dropdown: 100MB, 500MB, 1GB, 2GB, 5GB, Unlimited - default: 1GB)
      - Cleanup strategy (dropdown: LRU, Oldest first, By source)
      - Clear Thumbnail Cache button (shows size freed)
    - Metadata cache:
      - Limit (dropdown: 10MB, 50MB, 100MB, Unlimited - default: 50MB)
      - Auto-clear older than (dropdown: 30 days, 90 days, 1 year, Never - default: 90 days)
      - Clear Metadata Cache button
    - Preview cache (future feature):
      - Limit (dropdown: 500MB, 1GB, 2GB, 5GB, Unlimited - default: 1GB)
      - Clear Preview Cache button
    - Library backups:
      - Keep last N backups (numeric input: 5-50, default: 10)
      - Manage Backups button (opens dialog with backup list)
    - Cache statistics (read-only displays):
      - Current thumbnail cache size / items
      - Current metadata cache size / items
      - Current preview cache size / items
      - Last cleanup date
    - Auto-cleanup when limit reached (checkbox, default: enabled)
    - Clear All Caches button (master cleanup with confirmation)
  - **Performance Controls**:
    - Performance preset (dropdown: Low-end PC, Balanced, High-performance, Custom - default: Balanced)
    - Concurrent Operations:
      - Max FFmpeg/FFprobe processes (dropdown: 1, 2, 4, 8 - default: 4)
      - Max thumbnail tasks (dropdown: 1, 2, 4, 8 - default: 2, requires P2 "Video Thumbnail Generation")
    - Background Operations (requires P1 "Background Refresh"):
      - Scan interval when minimized (dropdown: Immediate, 5min, 30min, Hourly, Disabled - default: 30min)
      - CPU priority (dropdown: Low, Normal, High - default: Low)
      - Pause on low battery (checkbox, default: enabled)
      - Pause when apps fullscreen (checkbox, default: disabled)
    - Network Drives:
      - Operation timeout (dropdown: 5s, 10s, 30s, 60s - default: 10s)
      - Retry attempts (dropdown: 0, 1, 3, 5 - default: 3)
      - Skip thumbnails on network (checkbox, default: enabled)
      - Cache file checks (dropdown: 30s, 1min, 5min, Never - default: 1min)
    - Library Panel (requires P1 "Library Panel Virtualization" - ✅ Completed):
      - Pre-render items (dropdown: 10, 20, 50, 100 - default: 20)
      - Render batch size (dropdown: 5, 10, 20, 50 - default: 10)
      - Scroll buffer (dropdown: 250px, 500px, 1000px - default: 500px)
    - Memory:
      - Cache strategy (dropdown: Keep all, Unload inactive - default: Keep all)
      - Force GC after operations (checkbox, default: enabled)
      - Video buffer size (dropdown: Auto, 512KB, 1MB, 2MB, 4MB - default: Auto)
    - UI Rendering:
      - Hardware acceleration (dropdown: Auto, Enabled, Disabled - default: Auto)
      - Frame rate limit (dropdown: 30, 60, 120 FPS, Unlimited - default: 60 FPS)
      - Smooth scrolling (checkbox, default: enabled)
      - Reduce animations on battery (checkbox, default: enabled)
  - **Add to Settings Dialog** (requires P2 "Centralized Settings Dialog"):
    - Add to Advanced tab → Advanced Settings section (combines cache and performance)
    - Reset to Defaults button (for entire Advanced Settings section)
- **Notes**:
  - Most users should use default settings (balanced performance)
  - Performance presets auto-configure all settings (Custom allows manual tuning)
  - Concurrent operations: Critical for scan performance with large libraries
  - Network optimizations: Essential for users with NAS/network storage
  - Background throttling: Prevents app from hogging resources when not in focus
  - Memory settings: Useful for users with 8GB RAM or less
  - UI rendering: Hardware acceleration issues rare but possible on older GPUs
  - Cache management helps users control disk space usage
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

### Enhanced Random Selection Modes

- **Priority**: P2
- **Impact**: Medium - Fixes semi-random behavior and provides better distribution
- **Description**: Enhance random selection algorithm and add multiple randomization modes to address current "semi-random" behavior where multiple items from the same folder are frequently selected consecutively. Provides better distribution across the library and multiple modes for different preferences.
- **Implementation**:
  - **Fix current random algorithm**: Improve random seed/algorithm to ensure true randomization and better distribution
  - Add "Randomization Mode" setting (single dropdown in Settings or playback controls):
    - **Pure Random** (fixed): True random selection with improved distribution algorithm to avoid folder clustering
    - **Weighted Random**: Favor less-played videos (probability inversely proportional to play count) - helps discover forgotten content
    - **Smart Shuffle**: Play all eligible videos once before repeating (like Spotify) - ensures all content is seen before repeats
    - **Spread Mode**: Prefer items from different folders/paths - actively avoids consecutive items from same directory
    - **Weighted with Spread**: Combine weighted random with folder-aware distribution
  - Fix folder clustering issue in current algorithm:
    - Track recently selected folders/paths
    - Bias selection away from recently selected folders
    - Implement proper shuffle algorithm that distributes across directory structure
  - Store mode preference in settings
  - Update queue building logic in `BuildQueue()` based on selected mode
  - Show current mode in status or tooltip
  - All modes respect current filters (favorites, tags, duration, etc.)
- **Notes**: The current random selection appears to be "semi-random" due to folder clustering. This enhancement addresses the root cause while providing multiple modes for different use cases. Spread Mode is particularly important for large libraries organized in folders to ensure better variety in selections.

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

### Face Detection for Photos

- **Priority**: P3
- **Impact**: Low - Useful for photo library organization
- **Description**: Add face detection capabilities for photo libraries. Could enable tagging photos by detected faces or filtering/searching by faces. Useful for users with large photo collections organized by people.
- **Implementation**:
  - Research and select face detection library (OpenCV, ML.NET, or other .NET-compatible solution)
  - Add face detection during photo import or on-demand
  - Store face data in `LibraryItem` (coordinates, confidence scores)
  - Optional: Face recognition (identify specific people) - more complex
  - UI integration:
    - Show detected faces in photo preview (bounding boxes overlay)
    - Filter/search by detected faces (if face recognition implemented)
    - Tag photos with detected face tags
  - Performance considerations:
    - Face detection is CPU-intensive, should be async/background operation
    - Consider caching detection results
    - Option to enable/disable face detection (default: disabled)
- **Notes**: Low priority enhancement. Face detection libraries may require additional dependencies and could significantly impact import performance. Start with basic detection before considering recognition. Most useful for users with large photo collections focused on people/events.

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

- ✅ **Enhanced Library Statistics Panel** - Context-aware stats panel with media type support (Completed 2026-01-04)
  - Renamed "Current Video" section to "Current File" for consistency with photo support
  - Added context-aware visibility: video-specific stats (duration, audio, loudness, peak) automatically hidden for photos
  - Renamed UpdateCurrentVideoStatsUi() to UpdateCurrentFileStatsUi() for clarity
  - Stats panel now adapts display based on MediaType (Video/Photo)
- ✅ **Batch Operations in Library Panel** - Multi-select support with batch operations (Completed 2026-01-03)
  - Multi-select with Ctrl+Click, Shift+Click support
  - Context menu with batch operations: Add/Remove from Favorites, Add/Remove from Blacklist, Add/Remove Tags, Remove from Library, Clear Playback Stats
  - Selection tracking that persists across filter changes
  - Filter/selection count display
  - Enhanced ItemTagsDialog for batch tagging with color-coded UI
  - RemoveItemsDialog confirmation dialog
- ✅ **Library Backup System** - Automatic library backup system with configurable settings to prevent data loss during testing and development (Completed 2025-12-29)
  - Backups created automatically at program exit (before saving library)
  - Configurable settings: Enable/disable backups, minimum backup gap (1-60 minutes), number of backups to keep (1-30)
  - Smart backup retention: During testing (frequent restarts < min gap), replaces most recent backup; during normal use (>= min gap), rotates oldest backup
  - Backup files stored in {AppData}/ReelRoulette/backups/ with timestamp naming: library.json.backup.YYYY-MM-DD_HH-MM-SS
  - Settings available in General tab of Settings dialog
  - All backup operations logged; failures don't prevent library save
  - Prevents data loss during frequent testing by preserving older backups when creating backups too soon
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
