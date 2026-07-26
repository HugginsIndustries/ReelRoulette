using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;
using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Velopack;

namespace ReelRoulette;

public sealed record DesktopUpdateStatus(
    string Phase,
    string? RunningVersion,
    string? TargetVersion,
    string Message,
    bool VelopackInstalled);

public sealed record DesktopUpdateActionResult(
    bool Accepted,
    string Phase,
    string? RunningVersion,
    string? TargetVersion,
    string Message,
    bool VelopackInstalled);

public sealed class UpdateService
{
    internal const string PublicFeedBase = "https://f004.backblazeb2.com/file/hugginsindustries-releases";

    private readonly Func<bool> _readDevChannelEnabled;
    private readonly Action _shutdownApplication;
    private readonly object _stateLock = new();
    private int _applyInProgress;

    private string _phase = DesktopUpdatePhases.Idle;
    private string? _runningVersion;
    private string? _targetVersion;
    private UpdateInfo? _availableUpdate;
    private VelopackAsset? _sessionReadyRelease;
    private bool? _velopackInstalled;

    public UpdateService(Func<bool> readDevChannelEnabled, Action shutdownApplication)
    {
        _readDevChannelEnabled = readDevChannelEnabled;
        _shutdownApplication = shutdownApplication;
    }

    internal static (string FeedUrl, string ExplicitChannel) ComposeFeedAndChannel(bool devChannelEnabled)
    {
        var tierSuffix = devChannelEnabled ? "-dev" : string.Empty;
        var osKey = OperatingSystem.IsWindows() ? "win" : "linux";
        var explicitChannel = $"{osKey}-desktop{tierSuffix}";
        var feedUrl = $"{PublicFeedBase}/reelroulette/desktop{tierSuffix}";
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

    public void NotifyDevChannelChanged()
    {
        Log("Dev update channel changed; scheduling an immediate update check.");
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
            Log($"Immediate update check after dev channel change failed: {ex.Message}");
        }
    }

    public DesktopUpdateStatus GetStatus()
    {
        lock (_stateLock)
        {
            RefreshInstallationSnapshotIfNeededLocked();
            return BuildStatusLocked();
        }
    }

    private void RefreshInstallationSnapshotIfNeededLocked()
    {
        if (_velopackInstalled.HasValue && _phase != DesktopUpdatePhases.Idle)
        {
            return;
        }

        var devChannelEnabled = _readDevChannelEnabled();
        var manager = CreateUpdateManager(devChannelEnabled);
        _velopackInstalled = manager.IsInstalled;
        _runningVersion = DesktopRunningVersion.Resolve(manager);
        if (!manager.IsInstalled)
        {
            _phase = DesktopUpdatePhases.NotInstalled;
        }
    }

