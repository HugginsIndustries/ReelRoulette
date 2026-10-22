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
            ["sourceRefresh", "nameSortKeys", "fingerprintScan", "durationScan", "loudnessScan", "thumbnailGeneration"],
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
        Assert.Empty(ReadSourceRefreshLogLines(scope.RootPath));
        Assert.Empty(final.KeptSources);
    }

    [Fact]
    public async Task SourceRefresh_AddsM4vAndWebmFilesAsVideos()
    {
        using var scope = new DataFolderScope();
        var sourceDir = Path.Combine(scope.RootPath, "source-a");
        Directory.CreateDirectory(sourceDir);

        var existingPath = Path.Combine(sourceDir, "existing.mp4");
        await File.WriteAllTextAsync(existingPath, "existing");
        await File.WriteAllTextAsync(Path.Combine(sourceDir, "phone.m4v"), "phone");
        await File.WriteAllTextAsync(Path.Combine(sourceDir, "web.WEBM"), "web");

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
                }
            ]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        var added = LoadCatalog(scope.RootPath).Items
            .Select(item => $"{item.FileName} mediaType={item.MediaType}")
            .Order(StringComparer.Ordinal);
        Assert.Equal(["existing.mp4 mediaType=0", "phone.m4v mediaType=0", "web.WEBM mediaType=0"], added);
    }

    [Fact]
    public async Task SourceRefresh_KeepsItemsOfARootThatListsNoMediaFiles()
    {
        using var scope = new DataFolderScope();
        var emptyDir = Path.Combine(scope.RootPath, "unmounted");
        var sourceDir = Path.Combine(scope.RootPath, "source-a");
        Directory.CreateDirectory(emptyDir);
        Directory.CreateDirectory(sourceDir);

        var existingPath = Path.Combine(sourceDir, "existing.mp4");
        await File.WriteAllTextAsync(existingPath, "existing");
        var lastPlayed = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);

        SeedItem KeptItem(string id, string fileName) => new(id, Path.Combine(emptyDir, fileName))
        {
            SourceId = "src-empty",
            RelativePath = fileName,
            FileName = fileName,
            IsFavorite = true,
            PlayCount = 3,
            LastPlayedUtc = lastPlayed,
            Tags = ["Keep"]
        };

        CatalogSeed.Write(
            scope.RootPath,
            sources: [new SeedSource("src-empty", emptyDir), new SeedSource("src-a", sourceDir)],
            items:
            [
                KeptItem("item-kept-1", "one.mp4"),
                KeptItem("item-kept-2", "two.mp4"),
                new SeedItem("item-existing", existingPath)
                {
                    SourceId = "src-a",
                    RelativePath = "existing.mp4",
                    FileName = "existing.mp4"
                },
                new SeedItem("item-missing", Path.Combine(sourceDir, "missing.mp4"))
                {
                    SourceId = "src-a",
                    RelativePath = "missing.mp4",
                    FileName = "missing.mp4"
                }
            ],
            tags: [new SeedTag("Keep")]);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        var itemList = LoadCatalog(scope.RootPath).Items;
        Assert.Equal(
            ["item-existing", "item-kept-1", "item-kept-2"],
            itemList.Select(item => item.Id).Order(StringComparer.Ordinal));
        foreach (var kept in itemList.Where(item => item.SourceId == "src-empty"))
        {
            Assert.True(kept.IsFavorite);
            Assert.Equal(3, kept.PlayCount);
            Assert.Equal(lastPlayed, kept.LastPlayedUtc);
            Assert.Contains("Keep", kept.Tags);
        }

        var sourceStage = final.Stages.Single(s => s.Stage == "sourceRefresh");
        Assert.Contains("1 removed", sourceStage.Message, StringComparison.OrdinalIgnoreCase);

        var warning = Assert.Single(ReadSourceRefreshLogLines(scope.RootPath));
        Assert.Contains("[server] [warn]", warning);
        Assert.Contains($"root={emptyDir} ", warning);
        Assert.Contains("2 items", warning);

        // The status and its event list the kept source by id with its item count, and never its folder, since the
        // event goes to every client.
        var keptSource = Assert.Single(final.KeptSources);
        Assert.Equal(("src-empty", 2), (keptSource.SourceId, keptSource.ItemCount));
        var published = state.GetReplayAfter(0).Events
            .Select(envelope => envelope.Payload)
            .OfType<RefreshStatusChangedPayload>()
            .Last();
        Assert.Equal(("src-empty", 2), (Assert.Single(published.Snapshot.KeptSources).SourceId, published.Snapshot.KeptSources[0].ItemCount));
        Assert.DoesNotContain(emptyDir, JsonSerializer.Serialize(published.Snapshot));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(published.Snapshot), "RefreshStatusSnapshot");

        // The next run starts its own list, so a folder that lists files again is no longer kept.
        await File.WriteAllTextAsync(Path.Combine(emptyDir, "one.mp4"), "one");
        Assert.True(service.TryStartManual().Accepted);
        var next = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));
        Assert.NotEqual(final.RunId, next.RunId);
        Assert.Empty(next.KeptSources);
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
    public async Task LoudnessStage_StoresTheMeasuredPeak_AndNoPeakWhereNoneWasMeasured()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                ExistingVideo(scope, "measured") with { HasAudio = true, IntegratedLoudness = -20.0, PeakDb = -5.0, LoudnessAnalysisVersion = 1 },
                ExistingVideo(scope, "no-peak") with { HasAudio = true, IntegratedLoudness = -30.0, PeakDb = -5.0, LoudnessAnalysisVersion = 1 },
                ExistingVideo(scope, "no-audio")
            ]);
        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.AssumeFfmpegAvailable();
        service.SetLoudnessAnalyzer((path, _, _) => Path.GetFileNameWithoutExtension(path) switch
        {
            "measured" => Measured(-20.0, -1.5),
            "no-peak" => Measured(-30.0, null),
            _ => Task.FromResult<RefreshPipelineService.FileLoudnessInfo?>(new RefreshPipelineService.FileLoudnessInfo { HasAudio = false })
        });

        await InvokeLoudnessStageAsync(service);

        var measured = RefreshItem(scope.RootPath, "measured");
        Assert.Equal((true, -20.0, -1.5), (measured.HasAudio, measured.IntegratedLoudness, measured.PeakDb));
        var noPeak = RefreshItem(scope.RootPath, "no-peak");
        Assert.Equal((true, -30.0, (double?)null), (noPeak.HasAudio, noPeak.IntegratedLoudness, noPeak.PeakDb));
        var noAudio = RefreshItem(scope.RootPath, "no-audio");
        Assert.Equal((false, (double?)null, (double?)null), (noAudio.HasAudio, noAudio.IntegratedLoudness, noAudio.PeakDb));
        Assert.All(new[] { measured, noPeak, noAudio }, item => Assert.Equal(LibraryCatalogStore.LoudnessAnalysisVersion, item.LoudnessAnalysisVersion));
        Assert.Equal(
            "Loudness scan complete (3 files, 3 updated, 1 without audio)",
            service.GetStatus().Stages.Single(stage => stage.Stage == "loudnessScan").Message);
    }

    // Counted as audio, the digitally silent track would move the baseline, the 75th percentile, to -30.
    [Fact]
    public async Task LoudnessStage_StoresADigitallySilentTrackAsNoAudio_AndAFaintOneAsAudio_ForEveryReader()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            sources: [new SeedSource("on", scope.RootPath)],
            items: new[] { "silent", "faint", "loud", "quiet" }.Select(id => ExistingVideo(scope, id) with { SourceId = "on" }));
        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.AssumeFfmpegAvailable();
        service.SetLoudnessAnalyzer((path, _, _) => Task.FromResult(RefreshPipelineService.ParseLoudnessFromFfmpegOutput(
            Path.GetFileNameWithoutExtension(path) switch
            {
                "silent" => Ebur128Output("-70.0", "    Peak:       -inf dBFS"),
                "faint" => Ebur128Output("-70.0", "    Peak:      -80.3 dBFS"),
                "loud" => Ebur128Output("-20.0", "    Peak:       -1.5 dBFS"),
                _ => Ebur128Output("-30.0", "    Peak:       -9.0 dBFS")
            })));

        await InvokeLoudnessStageAsync(service);

        Assert.Equal(
            "Loudness scan complete (4 files, 4 updated, 1 without audio)",
            service.GetStatus().Stages.Single(stage => stage.Stage == "loudnessScan").Message);
        Assert.Equal(
            [
                "with audio: faint, loud, quiet",
                "without audio: silent",
                "videos with audio=3 without audio=1",
                "baseline=-20",
                "silent hasAudio=false loudness=none peak=none",
                "faint hasAudio=true loudness=-70 peak=-80.3"
            ],
            LibraryListQueryTests.DescribeAudioReads(scope.RootPath, "silent", "faint"));
    }

    [Fact]
    public async Task LoudnessStage_RecordsTheAnalysisVersion_WhenTheResultChangesNothing()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items: [ExistingVideo(scope, "same") with { HasAudio = true, IntegratedLoudness = -20.0, PeakDb = -1.5, LoudnessAnalysisVersion = 1 }]);
        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.AssumeFfmpegAvailable();
        service.SetLoudnessAnalyzer((_, _, _) => Measured(-20.04, -1.46));

        await InvokeLoudnessStageAsync(service);

        var same = RefreshItem(scope.RootPath, "same");
        Assert.Equal((-20.0, -1.5), (same.IntegratedLoudness, same.PeakDb));
        Assert.Equal(LibraryCatalogStore.LoudnessAnalysisVersion, same.LoudnessAnalysisVersion);
        Assert.Equal(
            "Loudness scan complete (1 files, 0 updated)",
            service.GetStatus().Stages.Single(stage => stage.Stage == "loudnessScan").Message);
    }

    [Fact]
    public async Task LoudnessStage_KeepsTheStoredValues_WhenAScanFails_AndScansTheVideoAgainNextRefresh()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                ExistingVideo(scope, "older") with { HasAudio = true, IntegratedLoudness = -20.0, LoudnessAnalysisVersion = 1 },
                ExistingVideo(scope, "current") with { HasAudio = true, IntegratedLoudness = -18.0, PeakDb = -1.0 }
            ]);
        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.AssumeFfmpegAvailable();
        service.SetLoudnessAnalyzer((_, _, _) => Task.FromResult<RefreshPipelineService.FileLoudnessInfo?>(new RefreshPipelineService.FileLoudnessInfo
        {
            HasAudio = true,
            IsError = true,
            ErrorMessage = "Loudness analysis timed out while running ffmpeg."
        }));

        await InvokeLoudnessStageAsync(service, forceFullRescan: true);

        var older = RefreshItem(scope.RootPath, "older");
        Assert.Equal((-20.0, (double?)null, 1), (older.IntegratedLoudness, older.PeakDb, older.LoudnessAnalysisVersion));
        var current = RefreshItem(scope.RootPath, "current");
        Assert.Equal((-18.0, -1.0, LibraryCatalogStore.LoudnessAnalysisVersion), (current.IntegratedLoudness, current.PeakDb, current.LoudnessAnalysisVersion));
        Assert.All(new[] { older, current }, item => Assert.Equal("Loudness analysis timed out while running ffmpeg.", item.LoudnessError));

        var scanned = new List<string>();
        service.SetLoudnessAnalyzer((path, _, _) =>
        {
            lock (scanned)
            {
                scanned.Add(Path.GetFileNameWithoutExtension(path));
            }

            return Measured(-19.0, -1.2);
        });

        await InvokeLoudnessStageAsync(service);

        Assert.Equal(["current", "older"], scanned.Order());
        Assert.All(
            new[] { RefreshItem(scope.RootPath, "older"), RefreshItem(scope.RootPath, "current") },
            item => Assert.Equal((-19.0, -1.2, (string?)null), (item.IntegratedLoudness, item.PeakDb, item.LoudnessError)));
    }

    [Fact]
    public async Task LoudnessStage_ScansVideosWithAudioFromAnOlderAnalysis_AndNoVideoWithoutAudio()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                ExistingVideo(scope, "older-with-audio") with { HasAudio = true, IntegratedLoudness = -20.0, LoudnessAnalysisVersion = 1 },
                ExistingVideo(scope, "older-without-audio") with { HasAudio = false, LoudnessAnalysisVersion = 1 },
                ExistingVideo(scope, "current-with-audio") with { HasAudio = true, IntegratedLoudness = -18.0, PeakDb = -1.0 },
                ExistingVideo(scope, "photo") with { MediaType = 1, LoudnessAnalysisVersion = 0 },
                ExistingVideo(scope, "never-scanned") with { LoudnessAnalysisVersion = 0 }
            ]);
        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.AssumeFfmpegAvailable();
        var scanned = new List<string>();
        service.SetLoudnessAnalyzer((path, _, _) =>
        {
            lock (scanned)
            {
                scanned.Add(Path.GetFileNameWithoutExtension(path));
            }

            return Measured(-20.0, -1.0);
        });

        await InvokeLoudnessStageAsync(service);

        Assert.Equal(["never-scanned", "older-with-audio"], scanned.Order());
    }

    [Fact]
    public async Task LoudnessStage_ScansOneVideoAtATime()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath, items: Enumerable.Range(0, 6).Select(i => ExistingVideo(scope, $"video-{i}")).ToArray());
        var service = CreateService(new ServerStateService(), scope.RootPath);
        service.AssumeFfmpegAvailable();
        var running = 0;
        var mostAtOnce = 0;
        var scans = 0;
        service.SetLoudnessAnalyzer(async (_, _, _) =>
        {
            var now = Interlocked.Increment(ref running);
            InterlockedMax(ref mostAtOnce, now);
            Interlocked.Increment(ref scans);
            await Task.Delay(30);
            Interlocked.Decrement(ref running);
            return await Measured(-20.0, -1.0);
        });

        await InvokeLoudnessStageAsync(service);

        Assert.Equal(6, scans);
        Assert.Equal(1, mostAtOnce);
    }

    [Fact]
    public async Task LoudnessStage_StoresTheTruePeak_FfmpegMeasures()
    {
        using var scope = new DataFolderScope();
        // A 12 kHz tone sampled at 48 kHz, a quarter turn out of step, peaks between its samples: its samples reach
        // 0.9 × 0.707 (-3.9 dBFS), and the true peak is near 0.9 (-0.9 dBTP), which ffmpeg reads as about -0.3.
        var tonePath = Path.Combine(scope.RootPath, "tone.wav");
        using (var generate = Process.Start(new ProcessStartInfo
        {
            FileName = "ffmpeg",
            ArgumentList =
            {
                "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                "-i", "aevalsrc=0.9*sin(2*PI*12000*t+PI/4):s=48000:d=3",
                "-c:a", "pcm_f32le", tonePath
            },
            UseShellExecute = false,
            RedirectStandardError = true
        })!)
        {
            await generate.StandardError.ReadToEndAsync();
            await generate.WaitForExitAsync();
            Assert.Equal(0, generate.ExitCode);
        }

        CatalogSeed.Write(scope.RootPath, items: [new SeedItem("tone", tonePath)]);
        var service = CreateService(new ServerStateService(), scope.RootPath);

        await InvokeLoudnessStageAsync(service);

        var tone = RefreshItem(scope.RootPath, "tone");
        Assert.True(tone.HasAudio);
        Assert.NotNull(tone.IntegratedLoudness);
        Assert.InRange(tone.PeakDb!.Value, -2.0, 0.5);
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
        Assert.Null(item2["thumbnailVersion"]);
        Assert.Null(item2["thumbnailWidth"]);
        Assert.Null(item2["thumbnailHeight"]);
    }

    [Fact]
    public async Task ThumbnailStage_ShouldWriteRowMetadata()
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
        Assert.All(
            Directory.GetFiles(Path.Combine(scope.RootPath, "thumbnails")),
            path => Assert.Equal(".jpg", Path.GetExtension(path)));
    }

    [Fact]
    public async Task ThumbnailStage_ShouldBackfillMissingDimensions()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-backfill.png");
        await WriteTinyPngAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("thumb-backfill-1", mediaPath)
                {
                    MediaType = 1,
                    Fingerprint = "fp-backfill-a"
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
    public void RefreshSettingsRoute_SchedulesTheNextRunFromTheNewInterval()
    {
        using var scope = new DataFolderScope();
        var options = new ServerRuntimeOptions { AutoRefreshEnabled = false, AutoRefreshIntervalMinutes = 15 };
        var coreSettings = new CoreSettingsService(options, scope.RootPath);
        var service = new RefreshPipelineService(
            new ServerStateService(),
            new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>(),
            coreSettings,
            CatalogOpen.Host(scope.RootPath),
            scope.RootPath);

        var before = DateTimeOffset.UtcNow;
        ServerHostComposition.UpdateRefreshSettings(
            new RefreshSettingsSnapshot { AutoRefreshEnabled = true, AutoRefreshIntervalMinutes = 120 },
            service);

        Assert.True(coreSettings.GetRefreshSettings().AutoRefreshEnabled);
        Assert.InRange(service.NextAutoRunUtc, before.AddMinutes(120), DateTimeOffset.UtcNow.AddMinutes(120));
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

    [Theory]
    [InlineData("RunDurationStageAsync", "durationScan", "Duration scan complete (200 files, 0 updated)")]
    [InlineData("RunLoudnessStageAsync", "loudnessScan", "Loudness scan complete (200 files, 0 updated)")]
    public async Task ScanStage_PublishesOneProgressEventPerIntervalAndItsCompletion(
        string methodName,
        string stage,
        string completionMessage)
    {
        using var scope = new DataFolderScope();
        var items = Enumerable.Range(0, 200)
            .Select(i => new SeedItem($"scan-{i}", Path.Combine(scope.RootPath, $"missing-{i}.mp4")))
            .ToArray();
        CatalogSeed.Write(scope.RootPath, items: items);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        var frozen = DateTimeOffset.UtcNow;
        service.SetProgressClock(() => frozen);
        service.AssumeFfmpegAvailable();
        using var subscription = new CancellationTokenSource();
        var reader = state.Subscribe(subscription.Token);

        var method = typeof(RefreshPipelineService).GetMethod(methodName, BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(method);
        await (Task)method!.Invoke(service, [CancellationToken.None, false])!;

        var stageEvents = new List<RefreshStageProgress>();
        while (reader.TryRead(out var envelope))
        {
            if (envelope.EventType == "refreshStatusChanged" &&
                envelope.Payload is RefreshStatusChangedPayload payload)
            {
                stageEvents.Add(payload.Snapshot.Stages.Single(s => s.Stage == stage));
            }
        }

        Assert.Equal(2, stageEvents.Count);
        Assert.False(stageEvents[0].IsComplete);
        Assert.True(stageEvents[1].IsComplete);
        Assert.Equal(completionMessage, stageEvents[1].Message);
    }

    [Fact]
    public void NameSortKeyStage_FillsMissingKeys_AndRecomputesEveryKeyAfterAKeyVersionChange()
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(
            scope.RootPath,
            items:
            [
                new SeedItem("a", Path.Combine(scope.RootPath, "Alpha.mp4")),
                new SeedItem("b", Path.Combine(scope.RootPath, "beta.mp4")),
                new SeedItem("c", Path.Combine(scope.RootPath, "\u017Figma.mp4"))
            ]);
        var databasePath = Path.Combine(scope.RootPath, "library.db");
        ExecuteSql(databasePath, "UPDATE items SET file_name_sort_key = NULL WHERE id = 'b';");
        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);

        service.RunNameSortKeyStage(CancellationToken.None);

        Assert.Equal("Name sort keys complete (1 updated)", service.GetStatus().Stages.Single(s => s.Stage == "nameSortKeys").Message);
        Assert.Equal(LibraryCatalogNameSortKey.Compute("beta.mp4"), ReadSortKey(databasePath, "b"));

        ExecuteSql(databasePath, "UPDATE items SET file_name_sort_key = x'00' WHERE id IN ('a', 'c');");
        ExecuteSql(databasePath, "UPDATE catalog_meta SET value = '0' WHERE key = 'name_sort_key_version';");

        service.RunNameSortKeyStage(CancellationToken.None);

        Assert.Equal("Name sort keys complete (2 updated)", service.GetStatus().Stages.Single(s => s.Stage == "nameSortKeys").Message);
        Assert.Equal(LibraryCatalogNameSortKey.Compute("Alpha.mp4"), ReadSortKey(databasePath, "a"));
        Assert.Equal(LibraryCatalogNameSortKey.Compute("\u017Figma.mp4"), ReadSortKey(databasePath, "c"));
        Assert.Empty(CatalogOpen.Host(scope.RootPath).Session.ReadNameSortKeyWork().Items);
    }

    private static void ExecuteSql(string databasePath, string sql)
    {
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={databasePath};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private static byte[]? ReadSortKey(string databasePath, string id)
    {
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={databasePath};Mode=ReadOnly;Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT file_name_sort_key FROM items WHERE id = $id;";
        command.Parameters.AddWithValue("$id", id);
        return command.ExecuteScalar() as byte[];
    }

    [Fact]
    public void ProgressThrottle_LetsOneUpdateThroughPerInterval()
    {
        var now = DateTimeOffset.UtcNow;
        var throttle = new RefreshProgressThrottle(TimeSpan.FromMilliseconds(500), () => now);

        Assert.True(throttle.TryEnter());
        Assert.False(throttle.TryEnter());
        now = now.AddMilliseconds(499);
        Assert.False(throttle.TryEnter());
        now = now.AddMilliseconds(1);
        Assert.True(throttle.TryEnter());
        Assert.False(throttle.TryEnter());
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task ForceRescan_ClearingItsFlag_KeepsFingerprintParallelism(bool forceDuration, bool forceLoudness)
    {
        using var scope = new DataFolderScope();
        CatalogSeed.Write(scope.RootPath);
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = false,
            AutoRefreshIntervalMinutes = 45,
            ForceRescanDuration = forceDuration,
            ForceRescanLoudness = forceLoudness,
            FingerprintScanMaxDegreeOfParallelism = 8
        };
        var coreSettings = new CoreSettingsService(options, scope.RootPath);
        var service = new RefreshPipelineService(
            new ServerStateService(),
            new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>(),
            coreSettings,
            CatalogOpen.Host(scope.RootPath),
            scope.RootPath);

        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var after = coreSettings.GetRefreshSettings();
        Assert.False(after.ForceRescanDuration);
        Assert.False(after.ForceRescanLoudness);
        Assert.Equal(8, after.FingerprintScanMaxDegreeOfParallelism);
        Assert.False(after.AutoRefreshEnabled);
        Assert.Equal(45, after.AutoRefreshIntervalMinutes);
    }

    [Fact]
    public async Task LoudnessFailure_ShouldMarkHasAudioTrue_KeepStoredValues_AndSetLoudnessError()
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
        Assert.Equal(-20.0, item.IntegratedLoudness);
        Assert.Equal(-2.0, item.PeakDb);
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

        var parsed = RefreshPipelineService.ParseLoudnessFromFfmpegOutput(output, exitCode: 1);
        Assert.NotNull(parsed);
        Assert.False(parsed!.HasAudio);
        Assert.Null(parsed.IntegratedLoudness);
        Assert.Null(parsed.PeakDb);
    }

    [Fact]
    public void ParseLoudness_ReadsTheLoudnessAndTruePeak_FromTheEbur128Summary()
    {
        var parsed = RefreshPipelineService.ParseLoudnessFromFfmpegOutput(Ebur128Output("-25.6", "    Peak:      -14.8 dBFS"), exitCode: 0);

        Assert.NotNull(parsed);
        Assert.True(parsed!.HasAudio);
        Assert.Equal(-25.6, parsed.IntegratedLoudness);
        Assert.Equal(-14.8, parsed.PeakDb);
    }

    [Fact]
    public void ParseLoudness_ReadsADigitallySilentTrack_AsNoAudio()
    {
        var parsed = RefreshPipelineService.ParseLoudnessFromFfmpegOutput(Ebur128Output("-70.0", "    Peak:       -inf dBFS"), exitCode: 0);

        Assert.NotNull(parsed);
        Assert.False(parsed!.HasAudio);
        Assert.Null(parsed.IntegratedLoudness);
        Assert.Null(parsed.PeakDb);
    }

    [Fact]
    public void ParseLoudness_ReadsATrackAtTheFloorWithAPeak_AsAudio()
    {
        var parsed = RefreshPipelineService.ParseLoudnessFromFfmpegOutput(Ebur128Output("-70.0", "    Peak:      -80.3 dBFS"), exitCode: 0);

        Assert.NotNull(parsed);
        Assert.True(parsed!.HasAudio);
        Assert.Equal(-70.0, parsed.IntegratedLoudness);
        Assert.Equal(-80.3, parsed.PeakDb);
    }

    [Fact]
    public void ParseLoudness_HasNoPeak_WithoutAPeakLine()
    {
        var parsed = RefreshPipelineService.ParseLoudnessFromFfmpegOutput(Ebur128Output("-25.6", peakLine: null), exitCode: 0);

        Assert.NotNull(parsed);
        Assert.True(parsed!.HasAudio);
        Assert.Equal(-25.6, parsed.IntegratedLoudness);
        Assert.Null(parsed.PeakDb);
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

        var parsed = RefreshPipelineService.ParseLoudnessFromFfmpegOutput(output, exitCode: 1);
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
    public async Task ThumbnailStage_UsesTheStoredDuration_WithoutProbingTheVideoAgain()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "stored-duration.mp4");
        await GenerateTinyVideoAsync(mediaPath);
        CatalogSeed.Write(
            scope.RootPath,
            items: [new SeedItem("stored-duration", mediaPath) { Duration = TimeSpan.FromSeconds(1) }]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        var probes = 0;
        service.SetDurationProbe((_, _) =>
        {
            Interlocked.Increment(ref probes);
            return Task.FromResult<TimeSpan?>(TimeSpan.FromSeconds(1));
        });
        await service.RunThumbnailStageAsync(CancellationToken.None);

        Assert.Equal(0, Volatile.Read(ref probes));
        Assert.True(File.Exists(service.GetThumbnailPath("stored-duration")));
        var stage = service.GetStatus().Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.Contains("1 generated", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_ProbesAVideoWithoutAStoredDuration()
    {
        using var scope = new DataFolderScope();
        var mediaPath = Path.Combine(scope.RootPath, "no-duration.mp4");
        await GenerateTinyVideoAsync(mediaPath);
        CatalogSeed.Write(scope.RootPath, items: [new SeedItem("no-duration", mediaPath)]);

        var service = CreateService(new ServerStateService(), scope.RootPath);
        var probedPaths = new List<string>();
        service.SetDurationProbe((path, _) =>
        {
            lock (probedPaths)
            {
                probedPaths.Add(path);
            }

            return Task.FromResult<TimeSpan?>(TimeSpan.FromSeconds(1));
        });
        await service.RunThumbnailStageAsync(CancellationToken.None);

        Assert.Equal([mediaPath], probedPaths);
        Assert.True(File.Exists(service.GetThumbnailPath("no-duration")));
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
        var orphanThumb = service.GetThumbnailPath("never-in-catalog");
        await File.WriteAllBytesAsync(orphanThumb, TinyPngBytes);
        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        Assert.Null(completed.LastError);
        var items = LibraryCatalogStore.Read(host.Session.DatabasePath).Items;
        Assert.Equal("kept-thumb", Assert.Single(items).Id);
        Assert.True(File.Exists(keptThumb));
        Assert.False(File.Exists(goneThumb));
        Assert.False(File.Exists(orphanThumb));
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
        startInfo.ArgumentList.Add("sine=frequency=440:sample_rate=8000");
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

    /// <summary>
    /// What ffmpeg n9.0.2 writes to stderr for the loudness scan of a video with audio, with its metadata lines
    /// left out: the <c>ebur128</c> summary with <paramref name="integrated"/> and, unless null,
    /// <paramref name="peakLine"/> in a true peak block.
    /// </summary>
    private static string Ebur128Output(string integrated, string? peakLine)
    {
        var peakBlock = peakLine == null ? string.Empty : $"\n\n  True peak:\n{peakLine}";
        return $"""
            Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample.mp4':
              Duration: 00:10:00.00, start: 0.000000, bitrate: 913 kb/s
              Stream #0:0[0x1](und): Video: h264 (Constrained Baseline) (avc1 / 0x31637661), yuv420p(progressive), 640x360 [SAR 1:1 DAR 16:9], 748 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
              Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 160 kb/s (default)
            Stream mapping:
              Stream #0:1 -> #0:0 (aac (native) -> pcm_s16le (native))
            Press [q] to stop, [?] for help
            Output #0, null, to 'pipe:':
              Stream #0:0(und): Audio: pcm_s16le, 48000 Hz, stereo, s16, 1536 kb/s (default)
            [Parsed_ebur128_0 @ 0x55d0c0] Summary:

              Integrated loudness:
                I:         {integrated} LUFS
                Threshold: -35.6 LUFS

              Loudness range:
                LRA:         0.2 LU
                Threshold: -45.6 LUFS
                LRA low:   -25.6 LUFS
                LRA high:  -25.5 LUFS{peakBlock}
            [out#0/null @ 0x55d0c0] video:0KiB audio:1875KiB subtitle:0KiB other streams:0KiB global headers:0KiB muxing overhead: unknown
            size=N/A time=00:10:00.00 bitrate=N/A speed= 463x elapsed=0:00:01.30
            """;
    }

    private static Task InvokeLoudnessStageAsync(RefreshPipelineService service, bool forceFullRescan = false)
    {
        var method = typeof(RefreshPipelineService).GetMethod("RunLoudnessStageAsync", BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(method);
        return (Task)method!.Invoke(service, [CancellationToken.None, forceFullRescan])!;
    }

    private static CatalogRefreshItem RefreshItem(string directory, string id)
    {
        var opened = CatalogOpen.Open(directory);
        Assert.NotNull(opened.Session);
        return opened.Session.ReadRefreshItems().Single(item => item.Id == id);
    }

    /// <summary>A seeded video whose file exists, so the loudness stage scans it.</summary>
    private static SeedItem ExistingVideo(DataFolderScope scope, string id)
    {
        var path = Path.Combine(scope.RootPath, id + ".mp4");
        File.WriteAllBytes(path, [0x01]);
        return new SeedItem(id, path);
    }

    private static Task<RefreshPipelineService.FileLoudnessInfo?> Measured(double integrated, double? peak) =>
        Task.FromResult<RefreshPipelineService.FileLoudnessInfo?>(new RefreshPipelineService.FileLoudnessInfo
        {
            HasAudio = true,
            IntegratedLoudness = integrated,
            PeakDb = peak
        });

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

    private static string[] ReadSourceRefreshLogLines(string appDataDirectory)
    {
        var logPath = Path.Combine(appDataDirectory, "last.log");
        return File.Exists(logPath)
            ? File.ReadAllLines(logPath).Where(line => line.Contains("Source refresh", StringComparison.Ordinal)).ToArray()
            : [];
    }

    private static void InterlockedMax(ref int target, int value)
    {
        var seen = Volatile.Read(ref target);
        while (value > seen)
        {
            var previous = Interlocked.CompareExchange(ref target, value, seen);
            if (previous == seen)
            {
                return;
            }

            seen = previous;
        }
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

}
