using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ReelRoulette.Core.Fingerprints;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using SkiaSharp;

namespace ReelRoulette.Server.Services;

public sealed class RefreshPipelineService : BackgroundService
{
    private const int ThumbnailMaxEdge = 480;
    private static readonly TimeSpan ScanProgressInterval = TimeSpan.FromMilliseconds(500);
    private const int NameSortKeyBatchSize = 1000;

    /// <summary>
    /// How many videos the loudness stage scans at once. Each scan reads its whole video, or ten minutes of a
    /// long one, and on a library over a network share a second scan at once barely adds throughput while it
    /// makes a video starting or seeking there wait longer.
    /// </summary>
    internal const int LoudnessScanConcurrency = 1;

    private static SemaphoreSlim? _ffprobeSemaphore;
    private static readonly object FfprobeSemaphoreLock = new();
    private static readonly Regex IntegratedLufsRegex = new(
        @"(?:^|\s)I:\s*(?<value>-?\d+(?:\.\d+)?)\s*LUFS\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex PeakDbfsRegex = new(
        @"(?:^|\s)(?:Peak|True peak):\s*(?<value>-?\d+(?:\.\d+)?)\s*dBFS\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // The stages' ids, as the status's currentStage names them.
    private const string SourceRefreshStage = "sourceRefresh";
    private const string NameSortKeysStage = "nameSortKeys";
    private const string FingerprintScanStage = "fingerprintScan";
    private const string DurationScanStage = "durationScan";
    private const string LoudnessScanStage = "loudnessScan";
    private const string ThumbnailGenerationStage = "thumbnailGeneration";

    /// <summary>The integrated loudness ffmpeg's <c>ebur128</c> reports for digital silence, its floor.</summary>
    private const double DigitalSilenceLufs = -70.0;

    private readonly ServerStateService _state;
    private readonly ILogger<RefreshPipelineService> _logger;
    private readonly ServerLogService _serverLog;
    private readonly FileFingerprintService _fingerprintService = new();
    private readonly object _runLock = new();
    private readonly LibraryCatalogHost _catalog;
    private readonly object _catalogWriteLock = new();
    private Task? _fingerprintWriteHold;
    private readonly TaskCompletionSource _fingerprintWriteEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task? _thumbnailWriteHold;
    private readonly TaskCompletionSource _thumbnailWriteEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task? _thumbnailAfterWriteHold;
    private readonly TaskCompletionSource _thumbnailAfterWriteEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task? _thumbnailCleanupHold;
    private readonly TaskCompletionSource _thumbnailCleanupEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly string _thumbnailDir;
    private readonly CoreSettingsService _coreSettings;
    private RefreshStatusSnapshot _status = new();
    private DateTimeOffset _nextAutoRunUtc;
    private bool _isRunLoopActive;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly TaskCompletionSource _toolCheckEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task? _toolCheckHold;
    private Func<DateTimeOffset> _progressClock = () => DateTimeOffset.UtcNow;
    private (bool Ffmpeg, bool Ffprobe)? _toolAvailability;
    private Func<string, string, TimeSpan?, CancellationToken, Task<FileLoudnessInfo?>> _analyzeLoudness = AnalyzeLoudnessAsync;
    private Func<string, CancellationToken, Task<TimeSpan?>> _probeDuration = GetVideoDurationAsync;

    public RefreshPipelineService(
        ServerStateService state,
        ILogger<RefreshPipelineService> logger,
        CoreSettingsService coreSettings,
        LibraryCatalogHost catalog,
        string? appDataPathOverride = null)
    {
        _state = state;
        _logger = logger;
        _serverLog = new ServerLogService(appDataPathOverride ?? ServerDataPaths.DataDirectory(), logger);
        _coreSettings = coreSettings;
        _catalog = catalog;

        _thumbnailDir = LibraryCatalogHost.LocalThumbnailDirectory(appDataPathOverride);
        Directory.CreateDirectory(Path.GetDirectoryName(_thumbnailDir)!);
        var refreshSettings = _coreSettings.GetRefreshSettings();
        _nextAutoRunUtc = DateTimeOffset.UtcNow.AddMinutes(refreshSettings.AutoRefreshIntervalMinutes);
    }

    public RefreshStatusSnapshot GetStatus()
    {
        lock (_runLock)
        {
            return CloneStatus(_status);
        }
    }

    internal DateTimeOffset NextAutoRunUtc
    {
        get
        {
            lock (_runLock)
            {
                return _nextAutoRunUtc;
            }
        }
    }

    public RefreshSettingsSnapshot UpdateSettings(RefreshSettingsSnapshot snapshot)
    {
        lock (_runLock)
        {
            var updated = _coreSettings.UpdateRefreshSettings(snapshot);
            ScheduleNextAutoRunFromNowLocked();
            return updated;
        }
    }

    public RefreshStartResponse TryStartManual()
    {
        if (!_catalog.HasLibrary)
        {
            return new RefreshStartResponse
            {
                Accepted = false,
                Message = _catalog.UnavailableMessage
            };
        }

        if (!TryReserveRun("manual", out var runId))
        {
            lock (_runLock)
            {
                return new RefreshStartResponse
                {
                    Accepted = false,
                    Message = "already running",
                    RunId = _status.RunId
                };
            }
        }

        _ = Task.Run(() => ExecuteReservedRunAsync(_shutdown.Token));
        return new RefreshStartResponse
        {
            Accepted = true,
            Message = "started",
            RunId = runId
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var registration = stoppingToken.Register(static state => ((CancellationTokenSource)state!).Cancel(), _shutdown);
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                bool shouldRun;
                lock (_runLock)
                {
                    // A run reads the catalog first, and an exception that escapes this loop stops the host,
                    // so without a library the run never starts.
                    var refreshSettings = _coreSettings.GetRefreshSettings();
                    shouldRun = _catalog.HasLibrary &&
                                refreshSettings.AutoRefreshEnabled &&
                                !_status.IsRunning &&
                                !_isRunLoopActive &&
                                DateTimeOffset.UtcNow >= _nextAutoRunUtc;
                }

                if (shouldRun)
                {
                    if (TryReserveRun("auto", out _))
                    {
                        await ExecuteReservedRunAsync(_shutdown.Token);
                    }
                }

                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _shutdown.Cancel();
        await base.StopAsync(cancellationToken);
    }

    internal void CancelRunsForShutdown()
    {
        _shutdown.Cancel();
    }

    /// <summary>
    /// The next ffmpeg or ffprobe availability check waits on <paramref name="hold"/> inside its try.
    /// A shutdown cancel is then observed by the same catch as a blocked tool process.
    /// </summary>
    internal void HoldNextToolCheck(Task hold)
    {
        _toolCheckHold = hold ?? throw new ArgumentNullException(nameof(hold));
    }

    internal Task ToolCheckEntered => _toolCheckEntered.Task;

    /// <summary>
    /// The clock every stage's progress throttle reads.
    /// </summary>
    internal void SetProgressClock(Func<DateTimeOffset> clock)
    {
        _progressClock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    /// <summary>
    /// Answers the ffmpeg and ffprobe availability checks without running either, so the stages that need them run,
    /// or find them missing, whatever the machine has.
    /// </summary>
    internal void SetMediaToolsAvailable(bool ffmpeg = true, bool ffprobe = true)
    {
        _toolAvailability = (ffmpeg, ffprobe);
    }

    /// <summary>
    /// Scans each video in the loudness stage with <paramref name="analyze"/>, given the file's path and its known
    /// duration, in place of running ffmpeg.
    /// </summary>
    internal void SetLoudnessAnalyzer(Func<string, TimeSpan?, CancellationToken, Task<FileLoudnessInfo?>> analyze)
    {
        ArgumentNullException.ThrowIfNull(analyze);
        _analyzeLoudness = (path, _, duration, token) => analyze(path, duration, token);
    }

    /// <summary>
    /// Probes a video's duration with <paramref name="probe"/>, given the file's path, in place of running
    /// ffprobe: in the duration stage, and in the thumbnail stage for a video without a stored duration.
    /// </summary>
    internal void SetDurationProbe(Func<string, CancellationToken, Task<TimeSpan?>> probe)
    {
        _probeDuration = probe ?? throw new ArgumentNullException(nameof(probe));
    }

    internal void HoldNextFingerprintWrite(Task hold)
    {
        _fingerprintWriteHold = hold ?? throw new ArgumentNullException(nameof(hold));
    }

    internal Task FingerprintWriteEntered => _fingerprintWriteEntered.Task;

    internal void HoldNextThumbnailWrite(Task hold)
    {
        _thumbnailWriteHold = hold ?? throw new ArgumentNullException(nameof(hold));
    }

    internal Task ThumbnailWriteEntered => _thumbnailWriteEntered.Task;

    internal void HoldAfterNextThumbnailWrite(Task hold)
    {
        _thumbnailAfterWriteHold = hold ?? throw new ArgumentNullException(nameof(hold));
    }

    internal Task ThumbnailAfterWriteEntered => _thumbnailAfterWriteEntered.Task;

    internal void HoldNextThumbnailCleanup(Task hold)
    {
        _thumbnailCleanupHold = hold ?? throw new ArgumentNullException(nameof(hold));
    }

    internal Task ThumbnailCleanupEntered => _thumbnailCleanupEntered.Task;

    public string GetThumbnailPath(string itemId)
    {
        return Path.Combine(_thumbnailDir, $"{itemId}.jpg");
    }

    /// <summary>
    /// The version clients put in a thumbnail URL. Every thumbnail write replaces the JPEG, which changes it.
    /// </summary>
    public static string ThumbnailVersion(FileInfo thumbnail)
    {
        return $"{thumbnail.LastWriteTimeUtc.Ticks:x}-{thumbnail.Length:x}";
    }

    public void EnrichListedItems(JsonArray items)
    {
        foreach (var node in items)
        {
            if (node is not JsonObject item)
            {
                continue;
            }

            var itemId = item["id"]?.GetValue<string>()?.Trim();
            if (string.IsNullOrWhiteSpace(itemId))
            {
                item["hasThumbnail"] = false;
                item.Remove("thumbnailVersion");
                item.Remove("thumbnailWidth");
                item.Remove("thumbnailHeight");
                continue;
            }

            var thumbnail = new FileInfo(GetThumbnailPath(itemId));
            item["hasThumbnail"] = thumbnail.Exists;
            if (thumbnail.Exists)
            {
                item["thumbnailVersion"] = ThumbnailVersion(thumbnail);
            }
            else
            {
                item.Remove("thumbnailVersion");
            }

            if (!PositiveThumbnailDimension(item["thumbnailWidth"]) || !PositiveThumbnailDimension(item["thumbnailHeight"]))
            {
                item.Remove("thumbnailWidth");
                item.Remove("thumbnailHeight");
            }
        }
    }

    private bool TryReserveRun(string trigger, out string? runId)
    {
        lock (_runLock)
        {
            if (_isRunLoopActive || _status.IsRunning)
            {
                runId = null;
                return false;
            }

            _isRunLoopActive = true;
            _status = new RefreshStatusSnapshot
            {
                IsRunning = true,
                RunId = Guid.NewGuid().ToString("N"),
                Trigger = trigger,
                StartedUtc = DateTimeOffset.UtcNow
            };
            runId = _status.RunId;
            PublishStatusLocked();
            return true;
        }
    }

    private async Task ExecuteReservedRunAsync(CancellationToken cancellationToken)
    {
        using var deferredCatalogBackup = LibraryCatalogBackup.Defer(_catalog.Session.DatabasePath);
        try
        {
            await RunSourceRefreshAsync(cancellationToken);
            RunNameSortKeyStage(cancellationToken);
            await RunFingerprintStageAsync(cancellationToken);
            await RunDurationStageWithOneShotAsync(cancellationToken);
            await RunLoudnessStageWithOneShotAsync(cancellationToken);
            await RunThumbnailStageAsync(cancellationToken);

            lock (_runLock)
            {
                _status.IsRunning = false;
                _status.CurrentStage = null;
                _status.CompletedUtc = DateTimeOffset.UtcNow;
                PublishStatusLocked();
            }
        }
        catch (Exception ex) when (IsPipelineCancellation(ex, cancellationToken))
        {
            _logger.LogInformation("Refresh pipeline canceled.");
            lock (_runLock)
            {
                _status.IsRunning = false;
                _status.CurrentStage = null;
                // Leave CompletedUtc unset so clients do not treat shutdown as a finished refresh.
                PublishStatusLocked();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Refresh pipeline failed");
            string? stage;
            lock (_runLock)
            {
                stage = _status.CurrentStage;
            }

            // The exception's message can name a file, and the status goes to every client, so it goes only here,
            // before the failed status, so last.log has it before any client relays the failure.
            _serverLog.Append("error", $"Library refresh failed stage={stage}: {ex}");
            lock (_runLock)
            {
                // CurrentStage stays the stage the run stopped in, which clients name in their failed line.
                _status.IsRunning = false;
                _status.Failed = true;
                _status.CompletedUtc = DateTimeOffset.UtcNow;
                PublishStatusLocked();
            }
        }
        finally
        {
            lock (_runLock)
            {
                ScheduleNextAutoRunFromNowLocked();
                _isRunLoopActive = false;
            }
        }
    }

    private static bool IsPipelineCancellation(Exception exception, CancellationToken cancellationToken)
    {
        if (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }

        if (exception is OperationCanceledException)
        {
            return true;
        }

        return exception is AggregateException aggregate &&
               aggregate.Flatten().InnerExceptions.All(inner => inner is OperationCanceledException);
    }

    private void ScheduleNextAutoRunFromNowLocked()
    {
        _nextAutoRunUtc = DateTimeOffset.UtcNow.AddMinutes(_coreSettings.GetRefreshSettings().AutoRefreshIntervalMinutes);
    }

    private Task RunSourceRefreshAsync(CancellationToken cancellationToken)
    {
        StartStage(SourceRefreshStage);

        // Every file this refresh adds shares one date added, so the date added sort orders them by name.
        var addedUtc = DateTime.UtcNow;
        var sources = _catalog.Session.ReadRefreshSources()
            .Where(source => source.IsEnabled && !string.IsNullOrWhiteSpace(source.Id) && !string.IsNullOrWhiteSpace(source.RootPath))
            .ToList();
        var items = _catalog.Session.ReadRefreshItems().ToList();
        var defaultsChanged = new HashSet<CatalogRefreshItem>();

        int sourceNumber = 0;
        int added = 0;
        int removed = 0;
        int renamed = 0;
        int moved = 0;
        int unmatched = 0;

        // The percent follows the sources: source k starts at k - 1 of them, moves on as it fingerprints its new files,
        // and ends at k.
        void SetSourceCounts(RefreshStatusSnapshot status, double sourcesDone, int fingerprinted = 0, int toFingerprint = 0)
        {
            var stage = status.Stages.SourceRefresh;
            stage.Source = sourceNumber;
            stage.SourceCount = sources.Count;
            stage.NewFilesFingerprinted = fingerprinted;
            stage.NewFilesToFingerprint = toFingerprint;
            stage.Added = added;
            stage.Removed = removed;
            stage.Renamed = renamed;
            stage.Moved = moved;
            stage.Unmatched = unmatched;
            stage.Percent = StagePercent(sourcesDone, sources.Count);
        }

        foreach (var source in sources)
        {
            cancellationToken.ThrowIfCancellationRequested();
            sourceNumber++;
            var sourceId = source.Id;
            var rootPath = source.RootPath;
            if (!Directory.Exists(rootPath))
            {
                continue;
            }

            var discovered = EnumerateMediaFiles(rootPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var existingForSource = items
                .Where(item => string.Equals(item.SourceId, sourceId, StringComparison.OrdinalIgnoreCase))
                .ToList();

            var existingPaths = existingForSource
                .Select(item => item.FullPath)
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // A root that lists no media files while the library still holds items from it is far more likely a drive
            // or share that isn't mounted than a source whose every file was deleted, so nothing is removed from it.
            var rootListsNoMedia = discovered.Count == 0 && existingForSource.Count > 0;
            if (rootListsNoMedia)
            {
                _serverLog.Append(
                    "warn",
                    $"Source refresh root={rootPath} lists no media files but the library has {existingForSource.Count} items from it; none were removed. Check that its drive or share is mounted.");
                RecordKeptSource(sourceId, existingForSource.Count);
            }

            var missingItems = rootListsNoMedia
                ? []
                : existingForSource
                    .Where(item => !discovered.Contains(item.FullPath))
                    .ToList();
            var newPaths = discovered
                .Where(path => !existingPaths.Contains(path))
                .ToList();

            UpdateStage(SourceRefreshStage, status => SetSourceCounts(status, sourceNumber - 1));

            if (missingItems.Count == 0 && newPaths.Count == 0)
            {
                UpdateStage(SourceRefreshStage, status => SetSourceCounts(status, sourceNumber));
                continue;
            }

            var newPathMediaType = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var newPathFileName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var newPathSize = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            var newPathWrite = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in newPaths)
            {
                newPathMediaType[path] = SupportedMediaExtensions.IsVideoExtension(Path.GetExtension(path)) ? 0 : 1;
                newPathFileName[path] = Path.GetFileName(path);
                try
                {
                    var info = new FileInfo(path);
                    newPathSize[path] = info.Length;
                    newPathWrite[path] = info.LastWriteTimeUtc;
                }
                catch
                {
                    // best effort metadata read
                }
            }

            var unresolvedMissingPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var unresolvedNewPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidateNewPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidateNewFingerprints = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var consumedNewPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var missingReady = new List<CatalogRefreshItem>();
            foreach (var missing in missingItems)
            {
                if (ApplyFingerprintDefaults(missing))
                {
                    defaultsChanged.Add(missing);
                }

                if (!string.IsNullOrWhiteSpace(missing.Fingerprint) && missing.FingerprintStatus == 1)
                {
                    missingReady.Add(missing);
                }
            }

            foreach (var missing in missingReady)
            {
                foreach (var candidatePath in newPaths)
                {
                    if (consumedNewPaths.Contains(candidatePath))
                    {
                        continue;
                    }

                    if (!newPathMediaType.TryGetValue(candidatePath, out var candidateMediaType) || candidateMediaType != missing.MediaType)
                    {
                        continue;
                    }

                    if (missing.FileSizeBytes.HasValue &&
                        (!newPathSize.TryGetValue(candidatePath, out var candidateSize) || candidateSize != missing.FileSizeBytes.Value))
                    {
                        continue;
                    }

                    candidateNewPaths.Add(candidatePath);
                }
            }

            var fingerprintCount = candidateNewPaths.Count;
            var fingerprintProcessed = 0;
            foreach (var path in candidateNewPaths)
            {
                cancellationToken.ThrowIfCancellationRequested();
                fingerprintProcessed++;
                var fpResult = _fingerprintService.ComputeFingerprint(path);
                if (string.IsNullOrWhiteSpace(fpResult.Error) && fpResult.IsStableRead && !string.IsNullOrWhiteSpace(fpResult.Fingerprint))
                {
                    candidateNewFingerprints[path] = fpResult.Fingerprint!;
                }
                else
                {
                    unresolvedNewPaths.Add(path);
                }

                if (fingerprintProcessed % 25 == 0 || fingerprintProcessed == fingerprintCount)
                {
                    UpdateStage(SourceRefreshStage, status => SetSourceCounts(
                        status,
                        sourceNumber - 1 + fingerprintProcessed / (double)fingerprintCount,
                        fingerprintProcessed,
                        fingerprintCount));
                }
            }

            var newPathsByFingerprint = candidateNewFingerprints
                .GroupBy(kvp => kvp.Value, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Select(kvp => kvp.Key).ToList(), StringComparer.OrdinalIgnoreCase);

            foreach (var missing in missingReady)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (string.IsNullOrWhiteSpace(missing.Fingerprint))
                {
                    continue;
                }

                string? matchPath = null;
                if (newPathsByFingerprint.TryGetValue(missing.Fingerprint, out var fingerprintMatches))
                {
                    foreach (var path in fingerprintMatches)
                    {
                        if (consumedNewPaths.Contains(path))
                        {
                            continue;
                        }

                        if (!newPathMediaType.TryGetValue(path, out var mediaType) || mediaType != missing.MediaType)
                        {
                            continue;
                        }

                        matchPath = path;
                        break;
                    }
                }

                if (string.IsNullOrWhiteSpace(matchPath))
                {
                    var hadCandidates = candidateNewPaths.Any(path =>
                        !consumedNewPaths.Contains(path) &&
                        newPathMediaType.TryGetValue(path, out var candidateMediaType) &&
                        candidateMediaType == missing.MediaType &&
                        (!missing.FileSizeBytes.HasValue || (newPathSize.TryGetValue(path, out var candidateSize) && candidateSize == missing.FileSizeBytes.Value)));

                    if (hadCandidates)
                    {
                        unmatched++;
                        if (!string.IsNullOrWhiteSpace(missing.FullPath))
                        {
                            unresolvedMissingPaths.Add(missing.FullPath);
                        }
                    }

                    continue;
                }

                var priorPath = missing.FullPath;
                var oldDir = Path.GetDirectoryName(priorPath) ?? string.Empty;
                var newDir = Path.GetDirectoryName(matchPath) ?? string.Empty;
                PersistMovedItem(missing, sourceId, rootPath, matchPath, defaultsChanged.Contains(missing));
                defaultsChanged.Remove(missing);

                // Paths compare ignoring case, so a match in the same folder always has another name.
                if (!oldDir.Equals(newDir, StringComparison.OrdinalIgnoreCase))
                {
                    moved++;
                }
                else
                {
                    renamed++;
                }

                consumedNewPaths.Add(matchPath);
            }

            foreach (var path in newPaths.Where(path => !consumedNewPaths.Contains(path)))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (unresolvedNewPaths.Contains(path))
                {
                    unmatched++;
                    continue;
                }

                InsertDiscoveredItem(
                    items,
                    sourceId,
                    rootPath,
                    path,
                    newPathFileName[path],
                    newPathMediaType[path],
                    newPathSize,
                    newPathWrite,
                    candidateNewFingerprints,
                    addedUtc);
                added++;
            }

            foreach (var missing in missingItems.ToList())
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!string.IsNullOrWhiteSpace(missing.FullPath) && File.Exists(missing.FullPath))
                {
                    PersistFingerprintDefaults(missing, defaultsChanged.Remove(missing));
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(missing.FullPath) && unresolvedMissingPaths.Contains(missing.FullPath))
                {
                    PersistFingerprintDefaults(missing, defaultsChanged.Remove(missing));
                    continue;
                }

                DeleteRefreshItem(missing);
                items.Remove(missing);
                defaultsChanged.Remove(missing);
                removed++;
            }

            UpdateStage(SourceRefreshStage, status => SetSourceCounts(status, sourceNumber));
        }

        CompleteStage(SourceRefreshStage, status => SetSourceCounts(status, sources.Count));
        return Task.CompletedTask;
    }

