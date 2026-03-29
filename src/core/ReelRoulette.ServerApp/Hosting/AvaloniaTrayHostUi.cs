using System.Diagnostics;
using System.Threading;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;

namespace ReelRoulette.ServerApp.Hosting;

internal sealed class AvaloniaTrayHostUi : IHostUi
{
    private readonly ILogger _logger;
    private readonly string _operatorUrl;
    private readonly string _iconPath;
    private readonly Func<CancellationToken, Task> _onRefreshLibrary;
    private readonly Func<CancellationToken, Task<(bool Accepted, string Message)>> _onRestart;
    private readonly Func<CancellationToken, Task<(bool Accepted, string Message)>> _onStop;
    private readonly Func<CancellationToken, Task<StartupLaunchStatus>> _getStartupLaunchStatus;
    private readonly Func<bool, CancellationToken, Task<StartupLaunchResult>> _setStartupLaunchEnabled;
    private readonly object _sync = new();

    private Thread? _uiThread;
    private TaskCompletionSource<bool>? _readyTcs;
    private TaskCompletionSource<bool>? _closedTcs;
    private bool _started;
    private int _shutdownRequested;
    private TrayIcon? _trayIcon;
    private NativeMenuItem? _startupItem;
    private IClassicDesktopStyleApplicationLifetime? _desktopLifetime;

    public AvaloniaTrayHostUi(
        ILogger logger,
        string operatorUrl,
        string iconPath,
        Func<CancellationToken, Task> onRefreshLibrary,
        Func<CancellationToken, Task<(bool Accepted, string Message)>> onRestart,
        Func<CancellationToken, Task<(bool Accepted, string Message)>> onStop,
        Func<CancellationToken, Task<StartupLaunchStatus>> getStartupLaunchStatus,
        Func<bool, CancellationToken, Task<StartupLaunchResult>> setStartupLaunchEnabled)
    {
        _logger = logger;
        _operatorUrl = operatorUrl;
        _iconPath = iconPath;
        _onRefreshLibrary = onRefreshLibrary;
        _onRestart = onRestart;
        _onStop = onStop;
        _getStartupLaunchStatus = getStartupLaunchStatus;
        _setStartupLaunchEnabled = setStartupLaunchEnabled;
    }

