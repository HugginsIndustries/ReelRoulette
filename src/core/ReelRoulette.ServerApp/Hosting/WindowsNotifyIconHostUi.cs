using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ReelRoulette.ServerApp.Hosting;

internal sealed class WindowsNotifyIconHostUi : IHostUi
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
    private Control? _uiInvoker;
    private NotifyIcon? _notifyIcon;
    private TaskCompletionSource<bool>? _readyTcs;
    private TaskCompletionSource<bool>? _closedTcs;
    private bool _started;
    private int _shutdownRequested;

    public WindowsNotifyIconHostUi(
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
                Name = "ServerApp.TrayUi"
            };
            _uiThread.SetApartmentState(ApartmentState.STA);
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
        NotifyIcon? trayIcon = null;
        ContextMenuStrip? menu = null;
        Control? uiInvoker = null;
        UserPreferenceChangedEventHandler? userPreferenceChangedHandler = null;
        try
        {
            menu = new ContextMenuStrip();
            var openItem = new ToolStripMenuItem("Open Operator UI");
            var startupItem = new ToolStripMenuItem("Launch Server on Startup");
            var refreshItem = new ToolStripMenuItem("Refresh Library");
            var restartItem = new ToolStripMenuItem("Restart Server");
            var stopItem = new ToolStripMenuItem("Stop Server / Exit");
            menu.Items.Add(openItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(startupItem);
            menu.Items.Add(refreshItem);
            menu.Items.Add(restartItem);
            menu.Items.Add(stopItem);

            uiInvoker = new Control();
            uiInvoker.CreateControl();
            _uiInvoker = uiInvoker;
            ApplyMenuTheme(menu);

            userPreferenceChangedHandler = (_, args) =>
            {
                if (args.Category is not (UserPreferenceCategory.General or UserPreferenceCategory.VisualStyle or UserPreferenceCategory.Color))
                {
                    return;
                }

                if (uiInvoker.IsDisposed)
                {
                    return;
                }

                try
                {
                    uiInvoker.BeginInvoke(new Action(() =>
                    {
                        if (!menu.IsDisposed)
                        {
                            ApplyMenuTheme(menu);
                        }
                    }));
                }
                catch (InvalidOperationException)
                {
                    // UI thread is gone; no action needed.
                }
            };
            SystemEvents.UserPreferenceChanged += userPreferenceChangedHandler;

            trayIcon = new NotifyIcon
            {
                Text = "ReelRoulette Server",
                Icon = LoadTrayIcon(),
                ContextMenuStrip = menu,
                Visible = true
            };
            _notifyIcon = trayIcon;

            openItem.Click += (_, _) => OpenOperatorUi();
            startupItem.Click += (_, _) => _ = ToggleStartupLaunchAsync(startupItem);
            refreshItem.Click += (_, _) => _ = RunMenuActionAsync("refresh", _onRefreshLibrary);
            restartItem.Click += (_, _) => _ = RunRestartOrStopActionAsync("restart", _onRestart, requestExit: true);
            stopItem.Click += (_, _) => _ = RunRestartOrStopActionAsync("stop", _onStop, requestExit: true);
            _ = InitializeStartupToggleAsync(startupItem);

            _readyTcs?.TrySetResult(true);
            Application.Run();
        }
        catch (Exception ex)
        {
            _readyTcs?.TrySetException(ex);
            _logger.LogError(ex, "Windows tray UI failed to initialize.");
        }
        finally
        {
            try
            {
                if (trayIcon is not null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
            }
            catch
            {
            }

            try
            {
                if (userPreferenceChangedHandler is not null)
                {
                    SystemEvents.UserPreferenceChanged -= userPreferenceChangedHandler;
                }
            }
            catch
            {
            }

            try
            {
                menu?.Dispose();
            }
            catch
            {
            }

            try
            {
                uiInvoker?.Dispose();
            }
            catch
            {
            }

            _uiInvoker = null;
            _notifyIcon = null;
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

    private Icon LoadTrayIcon()
    {
        try
        {
            if (File.Exists(_iconPath))
            {
                return new Icon(_iconPath);
            }

            _logger.LogWarning("Shared icon path was not found at {IconPath}; using fallback system icon.", _iconPath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load shared icon from {IconPath}; using fallback system icon.", _iconPath);
        }

        return SystemIcons.Application;
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
        Func<CancellationToken, Task<(bool Accepted, string Message)>>
            action,
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

    private async Task RequestUiExitAsync(CancellationToken cancellationToken)
    {
        Interlocked.Exchange(ref _shutdownRequested, 1);

        Control? invoker;
        lock (_sync)
        {
            invoker = _uiInvoker;
        }

        if (invoker is null || invoker.IsDisposed)
        {
            return;
        }

        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            invoker.BeginInvoke(new Action(() =>
            {
                try
                {
                    if (_notifyIcon is not null)
                    {
                        _notifyIcon.Visible = false;
                    }

                    Application.ExitThread();
                    tcs.TrySetResult(true);
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            }));
        }
        catch (InvalidOperationException)
        {
            return;
        }

        await tcs.Task.WaitAsync(cancellationToken);
    }

    private async Task InitializeStartupToggleAsync(ToolStripMenuItem startupItem)
    {
        try
        {
            var status = await _getStartupLaunchStatus(CancellationToken.None);
            await SetStartupMenuStateAsync(startupItem, status.Supported, status.LaunchServerOnStartup);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load startup-launch status for tray menu.");
            await SetStartupMenuStateAsync(startupItem, supported: true, enabled: false);
        }
    }

    private async Task ToggleStartupLaunchAsync(ToolStripMenuItem startupItem)
    {
        if (Volatile.Read(ref _shutdownRequested) == 1)
        {
            return;
        }

        var requestedEnabled = !startupItem.Checked;
        try
        {
            startupItem.Enabled = false;
            var result = await _setStartupLaunchEnabled(requestedEnabled, CancellationToken.None);
            if (!result.Accepted)
            {
                _logger.LogWarning("Tray startup-launch toggle was rejected: {Message}", result.Message);
                return;
            }

            await SetStartupMenuStateAsync(startupItem, result.Supported, result.LaunchServerOnStartup);
            _logger.LogInformation("Tray startup-launch toggle applied: {Message}", result.Message);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tray startup-launch toggle failed.");
        }
        finally
        {
            if (!startupItem.IsDisposed)
            {
                startupItem.Enabled = true;
            }
        }
    }

    private static Task SetStartupMenuStateAsync(ToolStripMenuItem startupItem, bool supported, bool enabled)
    {
        startupItem.Checked = supported && enabled;
        startupItem.Enabled = supported;
        return Task.CompletedTask;
    }

    private static void ApplyMenuTheme(ContextMenuStrip menu)
    {
        var isLightTheme = IsWindowsAppsLightThemeEnabled();
        var background = isLightTheme ? Color.White : Color.FromArgb(32, 32, 32);
        var foreground = isLightTheme ? Color.Black : Color.White;
        var border = isLightTheme ? Color.FromArgb(198, 198, 198) : Color.FromArgb(68, 68, 68);
        var menuItemHover = isLightTheme ? Color.FromArgb(232, 240, 255) : Color.FromArgb(56, 56, 64);
        var menuItemPressed = isLightTheme ? Color.FromArgb(216, 230, 252) : Color.FromArgb(74, 74, 84);
        var separator = isLightTheme ? Color.FromArgb(220, 220, 220) : Color.FromArgb(82, 82, 82);

        menu.BackColor = background;
        menu.ForeColor = foreground;
        menu.Renderer = new ToolStripProfessionalRenderer(
            new TrayMenuColorTable(
                background,
                border,
                menuItemHover,
                menuItemPressed,
                separator));

        foreach (ToolStripItem item in menu.Items)
        {
            ApplyToolStripItemTheme(item, background, foreground);
        }
    }

    private static void ApplyToolStripItemTheme(ToolStripItem item, Color background, Color foreground)
    {
        item.BackColor = background;
        item.ForeColor = foreground;

        if (item is ToolStripMenuItem menuItem)
        {
            foreach (ToolStripItem dropDownItem in menuItem.DropDownItems)
            {
                ApplyToolStripItemTheme(dropDownItem, background, foreground);
            }
        }
    }

    private static bool IsWindowsAppsLightThemeEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                writable: false);
            var value = key?.GetValue("AppsUseLightTheme");
            return value switch
            {
                int intValue => intValue != 0,
                long longValue => longValue != 0L,
                _ => true
            };
        }
        catch
        {
            return true;
        }
    }

    private sealed class TrayMenuColorTable(
        Color background,
        Color border,
        Color menuItemHover,
        Color menuItemPressed,
        Color separator) : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => background;
        public override Color MenuBorder => border;
        public override Color MenuItemBorder => border;
        public override Color MenuItemSelected => menuItemHover;
        public override Color MenuItemSelectedGradientBegin => menuItemHover;
        public override Color MenuItemSelectedGradientEnd => menuItemHover;
        public override Color MenuItemPressedGradientBegin => menuItemPressed;
        public override Color MenuItemPressedGradientMiddle => menuItemPressed;
        public override Color MenuItemPressedGradientEnd => menuItemPressed;
        public override Color ImageMarginGradientBegin => background;
        public override Color ImageMarginGradientMiddle => background;
        public override Color ImageMarginGradientEnd => background;
        public override Color SeparatorDark => separator;
        public override Color SeparatorLight => separator;
    }
}
