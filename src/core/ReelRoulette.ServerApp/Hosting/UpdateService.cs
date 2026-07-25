using Microsoft.Extensions.Hosting;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Velopack;

namespace ReelRoulette.ServerApp.Hosting;

public sealed record ServerUpdateStatus(
    string Phase,
    string? RunningVersion,
    string? TargetVersion,
    string Message,
    bool VelopackInstalled);

public sealed record ServerUpdateActionResult(
    bool Accepted,
    string Phase,
    string? RunningVersion,
    string? TargetVersion,
    string Message,
    bool VelopackInstalled);

public sealed class UpdateService : IServerUpdateChannelCoordinator
{
    internal const string PublicFeedBase = "https://f004.backblazeb2.com/file/hugginsindustries-releases";

    private readonly ILogger<UpdateService> _logger;
    private readonly CoreSettingsService _settings;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly object _stateLock = new();
    private int _applyInProgress;

    private string _phase = ServerUpdatePhases.Idle;
    private string? _runningVersion;
    private string? _targetVersion;
    private UpdateInfo? _availableUpdate;
    private VelopackAsset? _sessionReadyRelease;
    private bool? _velopackInstalled;

    public UpdateService(
        ILogger<UpdateService> logger,
        CoreSettingsService settings,
        IHostApplicationLifetime lifetime)
    {
        _logger = logger;
        _settings = settings;
        _lifetime = lifetime;
    }

    public void NotifyDevChannelChanged()
    {
        _logger.LogInformation("Dev update channel changed; scheduling an immediate update check.");
        _ = RunImmediateCheckAfterDevChannelChangeAsync();
    }

    private async Task RunImmediateCheckAfterDevChannelChangeAsync()
    {
        try
        {
            await CheckForUpdatesAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Immediate update check after dev channel change failed.");
        }
    }

    internal static (string FeedUrl, string ExplicitChannel) ComposeFeedAndChannel(bool devChannelEnabled)
    {
        var tierSuffix = devChannelEnabled ? "-dev" : string.Empty;
        var osKey = OperatingSystem.IsWindows() ? "win" : "linux";
        var explicitChannel = $"{osKey}-server{tierSuffix}";
        var feedUrl = $"{PublicFeedBase}/reelroulette/server{tierSuffix}";
        return (feedUrl, explicitChannel);
    }

    internal static UpdateManager CreateUpdateManager(bool devChannelEnabled)
    {
        var (feedUrl, explicitChannel) = ComposeFeedAndChannel(devChannelEnabled);
        var options = new UpdateOptions
        {
            ExplicitChannel = explicitChannel,
            AllowVersionDowngrade = true
        };
        return new UpdateManager(feedUrl, options);
    }

    public ServerUpdateStatus GetStatus()
    {
        lock (_stateLock)
        {
            RefreshInstallationSnapshotIfNeededLocked();
            return BuildStatusLocked();
        }
    }

    private void RefreshInstallationSnapshotIfNeededLocked()
    {
        if (_velopackInstalled.HasValue && _phase != ServerUpdatePhases.Idle)
        {
            return;
        }

        var devChannelEnabled = _settings.GetControlRuntimeSettings().DevChannelEnabled;
        var manager = CreateUpdateManager(devChannelEnabled);
        _velopackInstalled = manager.IsInstalled;
        _runningVersion = ServerRunningVersion.Resolve(manager);
        if (!manager.IsInstalled)
        {
            _phase = ServerUpdatePhases.NotInstalled;
            return;
        }
    }