    public void Start()
    {
        lock (_sync)
        {
            if (_started)
            {
                return;
            }

            _started = true;
            _readyTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            _closedTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            _uiThread = new Thread(RunUiLoop)
            {
                IsBackground = true,
                Name = "ServerApp.AvaloniaTrayUi"
            };
            // ApartmentState is required for COM-related work on Windows; avoid calling it on non-Windows.
            if (OperatingSystem.IsWindows())
            {
                _uiThread.SetApartmentState(ApartmentState.STA);
            }
            _uiThread.Start();
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        Task? closedTask;
        lock (_sync)
        {
            closedTask = _closedTcs?.Task;
        }

        if (closedTask is null)
        {
            return;
        }

        try
        {
            await WaitForReadyAsync(cancellationToken);
            await RequestUiExitAsync(cancellationToken);
            await closedTask.WaitAsync(cancellationToken);

            Thread? uiThread;
            lock (_sync)
            {
                uiThread = _uiThread;
            }

            if (uiThread is { IsAlive: true })
            {
                if (!uiThread.Join(TimeSpan.FromSeconds(15)))
                {
                    _logger.LogWarning("Avalonia tray UI thread did not exit within timeout during shutdown.");
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Tray UI stop encountered a non-fatal error.");
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await StopAsync(CancellationToken.None);
        }
        catch
        {
            // Dispose must not throw during host shutdown.
        }
    }

    private void RunUiLoop()
    {
        try
        {
            TrayApp.Owner = this;
            AppBuilder
                .Configure<TrayApp>()
                .UsePlatformDetect()
                .LogToTrace()
                .StartWithClassicDesktopLifetime(Array.Empty<string>());
        }
        catch (Exception ex)
        {
            _readyTcs?.TrySetException(ex);
            _logger.LogError(ex, "Avalonia tray UI failed to initialize.");
        }
        finally
        {
            _trayIcon = null;
            _startupItem = null;
            _desktopLifetime = null;
            _closedTcs?.TrySetResult(true);
        }
    }

    private async Task WaitForReadyAsync(CancellationToken cancellationToken)
    {
        Task? readyTask;
        lock (_sync)
        {
            readyTask = _readyTcs?.Task;
        }

        if (readyTask is null)
        {
            return;
        }

        await readyTask.WaitAsync(cancellationToken);
    }

    private Task RequestUiExitAsync(CancellationToken cancellationToken)
    {
        Interlocked.Exchange(ref _shutdownRequested, 1);
        // During shutdown, the UI thread/dispatcher can already be stopping (especially on Linux/DBus-backed
        // tray integration). Avoid synchronous dispatcher waits that can throw/cascade TaskCanceledException.
        //
        // Also, ensure we always request the classic desktop lifetime to shut down; otherwise Avalonia-created
        // non-background threads can keep `dotnet run` alive after the server host stops.
        try
        {
            Dispatcher.UIThread.Post(() =>
            {
                try
                {
                    if (_trayIcon is not null)
                    {
                        _trayIcon.IsVisible = false;
                        // On Linux/DBus status notifier backends, explicit tray disposal during shutdown can race
                        // the dispatcher teardown and surface TaskCanceledException as an unhandled shutdown error.
                        // Let process teardown own final disposal there.
                        if (!OperatingSystem.IsLinux())
                        {
                            _trayIcon.Dispose();
                        }
                        _trayIcon = null;
                    }

                    _desktopLifetime?.Shutdown();
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Tray UI shutdown encountered a non-fatal error.");
                }
            }, DispatcherPriority.Normal);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Tray UI shutdown dispatch encountered a non-fatal error.");
        }

        // Fallback: if posting to the dispatcher isn't possible (or doesn't run because the dispatcher is already
        // shutting down), attempt to request shutdown directly. We still keep this non-throwing.
        try
        {
            _desktopLifetime?.Shutdown();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Tray UI lifetime shutdown fallback encountered a non-fatal error.");
        }

        return Task.CompletedTask;
    }

    private void OnTrayAppInitialized(Application application, IClassicDesktopStyleApplicationLifetime desktopLifetime)
    {
        _desktopLifetime = desktopLifetime;
        try
        {
            var menu = CreateMenu();
            var icon = new TrayIcon
            {
                ToolTipText = "ReelRoulette Server",
                Menu = menu,
                IsVisible = true
            };

            var trayIcon = LoadTrayIcon();
            if (trayIcon is not null)
            {
                icon.Icon = trayIcon;
            }

            _trayIcon = icon;
            _ = InitializeStartupToggleAsync();
            var trayIcons = new TrayIcons();
            trayIcons.Add(icon);
            TrayIcon.SetIcons(application, trayIcons);
            _readyTcs?.TrySetResult(true);
        }
        catch (Exception ex)
        {
            _readyTcs?.TrySetException(ex);
            _logger.LogError(ex, "Failed to initialize tray icon/menu.");
            _desktopLifetime?.Shutdown();
        }
    }

    private NativeMenu CreateMenu()
    {
        var menu = new NativeMenu();

        var openItem = new NativeMenuItem("Open Operator UI");
        openItem.Click += (_, _) => OpenOperatorUi();
        menu.Add(openItem);

        menu.Add(new NativeMenuItemSeparator());

        var startupItem = new NativeMenuItem("Launch Server on Startup")
        {
            ToggleType = NativeMenuItemToggleType.CheckBox
        };
        startupItem.Click += (_, _) => _ = ToggleStartupLaunchAsync();
        _startupItem = startupItem;
        menu.Add(startupItem);

        var refreshItem = new NativeMenuItem("Refresh Library");
        refreshItem.Click += (_, _) => _ = RunMenuActionAsync("refresh", _onRefreshLibrary);
        menu.Add(refreshItem);

        var restartItem = new NativeMenuItem("Restart Server");
        restartItem.Click += (_, _) => _ = RunRestartOrStopActionAsync("restart", _onRestart, requestExit: true);
        menu.Add(restartItem);

        var stopItem = new NativeMenuItem("Stop Server / Exit");
        stopItem.Click += (_, _) => _ = RunRestartOrStopActionAsync("stop", _onStop, requestExit: true);
        menu.Add(stopItem);

        return menu;
    }

    private WindowIcon? LoadTrayIcon()
    {
        try
        {
            if (File.Exists(_iconPath))
            {
                return new WindowIcon(_iconPath);
            }

            _logger.LogWarning("Shared icon path was not found at {IconPath}; using platform default tray icon.", _iconPath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load shared icon from {IconPath}; using platform default tray icon.", _iconPath);
        }

        return null;
    }

    private void OpenOperatorUi()
    {
        if (Volatile.Read(ref _shutdownRequested) == 1)
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = _operatorUrl,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to open operator UI URL {OperatorUrl}.", _operatorUrl);
        }
    }

    private async Task RunMenuActionAsync(string actionName, Func<CancellationToken, Task> action)
    {
        if (Volatile.Read(ref _shutdownRequested) == 1)
        {
            return;
        }

        try
        {
            await action(CancellationToken.None);
            _logger.LogInformation("Tray menu action completed ({Action}).", actionName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tray menu action failed ({Action}).", actionName);
        }
    }

    private async Task RunRestartOrStopActionAsync(
        string actionName,
        Func<CancellationToken, Task<(bool Accepted, string Message)>> action,
        bool requestExit = false)
    {
        if (Volatile.Read(ref _shutdownRequested) == 1)
        {
            return;
        }

        try
        {
            var result = await action(CancellationToken.None);
            if (!result.Accepted)
            {
                _logger.LogWarning("Tray menu action was rejected ({Action}): {Message}", actionName, result.Message);
                return;
            }

            _logger.LogInformation("Tray menu action completed ({Action}): {Message}", actionName, result.Message);
            if (requestExit)
            {
                await RequestUiExitAsync(CancellationToken.None);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tray menu action failed ({Action}).", actionName);
        }
    }

    private async Task InitializeStartupToggleAsync()
    {
        try
        {
            var status = await _getStartupLaunchStatus(CancellationToken.None).ConfigureAwait(false);
            await SetStartupMenuStateAsync(status.Supported, status.LaunchServerOnStartup).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load startup-launch status for tray menu.");
            await SetStartupMenuStateAsync(supported: true, enabled: false).ConfigureAwait(false);
        }
    }

    private async Task ToggleStartupLaunchAsync()
    {
        if (Volatile.Read(ref _shutdownRequested) == 1)
        {
            return;
        }

        var prep = await Dispatcher.UIThread.InvokeAsync(() =>
        {
            var item = _startupItem;
            if (item is null)
            {
                return (HasItem: false, Requested: false);
            }

            item.IsEnabled = false;
            return (HasItem: true, Requested: !item.IsChecked);
        });

        if (!prep.HasItem)
        {
            return;
        }

        try
        {
            var result = await _setStartupLaunchEnabled(prep.Requested, CancellationToken.None).ConfigureAwait(false);
            if (!result.Accepted)
            {
                _logger.LogWarning("Tray startup-launch toggle was rejected: {Message}", result.Message);
                return;
            }

            await SetStartupMenuStateAsync(result.Supported, result.LaunchServerOnStartup).ConfigureAwait(false);
            _logger.LogInformation("Tray startup-launch toggle applied: {Message}", result.Message);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tray startup-launch toggle failed.");
        }
        finally
        {
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                if (_startupItem is not null)
                {
                    _startupItem.IsEnabled = true;
                }
            });
        }
    }

    private async Task SetStartupMenuStateAsync(bool supported, bool enabled)
    {
        await Dispatcher.UIThread.InvokeAsync(() =>
        {
            var startupItem = _startupItem;
            if (startupItem is null)
            {
                return;
            }

            startupItem.IsChecked = supported && enabled;
            startupItem.IsEnabled = supported;
        });
    }

    private sealed class TrayApp : Application
    {
        public static AvaloniaTrayHostUi? Owner { get; set; }

        public override void OnFrameworkInitializationCompleted()
        {
            if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
            {
                var appOwner = Owner;
                if (appOwner is not null)
                {
                    appOwner.OnTrayAppInitialized(this, desktop);
                }
            }

            base.OnFrameworkInitializationCompleted();
        }
    }
}
