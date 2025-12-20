# Changelog

## Unreleased

- **Implement centralized Settings dialog with persistence** (2025-12-19):
  - Add Settings dialog accessible from View → Settings (S) menu or 'S' keyboard shortcut
  - Settings dialog features General (placeholder) and Playback tabs
  - **CRITICAL FIX**: Loop, Auto-play, Mute state, Volume level, and No Repeat settings now persist across app restarts
  - **Mute state and volume level persist directly** - app restores exact volume and mute state from last session
  - Volume level (0-200) now persists between sessions - any volume setting is remembered
  - Consolidate seek step, volume step, and volume normalization settings into Settings dialog
  - Remove redundant submenus from Playback menu (Seek Step, Volume Step, Volume Normalization)
  - Keep "No Repeats Until All Played" and "Set Interval" in Playback menu for quick access
  - Add Apply/OK/Cancel button pattern (consistent with FilterDialog)
  - All playback settings now automatically persist when changed via UI controls or dialog
  - Mute button and volume slider now save state when toggled/changed
  - Add comprehensive Settings dialog with all playback preferences in one location
  - Create SettingsDialog.axaml and SettingsDialog.axaml.cs with WasApplied pattern
  - Extend AppSettings class with LoopEnabled, AutoPlayNext, IsMuted, VolumeLevel, NoRepeatMode fields
  - **Fix keyboard shortcuts not working reliably** - add Focusable="True" to Window
  - Add debug logging to keyboard shortcut handler for diagnostics
  - Remove overly restrictive filtering that blocked shortcuts when buttons had focus
  - **Fix settings sync issue** - prevent recursive SaveSettings calls with _isApplyingSettings flag

- **Fix library panel width not restored on startup** (2025-12-19):
  - Apply saved library panel width in Loaded event handler when panel is visible on startup
  - Ensures width is applied after Grid is fully initialized
  - Fixes issue where panel would use default XAML width instead of user's saved width
  - Previously, width was loaded from settings but not applied during window initialization

- **Fix library panel collapse and size persistence** (2025-12-19):
  - Fix blank area appearing when library panel is hidden via View menu
  - Dynamically clear MinWidth constraint (set to 0) when hiding panel to allow proper collapse
  - Add _libraryPanelWidth field to track panel width independently from Bounds property
  - Capture panel width before hiding to preserve user's resize preference
  - Restore saved width and MinWidth constraint when showing panel again
  - Add GridSplitter DragCompleted event handler to track manual resizing via splitter
  - Update SaveSettings() to capture and save panel width at hide/show time, not just on exit
  - Apply same MinWidth clearing logic to player view mode for consistent behavior

- **Restructure and expand TODO.md**:
  - Add comprehensive priority system (P1/P2/P3) with clear impact definitions
  - Reorganize all TODO items by priority level for better planning
  - Standardize entry format: Title, Priority, Impact, Description, Implementation, Notes
  - Add 11 new proposed features with detailed specifications
  - Move completed features to archive section
  - Add implementation guidelines and contribution workflow
  - Total: 2 P1 items, 7 P2 items, 7 P3 items

- **Fix window state restoration for FullScreen mode**:
  - Add explicit handling for FullScreen state (value 3) in window restoration logic
  - Previously, closing in FullScreen would restore as Normal instead of FullScreen
  - Intentionally restore Minimized state (1) as Normal to avoid starting hidden
  - Add comprehensive logging for all window state restorations

- **Add Source Management UI**:
  - Add comprehensive source management dialog with enable/disable, rename, remove, and refresh functionality
  - Display per-source statistics (video count, total duration, audio/no-audio counts)
  - Add inline enable/disable checkboxes in Library panel source ComboBox
  - Add UpdateSource() and GetSourceStatistics() methods to LibraryService
  - Filter out items from disabled sources in Library panel and playback queue
  - Rebuild queue automatically when source enabled state changes
  - Show empty state message when no sources exist
  - Add "Manage Sources" menu item in Library menu
  - Set default source name to folder name when importing (e.g., "Movies" instead of blank)
  - Fix concurrent library save errors with dedicated save lock and atomic file replace
  - Improve Library panel layout and UX:
    - Remove MaxWidth constraint, make ComboBoxes fill column width evenly
    - Add right margin to items to prevent scrollbar overlap
    - Add text trimming to file names, display full paths
    - Increase MinWidth to 400px and prevent splitter from clipping content
  - Add window state persistence (position, size, maximized state, panel widths):
    - Save and restore window position, size, and maximized state
    - Save and restore Library panel splitter width
    - Set WindowStartupLocation to Manual and Position before window initialization
    - Track position changes with custom _lastKnownPosition field (Avalonia Position property unreliable)
    - Properly handles multi-monitor setups and arbitrary window positions
    - Window always opens exactly as user left it, in the same location
    - Throttle position change logging to once per second to avoid log spam
  - Fix empty state display bug in ManageSourcesDialog

