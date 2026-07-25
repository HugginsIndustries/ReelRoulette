using Microsoft.Extensions.Hosting;
using ReelRoulette.Server.Services;
using Velopack;

namespace ReelRoulette.ServerApp.Hosting;

public sealed class UpdateService
{
    internal const string PublicFeedBase = "https://f004.backblazeb2.com/file/hugginsindustries-releases";

    private readonly ILogger<UpdateService> _logger;
    private readonly CoreSettingsService _settings;
    private readonly IHostApplicationLifetime _lifetime;
    private int _applyInProgress;

    public UpdateService(
        ILogger<UpdateService> logger,
        CoreSettingsService settings,
        IHostApplicationLifetime lifetime)
    {
        _logger = logger;
        _settings = settings;
        _lifetime = lifetime;
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

    public async Task RunCheckCycleAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.CompareExchange(ref _applyInProgress, 1, 0) != 0)
        {
            _logger.LogDebug("Skipping update check because an apply-and-restart sequence is already in progress.");
            return;
        }

        var applyScheduled = false;
        try
        {
            var devChannelEnabled = _settings.GetControlRuntimeSettings().DevChannelEnabled;
            var (feedUrl, explicitChannel) = ComposeFeedAndChannel(devChannelEnabled);
            var manager = CreateUpdateManager(devChannelEnabled);

            if (!manager.IsInstalled)
            {
                _logger.LogDebug(
                    "Skipping update check because the server is not running as an installed Velopack build (feed={Feed}, channel={Channel}).",
                    feedUrl,
                    explicitChannel);
                return;
            }

            _logger.LogInformation(
                "Checking for server updates (channel={Channel}, feed={Feed}, current={CurrentVersion}).",
                explicitChannel,
                feedUrl,
                manager.CurrentVersion);

            var updateInfo = await manager.CheckForUpdatesAsync().ConfigureAwait(false);
            if (updateInfo == null)
            {
                _logger.LogInformation("No server update available.");
                return;
            }

            _logger.LogInformation(
                "Server update {TargetVersion} available; downloading before apply.",
                updateInfo.TargetFullRelease.Version);

            try
            {
                await manager.DownloadUpdatesAsync(updateInfo, progress: null, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Server update download failed; aborting cycle without applying.");
                return;
            }

            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            _logger.LogInformation(
                "Server update {TargetVersion} downloaded; scheduling graceful shutdown and Velopack apply.",
                updateInfo.TargetFullRelease.Version);

            manager.WaitExitThenApplyUpdates(
                updateInfo.TargetFullRelease,
                silent: true,
                restart: true,
                restartArgs: null);

            applyScheduled = true;
            _lifetime.StopApplication();
        }
        finally
        {
            if (!applyScheduled)
            {
                Interlocked.Exchange(ref _applyInProgress, 0);
            }
        }
    }
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
                await _updateService.RunCheckCycleAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Server update check cycle failed.");
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
