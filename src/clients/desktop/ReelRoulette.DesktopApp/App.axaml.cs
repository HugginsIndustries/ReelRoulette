using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using System;

namespace ReelRoulette;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    private static void Log(string message)
    {
        ClientLogRelay.Log("desktop-app", message);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        Dispatcher.UIThread.UnhandledExceptionFilter += (_, e) =>
        {
            if (IsExpectedLinuxDbusShutdownException(e.Exception))
            {
                e.RequestCatch = false;
            }
        };

        Dispatcher.UIThread.UnhandledException += (_, e) =>
        {
            if (IsExpectedLinuxDbusShutdownException(e.Exception))
            {
                e.Handled = true;
            }
        };

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

    private static bool IsExpectedLinuxDbusShutdownException(Exception? ex)
    {
        if (ex is not OperationCanceledException oce)
        {
            return false;
        }

        if (!OperatingSystem.IsLinux())
        {
            return false;
        }

        var stack = oce.StackTrace ?? string.Empty;
        return stack.Contains("Tmds.DBus.Protocol", StringComparison.Ordinal) ||
               stack.Contains("Avalonia.Threading", StringComparison.Ordinal);
    }
}