using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;

namespace ReelRoulette
{
    /// <summary>
    /// Service for managing the library index: loading, saving, importing folders, and managing items.
    /// </summary>
    public class LibraryService
    {
        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }
        private static readonly string[] VideoExtensions = 
        {
            ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".mpg", ".mpeg"
        };

        private static readonly string[] PhotoExtensions = 
        {
            // Primary formats (VLC native)
            ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
            // Extended formats (bonus support)
            ".tiff", ".tif", ".heic", ".heif", ".avif", ".ico", ".svg", ".raw", ".cr2", ".nef", ".orf", ".sr2"
        };

        private LibraryIndex _libraryIndex = new LibraryIndex();
        private readonly object _lock = new object();
        private readonly object _saveLock = new object(); // Separate lock for file I/O operations
        private bool _requiresTagMigration = false;
        private readonly FileFingerprintService _fingerprintService = new FileFingerprintService();
        private readonly FingerprintCoordinator _fingerprintCoordinator;
        private DateTime _lastFingerprintProgressStatusUtc = DateTime.MinValue;
        private bool _isDeferredReconcileRunning;
        private bool _needsPostLoadSave;
        private bool _postLoadWorkStarted;
        private int _activeRefreshCount;

        public event Action<FingerprintProgressSnapshot>? FingerprintProgressUpdated;
        public bool IsRefreshRunning => Volatile.Read(ref _activeRefreshCount) > 0;

        public LibraryService()
        {
            _fingerprintCoordinator = new FingerprintCoordinator(
                _fingerprintService,
                Log,
                ApplyFingerprintResultForPath,
                SaveLibrary);
            _fingerprintCoordinator.ProgressUpdated += snapshot =>
            {
                var now = DateTime.UtcNow;
                if ((now - _lastFingerprintProgressStatusUtc).TotalMilliseconds >= 250)
                {
                    _lastFingerprintProgressStatusUtc = now;
                    FingerprintProgressUpdated?.Invoke(snapshot);
                }

                if (!snapshot.IsRunning && snapshot.Pending == 0 && !_isDeferredReconcileRunning)
                {
                    _isDeferredReconcileRunning = true;
                    try
                    {
                        var result = DeferredReconcileAllSources();
                        if (result > 0)
                        {
                            Log($"LibraryService: Deferred reconciliation applied {result} path update(s) after fingerprint queue completion");
                            SaveLibrary();
                        }
                    }
                    finally
                    {
                        _isDeferredReconcileRunning = false;
                    }
                }
            };
        }

        /// <summary>
        /// Gets the current library index.
        /// </summary>
        public LibraryIndex LibraryIndex
        {
            get
            {
                lock (_lock)
                {
                    return _libraryIndex;
                }
            }
        }

        /// <summary>
        /// Gets whether the library requires tag migration from old flat tag format to new category-based format.
        /// </summary>
        public bool RequiresTagMigration
        {
            get
            {
                lock (_lock)
                {
                    return _requiresTagMigration;
                }
            }
        }

        public FingerprintProgressSnapshot GetFingerprintProgressSnapshot()
        {
            return _fingerprintCoordinator.GetSnapshot();
        }

        private void EnsureIdentityAndFingerprintDefaults(LibraryItem item)
        {
            if (string.IsNullOrWhiteSpace(item.Id))
            {
                item.Id = Guid.NewGuid().ToString();
            }

            if (string.IsNullOrWhiteSpace(item.FingerprintAlgorithm))
            {
                item.FingerprintAlgorithm = "SHA-256";
            }

            if (item.FingerprintVersion <= 0)
            {
                item.FingerprintVersion = 1;
            }

            if (string.IsNullOrWhiteSpace(item.Fingerprint))
            {
                item.FingerprintStatus = FingerprintStatus.Pending;
            }
        }

        private void UpdateFileMetadataCache(LibraryItem item)
        {
            try
            {
                if (!File.Exists(item.FullPath))
                {
                    return;
                }

                var info = new FileInfo(item.FullPath);
                var oldSize = item.FileSizeBytes;
                var oldWrite = item.LastWriteTimeUtc;
                item.FileSizeBytes = info.Length;
                item.LastWriteTimeUtc = info.LastWriteTimeUtc;

                if (!string.IsNullOrWhiteSpace(item.Fingerprint) &&
                    (oldSize.HasValue && oldSize.Value != info.Length ||
                     oldWrite.HasValue && oldWrite.Value != info.LastWriteTimeUtc))
                {
                    item.FingerprintStatus = FingerprintStatus.Stale;
                }
            }
            catch
            {
                // Keep stale metadata untouched on failures.
            }
        }

        private string GetFingerprintIndexKey(LibraryItem item)
        {
            var algorithm = string.IsNullOrWhiteSpace(item.FingerprintAlgorithm) ? "SHA-256" : item.FingerprintAlgorithm;
            var version = item.FingerprintVersion <= 0 ? 1 : item.FingerprintVersion;
            return $"{algorithm}:{version}";
        }

        private void RebuildFingerprintIndex()
        {
            var rebuilt = new Dictionary<string, Dictionary<string, List<string>>>(StringComparer.OrdinalIgnoreCase);

            foreach (var item in _libraryIndex.Items)
            {
                if (string.IsNullOrWhiteSpace(item.Fingerprint) || string.IsNullOrWhiteSpace(item.Id))
                {
                    continue;
                }

                var key = GetFingerprintIndexKey(item);
                if (!rebuilt.TryGetValue(key, out var fpMap))
                {
                    fpMap = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
                    rebuilt[key] = fpMap;
                }

                if (!fpMap.TryGetValue(item.Fingerprint!, out var ids))
                {
                    ids = new List<string>();
                    fpMap[item.Fingerprint!] = ids;
                }

                if (!ids.Any(id => string.Equals(id, item.Id, StringComparison.OrdinalIgnoreCase)))
                {
                    ids.Add(item.Id);
                }
            }

            _libraryIndex.FingerprintIndex = rebuilt;
            _libraryIndex.FingerprintIndexVersion = 1;
        }

        private void ApplyFingerprintResultForPath(string fullPath, FileFingerprintResult result)
        {
            lock (_lock)
            {
                var item = _libraryIndex.Items.FirstOrDefault(i =>
                    string.Equals(i.FullPath, fullPath, StringComparison.OrdinalIgnoreCase));
                if (item == null)
                {
                    return;
                }

                item.FingerprintLastUtc = DateTime.UtcNow;

                if (!string.IsNullOrWhiteSpace(result.Error))
                {
                    item.FingerprintStatus = FingerprintStatus.Failed;
                    return;
                }

                item.FileSizeBytes = result.FileSizeBytes;
                item.LastWriteTimeUtc = result.LastWriteTimeUtc;
                if (result.IsStableRead && !string.IsNullOrWhiteSpace(result.Fingerprint))
                {
                    item.Fingerprint = result.Fingerprint;
                    item.FingerprintAlgorithm = "SHA-256";
                    item.FingerprintVersion = 1;
                    item.FingerprintStatus = FingerprintStatus.Ready;
                }
                else
                {
                    item.FingerprintStatus = FingerprintStatus.Pending;
                }

                RebuildFingerprintIndex();
            }
        }

        private void EnqueueFingerprintWorkForStatuses(params FingerprintStatus[] statuses)
        {
            List<string> pathsToQueue;
            lock (_lock)
            {
                var statusSet = new HashSet<FingerprintStatus>(statuses);
                pathsToQueue = _libraryIndex.Items
                    .Where(i => !string.IsNullOrWhiteSpace(i.FullPath) && statusSet.Contains(i.FingerprintStatus))
                    .Select(i => i.FullPath)
                    .ToList();
            }

            if (pathsToQueue.Count > 0)
            {
                _fingerprintCoordinator.EnqueueMany(pathsToQueue);
                Log($"LibraryService: Queued {pathsToQueue.Count} item(s) for background fingerprinting");
            }
        }

