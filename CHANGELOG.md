# Changelog

## Unreleased
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
- Volume normalization uses target loudness of -18 dB with ±12 dB gain adjustment cap (increased from ±6 dB)
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
