using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ReelRoulette.Core.Fingerprints;
using ReelRoulette.Server.Contracts;
using SkiaSharp;

namespace ReelRoulette.Server.Services;

public sealed class RefreshPipelineService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private const int ThumbnailMaxEdge = 480;
    private const long ThumbnailCacheMaxBytes = 2L * 1024L * 1024L * 1024L;
    private const int ThumbnailCacheMaxFiles = 100_000;

    private static SemaphoreSlim? _ffprobeSemaphore;
    private static readonly object FfprobeSemaphoreLock = new();
    private static SemaphoreSlim? _ffmpegSemaphore;
    private static readonly object FfmpegSemaphoreLock = new();
    private static readonly Regex IntegratedLufsRegex = new(
        @"(?:^|\s)I:\s*(?<value>-?\d+(?:\.\d+)?)\s*LUFS\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex PeakDbfsRegex = new(
        @"(?:^|\s)(?:Peak|True peak):\s*(?<value>-?\d+(?:\.\d+)?)\s*dBFS\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Library JSON legacy fields may represent enums as either numbers or strings.
    // Examples:
    // - mediaType: 0/1 OR "Video"/"Photo"
    // - fingerprintStatus: 0/1/2/3 OR "Pending"/"Ready"/"Failed"/"Stale"
    private static int ResolveMediaType(JsonNode? node)
    {
        if (node is null)
        {
            return 0;
        }

        if (node is JsonValue value &&
            value.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (node is JsonValue value2 &&
            value2.TryGetValue<string>(out var textValue))
        {
            var text = (textValue ?? string.Empty).Trim();
            return text.Equals("Video", StringComparison.OrdinalIgnoreCase) ? 0 :
                   text.Equals("Photo", StringComparison.OrdinalIgnoreCase) ? 1 :
                   0;
        }

        return 0;
    }

    private static int ResolveFingerprintStatus(JsonNode? node)
    {
        if (node is null)
        {
            return 0;
        }

        if (node is JsonValue value &&
            value.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (node is JsonValue value2 &&
            value2.TryGetValue<string>(out var textValue))
        {
            // Keep mapping aligned with desktop expectations and existing server logic checks (0/1).
            var text = (textValue ?? string.Empty).Trim();
            return text.Equals("Pending", StringComparison.OrdinalIgnoreCase) ? 0 :
                   text.Equals("Ready", StringComparison.OrdinalIgnoreCase) ? 1 :
                   text.Equals("Failed", StringComparison.OrdinalIgnoreCase) ? 2 :
                   text.Equals("Stale", StringComparison.OrdinalIgnoreCase) ? 3 :
                   0;
        }

        return 0;
    }

    private readonly ServerStateService _state;
    private readonly ILogger<RefreshPipelineService> _logger;
    private readonly FileFingerprintService _fingerprintService = new();
    private readonly object _runLock = new();
    private readonly string _libraryPath;
    private readonly string _thumbnailDir;
    private readonly string _thumbnailIndexPath;
    private readonly CoreSettingsService _coreSettings;
    private RefreshStatusSnapshot _status = new();
    private DateTimeOffset _nextAutoRunUtc;
    private bool _isRunLoopActive;

    public RefreshPipelineService(
        ServerStateService state,
        ILogger<RefreshPipelineService> logger,
        CoreSettingsService coreSettings,
        string? appDataPathOverride = null)
    {
        _state = state;
        _logger = logger;
        _coreSettings = coreSettings;
        var roamingAppData = appDataPathOverride ??
                             Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(roamingAppData);
        _libraryPath = Path.Combine(roamingAppData, "library.json");

        var localAppData = appDataPathOverride ??
                           Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette");
        Directory.CreateDirectory(localAppData);
        _thumbnailDir = Path.Combine(localAppData, "thumbnails");
        _thumbnailIndexPath = Path.Combine(_thumbnailDir, "index.json");
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

    public RefreshSettingsSnapshot GetSettings()
    {
        return _coreSettings.GetRefreshSettings();
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

    public WebRuntimeSettingsSnapshot GetWebRuntimeSettings()
    {
        return _coreSettings.GetWebRuntimeSettings();
    }

    public WebRuntimeSettingsSnapshot UpdateWebRuntimeSettings(WebRuntimeSettingsSnapshot snapshot)
    {
        return _coreSettings.UpdateWebRuntimeSettings(snapshot);
    }

    public RefreshStartResponse TryStartManual()
    {
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

        _ = Task.Run(() => ExecuteReservedRunAsync(CancellationToken.None));
        return new RefreshStartResponse
        {
            Accepted = true,
            Message = "started",
            RunId = runId
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            bool shouldRun;
            lock (_runLock)
            {
                var refreshSettings = _coreSettings.GetRefreshSettings();
                shouldRun = refreshSettings.AutoRefreshEnabled &&
                            !_status.IsRunning &&
                            !_isRunLoopActive &&
                            DateTimeOffset.UtcNow >= _nextAutoRunUtc;
            }

            if (shouldRun)
            {
                if (TryReserveRun("auto", out _))
                {
                    await ExecuteReservedRunAsync(stoppingToken);
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    public string GetThumbnailPath(string itemId)
    {
        return Path.Combine(_thumbnailDir, $"{itemId}.jpg");
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
                StartedUtc = DateTimeOffset.UtcNow,
                Stages =
                [
                    NewStage("sourceRefresh"),
                    NewStage("fingerprintScan"),
                    NewStage("durationScan"),
                    NewStage("loudnessScan"),
                    NewStage("thumbnailGeneration")
                ]
            };
            runId = _status.RunId;
            PublishStatusLocked();
            return true;
        }
    }

    private async Task ExecuteReservedRunAsync(CancellationToken cancellationToken)
    {
        try
        {
            await RunSourceRefreshAsync(cancellationToken);
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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Refresh pipeline failed");
            lock (_runLock)
            {
                _status.IsRunning = false;
                _status.LastError = ex.Message;
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

    private void ScheduleNextAutoRunFromNowLocked()
    {
        _nextAutoRunUtc = DateTimeOffset.UtcNow.AddMinutes(_coreSettings.GetRefreshSettings().AutoRefreshIntervalMinutes);
    }

    private async Task RunSourceRefreshAsync(CancellationToken cancellationToken)
    {
        UpdateStage("sourceRefresh", 5, "Loading sources...");
        var root = await LoadLibraryJsonAsync(cancellationToken);
        var sources = root["sources"] as JsonArray ?? [];
        var items = root["items"] as JsonArray ?? [];

        int added = 0;
        int removed = 0;
        int updated = 0;
        int renamed = 0;
        int moved = 0;
        int unresolvedQueued = 0;

        var sourceNodes = sources.OfType<JsonObject>().Where(s => s != null).ToList();
        for (int sourceIndex = 0; sourceIndex < sourceNodes.Count; sourceIndex++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var source = sourceNodes[sourceIndex]!;
            var sourceId = source["id"]?.GetValue<string>() ?? string.Empty;
            var rootPath = source["rootPath"]?.GetValue<string>() ?? string.Empty;
            var isEnabled = source["isEnabled"]?.GetValue<bool?>() ?? true;
            if (string.IsNullOrWhiteSpace(sourceId) || string.IsNullOrWhiteSpace(rootPath) || !isEnabled || !Directory.Exists(rootPath))
            {
                continue;
            }

            var discovered = EnumerateMediaFiles(rootPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var existingForSource = items
                .OfType<JsonObject>()
                .Where(i => string.Equals(i?["sourceId"]?.GetValue<string>(), sourceId, StringComparison.OrdinalIgnoreCase))
                .ToList();

            var existingPaths = existingForSource
                .Select(i => i["fullPath"]?.GetValue<string>() ?? string.Empty)
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var missingItems = existingForSource
                .Where(i => !discovered.Contains(i["fullPath"]?.GetValue<string>() ?? string.Empty))
                .ToList();
            var newPaths = discovered
                .Where(path => !existingPaths.Contains(path))
                .ToList();

            var progressBase = ((sourceIndex + 1) / (double)Math.Max(1, sourceNodes.Count)) * 100.0;
            UpdateStage("sourceRefresh",
                Math.Clamp((int)Math.Round(progressBase * 0.2), 5, 100),
                $"Source {sourceIndex + 1}/{sourceNodes.Count}: analyzing changes");

            if (missingItems.Count == 0 && newPaths.Count == 0)
            {
                var pctNoChanges = Math.Clamp((int)Math.Round(progressBase), 10, 100);
                UpdateStage("sourceRefresh",
                    pctNoChanges,
                    $"Sources {sourceIndex + 1}/{sourceNodes.Count} (added {added}, removed {removed}, renamed {renamed}, moved {moved})");
                continue;
            }

            var newPathMediaType = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var newPathFileName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var newPathSize = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            var newPathWrite = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in newPaths)
            {
                var mediaType = MediaPlayableExtensions.IsVideoExtension(Path.GetExtension(path)) ? 0 : 1;
                newPathMediaType[path] = mediaType;
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

            var missingReady = new List<JsonObject>();
            foreach (var missing in missingItems)
            {
                EnsureIdentityAndFingerprintDefaults(missing!);
                var fp = missing!["fingerprint"]?.GetValue<string>();
                var fpStatus = ResolveFingerprintStatus(missing["fingerprintStatus"]);
                if (!string.IsNullOrWhiteSpace(fp) && fpStatus == 1)
                {
                    missingReady.Add(missing);
                }
            }

            foreach (var missing in missingReady)
            {
                var missingMediaType = ResolveMediaType(missing["mediaType"]);
                var missingSize = missing["fileSizeBytes"]?.GetValue<long?>();
                foreach (var candidatePath in newPaths)
                {
                    if (consumedNewPaths.Contains(candidatePath))
                    {
                        continue;
                    }

                    if (!newPathMediaType.TryGetValue(candidatePath, out var candidateMediaType) || candidateMediaType != missingMediaType)
                    {
                        continue;
                    }

                    if (missingSize.HasValue &&
                        (!newPathSize.TryGetValue(candidatePath, out var candidateSize) || candidateSize != missingSize.Value))
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

                if (fingerprintCount > 0 && (fingerprintProcessed % 25 == 0 || fingerprintProcessed == fingerprintCount))
                {
                    var phasePct = 20 + (int)Math.Round((fingerprintProcessed / (double)fingerprintCount) * 50.0);
                    var sourcePct = ((sourceIndex + phasePct / 100.0) / Math.Max(1, sourceNodes.Count)) * 100.0;
                    UpdateStage("sourceRefresh",
                        Math.Clamp((int)Math.Round(sourcePct), 10, 100),
                        $"Source {sourceIndex + 1}/{sourceNodes.Count}: fingerprinting {fingerprintProcessed}/{fingerprintCount}");
                }
            }

            var newPathsByFingerprint = candidateNewFingerprints
                .GroupBy(kvp => kvp.Value, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Select(kvp => kvp.Key).ToList(), StringComparer.OrdinalIgnoreCase);

            foreach (var missing in missingReady)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var missingFingerprint = missing["fingerprint"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(missingFingerprint))
                {
                    continue;
                }

                string? matchPath = null;
                if (newPathsByFingerprint.TryGetValue(missingFingerprint, out var fingerprintMatches))
                {
                    foreach (var path in fingerprintMatches)
                    {
                        if (consumedNewPaths.Contains(path))
                        {
                            continue;
                        }

                        var missingMediaType = missing["mediaType"]?.GetValue<int?>() ?? 0;
                        if (!newPathMediaType.TryGetValue(path, out var mediaType) || mediaType != missingMediaType)
                        {
                            continue;
                        }

                        matchPath = path;
                        break;
                    }
                }

                if (string.IsNullOrWhiteSpace(matchPath))
                {
                    var missingMediaType = ResolveMediaType(missing["mediaType"]);
                    var missingSize = missing["fileSizeBytes"]?.GetValue<long?>();
                    var hadCandidates = candidateNewPaths.Any(path =>
                        !consumedNewPaths.Contains(path) &&
                        newPathMediaType.TryGetValue(path, out var mt) &&
                        mt == missingMediaType &&
                        (!missingSize.HasValue || (newPathSize.TryGetValue(path, out var sz) && sz == missingSize.Value)));

                    if (hadCandidates)
                    {
                        unresolvedQueued++;
                        var missingPath = missing["fullPath"]?.GetValue<string>() ?? string.Empty;
                        if (!string.IsNullOrWhiteSpace(missingPath))
                        {
                            unresolvedMissingPaths.Add(missingPath);
                        }
                    }
                    continue;
                }

                var priorPath = missing["fullPath"]?.GetValue<string>() ?? string.Empty;
                var oldDir = Path.GetDirectoryName(priorPath) ?? string.Empty;
                var newDir = Path.GetDirectoryName(matchPath) ?? string.Empty;
                var oldName = Path.GetFileName(priorPath);
                var newName = Path.GetFileName(matchPath);

                missing["fullPath"] = matchPath;
                missing["relativePath"] = GetRelativePath(rootPath, matchPath);
                missing["fileName"] = newName;
                missing["sourceId"] = sourceId;
                UpdateFileMetadataCache(missing);

                if (!oldDir.Equals(newDir, StringComparison.OrdinalIgnoreCase))
                {
                    moved++;
                }
                else if (!string.Equals(oldName, newName, StringComparison.OrdinalIgnoreCase))
                {
                    renamed++;
                }
                else
                {
                    updated++;
                }

                consumedNewPaths.Add(matchPath);
            }

            foreach (var path in newPaths.Where(path => !consumedNewPaths.Contains(path)))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (unresolvedNewPaths.Contains(path))
                {
                    unresolvedQueued++;
                    continue;
                }

                var mediaType = newPathMediaType[path];
                var newItem = new JsonObject
                {
                    ["id"] = Guid.NewGuid().ToString(),
                    ["sourceId"] = sourceId,
                    ["fullPath"] = path,
                    ["relativePath"] = GetRelativePath(rootPath, path),
                    ["fileName"] = newPathFileName[path],
                    ["tags"] = new JsonArray(),
                    ["mediaType"] = mediaType,
                    ["isFavorite"] = false,
                    ["isBlacklisted"] = false,
                    ["playCount"] = 0,
                    ["fingerprintAlgorithm"] = "SHA-256",
                    ["fingerprintVersion"] = 1,
                    ["fingerprintStatus"] = 0
                };
                UpdateFileMetadataCache(newItem);

                if (candidateNewFingerprints.TryGetValue(path, out var fingerprint))
                {
                    newItem["fingerprint"] = fingerprint;
                    newItem["fingerprintStatus"] = 1;
                    if (newPathWrite.TryGetValue(path, out var writeUtc))
                    {
                        newItem["lastWriteTimeUtc"] = writeUtc;
                    }
                    if (newPathSize.TryGetValue(path, out var sizeBytes))
                    {
                        newItem["fileSizeBytes"] = sizeBytes;
                    }
                    newItem["fingerprintLastUtc"] = DateTime.UtcNow;
                }

                items.Add(newItem);
                added++;
            }

            foreach (var missing in missingItems)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var missingPath = missing!["fullPath"]?.GetValue<string>() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(missingPath) && File.Exists(missingPath))
                {
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(missingPath) && unresolvedMissingPaths.Contains(missingPath))
                {
                    continue;
                }

                items.Remove(missing);
                removed++;
            }

            var pct = Math.Clamp((int)Math.Round(((sourceIndex + 1) / (double)Math.Max(1, sourceNodes.Count)) * 100.0), 10, 100);
            UpdateStage("sourceRefresh",
                pct,
                $"Sources {sourceIndex + 1}/{sourceNodes.Count} (added {added}, removed {removed}, renamed {renamed}, moved {moved}, unresolved {unresolvedQueued})");
        }

        root["items"] = items;
        await SaveLibraryJsonAsync(root, cancellationToken);
        CompleteStage("sourceRefresh",
            $"Source refresh complete ({added} added, {removed} removed, {renamed} renamed, {moved} moved, {updated} updated, {unresolvedQueued} unresolved)");
    }

    internal async Task RunFingerprintStageAsync(CancellationToken cancellationToken)
    {
        var parallelism = Math.Clamp(_coreSettings.GetRefreshSettings().FingerprintScanMaxDegreeOfParallelism, 1, 16);
        UpdateStage("fingerprintScan", 0, "Fingerprint scan starting...");
        var root = await LoadLibraryJsonAsync(cancellationToken);
        var items = root["items"] as JsonArray ?? [];
        var nodes = items.OfType<JsonObject>().Where(n => n != null).Cast<JsonObject>().ToList();

        var workList = new List<JsonObject>();
        var skipped = 0;
        foreach (var node in nodes)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var fullPath = node["fullPath"]?.GetValue<string>() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath))
            {
                continue;
            }

            EnsureIdentityAndFingerprintDefaults(node);
            UpdateFileMetadataCache(node);

            if (!NeedsFingerprintProcessing(node))
            {
                skipped++;
                continue;
            }

            workList.Add(node);
        }

        var total = workList.Count;
        if (total == 0)
        {
            root["items"] = items;
            await SaveLibraryJsonAsync(root, cancellationToken);
            CompleteStage("fingerprintScan", $"Fingerprint scan complete (0 hashed, 0 failed, {skipped} skipped)");
            return;
        }

        var processed = 0;
        var ready = 0;
        var failed = 0;
        var progressLock = new object();
        var nextStatusUtc = DateTimeOffset.MinValue;

        void TryPublishFingerprintProgress(bool force)
        {
            var now = DateTimeOffset.UtcNow;
            lock (progressLock)
            {
                if (!force && now < nextStatusUtc)
                {
                    return;
                }

                var p = Volatile.Read(ref processed);
                var r = Volatile.Read(ref ready);
                var f = Volatile.Read(ref failed);
                var pct = Math.Clamp((int)Math.Round((p / (double)Math.Max(1, total)) * 100.0), 0, 100);
                UpdateStage("fingerprintScan", pct, $"Fingerprint scan ({p} hashed, {r} ready, {f} failed)");
                nextStatusUtc = now.AddMilliseconds(400);
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
                node =>
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var path = node["fullPath"]?.GetValue<string>() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                    {
                        lock (node)
                        {
                            node.Remove("fingerprint");
                            node["fingerprintStatus"] = "Failed";
                        }

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

                    lock (node)
                    {
                        if (winner != null &&
                            string.IsNullOrWhiteSpace(winner.Error) &&
                            !string.IsNullOrWhiteSpace(winner.Fingerprint) &&
                            winner.IsStableRead)
                        {
                            node["fingerprint"] = winner.Fingerprint;
                            node["fingerprintStatus"] = "Ready";
                            node["fingerprintLastUtc"] = DateTime.UtcNow;
                            node["fileSizeBytes"] = winner.FileSizeBytes;
                            node["lastWriteTimeUtc"] = winner.LastWriteTimeUtc;
                            Interlocked.Increment(ref ready);
                        }
                        else
                        {
                            node.Remove("fingerprint");
                            node["fingerprintStatus"] = "Failed";
                            Interlocked.Increment(ref failed);
                        }
                    }

                    Interlocked.Increment(ref processed);
                    TryPublishFingerprintProgress(force: false);
                });
        }, cancellationToken);

        root["items"] = items;
        await SaveLibraryJsonAsync(root, cancellationToken);
        var rFinal = Volatile.Read(ref ready);
        var fFinal = Volatile.Read(ref failed);
        var skippedSuffix = skipped > 0 ? $", {skipped} skipped" : string.Empty;
        CompleteStage("fingerprintScan", $"Fingerprint scan complete ({total} hashed, {rFinal} ready, {fFinal} failed{skippedSuffix})");
    }

    private static bool NeedsFingerprintProcessing(JsonObject item)
    {
        var fp = item["fingerprint"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(fp))
        {
            return true;
        }

        // Legacy rows may carry a fingerprint without fingerprintStatus; do not rehash unless status is explicit.
        if (item["fingerprintStatus"] is null)
        {
            return false;
        }

        var st = ResolveFingerprintStatus(item["fingerprintStatus"]);
        if (st == 1)
        {
            return false;
        }

        return st is 0 or 2 or 3;
    }

    private async Task RunDurationStageWithOneShotAsync(CancellationToken cancellationToken)
    {
        var settings = _coreSettings.GetRefreshSettings();
        var forceFullRescan = settings.ForceRescanDuration;
        try
        {
            await RunDurationStageAsync(cancellationToken, forceFullRescan);
        }
        finally
        {
            if (forceFullRescan)
            {
                ConsumeRefreshRescanFlags(clearDuration: true, clearLoudness: false);
            }
        }
    }

    private async Task RunDurationStageAsync(CancellationToken cancellationToken, bool forceFullRescan)
    {
        var root = await LoadLibraryJsonAsync(cancellationToken);
        var items = root["items"] as JsonArray ?? [];
        var videos = items
            .OfType<JsonObject>()
                .Where(i => ResolveMediaType(i?["mediaType"]) == 0)
            .ToList();

        var fileToNode = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var node in videos)
        {
            var fullPath = node?["fullPath"]?.GetValue<string>() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(fullPath) && !fileToNode.ContainsKey(fullPath))
            {
                fileToNode[fullPath] = node!;
            }
        }

        var allFiles = fileToNode.Keys.ToArray();
        var filesToScan = forceFullRescan
            ? allFiles
            : allFiles.Where(path => !HasValidDuration(fileToNode[path])).ToArray();
        var alreadyCachedCount = forceFullRescan ? 0 : allFiles.Length - filesToScan.Length;
        var total = allFiles.Length;
        var processed = alreadyCachedCount;
        var updated = 0;
        var processedLock = new object();
        var updates = new Dictionary<string, TimeSpan>(StringComparer.OrdinalIgnoreCase);
        var updatesLock = new object();
        var forcedSuffix = forceFullRescan ? " (forced full rescan)" : string.Empty;

        if (filesToScan.Length == 0)
        {
            CompleteStage("durationScan", $"Duration scan complete ({total} files, all cached){forcedSuffix}");
            return;
        }

        var scanTasks = filesToScan.Select(async file =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            if (!File.Exists(file))
            {
                int skippedProcessed;
                lock (processedLock)
                {
                    processed++;
                    skippedProcessed = processed;
                }

                TryUpdateDurationProgress(skippedProcessed, total, forceFullRescan);
                return;
            }

            var duration = await GetVideoDurationAsync(file, cancellationToken);
            if (duration.HasValue && duration.Value.TotalSeconds > 0)
            {
                lock (updatesLock)
                {
                    updates[file] = duration.Value;
                }
            }

            int currentProcessed;
            lock (processedLock)
            {
                processed++;
                currentProcessed = processed;
            }

            TryUpdateDurationProgress(currentProcessed, total, forceFullRescan);
        });

        await Task.WhenAll(scanTasks);

        foreach (var kvp in updates)
        {
            if (fileToNode.TryGetValue(kvp.Key, out var node))
            {
                var prior = ParseDuration(node["duration"]?.GetValue<string>());
                if (!prior.HasValue || Math.Abs((prior.Value - kvp.Value).TotalSeconds) > 0.1)
                {
                    node["duration"] = kvp.Value.ToString("c", CultureInfo.InvariantCulture);
                    updated++;
                }
            }
        }

        root["items"] = items;
        await SaveLibraryJsonAsync(root, cancellationToken);
        CompleteStage("durationScan", $"Duration scan complete ({total} files, {updated} updated){forcedSuffix}");
    }

    private async Task RunLoudnessStageWithOneShotAsync(CancellationToken cancellationToken)
    {
        var settings = _coreSettings.GetRefreshSettings();
        var forceFullRescan = settings.ForceRescanLoudness;
        try
        {
            await RunLoudnessStageAsync(cancellationToken, forceFullRescan);
        }
        finally
        {
            if (forceFullRescan)
            {
                ConsumeRefreshRescanFlags(clearDuration: false, clearLoudness: true);
            }
        }
    }

    private async Task RunLoudnessStageAsync(CancellationToken cancellationToken, bool forceFullRescan)
    {
        var ffmpegPath = ResolveFfmpegPath();
        if (!await VerifyFfmpegAsync(ffmpegPath, cancellationToken))
        {
            CompleteStage("loudnessScan", "Loudness scan unavailable: ffmpeg not found");
            return;
        }

        var root = await LoadLibraryJsonAsync(cancellationToken);
        var items = root["items"] as JsonArray ?? [];
        var videos = items
            .OfType<JsonObject>()
                .Where(i => ResolveMediaType(i?["mediaType"]) == 0)
            .ToList();

        var fileToNode = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var node in videos)
        {
            var fullPath = node?["fullPath"]?.GetValue<string>() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(fullPath) && !fileToNode.ContainsKey(fullPath))
            {
                fileToNode[fullPath] = node!;
            }
        }

        var allFiles = fileToNode.Keys.ToArray();
        var filesToScan = forceFullRescan
            ? allFiles
            : allFiles.Where(path =>
            {
                var node = fileToNode[path];
                var hasAudio = node["hasAudio"]?.GetValue<bool?>();
                var integrated = node["integratedLoudness"]?.GetValue<double?>();

                // Scan when unknown audio state, when audio is known and loudness is missing,
                // or when stale loudness is present on a known no-audio item.
                if (!hasAudio.HasValue)
                {
                    return true;
                }

                if (hasAudio.Value)
                {
                    return !integrated.HasValue;
                }

                return integrated.HasValue;
            }).ToArray();

        var alreadyScannedCount = forceFullRescan ? 0 : allFiles.Length - filesToScan.Length;
        var total = allFiles.Length;
        var processed = alreadyScannedCount;
        var noAudioCount = 0;
        var errorCount = 0;
        var processedLock = new object();
        var updates = new Dictionary<string, FileLoudnessInfo>(StringComparer.OrdinalIgnoreCase);
        var updatesLock = new object();
        var forcedSuffix = forceFullRescan ? " (forced full rescan)" : string.Empty;

        if (filesToScan.Length == 0)
        {
            CompleteStage("loudnessScan", $"Loudness scan complete ({total} files, all scanned){forcedSuffix}");
            return;
        }

        // Publish baseline progress immediately so the UI reflects cached work before ffmpeg tasks complete.
        TryUpdateLoudnessProgress(processed, total, noAudioCount, errorCount, forceFullRescan);

        var scanTasks = filesToScan.Select(async file =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            if (!File.Exists(file))
            {
                int skippedProcessed;
                lock (processedLock)
                {
                    processed++;
                    skippedProcessed = processed;
                }
                TryUpdateLoudnessProgress(skippedProcessed, total, noAudioCount, errorCount, forceFullRescan);
                return;
            }

            var durationForLoudness = ParseDuration(fileToNode[file]["duration"]?.GetValue<string>());
            var loudness = await AnalyzeLoudnessAsync(file, ffmpegPath, durationForLoudness, cancellationToken);
            if (loudness != null)
            {
                lock (updatesLock)
                {
                    updates[file] = loudness;
                }

                if (loudness.IsError)
                {
                    lock (processedLock)
                    {
                        errorCount++;
                    }
                }
                else if (!loudness.HasAudio)
                {
                    lock (processedLock)
                    {
                        noAudioCount++;
                    }
                }
            }

            int currentProcessed;
            int currentNoAudio;
            int currentErrors;
            lock (processedLock)
            {
                processed++;
                currentProcessed = processed;
                currentNoAudio = noAudioCount;
                currentErrors = errorCount;
            }

            TryUpdateLoudnessProgress(currentProcessed, total, currentNoAudio, currentErrors, forceFullRescan);
        });

        await Task.WhenAll(scanTasks);

        int updated = 0;
        foreach (var kvp in updates)
        {
            if (!fileToNode.TryGetValue(kvp.Key, out var node))
            {
                continue;
            }

            var info = kvp.Value;
            var nodeUpdated = false;

            var currentHasAudio = node["hasAudio"]?.GetValue<bool?>();
            if (currentHasAudio != info.HasAudio)
            {
                node["hasAudio"] = info.HasAudio;
                nodeUpdated = true;
            }

            var currentIntegrated = node["integratedLoudness"]?.GetValue<double?>();
            if (info.IsError)
            {
                if (currentIntegrated.HasValue)
                {
                    node["integratedLoudness"] = null;
                    nodeUpdated = true;
                }
            }
            else if (info.HasAudio && Math.Abs(info.MeanVolumeDb) > 0.0001)
            {
                if (!currentIntegrated.HasValue || Math.Abs(currentIntegrated.Value - info.MeanVolumeDb) > 0.1)
                {
                    node["integratedLoudness"] = info.MeanVolumeDb;
                    nodeUpdated = true;
                }
            }
            else if (!info.HasAudio && currentIntegrated.HasValue)
            {
                node["integratedLoudness"] = null;
                nodeUpdated = true;
            }

            var currentPeak = node["peakDb"]?.GetValue<double?>();
            if (info.IsError)
            {
                if (currentPeak.HasValue)
                {
                    node["peakDb"] = null;
                    nodeUpdated = true;
                }
            }
            else if (info.HasAudio && Math.Abs(info.PeakDb) > 0.0001)
            {
                if (!currentPeak.HasValue || Math.Abs(currentPeak.Value - info.PeakDb) > 0.1)
                {
                    node["peakDb"] = info.PeakDb;
                    nodeUpdated = true;
                }
            }
            else if (!info.HasAudio && currentPeak.HasValue)
            {
                node["peakDb"] = null;
                nodeUpdated = true;
            }

            var currentLoudnessError = node["loudnessError"]?.GetValue<string>();
            if (info.IsError)
            {
                var message = string.IsNullOrWhiteSpace(info.ErrorMessage)
                    ? "Loudness analysis failed."
                    : info.ErrorMessage;
                if (!string.Equals(currentLoudnessError, message, StringComparison.Ordinal))
                {
                    node["loudnessError"] = message;
                    nodeUpdated = true;
                }
            }
            else if (!string.IsNullOrWhiteSpace(currentLoudnessError))
            {
                node["loudnessError"] = null;
                nodeUpdated = true;
            }

            if (nodeUpdated)
            {
                updated++;
            }
        }

        root["items"] = items;
        await SaveLibraryJsonAsync(root, cancellationToken);
        var noAudioText = noAudioCount > 0 ? $", {noAudioCount} without audio" : string.Empty;
        var errorText = errorCount > 0 ? $", {errorCount} errors" : string.Empty;
        CompleteStage("loudnessScan", $"Loudness scan complete ({total} files, {updated} updated{noAudioText}{errorText}){forcedSuffix}");
    }

    private async Task RunThumbnailStageAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_thumbnailDir);
        var root = await LoadLibraryJsonAsync(cancellationToken);
        var items = root["items"] as JsonArray ?? [];
        var index = LoadThumbnailIndex();

        var validItemIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int generated = 0;
        int regenerated = 0;
        int reused = 0;
        int failed = 0;
        int skippedMissing = 0;
        int metadataUpdated = 0;
        int staleRemoved = 0;
        int total = items.Count;
        var ffmpegPath = ResolveFfmpegPath();
        bool ffmpegChecked = false;
        bool ffmpegAvailable = false;
        var nextStatusUtc = DateTimeOffset.UtcNow;

        for (int i = 0; i < items.Count; i++)
        {
            if (items[i] is not JsonObject item)
            {
                continue;
            }

            var itemId = item["id"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(itemId))
            {
                continue;
            }

            validItemIds.Add(itemId);
            var fullPath = item["fullPath"]?.GetValue<string>() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath))
            {
                skippedMissing++;
                TryUpdateThumbnailProgress(
                    i + 1,
                    total,
                    generated,
                    regenerated,
                    reused,
                    failed,
                    skippedMissing,
                    ref nextStatusUtc,
                    force: i == items.Count - 1);
                continue;
            }

            var sourceRevision = GetThumbnailSourceRevision(item, fullPath);
            var existingEntry = index.TryGetPropertyValue(itemId, out var existingNode)
                ? ReadThumbnailIndexEntry(existingNode)
                : new ThumbnailIndexEntry();
            var thumbPath = GetThumbnailPath(itemId);
            var hadThumbnailFile = File.Exists(thumbPath);
            var needsRegeneration = !hadThumbnailFile || !string.Equals(existingEntry.Revision, sourceRevision, StringComparison.Ordinal);
            if (!needsRegeneration)
            {
                reused++;
                if (hadThumbnailFile && !existingEntry.HasDimensions &&
                    TryReadImageDimensions(thumbPath, out var width, out var height))
                {
                    WriteThumbnailIndexEntry(index, itemId, sourceRevision, width, height);
                    metadataUpdated++;
                }
            }
            else
            {
                    var mediaType = ResolveMediaType(item["mediaType"]);
                ThumbnailGenerationResult? generatedThumb;
                if (mediaType == 0)
                {
                    if (!ffmpegChecked)
                    {
                        ffmpegAvailable = await VerifyFfmpegAsync(ffmpegPath, cancellationToken);
                        ffmpegChecked = true;
                    }

                    generatedThumb = ffmpegAvailable
                        ? await TryGenerateVideoThumbnailAsync(fullPath, thumbPath, ffmpegPath, cancellationToken)
                        : null;
                }
                else
                {
                    generatedThumb = await TryGeneratePhotoThumbnailAsync(fullPath, thumbPath, cancellationToken);
                }

                if (generatedThumb is not null)
                {
                    WriteThumbnailIndexEntry(index, itemId, sourceRevision, generatedThumb.Width, generatedThumb.Height);
                    if (!hadThumbnailFile)
                    {
                        generated++;
                    }
                    else
                    {
                        regenerated++;
                    }
                }
                else
                {
                    failed++;
                }
            }

            TryUpdateThumbnailProgress(
                i + 1,
                total,
                generated,
                regenerated,
                reused,
                failed,
                skippedMissing,
                ref nextStatusUtc,
                force: i == items.Count - 1);
        }

        foreach (var prop in index.ToList())
        {
            if (!validItemIds.Contains(prop.Key))
            {
                index.Remove(prop.Key);
                var staleThumbPath = GetThumbnailPath(prop.Key);
                if (File.Exists(staleThumbPath))
                {
                    try
                    {
                        File.Delete(staleThumbPath);
                        staleRemoved++;
                    }
                    catch
                    {
                        // best effort stale cleanup
                    }
                }
            }
        }

        var evicted = EnforceThumbnailCacheLimits(index);
        await File.WriteAllTextAsync(_thumbnailIndexPath, index.ToJsonString(JsonOptions), cancellationToken);
        CompleteStage("thumbnailGeneration",
            $"Thumbnail generation complete ({generated} generated, {regenerated} regenerated, {reused} reused, {failed} failed, {metadataUpdated} metadata updated, {skippedMissing} missing source, {staleRemoved} stale removed, {evicted} evicted)");
    }

    private async Task<JsonObject> LoadLibraryJsonAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_libraryPath))
        {
            return new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray()
            };
        }

        await using var stream = File.OpenRead(_libraryPath);
        var node = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken) as JsonObject;
        return node ?? new JsonObject { ["sources"] = new JsonArray(), ["items"] = new JsonArray() };
    }

    private Task SaveLibraryJsonAsync(JsonObject root, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_libraryPath)!);
        return File.WriteAllTextAsync(_libraryPath, root.ToJsonString(JsonOptions), cancellationToken);
    }

    private IEnumerable<string> EnumerateMediaFiles(string rootPath)
    {
        var all = Directory.EnumerateFiles(rootPath, "*", SearchOption.AllDirectories);
        foreach (var path in all)
        {
            var ext = Path.GetExtension(path);
            if (MediaPlayableExtensions.IsPlayableExtension(ext))
            {
                yield return path;
            }
        }
    }

    private static string GetRelativePath(string rootPath, string fullPath) =>
        ReelRoulette.Core.Storage.LibraryRelativePath.GetRelativePath(rootPath, fullPath);

    private static void EnsureIdentityAndFingerprintDefaults(JsonObject item)
    {
        if (string.IsNullOrWhiteSpace(item["id"]?.GetValue<string>()))
        {
            item["id"] = Guid.NewGuid().ToString();
        }

        if (string.IsNullOrWhiteSpace(item["fingerprintAlgorithm"]?.GetValue<string>()))
        {
            item["fingerprintAlgorithm"] = "SHA-256";
        }

        var version = item["fingerprintVersion"]?.GetValue<int?>() ?? 0;
        if (version <= 0)
        {
            item["fingerprintVersion"] = 1;
        }

        var fp = item["fingerprint"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(fp))
        {
            item["fingerprintStatus"] = 0;
        }
    }

    private static void UpdateFileMetadataCache(JsonObject item)
    {
        var fullPath = item["fullPath"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath))
        {
            return;
        }

        try
        {
            var info = new FileInfo(fullPath);
            var oldSize = item["fileSizeBytes"]?.GetValue<long?>();
            var oldWrite = item["lastWriteTimeUtc"]?.GetValue<DateTime?>();
            item["fileSizeBytes"] = info.Length;
            item["lastWriteTimeUtc"] = info.LastWriteTimeUtc;

            var hasFingerprint = !string.IsNullOrWhiteSpace(item["fingerprint"]?.GetValue<string>());
            if (hasFingerprint &&
                ((oldSize.HasValue && oldSize.Value != info.Length) ||
                 (oldWrite.HasValue && oldWrite.Value != info.LastWriteTimeUtc)))
            {
                item["fingerprintStatus"] = 3;
            }
        }
        catch
        {
            // Preserve prior metadata on read failures.
        }
    }

    private JsonObject LoadThumbnailIndex()
    {
        try
        {
            if (!File.Exists(_thumbnailIndexPath))
            {
                return new JsonObject();
            }

            return JsonNode.Parse(File.ReadAllText(_thumbnailIndexPath)) as JsonObject ?? new JsonObject();
        }
        catch
        {
            return new JsonObject();
        }
    }

    private static string BuildThumbnailProgressMessage(int processed, int total, int generated, int regenerated, int reused, int failed, int skippedMissing)
    {
        return $"Thumbnails {processed}/{total} (new {generated}, regen {regenerated}, reused {reused}, failed {failed}, missing {skippedMissing})";
    }

    private static ThumbnailIndexEntry ReadThumbnailIndexEntry(JsonNode? node)
    {
        if (node is null)
        {
            return new ThumbnailIndexEntry();
        }

        if (node is JsonValue)
        {
            try
            {
                return new ThumbnailIndexEntry
                {
                    Revision = node.GetValue<string>()
                };
            }
            catch
            {
                return new ThumbnailIndexEntry();
            }
        }

        if (node is JsonObject obj)
        {
            return new ThumbnailIndexEntry
            {
                Revision = obj["revision"]?.GetValue<string>() ?? string.Empty,
                Width = obj["width"]?.GetValue<int?>() ?? 0,
                Height = obj["height"]?.GetValue<int?>() ?? 0
            };
        }

        return new ThumbnailIndexEntry();
    }

    private static void WriteThumbnailIndexEntry(JsonObject index, string itemId, string revision, int width, int height)
    {
        index[itemId] = new JsonObject
        {
            ["revision"] = revision,
            ["width"] = width,
            ["height"] = height,
            ["generatedUtc"] = DateTimeOffset.UtcNow
        };
    }

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

    private void TryUpdateThumbnailProgress(
        int processed,
        int total,
        int generated,
        int regenerated,
        int reused,
        int failed,
        int skippedMissing,
        ref DateTimeOffset nextStatusUtc,
        bool force)
    {
        var now = DateTimeOffset.UtcNow;
        if (!force && now < nextStatusUtc)
        {
            return;
        }

        var pct = Math.Clamp((int)Math.Round((processed / (double)Math.Max(1, total)) * 100.0), 0, 100);
        UpdateStage("thumbnailGeneration", pct, BuildThumbnailProgressMessage(processed, total, generated, regenerated, reused, failed, skippedMissing));
        nextStatusUtc = now.AddMilliseconds(500);
    }

    private static string GetThumbnailSourceRevision(JsonObject item, string fullPath)
    {
        var info = new FileInfo(fullPath);
        var fingerprint = item["fingerprint"]?.GetValue<string>() ?? string.Empty;
        var writeUtc = item["lastWriteTimeUtc"]?.GetValue<DateTime?>() ?? info.LastWriteTimeUtc;
        var size = item["fileSizeBytes"]?.GetValue<long?>() ?? info.Length;
        return $"{fingerprint}|{size}|{writeUtc:O}";
    }

    private async Task<ThumbnailGenerationResult?> TryGenerateVideoThumbnailAsync(string sourcePath, string thumbPath, string ffmpegPath, CancellationToken cancellationToken)
    {
        var duration = await GetVideoDurationAsync(sourcePath, cancellationToken);
        var durationSeconds = Math.Max(duration?.TotalSeconds ?? 0, 0);
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
            process.Start();
            var stdoutTask = process.StandardOutput.ReadToEndAsync(linkedCts.Token);
            _ = process.StandardError.ReadToEndAsync(linkedCts.Token);
            await process.WaitForExitAsync(linkedCts.Token);
            await stdoutTask;

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

    private int EnforceThumbnailCacheLimits(JsonObject index)
    {
        var entries = new List<(string ItemId, string Path, long SizeBytes, DateTime LastWriteUtc)>();
        foreach (var pair in index.ToList())
        {
            var thumbPath = GetThumbnailPath(pair.Key);
            if (!File.Exists(thumbPath))
            {
                index.Remove(pair.Key);
                continue;
            }

            var info = new FileInfo(thumbPath);
            entries.Add((pair.Key, thumbPath, info.Length, info.LastWriteTimeUtc));
        }

        long totalBytes = entries.Sum(e => e.SizeBytes);
        if (entries.Count <= ThumbnailCacheMaxFiles && totalBytes <= ThumbnailCacheMaxBytes)
        {
            return 0;
        }

        var evicted = 0;
        foreach (var entry in entries.OrderBy(e => e.LastWriteUtc))
        {
            if (entries.Count - evicted <= ThumbnailCacheMaxFiles && totalBytes <= ThumbnailCacheMaxBytes)
            {
                break;
            }

            try
            {
                File.Delete(entry.Path);
            }
            catch
            {
                continue;
            }

            totalBytes -= entry.SizeBytes;
            index.Remove(entry.ItemId);
            evicted++;
        }

        return evicted;
    }

    private RefreshStageProgress NewStage(string stage)
    {
        return new RefreshStageProgress
        {
            Stage = stage,
            Percent = 0,
            Message = "pending",
            IsComplete = false
        };
    }

    private void UpdateStage(string stage, int percent, string message)
    {
        lock (_runLock)
        {
            var current = _status.Stages.FirstOrDefault(s => string.Equals(s.Stage, stage, StringComparison.OrdinalIgnoreCase));
            if (current == null)
            {
                current = NewStage(stage);
                _status.Stages.Add(current);
            }

            _status.CurrentStage = stage;
            current.Percent = Math.Clamp(percent, 0, 100);
            current.Message = message;
            PublishStatusLocked();
        }
    }

    private void CompleteStage(string stage, string message)
    {
        lock (_runLock)
        {
            var current = _status.Stages.FirstOrDefault(s => string.Equals(s.Stage, stage, StringComparison.OrdinalIgnoreCase));
            if (current == null)
            {
                current = NewStage(stage);
                _status.Stages.Add(current);
            }

            current.IsComplete = true;
            current.Percent = 100;
            current.Message = message;
            _status.CurrentStage = stage;
            PublishStatusLocked();
        }
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
            LastError = source.LastError,
            Stages = source.Stages.Select(s => new RefreshStageProgress
            {
                Stage = s.Stage,
                Percent = s.Percent,
                Message = s.Message,
                IsComplete = s.IsComplete
            }).ToList()
        };
    }

    private static bool HasValidDuration(JsonObject node)
    {
        var durationText = node["duration"]?.GetValue<string>();
        var duration = ParseDuration(durationText);
        return duration.HasValue && duration.Value.TotalSeconds > 0;
    }

    private static TimeSpan? ParseDuration(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return TimeSpan.TryParse(value, CultureInfo.InvariantCulture, out var duration)
            ? duration
            : null;
    }

    private void TryUpdateDurationProgress(int processed, int total, bool forceFullRescan)
    {
        var pct = Math.Clamp((int)Math.Round((processed / (double)Math.Max(1, total)) * 100.0), 0, 100);
        var forcedSuffix = forceFullRescan ? " (forced full rescan)" : string.Empty;
        UpdateStage("durationScan", pct, $"Duration scan {processed}/{total}{forcedSuffix}");
    }

    private void TryUpdateLoudnessProgress(int processed, int total, int noAudioCount, int errorCount, bool forceFullRescan)
    {
        var pct = Math.Clamp((int)Math.Round((processed / (double)Math.Max(1, total)) * 100.0), 0, 100);
        var noAudioText = noAudioCount > 0 ? $", {noAudioCount} without audio" : string.Empty;
        var errorText = errorCount > 0 ? $", {errorCount} errors" : string.Empty;
        var forcedSuffix = forceFullRescan ? " (forced full rescan)" : string.Empty;
        UpdateStage("loudnessScan", pct, $"Loudness scan {processed}/{total}{noAudioText}{errorText}{forcedSuffix}");
    }

    private void ConsumeRefreshRescanFlags(bool clearDuration, bool clearLoudness)
    {
        try
        {
            var current = _coreSettings.GetRefreshSettings();
            var updated = new RefreshSettingsSnapshot
            {
                AutoRefreshEnabled = current.AutoRefreshEnabled,
                AutoRefreshIntervalMinutes = current.AutoRefreshIntervalMinutes,
                ForceRescanDuration = clearDuration ? false : current.ForceRescanDuration,
                ForceRescanLoudness = clearLoudness ? false : current.ForceRescanLoudness
            };
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

    private static async Task<bool> VerifyFfmpegAsync(string ffmpegPath, CancellationToken cancellationToken)
    {
        try
        {
            var testStartInfo = new ProcessStartInfo
            {
                FileName = ffmpegPath,
                Arguments = "-version",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            using var process = new Process { StartInfo = testStartInfo };
            process.Start();
            await process.WaitForExitAsync(cancellationToken);
            return process.ExitCode == 0;
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
        var hasAudioStream = await TryDetectAudioStreamAsync(filePath, cancellationToken);
        if (hasAudioStream == false)
        {
            // Advisory only. Continue with ffmpeg ebur128 analysis to avoid false negatives
            // on containers/codecs where ffprobe stream probing can be incomplete.
        }

        if (_ffmpegSemaphore == null)
        {
            lock (FfmpegSemaphoreLock)
            {
                _ffmpegSemaphore ??= new SemaphoreSlim(4, 4);
            }
        }

        bool semaphoreAcquired = false;
        try
        {
            await _ffmpegSemaphore!.WaitAsync(cancellationToken);
            semaphoreAcquired = true;

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
            startInfo.ArgumentList.Add("ebur128=framelog=verbose");
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
        finally
        {
            if (semaphoreAcquired)
            {
                _ffmpegSemaphore!.Release();
            }
        }
    }

    private static async Task<bool?> TryDetectAudioStreamAsync(string filePath, CancellationToken cancellationToken)
    {
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
        startInfo.ArgumentList.Add("-show_streams");
        startInfo.ArgumentList.Add("-of");
        startInfo.ArgumentList.Add("json");
        startInfo.ArgumentList.Add(filePath);

        try
        {
            using var process = new Process { StartInfo = startInfo };
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
            process.Start();
            var stdout = await process.StandardOutput.ReadToEndAsync(linkedCts.Token);
            _ = await process.StandardError.ReadToEndAsync(linkedCts.Token);
            await process.WaitForExitAsync(linkedCts.Token);

            if (process.ExitCode != 0)
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(stdout))
            {
                return null;
            }

            using var doc = JsonDocument.Parse(stdout);
            if (!doc.RootElement.TryGetProperty("streams", out var streams) || streams.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            if (streams.GetArrayLength() == 0)
            {
                return false;
            }

            foreach (var stream in streams.EnumerateArray())
            {
                if (stream.TryGetProperty("codec_type", out var codecType) &&
                    codecType.ValueKind == JsonValueKind.String &&
                    string.Equals(codecType.GetString(), "audio", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
        catch
        {
            // Unknown detection state; fall back to ffmpeg analysis path.
            return null;
        }
    }

    private static FileLoudnessInfo? ParseLoudnessFromFfmpegOutput(string output, int exitCode = 0)
    {
        double? integratedLoudness = null;
        double? peakDb = null;
        bool hasAudio = false;
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
            return new FileLoudnessInfo
            {
                MeanVolumeDb = 0.0,
                PeakDb = 0.0,
                HasAudio = false
            };
        }

        foreach (var line in lines)
        {
            var integratedMatch = IntegratedLufsRegex.Match(line);
            if (integratedMatch.Success &&
                double.TryParse(integratedMatch.Groups["value"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var loudness))
            {
                integratedLoudness = loudness;
                hasAudio = true;
            }

            var peakMatch = PeakDbfsRegex.Match(line);
            if (peakMatch.Success &&
                double.TryParse(peakMatch.Groups["value"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var peak))
            {
                peakDb = peak;
            }
        }

        if (integratedLoudness.HasValue)
        {
            return new FileLoudnessInfo
            {
                HasAudio = true,
                MeanVolumeDb = integratedLoudness.Value,
                PeakDb = peakDb ?? -5.0
            };
        }

        double? meanVolumeDb = null;
        foreach (var line in lines)
        {
            var meanIndex = line.IndexOf("mean_volume:", StringComparison.OrdinalIgnoreCase);
            if (meanIndex >= 0)
            {
                var dbIndex = line.IndexOf("dB", meanIndex, StringComparison.OrdinalIgnoreCase);
                if (dbIndex > meanIndex)
                {
                    var valueStr = line.Substring(meanIndex + "mean_volume:".Length, dbIndex - meanIndex - "mean_volume:".Length).Trim();
                    if (double.TryParse(valueStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var meanValue))
                    {
                        meanVolumeDb = meanValue;
                        hasAudio = true;
                    }
                }
            }

            var maxIndex = line.IndexOf("max_volume:", StringComparison.OrdinalIgnoreCase);
            if (maxIndex >= 0)
            {
                var dbIndex = line.IndexOf("dB", maxIndex, StringComparison.OrdinalIgnoreCase);
                if (dbIndex > maxIndex)
                {
                    var valueStr = line.Substring(maxIndex + "max_volume:".Length, dbIndex - maxIndex - "max_volume:".Length).Trim();
                    if (double.TryParse(valueStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var maxValue))
                    {
                        peakDb = maxValue;
                    }
                }
            }
        }

        if (meanVolumeDb.HasValue)
        {
            if (Math.Abs(meanVolumeDb.Value - (-91.0)) < 0.1 && (!peakDb.HasValue || Math.Abs(peakDb.Value - (-91.0)) < 0.1))
            {
                return new FileLoudnessInfo
                {
                    MeanVolumeDb = 0.0,
                    PeakDb = 0.0,
                    HasAudio = false
                };
            }

            return new FileLoudnessInfo
            {
                HasAudio = hasAudio,
                MeanVolumeDb = meanVolumeDb.Value,
                PeakDb = peakDb ?? -5.0
            };
        }

        if (fileOpenedSuccessfully && hasVideoStream && !hasAudioStream && !meanVolumeDb.HasValue && !peakDb.HasValue)
        {
            return new FileLoudnessInfo
            {
                MeanVolumeDb = 0.0,
                PeakDb = 0.0,
                HasAudio = false
            };
        }

        return null;
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

    private sealed class FileLoudnessInfo
    {
        public bool HasAudio { get; init; }
        public double MeanVolumeDb { get; init; }
        public double PeakDb { get; init; }
        public bool IsError { get; init; }
        public string? ErrorMessage { get; init; }
    }

    private sealed class ThumbnailIndexEntry
    {
        public string Revision { get; init; } = string.Empty;
        public int Width { get; init; }
        public int Height { get; init; }
        public bool HasDimensions => Width > 0 && Height > 0;
    }

    private sealed class ThumbnailGenerationResult
    {
        public int Width { get; init; }
        public int Height { get; init; }
    }
}