        public void StartPostLoadBackgroundWork()
        {
            lock (_lock)
            {
                if (_postLoadWorkStarted)
                {
                    return;
                }
                _postLoadWorkStarted = true;
            }

            Log("LibraryService.StartPostLoadBackgroundWork: Starting...");
            if (_needsPostLoadSave)
            {
                Log("LibraryService.StartPostLoadBackgroundWork: Saving post-load migration updates");
                SaveLibrary();
                _needsPostLoadSave = false;
            }

            EnqueueFingerprintWorkForStatuses(FingerprintStatus.Pending, FingerprintStatus.Stale, FingerprintStatus.Failed);
            Log("LibraryService.StartPostLoadBackgroundWork: Completed");
        }

        private int DeferredReconcileAllSources()
        {
            lock (_lock)
            {
                int reconciled = 0;
                foreach (var source in _libraryIndex.Sources)
                {
                    if (!Directory.Exists(source.RootPath))
                    {
                        continue;
                    }

                    var onDisk = new HashSet<string>(
                        GetVideoFiles(source.RootPath).Concat(GetPhotoFiles(source.RootPath)),
                        StringComparer.OrdinalIgnoreCase);
                    var sourceItems = _libraryIndex.Items.Where(i => i.SourceId == source.Id).ToList();
                    var missing = sourceItems.Where(i => !onDisk.Contains(i.FullPath) && i.FingerprintStatus == FingerprintStatus.Ready && !string.IsNullOrWhiteSpace(i.Fingerprint)).ToList();
                    var presentReady = sourceItems
                        .Where(i => onDisk.Contains(i.FullPath) && i.FingerprintStatus == FingerprintStatus.Ready && !string.IsNullOrWhiteSpace(i.Fingerprint))
                        .ToList();
                    var consumedPresentIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    foreach (var missingItem in missing)
                    {
                        var matchItem = presentReady.FirstOrDefault(candidate =>
                            !consumedPresentIds.Contains(candidate.Id) &&
                            !string.Equals(candidate.Id, missingItem.Id, StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(candidate.Fingerprint, missingItem.Fingerprint, StringComparison.OrdinalIgnoreCase));
                        if (matchItem == null)
                        {
                            continue;
                        }

                        missingItem.FullPath = matchItem.FullPath;
                        missingItem.RelativePath = GetRelativePath(source.RootPath, matchItem.FullPath);
                        missingItem.FileName = Path.GetFileName(matchItem.FullPath);
                        UpdateFileMetadataCache(missingItem);
                        _libraryIndex.Items.Remove(matchItem);
                        consumedPresentIds.Add(matchItem.Id);
                        reconciled++;
                    }
                }

                if (reconciled > 0)
                {
                    RebuildFingerprintIndex();
                }

                return reconciled;
            }
        }

        /// <summary>
        /// Loads the library index from disk.
        /// </summary>
        public void LoadLibrary()
        {
            Log("LibraryService.LoadLibrary: Starting...");
            try
            {
                var path = AppDataManager.GetLibraryIndexPath();
                Log($"LibraryService.LoadLibrary: Path = {path}");
                
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    Log($"LibraryService.LoadLibrary: File exists, JSON length = {json.Length} characters");
                    
                    var index = JsonSerializer.Deserialize<LibraryIndex>(json);
                    if (index != null)
                    {
                        bool needsSaveAfterMigration = false;
                        lock (_lock)
                        {
                            _libraryIndex = index;

                            foreach (var item in _libraryIndex.Items)
                            {
                                var hadId = !string.IsNullOrWhiteSpace(item.Id);
                                var oldStatus = item.FingerprintStatus;
                                EnsureIdentityAndFingerprintDefaults(item);

                                if (!hadId || oldStatus != item.FingerprintStatus)
                                {
                                    needsSaveAfterMigration = true;
                                }
                            }

                            RebuildFingerprintIndex();
                            
                            // Check if migration is needed: old format has AvailableTags but not Categories/Tags
                            _requiresTagMigration = (index.AvailableTags != null && index.AvailableTags.Count > 0) &&
                                                    (index.Categories == null || index.Categories.Count == 0) &&
                                                    (index.Tags == null || index.Tags.Count == 0);
                            
                            if (_requiresTagMigration)
                            {
                                Log($"LibraryService.LoadLibrary: Migration required - Found {index.AvailableTags?.Count ?? 0} flat tags that need to be categorized");
                            }
                            else if (index.Categories != null && index.Tags != null)
                            {
                                Log($"LibraryService.LoadLibrary: Using new tag format - {index.Categories.Count} categories, {index.Tags.Count} tags");
                            }
                            else
                            {
                                Log("LibraryService.LoadLibrary: No tags found in library");
                            }
                        }
                        Log($"LibraryService.LoadLibrary: Successfully loaded library - {index.Items.Count} items, {index.Sources.Count} sources");

                        if (needsSaveAfterMigration)
                        {
                            Log("LibraryService.LoadLibrary: Migration updates detected; scheduling save for post-load background work");
                            _needsPostLoadSave = true;
                        }
                    }
                    else
                    {
                        Log("LibraryService.LoadLibrary: File exists but deserialization returned null, using empty library");
                    }
                }
                else
                {
                    Log("LibraryService.LoadLibrary: File does not exist, using empty library");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryService.LoadLibrary: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryService.LoadLibrary: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"LibraryService.LoadLibrary: ERROR - Inner exception: {ex.InnerException.Message}");
                }
                // Continue with empty library
            }
        }

        /// <summary>
        /// Saves the library index to disk.
        /// </summary>
        public void SaveLibrary()
        {
            Log("LibraryService.SaveLibrary: Starting...");
            
            // Use a dedicated lock for file I/O to prevent concurrent writes
            lock (_saveLock)
            {
                try
                {
                    var path = AppDataManager.GetLibraryIndexPath();
                    LibraryIndex indexToSave;
                    lock (_lock)
                    {
                        indexToSave = _libraryIndex;
                    }
                    
                    Log($"LibraryService.SaveLibrary: Saving {indexToSave.Items.Count} items, {indexToSave.Sources.Count} sources to {path}");

                    var options = new JsonSerializerOptions
                    {
                        WriteIndented = true
                    };
                    var json = JsonSerializer.Serialize(indexToSave, options);
                    Log($"LibraryService.SaveLibrary: Serialized to JSON, length = {json.Length} characters");
                    
                    // Write to a temp file first, then move it to prevent corruption
                    var tempPath = path + ".tmp";
                    File.WriteAllText(tempPath, json);
                    
                    // Replace the old file with the new one atomically
                    File.Move(tempPath, path, true);
                    Log($"LibraryService.SaveLibrary: Successfully saved library to {path}");
                }
                catch (Exception ex)
                {
                    Log($"LibraryService.SaveLibrary: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"LibraryService.SaveLibrary: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"LibraryService.SaveLibrary: ERROR - Inner exception: {ex.InnerException.Message}");
                    }
                    throw;
                }
            }
        }

        /// <summary>
        /// Creates a backup of the library if needed, based on backup settings.
        /// </summary>
        /// <param name="backupEnabled">Whether backups are enabled</param>
        /// <param name="minimumGapMinutes">Minimum time gap in minutes between backups</param>
        /// <param name="numberOfBackups">Maximum number of backups to keep</param>
        public void CreateBackupIfNeeded(bool backupEnabled, int minimumGapMinutes, int numberOfBackups)
        {
            Log("LibraryService.CreateBackupIfNeeded: Starting...");
            
            if (!backupEnabled)
            {
                Log("LibraryService.CreateBackupIfNeeded: Backup is disabled, skipping");
                return;
            }

            try
            {
                var backupDir = AppDataManager.GetBackupDirectoryPath();
                var backupFiles = GetBackupFiles(backupDir);
                var lastBackupTime = GetLastBackupTime(backupFiles);
                
                // Calculate time since last backup (or TimeSpan.MaxValue if no previous backup)
                var timeSinceLastBackup = lastBackupTime.HasValue 
                    ? DateTime.Now - lastBackupTime.Value 
                    : TimeSpan.MaxValue;
                
                Log($"LibraryService.CreateBackupIfNeeded: Current backup count: {backupFiles.Count}, Time since last backup: {(timeSinceLastBackup == TimeSpan.MaxValue ? "N/A (no previous backup)" : $"{timeSinceLastBackup.TotalMinutes:F1} minutes")}");
                
                // If at limit, determine which backup to delete
                if (backupFiles.Count >= numberOfBackups)
                {
                    var minimumGap = TimeSpan.FromMinutes(minimumGapMinutes);
                    
                    if (timeSinceLastBackup < minimumGap)
                    {
                        // Last backup was too soon, replace it
                        Log($"LibraryService.CreateBackupIfNeeded: Last backup was {timeSinceLastBackup.TotalMinutes:F1} minutes ago (less than {minimumGapMinutes} minutes), deleting most recent backup");
                        DeleteMostRecentBackup(backupFiles);
                    }
                    else
                    {
                        // Normal rotation, delete oldest
                        Log($"LibraryService.CreateBackupIfNeeded: Last backup was {timeSinceLastBackup.TotalMinutes:F1} minutes ago (>= {minimumGapMinutes} minutes), deleting oldest backup");
                        DeleteOldestBackup(backupFiles);
                    }
                }
                
                // Always create new backup (if enabled)
                CreateBackup(backupDir);
                Log("LibraryService.CreateBackupIfNeeded: Backup created successfully");
            }
            catch (Exception ex)
            {
                Log($"LibraryService.CreateBackupIfNeeded: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryService.CreateBackupIfNeeded: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"LibraryService.CreateBackupIfNeeded: ERROR - Inner exception: {ex.InnerException.Message}");
                }
                // Don't throw - backup failures shouldn't prevent library save
            }
        }

        /// <summary>
        /// Gets a list of backup files sorted by creation time (oldest first).
        /// </summary>
        private List<FileInfo> GetBackupFiles(string backupDir)
        {
            try
            {
                if (!Directory.Exists(backupDir))
                {
                    return new List<FileInfo>();
                }

                var backupFiles = Directory.GetFiles(backupDir, "library.json.backup.*")
                    .Select(f => new FileInfo(f))
                    .OrderBy(f => f.CreationTime)
                    .ToList();
                
                Log($"LibraryService.GetBackupFiles: Found {backupFiles.Count} backup files");
                return backupFiles;
            }
            catch (Exception ex)
            {
                Log($"LibraryService.GetBackupFiles: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                return new List<FileInfo>();
            }
        }

        /// <summary>
        /// Gets the creation time of the most recent backup, or null if none exists.
        /// </summary>
        private DateTime? GetLastBackupTime(List<FileInfo> backupFiles)
        {
            if (backupFiles == null || backupFiles.Count == 0)
            {
                return null;
            }

            // Files are sorted oldest first, so get the last one
            return backupFiles[backupFiles.Count - 1].CreationTime;
        }

        /// <summary>
        /// Deletes the oldest backup file.
        /// </summary>
        private void DeleteOldestBackup(List<FileInfo> backupFiles)
        {
            if (backupFiles == null || backupFiles.Count == 0)
            {
                return;
            }

            try
            {
                var oldestBackup = backupFiles[0];
                File.Delete(oldestBackup.FullName);
                backupFiles.RemoveAt(0);
                Log($"LibraryService.DeleteOldestBackup: Deleted oldest backup: {oldestBackup.Name}");
            }
            catch (Exception ex)
            {
                Log($"LibraryService.DeleteOldestBackup: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Deletes the most recent backup file.
        /// </summary>
        private void DeleteMostRecentBackup(List<FileInfo> backupFiles)
        {
            if (backupFiles == null || backupFiles.Count == 0)
            {
                return;
            }

            try
            {
                // Files are sorted oldest first, so get the last one
                var mostRecentBackup = backupFiles[backupFiles.Count - 1];
                File.Delete(mostRecentBackup.FullName);
                backupFiles.RemoveAt(backupFiles.Count - 1);
                Log($"LibraryService.DeleteMostRecentBackup: Deleted most recent backup: {mostRecentBackup.Name}");
            }
            catch (Exception ex)
            {
                Log($"LibraryService.DeleteMostRecentBackup: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Creates a new backup file with timestamp.
        /// </summary>
        private void CreateBackup(string backupDir)
        {
            try
            {
                var sourcePath = AppDataManager.GetLibraryIndexPath();
                
                if (!File.Exists(sourcePath))
                {
                    Log("LibraryService.CreateBackup: Source library file does not exist, skipping backup");
                    return;
                }

                var timestamp = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
                var backupFileName = $"library.json.backup.{timestamp}";
                var backupPath = Path.Combine(backupDir, backupFileName);
                
                // Copy the library file to the backup location
                File.Copy(sourcePath, backupPath, true);
                Log($"LibraryService.CreateBackup: Created backup: {backupFileName}");
            }
            catch (Exception ex)
            {
                Log($"LibraryService.CreateBackup: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Imports a folder and scans for video files, creating LibraryItems.
        /// Preserves existing metadata for files that already exist in the library.
        /// </summary>
        /// <param name="rootPath">Absolute path to the folder to import.</param>
        /// <param name="displayName">Optional custom display name for the source.</param>
        /// <returns>The number of files imported.</returns>
        public int ImportFolder(string rootPath, string? displayName = null)
        {
            Log($"LibraryService.ImportFolder: Starting - rootPath = {rootPath}, displayName = {displayName ?? "null"}");
            
            if (!Directory.Exists(rootPath))
            {
                Log($"LibraryService.ImportFolder: ERROR - Directory not found: {rootPath}");
                throw new DirectoryNotFoundException($"Directory not found: {rootPath}");
            }

            lock (_lock)
            {
                Log("LibraryService.ImportFolder: Acquired lock, scanning for video files...");
                // Find or create the source
                var source = _libraryIndex.Sources.FirstOrDefault(s => 
                    string.Equals(s.RootPath, rootPath, StringComparison.OrdinalIgnoreCase));

                if (source == null)
                {
                    source = new LibrarySource
                    {
                        Id = Guid.NewGuid().ToString(),
                        RootPath = rootPath,
                        DisplayName = displayName,
                        IsEnabled = true
                    };
                    _libraryIndex.Sources.Add(source);
                }
                else
                {
                    // Update display name if provided
                    if (!string.IsNullOrEmpty(displayName))
                    {
                        source.DisplayName = displayName;
                    }
                }

                // Scan for media files (videos and photos)
                var videoFiles = GetVideoFiles(rootPath);
                var photoFiles = GetPhotoFiles(rootPath);
                var allMediaFiles = videoFiles.Concat(photoFiles).ToArray();
                Log($"LibraryService.ImportFolder: Found {videoFiles.Length} video files and {photoFiles.Length} photo files");
                
                int importedCount = 0;
                int updatedCount = 0;

                foreach (var filePath in allMediaFiles)
                {
                    // Check if item already exists
                    var existingItem = _libraryIndex.Items.FirstOrDefault(i =>
                        string.Equals(i.FullPath, filePath, StringComparison.OrdinalIgnoreCase));

                    if (existingItem != null)
                    {
                        EnsureIdentityAndFingerprintDefaults(existingItem);
                        // Update source reference if it changed
                        if (existingItem.SourceId != source.Id)
                        {
                            existingItem.SourceId = source.Id;
                        }
                        // Preserve existing metadata (favorites, blacklist, stats, tags, duration, etc.)
                        // Just update path info in case file moved
                        existingItem.FullPath = filePath;
                        existingItem.RelativePath = GetRelativePath(rootPath, filePath);
                        existingItem.FileName = Path.GetFileName(filePath);
                        // Update MediaType based on current file extension (may have changed or was incorrect before photo support)
                        var extension = Path.GetExtension(filePath).ToLowerInvariant();
                        existingItem.MediaType = VideoExtensions.Contains(extension) ? MediaType.Video : MediaType.Photo;
                        UpdateFileMetadataCache(existingItem);
                        updatedCount++;
                    }
                    else
                    {
                        // Determine media type by extension
                        var extension = Path.GetExtension(filePath).ToLowerInvariant();
                        var mediaType = VideoExtensions.Contains(extension) ? MediaType.Video : MediaType.Photo;

                        // Create new item
                        var newItem = new LibraryItem
                        {
                            Id = Guid.NewGuid().ToString(),
                            SourceId = source.Id,
                            FullPath = filePath,
                            RelativePath = GetRelativePath(rootPath, filePath),
                            FileName = Path.GetFileName(filePath),
                            MediaType = mediaType,
                            IsFavorite = false,
                            IsBlacklisted = false,
                            PlayCount = 0,
                            Tags = new List<string>(),
                            FingerprintAlgorithm = "SHA-256",
                            FingerprintVersion = 1,
                            FingerprintStatus = FingerprintStatus.Pending
                        };
                        UpdateFileMetadataCache(newItem);
                        _libraryIndex.Items.Add(newItem);
                        importedCount++;
                    }
                }

                RebuildFingerprintIndex();
                EnqueueFingerprintWorkForStatuses(FingerprintStatus.Pending, FingerprintStatus.Stale, FingerprintStatus.Failed);
                Log($"LibraryService.ImportFolder: Completed - {importedCount} new items imported, {updatedCount} existing items updated");
                return importedCount;
            }
        }

        /// <summary>
        /// Removes a source and all its items from the library.
        /// </summary>
        public void RemoveSource(string sourceId)
        {
            Log($"LibraryService.RemoveSource: Starting - sourceId = {sourceId}");
            lock (_lock)
            {
                var itemsBefore = _libraryIndex.Items.Count;
                var sourcesBefore = _libraryIndex.Sources.Count;
                
                // Remove all items from this source
                var removedItems = _libraryIndex.Items.RemoveAll(i => i.SourceId == sourceId);
                
                // Remove the source
                var removedSources = _libraryIndex.Sources.RemoveAll(s => s.Id == sourceId);
                
                Log($"LibraryService.RemoveSource: Removed {removedItems} items and {removedSources} sources");
            }
        }

        /// <summary>
        /// Updates a single library item.
        /// Updates properties in place to preserve data integrity and prevent reference disconnection issues.
        /// </summary>
        public void UpdateItem(LibraryItem item)
        {
            if (item == null)
            {
                Log("LibraryService.UpdateItem: ERROR - item is null");
                throw new ArgumentNullException(nameof(item));
            }

            lock (_lock)
            {
                EnsureIdentityAndFingerprintDefaults(item);

                var existingIndex = _libraryIndex.Items.FindIndex(i =>
                    (!string.IsNullOrWhiteSpace(item.Id) && string.Equals(i.Id, item.Id, StringComparison.OrdinalIgnoreCase)) ||
                    string.Equals(i.FullPath, item.FullPath, StringComparison.OrdinalIgnoreCase));

                if (existingIndex >= 0)
                {
                    // Update properties in place instead of replacing the reference
                    // This ensures data integrity and prevents reference disconnection issues
                    var existingItem = _libraryIndex.Items[existingIndex];
                    existingItem.SourceId = item.SourceId;
                    existingItem.FullPath = item.FullPath;
                    existingItem.RelativePath = item.RelativePath;
                    existingItem.FileName = item.FileName;
                    existingItem.MediaType = item.MediaType;
                    existingItem.Duration = item.Duration;
                    existingItem.HasAudio = item.HasAudio;
                    existingItem.IntegratedLoudness = item.IntegratedLoudness;
                    existingItem.PeakDb = item.PeakDb;
                    existingItem.IsFavorite = item.IsFavorite;
                    existingItem.IsBlacklisted = item.IsBlacklisted;
                    existingItem.PlayCount = item.PlayCount;
                    existingItem.LastPlayedUtc = item.LastPlayedUtc;
                    existingItem.Id = item.Id;
                    existingItem.Fingerprint = item.Fingerprint;
                    existingItem.FingerprintAlgorithm = item.FingerprintAlgorithm;
                    existingItem.FingerprintVersion = item.FingerprintVersion;
                    existingItem.FileSizeBytes = item.FileSizeBytes;
                    existingItem.LastWriteTimeUtc = item.LastWriteTimeUtc;
                    existingItem.FingerprintLastUtc = item.FingerprintLastUtc;
                    existingItem.FingerprintStatus = item.FingerprintStatus;
                    if (item.Tags != null)
                    {
                        existingItem.Tags = item.Tags;
                    }
                    Log($"LibraryService.UpdateItem: Updated existing item - {Path.GetFileName(item.FullPath)}");
                }
                else
                {
                    _libraryIndex.Items.Add(item);
                    Log($"LibraryService.UpdateItem: Added new item - {Path.GetFileName(item.FullPath)}");
                }

                RebuildFingerprintIndex();
            }
        }

        /// <summary>
        /// Removes a library item by its full path.
        /// </summary>
        public void RemoveItem(string fullPath)
        {
            if (string.IsNullOrEmpty(fullPath))
            {
                Log("LibraryService.RemoveItem: ERROR - fullPath is null or empty");
                throw new ArgumentException("Full path cannot be null or empty", nameof(fullPath));
            }

            lock (_lock)
            {
                var item = _libraryIndex.Items.FirstOrDefault(i =>
                    string.Equals(i.FullPath, fullPath, StringComparison.OrdinalIgnoreCase));

                if (item != null)
                {
                    _libraryIndex.Items.Remove(item);
                    Log($"LibraryService.RemoveItem: Removed item - {Path.GetFileName(fullPath)}");
                }
                else
                {
                    Log($"LibraryService.RemoveItem: Item not found for path: {fullPath}");
                }
            }
        }

        /// <summary>
        /// Gets all items, optionally filtered by source.
        /// </summary>
        public IEnumerable<LibraryItem> GetItemsBySource(string? sourceId = null)
        {
            lock (_lock)
            {
                if (sourceId == null)
                {
                    return _libraryIndex.Items.ToList();
                }
                return _libraryIndex.Items.Where(i => i.SourceId == sourceId).ToList();
            }
        }

        /// <summary>
        /// Finds a library item by its full path.
        /// </summary>
        public LibraryItem? FindItemByPath(string fullPath)
        {
            lock (_lock)
            {
                return _libraryIndex.Items.FirstOrDefault(i =>
                    string.Equals(i.FullPath, fullPath, StringComparison.OrdinalIgnoreCase));
            }
        }

        /// <summary>
        /// Refreshes a source by re-scanning its folder for new/deleted files.
        /// </summary>
        public RefreshResult RefreshSource(string sourceId, IProgress<RefreshProgress>? progress = null)
        {
            Log($"LibraryService.RefreshSource: Starting - sourceId = {sourceId}");
            void Report(string phase, string message, int current = 0, int total = 0)
            {
                progress?.Report(new RefreshProgress
                {
                    Phase = phase,
                    Message = message,
                    Current = current,
                    Total = total
                });
            }

            Interlocked.Increment(ref _activeRefreshCount);
            try
            {
                lock (_lock)
                {
                    var source = _libraryIndex.Sources.FirstOrDefault(s => s.Id == sourceId);
                    if (source == null)
                    {
                        Log($"LibraryService.RefreshSource: ERROR - Source not found: {sourceId}");
                        throw new ArgumentException($"Source not found: {sourceId}", nameof(sourceId));
                    }

                    Log($"LibraryService.RefreshSource: Source found - {source.RootPath}");
                    
                    if (!Directory.Exists(source.RootPath))
                    {
                        Log($"LibraryService.RefreshSource: ERROR - Source directory not found: {source.RootPath}");
                        throw new DirectoryNotFoundException($"Source directory not found: {source.RootPath}");
                    }
                    
                    Log("LibraryService.RefreshSource: Scanning for media files...");
                    Report("Scan", "Scanning source files...");

                // Get current files on disk (videos and photos)
                var videoFiles = GetVideoFiles(source.RootPath);
                var photoFiles = GetPhotoFiles(source.RootPath);
                var allMediaFilesOnDisk = new HashSet<string>(
                    videoFiles.Concat(photoFiles),
                    StringComparer.OrdinalIgnoreCase);

                // Get current items for this source
                var currentItems = _libraryIndex.Items
                    .Where(i => i.SourceId == sourceId)
                    .ToList();

                var currentPaths = new HashSet<string>(
                    currentItems.Select(i => i.FullPath),
                    StringComparer.OrdinalIgnoreCase);

                int added = 0;
                int removed = 0;
                int updated = 0;
                int renamed = 0;
                int moved = 0;
                int unresolvedQueued = 0;

                Report("Analyze", "Analyzing path changes...");

                // 1) Build missing/new sets from path diffs only (fast path, no full-library metadata pass)
                var missingItems = currentItems.Where(i => !allMediaFilesOnDisk.Contains(i.FullPath)).ToList();
                var newPaths = allMediaFilesOnDisk.Where(path => !currentPaths.Contains(path)).ToList();
                Report("Analyze", $"Found {missingItems.Count + newPaths.Count} path changes ({missingItems.Count} missing, {newPaths.Count} new)");

                if (missingItems.Count == 0 && newPaths.Count == 0)
                {
                    Report("Done", "Refresh done: no changes detected");
                    return new RefreshResult();
                }

                // 2) Prepare metadata for new paths
                var newPathMediaType = new Dictionary<string, MediaType>(StringComparer.OrdinalIgnoreCase);
                var newPathFileName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var newPathSize = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                var newPathWrite = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
                foreach (var path in newPaths)
                {
                    var extension = Path.GetExtension(path).ToLowerInvariant();
                    var mediaType = VideoExtensions.Contains(extension) ? MediaType.Video : MediaType.Photo;
                    newPathMediaType[path] = mediaType;
                    newPathFileName[path] = Path.GetFileName(path);
                    try
                    {
                        var info = new FileInfo(path);
                        newPathSize[path] = info.Length;
                        newPathWrite[path] = info.LastWriteTimeUtc;
                    }
                    catch
                    {
                    }
                }

                // 4) Candidate matching by exact fingerprint (foreground fingerprinting for accurate refresh)
                var unresolvedMissingItems = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var unresolvedNewPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var candidateNewPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var candidateNewFingerprints = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var consumedNewPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var matchedMissingIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                var missingReady = new List<LibraryItem>();
                foreach (var missing in missingItems)
                {
                    EnsureIdentityAndFingerprintDefaults(missing);
                    if (string.IsNullOrWhiteSpace(missing.Fingerprint) || missing.FingerprintStatus != FingerprintStatus.Ready)
                    {
                        continue;
                    }
                    missingReady.Add(missing);
                }

                foreach (var missing in missingReady)
                {
                    var candidates = newPaths.Where(path =>
                            !consumedNewPaths.Contains(path) &&
                            newPathMediaType.TryGetValue(path, out var mediaType) &&
                            mediaType == missing.MediaType &&
                            (!missing.FileSizeBytes.HasValue || (newPathSize.TryGetValue(path, out var sz) && sz == missing.FileSizeBytes.Value)))
                        .ToList();

                    if (candidates.Count == 0)
                    {
                        continue;
                    }

                    foreach (var candidatePath in candidates)
                    {
                        candidateNewPaths.Add(candidatePath);
                    }
                }

                if (candidateNewPaths.Count > 0)
                {
                    int processed = 0;
                    int totalToFingerprint = candidateNewPaths.Count;
                    foreach (var path in candidateNewPaths)
                    {
                        processed++;
                        Report("Fingerprint", $"Fingerprinting {processed:N0}/{totalToFingerprint:N0}...", processed, totalToFingerprint);

                        var fp = _fingerprintService.ComputeFingerprint(path);
                        if (string.IsNullOrWhiteSpace(fp.Error) && fp.IsStableRead && !string.IsNullOrWhiteSpace(fp.Fingerprint))
                        {
                            candidateNewFingerprints[path] = fp.Fingerprint!;
                        }
                        else
                        {
                            unresolvedNewPaths.Add(path);
                        }
                    }
                }

                Report("Reconcile", "Reconciling moves and renames...");
                var newPathsByFingerprint = candidateNewFingerprints
                    .GroupBy(kvp => kvp.Value, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.Select(kvp => kvp.Key).ToList(), StringComparer.OrdinalIgnoreCase);

                foreach (var missing in missingReady)
                {
                    var matchPath = string.Empty;
                    if (newPathsByFingerprint.TryGetValue(missing.Fingerprint!, out var fingerprintMatches))
                    {
                        foreach (var path in fingerprintMatches)
                        {
                            if (consumedNewPaths.Contains(path))
                            {
                                continue;
                            }

                            if (!newPathMediaType.TryGetValue(path, out var mediaType) || mediaType != missing.MediaType)
                            {
                                continue;
                            }

                            matchPath = path;
                            break;
                        }
                    }

                    if (string.IsNullOrWhiteSpace(matchPath))
                    {
                        var hadCandidates = candidateNewPaths.Any(path =>
                            !consumedNewPaths.Contains(path) &&
                            newPathMediaType.TryGetValue(path, out var mt) &&
                            mt == missing.MediaType &&
                            (!missing.FileSizeBytes.HasValue || (newPathSize.TryGetValue(path, out var sz) && sz == missing.FileSizeBytes.Value)));

                        if (hadCandidates)
                        {
                            unresolvedQueued++;
                            unresolvedMissingItems.Add(missing.FullPath);
                        }
                        continue;
                    }

                    var oldDir = Path.GetDirectoryName(missing.FullPath) ?? string.Empty;
                    var newDir = Path.GetDirectoryName(matchPath) ?? string.Empty;
                    var oldName = Path.GetFileName(missing.FullPath);
                    var newName = Path.GetFileName(matchPath);

                    missing.FullPath = matchPath;
                    missing.RelativePath = GetRelativePath(source.RootPath, matchPath);
                    missing.FileName = newName;
                    missing.SourceId = source.Id;
                    UpdateFileMetadataCache(missing);

                    if (!oldDir.Equals(newDir, StringComparison.OrdinalIgnoreCase))
                    {
                        moved++;
                    }
                    else if (!string.Equals(oldName, newName, StringComparison.OrdinalIgnoreCase))
                    {
                        renamed++;
                    }
                    else
                    {
                        updated++;
                    }

                    matchedMissingIds.Add(missing.Id);
                    consumedNewPaths.Add(matchPath);
                }

                // 5) Apply true add/remove deltas after reconciliation
                foreach (var path in newPaths.Where(path => !consumedNewPaths.Contains(path)))
                {
                    if (unresolvedNewPaths.Contains(path))
                    {
                        unresolvedQueued++;
                        continue;
                    }

                    var mediaType = newPathMediaType[path];
                    var newItem = new LibraryItem
                    {
                        Id = Guid.NewGuid().ToString(),
                        SourceId = source.Id,
                        FullPath = path,
                        RelativePath = GetRelativePath(source.RootPath, path),
                        FileName = newPathFileName[path],
                        MediaType = mediaType,
                        IsFavorite = false,
                        IsBlacklisted = false,
                        PlayCount = 0,
                        Tags = new List<string>(),
                        FingerprintAlgorithm = "SHA-256",
                        FingerprintVersion = 1,
                        FingerprintStatus = FingerprintStatus.Pending
                    };
                    UpdateFileMetadataCache(newItem);
                    if (candidateNewFingerprints.TryGetValue(path, out var fingerprint))
                    {
                        newItem.Fingerprint = fingerprint;
                        newItem.FingerprintStatus = FingerprintStatus.Ready;
                        if (newPathWrite.TryGetValue(path, out var writeUtc))
                        {
                            newItem.LastWriteTimeUtc = writeUtc;
                        }
                        if (newPathSize.TryGetValue(path, out var sizeBytes))
                        {
                            newItem.FileSizeBytes = sizeBytes;
                        }
                        newItem.FingerprintLastUtc = DateTime.UtcNow;
                    }
                    _libraryIndex.Items.Add(newItem);
                    if (newItem.FingerprintStatus != FingerprintStatus.Ready)
                    {
                        _fingerprintCoordinator.Enqueue(path);
                    }
                    added++;
                }

                foreach (var item in missingItems)
                {
                    if (File.Exists(item.FullPath))
                    {
                        continue;
                    }

                    // if unresolved, keep old entry until future refresh/reconcile
                    if (unresolvedMissingItems.Contains(item.FullPath))
                    {
                        continue;
                    }

                    _libraryIndex.Items.Remove(item);
                    removed++;
                }

                RebuildFingerprintIndex();
                Log($"LibraryService.RefreshSource: Completed - Added: {added}, Removed: {removed}, Renamed: {renamed}, Moved: {moved}, Updated: {updated}, UnresolvedQueued: {unresolvedQueued}");
                Report("Done", $"Refresh done: {added} added, {removed} removed, {renamed} renamed, {moved} moved, {updated} updated, {unresolvedQueued} unresolved");
                
                    return new RefreshResult
                    {
                        Added = added,
                        Removed = removed,
                        Updated = updated,
                        Renamed = renamed,
                        Moved = moved,
                        UnresolvedQueued = unresolvedQueued
                    };
                }
            }
            finally
            {
                Interlocked.Decrement(ref _activeRefreshCount);
            }
        }

        /// <summary>
        /// Gets all photo files recursively from a directory.
        /// </summary>
        private string[] GetPhotoFiles(string rootPath)
        {
            Log($"LibraryService.GetPhotoFiles: Starting - rootPath = {rootPath}");
            try
            {
                Log($"LibraryService.GetPhotoFiles: Calling Directory.GetFiles with SearchOption.AllDirectories");
                var allFiles = Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories);
                Log($"LibraryService.GetPhotoFiles: Found {allFiles.Length} total files, filtering for photo extensions");
                
                var photoFiles = allFiles
                    .Where(f => PhotoExtensions.Contains(
                        Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
                
                Log($"LibraryService.GetPhotoFiles: Found {photoFiles.Length} photo files after filtering");
                return photoFiles;
            }
            catch (Exception ex)
            {
                Log($"LibraryService.GetPhotoFiles: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryService.GetPhotoFiles: ERROR - Stack trace: {ex.StackTrace}");
                return Array.Empty<string>();
            }
        }

        /// <summary>
        /// Gets all video files recursively from a directory.
        /// </summary>
        private string[] GetVideoFiles(string rootPath)
        {
            Log($"LibraryService.GetVideoFiles: Starting - rootPath = {rootPath}");
            try
            {
                Log($"LibraryService.GetVideoFiles: Calling Directory.GetFiles with SearchOption.AllDirectories");
                var allFiles = Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories);
                Log($"LibraryService.GetVideoFiles: Found {allFiles.Length} total files, filtering for video extensions");
                
                var videoFiles = allFiles
                    .Where(f => VideoExtensions.Contains(
                        Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
                
                Log($"LibraryService.GetVideoFiles: Found {videoFiles.Length} video files after filtering");
                return videoFiles;
            }
            catch (Exception ex)
            {
                Log($"LibraryService.GetVideoFiles: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryService.GetVideoFiles: ERROR - Stack trace: {ex.StackTrace}");
                return Array.Empty<string>();
            }
        }

        /// <summary>
        /// Gets the relative path from root to file.
        /// </summary>
        private string GetRelativePath(string rootPath, string fullPath)
        {
            if (string.IsNullOrEmpty(rootPath) || string.IsNullOrEmpty(fullPath))
                return string.Empty;

            var rootUri = new Uri(Path.GetFullPath(rootPath) + Path.DirectorySeparatorChar);
            var fileUri = new Uri(Path.GetFullPath(fullPath));
            var relativeUri = rootUri.MakeRelativeUri(fileUri);
            return Uri.UnescapeDataString(relativeUri.ToString().Replace('/', Path.DirectorySeparatorChar));
        }

        /// <summary>
        /// Updates an existing source (for rename, enable/disable operations).
        /// </summary>
        public void UpdateSource(LibrarySource source)
        {
            if (source == null)
            {
                Log("LibraryService.UpdateSource: ERROR - source is null");
                throw new ArgumentNullException(nameof(source));
            }

            lock (_lock)
            {
                var existingIndex = _libraryIndex.Sources.FindIndex(s => s.Id == source.Id);
                if (existingIndex >= 0)
                {
                    _libraryIndex.Sources[existingIndex] = source;
                    Log($"LibraryService.UpdateSource: Updated source - Id: {source.Id}, DisplayName: {source.DisplayName}, IsEnabled: {source.IsEnabled}");
                }
                else
                {
                    Log($"LibraryService.UpdateSource: ERROR - Source not found with Id: {source.Id}");
                    throw new ArgumentException($"Source not found with Id: {source.Id}", nameof(source));
                }
            }
        }

        /// <summary>
        /// Gets statistics for a specific source.
        /// </summary>
        public SourceStatistics GetSourceStatistics(string sourceId)
        {
            Log($"LibraryService.GetSourceStatistics: Starting - sourceId = {sourceId}");
            lock (_lock)
            {
                var items = _libraryIndex.Items.Where(i => i.SourceId == sourceId).ToList();
                var videos = items.Where(i => i.MediaType == MediaType.Video).ToList();
                var photos = items.Where(i => i.MediaType == MediaType.Photo).ToList();
                
                var stats = new SourceStatistics
                {
                    TotalVideos = videos.Count,
                    TotalPhotos = photos.Count,
                    TotalMedia = items.Count,
                    VideosWithAudio = videos.Count(i => i.HasAudio == true),
                    VideosWithoutAudio = videos.Count(i => i.HasAudio == false)
                };

                // Calculate total duration for video items with known durations
                var itemsWithDuration = videos.Where(i => i.Duration.HasValue).ToList();
                if (itemsWithDuration.Any())
                {
                    stats.TotalDuration = TimeSpan.FromTicks(itemsWithDuration.Sum(i => i.Duration!.Value.Ticks));
                    stats.AverageDuration = TimeSpan.FromTicks((long)itemsWithDuration.Average(i => i.Duration!.Value.Ticks));
                }
                else
                {
                    stats.TotalDuration = TimeSpan.Zero;
                    stats.AverageDuration = null;
                }

                Log($"LibraryService.GetSourceStatistics: Completed - TotalVideos: {stats.TotalVideos}, TotalPhotos: {stats.TotalPhotos}, TotalMedia: {stats.TotalMedia}, TotalDuration: {stats.TotalDuration}");
                return stats;
            }
        }

        /// <summary>
        /// Completes the tag migration by converting from old flat format to new category-based format.
        /// Call this after all tags have been assigned categories.
        /// </summary>
        public void CompleteMigration(List<TagCategory> categories, List<Tag> tags)
        {
            Log($"LibraryService.CompleteMigration: Starting - {categories.Count} categories, {tags.Count} tags");
            lock (_lock)
            {
                _libraryIndex.Categories = categories;
                _libraryIndex.Tags = tags;
                _libraryIndex.AvailableTags = null; // Clear old format
                _requiresTagMigration = false;
                Log("LibraryService.CompleteMigration: Migration completed successfully");
            }
        }

        /// <summary>
        /// Adds or updates a tag category.
        /// </summary>
        public void AddOrUpdateCategory(TagCategory category)
        {
            Log($"LibraryService.AddOrUpdateCategory: {category.Name} (Id: {category.Id})");
            lock (_lock)
            {
                if (_libraryIndex.Categories == null)
                {
                    _libraryIndex.Categories = new List<TagCategory>();
                }

                var existingIndex = _libraryIndex.Categories.FindIndex(c => c.Id == category.Id);
                if (existingIndex >= 0)
                {
                    _libraryIndex.Categories[existingIndex] = category;
                    Log($"LibraryService.AddOrUpdateCategory: Updated category {category.Name}");
                }
                else
                {
                    _libraryIndex.Categories.Add(category);
                    Log($"LibraryService.AddOrUpdateCategory: Added category {category.Name}");
                }
            }
        }

        /// <summary>
        /// Adds or updates a tag.
        /// </summary>
        public void AddOrUpdateTag(Tag tag)
        {
            Log($"LibraryService.AddOrUpdateTag: {tag.Name} (Category: {tag.CategoryId})");
            lock (_lock)
            {
                if (_libraryIndex.Tags == null)
                {
                    _libraryIndex.Tags = new List<Tag>();
                }

                var existingIndex = _libraryIndex.Tags.FindIndex(t => 
                    string.Equals(t.Name, tag.Name, StringComparison.OrdinalIgnoreCase));
                
                if (existingIndex >= 0)
                {
                    _libraryIndex.Tags[existingIndex] = tag;
                    Log($"LibraryService.AddOrUpdateTag: Updated tag {tag.Name}");
                }
                else
                {
                    _libraryIndex.Tags.Add(tag);
                    Log($"LibraryService.AddOrUpdateTag: Added tag {tag.Name}");
                }
            }
        }

        /// <summary>
        /// Renames a tag across the entire library (updates all items, filter states, and presets).
        /// </summary>
        /// <param name="oldName">Old tag name (case-insensitive)</param>
        /// <param name="newName">New tag name</param>
        /// <param name="newCategoryId">Optional new category ID (null to keep existing category)</param>
        public void RenameTag(string oldName, string newName, string? newCategoryId = null)
        {
            Log($"LibraryService.RenameTag: Renaming '{oldName}' to '{newName}' (new category: {newCategoryId ?? "unchanged"})");
            
            lock (_lock)
            {
                // Update tag in Tags list
                if (_libraryIndex.Tags != null)
                {
                    var tag = _libraryIndex.Tags.FirstOrDefault(t =>
                        string.Equals(t.Name, oldName, StringComparison.OrdinalIgnoreCase));
                    
                    if (tag != null)
                    {
                        tag.Name = newName;
                        if (newCategoryId != null)
                        {
                            tag.CategoryId = newCategoryId;
                        }
                        Log($"LibraryService.RenameTag: Updated tag in Tags list");
                    }
                }

                // Update all library items that have this tag
                int itemsUpdated = 0;
                foreach (var item in _libraryIndex.Items)
                {
                    if (item.Tags != null)
                    {
                        var tagIndex = item.Tags.FindIndex(t =>
                            string.Equals(t, oldName, StringComparison.OrdinalIgnoreCase));
                        
                        if (tagIndex >= 0)
                        {
                            item.Tags[tagIndex] = newName;
                            itemsUpdated++;
                        }
                    }
                }
                Log($"LibraryService.RenameTag: Updated {itemsUpdated} library items");
                
                // Note: Filter presets should be updated separately by the caller if needed
                // using UpdateFilterPresetsForRenamedTag() static method
            }
        }

        /// <summary>
        /// Deletes a tag category and optionally reassigns or deletes its tags.
        /// </summary>
        public void DeleteCategory(string categoryId, string? newCategoryId = null)
        {
            Log($"LibraryService.DeleteCategory: Deleting category {categoryId} (reassign to: {newCategoryId ?? "none"})");
            
            lock (_lock)
            {
                if (_libraryIndex.Categories != null)
                {
                    _libraryIndex.Categories.RemoveAll(c => c.Id == categoryId);
                }

                if (_libraryIndex.Tags != null)
                {
                    if (newCategoryId != null)
                    {
                        // Reassign tags to new category
                        var tagsToReassign = _libraryIndex.Tags.Where(t => t.CategoryId == categoryId).ToList();
                        foreach (var tag in tagsToReassign)
                        {
                            tag.CategoryId = newCategoryId;
                        }
                        Log($"LibraryService.DeleteCategory: Reassigned {tagsToReassign.Count} tags to category {newCategoryId}");
                    }
                    else
                    {
                        // Delete all tags in this category
                        var tagsToDelete = _libraryIndex.Tags.Where(t => t.CategoryId == categoryId).ToList();
                        var tagNamesSet = new HashSet<string>(
                            tagsToDelete.Select(t => t.Name),
                            StringComparer.OrdinalIgnoreCase);
                        
                        _libraryIndex.Tags.RemoveAll(t => t.CategoryId == categoryId);
                        
                        // Remove these tags from all items (case-insensitive)
                        foreach (var item in _libraryIndex.Items)
                        {
                            if (item.Tags != null)
                            {
                                item.Tags.RemoveAll(t => tagNamesSet.Contains(t));
                            }
                        }
                        Log($"LibraryService.DeleteCategory: Deleted {tagsToDelete.Count} tags from category");
                    }
                }
            }
        }

        /// <summary>
        /// Deletes a tag and removes it from all items.
        /// </summary>
        public void DeleteTag(string tagName)
        {
            Log($"LibraryService.DeleteTag: Deleting tag '{tagName}'");
            
            lock (_lock)
            {
                if (_libraryIndex.Tags != null)
                {
                    _libraryIndex.Tags.RemoveAll(t =>
                        string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase));
                }

                // Remove from all items
                int itemsUpdated = 0;
                foreach (var item in _libraryIndex.Items)
                {
                    if (item.Tags != null)
                    {
                        var removed = item.Tags.RemoveAll(t =>
                            string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
                        if (removed > 0) itemsUpdated++;
                    }
                }
                Log($"LibraryService.DeleteTag: Removed tag from {itemsUpdated} items");
                
                // Note: Filter presets should be updated separately by the caller if needed
                // using UpdateFilterPresetsForDeletedTag() static method
            }
        }

        /// <summary>
        /// Updates filter presets to rename a tag (case-insensitive).
        /// Call this after RenameTag to ensure filter presets are also updated.
        /// </summary>
        /// <param name="presets">List of filter presets to update</param>
        /// <param name="oldName">Old tag name</param>
        /// <param name="newName">New tag name</param>
        /// <returns>Number of presets that were updated</returns>
        public static int UpdateFilterPresetsForRenamedTag(List<FilterPreset>? presets, string oldName, string newName)
        {
            if (presets == null || presets.Count == 0)
            {
                return 0;
            }

            int presetsUpdated = 0;

            foreach (var preset in presets)
            {
                bool presetModified = false;

                // Update SelectedTags
                if (preset.FilterState.SelectedTags != null)
                {
                    for (int i = 0; i < preset.FilterState.SelectedTags.Count; i++)
                    {
                        if (string.Equals(preset.FilterState.SelectedTags[i], oldName, StringComparison.OrdinalIgnoreCase))
                        {
                            preset.FilterState.SelectedTags[i] = newName;
                            presetModified = true;
                        }
                    }
                }

                // Update ExcludedTags
                if (preset.FilterState.ExcludedTags != null)
                {
                    for (int i = 0; i < preset.FilterState.ExcludedTags.Count; i++)
                    {
                        if (string.Equals(preset.FilterState.ExcludedTags[i], oldName, StringComparison.OrdinalIgnoreCase))
                        {
                            preset.FilterState.ExcludedTags[i] = newName;
                            presetModified = true;
                        }
                    }
                }

                if (presetModified)
                {
                    presetsUpdated++;
                    Log($"LibraryService.UpdateFilterPresetsForRenamedTag: Updated preset '{preset.Name}'");
                }
            }

            Log($"LibraryService.UpdateFilterPresetsForRenamedTag: Updated {presetsUpdated} presets for tag '{oldName}' -> '{newName}'");
            return presetsUpdated;
        }

        /// <summary>
        /// Updates filter presets to remove a deleted tag (case-insensitive).
        /// Call this after DeleteTag to ensure filter presets are also updated.
        /// </summary>
        /// <param name="presets">List of filter presets to update</param>
        /// <param name="tagName">Tag name to remove</param>
        /// <returns>Number of presets that were updated</returns>
        public static int UpdateFilterPresetsForDeletedTag(List<FilterPreset>? presets, string tagName)
        {
            if (presets == null || presets.Count == 0)
            {
                return 0;
            }

            int presetsUpdated = 0;

            foreach (var preset in presets)
            {
                bool presetModified = false;

                // Remove from SelectedTags
                if (preset.FilterState.SelectedTags != null)
                {
                    var removed = preset.FilterState.SelectedTags.RemoveAll(t =>
                        string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
                    if (removed > 0) presetModified = true;
                }

                // Remove from ExcludedTags
                if (preset.FilterState.ExcludedTags != null)
                {
                    var removed = preset.FilterState.ExcludedTags.RemoveAll(t =>
                        string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
                    if (removed > 0) presetModified = true;
                }

                if (presetModified)
                {
                    presetsUpdated++;
                    Log($"LibraryService.UpdateFilterPresetsForDeletedTag: Updated preset '{preset.Name}'");
                }
            }

            Log($"LibraryService.UpdateFilterPresetsForDeletedTag: Updated {presetsUpdated} presets for deleted tag '{tagName}'");
            return presetsUpdated;
        }

        public DuplicateScanResult ScanDuplicates(DuplicateScanScope scope, string? sourceId = null)
        {
            lock (_lock)
            {
                IEnumerable<LibraryItem> items = _libraryIndex.Items;
                if (scope == DuplicateScanScope.CurrentSource && !string.IsNullOrWhiteSpace(sourceId))
                {
                    items = items.Where(i => i.SourceId == sourceId);
                }
                else if (scope == DuplicateScanScope.AllEnabledSources)
                {
                    var enabledIds = _libraryIndex.Sources.Where(s => s.IsEnabled).Select(s => s.Id).ToHashSet();
                    items = items.Where(i => enabledIds.Contains(i.SourceId));
                }

                var list = items.ToList();
                var excludedPending = list.Count(i => i.FingerprintStatus == FingerprintStatus.Pending);
                var excludedFailed = list.Count(i => i.FingerprintStatus == FingerprintStatus.Failed);
                var excludedStale = list.Count(i => i.FingerprintStatus == FingerprintStatus.Stale);

                var ready = list
                    .Where(i => i.FingerprintStatus == FingerprintStatus.Ready &&
                                !string.IsNullOrWhiteSpace(i.Fingerprint) &&
                                i.FingerprintAlgorithm == "SHA-256" &&
                                i.FingerprintVersion == 1)
                    .ToList();

                var groups = ready
                    .GroupBy(i => i.Fingerprint!, StringComparer.OrdinalIgnoreCase)
                    .Where(g => g.Count() > 1)
                    .Select(g => new DuplicateGroup
                    {
                        Fingerprint = g.Key,
                        Items = g.Select(item => new DuplicateGroupItem
                        {
                            ItemId = item.Id,
                            FullPath = item.FullPath,
                            SourceId = item.SourceId,
                            IsFavorite = item.IsFavorite,
                            IsBlacklisted = item.IsBlacklisted,
                            PlayCount = item.PlayCount,
                            LastPlayedUtc = item.LastPlayedUtc,
                            FileSizeBytes = item.FileSizeBytes,
                            LastWriteTimeUtc = item.LastWriteTimeUtc
                        }).ToList()
                    })
                    .OrderBy(g => g.Items.Count)
                    .ToList();

                return new DuplicateScanResult
                {
                    Groups = groups,
                    ExcludedPending = excludedPending,
                    ExcludedFailed = excludedFailed,
                    ExcludedStale = excludedStale
                };
            }
        }

        public DuplicateDeletionResult DeleteDuplicateFiles(List<DuplicateDeletionSelection> selections)
        {
            var result = new DuplicateDeletionResult();
            lock (_lock)
            {
                foreach (var selection in selections)
                {
                    var items = _libraryIndex.Items
                        .Where(i => selection.ItemIds.Any(id => string.Equals(id, i.Id, StringComparison.OrdinalIgnoreCase)))
                        .ToList();
                    var keep = items.FirstOrDefault(i => string.Equals(i.Id, selection.KeepItemId, StringComparison.OrdinalIgnoreCase));
                    if (keep == null)
                    {
                        continue;
                    }

                    foreach (var item in items)
                    {
                        if (string.Equals(item.Id, keep.Id, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        try
                        {
                            if (File.Exists(item.FullPath))
                            {
                                File.Delete(item.FullPath);
                                result.DeletedOnDisk++;
                            }
                            else
                            {
                                result.Failed.Add(new DuplicateDeletionFailure
                                {
                                    FullPath = item.FullPath,
                                    Reason = "File not found"
                                });
                                continue;
                            }

                            _libraryIndex.Items.Remove(item);
                            result.RemovedFromLibrary++;
                        }
                        catch (Exception ex)
                        {
                            result.Failed.Add(new DuplicateDeletionFailure
                            {
                                FullPath = item.FullPath,
                                Reason = ex.Message
                            });
                        }
                    }
                }

                RebuildFingerprintIndex();
            }

            return result;
        }
    }

    /// <summary>
    /// Result of a source refresh operation.
    /// </summary>
    public class RefreshResult
    {
        public int Added { get; set; }
        public int Removed { get; set; }
        public int Updated { get; set; }
        public int Renamed { get; set; }
        public int Moved { get; set; }
        public int UnresolvedQueued { get; set; }
    }

    public class RefreshProgress
    {
        public string Phase { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public int Current { get; set; }
        public int Total { get; set; }
    }

    public enum DuplicateScanScope
    {
        CurrentSource = 0,
        AllEnabledSources = 1,
        AllSources = 2
    }

    public class DuplicateScanResult
    {
        public List<DuplicateGroup> Groups { get; set; } = new List<DuplicateGroup>();
        public int ExcludedPending { get; set; }
        public int ExcludedFailed { get; set; }
        public int ExcludedStale { get; set; }
    }

    public class DuplicateGroup
    {
        public string Fingerprint { get; set; } = string.Empty;
        public List<DuplicateGroupItem> Items { get; set; } = new List<DuplicateGroupItem>();
    }

    public class DuplicateGroupItem
    {
        public string ItemId { get; set; } = string.Empty;
        public string FullPath { get; set; } = string.Empty;
        public string SourceId { get; set; } = string.Empty;
        public bool IsFavorite { get; set; }
        public bool IsBlacklisted { get; set; }
        public int PlayCount { get; set; }
        public DateTime? LastPlayedUtc { get; set; }
        public long? FileSizeBytes { get; set; }
        public DateTime? LastWriteTimeUtc { get; set; }
    }

    public class DuplicateDeletionSelection
    {
        public string KeepItemId { get; set; } = string.Empty;
        public List<string> ItemIds { get; set; } = new List<string>();
    }

    public class DuplicateDeletionFailure
    {
        public string FullPath { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
    }

    public class DuplicateDeletionResult
    {
        public int DeletedOnDisk { get; set; }
        public int RemovedFromLibrary { get; set; }
        public List<DuplicateDeletionFailure> Failed { get; set; } = new List<DuplicateDeletionFailure>();
    }

    /// <summary>
    /// Statistics for a library source.
    /// </summary>
    public class SourceStatistics
    {
        public int TotalVideos { get; set; }
        public int TotalPhotos { get; set; }
        public int TotalMedia { get; set; }
        public int VideosWithAudio { get; set; }
        public int VideosWithoutAudio { get; set; }
        public TimeSpan TotalDuration { get; set; }
        public TimeSpan? AverageDuration { get; set; }

        /// <summary>
        /// Formatted total duration for display (e.g., "2h 30m").
        /// </summary>
        public string TotalDurationFormatted
        {
            get
            {
                if (TotalDuration == TimeSpan.Zero)
                    return "0m";
                
                if (TotalDuration.TotalHours >= 1)
                    return $"{(int)TotalDuration.TotalHours}h {TotalDuration.Minutes}m";
                
                return $"{TotalDuration.Minutes}m";
            }
        }
    }
}

