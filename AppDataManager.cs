using System;
using System.IO;

namespace ReelRoulette
{
    public static class AppDataManager
    {
        private static string? _appDataDirectory;
        
        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataDirectory ?? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette", "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        public static string AppDataDirectory
        {
            get
            {
                if (_appDataDirectory == null)
                {
                    var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    _appDataDirectory = Path.Combine(baseDir, "ReelRoulette");
                    Log($"AppDataManager: AppDataDirectory path = {_appDataDirectory}");
                    
                    // Ensure directory exists
                    if (!Directory.Exists(_appDataDirectory))
                    {
                        Log($"AppDataManager: AppDataDirectory does not exist, creating: {_appDataDirectory}");
                        Directory.CreateDirectory(_appDataDirectory);
                        Log($"AppDataManager: Successfully created AppDataDirectory");
                    }
                    else
                    {
                        Log($"AppDataManager: AppDataDirectory already exists");
                    }
                }
                return _appDataDirectory;
            }
        }

        public static string GetFavoritesPath()
        {
            return Path.Combine(AppDataDirectory, "favorites.json");
        }

        public static string GetHistoryPath()
        {
            return Path.Combine(AppDataDirectory, "history.json");
        }

        public static string GetBlacklistPath()
        {
            return Path.Combine(AppDataDirectory, "blacklist.json");
        }

        public static string GetDurationsPath()
        {
            return Path.Combine(AppDataDirectory, "durations.json");
        }

        public static string GetSettingsPath()
        {
            return Path.Combine(AppDataDirectory, "settings.json");
        }

        // Legacy paths - kept for migration purposes
        public static string GetViewPreferencesPath()
        {
            return Path.Combine(AppDataDirectory, "view_prefs.json");
        }

        public static string GetPlaybackSettingsPath()
        {
            return Path.Combine(AppDataDirectory, "playback_settings.json");
        }

        public static string GetPlaybackStatsPath()
        {
            return Path.Combine(AppDataDirectory, "playbackStats.json");
        }

        public static string GetLoudnessStatsPath()
        {
            return Path.Combine(AppDataDirectory, "loudnessStats.json");
        }

        public static string GetLibraryIndexPath()
        {
            return Path.Combine(AppDataDirectory, "library.json");
        }

        // Legacy paths - kept for migration purposes
        public static string GetFilterStatePath()
        {
            return Path.Combine(AppDataDirectory, "filterState.json");
        }
    }
}

