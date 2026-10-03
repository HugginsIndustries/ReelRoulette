using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
using System.Reflection;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class RefreshPipelineServiceTests
{
    [Fact]
    public async Task TryStartManual_ShouldRejectOverlapWithConflictSemantics()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);

        var first = service.TryStartManual();
        var second = service.TryStartManual();

        Assert.True(first.Accepted);
        Assert.False(second.Accepted);

        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
    }

    [Fact]
    public async Task ShutdownCancel_ShouldStopManualRunWithoutRecordingAFailure()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.CancelRunsForShutdown();

        var started = service.TryStartManual();
        Assert.True(started.Accepted);

        var final = await WaitForStopAsync(service, TimeSpan.FromSeconds(10));
        Assert.False(final.IsRunning);
        Assert.Null(final.LastError);
        Assert.Null(final.CompletedUtc);
        Assert.Contains(final.Stages, stage => !stage.IsComplete);
    }

    [Fact]
    public async Task ShutdownCancel_DuringFfmpegCheck_DoesNotRecordLoudnessAsUnavailable()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        var hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldNextFfmpegCheck(hold.Task);

        var started = service.TryStartManual();
        Assert.True(started.Accepted);
        await service.FfmpegCheckEntered.WaitAsync(TimeSpan.FromSeconds(10));
        service.CancelRunsForShutdown();

        var final = await WaitForStopAsync(service, TimeSpan.FromSeconds(10));
        Assert.False(final.IsRunning);
        Assert.Null(final.LastError);
        Assert.Null(final.CompletedUtc);
        var loudness = Assert.Single(final.Stages, stage => stage.Stage == "loudnessScan");
        Assert.False(loudness.IsComplete);
        Assert.DoesNotContain("ffmpeg not found", loudness.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ShutdownCancel_LeavesForcedRescansPending()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.UpdateSettings(new ReelRoulette.Server.Contracts.RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15,
            ForceRescanDuration = true,
            ForceRescanLoudness = true
        });

        await RunCancelledOneShotAsync(service, "RunDurationStageWithOneShotAsync");
        await RunCancelledOneShotAsync(service, "RunLoudnessStageWithOneShotAsync");
        AssertForcedRescansStillPending(service);

        service.CancelRunsForShutdown();
        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForStopAsync(service, TimeSpan.FromSeconds(10));
        Assert.False(final.IsRunning);
        Assert.Null(final.LastError);
        Assert.Null(final.CompletedUtc);
        AssertForcedRescansStillPending(service);
    }

    [Fact]
    public async Task PipelineRun_ShouldCompleteStagesInDefinedOrder_AndPublishStatusEvents()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items: [new SeedItem("item-1", "C:\\media\\item-1.mp4")]);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);

        var response = service.TryStartManual();
        Assert.True(response.Accepted);

        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        Assert.False(final.IsRunning);
        Assert.Equal(
            ["sourceRefresh", "fingerprintScan", "durationScan", "loudnessScan", "thumbnailGeneration"],
            final.Stages.Select(s => s.Stage).ToArray());
        Assert.All(final.Stages, stage => Assert.True(stage.IsComplete));

        var replay = state.GetReplayAfter(0);
        Assert.Contains(replay.Events, e => string.Equals(e.EventType, "refreshStatusChanged", StringComparison.Ordinal));
    }

    [Fact]
    public async Task SourceRefresh_ShouldPersistRemovalOfMissingItem_AndKeepProjectionParity()
    {
        using var scope = new DataFolderScope();
        var sourceDir = Path.Combine(scope.RootPath, "source-a");
        Directory.CreateDirectory(sourceDir);

        var existingPath = Path.Combine(sourceDir, "existing.mp4");
        var missingPath = Path.Combine(sourceDir, "missing.mp4");
        await File.WriteAllTextAsync(existingPath, "existing");

        CatalogSeed.Write(
            scope.RootPath,
            sources: [new SeedSource("src-a", sourceDir)],
            items:
            [
                new SeedItem("item-existing", existingPath)
                {
                    SourceId = "src-a",
                    RelativePath = "existing.mp4",
                    FileName = "existing.mp4"
                },
                new SeedItem("item-missing", missingPath)
                {
                    SourceId = "src-a",
                    RelativePath = "missing.mp4",
                    FileName = "missing.mp4"
                }
            ]);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        var itemList = LoadCatalog(scope.RootPath).Items;
        var kept = Assert.Single(itemList);
        Assert.Equal("item-existing", kept.Id);
        Assert.Equal(existingPath, kept.FullPath);
        Assert.DoesNotContain(itemList, item => string.Equals(item.Id, "item-missing", StringComparison.OrdinalIgnoreCase));

        var sourceStage = final.Stages.Single(s => s.Stage == "sourceRefresh");
        Assert.Contains("1 removed", sourceStage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task LoudnessStage_ShouldPreserveExistingValues_AndNotInventMissingValues()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("has-loudness", "C:\\media\\has-loudness.mp4")
                {
                    IntegratedLoudness = -14.2,
                    HasAudio = true,
                    PeakDb = -0.5
                },
                new SeedItem("needs-loudness", "C:\\media\\needs-loudness.mp4")
            ]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var items = LoadCatalog(scope.RootPath).Items;
        var hasLoudness = items.Single(i => i.Id == "has-loudness");
        var needsLoudness = items.Single(i => i.Id == "needs-loudness");

        Assert.Equal(-14.2, hasLoudness.IntegratedLoudness);
        Assert.Equal(-0.5, hasLoudness.PeakDb);
        Assert.Null(needsLoudness.IntegratedLoudness);
        Assert.Null(needsLoudness.PeakDb);
    }

    [Fact]
    public async Task ThumbnailStage_ShouldRegenerateWhenSourceRevisionChanges()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-1", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "fp-a"
                }
            ]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var thumbPath = service.GetThumbnailPath("thumb-1");
        Assert.True(File.Exists(thumbPath));
        Assert.True(new FileInfo(thumbPath).Length > 0);
        var firstWrite = File.GetLastWriteTimeUtc(thumbPath);

        await Task.Delay(20);
        var catalog = CatalogOpen.Open(scope.RootPath);
        Assert.True(catalog.Session!.SetFingerprint("thumb-1", "fp-b", "SHA-256", 1, 1, DateTime.UtcNow));

        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var secondWrite = File.GetLastWriteTimeUtc(thumbPath);
        Assert.True(secondWrite > firstWrite);
        var stage = completed.Stages.Single(s => s.Stage == "thumbnailGeneration");
        Assert.Contains("regenerated", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_ShouldReuseWhenRevisionUnchanged()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-reuse.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-reuse-1", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "fp-reuse-a"
                }
            ]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        var thumbPath = service.GetThumbnailPath("thumb-reuse-1");
        Assert.True(File.Exists(thumbPath));
        var firstWrite = File.GetLastWriteTimeUtc(thumbPath);

        await Task.Delay(20);
        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        var secondWrite = File.GetLastWriteTimeUtc(thumbPath);
        Assert.Equal(firstWrite, secondWrite);

        var stage = completed.Stages.Single(s => s.Stage == "thumbnailGeneration");
        Assert.Contains("reused", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EnrichListedItems_UsesRowDimensionsAndJpegExistence()
    {
        using var scope = new DataFolderScope();
        var thumbsDir = Path.Combine(scope.RootPath, "thumbnails");
        Directory.CreateDirectory(thumbsDir);
        File.WriteAllBytes(Path.Combine(thumbsDir, "item-1.jpg"), TinyPngBytes);
        File.WriteAllText(
            Path.Combine(thumbsDir, "index.json"),
            new JsonObject
            {
                ["item-1"] = new JsonObject
                {
                    ["width"] = 1,
                    ["height"] = 1,
                    ["revision"] = "from-index"
                }
            }.ToJsonString());

        var service = CreateService(new ServerStateService(), scope.RootPath);
        var items = new JsonArray
        {
            new JsonObject
            {
                ["id"] = "item-1",
                ["fileName"] = "a.mp4",
                ["thumbnailWidth"] = 480,
                ["thumbnailHeight"] = 270
            },
            new JsonObject { ["id"] = "item-2", ["fileName"] = "b.mp4", ["thumbnailWidth"] = 0, ["thumbnailHeight"] = 0 }
        };

        service.EnrichListedItems(items);
        var item1 = items[0]!.AsObject();
        Assert.True(item1["hasThumbnail"]!.GetValue<bool>());
        Assert.Equal(480, item1["thumbnailWidth"]!.GetValue<int>());
        Assert.Equal(270, item1["thumbnailHeight"]!.GetValue<int>());

        var item2 = items[1]!.AsObject();
        Assert.False(item2["hasThumbnail"]!.GetValue<bool>());
        Assert.Null(item2["thumbnailWidth"]);
        Assert.Null(item2["thumbnailHeight"]);
    }

    [Fact]
    public async Task ThumbnailStage_ShouldWriteIndexMetadataObject()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-metadata.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-meta-1", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "fp-meta-a"
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var stored = Assert.Single(host.Session.ReadRefreshItems());
        Assert.StartsWith("fp-meta-a|", stored.ThumbnailRevision, StringComparison.Ordinal);
        Assert.True(stored.ThumbnailWidth is > 0);
        Assert.True(stored.ThumbnailHeight is > 0);
        Assert.False(File.Exists(Path.Combine(scope.RootPath, "thumbnails", "index.json")));
    }

    [Fact]
    public async Task ThumbnailStage_ShouldBackfillLegacyStringIndexEntry()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-legacy.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-legacy-1", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "fp-legacy-a"
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var stored = Assert.Single(host.Session.ReadRefreshItems());
        Assert.True(host.Session.SetThumbnail(stored.Id, stored.ThumbnailRevision, null, null));

        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        var stage = completed.Stages.Single(s => s.Stage == "thumbnailGeneration");
        Assert.Contains("metadata updated", stage.Message, StringComparison.OrdinalIgnoreCase);

        var filled = Assert.Single(host.Session.ReadRefreshItems());
        Assert.Equal(stored.ThumbnailRevision, filled.ThumbnailRevision);
        Assert.True(filled.ThumbnailWidth is > 0);
        Assert.True(filled.ThumbnailHeight is > 0);
    }

    [Fact]
    public void UpdateSettings_ShouldClampToAllowedInterval()
    {
        using var scope = new DataFolderScope();
        var service = CreateService(new ServerStateService(), scope.RootPath);

        var updated = service.UpdateSettings(new ReelRoulette.Server.Contracts.RefreshSettingsSnapshot
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 2
        });

        Assert.Equal(5, updated.AutoRefreshIntervalMinutes);
    }

    [Fact]
    public async Task DurationForceRescan_ShouldBeOneShot_AndShowForcedHint()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("duration-1", Path.Combine(scope.RootPath, "missing-duration.mp4"))
                {
                    Duration = TimeSpan.FromSeconds(3)
                }
            ]);

        var state = new ServerStateService();
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15,
            ForceRescanDuration = true,
            ForceRescanLoudness = false
        };
        var coreSettings = new CoreSettingsService(options, scope.RootPath);
        var service = new RefreshPipelineService(state, logger, coreSettings, CatalogOpen.Host(scope.RootPath), scope.RootPath);

        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var durationStage = completed.Stages.Single(s => s.Stage == "durationScan");
        Assert.Contains("(forced full rescan)", durationStage.Message, StringComparison.OrdinalIgnoreCase);
        var settingsAfterRun = coreSettings.GetRefreshSettings();
        Assert.False(settingsAfterRun.ForceRescanDuration);
        Assert.False(settingsAfterRun.ForceRescanLoudness);
    }

    [Fact]
    public async Task LoudnessFailure_ShouldMarkHasAudioTrue_AndSetLoudnessError()
    {
        using var scope = new DataFolderScope();
        var brokenMediaPath = Path.Combine(scope.RootPath, "broken-audio.mkv");
        await File.WriteAllTextAsync(brokenMediaPath, "not-a-valid-media-file");
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("broken-1", brokenMediaPath)
                {
                    HasAudio = false,
                    IntegratedLoudness = -20.0,
                    PeakDb = -2.0
                }
            ]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(20));

        var item = Assert.Single(LoadCatalog(scope.RootPath).Items);
        Assert.True(item.HasAudio);
        Assert.Null(item.IntegratedLoudness);
        Assert.Null(item.PeakDb);
        Assert.False(string.IsNullOrWhiteSpace(item.LoudnessError));
    }

    [Fact]
    public async Task ManualRun_ShouldScheduleNextAutoRun_FromCompletionTime()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath);

        var state = new ServerStateService();
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 5
        };
        var coreSettings = new CoreSettingsService(options, scope.RootPath);
        var service = new RefreshPipelineService(state, logger, coreSettings, CatalogOpen.Host(scope.RootPath), scope.RootPath);

        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        var nextAutoRunUtc = GetNextAutoRunUtc(service);
        Assert.NotNull(final.CompletedUtc);
        Assert.True(nextAutoRunUtc >= final.CompletedUtc.Value.AddMinutes(4));
    }

    [Fact]
    public async Task SourceRefresh_ShouldReconcileMovedFile_ByFingerprintWithoutAddRemove()
    {
        using var scope = new DataFolderScope();
        var sourceRoot = Path.Combine(scope.RootPath, "sourceA");
        var oldDir = Path.Combine(sourceRoot, "old");
        var newDir = Path.Combine(sourceRoot, "new");
        Directory.CreateDirectory(oldDir);
        Directory.CreateDirectory(newDir);

        var oldPath = Path.Combine(oldDir, "clip.mp4");
        await File.WriteAllTextAsync(oldPath, "same-content");
        var fingerprint = ComputeSha256(oldPath);
        var fileInfo = new FileInfo(oldPath);
        var oldRelative = Path.GetRelativePath(sourceRoot, oldPath);

        var sourceId = "source-1";
        CatalogSeed.Write(
            scope.RootPath,
            sources: [new SeedSource(sourceId, sourceRoot)],
            items:
            [
                new SeedItem("item-1", oldPath)
                {
                    SourceId = sourceId,
                    RelativePath = oldRelative,
                    FileName = "clip.mp4",
                    Fingerprint = fingerprint,
                    FingerprintStatus = 1,
                    FileSizeBytes = fileInfo.Length,
                    LastWriteTimeUtc = fileInfo.LastWriteTimeUtc
                }
            ]);

        var newPath = Path.Combine(newDir, "clip.mp4");
        File.Move(oldPath, newPath);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        var only = Assert.Single(LoadCatalog(scope.RootPath).Items);
        Assert.Equal("item-1", only.Id);
        Assert.Equal(newPath, only.FullPath);

        var sourceStage = final.Stages.Single(s => s.Stage == "sourceRefresh");
        Assert.Contains("0 added", sourceStage.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("0 removed", sourceStage.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("moved", sourceStage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ParseLoudness_ShouldReturnNoAudio_ForExplicitNoAudioOutput()
    {
        var output = """
                     Input #0, mov, from 'sample.mp4':
                       Stream #0:0: Video: h264
                     Stream map '0:a' matches no streams.
                     To ignore this, add a trailing '?' to the map.
                     """;

        var parsed = InvokeParseLoudness(output, exitCode: 1);
        Assert.NotNull(parsed);
        Assert.False(parsed!.HasAudio);
        Assert.Equal(0.0, parsed.MeanVolumeDb);
    }

    [Fact]
    public void ParseLoudness_ShouldParseIntegratedAndPeak_FromEbur128SummaryLines()
    {
        var output = """
                     Input #0, mov, from 'sample.mp4':
                       Stream #0:0: Video: h264
                       Stream #0:1: Audio: aac
                     [Parsed_ebur128_0 @ 000001]   I:         -16.2 LUFS
                     [Parsed_ebur128_0 @ 000001]   Peak:       -1.5 dBFS
                     """;

        var parsed = InvokeParseLoudness(output, exitCode: 0);
        Assert.NotNull(parsed);
        Assert.True(parsed!.HasAudio);
        Assert.Equal(-16.2, parsed.MeanVolumeDb, 1);
        Assert.Equal(-1.5, parsed.PeakDb, 1);
    }

    [Fact]
    public void ParseLoudness_ShouldNotInferNoAudio_WhenAudioStreamExistsWithoutSummary()
    {
        var output = """
                     Input #0, matroska,webm, from 'sample.mkv':
                       Stream #0:0: Video: h264
                       Stream #0:1: Audio: aac
                     Error while filtering: Invalid data found when processing input
                     """;

        var parsed = InvokeParseLoudness(output, exitCode: 1);
        Assert.Null(parsed);
    }

    [Fact]
    public async Task FingerprintStage_ShouldHashPendingItem_WhenFileExists()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "fingerprint-pending.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("fp-pending-1", mediaPath)
                {
                    MediaType = 1,
                    FingerprintStatus = 0
                }
            ]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        await service.RunFingerprintStageAsync(CancellationToken.None);

        var item = Assert.Single(LoadCatalog(scope.RootPath).Items);
        Assert.Equal(1, item.FingerprintStatus);
        Assert.False(string.IsNullOrWhiteSpace(item.Fingerprint));
        Assert.Equal(ComputeSha256(mediaPath), item.Fingerprint, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Refresh_PersistsStageColumnsWithoutBuildingTheCatalogDocument()
    {
        using var scope = new DataFolderScope();
        var sourceDir = Path.Combine(scope.RootPath, "media");
        Directory.CreateDirectory(sourceDir);
        var keptPath = Path.Combine(sourceDir, "kept.mp4");
        var addedPath = Path.Combine(sourceDir, "added.mp4");
        var missingPath = Path.Combine(sourceDir, "missing.mp4");
        await GenerateTinyVideoAsync(keptPath);
        await GenerateTinyVideoAsync(addedPath);

        CatalogSeed.Write(
            scope.RootPath,
            sources: [new SeedSource("src-media", sourceDir)],
            items:
            [
                new SeedItem("kept-1", keptPath)
                {
                    SourceId = "src-media",
                    RelativePath = "kept.mp4",
                    FileName = "kept.mp4",
                    IsFavorite = true,
                    FingerprintStatus = 0,
                    Tags = ["Keep"]
                },
                new SeedItem("missing-1", missingPath)
                {
                    SourceId = "src-media",
                    RelativePath = "missing.mp4",
                    FileName = "missing.mp4"
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(90));
        Assert.Null(completed.LastError);

        var items = LibraryCatalogStore.Read(host.Session.DatabasePath).Items;
        Assert.Equal(2, items.Count);
        Assert.DoesNotContain(items, item => item.Id == "missing-1");
        var kept = Assert.Single(items, item => item.Id == "kept-1");
        var added = Assert.Single(items, item => item.FullPath == addedPath);
        Assert.True(kept.IsFavorite);
        Assert.Contains("Keep", kept.Tags);
        AssertStoredMediaColumns(kept);
        AssertStoredMediaColumns(added);
        Assert.Contains("1 removed", completed.Stages.Single(stage => stage.Stage == "sourceRefresh").Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("1 added", completed.Stages.Single(stage => stage.Stage == "sourceRefresh").Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task FingerprintStage_PublishesCheckProgressBeforeHashing()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "ready.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("ready-1", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "abc",
                    FingerprintStatus = 1
                },
                new SeedItem("missing-1", Path.Combine(scope.RootPath, "missing.png"))
                {
                    MediaType = 1,
                    FingerprintStatus = 0
                }
            ]);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        await service.RunFingerprintStageAsync(CancellationToken.None);

        var stage = service.GetStatus().Stages.Single(item => item.Stage == "fingerprintScan");
        Assert.Equal("Fingerprint scan complete (0 hashed, 0 failed, 1 skipped)", stage.Message);
        Assert.Equal(100, stage.Percent);
        Assert.True(stage.IsComplete);

        var checking = state.GetReplayAfter(0).Events
            .Select(evt => evt.Payload)
            .OfType<RefreshStatusChangedPayload>()
            .SelectMany(payload => payload.Snapshot.Stages)
            .Where(item => item.Stage == "fingerprintScan" && item.Message.Contains("Checking files", StringComparison.Ordinal))
            .ToList();
        Assert.Contains(checking, item => item.Message == "Checking files 0/2 (0 to hash)" && item.Percent == 0);
        Assert.Contains(checking, item => item.Message == "Checking files 2/2 (0 to hash)" && item.Percent == 100);
    }

    [Fact]
    public async Task FingerprintStage_PreservesFavoriteAndTagCommittedDuringTheWrite()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "hold.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("hold-1", mediaPath)
                {
                    MediaType = 1,
                    FingerprintStatus = 0
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldNextFingerprintWrite(hold.Task);
        Assert.True(service.TryStartManual().Accepted);
        await service.FingerprintWriteEntered.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.True(host.Session.SetFavorite("hold-1", true));
        Assert.True(host.Session.ApplyItemTagEdits(["hold-1"], ["Night"], [], out _));
        hold.TrySetResult();

        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(20));
        var state = host.Session.ReadItemState("hold-1");
        Assert.NotNull(state);
        Assert.True(state!.IsFavorite);
        var item = Assert.Single(LibraryCatalogStore.Read(host.Session.DatabasePath).Items);
        Assert.Equal(1, item.FingerprintStatus);
        Assert.False(string.IsNullOrWhiteSpace(item.Fingerprint));
        Assert.Contains("Night", item.Tags);
    }

    [Fact]
    public async Task ThumbnailStage_ReusesMatchingRevisionWithoutTheSourceFile()
    {
        using var scope = new DataFolderScope();
        var missingSource = Path.Combine(scope.RootPath, "gone.png");
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-match", missingSource)
                {
                    MediaType = 1,
                    Fingerprint = "fp-match",
                    FileSizeBytes = 42,
                    LastWriteTimeUtc = DateTimeOffset.Parse("2024-05-06T07:08:09.0000000Z", System.Globalization.CultureInfo.InvariantCulture).UtcDateTime
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var stored = Assert.Single(host.Session.ReadRefreshItems());
        Assert.NotNull(stored.FileSizeBytes);
        Assert.NotNull(stored.LastWriteTimeUtc);
        var revision = $"{stored.Fingerprint}|{stored.FileSizeBytes}|{stored.LastWriteTimeUtc.Value.ToString("O", CultureInfo.InvariantCulture)}";
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var thumbPath = service.GetThumbnailPath("thumb-match");
        Directory.CreateDirectory(Path.GetDirectoryName(thumbPath)!);
        await File.WriteAllBytesAsync(thumbPath, TinyPngBytes);
        Assert.True(host.Session.SetThumbnail("thumb-match", revision, 1, 1));
        var before = File.GetLastWriteTimeUtc(thumbPath);
        await service.RunThumbnailStageAsync(CancellationToken.None);

        Assert.False(File.Exists(missingSource));
        Assert.Equal(before, File.GetLastWriteTimeUtc(thumbPath));
        var stage = service.GetStatus().Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.Contains("1 reused", stage.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("0 missing source", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_GeneratesWhenJpegIsMissing()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-missing-jpeg.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-missing-jpeg", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "fp-jpeg",
                    FileSizeBytes = 42,
                    LastWriteTimeUtc = DateTimeOffset.Parse("2024-05-06T07:08:09.0000000Z", System.Globalization.CultureInfo.InvariantCulture).UtcDateTime
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var stored = Assert.Single(host.Session.ReadRefreshItems());
        var revision = $"{stored.Fingerprint}|{stored.FileSizeBytes}|{stored.LastWriteTimeUtc!.Value.ToString("O", CultureInfo.InvariantCulture)}";
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        Directory.CreateDirectory(Path.Combine(scope.RootPath, "thumbnails"));
        Assert.True(host.Session.SetThumbnail("thumb-missing-jpeg", revision, 1, 1));
        await service.RunThumbnailStageAsync(CancellationToken.None);

        Assert.True(File.Exists(service.GetThumbnailPath("thumb-missing-jpeg")));
        var stage = service.GetStatus().Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.Contains("1 generated", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_RemovesDeletedItemThumbnail_AndKeepsLibraryThumbnails()
    {
        using var scope = new DataFolderScope();
        var sourceDir = Path.Combine(scope.RootPath, "thumbs");
        Directory.CreateDirectory(sourceDir);
        var keptPath = Path.Combine(sourceDir, "kept.png");
        var missingPath = Path.Combine(sourceDir, "missing.png");
        await WriteTinyPngAsync(keptPath);
        CatalogSeed.Write(
            scope.RootPath,
            sources: [new SeedSource("src-thumbs", sourceDir)],
            items:
            [
                new SeedItem("kept-thumb", keptPath)
                {
                    SourceId = "src-thumbs",
                    RelativePath = "kept.png",
                    FileName = "kept.png",
                    MediaType = 1,
                    Fingerprint = "fp-kept",
                    FingerprintStatus = 1
                },
                new SeedItem("gone-thumb", missingPath)
                {
                    SourceId = "src-thumbs",
                    RelativePath = "missing.png",
                    FileName = "missing.png",
                    MediaType = 1
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var keptThumb = service.GetThumbnailPath("kept-thumb");
        var goneThumb = service.GetThumbnailPath("gone-thumb");
        Directory.CreateDirectory(Path.GetDirectoryName(keptThumb)!);
        await File.WriteAllBytesAsync(keptThumb, TinyPngBytes);
        await File.WriteAllBytesAsync(goneThumb, TinyPngBytes);
        var orphanThumb = service.GetThumbnailPath("never-indexed");
        await File.WriteAllBytesAsync(orphanThumb, TinyPngBytes);
        var indexPath = Path.Combine(scope.RootPath, "thumbnails", "index.json");
        await File.WriteAllTextAsync(
            indexPath,
            new JsonObject
            {
                ["kept-thumb"] = new JsonObject { ["revision"] = "fp-kept|1|2020-01-01T00:00:00.0000000Z", ["width"] = 1, ["height"] = 1 },
                ["gone-thumb"] = new JsonObject { ["revision"] = "old", ["width"] = 1, ["height"] = 1 }
            }.ToJsonString());
        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        Assert.Null(completed.LastError);
        var items = LibraryCatalogStore.Read(host.Session.DatabasePath).Items;
        Assert.Equal("kept-thumb", Assert.Single(items).Id);
        Assert.True(File.Exists(keptThumb));
        Assert.False(File.Exists(goneThumb));
        Assert.False(File.Exists(orphanThumb));
        Assert.True(File.Exists(indexPath));
        var index = JsonNode.Parse(await File.ReadAllTextAsync(indexPath))!.AsObject();
        Assert.True(index.ContainsKey("gone-thumb"));
        Assert.True(index.ContainsKey("kept-thumb"));
        var stage = completed.Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.DoesNotContain("evicted", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_PreservesFavoriteTagBlacklistAndPlaybackDuringTheWrite()
    {
        using var scope = new DataFolderScope();
        var firstPath = Path.Combine(scope.RootPath, "hold-a.png");
        var secondPath = Path.Combine(scope.RootPath, "hold-b.png");
        await WriteTinyPngAsync(firstPath);
        await WriteTinyPngAsync(secondPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("hold-a", firstPath)
                {
                    MediaType = 1
                },
                new SeedItem("hold-b", secondPath)
                {
                    MediaType = 1
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldNextThumbnailWrite(hold.Task);
        var run = service.RunThumbnailStageAsync(CancellationToken.None);
        await service.ThumbnailWriteEntered.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.True(host.Session.SetFavorite("hold-a", true));
        Assert.True(host.Session.ApplyItemTagEdits(["hold-a"], ["Night"], [], out _));
        Assert.NotNull(host.Session.RecordPlayback("hold-a"));
        Assert.True(host.Session.SetBlacklist("hold-b", true));
        hold.TrySetResult();
        await run.WaitAsync(TimeSpan.FromSeconds(15));

        var first = host.Session.ReadItemState("hold-a");
        Assert.NotNull(first);
        Assert.True(first!.IsFavorite);
        Assert.False(first.IsBlacklisted);
        Assert.Equal(1, first.PlayCount);
        var holdA = Assert.Single(LibraryCatalogStore.Read(host.Session.DatabasePath).Items, item => item.Id == "hold-a");
        Assert.Contains("Night", holdA.Tags);
        var second = host.Session.ReadItemState("hold-b");
        Assert.NotNull(second);
        Assert.True(second!.IsBlacklisted);
        Assert.All(host.Session.ReadRefreshItems(), item => Assert.True(item.ThumbnailWidth is > 0));
    }

    [Fact]
    public async Task ThumbnailStage_CancelKeepsColumnsAlreadyWritten_AndLeavesRemainingCleanup()
    {
        using var scope = new DataFolderScope();
        var firstPath = Path.Combine(scope.RootPath, "cancel-a.png");
        var secondPath = Path.Combine(scope.RootPath, "cancel-b.png");
        await WriteTinyPngAsync(firstPath);
        await WriteTinyPngAsync(secondPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("cancel-a", firstPath)
                {
                    MediaType = 1
                },
                new SeedItem("cancel-b", secondPath)
                {
                    MediaType = 1
                }
            ]);

        var host = LibraryCatalogHost.Open(scope.RootPath);
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var orphan = service.GetThumbnailPath("orphan-cancel");
        Directory.CreateDirectory(Path.GetDirectoryName(orphan)!);
        await File.WriteAllBytesAsync(orphan, TinyPngBytes);
        var afterWrite = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldAfterNextThumbnailWrite(afterWrite.Task);
        using var writeCancel = new CancellationTokenSource();
        var writeRun = service.RunThumbnailStageAsync(writeCancel.Token);
        await service.ThumbnailAfterWriteEntered.WaitAsync(TimeSpan.FromSeconds(15));
        writeCancel.Cancel();
        afterWrite.TrySetResult();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => writeRun);

        var written = host.Session.ReadRefreshItems().Single(item => item.ThumbnailWidth is > 0);
        Assert.Equal("cancel-a", written.Id);
        var pending = host.Session.ReadRefreshItems().Single(item => item.Id == "cancel-b");
        Assert.Null(pending.ThumbnailWidth);
        Assert.True(File.Exists(orphan));

        var cleanupHold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldNextThumbnailCleanup(cleanupHold.Task);
        using var cleanupCancel = new CancellationTokenSource();
        var cleanupRun = service.RunThumbnailStageAsync(cleanupCancel.Token);
        await service.ThumbnailCleanupEntered.WaitAsync(TimeSpan.FromSeconds(15));
        var cleanupStage = service.GetStatus().Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.Contains("Thumbnail cleanup", cleanupStage.Message, StringComparison.Ordinal);
        Assert.True(File.Exists(orphan));
        cleanupCancel.Cancel();
        cleanupHold.TrySetResult();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cleanupRun);
        Assert.True(File.Exists(orphan));

        await service.RunThumbnailStageAsync(CancellationToken.None);
        Assert.False(File.Exists(orphan));
    }

    private static void AssertStoredMediaColumns(LibraryCatalogItem item)
    {
        Assert.Equal(1, item.FingerprintStatus);
        Assert.False(string.IsNullOrWhiteSpace(item.Fingerprint));
        Assert.True(item.DurationTicks is > 0);
        Assert.True(item.HasAudio == true || !string.IsNullOrWhiteSpace(item.LoudnessError));
    }

    private static async Task GenerateTinyVideoAsync(string path)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "ffmpeg",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-y");
        startInfo.ArgumentList.Add("-f");
        startInfo.ArgumentList.Add("lavfi");
        startInfo.ArgumentList.Add("-i");
        startInfo.ArgumentList.Add("color=c=black:s=16x16:d=1");
        startInfo.ArgumentList.Add("-f");
        startInfo.ArgumentList.Add("lavfi");
        startInfo.ArgumentList.Add("-i");
        startInfo.ArgumentList.Add("anullsrc=r=8000:cl=mono");
        startInfo.ArgumentList.Add("-shortest");
        startInfo.ArgumentList.Add("-t");
        startInfo.ArgumentList.Add("1");
        startInfo.ArgumentList.Add(path);
        using var process = Process.Start(startInfo);
        Assert.NotNull(process);
        var stderr = process!.StandardError.ReadToEndAsync();
        var stdout = process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();
        await stdout;
        var error = await stderr;
        Assert.True(process.ExitCode == 0, error);
    }

    private static async Task RunCancelledOneShotAsync(RefreshPipelineService service, string methodName)
    {
        var method = typeof(RefreshPipelineService).GetMethod(methodName, BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(method);
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var task = (Task)method!.Invoke(service, [cts.Token])!;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }

    private static void AssertForcedRescansStillPending(RefreshPipelineService service)
    {
        var field = typeof(RefreshPipelineService).GetField("_coreSettings", BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(field);
        var settings = ((CoreSettingsService)field!.GetValue(service)!).GetRefreshSettings();
        Assert.True(settings.ForceRescanDuration);
        Assert.True(settings.ForceRescanLoudness);
    }

    private static RefreshPipelineService CreateService(ServerStateService state, string appDataPathOverride, LibraryCatalogHost? catalog = null)
    {
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15
        };
        var coreSettings = new CoreSettingsService(options, appDataPathOverride);
        return new RefreshPipelineService(state, logger, coreSettings, catalog ?? CatalogOpen.Host(appDataPathOverride), appDataPathOverride);
    }

    private static ParsedLoudnessResult? InvokeParseLoudness(string output, int exitCode)
    {
        var method = typeof(RefreshPipelineService).GetMethod(
            "ParseLoudnessFromFfmpegOutput",
            BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);

        var result = method!.Invoke(null, [output, exitCode]);
        if (result == null)
        {
            return null;
        }

        var type = result.GetType();
        var hasAudioProp = type.GetProperty("HasAudio");
        var meanProp = type.GetProperty("MeanVolumeDb");
        var peakProp = type.GetProperty("PeakDb");
        Assert.NotNull(hasAudioProp);
        Assert.NotNull(meanProp);
        Assert.NotNull(peakProp);

        return new ParsedLoudnessResult(
            HasAudio: (bool)(hasAudioProp!.GetValue(result) ?? false),
            MeanVolumeDb: (double)(meanProp!.GetValue(result) ?? 0.0),
            PeakDb: (double)(peakProp!.GetValue(result) ?? 0.0));
    }

    private static DateTimeOffset GetNextAutoRunUtc(RefreshPipelineService service)
    {
        var field = typeof(RefreshPipelineService).GetField("_nextAutoRunUtc", BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(field);
        return (DateTimeOffset)(field!.GetValue(service) ?? DateTimeOffset.MinValue);
    }

    private static Task<ReelRoulette.Server.Contracts.RefreshStatusSnapshot> WaitForCompletionAsync(
        RefreshPipelineService service,
        TimeSpan timeout)
    {
        return WaitForStatusAsync(service, timeout, requireCompletedUtc: true, "Refresh pipeline did not complete in time.");
    }

    private static Task<ReelRoulette.Server.Contracts.RefreshStatusSnapshot> WaitForStopAsync(
        RefreshPipelineService service,
        TimeSpan timeout)
    {
        return WaitForStatusAsync(service, timeout, requireCompletedUtc: false, "Refresh pipeline did not stop in time.");
    }

    private static async Task<ReelRoulette.Server.Contracts.RefreshStatusSnapshot> WaitForStatusAsync(
        RefreshPipelineService service,
        TimeSpan timeout,
        bool requireCompletedUtc,
        string timeoutMessage)
    {
        var started = DateTime.UtcNow;
        while (DateTime.UtcNow - started < timeout)
        {
            var status = service.GetStatus();
            if (!status.IsRunning && (!requireCompletedUtc || status.CompletedUtc.HasValue))
            {
                return status;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException(timeoutMessage);
    }

    private static LibraryCatalogSnapshot LoadCatalog(string directory)
    {
        var opened = CatalogOpen.Open(directory);
        Assert.NotNull(opened.Session);
        return LibraryCatalogStore.Read(opened.Session.DatabasePath);
    }

    private static string ComputeSha256(string path)
    {
        using var stream = File.OpenRead(path);
        using var sha = SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(stream)).ToLowerInvariant();
    }

    private static readonly byte[] TinyPngBytes =
    [
        0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
        0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
        0x89,0x00,0x00,0x00,0x0D,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0xF8,0xCF,0xC0,0xF0,
        0x1F,0x00,0x05,0x00,0x01,0xFF,0x89,0x99,0x3D,0x1D,0x00,0x00,0x00,0x00,0x49,0x45,
        0x4E,0x44,0xAE,0x42,0x60,0x82
    ];

    private static Task WriteTinyPngAsync(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return File.WriteAllBytesAsync(path, TinyPngBytes);
    }

    private sealed class DataFolderScope : IDisposable
    {
        public string RootPath { get; }

        public DataFolderScope()
        {
            RootPath = Path.Combine(Path.GetTempPath(), "ReelRoulette.Tests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(RootPath);
        }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(RootPath))
                {
                    Directory.Delete(RootPath, recursive: true);
                }
            }
            catch
            {
                // best-effort cleanup only
            }
        }
    }

    private sealed record ParsedLoudnessResult(bool HasAudio, double MeanVolumeDb, double PeakDb);
}
