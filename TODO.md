# TODO

## Future Improvements (from playback_audio_stats_and_scan_status plan)

### Periodic Cleanup of Stale Loudness Stats Entries
- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Periodically prune loudness stats entries for files that no longer exist on disk to keep global stats accurate and prevent the JSON file from growing forever.
- **Implementation**:
  - Add `CleanupLoudnessStats()` method that:
    - Locks `_loudnessStats` dictionary
    - Finds all keys where `!File.Exists(k)`
    - Removes those entries
    - Saves loudness stats
    - Calls `RecalculateGlobalStats()` after cleanup
  - Call this periodically (e.g., on startup, after scans complete, or on a timer)

### Enhanced Logging for Loudness/Duration Scanning
- **Status**: Future enhancement (not required for initial implementation)
- **Description**: Add comprehensive logging that distinguishes between different types of scan results.
- **Implementation**:
  - **Informational**: "File has no audio stream" (not an error, successful scan of silent video)
  - **Warning**: "Failed to scan file: [reason]" (genuine error but non-fatal, e.g., I/O failure, timeout)
  - **Error**: "Critical scan failure: [reason]" (should be rare, e.g., ffmpeg crash, corrupted file)
- **Note**: The classification improvements (separate counters for no-audio vs errors) make it easier to add logging later.
