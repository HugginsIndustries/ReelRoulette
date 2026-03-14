using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
using System.Reflection;
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
        Assert.Equal(["sourceRefresh", "durationScan", "loudnessScan", "thumbnailGeneration"], final.Stages.Select(s => s.Stage).ToArray());
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
                    ["fingerprint"] = "fp-b"
                }
            }
        });

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

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var indexPath = Path.Combine(scope.RootPath, "thumbnails", "index.json");
        var indexRoot = await LoadLibraryAsync(indexPath);
        var entry = Assert.IsType<JsonObject>(indexRoot["thumb-meta-1"]);
        Assert.Equal("fp-meta-a", entry["revision"]?.GetValue<string>()?.Split('|')[0]);
        Assert.True((entry["width"]?.GetValue<int?>() ?? 0) > 0);
        Assert.True((entry["height"]?.GetValue<int?>() ?? 0) > 0);
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

        var service = CreateService(new ServerStateService(), scope.RootPath);
        Assert.True(service.TryStartManual().Accepted);
        await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));

        var indexPath = Path.Combine(scope.RootPath, "thumbnails", "index.json");
        await SeedLibraryAsync(indexPath, new JsonObject
        {
            ["thumb-legacy-1"] = "fp-legacy-a"
        });

        Assert.True(service.TryStartManual().Accepted);
        var completed = await WaitForCompletionAsync(service, TimeSpan.FromSeconds(10));
        var stage = completed.Stages.Single(s => s.Stage == "thumbnailGeneration");
        Assert.Contains("metadata updated", stage.Message, StringComparison.OrdinalIgnoreCase);

        var indexRoot = await LoadLibraryAsync(indexPath);
        var entry = Assert.IsType<JsonObject>(indexRoot["thumb-legacy-1"]);
        Assert.True((entry["width"]?.GetValue<int?>() ?? 0) > 0);
        Assert.True((entry["height"]?.GetValue<int?>() ?? 0) > 0);
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

    private static RefreshPipelineService CreateService(ServerStateService state, string appDataPathOverride)
    {
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshPipelineService>();
        var settingsLogger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var options = new ServerRuntimeOptions
        {
            AutoRefreshEnabled = true,
            AutoRefreshIntervalMinutes = 15
        };
        var coreSettings = new CoreSettingsService(settingsLogger, options, appDataPathOverride);
        return new RefreshPipelineService(state, logger, coreSettings, appDataPathOverride);
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

    private static async Task<ReelRoulette.Server.Contracts.RefreshStatusSnapshot> WaitForCompletionAsync(
        RefreshPipelineService service,
        TimeSpan timeout)
    {
        var started = DateTime.UtcNow;
        while (DateTime.UtcNow - started < timeout)
        {
            var status = service.GetStatus();
            if (!status.IsRunning && status.CompletedUtc.HasValue)
            {
                return status;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException("Refresh pipeline did not complete in time.");
    }

    private static async Task SeedLibraryAsync(string path, JsonObject root)
    {
        var dir = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(dir);
        await File.WriteAllTextAsync(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static async Task<JsonObject> LoadLibraryAsync(string path)
    {
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
