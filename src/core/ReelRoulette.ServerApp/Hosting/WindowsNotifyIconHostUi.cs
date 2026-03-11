using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace ReelRoulette.ServerApp.Hosting;

internal sealed class WindowsNotifyIconHostUi : IHostUi
{
    private readonly ILogger _logger;
    private readonly string _operatorUrl;
    private readonly string _iconPath;
    private readonly Func<CancellationToken, Task> _onRefreshLibrary;
    private readonly Func<CancellationToken, Task<(bool Accepted, string Message)>> _onRestart;
    private readonly Func<CancellationToken, Task<(bool Accepted, string Message)>> _onStop;
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
        Func<CancellationToken, Task<(bool Accepted, string Message)>> onStop)
    {
        _logger = logger;
        _operatorUrl = operatorUrl;
        _iconPath = iconPath;
        _onRefreshLibrary = onRefreshLibrary;
        _onRestart = onRestart;
        _onStop = onStop;
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
        try
        {
            menu = new ContextMenuStrip();
            var openItem = new ToolStripMenuItem("Open Operator UI");
            var refreshItem = new ToolStripMenuItem("Refresh Library");
            var restartItem = new ToolStripMenuItem("Restart Server");
            var stopItem = new ToolStripMenuItem("Stop Server / Exit");
            menu.Items.Add(openItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(refreshItem);
            menu.Items.Add(restartItem);
            menu.Items.Add(stopItem);

            uiInvoker = new Control();
            uiInvoker.CreateControl();
            _uiInvoker = uiInvoker;

            trayIcon = new NotifyIcon
            {
                Text = "ReelRoulette Server",
                Icon = LoadTrayIcon(),
                ContextMenuStrip = menu,
                Visible = true
            };
            _notifyIcon = trayIcon;

            openItem.Click += (_, _) => OpenOperatorUi();
            refreshItem.Click += (_, _) => _ = RunMenuActionAsync("refresh", _onRefreshLibrary);
            restartItem.Click += (_, _) => _ = RunRestartOrStopActionAsync("restart", _onRestart, requestExit: true);
            stopItem.Click += (_, _) => _ = RunRestartOrStopActionAsync("stop", _onStop, requestExit: true);

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
}
