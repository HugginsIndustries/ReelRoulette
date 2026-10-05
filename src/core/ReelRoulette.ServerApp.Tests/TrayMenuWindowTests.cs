using System.Reflection;
using System.Runtime.CompilerServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Platform;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Services;
using ReelRoulette.ServerApp.Hosting;
using ReelRoulette.Core.Tests;
using Xunit;

namespace ReelRoulette.ServerApp.Tests;

/// <summary>
/// On Windows, Avalonia draws the tray menu as its own window. These tests build that window from Avalonia's own
/// types, set up as its right-click handler does, inside the tray's real application, so they show what the menu
/// looks like on Windows without a Windows session.
/// </summary>
public sealed class TrayMenuWindowTests
{
    private static readonly Lazy<HeadlessUnitTestSession> Session =
        new(() => HeadlessUnitTestSession.StartNew(typeof(TrayHeadlessEntry)));

    [Fact]
    public void ThemedTrayMenuWindowShowsEveryMenuItem()
    {
        var logDirectory = Path.Combine(TestIsolation.RootDirectory, "tray-menu-" + Guid.NewGuid().ToString("N"));
        var host = CreateHost(new ServerLogService(logDirectory));

        var result = Run(() =>
        {
            host.RegisterMenuProbe();
            var window = OpenMenuWindow(host.CreateMenu());
            Dispatcher.UIThread.RunJobs();
            AvaloniaHeadlessPlatform.ForceRenderTimerTick();
            Dispatcher.UIThread.RunJobs();

            var size = window.ClientSize;
            var labels = window.GetVisualDescendants().OfType<MenuItem>().Select(item => item.Header as string).ToList();
            window.Close();
            Dispatcher.UIThread.RunJobs();
            return (size, labels);
        });

        Assert.True(result.size.Width > 0 && result.size.Height > 0, $"Tray menu window size was {result.size}.");
        Assert.Equal(
            ["Open Operator UI", "Launch Server on Startup", "Refresh Library", "Restart Server", "Stop Server / Exit"],
            result.labels);

        var log = File.ReadAllText(Path.Combine(logDirectory, "last.log"));
        Assert.Contains($"[info] Tray menu opened ({result.size.Width:0}x{result.size.Height:0}, 5 items).", log);
        Assert.Contains("[info] Tray menu closed after ", log);
    }

    private static readonly TimeSpan RunTimeout = TimeSpan.FromSeconds(30);

    private static T Run<T>(Func<T> action, [CallerMemberName] string testName = "")
    {
        var task = Session.Value.Dispatch(action, CancellationToken.None);
        if (!task.Wait(RunTimeout))
        {
            throw new TimeoutException(
                $"The headless UI thread did not finish {testName} within {RunTimeout.TotalSeconds:0} seconds.");
        }

        return task.GetAwaiter().GetResult();
    }

    private static Window OpenMenuWindow(NativeMenu menu)
    {
        // Mirrors Avalonia.Win32 TrayIconImpl.OnRightClicked. Its types are private; if an Avalonia upgrade renames
        // them, re-check the Windows tray menu by hand and update this setup to match the new right-click handler.
        var trayIconImpl = Assembly.Load("Avalonia.Win32").GetType("Avalonia.Win32.TrayIconImpl")
            ?? throw new InvalidOperationException("Avalonia.Win32.TrayIconImpl not found; re-check the Windows tray menu.");
        var windowType = trayIconImpl.GetNestedType("TrayPopupRoot", BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("TrayIconImpl.TrayPopupRoot not found; re-check the Windows tray menu.");
        var presenterType = trayIconImpl.GetNestedType("TrayIconMenuFlyoutPresenter", BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("TrayIconImpl.TrayIconMenuFlyoutPresenter not found; re-check the Windows tray menu.");

        var window = (Window)Activator.CreateInstance(windowType, nonPublic: true)!;
        window.Name = AvaloniaTrayHostUi.MenuWindowNamePrefix + "ReelRoulette Server";
        window.WindowDecorations = WindowDecorations.None;
        window.SizeToContent = SizeToContent.WidthAndHeight;
        window.Background = null;
        window.TransparencyLevelHint = [WindowTransparencyLevel.Transparent];
        var presenter = (MenuFlyoutPresenter)Activator.CreateInstance(presenterType, nonPublic: true)!;
        presenter.ItemsSource = menu.Items;
        window.Content = presenter;
        window.Position = new PixelPoint(100, 100);
        window.Show();
        return window;
    }

    private static AvaloniaTrayHostUi CreateHost(ServerLogService serverLog)
    {
        return new AvaloniaTrayHostUi(
            NullLogger.Instance,
            serverLog,
            "http://localhost/operator",
            iconPath: "",
            onRefreshLibrary: _ => Task.CompletedTask,
            onRestart: _ => Task.FromResult((true, "")),
            onStop: _ => Task.FromResult((true, "")),
            getStartupLaunchStatus: _ => Task.FromResult(new StartupLaunchStatus(Supported: false, LaunchServerOnStartup: false, Message: "")),
            setStartupLaunchEnabled: (_, _) => Task.FromResult(new StartupLaunchResult(Accepted: false, Supported: false, LaunchServerOnStartup: false, Message: "")));
    }
}

public static class TrayHeadlessEntry
{
    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<AvaloniaTrayHostUi.TrayApp>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = true });
    }
}
