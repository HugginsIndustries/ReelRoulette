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
    [STAThread]
    public static void Main(string[] args)
    {
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
                System.Diagnostics.Debug.WriteLine($"Using bundled LibVLC: {bundledLibVlcPath}");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to initialize bundled LibVLC: {ex.Message}");
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
                System.Diagnostics.Debug.WriteLine("Using system LibVLC (default initialization)");
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
                            System.Diagnostics.Debug.WriteLine($"Using system LibVLC: {path}");
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
            Console.WriteLine("ERROR: LibVLC native libraries not found.");
            Console.WriteLine("Please install VLC media player or ensure bundled libraries are available.");
            return;
        }

        if (libVlcSource != null)
        {
            System.Diagnostics.Debug.WriteLine($"LibVLC initialized successfully from: {libVlcSource}");
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
