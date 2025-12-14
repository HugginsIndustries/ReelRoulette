using Avalonia;
using LibVLCSharp.Shared;
using System;
using System.IO;

namespace ReelRoulette;

class Program
{
    // Initialization code. Don't use any Avalonia, third-party APIs or any
    // SynchronizationContext-reliant code before AppMain is called: things aren't initialized
    // yet and stuff might break.
    private static string GetLogPath()
    {
        var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        if (!Directory.Exists(appDataDir))
        {
            Directory.CreateDirectory(appDataDir);
        }
        return Path.Combine(appDataDir, "last.log");
    }

    private static void Log(string message)
    {
        try
        {
            var logPath = GetLogPath();
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
        }
        catch { }
    }

    [STAThread]
    public static void Main(string[] args)
    {
        // Clear log file at startup
        try
        {
            var logPath = GetLogPath();
            if (File.Exists(logPath))
            {
                File.Delete(logPath);
            }
            Log("=== Application Startup ===");
        }
        catch { }

        // Add global exception handlers to capture crashes
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            var ex = e.ExceptionObject as Exception;
            var errorMsg = $"=== UNHANDLED EXCEPTION ===\n" +
                          $"Exception: {ex?.GetType().Name ?? "Unknown"}\n" +
                          $"Message: {ex?.Message ?? "No message"}\n" +
                          $"Stack Trace:\n{ex?.StackTrace ?? "No stack trace"}";
            if (ex?.InnerException != null)
            {
                errorMsg += $"\nInner Exception: {ex.InnerException.Message}\n" +
                           $"Inner Stack Trace:\n{ex.InnerException.StackTrace}";
            }
            errorMsg += "\n===========================";
            Log(errorMsg);
        };

        // Initialize LibVLC core before starting Avalonia
        // Try bundled LibVLC first, then fall back to system installation
        bool initialized = false;
        string? libVlcSource = null;

        // Try bundled LibVLC first
        var bundledLibVlcPath = NativeBinaryHelper.GetLibVlcPath();
        if (!string.IsNullOrEmpty(bundledLibVlcPath))
        {
            try
            {
                // Set VLC_PLUGIN_PATH environment variable as fallback for plugin loading
                var pluginPath = Path.Combine(bundledLibVlcPath, "plugins");
                if (Directory.Exists(pluginPath))
                {
                    Environment.SetEnvironmentVariable("VLC_PLUGIN_PATH", pluginPath);
                }

                Core.Initialize(bundledLibVlcPath);
                initialized = true;
                libVlcSource = $"bundled ({bundledLibVlcPath})";
                Log($"Using bundled LibVLC: {bundledLibVlcPath}");
            }
            catch (Exception ex)
            {
                Log($"Failed to initialize bundled LibVLC: {ex.Message}");
                Log($"Failed to initialize bundled LibVLC: Stack trace: {ex.StackTrace}");
            }
        }

        // If bundled LibVLC failed, try system installation
        if (!initialized)
        {
            try
            {
                Core.Initialize();
                initialized = true;
                libVlcSource = "system (default)";
                Log("Using system LibVLC (default initialization)");
            }
            catch (Exception)
            {
                // If default initialization fails, try common VLC installation paths
                var possiblePaths = new[]
                {
                    @"C:\Program Files\VideoLAN\VLC",
                    @"C:\Program Files (x86)\VideoLAN\VLC",
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\VideoLAN\VLC"
                };

                foreach (var path in possiblePaths)
                {
                    if (Directory.Exists(path))
                    {
                        try
                        {
                            Core.Initialize(path);
                            initialized = true;
                            libVlcSource = $"system ({path})";
                            Log($"Using system LibVLC: {path}");
                            break;
                        }
                        catch
                        {
                            // Try next path
                        }
                    }
                }
            }
        }

        if (!initialized)
        {
            var errorMsg = "ERROR: LibVLC native libraries not found. Please install VLC media player or ensure bundled libraries are available.";
            Log(errorMsg);
            return;
        }

        if (libVlcSource != null)
        {
            Log($"LibVLC initialized successfully from: {libVlcSource}");
        }
        
        BuildAvaloniaApp()
            .StartWithClassicDesktopLifetime(args);
    }

    // Avalonia configuration, don't remove; also used by visual designer.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
