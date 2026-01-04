using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace ReelRoulette
{
    /// <summary>
    /// Service for migrating legacy data files to the new library system.
    /// This is a one-time migration that runs on first launch after the refactor.
    /// </summary>
    public class LibraryMigrationService
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
        /// <summary>
        /// Performs a one-time migration from legacy data files to the new library system.
        /// </summary>
        /// <param name="libraryService">The library service to populate.</param>
        /// <returns>Migration result with statistics.</returns>
        public MigrationResult Migrate(LibraryService libraryService)
        {
            var result = new MigrationResult();

            // Check if library already exists - if so, skip migration
            var libraryPath = AppDataManager.GetLibraryIndexPath();
            if (File.Exists(libraryPath))
            {
                result.Skipped = true;
                result.Message = "Library already exists, skipping migration.";
                return result;
            }

            // Load all legacy data files
            var favorites = LoadLegacyFavorites();
            var blacklist = LoadLegacyBlacklist();
            var playbackStats = LoadLegacyPlaybackStats();
            var durations = LoadLegacyDurations();
            var loudnessStats = LoadLegacyLoudnessStats();
            var lastFolderPath = LoadLastFolderPath();

            // Collect all unique file paths from legacy data
            var allPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            allPaths.UnionWith(favorites);
            allPaths.UnionWith(blacklist);
            allPaths.UnionWith(playbackStats.Keys);
            allPaths.UnionWith(durations.Keys);
            allPaths.UnionWith(loudnessStats.Keys);

            // Create LibraryItems for files that still exist on disk
            var itemsCreated = 0;
            var itemsSkipped = 0;
            var sourceId = (string?)null;

            // If we have a last folder path, create a source for it
            if (!string.IsNullOrEmpty(lastFolderPath))
            {
                Log($"LibraryMigrationService.Migrate: Checking if last folder path exists: {lastFolderPath}");
                if (Directory.Exists(lastFolderPath))
                {
                    Log($"LibraryMigrationService.Migrate: Last folder path exists, importing folder");
                    try
                    {
                        var imported = libraryService.ImportFolder(lastFolderPath, null);
                        result.FilesImportedFromFolder = imported;
                        Log($"LibraryMigrationService.Migrate: Successfully imported {imported} files from last folder path");
                    
                    // Get the source ID that was just created
                    var library = libraryService.LibraryIndex;
                    var source = library.Sources.FirstOrDefault(s =>
                        string.Equals(s.RootPath, lastFolderPath, StringComparison.OrdinalIgnoreCase));
                    if (source != null)
                    {
                        sourceId = source.Id;
                    }
                }
                    catch (Exception ex)
                    {
                        Log($"LibraryMigrationService.Migrate: ERROR importing folder - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        result.Warnings.Add($"Failed to import folder '{lastFolderPath}': {ex.Message}");
                    }
                }
                else
                {
                    Log($"LibraryMigrationService.Migrate: Last folder path does not exist: {lastFolderPath}");
                }
            }

            // Process all legacy file paths
            Log($"LibraryMigrationService.Migrate: Processing {allPaths.Count} legacy file paths");
            int filesChecked = 0;
            foreach (var filePath in allPaths)
            {
                filesChecked++;
                // Skip if file doesn't exist
                if (!File.Exists(filePath))
                {
                    if (filesChecked % 100 == 0 || itemsSkipped < 10)
                    {
                        Log($"LibraryMigrationService.Migrate: File does not exist, skipping: {Path.GetFileName(filePath)}");
                    }
                    itemsSkipped++;
                    continue;
                }

                // Find or create the LibraryItem
                var item = libraryService.FindItemByPath(filePath);
                
                if (item == null)
                {
                    // Item doesn't exist - we need to determine its source
                    // Try to find a source that contains this path
                    var library = libraryService.LibraryIndex;
                    var containingSource = library.Sources.FirstOrDefault(s =>
                        filePath.StartsWith(s.RootPath, StringComparison.OrdinalIgnoreCase));

                    if (containingSource == null)
                    {
                        // No source contains this file - skip it
                        // User will need to import the folder manually
                        itemsSkipped++;
                        continue;
                    }

                    // Create new item
                    item = new LibraryItem
                    {
                        SourceId = containingSource.Id,
                        FullPath = filePath,
                        RelativePath = GetRelativePath(containingSource.RootPath, filePath),
                        FileName = Path.GetFileName(filePath),
                        IsFavorite = false,
                        IsBlacklisted = false,
                        PlayCount = 0,
                        Tags = new List<string>()
                    };
                    libraryService.UpdateItem(item);
                    itemsCreated++;
                }

                // Apply legacy data to the item
                try
                {
                    // Favorites
                    if (favorites.Contains(filePath, StringComparer.OrdinalIgnoreCase))
                    {
                        item.IsFavorite = true;
                        result.FavoritesMigrated++;
                    }

                    // Blacklist
                    if (blacklist.Contains(filePath, StringComparer.OrdinalIgnoreCase))
                    {
                        item.IsBlacklisted = true;
                        result.BlacklistedMigrated++;
                    }

                    // Playback stats
                    if (playbackStats.TryGetValue(filePath, out var stats))
                    {
                        item.PlayCount = stats.PlayCount;
                        item.LastPlayedUtc = stats.LastPlayedUtc;
                        result.PlaybackStatsMigrated++;
                    }

                    // Duration (convert from seconds to TimeSpan)
                    if (durations.TryGetValue(filePath, out var durationSeconds) && durationSeconds > 0)
                    {
                        item.Duration = TimeSpan.FromSeconds(durationSeconds);
                        result.DurationsMigrated++;
                    }

                    // Loudness stats
                    if (loudnessStats.TryGetValue(filePath, out var loudnessInfo))
                    {
                        item.HasAudio = loudnessInfo.HasAudio;
                        // Store integrated loudness if available (we'll use MeanVolumeDb as a proxy)
                        // Note: The legacy system doesn't have true LUFS, but we can store the mean volume
                        if (loudnessInfo.MeanVolumeDb != 0.0)
                        {
                            // Convert dB to LUFS approximation (they're similar scales)
                            item.IntegratedLoudness = loudnessInfo.MeanVolumeDb;
                        }
                        result.LoudnessStatsMigrated++;
                    }

                    // Update the item
                    libraryService.UpdateItem(item);
                }
                catch (Exception ex)
                {
                    result.Warnings.Add($"Failed to migrate data for '{filePath}': {ex.Message}");
                }
            }

            result.ItemsCreated = itemsCreated;
            result.ItemsSkipped = itemsSkipped;
            result.Message = $"Migration complete: {itemsCreated} items created, {itemsSkipped} skipped.";

            return result;
        }

        private HashSet<string> LoadLegacyFavorites()
        {
            Log("LibraryMigrationService.LoadLegacyFavorites: Starting");
            try
            {
                var path = AppDataManager.GetFavoritesPath();
                Log($"LibraryMigrationService.LoadLegacyFavorites: Path = {path}");
                if (File.Exists(path))
                {
                    Log($"LibraryMigrationService.LoadLegacyFavorites: File exists, reading...");
                    var json = File.ReadAllText(path);
                    Log($"LibraryMigrationService.LoadLegacyFavorites: Read {json.Length} characters");
                    var list = JsonSerializer.Deserialize<List<string>>(json) ?? new();
                    Log($"LibraryMigrationService.LoadLegacyFavorites: Deserialized {list.Count} favorites");
                    return new HashSet<string>(list, StringComparer.OrdinalIgnoreCase);
                }
                else
                {
                    Log($"LibraryMigrationService.LoadLegacyFavorites: File does not exist");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryMigrationService.LoadLegacyFavorites: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryMigrationService.LoadLegacyFavorites: ERROR - Stack trace: {ex.StackTrace}");
            }
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        private HashSet<string> LoadLegacyBlacklist()
        {
            Log("LibraryMigrationService.LoadLegacyBlacklist: Starting");
            try
            {
                var path = AppDataManager.GetBlacklistPath();
                Log($"LibraryMigrationService.LoadLegacyBlacklist: Path = {path}");
                if (File.Exists(path))
                {
                    Log($"LibraryMigrationService.LoadLegacyBlacklist: File exists, reading...");
                    var json = File.ReadAllText(path);
                    Log($"LibraryMigrationService.LoadLegacyBlacklist: Read {json.Length} characters");
                    var list = JsonSerializer.Deserialize<List<string>>(json) ?? new();
                    Log($"LibraryMigrationService.LoadLegacyBlacklist: Deserialized {list.Count} blacklisted items");
                    return new HashSet<string>(list, StringComparer.OrdinalIgnoreCase);
                }
                else
                {
                    Log($"LibraryMigrationService.LoadLegacyBlacklist: File does not exist");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryMigrationService.LoadLegacyBlacklist: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryMigrationService.LoadLegacyBlacklist: ERROR - Stack trace: {ex.StackTrace}");
            }
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        private Dictionary<string, FilePlaybackStats> LoadLegacyPlaybackStats()
        {
            Log("LibraryMigrationService.LoadLegacyPlaybackStats: Starting");
            try
            {
                var path = AppDataManager.GetPlaybackStatsPath();
                Log($"LibraryMigrationService.LoadLegacyPlaybackStats: Path = {path}");
                if (File.Exists(path))
                {
                    Log($"LibraryMigrationService.LoadLegacyPlaybackStats: File exists, reading...");
                    var json = File.ReadAllText(path);
                    Log($"LibraryMigrationService.LoadLegacyPlaybackStats: Read {json.Length} characters");
                    var dict = JsonSerializer.Deserialize<Dictionary<string, FilePlaybackStats>>(json) ?? new();
                    Log($"LibraryMigrationService.LoadLegacyPlaybackStats: Deserialized {dict.Count} playback stats entries");
                    return new Dictionary<string, FilePlaybackStats>(dict, StringComparer.OrdinalIgnoreCase);
                }
                else
                {
                    Log($"LibraryMigrationService.LoadLegacyPlaybackStats: File does not exist");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryMigrationService.LoadLegacyPlaybackStats: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryMigrationService.LoadLegacyPlaybackStats: ERROR - Stack trace: {ex.StackTrace}");
            }
            return new Dictionary<string, FilePlaybackStats>(StringComparer.OrdinalIgnoreCase);
        }

        private Dictionary<string, long> LoadLegacyDurations()
        {
            Log("LibraryMigrationService.LoadLegacyDurations: Starting");
            try
            {
                var path = AppDataManager.GetDurationsPath();
                Log($"LibraryMigrationService.LoadLegacyDurations: Path = {path}");
                if (File.Exists(path))
                {
                    Log($"LibraryMigrationService.LoadLegacyDurations: File exists, reading...");
                    var json = File.ReadAllText(path);
                    Log($"LibraryMigrationService.LoadLegacyDurations: Read {json.Length} characters");
                    var dict = JsonSerializer.Deserialize<Dictionary<string, long>>(json) ?? new();
                    Log($"LibraryMigrationService.LoadLegacyDurations: Deserialized {dict.Count} duration entries");
                    return new Dictionary<string, long>(dict, StringComparer.OrdinalIgnoreCase);
                }
                else
                {
                    Log($"LibraryMigrationService.LoadLegacyDurations: File does not exist");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryMigrationService.LoadLegacyDurations: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryMigrationService.LoadLegacyDurations: ERROR - Stack trace: {ex.StackTrace}");
            }
            return new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        }

        private Dictionary<string, FileLoudnessInfo> LoadLegacyLoudnessStats()
        {
            Log("LibraryMigrationService.LoadLegacyLoudnessStats: Starting");
            try
            {
                var path = AppDataManager.GetLoudnessStatsPath();
                Log($"LibraryMigrationService.LoadLegacyLoudnessStats: Path = {path}");
                if (File.Exists(path))
                {
                    Log($"LibraryMigrationService.LoadLegacyLoudnessStats: File exists, reading...");
                    var json = File.ReadAllText(path);
                    Log($"LibraryMigrationService.LoadLegacyLoudnessStats: Read {json.Length} characters");
                    var dict = JsonSerializer.Deserialize<Dictionary<string, FileLoudnessInfo>>(json) ?? new();
                    Log($"LibraryMigrationService.LoadLegacyLoudnessStats: Deserialized {dict.Count} loudness stats entries");
                    return new Dictionary<string, FileLoudnessInfo>(dict, StringComparer.OrdinalIgnoreCase);
                }
                else
                {
                    Log($"LibraryMigrationService.LoadLegacyLoudnessStats: File does not exist");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryMigrationService.LoadLegacyLoudnessStats: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryMigrationService.LoadLegacyLoudnessStats: ERROR - Stack trace: {ex.StackTrace}");
            }
            return new Dictionary<string, FileLoudnessInfo>(StringComparer.OrdinalIgnoreCase);
        }

        private string? LoadLastFolderPath()
        {
            Log("LibraryMigrationService.LoadLastFolderPath: Starting");
            try
            {
                var path = AppDataManager.GetViewPreferencesPath();
                Log($"LibraryMigrationService.LoadLastFolderPath: Path = {path}");
                if (File.Exists(path))
                {
                    Log($"LibraryMigrationService.LoadLastFolderPath: File exists, reading...");
                    var json = File.ReadAllText(path);
                    Log($"LibraryMigrationService.LoadLastFolderPath: Read {json.Length} characters");
                    var prefs = JsonSerializer.Deserialize<ViewPreferencesForMigration>(json);
                    var lastFolderPath = prefs?.LastFolderPath;
                    Log($"LibraryMigrationService.LoadLastFolderPath: Last folder path = {lastFolderPath ?? "null"}");
                    return lastFolderPath;
                }
                else
                {
                    Log($"LibraryMigrationService.LoadLastFolderPath: File does not exist");
                }
            }
            catch (Exception ex)
            {
                Log($"LibraryMigrationService.LoadLastFolderPath: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"LibraryMigrationService.LoadLastFolderPath: ERROR - Stack trace: {ex.StackTrace}");
            }
            return null;
        }

        private string GetRelativePath(string rootPath, string fullPath)
        {
            if (string.IsNullOrEmpty(rootPath) || string.IsNullOrEmpty(fullPath))
                return string.Empty;

            var rootUri = new Uri(Path.GetFullPath(rootPath) + Path.DirectorySeparatorChar);
            var fileUri = new Uri(Path.GetFullPath(fullPath));
            var relativeUri = rootUri.MakeRelativeUri(fileUri);
            return Uri.UnescapeDataString(relativeUri.ToString().Replace('/', Path.DirectorySeparatorChar));
        }
    }

    /// <summary>
    /// Result of a migration operation.
    /// </summary>
    public class MigrationResult
    {
        public bool Skipped { get; set; }
        public int ItemsCreated { get; set; }
        public int ItemsSkipped { get; set; }
        public int FilesImportedFromFolder { get; set; }
        public int FavoritesMigrated { get; set; }
        public int BlacklistedMigrated { get; set; }
        public int PlaybackStatsMigrated { get; set; }
        public int DurationsMigrated { get; set; }
        public int LoudnessStatsMigrated { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
        public string Message { get; set; } = string.Empty;
    }

    // Note: FilePlaybackStats and FileLoudnessInfo are defined in MainWindow.axaml.cs
    // ViewPreferences is private in MainWindow, so we use a minimal class for deserialization
    internal class ViewPreferencesForMigration
    {
        public string? LastFolderPath { get; set; }
    }
}