- **Status line stability and scan throttling**:
  - Enforce minimum 1s display for status messages with coalesced updates and logging for delayed/cancelled updates
  - Throttle duration and loudness scan progress updates to once per second while preserving completion messages

- **Fix missing file dialog bugs and UI improvements**:
  - Fix status message overwrite: Remove unconditional status message after library item removal to preserve error messages
  - Fix library item consistency: Clear RelativePath when file is moved outside all sources to prevent data inconsistency
  - Fix save pattern inconsistency: Await library save in HandleLocateFileAsync to match RemoveLibraryItemAsync behavior
  - Fix tags display: Add text wrapping to tags line in stats panel for videos with many tags

- **Add missing file dialog for library management**:
  - Show dialog when video file no longer exists during playback
  - Allow users to remove missing files from library or locate and update file paths
  - Automatically update library item paths when user locates moved files
  - Update source references and relative paths when files are relocated
  - Remove old "Periodic Cleanup of Stale Loudness Stats Entries" TODO (replaced with user-driven solution)

- **UI reorganization and improvements**:
  - Remove Library/Filter Info Row: Moved library information and filter controls into Library panel header
  - Reorganize Library panel: New header layout with library stats, filter summary, unified controls row, and search
  - Unified button styles: Create four consistent button style classes (IconToggleLarge, IconToggleSmall, IconMomentaryLarge, IconMomentarySmall) for all icon buttons throughout the UI
  - Move filter and tags buttons: "Select filters" and "Manage tags for current video" buttons moved to main Controls row for better accessibility
  - Replace checkbox with toggle: "Respect filters" control now uses toggle button style (IconToggleSmall) instead of checkbox
  - Update keyboard shortcuts: Reassign number keys (D1-D8) for view toggles (D1=Menu, D2=Status, D3=Controls, D4=Library Panel, D5=Stats Panel)
  - Add keyboard shortcuts to menus: All menu items now display their keyboard shortcuts in parentheses (e.g., "Show Menu (1)", "Fullscreen (F11)")
  - Status line improvements: Status line always displays a meaningful message, shows "Ready: Library loaded." on startup
  - Remove redundant UI elements: Removed "Remove from view" button, "Auto-play next on end" menu item, "Remember last folder" menu item, redundant "Filter..." menu item
  - Standardize menu naming: All menu items use consistent capitalization and remove ellipses for cleaner appearance
  - Stats panel: Made non-resizable with fixed width, removed movable divider

- **UI improvements and fixes**:
  - Add "Manage tags for current video" button (moved to Controls row)
  - Standardize all icon buttons: Make all buttons square with rounded edges and centered icons
  - Unify filter button styling: Library panel "Filter..." button now matches "Select filters..." button (same icon and style)
  - Fix no-repeat mode: Properly prevent duplicate videos until all eligible videos have been played
  - Improve no-repeat queue logic: Exclude already-queued videos when rebuilding, filter out ineligible items when filters change
  - Performance optimization: Skip File.Exists checks in filtering operations for UI display and queue building (file existence still validated during actual playback)

- **Major: Library Refactor - Transform to library-based system**:
  - Replace folder-based model with persistent library system using `library.json`
  - New unified Library panel replaces separate Favorites, Blacklist, and Recently Played panels
  - Add Library Sources: Import and manage multiple folder sources, enable/disable individual sources
  - Add Tags system: Create and manage tags, assign tags to individual videos, filter by tags (AND/OR logic)
  - Add unified FilterDialog: Single source of truth for all filtering (favorites, blacklist, audio, duration, tags, playback status)
  - Add Library Info Row: Display library statistics and quick access to filter configuration
  - Consolidate data storage: Merge favorites, blacklist, durations, playback stats, loudness stats, and history into `library.json`
  - Consolidate settings: Merge playback settings, view preferences, and filter state into `settings.json`
  - Add one-time data migration: Automatically migrate existing data from legacy JSON files into new library structure
  - Update random playback: Now uses library system with filter state instead of folder scanning
  - Update stats panel: Now calculates from library data, includes tags display for current video
  - Performance improvements: Async library info calculation to prevent UI blocking, optimized filtering operations
  - Remove legacy UI: Old panel toggles, folder selection row, and separate filter controls removed

