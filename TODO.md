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

### Web Remote Tag Editing (API-First, Desktop-Parity)

- **Priority**: P1
- **Milestone Link**: `M6a - P1 Feature Alignment Through API (Web Tag Editing)` in `MILESTONES.md`
- **Impact**: High - Delivers desktop-equivalent tag editing from web remote and establishes reusable API/core seams for multi-client architecture.
- **Description**: Implement full-screen web tag editing with strict functional parity to desktop `ItemTagsDialog`, while moving tag logic and mutation flows into Core + Server APIs so desktop and web both act as clients.
- **Implementation**:
  - **Core-first extraction**:
    - Move shared tag/preset/category mutation logic into `ReelRoulette.Core` services (no Avalonia/UI dependencies).
    - Keep desktop `ItemTagsDialog` as source-of-truth behavior while replacing direct mutation paths with calls into shared core services.
  - **API contract (batch-ready from day 1)**:
    - Define OpenAPI-backed tag endpoints that accept `itemIds: string[]` (initial web caller can still send current item only).
    - Add endpoints for:
      - editable tag model query (categories/tags/current item state),
      - apply add/remove tag deltas to items,
      - create/rename/move tag and category assignment flows,
      - preset update behavior when tag names change.
    - Concurrency policy: last write wins.
  - **Web UI behavior**:
    - Add tag edit button in media bottom controls between Next and Loop, using desktop-style tag icon/emoji.
    - Open a full-screen editor.
    - Match desktop icon ordering and state colors (`✏️`, `➕`, `➖`; green/orange/violet semantics).
    - Keep responsive chip wrapping while preserving desktop spacing/padding/interaction patterns.
  - **Playback behavior while editing (web only)**:
    - Pause web video playback while editor is open.
    - Suspend photo autoplay progression while editor is open.
    - On close, resume only if media was playing before open; for photos, restart timer only if autoplay was active before open.
  - **Realtime sync**:
    - Emit immediate SSE events for tag/category/item-tag mutations so desktop/web remain in sync without polling delay.
    - Use revisioned events compatible with shared server event model.
  - **Forward compatibility**:
    - Keep API and client state batch-capable to support future web library-view parity.
- **Notes**:
  - Tag editing is always available in web remote (no feature gate).
  - Slight responsive layout differences are acceptable; functional behavior must match desktop exactly.

### Grid View for Library Panel with Thumbnail Generation (Unified Refresh Pipeline)

- **Priority**: P1
- **Milestone Link**: `M6b - P1 Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)` in `MILESTONES.md`
- **Impact**: High - Adds modern visual browsing and consolidates heavy media processing into one background pipeline suitable for headless worker/server architecture.
- **Description**: Add List/Grid view modes and thumbnail generation for all media, then unify source refresh, duration scan, loudness scan, and thumbnail generation into a single sequential background refresh workflow shared by manual and auto refresh.
- **Implementation**:
  - **View modes**:
    - Add global persisted view mode setting (List/Grid).
    - Place view toggle immediately left of `Select filters...` (fader icon) using existing toggle style.
    - Use `🖼️` icon for Grid mode; default remains List (toggle off).
    - Keep List behavior intact and add responsive, virtualized, infinite-scroll-style Grid behavior.
  - **Thumbnail generation (all media)**:
    - Videos: generate thumbnails from midpoint (with midpoint-adjacent fallback), avoiding intro-biased frames.
    - Photos: generate thumbnails via image decode path (no FFmpeg).
    - Cache in app data with size limits + eviction support.
    - Invalidate/regenerate based on content/fingerprint changes; reuse when unchanged.
  - **Unified refresh pipeline**:
    - Sequential stage order:
      1. source refresh
      2. duration scan
      3. loudness scan
      4. thumbnail generation
    - Auto refresh loudness mode: only new/unscanned.
    - Manual refresh runs the same background pipeline as auto refresh.
    - Manual refresh prompts loudness mode (`Only New/Unscanned` vs `Rescan All`) before starting.
    - Manage Sources dialog may be closed while refresh continues.
    - Keep status-line/log progress updates consistent with existing background behavior.
  - **UX simplification**:
    - Remove standalone duration/loudness scan actions after pipeline integration.
    - Keep manual/auto mutual exclusion (skip overlapping runs).
  - **Performance/reliability**:
    - One stage at a time (no overlap between duration/loudness/thumbnail stages).
    - Preserve virtualization/lazy materialization for large libraries in both List and Grid.
    - Keep cancellation/progress throttling aligned with current background architecture.
- **Notes**:
  - This supersedes standalone legacy thumbnail/grid scan TODO scopes.
  - Advanced settings for thumbnail cache/task limits remain relevant and should point to this unified feature.

---

## P2 - Medium Priority

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

---

## P3 - Low Priority

### Mobile Companion App (Preset-Based Remote Player)

- **Priority**: P3
- **Impact**: Medium - Native experience for Android users, reusing web/HTTP infrastructure
- **Description**: Native Android app that connects to the desktop HTTP API and acts as a thin remote player. Desktop remains the authoritative media server and library manager (sources, tags, filters, presets, random selection). The mobile app only selects from existing filter presets and plays media randomly according to those presets, with basic playback controls (play/pause, next, seek) and simple options like Loop and Autoplay.
- **Implementation**:
  - Desktop HTTP API (reuse from P1 Local Web Remote UI):
    - Use the same endpoints (`/api/presets`, `/api/random`, `/api/media/{idOrToken}`) and auth model as the web UI.
  - Android app (thin client):
    - Connection screen to enter desktop IP/hostname, port, and shared token; store in app preferences.
    - Fetch list of presets from `/api/presets` and present as a simple preset picker.
    - Main "Now Playing" screen:
      - Shows current item (title/file name, source, duration, media type icon).
      - Controls: Play/Pause, Next Random (calls `/api/random`), optional Previous (local history only), Seek slider.
      - Toggles: Loop current item, Autoplay next random on end.
    - Use platform-native video player (e.g., ExoPlayer) or .NET MAUI/Avalonia Android player to play `GET /api/media/{idOrToken}` URLs.
    - Handle basic error cases: desktop offline, bad token, network drop; show reconnect UI.
  - Networking/constraints:
    - Assume desktop and phone are on the same LAN; no Internet or NAT traversal required.
    - Document firewall considerations (allow inbound on chosen port on desktop).
    - No library/tag management on mobile; all editing remains desktop-only for simplicity.
- **Notes**: Depends on the P1 Local Web Remote UI’s HTTP API contract. Adds nicer OS-level integration (notifications, lock screen controls, potential casting) but is optional if the browser-based remote works well enough.

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
      - Max thumbnail tasks (dropdown: 1, 2, 4, 8 - default: 2, requires P1 "Grid View for Library Panel with Thumbnail Generation")
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
