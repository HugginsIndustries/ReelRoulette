using System.Diagnostics;
using System.Threading;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Logging;
using Avalonia.Themes.Fluent;
using Avalonia.Threading;
using Avalonia.VisualTree;
using ReelRoulette.Server.Services;

namespace ReelRoulette.ServerApp.Hosting;

internal sealed class AvaloniaTrayHostUi : IHostUi
{
    // Avalonia names the window it opens for the tray menu on Windows with this prefix.
    internal const string MenuWindowNamePrefix = "AvaloniaTrayPopupRoot_";

    private readonly ILogger _logger;
    private readonly ServerLogService _serverLog;
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
    private Exception? _uiFailure;
    private TrayIcon? _trayIcon;
    private NativeMenuItem? _startupItem;
    private IClassicDesktopStyleApplicationLifetime? _desktopLifetime;

    public AvaloniaTrayHostUi(
        ILogger logger,
        ServerLogService serverLog,
        string operatorUrl,
        string iconPath,
        Func<CancellationToken, Task> onRefreshLibrary,
        Func<CancellationToken, Task<(bool Accepted, string Message)>> onRestart,
        Func<CancellationToken, Task<(bool Accepted, string Message)>> onStop,
        Func<CancellationToken, Task<StartupLaunchStatus>> getStartupLaunchStatus,
        Func<bool, CancellationToken, Task<StartupLaunchResult>> setStartupLaunchEnabled)
    {
        _logger = logger;
        _serverLog = serverLog;
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
            RequestUiExit();
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
            Logger.Sink = new AvaloniaLastLogSink(_serverLog);
            // On Windows the tray menu is a temporary window, so the default last-window rule would end the tray
            // when the menu closes. Every intended exit shuts the tray down explicitly.
            AppBuilder
                .Configure<TrayApp>()
                .UsePlatformDetect()
                .StartWithClassicDesktopLifetime(Array.Empty<string>(), ShutdownMode.OnExplicitShutdown);
        }
        catch (Exception ex)
        {
            _uiFailure = ex;
            _readyTcs?.TrySetException(ex);
            _logger.LogError(ex, "Avalonia tray UI failed to initialize.");
        }
        finally
        {
            if (Volatile.Read(ref _shutdownRequested) == 0)
            {
                var reason = _uiFailure?.Message ?? "no error";
                _logger.LogWarning("Tray UI ended without a requested shutdown ({Reason}); the server keeps running.", reason);
                _serverLog.Append("warn", $"Tray UI ended without a requested shutdown ({reason}); the tray icon is gone and the server keeps running.");
            }

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

    private void RequestUiExit()
    {
        Interlocked.Exchange(ref _shutdownRequested, 1);
        // During shutdown, the UI thread/dispatcher can already be stopping (especially on Linux/DBus-backed
        // tray integration). Avoid synchronous dispatcher waits that can throw/cascade TaskCanceledException.
        //
        // The shutdown runs only on the UI thread. Shutting the lifetime down from another thread can wait forever
        // for the UI thread, which would block server shutdown. If the UI loop has already ended, the posted job
        // never runs, and StopAsync finds the tray closed.
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

                    ShutdownUiLoop();
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
    }

    private void ShutdownUiLoop()
    {
        // Throws off the UI thread instead of risking a shutdown that never finishes.
        Dispatcher.UIThread.VerifyAccess();
        _desktopLifetime?.Shutdown();
    }

    private void OnTrayAppInitialized(Application application, IClassicDesktopStyleApplicationLifetime desktopLifetime)
    {
        _desktopLifetime = desktopLifetime;
        try
        {
            Dispatcher.UIThread.UnhandledException += (_, e) =>
            {
                _logger.LogError(e.Exception, "Tray UI error.");
                _serverLog.Append("error", $"Tray UI error: {e.Exception.GetType().Name}: {e.Exception.Message}");
            };
            RegisterMenuProbe();

            var menu = CreateMenu();
            var icon = new TrayIcon
            {
                ToolTipText = "ReelRoulette Server",
                Menu = menu,
                IsVisible = true
            };
            icon.Clicked += (_, _) => _serverLog.Append("info", "Tray icon clicked.");

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
            _uiFailure = ex;
            _readyTcs?.TrySetException(ex);
            _logger.LogError(ex, "Failed to initialize tray icon/menu.");
            ShutdownUiLoop();
        }
    }

    /// <summary>
    /// Writes to <c>last.log</c> when the tray menu window opens, with its size and item count, and when it closes.
    /// The window exists only on Windows, where Avalonia draws the tray menu itself.
    /// </summary>
    internal void RegisterMenuProbe()
    {
        Window.WindowOpenedEvent.AddClassHandler<Window>((window, _) => OnWindowOpened(window));
    }

    private void OnWindowOpened(Window window)
    {
        if (window.Name?.StartsWith(MenuWindowNamePrefix, StringComparison.Ordinal) != true)
        {
            return;
        }

        var openTime = Stopwatch.StartNew();
        var closing = false;
        var lostFocus = false;
        window.Closing += (_, _) => closing = true;
        window.Deactivated += (_, _) => lostFocus |= !closing;
        window.Closed += (_, _) => _serverLog.Append(
            "info",
            $"Tray menu closed after {openTime.ElapsedMilliseconds} ms{(lostFocus ? " (lost focus)" : "")}.");

        // Layout runs after the window opens, so report the size once it has settled.
        Dispatcher.UIThread.Post(() =>
        {
            var size = window.ClientSize;
            var itemCount = window.GetVisualDescendants().OfType<MenuItem>().Count();
            var empty = size.Width < 1 || size.Height < 1 || itemCount == 0;
            _serverLog.Append(
                empty ? "warn" : "info",
                $"Tray menu opened ({size.Width:0}x{size.Height:0}, {itemCount} items){(empty ? "; nothing is visible" : "")}.");
        }, DispatcherPriority.Background);
    }

    private void AppendTrayWarning(string message, Exception? ex = null)
    {
        _serverLog.Append("warn", ex is null ? message : $"{message}: {ex.Message}");
    }

    internal NativeMenu CreateMenu()
    {
        var menu = new NativeMenu();

        var openItem = new NativeMenuItem("Open Operator UI");
        openItem.Click += (_, _) => OpenOperatorUi();
        menu.Add(openItem);

        menu.Add(new NativeMenuItemSeparator());

        var startupItem = new NativeMenuItem("Launch Server on Startup")
        {
            ToggleType = MenuItemToggleType.CheckBox
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
            AppendTrayWarning($"Tray could not open the Operator UI at {_operatorUrl}", ex);
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
            AppendTrayWarning($"Tray menu action failed ({actionName})", ex);
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
                AppendTrayWarning($"Tray menu action was rejected ({actionName}): {result.Message}");
                return;
            }

            _logger.LogInformation("Tray menu action completed ({Action}): {Message}", actionName, result.Message);
            if (requestExit)
            {
                RequestUiExit();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tray menu action failed ({Action}).", actionName);
            AppendTrayWarning($"Tray menu action failed ({actionName})", ex);
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
            AppendTrayWarning("Tray could not load the Launch Server on Startup state", ex);
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
                AppendTrayWarning($"Tray Launch Server on Startup toggle was rejected: {result.Message}");
                return;
            }

            await SetStartupMenuStateAsync(result.Supported, result.LaunchServerOnStartup).ConfigureAwait(false);
            _logger.LogInformation("Tray startup-launch toggle applied: {Message}", result.Message);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tray startup-launch toggle failed.");
            AppendTrayWarning("Tray Launch Server on Startup toggle failed", ex);
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

    internal sealed class TrayApp : Application
    {
        public static AvaloniaTrayHostUi? Owner { get; set; }

        public override void Initialize()
        {
            // On Windows, Avalonia draws the tray menu as its own window, and without a theme that menu has no
            // template, so it opens at zero size with no items. Linux draws the menu in the desktop shell.
            Styles.Add(new FluentTheme());
        }

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
