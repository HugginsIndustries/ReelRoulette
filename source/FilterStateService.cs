using System;
using System.IO;
using System.Text.Json;

namespace ReelRoulette
{
    /// <summary>
    /// Service for persisting and loading FilterState.
    /// FilterState is the single source of truth for all filtering configuration.
    /// </summary>
    public class FilterStateService
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
        /// Loads the filter state from disk. Returns default FilterState if file doesn't exist.
        /// </summary>
        public FilterState LoadFilterState()
        {
            Log("FilterStateService.LoadFilterState: Starting...");
            try
            {
                var path = AppDataManager.GetFilterStatePath();
                Log($"FilterStateService.LoadFilterState: Path = {path}");
                
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    var filterState = JsonSerializer.Deserialize<FilterState>(json);
                    if (filterState != null)
                    {
                        Log($"FilterStateService.LoadFilterState: Successfully loaded filter state from {path}");
                        return filterState;
                    }
                    else
                    {
                        Log("FilterStateService.LoadFilterState: File exists but deserialization returned null, using defaults");
                    }
                }
                else
                {
                    Log("FilterStateService.LoadFilterState: File does not exist, using defaults");
                }
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
                
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true
                };
                var json = JsonSerializer.Serialize(filterState, options);
                Log($"FilterStateService.SaveFilterState: Serialized to JSON, length = {json.Length} characters");
                
                File.WriteAllText(path, json);
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