    public async Task<DesktopUpdateActionResult> CheckForUpdatesAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.CompareExchange(ref _applyInProgress, 0, 0) != 0)
        {
            return ToActionResult(false, GetStatus(), "Update apply is in progress; check skipped.");
        }

        var devChannelEnabled = _readDevChannelEnabled();
        var (feedUrl, explicitChannel) = ComposeFeedAndChannel(devChannelEnabled);
        var manager = CreateUpdateManager(devChannelEnabled);

        if (!manager.IsInstalled)
        {
            lock (_stateLock)
            {
                _velopackInstalled = false;
                _phase = DesktopUpdatePhases.NotInstalled;
                _runningVersion = DesktopRunningVersion.ResolveFromEntryAssembly();
                _targetVersion = null;
                _availableUpdate = null;
                _sessionReadyRelease = null;
            }

            Log($"Skipping update check because the desktop app is not running as an installed Velopack build (feed={feedUrl}, channel={explicitChannel}).");

            return ToActionResult(
                true,
                GetStatus(),
                "Updates are available only for Velopack-installed desktop builds.");
        }

        lock (_stateLock)
        {
            RefreshInstallationSnapshotIfNeededLocked();
            if (_phase == DesktopUpdatePhases.Downloading)
            {
                return ToActionResult(false, BuildStatusLocked(), "A download is already in progress.");
            }

            _runningVersion = DesktopRunningVersion.Resolve(manager);
        }

        Log($"Checking for desktop updates (channel={explicitChannel}, feed={feedUrl}, current={manager.CurrentVersion}).");

        UpdateInfo? updateInfo;
        try
        {
            updateInfo = await manager.CheckForUpdatesAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Log($"Desktop update check failed: {ex.Message}");
            if (VelopackUpdateFeedExceptions.IsMissingReleaseFeed(ex))
            {
                lock (_stateLock)
                {
                    _velopackInstalled = true;
                    _runningVersion = DesktopRunningVersion.Resolve(manager);
                    _phase = DesktopUpdatePhases.NoReleases;
                    _targetVersion = null;
                    _availableUpdate = null;
                    _sessionReadyRelease = null;
                }

                return ToActionResult(true, GetStatus(), "No releases available on this channel.");
            }

            lock (_stateLock)
            {
                _phase = DesktopUpdatePhases.CheckFailed;
            }

            return ToActionResult(false, GetStatus(), "Update check failed. See desktop logs for details.");
        }

        if (cancellationToken.IsCancellationRequested)
        {
            return ToActionResult(false, GetStatus(), "Update check was canceled.");
        }

        lock (_stateLock)
        {
            _velopackInstalled = true;
            _runningVersion = DesktopRunningVersion.Resolve(manager);

            if (updateInfo == null)
            {
                _phase = DesktopUpdatePhases.UpToDate;
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
                _phase = DesktopUpdatePhases.UpdateReady;
                return ToActionResult(
                    true,
                    BuildStatusLocked(),
                    $"Update {_targetVersion} downloaded and ready to apply.");
            }

            _sessionReadyRelease = null;
            _phase = DesktopUpdatePhases.UpdateAvailable;
            return ToActionResult(
                true,
                BuildStatusLocked(),
                $"Update available: {_targetVersion}.");
        }
    }

    public async Task<DesktopUpdateActionResult> DownloadAvailableUpdateAsync(CancellationToken cancellationToken)
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
            if (_phase == DesktopUpdatePhases.NotInstalled)
            {
                return ToActionResult(false, BuildStatusLocked(), "Download is unavailable when not running as an installed Velopack build.");
            }

            if (_phase == DesktopUpdatePhases.UpdateReady)
            {
                return ToActionResult(
                    true,
                    BuildStatusLocked(),
                    $"Update {_targetVersion} is already downloaded and ready to apply.");
            }

            if (_phase == DesktopUpdatePhases.Downloading)
            {
                return ToActionResult(false, BuildStatusLocked(), "A download is already in progress.");
            }

            if (_availableUpdate == null || _phase != DesktopUpdatePhases.UpdateAvailable)
            {
                return ToActionResult(false, BuildStatusLocked(), "No update is available to download. Check for updates first.");
            }

            updateInfo = _availableUpdate;
            targetVersion = _targetVersion;
            _phase = DesktopUpdatePhases.Downloading;
        }

        var devChannelEnabled = _readDevChannelEnabled();
        var manager = CreateUpdateManager(devChannelEnabled);

        Log($"Downloading desktop update {targetVersion}.");

        try
        {
            await manager.DownloadUpdatesAsync(updateInfo, progress: null, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Log($"Desktop update download failed: {ex.Message}");
            lock (_stateLock)
            {
                _phase = DesktopUpdatePhases.UpdateAvailable;
            }

            return ToActionResult(false, GetStatus(), "Download failed. See desktop logs for details.");
        }

        if (cancellationToken.IsCancellationRequested)
        {
            lock (_stateLock)
            {
                _phase = DesktopUpdatePhases.UpdateAvailable;
            }

            return ToActionResult(false, GetStatus(), "Download was canceled.");
        }

        lock (_stateLock)
        {
            _sessionReadyRelease = updateInfo.TargetFullRelease;
            _targetVersion = updateInfo.TargetFullRelease.Version.ToString();
            _phase = DesktopUpdatePhases.UpdateReady;
            return ToActionResult(
                true,
                BuildStatusLocked(),
                $"Update {_targetVersion} downloaded and ready to apply.");
        }
    }

    public DesktopUpdateActionResult ApplyDownloadedUpdate()
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
            if (_phase == DesktopUpdatePhases.NotInstalled)
            {
                Interlocked.Exchange(ref _applyInProgress, 0);
                return ToActionResult(false, BuildStatusLocked(), "Apply is unavailable when not running as an installed Velopack build.");
            }

            if (_phase != DesktopUpdatePhases.UpdateReady || _sessionReadyRelease == null)
            {
                Interlocked.Exchange(ref _applyInProgress, 0);
                return ToActionResult(false, BuildStatusLocked(), "No downloaded update is ready to apply.");
            }

            readyRelease = _sessionReadyRelease;
            targetVersion = _targetVersion;
            _phase = DesktopUpdatePhases.Restarting;
        }

        var devChannelEnabled = _readDevChannelEnabled();
        var manager = CreateUpdateManager(devChannelEnabled);

        Log($"Applying desktop update {targetVersion}; scheduling graceful shutdown and Velopack restart.");

        _ = Task.Run(() =>
        {
            try
            {
                manager.WaitExitThenApplyUpdates(
                    readyRelease,
                    silent: true,
                    restart: true,
                    restartArgs: null);

                Dispatcher.UIThread.Post(() =>
                {
                    if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktopLifetime)
                    {
                        desktopLifetime.Shutdown();
                    }
                    else
                    {
                        _shutdownApplication();
                    }
                });
            }
            catch (Exception ex)
            {
                Log($"Desktop update apply failed after user confirmation: {ex.Message}");
                lock (_stateLock)
                {
                    _phase = DesktopUpdatePhases.UpdateReady;
                }

                Interlocked.Exchange(ref _applyInProgress, 0);
            }
        });

        return ToActionResult(
            true,
            GetStatus(),
            "Restarting to apply update.");
    }

    private DesktopUpdateStatus BuildStatusLocked()
    {
        var installed = _velopackInstalled ?? (_phase != DesktopUpdatePhases.NotInstalled);
        var message = _phase switch
        {
            DesktopUpdatePhases.NotInstalled => "Updates apply only to Velopack-installed desktop builds.",
            DesktopUpdatePhases.Idle => "Check for updates to see whether a release is available.",
            DesktopUpdatePhases.NoReleases => "No releases available on this channel.",
            DesktopUpdatePhases.CheckFailed => "Update status unknown; check for updates.",
            DesktopUpdatePhases.UpToDate => $"Up to date ({_runningVersion ?? "unknown"}).",
            DesktopUpdatePhases.UpdateAvailable => $"Update available: {_targetVersion}.",
            DesktopUpdatePhases.Downloading => $"Downloading update {_targetVersion}…",
            DesktopUpdatePhases.UpdateReady => $"Update {_targetVersion} downloaded and ready to apply.",
            DesktopUpdatePhases.Restarting => "Restarting to apply update…",
            _ => "Update status unavailable."
        };

        return new DesktopUpdateStatus(_phase, _runningVersion, _targetVersion, message, installed);
    }

    private static DesktopUpdateActionResult ToActionResult(bool accepted, DesktopUpdateStatus status, string message)
    {
        return new DesktopUpdateActionResult(
            accepted,
            status.Phase,
            status.RunningVersion,
            status.TargetVersion,
            message,
            status.VelopackInstalled);
    }

    private static void Log(string message)
    {
        ClientLogRelay.Log("desktop-update", message);
    }
}