    /// <summary>
    /// Fills name sort keys that are missing, and recomputes every key when the key version changed.
    /// Insert and rename write the key with the row, so this usually finds nothing to do.
    /// </summary>
    internal void RunNameSortKeyStage(CancellationToken cancellationToken)
    {
        StartStage(NameSortKeysStage);
        var work = _catalog.Session.ReadNameSortKeyWork();
        var total = work.Items.Count;
        var processed = 0;
        var progressThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);
        foreach (var batch in work.Items.Chunk(NameSortKeyBatchSize))
        {
            cancellationToken.ThrowIfCancellationRequested();
            _catalog.Session.WriteNameSortKeys(batch);
            processed += batch.Length;
            if (progressThrottle.TryEnter())
            {
                UpdateStage(NameSortKeysStage, status => SetCount(status.Stages.NameSortKeys, processed, total));
            }
        }

        if (work.VersionChanged)
        {
            _catalog.Session.SetNameSortKeyVersion();
        }

        CompleteStage(NameSortKeysStage, status => SetCount(status.Stages.NameSortKeys, processed, total));
    }

    internal async Task RunFingerprintStageAsync(CancellationToken cancellationToken)
    {
        var parallelism = Math.Clamp(_coreSettings.GetRefreshSettings().FingerprintScanMaxDegreeOfParallelism, 1, 16);
        var items = _catalog.Session.ReadRefreshItems();
        var itemCount = items.Count;
        var workList = new List<CatalogRefreshItem>();
        // Files the check found changed on disk, which hashing counts apart from new files.
        var changedOnDisk = new HashSet<CatalogRefreshItem>();
        var checkedCount = 0;
        var checkThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);

        void PublishCheckProgress(bool force)
        {
            if (!checkThrottle.TryEnter(force))
            {
                return;
            }

            UpdateStage(FingerprintScanStage, status => SetCount(status.Stages.FingerprintScan, checkedCount, itemCount));
        }

        PublishCheckProgress(force: true);
        foreach (var item in items)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(item.FullPath) || !File.Exists(item.FullPath))
            {
                checkedCount++;
                PublishCheckProgress(force: false);
                continue;
            }

            var defaultsChanged = ApplyFingerprintDefaults(item);
            long? size = item.FileSizeBytes;
            DateTime? write = item.LastWriteTimeUtc;
            var haveStat = false;
            try
            {
                var info = new FileInfo(item.FullPath);
                size = info.Length;
                write = info.LastWriteTimeUtc;
                haveStat = true;
            }
            catch
            {
                // Preserve prior metadata on read failures.
            }

            if (haveStat &&
                !string.IsNullOrWhiteSpace(item.Fingerprint) &&
                ((item.FileSizeBytes.HasValue && item.FileSizeBytes.Value != size) ||
                 (item.LastWriteTimeUtc.HasValue && !SameUtc(item.LastWriteTimeUtc, write))))
            {
                item.FingerprintStatus = 3;
                changedOnDisk.Add(item);
            }

            if (!NeedsFingerprintProcessing(item))
            {
                PersistObservedFingerprint(item, size, write, haveStat, defaultsChanged);
                checkedCount++;
                PublishCheckProgress(force: false);
                continue;
            }

            if (haveStat)
            {
                item.FileSizeBytes = size;
                item.LastWriteTimeUtc = write;
            }

            workList.Add(item);
            checkedCount++;
            PublishCheckProgress(force: false);
        }

        PublishCheckProgress(force: true);

        var total = workList.Count;
        if (total == 0)
        {
            CompleteStage(FingerprintScanStage);
            return;
        }

        var processed = 0;
        var changed = 0;
        var failed = 0;
        var progressLock = new object();
        var hashThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);

        void SetHashCounts(RefreshStatusSnapshot status)
        {
            var stage = status.Stages.FingerprintScan;
            stage.Phase = RefreshFingerprintStage.Hashing;
            SetCount(stage, Volatile.Read(ref processed), total);
            stage.Changed = Volatile.Read(ref changed);
            stage.Failed = Volatile.Read(ref failed);
        }

        void TryPublishFingerprintProgress(bool force)
        {
            lock (progressLock)
            {
                if (hashThrottle.TryEnter(force))
                {
                    UpdateStage(FingerprintScanStage, SetHashCounts);
                }
            }
        }

        TryPublishFingerprintProgress(force: true);

        await Task.Run(() =>
        {
            Parallel.ForEach(
                workList,
                new ParallelOptions
                {
                    MaxDegreeOfParallelism = parallelism,
                    CancellationToken = cancellationToken
                },
                item =>
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var path = item.FullPath;
                    if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                    {
                        PersistHashedFingerprint(item, null, 2, item.FileSizeBytes, item.LastWriteTimeUtc, item.FingerprintLastUtc);
                        Interlocked.Increment(ref failed);
                        Interlocked.Increment(ref processed);
                        TryPublishFingerprintProgress(force: false);
                        return;
                    }

                    FileFingerprintResult? winner = null;
                    for (var attempt = 0; attempt < 2; attempt++)
                    {
                        var result = _fingerprintService.ComputeFingerprint(path);
                        winner = result;
                        if (!string.IsNullOrWhiteSpace(result.Error))
                        {
                            break;
                        }

                        if (result.IsStableRead && !string.IsNullOrWhiteSpace(result.Fingerprint))
                        {
                            break;
                        }

                        if (attempt < 1)
                        {
                            Thread.Sleep(80);
                        }
                    }

                    if (winner != null &&
                        string.IsNullOrWhiteSpace(winner.Error) &&
                        !string.IsNullOrWhiteSpace(winner.Fingerprint) &&
                        winner.IsStableRead)
                    {
                        PersistHashedFingerprint(item, winner.Fingerprint, 1, winner.FileSizeBytes, winner.LastWriteTimeUtc, DateTime.UtcNow);
                        if (changedOnDisk.Contains(item))
                        {
                            Interlocked.Increment(ref changed);
                        }
                    }
                    else
                    {
                        PersistHashedFingerprint(item, null, 2, item.FileSizeBytes, item.LastWriteTimeUtc, item.FingerprintLastUtc);
                        Interlocked.Increment(ref failed);
                    }

                    Interlocked.Increment(ref processed);
                    TryPublishFingerprintProgress(force: false);
                });
        }, cancellationToken);

        CompleteStage(FingerprintScanStage, SetHashCounts);
    }

    private static bool NeedsFingerprintProcessing(CatalogRefreshItem item)
    {
        if (string.IsNullOrWhiteSpace(item.Fingerprint))
        {
            return true;
        }

        // The app always writes a status with a fingerprint; if one is missing, do not rehash unless status is explicit.
        if (item.FingerprintStatus is null)
        {
            return false;
        }

        if (item.FingerprintStatus == 1)
        {
            return false;
        }

        return item.FingerprintStatus is 0 or 2 or 3;
    }

    private async Task RunDurationStageWithOneShotAsync(CancellationToken cancellationToken)
    {
        var settings = _coreSettings.GetRefreshSettings();
        var forceFullRescan = settings.ForceRescanDuration;
        var stoppedForMissingTool = false;
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            stoppedForMissingTool = !await RunDurationStageAsync(cancellationToken, forceFullRescan);
        }
        finally
        {
            // A forced rescan that ffprobe wasn't found for stays pending, so it runs once ffprobe is there.
            if (forceFullRescan && !stoppedForMissingTool && !cancellationToken.IsCancellationRequested)
            {
                ConsumeRefreshRescanFlags(clearDuration: true, clearLoudness: false);
            }
        }
    }

    /// <summary>Probes each video's duration that the stage has to scan. Returns false when it stopped because ffprobe wasn't found.</summary>
    private async Task<bool> RunDurationStageAsync(CancellationToken cancellationToken, bool forceFullRescan)
    {
        StartStage(DurationScanStage);
        var videos = DistinctRefreshItemsByPath(_catalog.Session.ReadRefreshItems().Where(item => item.MediaType == 0));
        var filesToScan = forceFullRescan
            ? videos
            : videos.Where(item => item.DurationTicks is not long ticks || ticks <= 0).ToList();
        var total = filesToScan.Count;
        var processed = 0;
        var changed = 0;
        var failed = 0;
        var processedLock = new object();
        var progressThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);

        if (total == 0)
        {
            CompleteStage(DurationScanStage, status => status.Stages.DurationScan.Forced = forceFullRescan);
            return true;
        }

        if (!await VerifyFfprobeAsync(ResolveFfprobePath(), cancellationToken))
        {
            CompleteStage(DurationScanStage, status => status.FfprobeNotFound = true);
            return false;
        }

        PublishMediaScanStart(DurationScanStage, progressThrottle, total, forceFullRescan);

        var scanTasks = filesToScan.Select(async item =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            if (File.Exists(item.FullPath))
            {
                var duration = await _probeDuration(item.FullPath, cancellationToken);
                if (duration.HasValue && duration.Value.TotalSeconds > 0)
                {
                    var prior = item.DurationTicks;
                    var hadDuration = prior is long existing && existing > 0;
                    if (!hadDuration || Math.Abs((TimeSpan.FromTicks(prior!.Value) - duration.Value).TotalSeconds) > 0.1)
                    {
                        lock (_catalogWriteLock)
                        {
                            _catalog.Session.SetDuration(item.Id, duration.Value.Ticks);
                        }

                        // A first duration isn't a change.
                        if (hadDuration)
                        {
                            Interlocked.Increment(ref changed);
                        }
                    }
                }
                else
                {
                    // The duration stays empty, so the next refresh probes the video again.
                    Interlocked.Increment(ref failed);
                }
            }

            int currentProcessed;
            lock (processedLock)
            {
                processed++;
                currentProcessed = processed;
            }

            TryUpdateMediaScanProgress(DurationScanStage, progressThrottle, currentProcessed, total, Volatile.Read(ref changed), Volatile.Read(ref failed));
        });

        await Task.WhenAll(scanTasks);
        CompleteStage(DurationScanStage, status =>
            SetMediaScanCounts(status, DurationScanStage, Volatile.Read(ref processed), total, Volatile.Read(ref changed), Volatile.Read(ref failed)));
        return true;
    }

    private async Task RunLoudnessStageWithOneShotAsync(CancellationToken cancellationToken)
    {
        var settings = _coreSettings.GetRefreshSettings();
        var forceFullRescan = settings.ForceRescanLoudness;
        var stoppedForMissingTool = false;
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            stoppedForMissingTool = !await RunLoudnessStageAsync(cancellationToken, forceFullRescan);
        }
        finally
        {
            // A forced rescan that ffmpeg wasn't found for stays pending, so it runs once ffmpeg is there.
            if (forceFullRescan && !stoppedForMissingTool && !cancellationToken.IsCancellationRequested)
            {
                ConsumeRefreshRescanFlags(clearDuration: false, clearLoudness: true);
            }
        }
    }

    /// <summary>Scans each video's loudness that the stage has to scan. Returns false when it stopped because ffmpeg wasn't found.</summary>
    private async Task<bool> RunLoudnessStageAsync(CancellationToken cancellationToken, bool forceFullRescan)
    {
        StartStage(LoudnessScanStage);
        var videos = DistinctRefreshItemsByPath(_catalog.Session.ReadRefreshItems().Where(item => item.MediaType == 0));
        var filesToScan = forceFullRescan
            ? videos
            : videos.Where(NeedsLoudness).ToList();
        var total = filesToScan.Count;
        var processed = 0;
        var changed = 0;
        var failed = 0;
        var processedLock = new object();
        var progressThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);

        if (total == 0)
        {
            CompleteStage(LoudnessScanStage, status => status.Stages.LoudnessScan.Forced = forceFullRescan);
            return true;
        }

        var ffmpegPath = ResolveFfmpegPath();
        if (!await VerifyFfmpegAsync(ffmpegPath, cancellationToken))
        {
            CompleteStage(LoudnessScanStage, status => status.FfmpegNotFound = true);
            return false;
        }

        PublishMediaScanStart(LoudnessScanStage, progressThrottle, total, forceFullRescan);

        var limit = new ParallelOptions { MaxDegreeOfParallelism = LoudnessScanConcurrency, CancellationToken = cancellationToken };
        await Parallel.ForEachAsync(filesToScan, limit, async (item, token) =>
        {
            if (File.Exists(item.FullPath))
            {
                var durationForLoudness = item.DurationTicks is long ticks && ticks > 0
                    ? TimeSpan.FromSeconds(ticks / TimeSpan.TicksPerSecond)
                    : (TimeSpan?)null;
                var loudness = await _analyzeLoudness(item.FullPath, ffmpegPath, durationForLoudness, token);
                if (loudness != null)
                {
                    if (PersistLoudness(item, loudness))
                    {
                        Interlocked.Increment(ref changed);
                    }

                    if (loudness.IsError)
                    {
                        Interlocked.Increment(ref failed);
                    }
                }
            }

            int currentProcessed;
            lock (processedLock)
            {
                processed++;
                currentProcessed = processed;
            }

            TryUpdateMediaScanProgress(LoudnessScanStage, progressThrottle, currentProcessed, total, Volatile.Read(ref changed), Volatile.Read(ref failed));
        });

        CompleteStage(LoudnessScanStage, status =>
            SetMediaScanCounts(status, LoudnessScanStage, Volatile.Read(ref processed), total, Volatile.Read(ref changed), Volatile.Read(ref failed)));
        return true;
    }

    internal async Task RunThumbnailStageAsync(CancellationToken cancellationToken)
    {
        StartStage(ThumbnailGenerationStage);
        Directory.CreateDirectory(_thumbnailDir);
        var items = _catalog.Session.ReadRefreshItems();
        var catalogIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int failed = 0;
        int total = items.Count;
        var ffmpegPath = ResolveFfmpegPath();
        bool ffmpegChecked = false;
        bool ffmpegAvailable = false;
        var progressThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);

        void SetGenerateCounts(RefreshStatusSnapshot status, int processed)
        {
            SetCount(status.Stages.ThumbnailGeneration, processed, total);
            status.Stages.ThumbnailGeneration.Failed = failed;
            status.FfmpegNotFound |= ffmpegChecked && !ffmpegAvailable;
        }

        for (int i = 0; i < items.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var item = items[i];
            var itemId = item.Id?.Trim();
            if (string.IsNullOrWhiteSpace(itemId))
            {
                continue;
            }

            catalogIds.Add(itemId);
            var fullPath = item.FullPath ?? string.Empty;
            var computedRevision = StoredThumbnailRevision(item);
            var storedRevision = string.IsNullOrEmpty(item.ThumbnailRevision) ? null : item.ThumbnailRevision;
            var hasDimensions = item.ThumbnailWidth is > 0 && item.ThumbnailHeight is > 0;
            var thumbPath = GetThumbnailPath(itemId);
            var hadThumbnailFile = File.Exists(thumbPath);
            var revisionMatches = computedRevision != null &&
                                  string.Equals(storedRevision, computedRevision, StringComparison.Ordinal);
            if (revisionMatches && hadThumbnailFile)
            {
                if (!hasDimensions &&
                    TryReadImageDimensions(thumbPath, out var width, out var height) &&
                    width > 0 &&
                    height > 0)
                {
                    PersistThumbnail(item, storedRevision, width, height);
                }
            }
            else if (!string.IsNullOrWhiteSpace(fullPath) && File.Exists(fullPath))
            {
                ThumbnailGenerationResult? generatedThumb;
                if (item.MediaType == 0)
                {
                    if (!ffmpegChecked)
                    {
                        ffmpegAvailable = await VerifyFfmpegAsync(ffmpegPath, cancellationToken);
                        ffmpegChecked = true;
                    }

                    // Without ffmpeg no video gets a thumbnail, which the status says once in place of a failure for each.
                    generatedThumb = ffmpegAvailable
                        ? await TryGenerateVideoThumbnailAsync(
                            fullPath,
                            await ThumbnailDurationSecondsAsync(item.DurationTicks, fullPath, cancellationToken),
                            thumbPath,
                            ffmpegPath,
                            cancellationToken)
                        : null;
                    if (generatedThumb is null && ffmpegAvailable)
                    {
                        failed++;
                    }
                }
                else
                {
                    generatedThumb = await TryGeneratePhotoThumbnailAsync(fullPath, thumbPath, cancellationToken);
                    if (generatedThumb is null)
                    {
                        failed++;
                    }
                }

                if (generatedThumb is not null)
                {
                    PersistThumbnail(item, computedRevision, generatedThumb.Width, generatedThumb.Height);
                }
            }

            if (progressThrottle.TryEnter(force: i == items.Count - 1))
            {
                var processed = i + 1;
                UpdateStage(ThumbnailGenerationStage, status => SetGenerateCounts(status, processed));
            }
        }

        RemoveThumbnailsOutsideCatalog(catalogIds, cancellationToken);
        CompleteStage(ThumbnailGenerationStage, status =>
        {
            status.Stages.ThumbnailGeneration.Failed = failed;
            status.FfmpegNotFound |= ffmpegChecked && !ffmpegAvailable;
        });
    }

    private void PersistThumbnail(CatalogRefreshItem item, string? revision, int width, int height)
    {
        var pending = Interlocked.Exchange(ref _thumbnailWriteHold, null);
        if (pending != null)
        {
            _thumbnailWriteEntered.TrySetResult();
            pending.GetAwaiter().GetResult();
        }

        var storedWidth = width > 0 ? width : (int?)null;
        var storedHeight = height > 0 ? height : (int?)null;
        var storedRevision = string.IsNullOrEmpty(revision) ? null : revision;
        lock (_catalogWriteLock)
        {
            _catalog.Session.SetThumbnail(item.Id, storedRevision, storedWidth, storedHeight);
        }

        item.ThumbnailRevision = storedRevision;
        item.ThumbnailWidth = storedWidth;
        item.ThumbnailHeight = storedHeight;

        var after = Interlocked.Exchange(ref _thumbnailAfterWriteHold, null);
        if (after != null)
        {
            _thumbnailAfterWriteEntered.TrySetResult();
            after.GetAwaiter().GetResult();
        }
    }

    /// <summary>
    /// Deletes each thumbnail whose item isn't in the catalog. Its progress counts only those thumbnails and goes out
    /// at most once per <see cref="ScanProgressInterval"/>, with the last always sent, so a cleanup of thousands
    /// publishes a few status events rather than one for each.
    /// </summary>
    private void RemoveThumbnailsOutsideCatalog(HashSet<string> catalogIds, CancellationToken cancellationToken)
    {
        if (!Directory.Exists(_thumbnailDir))
        {
            return;
        }

        var files = Directory.EnumerateFiles(_thumbnailDir, "*.jpg")
            .Where(file => !catalogIds.Contains(Path.GetFileNameWithoutExtension(file)))
            .ToList();
        var progressThrottle = new RefreshProgressThrottle(ScanProgressInterval, _progressClock);

        void PublishCleanupProgress(int processed)
        {
            UpdateStage(ThumbnailGenerationStage, status =>
            {
                status.Stages.ThumbnailGeneration.Phase = RefreshThumbnailStage.Cleanup;
                SetCount(status.Stages.ThumbnailGeneration, processed, files.Count);
            });
        }

        for (var i = 0; i < files.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var file = files[i];
            if (progressThrottle.TryEnter(force: i == 0))
            {
                PublishCleanupProgress(i);
            }

            var hold = Interlocked.Exchange(ref _thumbnailCleanupHold, null);
            if (hold != null)
            {
                _thumbnailCleanupEntered.TrySetResult();
                hold.GetAwaiter().GetResult();
            }

            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                File.Delete(file);
            }
            catch
            {
                // best effort stale cleanup
            }
        }

        if (files.Count > 0)
        {
            PublishCleanupProgress(files.Count);
        }
    }

    private static bool PositiveThumbnailDimension(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return false;
        }

        return value.TryGetValue<int>(out var number) && number > 0;
    }

    private static List<CatalogRefreshItem> DistinctRefreshItemsByPath(IEnumerable<CatalogRefreshItem> items)
    {
        var list = new List<CatalogRefreshItem>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            if (!string.IsNullOrWhiteSpace(item.FullPath) && seen.Add(item.FullPath))
            {
                list.Add(item);
            }
        }

        return list;
    }

    private static bool ApplyFingerprintDefaults(CatalogRefreshItem item)
    {
        var changed = false;
        if (string.IsNullOrWhiteSpace(item.FingerprintAlgorithm))
        {
            item.FingerprintAlgorithm = "SHA-256";
            changed = true;
        }

        if (item.FingerprintVersion <= 0)
        {
            item.FingerprintVersion = 1;
            changed = true;
        }

        if (string.IsNullOrWhiteSpace(item.Fingerprint) && item.FingerprintStatus != 0)
        {
            item.FingerprintStatus = 0;
            changed = true;
        }

        return changed;
    }

    private void PersistMovedItem(CatalogRefreshItem item, string sourceId, string rootPath, string matchPath, bool defaultsChanged)
    {
        var relative = GetRelativePath(rootPath, matchPath);
        var fileName = Path.GetFileName(matchPath);
        long? size = item.FileSizeBytes;
        DateTime? write = item.LastWriteTimeUtc;
        var haveStat = false;
        try
        {
            var info = new FileInfo(matchPath);
            size = info.Length;
            write = info.LastWriteTimeUtc;
            haveStat = true;
        }
        catch
        {
            // best effort metadata read
        }

        var status = item.FingerprintStatus;
        var markStale = haveStat &&
                        !string.IsNullOrWhiteSpace(item.Fingerprint) &&
                        ((item.FileSizeBytes.HasValue && item.FileSizeBytes.Value != size) ||
                         (item.LastWriteTimeUtc.HasValue && !SameUtc(item.LastWriteTimeUtc, write)));
        if (markStale)
        {
            status = 3;
        }

        lock (_catalogWriteLock)
        {
            _catalog.Session.UpdateItemIdentity(item.Id, sourceId, matchPath, relative, fileName, item.MediaType);
            if (haveStat && item.FileSizeBytes != size)
            {
                _catalog.Session.SetFileSize(item.Id, size);
            }

            if (haveStat && !SameUtc(item.LastWriteTimeUtc, write))
            {
                _catalog.Session.SetLastWriteTime(item.Id, write);
            }

            if (markStale || defaultsChanged)
            {
                _catalog.Session.SetFingerprint(
                    item.Id,
                    item.Fingerprint,
                    item.FingerprintAlgorithm,
                    item.FingerprintVersion,
                    status,
                    item.FingerprintLastUtc);
            }
        }

        item.SourceId = sourceId;
        item.FullPath = matchPath;
        item.RelativePath = relative;
        item.FileName = fileName;
        if (haveStat)
        {
            item.FileSizeBytes = size;
            item.LastWriteTimeUtc = write;
        }

        item.FingerprintStatus = status;
    }

    private void InsertDiscoveredItem(
        List<CatalogRefreshItem> items,
        string sourceId,
        string rootPath,
        string path,
        string fileName,
        int mediaType,
        Dictionary<string, long> sizes,
        Dictionary<string, DateTime> writes,
        Dictionary<string, string> fingerprints,
        DateTime addedUtc)
    {
        var id = Guid.NewGuid().ToString();
        var relative = GetRelativePath(rootPath, path);
        long? size = sizes.TryGetValue(path, out var knownSize) ? knownSize : null;
        DateTime? write = writes.TryGetValue(path, out var knownWrite) ? knownWrite : null;
        string? fingerprint = null;
        var status = 0;
        DateTime? fingerprintLast = null;
        if (fingerprints.TryGetValue(path, out var hashed))
        {
            fingerprint = hashed;
            status = 1;
            fingerprintLast = DateTime.UtcNow;
        }

        lock (_catalogWriteLock)
        {
            _catalog.Session.InsertItem(new LibraryCatalogItem
            {
                Id = id,
                SourceId = sourceId,
                FullPath = path,
                RelativePath = relative,
                FileName = fileName,
                MediaType = mediaType,
                Fingerprint = fingerprint,
                FingerprintAlgorithm = "SHA-256",
                FingerprintVersion = 1,
                FingerprintStatus = status,
                FileSizeBytes = size,
                LastWriteTimeUtc = write,
                FingerprintLastUtc = fingerprintLast,
                DateAddedUtc = addedUtc
            });
        }

        items.Add(new CatalogRefreshItem
        {
            Id = id,
            SourceId = sourceId,
            FullPath = path,
            RelativePath = relative,
            FileName = fileName,
            MediaType = mediaType,
            Fingerprint = fingerprint,
            FingerprintAlgorithm = "SHA-256",
            FingerprintVersion = 1,
            FingerprintStatus = status,
            FileSizeBytes = size,
            LastWriteTimeUtc = write,
            FingerprintLastUtc = fingerprintLast
        });
    }

    private void DeleteRefreshItem(CatalogRefreshItem item)
    {
        lock (_catalogWriteLock)
        {
            _catalog.Session.DeleteItem(item.Id);
        }
    }

    private void PersistFingerprintDefaults(CatalogRefreshItem item, bool defaultsChanged)
    {
        if (!defaultsChanged)
        {
            return;
        }

        lock (_catalogWriteLock)
        {
            _catalog.Session.SetFingerprint(
                item.Id,
                item.Fingerprint,
                item.FingerprintAlgorithm,
                item.FingerprintVersion,
                item.FingerprintStatus,
                item.FingerprintLastUtc);
        }
    }

    private void PersistObservedFingerprint(CatalogRefreshItem item, long? size, DateTime? write, bool haveStat, bool defaultsChanged)
    {
        var sizeChanged = haveStat && item.FileSizeBytes != size;
        var writeChanged = haveStat && !SameUtc(item.LastWriteTimeUtc, write);
        if (!defaultsChanged && !sizeChanged && !writeChanged)
        {
            return;
        }

        lock (_catalogWriteLock)
        {
            if (defaultsChanged)
            {
                _catalog.Session.SetFingerprint(
                    item.Id,
                    item.Fingerprint,
                    item.FingerprintAlgorithm,
                    item.FingerprintVersion,
                    item.FingerprintStatus,
                    item.FingerprintLastUtc);
            }

            if (sizeChanged)
            {
                _catalog.Session.SetFileSize(item.Id, size);
            }

            if (writeChanged)
            {
                _catalog.Session.SetLastWriteTime(item.Id, write);
            }
        }
    }

    private void PersistHashedFingerprint(
        CatalogRefreshItem item,
        string? fingerprint,
        int status,
        long? size,
        DateTime? write,
        DateTime? fingerprintLast)
    {
        WaitForNextFingerprintWriteHold();
        var algorithm = string.IsNullOrWhiteSpace(item.FingerprintAlgorithm) ? "SHA-256" : item.FingerprintAlgorithm;
        var version = item.FingerprintVersion <= 0 ? 1 : item.FingerprintVersion;
        lock (_catalogWriteLock)
        {
            _catalog.Session.SetFingerprint(item.Id, fingerprint, algorithm, version, status, fingerprintLast);
            _catalog.Session.SetFileSize(item.Id, size);
            _catalog.Session.SetLastWriteTime(item.Id, write);
        }
    }

    private void WaitForNextFingerprintWriteHold()
    {
        var hold = Interlocked.Exchange(ref _fingerprintWriteHold, null);
        if (hold == null)
        {
            return;
        }

        _fingerprintWriteEntered.TrySetResult();
        hold.GetAwaiter().GetResult();
    }

    private static bool NeedsLoudness(CatalogRefreshItem item)
    {
        if (!item.HasAudio.HasValue)
        {
            return true;
        }

        if (item.HasAudio.Value)
        {
            // A failed scan keeps the values it couldn't replace, so its recorded error has the video scanned again.
            return !item.IntegratedLoudness.HasValue ||
                   item.LoudnessAnalysisVersion < LibraryCatalogStore.LoudnessAnalysisVersion ||
                   !string.IsNullOrWhiteSpace(item.LoudnessError);
        }

        return item.IntegratedLoudness.HasValue;
    }

    /// <summary>
    /// Stores a scan result and the loudness analysis version it was scanned under, also when nothing else
    /// changed. A failed scan keeps the stored loudness, peak, and analysis version and records its error.
    /// Returns whether the scan changed a value measured before, so neither a first measurement nor a failed scan
    /// counts as a change.
    /// </summary>
    private bool PersistLoudness(CatalogRefreshItem item, FileLoudnessInfo info)
    {
        var hasAudio = info.HasAudio;
        var error = item.LoudnessError;
        var changed = item.HasAudio != hasAudio;

        // A failed scan measured nothing, so the stored values stay. Otherwise a file without audio keeps no
        // loudness or peak, a measured value within 0.1 of the stored one keeps the stored one, and a value the
        // scan didn't measure is stored as none.
        var integrated = item.IntegratedLoudness;
        var peak = item.PeakDb;
        var analysisVersion = item.LoudnessAnalysisVersion;
        if (!info.IsError)
        {
            integrated = Measured(item.IntegratedLoudness, info.HasAudio ? info.IntegratedLoudness : null);
            peak = Measured(item.PeakDb, info.HasAudio ? info.PeakDb : null);
            analysisVersion = LibraryCatalogStore.LoudnessAnalysisVersion;
        }

        changed |= integrated != item.IntegratedLoudness || peak != item.PeakDb;

        // A video without audio, or with its loudness stored, was measured before. A failed scan keeps a video as
        // having audio without measuring it.
        var measuredBefore = item.HasAudio == false || item.IntegratedLoudness.HasValue;
        var valueChanged = !info.IsError &&
                           measuredBefore &&
                           (item.HasAudio != hasAudio ||
                            integrated != item.IntegratedLoudness ||
                            (item.PeakDb.HasValue && peak != item.PeakDb));

        if (info.IsError)
        {
            var message = string.IsNullOrWhiteSpace(info.ErrorMessage) ? "Loudness analysis failed." : info.ErrorMessage;
            if (!string.Equals(error, message, StringComparison.Ordinal))
            {
                error = message;
                changed = true;
            }
        }
        else if (!string.IsNullOrWhiteSpace(error))
        {
            error = null;
            changed = true;
        }

        if (!changed && analysisVersion == item.LoudnessAnalysisVersion)
        {
            return false;
        }

        lock (_catalogWriteLock)
        {
            _catalog.Session.SetLoudness(item.Id, hasAudio, integrated, peak, error, analysisVersion);
        }

        return valueChanged;
    }

    private static double? Measured(double? stored, double? measured)
    {
        return stored.HasValue && measured.HasValue && Math.Abs(stored.Value - measured.Value) <= 0.1 ? stored : measured;
    }

    private static string? StoredThumbnailRevision(CatalogRefreshItem item)
    {
        if (item.FileSizeBytes is not long size || item.LastWriteTimeUtc is not DateTime write)
        {
            return null;
        }

        var utc = write.Kind == DateTimeKind.Utc ? write : write.ToUniversalTime();
        return $"{item.Fingerprint ?? string.Empty}|{size}|{utc.ToString("O", CultureInfo.InvariantCulture)}";
    }

    private static bool SameUtc(DateTime? left, DateTime? right)
    {
        if (left is null || right is null)
        {
            return left is null && right is null;
        }

        var leftUtc = left.Value.Kind == DateTimeKind.Utc ? left.Value : left.Value.ToUniversalTime();
        var rightUtc = right.Value.Kind == DateTimeKind.Utc ? right.Value : right.Value.ToUniversalTime();
        return leftUtc.Ticks == rightUtc.Ticks;
    }

    private IEnumerable<string> EnumerateMediaFiles(string rootPath)
    {
        var all = Directory.EnumerateFiles(rootPath, "*", SearchOption.AllDirectories);
        foreach (var path in all)
        {
            var ext = Path.GetExtension(path);
            if (SupportedMediaExtensions.IsSupportedExtension(ext))
            {
                yield return path;
            }
        }
    }

    private static string GetRelativePath(string rootPath, string fullPath) =>
        ReelRoulette.Core.Storage.LibraryRelativePath.GetRelativePath(rootPath, fullPath);


    private static bool TryReadImageDimensions(string path, out int width, out int height)
    {
        width = 0;
        height = 0;
        try
        {
            using var stream = File.OpenRead(path);
            using var codec = SKCodec.Create(stream);
            if (codec == null)
            {
                return false;
            }

            width = codec.Info.Width;
            height = codec.Info.Height;
            return width > 0 && height > 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// The length a video's thumbnail frames are picked from: the duration the duration stage stored, so the
    /// video isn't probed again, or a fresh probe when none is stored, such as after that stage's probe failed.
    /// </summary>
    private async Task<double> ThumbnailDurationSecondsAsync(
        long? storedDurationTicks,
        string sourcePath,
        CancellationToken cancellationToken)
    {
        if (storedDurationTicks is long ticks && ticks > 0)
        {
            return TimeSpan.FromTicks(ticks).TotalSeconds;
        }

        var probed = await _probeDuration(sourcePath, cancellationToken);
        return Math.Max(probed?.TotalSeconds ?? 0, 0);
    }

    private static async Task<ThumbnailGenerationResult?> TryGenerateVideoThumbnailAsync(
        string sourcePath,
        double durationSeconds,
        string thumbPath,
        string ffmpegPath,
        CancellationToken cancellationToken)
    {
        var attempts = BuildVideoThumbnailOffsets(durationSeconds);

        foreach (var offset in attempts)
        {
            var generated = await TryExtractVideoFrameAtOffsetAsync(sourcePath, thumbPath, ffmpegPath, offset, cancellationToken);
            if (generated is not null)
            {
                return generated;
            }
        }

        return null;
    }

    private static double[] BuildVideoThumbnailOffsets(double durationSeconds)
    {
        if (durationSeconds <= 0.5)
        {
            return [0];
        }

        var midpoint = durationSeconds * 0.5;
        var adjacent = Math.Max(1, durationSeconds * 0.08);
        var nearStart = Math.Min(durationSeconds * 0.15, 5);
        return
        [
            midpoint,
            Math.Max(0, midpoint - adjacent),
            Math.Min(durationSeconds, midpoint + adjacent),
            durationSeconds * 0.33,
            durationSeconds * 0.66,
            nearStart
        ];
    }

    private static async Task<ThumbnailGenerationResult?> TryExtractVideoFrameAtOffsetAsync(
        string sourcePath,
        string thumbPath,
        string ffmpegPath,
        double offsetSeconds,
        CancellationToken cancellationToken)
    {
        var tempPath = thumbPath + ".tmp.jpg";
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = ffmpegPath,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add("-hide_banner");
            startInfo.ArgumentList.Add("-loglevel");
            startInfo.ArgumentList.Add("error");
            startInfo.ArgumentList.Add("-y");
            startInfo.ArgumentList.Add("-ss");
            startInfo.ArgumentList.Add(offsetSeconds.ToString("0.###", CultureInfo.InvariantCulture));
            startInfo.ArgumentList.Add("-i");
            startInfo.ArgumentList.Add(sourcePath);
            startInfo.ArgumentList.Add("-frames:v");
            startInfo.ArgumentList.Add("1");
            startInfo.ArgumentList.Add("-f");
            startInfo.ArgumentList.Add("image2");
            startInfo.ArgumentList.Add("-vcodec");
            startInfo.ArgumentList.Add("mjpeg");
            startInfo.ArgumentList.Add("-vf");
            startInfo.ArgumentList.Add($"scale={ThumbnailMaxEdge}:{ThumbnailMaxEdge}:force_original_aspect_ratio=decrease:flags=lanczos");
            startInfo.ArgumentList.Add("-q:v");
            startInfo.ArgumentList.Add("2");
            startInfo.ArgumentList.Add(tempPath);

            using var process = new Process { StartInfo = startInfo };
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
            try
            {
                process.Start();
                var stdoutTask = process.StandardOutput.ReadToEndAsync(linkedCts.Token);
                _ = process.StandardError.ReadToEndAsync(linkedCts.Token);
                await process.WaitForExitAsync(linkedCts.Token);
                await stdoutTask;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                await TryTerminateProcessAsync(process);
                throw;
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                await TryTerminateProcessAsync(process);
                return null;
            }

            if (process.ExitCode != 0 || !File.Exists(tempPath) || new FileInfo(tempPath).Length <= 0)
            {
                return null;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(thumbPath)!);
            File.Move(tempPath, thumbPath, overwrite: true);
            if (!TryReadImageDimensions(thumbPath, out var width, out var height))
            {
                return null;
            }

            return new ThumbnailGenerationResult
            {
                Width = width,
                Height = height
            };
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return null;
        }
        finally
        {
            try
            {
                if (File.Exists(tempPath))
                {
                    File.Delete(tempPath);
                }
            }
            catch
            {
                // best effort temporary cleanup
            }
        }
    }

    private static Task<ThumbnailGenerationResult?> TryGeneratePhotoThumbnailAsync(string sourcePath, string thumbPath, CancellationToken cancellationToken)
    {
        return Task.Run(() =>
        {
            var tempPath = thumbPath + ".tmp.jpg";
            try
            {
                using var data = SKData.Create(sourcePath);
                if (data == null || data.Size <= 0)
                {
                    return null;
                }

                using var image = SKImage.FromEncodedData(data);
                if (image == null || image.Width <= 0 || image.Height <= 0)
                {
                    return null;
                }

                var scale = Math.Min(
                    ThumbnailMaxEdge / (float)image.Width,
                    ThumbnailMaxEdge / (float)image.Height);
                scale = Math.Min(scale, 1f);
                var targetWidth = Math.Max(1, (int)Math.Round(image.Width * scale));
                var targetHeight = Math.Max(1, (int)Math.Round(image.Height * scale));

                var outputInfo = new SKImageInfo(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
                using var surface = SKSurface.Create(outputInfo);
                if (surface == null)
                {
                    return null;
                }

                var canvas = surface.Canvas;
                canvas.Clear(SKColors.Transparent);
                using var paint = new SKPaint { IsAntialias = true };
                canvas.DrawImage(
                    image,
                    new SKRect(0, 0, targetWidth, targetHeight),
                    new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear),
                    paint);
                canvas.Flush();

                using var snapshot = surface.Snapshot();
                using var encoded = snapshot.Encode(SKEncodedImageFormat.Jpeg, 85);
                if (encoded == null || encoded.Size <= 0)
                {
                    return null;
                }

                Directory.CreateDirectory(Path.GetDirectoryName(thumbPath)!);
                using (var fs = File.Open(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    encoded.SaveTo(fs);
                }
                File.Move(tempPath, thumbPath, overwrite: true);
                return new ThumbnailGenerationResult
                {
                    Width = targetWidth,
                    Height = targetHeight
                };
            }
            catch
            {
                return null;
            }
            finally
            {
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch
                {
                    // best effort temporary cleanup
                }
            }
        }, cancellationToken);
    }


    /// <summary>
    /// A stage's percent: <paramref name="done"/> of <paramref name="total"/>, rounded, or 0 while it has counted no work.
    /// </summary>
    internal static int StagePercent(double done, int total) =>
        total <= 0 ? 0 : Math.Clamp((int)Math.Round(done / total * 100.0), 0, 100);

    /// <summary>Sets a counted stage's <paramref name="processed"/> and <paramref name="total"/>, and its percent from them.</summary>
    private static void SetCount(RefreshCountedStageProgress stage, int processed, int total)
    {
        stage.Processed = processed;
        stage.Total = total;
        stage.Percent = StagePercent(processed, total);
    }

    private static RefreshStageProgress StageOf(RefreshStages stages, string stage) => stage switch
    {
        SourceRefreshStage => stages.SourceRefresh,
        NameSortKeysStage => stages.NameSortKeys,
        FingerprintScanStage => stages.FingerprintScan,
        DurationScanStage => stages.DurationScan,
        LoudnessScanStage => stages.LoudnessScan,
        ThumbnailGenerationStage => stages.ThumbnailGeneration,
        _ => throw new ArgumentOutOfRangeException(nameof(stage), stage, "Not a refresh stage.")
    };

    /// <summary>
    /// Publishes <paramref name="stage"/> as the run's current stage before its first progress, so clients show the
    /// stage the run is in, and a failure on its first file names it.
    /// </summary>
    private void StartStage(string stage, Action<RefreshStatusSnapshot>? update = null) => UpdateStage(stage, update ?? (_ => { }));

    /// <summary>Makes <paramref name="stage"/> the run's current stage, applies <paramref name="update"/> to the status, and publishes it.</summary>
    private void UpdateStage(string stage, Action<RefreshStatusSnapshot> update)
    {
        lock (_runLock)
        {
            _status.CurrentStage = stage;
            update(_status);
            PublishStatusLocked();
        }
    }

    /// <summary>
    /// Lists a source whose items this run kept because its folder listed no media files, by its id, since the status
    /// goes to every client and clients look up the folder in the source list they may see.
    /// </summary>
    private void RecordKeptSource(string sourceId, int itemCount)
    {
        lock (_runLock)
        {
            _status.KeptSources.Add(new RefreshKeptSource { SourceId = sourceId, ItemCount = itemCount });
            PublishStatusLocked();
        }
    }

    /// <summary>Applies the stage's last counts in <paramref name="update"/>, marks it complete at 100%, and publishes the status.</summary>
    private void CompleteStage(string stage, Action<RefreshStatusSnapshot>? update = null)
    {
        UpdateStage(stage, status =>
        {
            update?.Invoke(status);
            var progress = StageOf(status.Stages, stage);
            progress.IsComplete = true;
            progress.Percent = 100;
        });
    }

    private void PublishStatusLocked()
    {
        _state.PublishExternal("refreshStatusChanged", new RefreshStatusChangedPayload
        {
            Snapshot = CloneStatus(_status)
        });
    }

    private static RefreshStatusSnapshot CloneStatus(RefreshStatusSnapshot source)
    {
        return new RefreshStatusSnapshot
        {
            IsRunning = source.IsRunning,
            RunId = source.RunId,
            Trigger = source.Trigger,
            StartedUtc = source.StartedUtc,
            CompletedUtc = source.CompletedUtc,
            CurrentStage = source.CurrentStage,
            Failed = source.Failed,
            FfmpegNotFound = source.FfmpegNotFound,
            FfprobeNotFound = source.FfprobeNotFound,
            Stages = new RefreshStages
            {
                SourceRefresh = source.Stages.SourceRefresh with { },
                NameSortKeys = source.Stages.NameSortKeys with { },
                FingerprintScan = source.Stages.FingerprintScan with { },
                DurationScan = source.Stages.DurationScan with { },
                LoudnessScan = source.Stages.LoudnessScan with { },
                ThumbnailGeneration = source.Stages.ThumbnailGeneration with { }
            },
            KeptSources = source.KeptSources.Select(s => new RefreshKeptSource
            {
                SourceId = s.SourceId,
                ItemCount = s.ItemCount
            }).ToList()
        };
    }

    /// <summary>Publishes a duration or loudness scan's progress and counts, at most once per interval.</summary>
    private void TryUpdateMediaScanProgress(
        string stage,
        RefreshProgressThrottle throttle,
        int processed,
        int total,
        int changed,
        int failed)
    {
        if (!throttle.TryEnter())
        {
            return;
        }

        UpdateStage(stage, status => SetMediaScanCounts(status, stage, processed, total, changed, failed));
    }

    /// <summary>
    /// Publishes a duration or loudness scan's start once its tool is found: 0 of the videos it scans, and whether the
    /// rescan is forced, so a slow first video doesn't leave the stage without its count. It starts the throttle's interval.
    /// </summary>
    private void PublishMediaScanStart(string stage, RefreshProgressThrottle throttle, int total, bool forced)
    {
        throttle.TryEnter(force: true);
        UpdateStage(stage, status =>
        {
            SetMediaScanCounts(status, stage, 0, total, 0, 0);
            MediaScanOf(status, stage).Forced = forced;
        });
    }

    private static void SetMediaScanCounts(RefreshStatusSnapshot status, string stage, int processed, int total, int changed, int failed)
    {
        var scan = MediaScanOf(status, stage);
        SetCount(scan, processed, total);
        scan.Changed = changed;
        scan.Failed = failed;
    }

    private static RefreshMediaScanStage MediaScanOf(RefreshStatusSnapshot status, string stage) =>
        stage == DurationScanStage ? status.Stages.DurationScan : status.Stages.LoudnessScan;

    private void ConsumeRefreshRescanFlags(bool clearDuration, bool clearLoudness)
    {
        try
        {
            // Start from every saved setting so clearing a flag changes nothing else.
            var updated = _coreSettings.GetRefreshSettings();
            updated.ForceRescanDuration = !clearDuration && updated.ForceRescanDuration;
            updated.ForceRescanLoudness = !clearLoudness && updated.ForceRescanLoudness;
            _coreSettings.UpdateRefreshSettings(updated);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to clear one-shot refresh rescan flags");
        }
    }

    private static string ResolveFfprobePath()
    {
        var exeDir = AppContext.BaseDirectory;
        var rid = GetRuntimeIdentifier();
        if (!string.IsNullOrWhiteSpace(rid))
        {
            var exeName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffprobe.exe" : "ffprobe";
            var bundled = Path.Combine(exeDir, "runtimes", rid, "native", exeName);
            if (File.Exists(bundled))
            {
                return bundled;
            }
        }

        return RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffprobe.exe" : "ffprobe";
    }

    private static string ResolveFfmpegPath()
    {
        var exeDir = AppContext.BaseDirectory;
        var rid = GetRuntimeIdentifier();
        if (!string.IsNullOrWhiteSpace(rid))
        {
            var exeName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg";
            var bundled = Path.Combine(exeDir, "runtimes", rid, "native", exeName);
            if (File.Exists(bundled))
            {
                return bundled;
            }
        }

        return RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffmpeg.exe" : "ffmpeg";
    }

    private static string GetRuntimeIdentifier()
    {
        return RuntimeInformation.ProcessArchitecture switch
        {
            Architecture.X64 => RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "win-x64" :
                RuntimeInformation.IsOSPlatform(OSPlatform.Linux) ? "linux-x64" :
                RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "osx-x64" : string.Empty,
            Architecture.Arm64 => RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "osx-arm64" : string.Empty,
            _ => string.Empty
        };
    }

    private static async Task<TimeSpan?> GetVideoDurationAsync(string filePath, CancellationToken cancellationToken)
    {
        if (_ffprobeSemaphore == null)
        {
            lock (FfprobeSemaphoreLock)
            {
                if (_ffprobeSemaphore == null)
                {
                    var maxConcurrency = Math.Clamp(Environment.ProcessorCount / 2, 2, 8);
                    _ffprobeSemaphore = new SemaphoreSlim(maxConcurrency, maxConcurrency);
                }
            }
        }

        bool semaphoreAcquired = false;
        try
        {
            await _ffprobeSemaphore!.WaitAsync(cancellationToken);
            semaphoreAcquired = true;

            var ffprobePath = ResolveFfprobePath();
            var startInfo = new ProcessStartInfo
            {
                FileName = ffprobePath,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            startInfo.ArgumentList.Add("-v");
            startInfo.ArgumentList.Add("error");
            startInfo.ArgumentList.Add("-select_streams");
            startInfo.ArgumentList.Add("v:0");
            startInfo.ArgumentList.Add("-show_entries");
            startInfo.ArgumentList.Add("format=duration,stream=duration");
            startInfo.ArgumentList.Add("-of");
            startInfo.ArgumentList.Add("json");
            startInfo.ArgumentList.Add("-i");
            startInfo.ArgumentList.Add(filePath);

            using var process = new Process { StartInfo = startInfo };
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

            try
            {
                process.Start();
                var stdoutTask = process.StandardOutput.ReadToEndAsync(linkedCts.Token);
                _ = process.StandardError.ReadToEndAsync(linkedCts.Token);
                await process.WaitForExitAsync(linkedCts.Token);
                var output = await stdoutTask;

                if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
                {
                    return null;
                }

                using var doc = JsonDocument.Parse(output);
                var root = doc.RootElement;
                if (root.TryGetProperty("format", out var format) &&
                    format.TryGetProperty("duration", out var formatDuration) &&
                    formatDuration.ValueKind == JsonValueKind.String &&
                    double.TryParse(formatDuration.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var fmtSeconds) &&
                    fmtSeconds > 0)
                {
                    return TimeSpan.FromSeconds(fmtSeconds);
                }

                if (root.TryGetProperty("streams", out var streams) &&
                    streams.ValueKind == JsonValueKind.Array &&
                    streams.GetArrayLength() > 0)
                {
                    var firstStream = streams[0];
                    if (firstStream.TryGetProperty("duration", out var streamDuration) &&
                        streamDuration.ValueKind == JsonValueKind.String &&
                        double.TryParse(streamDuration.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var streamSeconds) &&
                        streamSeconds > 0)
                    {
                        return TimeSpan.FromSeconds(streamSeconds);
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                await TryTerminateProcessAsync(process);
                throw;
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                await TryTerminateProcessAsync(process);
                return null;
            }
            catch
            {
                return null;
            }

            return null;
        }
        finally
        {
            if (semaphoreAcquired)
            {
                _ffprobeSemaphore!.Release();
            }
        }
    }

    private Task<bool> VerifyFfmpegAsync(string ffmpegPath, CancellationToken cancellationToken) =>
        VerifyToolAsync(ffmpegPath, _toolAvailability?.Ffmpeg, cancellationToken);

    private Task<bool> VerifyFfprobeAsync(string ffprobePath, CancellationToken cancellationToken) =>
        VerifyToolAsync(ffprobePath, _toolAvailability?.Ffprobe, cancellationToken);

    /// <summary>Whether the tool at <paramref name="toolPath"/> runs, by its <c>-version</c>, or the answer tests set.</summary>
    private async Task<bool> VerifyToolAsync(string toolPath, bool? testAnswer, CancellationToken cancellationToken)
    {
        try
        {
            var hold = _toolCheckHold;
            if (hold != null)
            {
                _toolCheckHold = null;
                _toolCheckEntered.TrySetResult();
                await hold.WaitAsync(cancellationToken);
            }

            if (testAnswer is bool answer)
            {
                return answer;
            }

            var testStartInfo = new ProcessStartInfo
            {
                FileName = toolPath,
                Arguments = "-version",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            using var process = new Process { StartInfo = testStartInfo };
            try
            {
                process.Start();
                await process.WaitForExitAsync(cancellationToken);
                return process.ExitCode == 0;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                await TryTerminateProcessAsync(process);
                throw;
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<FileLoudnessInfo?> AnalyzeLoudnessAsync(
        string filePath,
        string ffmpegPath,
        TimeSpan? knownDuration,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = ffmpegPath,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        startInfo.ArgumentList.Add("-hide_banner");
        startInfo.ArgumentList.Add("-nostats");
        startInfo.ArgumentList.Add("-vn");
        startInfo.ArgumentList.Add("-sn");
        if (knownDuration.HasValue && knownDuration.Value >= TimeSpan.FromMinutes(60))
        {
            var seekSeconds = knownDuration.Value.TotalSeconds * 0.2;
            startInfo.ArgumentList.Add("-ss");
            startInfo.ArgumentList.Add(seekSeconds.ToString("0.###", CultureInfo.InvariantCulture));
            startInfo.ArgumentList.Add("-t");
            startInfo.ArgumentList.Add("600");
        }

        startInfo.ArgumentList.Add("-i");
        startInfo.ArgumentList.Add(filePath);
        startInfo.ArgumentList.Add("-filter:a");
        startInfo.ArgumentList.Add("ebur128=framelog=verbose:peak=true");
        startInfo.ArgumentList.Add("-f");
        startInfo.ArgumentList.Add("null");
        startInfo.ArgumentList.Add("-");

        using var process = new Process { StartInfo = startInfo };
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        int exitCode;
        string output;
        try
        {
            process.Start();
            output = await process.StandardError.ReadToEndAsync(linkedCts.Token);
            await process.WaitForExitAsync(linkedCts.Token);
            exitCode = process.ExitCode;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            await TryTerminateProcessAsync(process);
            throw;
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            await TryTerminateProcessAsync(process);
            return new FileLoudnessInfo
            {
                HasAudio = true,
                IsError = true,
                ErrorMessage = "Loudness analysis timed out while running ffmpeg."
            };
        }
        catch
        {
            await TryTerminateProcessAsync(process);
            return new FileLoudnessInfo
            {
                HasAudio = true,
                IsError = true,
                ErrorMessage = "Loudness analysis failed while running ffmpeg."
            };
        }

        var parsed = ParseLoudnessFromFfmpegOutput(output, exitCode);
        if (parsed != null)
        {
            return parsed;
        }

        return new FileLoudnessInfo
        {
            HasAudio = true,
            IsError = true,
            ErrorMessage = "Loudness analysis failed. Item kept as has-audio for safety."
        };
    }

    /// <summary>
    /// Reads ffmpeg's <c>ebur128</c> summary: the integrated loudness from its <c>I:</c> line and the true
    /// peak from its <c>Peak:</c> line. A silent track's peak reads <c>-inf</c>, which no number matches, so
    /// it has none. A digitally silent track, at the -70 LUFS floor with no peak, counts as no audio, the
    /// same as a file without an audio track; a track at the floor with a real peak, such as faint hiss,
    /// keeps counting as audio. Null when the file has audio but the summary has no loudness.
    /// </summary>
    internal static FileLoudnessInfo? ParseLoudnessFromFfmpegOutput(string output, int exitCode = 0)
    {
        double? integratedLoudness = null;
        double? peakDb = null;
        var lines = output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries);

        var fileOpenedSuccessfully = output.Contains("Input #0", StringComparison.OrdinalIgnoreCase);
        var hasVideoStream = output.Contains("Stream #0:", StringComparison.Ordinal) && output.Contains("Video:", StringComparison.OrdinalIgnoreCase);
        var hasAudioStream = output.Contains("Stream #0:", StringComparison.Ordinal) && output.Contains("Audio:", StringComparison.OrdinalIgnoreCase);
        var hasExplicitNoAudioMessage =
            output.Contains("does not contain any audio stream", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("matches no streams", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("no audio stream", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("Stream map '0:a' matches no streams", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("no audio streams found", StringComparison.OrdinalIgnoreCase);
        var hasNoStreamOutputError = output.Contains("Output file does not contain any stream", StringComparison.OrdinalIgnoreCase) ||
                                     (output.Contains("Error opening output file", StringComparison.OrdinalIgnoreCase) &&
                                      output.Contains("Invalid argument", StringComparison.OrdinalIgnoreCase));
        var hasFatalError =
            (!fileOpenedSuccessfully && output.Length > 0 && exitCode != 0) ||
            output.Contains("Invalid data found", StringComparison.OrdinalIgnoreCase) ||
            (output.Contains("Error opening", StringComparison.OrdinalIgnoreCase) &&
             !hasNoStreamOutputError &&
             !output.Contains("output file", StringComparison.OrdinalIgnoreCase)) ||
            output.Contains("Permission denied", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("No such file", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("cannot open", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("does not exist", StringComparison.OrdinalIgnoreCase) ||
            output.Contains("No space left", StringComparison.OrdinalIgnoreCase);

        if (hasExplicitNoAudioMessage ||
            (fileOpenedSuccessfully && hasVideoStream && !hasAudioStream) ||
            (fileOpenedSuccessfully && hasNoStreamOutputError && !hasFatalError))
        {
            return new FileLoudnessInfo { HasAudio = false };
        }

        foreach (var line in lines)
        {
            var integratedMatch = IntegratedLufsRegex.Match(line);
            if (integratedMatch.Success &&
                double.TryParse(integratedMatch.Groups["value"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var loudness))
            {
                integratedLoudness = loudness;
            }

            var peakMatch = PeakDbfsRegex.Match(line);
            if (peakMatch.Success &&
                double.TryParse(peakMatch.Groups["value"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var peak))
            {
                peakDb = peak;
            }
        }

        if (!integratedLoudness.HasValue)
        {
            return null;
        }

        if (integratedLoudness.Value <= DigitalSilenceLufs && !peakDb.HasValue)
        {
            return new FileLoudnessInfo { HasAudio = false };
        }

        return new FileLoudnessInfo
        {
            HasAudio = true,
            IntegratedLoudness = integratedLoudness,
            PeakDb = peakDb
        };
    }

    private static async Task TryTerminateProcessAsync(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // best effort cleanup for timed-out/canceled ffmpeg children
        }

        try
        {
            if (!process.HasExited)
            {
                await process.WaitForExitAsync(CancellationToken.None);
            }
        }
        catch
        {
            // best effort cleanup for timed-out/canceled ffmpeg children
        }
    }

    /// <summary>What one loudness scan found.</summary>
    internal sealed class FileLoudnessInfo
    {
        public bool HasAudio { get; init; }

        /// <summary>Integrated loudness in LUFS, or null when the scan measured none.</summary>
        public double? IntegratedLoudness { get; init; }

        /// <summary>True peak in dBTP, or null when the scan measured none, as for a file without audio.</summary>
        public double? PeakDb { get; init; }

        public bool IsError { get; init; }
        public string? ErrorMessage { get; init; }
    }

    private sealed class ThumbnailGenerationResult
    {
        public int Width { get; init; }
        public int Height { get; init; }
    }
}
