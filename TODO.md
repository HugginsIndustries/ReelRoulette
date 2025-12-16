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

### Library Panel Virtualization

- **Priority**: P1
- **Impact**: High - Critical for users with large libraries (10,000+ videos)
- **Description**: Implement virtualization in the Library panel to handle very large libraries efficiently. Currently, loading 10,000+ videos causes 5-10 second lag, UI freezing, and scrolling stutters because all items are rendered at once.
- **Implementation**:
  - Replace `ItemsControl` with `VirtualizingStackPanel` or custom virtualized control
  - Only render visible items in viewport (~20-50 items at a time)
  - Recycle visual containers as user scrolls
  - Maintain current functionality: search, sort, filters, multi-column layout
  - Test with 50,000+ item libraries to ensure consistent performance
  - Preserve item selection and keyboard navigation
- **Notes**: This is blocking feature for users with large video collections (anime fans, content creators, archivists). A 50,000 item list should perform identically to a 50 item list.

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

---

## P3 - Low Priority

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