    public async Task<ServerUpdateActionResult> CheckForUpdatesAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.CompareExchange(ref _applyInProgress, 0, 0) != 0)
        {
            return ToActionResult(false, GetStatus(), "Update apply is in progress; check skipped.");
        }

        var devChannelEnabled = _settings.GetControlRuntimeSettings().DevChannelEnabled;
        var (feedUrl, explicitChannel) = ComposeFeedAndChannel(devChannelEnabled);
        var manager = CreateUpdateManager(devChannelEnabled);

        if (!manager.IsInstalled)
        {
            lock (_stateLock)
            {
                _velopackInstalled = false;
                _phase = ServerUpdatePhases.NotInstalled;
                _runningVersion = ServerRunningVersion.ResolveFromEntryAssembly();
                _targetVersion = null;
                _availableUpdate = null;
                _sessionReadyRelease = null;
            }

            _logger.LogDebug(
                "Skipping update check because the server is not running as an installed Velopack build (feed={Feed}, channel={Channel}).",
                feedUrl,
                explicitChannel);

            return ToActionResult(
                true,
                GetStatus(),
                "Updates are available only for Velopack-installed server builds.");
        }

        lock (_stateLock)
        {
            RefreshInstallationSnapshotIfNeededLocked();
            if (_phase == ServerUpdatePhases.Downloading)
            {
                return ToActionResult(false, BuildStatusLocked(), "A download is already in progress.");
            }

            _runningVersion = ServerRunningVersion.Resolve(manager);
        }

        _logger.LogInformation(
            "Checking for server updates (channel={Channel}, feed={Feed}, current={CurrentVersion}).",
            explicitChannel,
            feedUrl,
            manager.CurrentVersion);

        UpdateInfo? updateInfo;
        try
        {
            updateInfo = await manager.CheckForUpdatesAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Server update check failed.");
            return ToActionResult(false, GetStatus(), "Update check failed. See server logs for details.");
        }

        if (cancellationToken.IsCancellationRequested)
        {
            return ToActionResult(false, GetStatus(), "Update check was canceled.");
        }

        lock (_stateLock)
        {
            _velopackInstalled = true;
            _runningVersion = ServerRunningVersion.Resolve(manager);

            if (updateInfo == null)
            {
                _phase = ServerUpdatePhases.UpToDate;
                _targetVersion = null;
                _availableUpdate = null;
                _sessionReadyRelease = null;
                return ToActionResult(
                    true,
                    BuildStatusLocked(),
                    $"Up to date ({_runningVersion}).");
            }

            _availableUpdate = updateInfo;
            _targetVersion = updateInfo.TargetFullRelease.Version.ToString();

            if (_sessionReadyRelease != null &&
                string.Equals(_sessionReadyRelease.Version.ToString(), _targetVersion, StringComparison.OrdinalIgnoreCase))
            {
                _phase = ServerUpdatePhases.UpdateReady;
                return ToActionResult(
                    true,
                    BuildStatusLocked(),
                    $"Update {_targetVersion} downloaded and ready to apply.");
            }

            _sessionReadyRelease = null;
            _phase = ServerUpdatePhases.UpdateAvailable;
            return ToActionResult(
                true,
                BuildStatusLocked(),
                $"Update available: {_targetVersion}.");
        }
    }

    public async Task<ServerUpdateActionResult> DownloadAvailableUpdateAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.CompareExchange(ref _applyInProgress, 0, 0) != 0)
        {
            return ToActionResult(false, GetStatus(), "Update apply is in progress; download refused.");
        }

        UpdateInfo? updateInfo;
        string? targetVersion;
        lock (_stateLock)
        {
            RefreshInstallationSnapshotIfNeededLocked();
            if (_phase == ServerUpdatePhases.NotInstalled)
            {
                return ToActionResult(false, BuildStatusLocked(), "Download is unavailable when not running as an installed Velopack build.");
            }

            if (_phase == ServerUpdatePhases.UpdateReady)
            {
                return ToActionResult(
                    true,
                    BuildStatusLocked(),
                    $"Update {_targetVersion} is already downloaded and ready to apply.");
            }

            if (_phase == ServerUpdatePhases.Downloading)
            {
                return ToActionResult(false, BuildStatusLocked(), "A download is already in progress.");
            }

            if (_availableUpdate == null || _phase != ServerUpdatePhases.UpdateAvailable)
            {
                return ToActionResult(false, BuildStatusLocked(), "No update is available to download. Check for updates first.");
            }

            updateInfo = _availableUpdate;
            targetVersion = _targetVersion;
            _phase = ServerUpdatePhases.Downloading;
        }

        var devChannelEnabled = _settings.GetControlRuntimeSettings().DevChannelEnabled;
        var manager = CreateUpdateManager(devChannelEnabled);

        _logger.LogInformation("Downloading server update {TargetVersion}.", targetVersion);

        try
        {
            await manager.DownloadUpdatesAsync(updateInfo, progress: null, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Server update download failed.");
            lock (_stateLock)
            {
                _phase = ServerUpdatePhases.UpdateAvailable;
            }

            return ToActionResult(false, GetStatus(), "Download failed. See server logs for details.");
        }

        if (cancellationToken.IsCancellationRequested)
        {
            lock (_stateLock)
            {
                _phase = ServerUpdatePhases.UpdateAvailable;
            }

            return ToActionResult(false, GetStatus(), "Download was canceled.");
        }

        lock (_stateLock)
        {
            _sessionReadyRelease = updateInfo.TargetFullRelease;
            _targetVersion = updateInfo.TargetFullRelease.Version.ToString();
            _phase = ServerUpdatePhases.UpdateReady;
            return ToActionResult(
                true,
                BuildStatusLocked(),
                $"Update {_targetVersion} downloaded and ready to apply.");
        }
    }

    public ServerUpdateActionResult ApplyDownloadedUpdate()
    {
        if (Interlocked.CompareExchange(ref _applyInProgress, 1, 0) != 0)
        {
            return ToActionResult(false, GetStatus(), "An update apply or restart sequence is already in progress.");
        }

        VelopackAsset? readyRelease;
        string? targetVersion;
        lock (_stateLock)
        {
            RefreshInstallationSnapshotIfNeededLocked();
            if (_phase == ServerUpdatePhases.NotInstalled)
            {
                Interlocked.Exchange(ref _applyInProgress, 0);
                return ToActionResult(false, BuildStatusLocked(), "Apply is unavailable when not running as an installed Velopack build.");
            }

            if (_phase != ServerUpdatePhases.UpdateReady || _sessionReadyRelease == null)
            {
                Interlocked.Exchange(ref _applyInProgress, 0);
                return ToActionResult(false, BuildStatusLocked(), "No downloaded update is ready to apply.");
            }

            readyRelease = _sessionReadyRelease;
            targetVersion = _targetVersion;
            _phase = ServerUpdatePhases.Restarting;
        }

        var devChannelEnabled = _settings.GetControlRuntimeSettings().DevChannelEnabled;
        var manager = CreateUpdateManager(devChannelEnabled);

        _logger.LogInformation(
            "Applying server update {TargetVersion}; scheduling graceful shutdown and Velopack restart.",
            targetVersion);

        _ = Task.Run(() =>
        {
            try
            {
                manager.WaitExitThenApplyUpdates(
                    readyRelease,
                    silent: true,
                    restart: true,
                    restartArgs: null);

                _lifetime.StopApplication();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Server update apply failed after operator confirmation.");
                lock (_stateLock)
                {
                    _phase = ServerUpdatePhases.UpdateReady;
                }

                Interlocked.Exchange(ref _applyInProgress, 0);
            }
        });

        return ToActionResult(
            true,
            GetStatus(),
            "Restarting to apply update. The operator UI will disconnect.");
    }

    private ServerUpdateStatus BuildStatusLocked()
    {
        var installed = _velopackInstalled ?? (_phase != ServerUpdatePhases.NotInstalled);
        var message = _phase switch
        {
            ServerUpdatePhases.NotInstalled => "Updates apply only to Velopack-installed server builds.",
            ServerUpdatePhases.Idle => "Update status unknown; check for updates.",
            ServerUpdatePhases.UpToDate => $"Up to date ({_runningVersion ?? "unknown"}).",
            ServerUpdatePhases.UpdateAvailable => $"Update available: {_targetVersion}.",
            ServerUpdatePhases.Downloading => $"Downloading update {_targetVersion}…",
            ServerUpdatePhases.UpdateReady => $"Update {_targetVersion} downloaded and ready to apply.",
            ServerUpdatePhases.Restarting => "Restarting to apply update…",
            _ => "Update status unavailable."
        };

        return new ServerUpdateStatus(_phase, _runningVersion, _targetVersion, message, installed);
    }

    private static ServerUpdateActionResult ToActionResult(bool accepted, ServerUpdateStatus status, string message)
    {
        return new ServerUpdateActionResult(
            accepted,
            status.Phase,
            status.RunningVersion,
            status.TargetVersion,
            message,
            status.VelopackInstalled);
    }
}

internal static class ServerUpdatePhases
{
    internal const string NotInstalled = "notInstalled";
    internal const string Idle = "idle";
    internal const string UpToDate = "upToDate";
    internal const string UpdateAvailable = "updateAvailable";
    internal const string Downloading = "downloading";
    internal const string UpdateReady = "updateReady";
    internal const string Restarting = "restarting";
}

public sealed class UpdateHostedService : BackgroundService
{
    internal static readonly TimeSpan StartupCheckDelay = TimeSpan.FromMinutes(1);
    internal static readonly TimeSpan CheckInterval = TimeSpan.FromHours(4);

    private readonly ILogger<UpdateHostedService> _logger;
    private readonly UpdateService _updateService;

    public UpdateHostedService(ILogger<UpdateHostedService> logger, UpdateService updateService)
    {
        _logger = logger;
        _updateService = updateService;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(StartupCheckDelay, stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }

        using var timer = new PeriodicTimer(CheckInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _updateService.CheckForUpdatesAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Server update check failed.");
            }

            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
                {
                    break;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
