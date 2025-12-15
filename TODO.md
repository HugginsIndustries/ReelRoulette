# TODO

## Future Improvements (from playback_audio_stats_and_scan_status plan)

### Enhanced Logging for Loudness/Duration Scanning

- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Add comprehensive logging that distinguishes between different types of scan results.
- **Implementation**:
  - **Informational**: "File has no audio stream" (not an error, successful scan of silent video)
  - **Warning**: "Failed to scan file: [reason]" (genuine error but non-fatal, e.g., I/O failure, timeout)
  - **Error**: "Critical scan failure: [reason]" (should be rare, e.g., ffmpeg crash, corrupted file)
- **Note**: The classification improvements (separate counters for no-audio vs errors) make it easier to add logging later.

## Future Enhancements (from Library Refactor plan)

### Library Panel Virtualization

- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Implement virtualization in the Library panel ItemsControl to handle very large libraries (10,000+ items) efficiently.
- **Implementation**:
  - Replace ItemsControl with virtualized control (e.g., DataGrid or custom virtualized list)
  - Only render visible items in the viewport
  - Implement efficient scrolling and item loading
  - Maintain current functionality (search, sort, filters) with virtualization

### Background Refresh of Imported Sources

- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Automatically detect and add new files in imported source folders without requiring manual re-import.
- **Implementation**:
  - Add file system watcher for each imported source
  - Periodically scan source folders for new files
  - Automatically create LibraryItems for new files found
  - Optionally remove LibraryItems for files that no longer exist
  - Show notification when new files are detected

### Tag Categories or Hierarchies

- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Extend the tags system to support categories or hierarchical organization of tags.
- **Implementation**:
  - Add tag category/group concept
  - Allow tags to be organized in hierarchies (parent/child relationships)
  - Update tag management UI to show categories/hierarchies
  - Update tag filtering to support category-based filtering
  - Maintain backward compatibility with flat tag structure

### Smart Playlists Based on Filters

- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Allow users to save filter configurations as named playlists that can be quickly applied.
- **Implementation**:
  - Add playlist storage (could extend FilterState or create separate Playlist model)
  - Add playlist management UI (create, edit, delete playlists)
  - Allow users to save current FilterState as a playlist
  - Allow users to quickly apply a saved playlist (loads FilterState)
  - Display playlists in Library panel or separate playlist panel

### Export/Import Library Index

- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Allow users to export their library index (sources and items) to a file and import it on another machine or as a backup.
- **Implementation**:
  - Add "Export Library..." menu item in Library menu
  - Export library.json to user-selected location
  - Add "Import Library..." menu item in Library menu
  - Import library.json from user-selected location
  - Handle conflicts (merge vs replace options)
  - Optionally export/import filter state and tags as well
