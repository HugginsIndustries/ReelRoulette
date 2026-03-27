using System;
using System.IO;

namespace ReelRoulette
{
    public static class AppDataManager
    {
        private static string? _appDataDirectory;
        
        private static void Log(string message)
        {
            ClientLogRelay.Log("desktop-appdata", message);
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

        public static string GetSettingsPath()
        {
            return Path.Combine(AppDataDirectory, "desktop-settings.json");
        }

        public static string GetLibraryIndexPath()
        {
            return Path.Combine(AppDataDirectory, "library.json");
        }

        public static string GetBackupDirectoryPath()
        {
            var backupDir = Path.Combine(AppDataDirectory, "backups");
            if (!Directory.Exists(backupDir))
            {
                try
                {
                    Directory.CreateDirectory(backupDir);
                    Log($"AppDataManager: Created backup directory: {backupDir}");
                }
                catch (Exception ex)
                {
                    Log($"AppDataManager: ERROR - Failed to create backup directory: {ex.Message}");
                    throw;
                }
            }
            return backupDir;
        }
    }
}

