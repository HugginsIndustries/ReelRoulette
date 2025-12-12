# Changelog

## Unreleased
- Replace TagLib# duration scanning with FFprobe for significantly improved reliability (works on virtually all video formats)
- Bundle FFprobe and LibVLC native libraries to eliminate external dependencies
- Add NativeBinaryHelper for platform-aware binary path resolution with caching
- Fix thread-safety issues in semaphore initialization and permit leak in duration scanning
- Add license attribution for bundled third-party components (GPL-3.0, LGPL-2.1)
- Move loop restart work off the UI thread to reduce freezes when videos restart.