- **Add comprehensive logging system**:
  - Unified logging: All application logging consolidated into single `last.log` file in AppData directory
  - Logging coverage: Added detailed logging across all major operations:
    - Application startup and initialization
    - Media playback operations (play, pause, stop, seek, volume changes)
    - Library operations (load, save, import, updates)
    - Scanning operations (duration and loudness scans)
    - UI event handlers (button clicks, menu actions, user interactions)
    - File and folder operations
    - Error handling and exception logging
    - State changes (filter updates, queue rebuilds, settings saves)
  - Timestamped entries: All log entries include precise timestamps for debugging
  - Log rotation: `last.log` is overwritten on each application run for easy access to latest session

- **Add audio statistics and scan status improvements**:
  - Distinguish between "no audio" videos (successful scan) and genuine errors during loudness scanning
  - Add separate counters for no-audio files vs errors in scan status messages
  - Improve scan progress updates: update every file with throttling (max once per 100ms) instead of every 50 files
  - Add `HasAudio` property to loudness metadata to track audio presence
  - Add backward compatibility handling for existing loudness stats without `HasAudio` field
  - Fix: Videos with -91.0 dB loudness (placeholder value) now correctly marked as no-audio
  - Add global audio statistics: "Videos with audio" and "Videos without audio" counts in Stats panel
  - Add current video audio stats: "Has audio" status and loudness/peak dB values in Stats panel

- **Add audio filter mode for playback**:
  - New filter modes: Play all, Only with audio, Only without audio
  - Audio filter settings moved to Playback menu
  - Filter persists in playback settings and applies to random/queue selection
  - Direct play actions (favorites, blacklist, etc.) always work regardless of filter mode

- **Improve volume normalization algorithm**:
  - Increase target loudness from -18.0 dB to -16.0 dB for better perceived volume
  - Increase max gain adjustment from ±12.0 dB to ±20.0 dB for very quiet videos
  - Add peak-based limiter to prevent loud videos from exceeding -3.0 dB (prevents clipping/distortion)
  - Use PeakDb data to inform limiting decisions alongside MeanVolumeDb
  - Refactor normalization calculation into single helper method for consistency

- **Add FFmpeg logging window**:
  - New "Show FFmpeg logs" option in View menu
  - Displays detailed FFmpeg execution logs (exit codes, output, results) in separate non-modal window
  - Includes Copy Logs and Clear buttons for debugging loudness scanning issues
  - Auto-refreshes every 2 seconds to show new logs during scanning

- **UI improvements**:
  - Remove "(all libraries)" suffix from global stats labels for cleaner display
  - Add peak dB display to current video stats in Stats panel

- **Add volume normalization system** with four modes:
  - Off: No normalization (direct volume control)
  - Simple: Real-time normalization using LibVLC `normvol` audio filter only
  - Library-aware: Per-file loudness adjustment only (no real-time filter)
  - Advanced: Both per-file loudness adjustment and real-time normalization
- Add loudness scanning feature: scan video library to measure mean volume and peak levels per file
- Add persistent loudness statistics storage (loudnessStats.json)
- Add volume normalization menu controls in Playback menu
- Add "Scan loudness…" option in Library menu for per-file loudness analysis
- Extend NativeBinaryHelper with GetFFmpegPath() for loudness scanning
- Library-aware and Advanced modes automatically adjust volume per-file based on scanned loudness data
- Fix: Switching normalization modes during playback now properly recreates media with correct options
- Fix: Mute button now correctly preserves user volume preference instead of normalized volume value

- **Improve duration scanning reliability**:
  - Replace TagLib# duration scanning with FFprobe for significantly improved reliability (works on virtually all video formats)
  - Fix thread-safety issues in semaphore initialization and permit leak in duration scanning

- **Bundle native dependencies**:
  - Bundle FFprobe and LibVLC native libraries to eliminate external dependencies
  - Add NativeBinaryHelper for platform-aware binary path resolution with caching
  - Add license attribution for bundled third-party components (GPL-3.0, LGPL-2.1)
  
- **Performance improvements**:
  - Move loop restart work off the UI thread to reduce freezes when videos restart
