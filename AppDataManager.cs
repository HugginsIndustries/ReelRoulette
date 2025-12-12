using System;
using System.IO;

namespace ReelRoulette
{
    public static class AppDataManager
    {
        private static string? _appDataDirectory;

        public static string AppDataDirectory
        {
            get
            {
                if (_appDataDirectory == null)
                {
                    var baseDir = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    _appDataDirectory = Path.Combine(baseDir, "ReelRoulette");
                    
                    // Ensure directory exists
                    if (!Directory.Exists(_appDataDirectory))
                    {
                        Directory.CreateDirectory(_appDataDirectory);
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
    }
}

