using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

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
                        lock (_lock)
                        {
                            _libraryIndex = index;
                        }
                        Log($"LibraryService.LoadLibrary: Successfully loaded library - {index.Items.Count} items, {index.Sources.Count} sources");
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
                            SourceId = source.Id,
                            FullPath = filePath,
                            RelativePath = GetRelativePath(rootPath, filePath),
                            FileName = Path.GetFileName(filePath),
                            MediaType = mediaType,
                            IsFavorite = false,
                            IsBlacklisted = false,
                            PlayCount = 0,
                            Tags = new List<string>()
                        };
                        _libraryIndex.Items.Add(newItem);
                        importedCount++;
                    }
                }

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
                var existingIndex = _libraryIndex.Items.FindIndex(i =>
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
        public RefreshResult RefreshSource(string sourceId)
        {
            Log($"LibraryService.RefreshSource: Starting - sourceId = {sourceId}");
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

                // Add new files
                foreach (var filePath in allMediaFilesOnDisk)
                {
                    if (!currentPaths.Contains(filePath))
                    {
                        // Determine media type by extension
                        var extension = Path.GetExtension(filePath).ToLowerInvariant();
                        var mediaType = VideoExtensions.Contains(extension) ? MediaType.Video : MediaType.Photo;

                        var newItem = new LibraryItem
                        {
                            SourceId = source.Id,
                            FullPath = filePath,
                            RelativePath = GetRelativePath(source.RootPath, filePath),
                            FileName = Path.GetFileName(filePath),
                            MediaType = mediaType,
                            IsFavorite = false,
                            IsBlacklisted = false,
                            PlayCount = 0,
                            Tags = new List<string>()
                        };
                        _libraryIndex.Items.Add(newItem);
                        added++;
                    }
                }

                // Remove deleted files
                var itemsToRemove = currentItems
                    .Where(i => !allMediaFilesOnDisk.Contains(i.FullPath))
                    .ToList();

                foreach (var item in itemsToRemove)
                {
                    _libraryIndex.Items.Remove(item);
                    removed++;
                }

                // Update paths for existing items (in case files moved)
                foreach (var item in currentItems.Where(i => allMediaFilesOnDisk.Contains(i.FullPath)))
                {
                    var newPath = allMediaFilesOnDisk.First(f =>
                        string.Equals(f, item.FullPath, StringComparison.OrdinalIgnoreCase));
                    if (newPath != item.FullPath)
                    {
                        item.FullPath = newPath;
                        item.RelativePath = GetRelativePath(source.RootPath, newPath);
                        item.FileName = Path.GetFileName(newPath);
                        // Update media type if extension changed
                        var extension = Path.GetExtension(newPath).ToLowerInvariant();
                        item.MediaType = VideoExtensions.Contains(extension) ? MediaType.Video : MediaType.Photo;
                        updated++;
                    }
                }

                Log($"LibraryService.RefreshSource: Completed - Added: {added}, Removed: {removed}, Updated: {updated}");
                
                return new RefreshResult
                {
                    Added = added,
                    Removed = removed,
                    Updated = updated
                };
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
    }

    /// <summary>
    /// Result of a source refresh operation.
    /// </summary>
    public class RefreshResult
    {
        public int Added { get; set; }
        public int Removed { get; set; }
        public int Updated { get; set; }
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