internal static class DesktopUpdatePhases
{
    internal const string NotInstalled = "notInstalled";
    internal const string Idle = "idle";
    internal const string NoReleases = "noReleases";
    internal const string CheckFailed = "checkFailed";
    internal const string UpToDate = "upToDate";
    internal const string UpdateAvailable = "updateAvailable";
    internal const string Downloading = "downloading";
    internal const string UpdateReady = "updateReady";
    internal const string Restarting = "restarting";
}

internal static class VelopackUpdateFeedExceptions
{
    /// <summary>
    /// Velopack's HTTP source throws when <c>releases.{channel}.json</c> is missing (404), not when the feed is empty.
    /// See https://github.com/velopack/velopack/issues/91
    /// </summary>
    internal static bool IsMissingReleaseFeed(Exception ex)
    {
        for (var current = ex; current != null; current = current.InnerException)
        {
            if (current is HttpRequestException { StatusCode: HttpStatusCode.NotFound })
            {
                return true;
            }
        }

        return false;
    }
}

internal static class DesktopUpdateBackgroundLoop
{
    internal static readonly TimeSpan StartupCheckDelay = TimeSpan.FromMinutes(1);
    internal static readonly TimeSpan CheckInterval = TimeSpan.FromHours(4);

    internal static async Task RunAsync(UpdateService updateService, CancellationToken stoppingToken)
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
                await updateService.CheckForUpdatesAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                ClientLogRelay.Log("desktop-update", $"Background update check failed: {ex.Message}");
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
