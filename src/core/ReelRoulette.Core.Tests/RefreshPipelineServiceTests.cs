using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
using System.Reflection;
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
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray()
        });

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
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray()
        });

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
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray()
        });

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
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray()
        });

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
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "item-1",
                    ["mediaType"] = 0,
                    ["fullPath"] = "C:\\media\\item-1.mp4"
                }
            }
        });

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
        using var scope = new AppDataScope();
        var sourceDir = Path.Combine(scope.RootPath, "source-a");
        Directory.CreateDirectory(sourceDir);

        var existingPath = Path.Combine(sourceDir, "existing.mp4");
        var missingPath = Path.Combine(sourceDir, "missing.mp4");
        await File.WriteAllTextAsync(existingPath, "existing");

        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "src-a",
                    ["rootPath"] = sourceDir,
                    ["isEnabled"] = true
                }
            },
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "item-existing",
                    ["sourceId"] = "src-a",
                    ["fullPath"] = existingPath,
                    ["relativePath"] = "existing.mp4",
                    ["fileName"] = "existing.mp4",
                    ["mediaType"] = 0
                },
                new JsonObject
                {
                    ["id"] = "item-missing",
                    ["sourceId"] = "src-a",
                    ["fullPath"] = missingPath,
                    ["relativePath"] = "missing.mp4",
                    ["fileName"] = "missing.mp4",
                    ["mediaType"] = 0
                }
            }
        });

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        var root = await LoadLibraryAsync(scope.LibraryPath);
        var items = Assert.IsType<JsonArray>(root["items"]);
        var itemList = items.OfType<JsonObject>().ToList();
        var kept = Assert.Single(itemList);
        Assert.Equal("item-existing", kept["id"]?.GetValue<string>());
        Assert.Equal(existingPath, kept["fullPath"]?.GetValue<string>());
        Assert.DoesNotContain(itemList, item => string.Equals(item["id"]?.GetValue<string>(), "item-missing", StringComparison.OrdinalIgnoreCase));

        var sourceStage = final.Stages.Single(s => s.Stage == "sourceRefresh");
        Assert.Contains("1 removed", sourceStage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task LoudnessStage_ShouldPreserveExistingValues_AndNotInventMissingValues()
    {
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "has-loudness",
                    ["mediaType"] = 0,
                    ["fullPath"] = "C:\\media\\has-loudness.mp4",
                    ["integratedLoudness"] = -14.2,
                    ["hasAudio"] = true,
                    ["peakDb"] = -0.5
                },
                new JsonObject
                {
                    ["id"] = "needs-loudness",
                    ["mediaType"] = 0,
                    ["fullPath"] = "C:\\media\\needs-loudness.mp4"
                }
            }
        });

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var root = await LoadLibraryAsync(scope.LibraryPath);
        var items = Assert.IsType<JsonArray>(root["items"]);
        var hasLoudness = items.OfType<JsonObject>().Single(i => i?["id"]?.GetValue<string>() == "has-loudness");
        var needsLoudness = items.OfType<JsonObject>().Single(i => i?["id"]?.GetValue<string>() == "needs-loudness");

        Assert.Equal(-14.2, hasLoudness!["integratedLoudness"]!.GetValue<double>());
        Assert.Equal(-0.5, hasLoudness["peakDb"]!.GetValue<double>());
        Assert.Null(needsLoudness!["integratedLoudness"]);
        Assert.Null(needsLoudness["peakDb"]);
    }

    [Fact]
    public async Task ThumbnailStage_ShouldRegenerateWhenSourceRevisionChanges()
    {
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "thumb-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprint"] = "fp-a"
                }
            }
        });

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
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-reuse.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "thumb-reuse-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprint"] = "fp-reuse-a"
                }
            }
        });

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
        using var scope = new AppDataScope();
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
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-metadata.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "thumb-meta-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprint"] = "fp-meta-a"
                }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
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
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-source-legacy.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "thumb-legacy-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprint"] = "fp-legacy-a"
                }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
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
        using var scope = new AppDataScope();
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
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "duration-1",
                    ["mediaType"] = 0,
                    ["fullPath"] = Path.Combine(scope.RootPath, "missing-duration.mp4"),
                    ["duration"] = "00:00:03"
                }
            }
        });

        var state = new ServerStateService();
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var settingsLogger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15,
            ForceRescanDuration = true,
            ForceRescanLoudness = false
        };
        var coreSettings = new CoreSettingsService(settingsLogger, options, scope.RootPath);
        var service = new RefreshPipelineService(state, logger, coreSettings, scope.RootPath);

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
        using var scope = new AppDataScope();
        var brokenMediaPath = Path.Combine(scope.RootPath, "broken-audio.mkv");
        await File.WriteAllTextAsync(brokenMediaPath, "not-a-valid-media-file");
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "broken-1",
                    ["mediaType"] = 0,
                    ["fullPath"] = brokenMediaPath,
                    ["hasAudio"] = false,
                    ["integratedLoudness"] = -20.0,
                    ["peakDb"] = -2.0
                }
            }
        });

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(20));

        var root = await LoadLibraryAsync(scope.LibraryPath);
        var items = Assert.IsType<JsonArray>(root["items"]);
        var item = Assert.Single(items.OfType<JsonObject>());
        Assert.True(item?["hasAudio"]?.GetValue<bool>());
        Assert.Null(item?["integratedLoudness"]);
        Assert.Null(item?["peakDb"]);
        Assert.False(string.IsNullOrWhiteSpace(item?["loudnessError"]?.GetValue<string>()));
    }

    [Fact]
    public async Task ManualRun_ShouldScheduleNextAutoRun_FromCompletionTime()
    {
        using var scope = new AppDataScope();
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray()
        });

        var state = new ServerStateService();
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var settingsLogger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 5
        };
        var coreSettings = new CoreSettingsService(settingsLogger, options, scope.RootPath);
        var service = new RefreshPipelineService(state, logger, coreSettings, scope.RootPath);

        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        var nextAutoRunUtc = GetNextAutoRunUtc(service);
        Assert.NotNull(final.CompletedUtc);
        Assert.True(nextAutoRunUtc >= final.CompletedUtc.Value.AddMinutes(4));
    }

    [Fact]
    public async Task SourceRefresh_ShouldReconcileMovedFile_ByFingerprintWithoutAddRemove()
    {
        using var scope = new AppDataScope();
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
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = sourceId,
                    ["rootPath"] = sourceRoot,
                    ["isEnabled"] = true
                }
            },
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "item-1",
                    ["sourceId"] = sourceId,
                    ["fullPath"] = oldPath,
                    ["relativePath"] = oldRelative,
                    ["fileName"] = "clip.mp4",
                    ["mediaType"] = 0,
                    ["fingerprint"] = fingerprint,
                    ["fingerprintAlgorithm"] = "SHA-256",
                    ["fingerprintVersion"] = 1,
                    ["fingerprintStatus"] = 1,
                    ["fileSizeBytes"] = fileInfo.Length,
                    ["lastWriteTimeUtc"] = fileInfo.LastWriteTimeUtc
                }
            }
        });

        var newPath = Path.Combine(newDir, "clip.mp4");
        File.Move(oldPath, newPath);

        var state = new ServerStateService();
        var service = CreateService(state, scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        var final = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        var root = await LoadLibraryAsync(scope.LibraryPath);
        var items = Assert.IsType<JsonArray>(root["items"]);
        var itemList = items.OfType<JsonObject>().ToList();
        var only = Assert.Single(itemList);
        Assert.Equal("item-1", only["id"]?.GetValue<string>());
        Assert.Equal(newPath, only["fullPath"]?.GetValue<string>());

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
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "fingerprint-pending.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "fp-pending-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprintStatus"] = "Pending"
                }
            }
        });

        var service = CreateService(new ServerStateService(), scope.RootPath);
        await service.RunFingerprintStageAsync(CancellationToken.None);

        var root = await LoadLibraryAsync(scope.LibraryPath);
        var items = root["items"] as JsonArray;
        Assert.NotNull(items);
        var item = Assert.Single(items!.OfType<JsonObject>());
        Assert.Equal(1, item["fingerprintStatus"]?.GetValue<int>());
        var fp = item["fingerprint"]?.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(fp));
        Assert.Equal(ComputeSha256(mediaPath), fp, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Refresh_PersistsStageColumnsWithoutBuildingTheCatalogDocument()
    {
        using var scope = new AppDataScope();
        var sourceDir = Path.Combine(scope.RootPath, "media");
        Directory.CreateDirectory(sourceDir);
        var keptPath = Path.Combine(sourceDir, "kept.mp4");
        var addedPath = Path.Combine(sourceDir, "added.mp4");
        var missingPath = Path.Combine(sourceDir, "missing.mp4");
        await GenerateTinyVideoAsync(keptPath);
        await GenerateTinyVideoAsync(addedPath);

        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "src-media",
                    ["rootPath"] = sourceDir,
                    ["isEnabled"] = true
                }
            },
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "kept-1",
                    ["sourceId"] = "src-media",
                    ["fullPath"] = keptPath,
                    ["relativePath"] = "kept.mp4",
                    ["fileName"] = "kept.mp4",
                    ["mediaType"] = 0,
                    ["isFavorite"] = true,
                    ["fingerprintStatus"] = 0,
                    ["tags"] = new JsonArray("Keep")
                },
                new JsonObject
                {
                    ["id"] = "missing-1",
                    ["sourceId"] = "src-media",
                    ["fullPath"] = missingPath,
                    ["relativePath"] = "missing.mp4",
                    ["fileName"] = "missing.mp4",
                    ["mediaType"] = 0
                }
            },
            ["tags"] = new JsonArray(),
            ["categories"] = new JsonArray()
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
        var builds = host.Session.DocumentBuilds;
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(90));
        Assert.Null(completed.LastError);
        Assert.Equal(builds, host.Session.DocumentBuilds);

        var root = host.Session.BuildDocument();
        var items = Assert.IsType<JsonArray>(root["items"]).OfType<JsonObject>().ToList();
        Assert.Equal(2, items.Count);
        Assert.DoesNotContain(items, item => item["id"]?.GetValue<string>() == "missing-1");
        var kept = Assert.Single(items, item => item["id"]?.GetValue<string>() == "kept-1");
        var added = Assert.Single(items, item => item["fullPath"]?.GetValue<string>() == addedPath);
        Assert.True(kept["isFavorite"]?.GetValue<bool>());
        Assert.Contains(kept["tags"]!.AsArray().Select(tag => tag!.GetValue<string>()), tag => tag == "Keep");
        AssertStoredMediaColumns(kept);
        AssertStoredMediaColumns(added);
        Assert.Contains("1 removed", completed.Stages.Single(stage => stage.Stage == "sourceRefresh").Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("1 added", completed.Stages.Single(stage => stage.Stage == "sourceRefresh").Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task FingerprintStage_PublishesCheckProgressBeforeHashing()
    {
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "ready.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "ready-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprint"] = "abc",
                    ["fingerprintStatus"] = 1
                },
                new JsonObject
                {
                    ["id"] = "missing-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = Path.Combine(scope.RootPath, "missing.png"),
                    ["fingerprintStatus"] = 0
                }
            }
        });

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
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "hold.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "hold-1",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprintStatus"] = 0
                }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
        var builds = host.Session.DocumentBuilds;
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldNextFingerprintWrite(hold.Task);
        Assert.True(service.TryStartManual().Accepted);
        await service.FingerprintWriteEntered.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.True(host.Session.SetFavorite("hold-1", true));
        Assert.True(host.Session.AddItemTags("hold-1", ["Night"]));
        hold.TrySetResult();

        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(20));
        Assert.Equal(builds, host.Session.DocumentBuilds);
        var state = host.Session.ReadItemState("hold-1");
        Assert.NotNull(state);
        Assert.True(state!.IsFavorite);
        var item = Assert.Single(host.Session.BuildDocument()["items"]!.AsArray().OfType<JsonObject>());
        Assert.Equal(1, item["fingerprintStatus"]?.GetValue<int>());
        Assert.False(string.IsNullOrWhiteSpace(item["fingerprint"]?.GetValue<string>()));
        Assert.Contains(item["tags"]!.AsArray().Select(tag => tag!.GetValue<string>()), tag => tag == "Night");
    }

    [Fact]
    public async Task ThumbnailStage_ReusesMatchingRevisionWithoutTheSourceFile()
    {
        using var scope = new AppDataScope();
        var missingSource = Path.Combine(scope.RootPath, "gone.png");
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "thumb-match",
                    ["mediaType"] = 1,
                    ["fullPath"] = missingSource,
                    ["fingerprint"] = "fp-match",
                    ["fileSizeBytes"] = 42,
                    ["lastWriteTimeUtc"] = "2024-05-06T07:08:09.0000000Z"
                }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
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
        var builds = host.Session.DocumentBuilds;
        await service.RunThumbnailStageAsync(CancellationToken.None);

        Assert.Equal(builds, host.Session.DocumentBuilds);
        Assert.False(File.Exists(missingSource));
        Assert.Equal(before, File.GetLastWriteTimeUtc(thumbPath));
        var stage = service.GetStatus().Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.Contains("1 reused", stage.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("0 missing source", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_GeneratesWhenJpegIsMissing()
    {
        using var scope = new AppDataScope();
        var mediaPath = Path.Combine(scope.RootPath, "thumb-missing-jpeg.png");
        await WriteTinyPngAsync(mediaPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "thumb-missing-jpeg",
                    ["mediaType"] = 1,
                    ["fullPath"] = mediaPath,
                    ["fingerprint"] = "fp-jpeg",
                    ["fileSizeBytes"] = 42,
                    ["lastWriteTimeUtc"] = "2024-05-06T07:08:09.0000000Z"
                }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
        var stored = Assert.Single(host.Session.ReadRefreshItems());
        var revision = $"{stored.Fingerprint}|{stored.FileSizeBytes}|{stored.LastWriteTimeUtc!.Value.ToString("O", CultureInfo.InvariantCulture)}";
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        Directory.CreateDirectory(Path.Combine(scope.RootPath, "thumbnails"));
        Assert.True(host.Session.SetThumbnail("thumb-missing-jpeg", revision, 1, 1));
        var builds = host.Session.DocumentBuilds;
        await service.RunThumbnailStageAsync(CancellationToken.None);

        Assert.Equal(builds, host.Session.DocumentBuilds);
        Assert.True(File.Exists(service.GetThumbnailPath("thumb-missing-jpeg")));
        var stage = service.GetStatus().Stages.Single(item => item.Stage == "thumbnailGeneration");
        Assert.Contains("1 generated", stage.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ThumbnailStage_RemovesDeletedItemThumbnail_AndKeepsLibraryThumbnails()
    {
        using var scope = new AppDataScope();
        var sourceDir = Path.Combine(scope.RootPath, "thumbs");
        Directory.CreateDirectory(sourceDir);
        var keptPath = Path.Combine(sourceDir, "kept.png");
        var missingPath = Path.Combine(sourceDir, "missing.png");
        await WriteTinyPngAsync(keptPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "src-thumbs",
                    ["rootPath"] = sourceDir,
                    ["isEnabled"] = true
                }
            },
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "kept-thumb",
                    ["sourceId"] = "src-thumbs",
                    ["fullPath"] = keptPath,
                    ["relativePath"] = "kept.png",
                    ["fileName"] = "kept.png",
                    ["mediaType"] = 1,
                    ["fingerprint"] = "fp-kept",
                    ["fingerprintStatus"] = 1
                },
                new JsonObject
                {
                    ["id"] = "gone-thumb",
                    ["sourceId"] = "src-thumbs",
                    ["fullPath"] = missingPath,
                    ["relativePath"] = "missing.png",
                    ["fileName"] = "missing.png",
                    ["mediaType"] = 1
                }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
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
        var builds = host.Session.DocumentBuilds;
        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(30));

        Assert.Equal(builds, host.Session.DocumentBuilds);
        Assert.Null(completed.LastError);
        var items = host.Session.BuildDocument()["items"]!.AsArray().OfType<JsonObject>().ToList();
        Assert.Single(items);
        Assert.Equal("kept-thumb", items[0]["id"]?.GetValue<string>());
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
        using var scope = new AppDataScope();
        var firstPath = Path.Combine(scope.RootPath, "hold-a.png");
        var secondPath = Path.Combine(scope.RootPath, "hold-b.png");
        await WriteTinyPngAsync(firstPath);
        await WriteTinyPngAsync(secondPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject { ["id"] = "hold-a", ["mediaType"] = 1, ["fullPath"] = firstPath },
                new JsonObject { ["id"] = "hold-b", ["mediaType"] = 1, ["fullPath"] = secondPath }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
        var service = CreateService(new ServerStateService(), scope.RootPath, host);
        var hold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.HoldNextThumbnailWrite(hold.Task);
        var run = service.RunThumbnailStageAsync(CancellationToken.None);
        await service.ThumbnailWriteEntered.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.True(host.Session.SetFavorite("hold-a", true));
        Assert.True(host.Session.AddItemTags("hold-a", ["Night"]));
        Assert.True(host.Session.SetPlayback("hold-a", 3, new DateTime(2024, 5, 6, 7, 8, 9, DateTimeKind.Utc)));
        Assert.True(host.Session.SetBlacklist("hold-b", true));
        hold.TrySetResult();
        await run.WaitAsync(TimeSpan.FromSeconds(15));

        var first = host.Session.ReadItemState("hold-a");
        Assert.NotNull(first);
        Assert.True(first!.IsFavorite);
        Assert.False(first.IsBlacklisted);
        Assert.Equal(3, first.PlayCount);
        var document = host.Session.BuildDocument()["items"]!.AsArray().OfType<JsonObject>().ToList();
        var holdA = Assert.Single(document, item => item["id"]!.GetValue<string>() == "hold-a");
        Assert.Contains(holdA["tags"]!.AsArray().Select(tag => tag!.GetValue<string>()), tag => tag == "Night");
        var second = host.Session.ReadItemState("hold-b");
        Assert.NotNull(second);
        Assert.True(second!.IsBlacklisted);
        Assert.All(host.Session.ReadRefreshItems(), item => Assert.True(item.ThumbnailWidth is > 0));
    }

    [Fact]
    public async Task ThumbnailStage_CancelKeepsColumnsAlreadyWritten_AndLeavesRemainingCleanup()
    {
        using var scope = new AppDataScope();
        var firstPath = Path.Combine(scope.RootPath, "cancel-a.png");
        var secondPath = Path.Combine(scope.RootPath, "cancel-b.png");
        await WriteTinyPngAsync(firstPath);
        await WriteTinyPngAsync(secondPath);
        await SeedLibraryAsync(scope.LibraryPath, new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray
            {
                new JsonObject { ["id"] = "cancel-a", ["mediaType"] = 1, ["fullPath"] = firstPath },
                new JsonObject { ["id"] = "cancel-b", ["mediaType"] = 1, ["fullPath"] = secondPath }
            }
        });

        var host = LibraryCatalogHost.Open(scope.RootPath, Path.Combine(scope.RootPath, "thumbnails"));
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

    private static void AssertStoredMediaColumns(JsonObject item)
    {
        Assert.Equal(1, item["fingerprintStatus"]?.GetValue<int>());
        Assert.False(string.IsNullOrWhiteSpace(item["fingerprint"]?.GetValue<string>()));
        Assert.False(string.IsNullOrWhiteSpace(item["duration"]?.GetValue<string>()));
        Assert.NotEqual("00:00:00", item["duration"]?.GetValue<string>());
        var hasAudio = item["hasAudio"]?.GetValue<bool?>();
        var loudnessError = item["loudnessError"]?.GetValue<string>();
        Assert.True(hasAudio == true || !string.IsNullOrWhiteSpace(loudnessError));
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
        var settings = service.GetSettings();
        Assert.True(settings.ForceRescanDuration);
        Assert.True(settings.ForceRescanLoudness);
    }

    private static RefreshPipelineService CreateService(ServerStateService state, string appDataPathOverride, LibraryCatalogHost? catalog = null)
    {
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var settingsLogger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15
        };
        var coreSettings = new CoreSettingsService(settingsLogger, options, appDataPathOverride);
        return new RefreshPipelineService(state, logger, coreSettings, appDataPathOverride, catalog);
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

    private static async Task SeedLibraryAsync(string path, JsonObject root)
    {
        var dir = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(dir);
        await File.WriteAllTextAsync(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static async Task<JsonObject> LoadLibraryAsync(string path)
    {
        if (string.Equals(Path.GetFileName(path), "library.json", StringComparison.OrdinalIgnoreCase))
        {
            var directory = Path.GetDirectoryName(path)!;
            var opened = CatalogOpen.Open(directory);
            Assert.NotNull(opened.Session);
            return opened.Session!.BuildDocument();
        }

        await using var stream = File.OpenRead(path);
        return (await JsonNode.ParseAsync(stream) as JsonObject) ?? new JsonObject();
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

    private sealed class AppDataScope : IDisposable
    {
        private readonly string? _previousAppData;
        public string RootPath { get; }
        public string LibraryPath => Path.Combine(RootPath, "library.json");

        public AppDataScope()
        {
            _previousAppData = Environment.GetEnvironmentVariable("APPDATA");
            RootPath = Path.Combine(Path.GetTempPath(), "ReelRoulette.Tests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(RootPath);
            Environment.SetEnvironmentVariable("APPDATA", RootPath);
        }

        public void Dispose()
        {
            Environment.SetEnvironmentVariable("APPDATA", _previousAppData);
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
