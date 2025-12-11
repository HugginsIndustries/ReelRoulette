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
        // Try to find VLC installation or use default path
        try
        {
            Core.Initialize();
        }
        catch (Exception ex)
        {
            // If default initialization fails, try common VLC installation paths
            var possiblePaths = new[]
            {
                @"C:\Program Files\VideoLAN\VLC",
                @"C:\Program Files (x86)\VideoLAN\VLC",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\VideoLAN\VLC"
            };

            bool initialized = false;
            foreach (var path in possiblePaths)
            {
                if (Directory.Exists(path))
                {
                    try
                    {
                        Core.Initialize(path);
                        initialized = true;
                        break;
                    }
                    catch
                    {
                        // Try next path
                    }
                }
            }

            if (!initialized)
            {
                Console.WriteLine("ERROR: LibVLC native libraries not found.");
                Console.WriteLine("Please install VLC media player or provide the path to libvlc.dll");
                Console.WriteLine($"Error: {ex.Message}");
                return;
            }
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
