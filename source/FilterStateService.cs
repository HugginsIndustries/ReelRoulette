using System;
using System.IO;
using System.Text.Json;
using ReelRoulette.Core.Storage;

namespace ReelRoulette
{
    /// <summary>
    /// Service for persisting and loading FilterState.
    /// FilterState is the single source of truth for all filtering configuration.
    /// </summary>
    public class FilterStateService
    {
        private readonly JsonFileStorageService<FilterState> _storage = new(new JsonFileStorageOptions<FilterState>
        {
            FilePathResolver = AppDataManager.GetFilterStatePath,
            CreateDefault = () => new FilterState(),
            SerializerOptions = new JsonSerializerOptions { WriteIndented = true }
        });

        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                var sanitized = LogSanitizer.Sanitize(message);
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {sanitized}\n");
            }
            catch { }
        }
        /// <summary>
        /// Loads the filter state from disk. Returns default FilterState if file doesn't exist.
        /// </summary>
        public FilterState LoadFilterState()
        {
            Log("FilterStateService.LoadFilterState: Starting...");
            try
            {
                var path = AppDataManager.GetFilterStatePath();
                Log($"FilterStateService.LoadFilterState: Path = {path}");
                return _storage.Load();
            }
            catch (Exception ex)
            {
                Log($"FilterStateService.LoadFilterState: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"FilterStateService.LoadFilterState: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"FilterStateService.LoadFilterState: ERROR - Inner exception: {ex.InnerException.Message}");
                }
            }

            // Return default filter state
            Log("FilterStateService.LoadFilterState: Returning default FilterState");
            return new FilterState();
        }

        /// <summary>
        /// Saves the filter state to disk.
        /// </summary>
        public void SaveFilterState(FilterState filterState)
        {
            Log("FilterStateService.SaveFilterState: Starting...");
            if (filterState == null)
            {
                Log("FilterStateService.SaveFilterState: ERROR - filterState is null");
                throw new ArgumentNullException(nameof(filterState));
            }

            try
            {
                var path = AppDataManager.GetFilterStatePath();
                Log($"FilterStateService.SaveFilterState: Path = {path}");
                _storage.Save(filterState);
                Log($"FilterStateService.SaveFilterState: Successfully saved filter state to {path}");
            }
            catch (Exception ex)
            {
                Log($"FilterStateService.SaveFilterState: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"FilterStateService.SaveFilterState: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"FilterStateService.SaveFilterState: ERROR - Inner exception: {ex.InnerException.Message}");
                }
                throw;
            }
        }
    }
}

