using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using System;
using System.IO;

namespace ReelRoulette;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    private static void Log(string message)
    {
        try
        {
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
            if (!Directory.Exists(appDataDir))
            {
                Directory.CreateDirectory(appDataDir);
            }
            var logPath = Path.Combine(appDataDir, "last.log");
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
        }
        catch { }
    }

    public override void OnFrameworkInitializationCompleted()
    {
        try
        {
            Log("App.OnFrameworkInitializationCompleted: Starting...");
            if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
            {
                Log("App.OnFrameworkInitializationCompleted: Creating MainWindow...");
                desktop.MainWindow = new MainWindow();
                Log("App.OnFrameworkInitializationCompleted: MainWindow created successfully.");
            }
            else
            {
                Log("App.OnFrameworkInitializationCompleted: WARNING - Not a desktop application lifetime!");
            }

            base.OnFrameworkInitializationCompleted();
            Log("App.OnFrameworkInitializationCompleted: Completed.");
        }
        catch (Exception ex)
        {
            var errorMsg = $"EXCEPTION in App.OnFrameworkInitializationCompleted: {ex.GetType().Name}\n" +
                          $"Message: {ex.Message}\n" +
                          $"Stack Trace:\n{ex.StackTrace}";
            if (ex.InnerException != null)
            {
                errorMsg += $"\nInner Exception: {ex.InnerException.Message}\n" +
                           $"Inner Stack Trace:\n{ex.InnerException.StackTrace}";
            }
            Log(errorMsg);
            throw;
        }
    }
}