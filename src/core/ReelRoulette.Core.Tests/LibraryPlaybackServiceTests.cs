using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryPlaybackServiceTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-library-playback-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void GetPresets_GivesEachPresetsOwnId()
    {
        Directory.CreateDirectory(_tempDir);
        var service = CreateService();
        IReadOnlyList<StoredPreset> presets =
        [
            new StoredPreset { Id = "id-1", Name = "All Media", FilterState = ParseJson("{}") },
            new StoredPreset { Id = "id-2", Name = "Favorites", FilterState = ParseJson("{}") }
        ];

        var responses = service.GetPresets(presets);

        Assert.Equal([("id-1", "All Media"), ("id-2", "Favorites")], responses.Select(response => (response.Id, response.Name)));
    }

    [Fact]
    public void TrySelectRandom_ShouldReturnRealLibraryItemAndMediaTokenUrl()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02, 0x03]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("item-1", mediaPath)
                {
                    FileName = "clip.mp4",
                    SourceId = "s1",
                    IsFavorite = true,
                    Duration = TimeSpan.FromSeconds(12),
                    Tags = ["tag-a"]
                }
            ]);

        var service = CreateService();
        IReadOnlyList<StoredPreset> presets =
        [
            new StoredPreset { Name = "All Media", FilterState = ParseJson("{}") }
        ];
        var request = new RandomRequest
        {
            PresetId = "All Media",
            FilterState = ParseJson("{}"),
            IncludeVideos = true,
            IncludePhotos = false
        };

        var ok = service.TrySelectRandom(request, presets, out var response, out var statusCode, out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.NotNull(response);
        Assert.Equal(mediaPath, response!.Id);
        Assert.Equal("clip.mp4", response.DisplayName);
        Assert.Equal("video", response.MediaType);
        Assert.Equal(12, response.DurationSeconds);
        Assert.StartsWith("/api/media/", response.MediaUrl, StringComparison.Ordinal);
    }

    [Fact]
    public void TrySelectRandom_ShouldUseFilterStateWhenPresetMissing()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "clip-filter.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02, 0x03]);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("item-2", mediaPath)
                {
                    FileName = "clip-filter.mp4",
                    SourceId = "s1",
                    IsFavorite = true
                }
            ]);

        var service = CreateService();
        var ok = service.TrySelectRandom(new RandomRequest
        {
            PresetId = string.Empty,
            FilterState = ParseJson("{\"favoritesMode\":\"only\"}")
        }, [], out var response, out var statusCode, out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.NotNull(response);
        Assert.Equal(mediaPath, response!.Id);
    }

    [Fact]
    public void TrySelectRandom_ResolvesPresetIdByIdWhenNoFilterStateIsSent()
    {
        Directory.CreateDirectory(_tempDir);
        var favoritePath = Path.Combine(_tempDir, "favorite.mp4");
        var otherPath = Path.Combine(_tempDir, "other.mp4");
        File.WriteAllBytes(favoritePath, [0x01, 0x02]);
        File.WriteAllBytes(otherPath, [0x01, 0x02]);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("item-fav", favoritePath)
                {
                    FileName = "favorite.mp4",
                    SourceId = "s1",
                    IsFavorite = true
                },
                new SeedItem("item-other", otherPath)
                {
                    FileName = "other.mp4",
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        IReadOnlyList<StoredPreset> presets =
        [
            new StoredPreset { Id = "preset-1", Name = "Favorites", FilterState = ParseJson("{\"favoritesMode\":\"only\"}") }
        ];

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var ok = service.TrySelectRandom(new RandomRequest { PresetId = "preset-1" }, presets, out var response, out var statusCode, out var error);
            Assert.True(ok, error);
            Assert.Equal(StatusCodes.Status200OK, statusCode);
            Assert.Equal(favoritePath, response!.Id);
        }

        // A preset's name, or its id in another case, finds no preset.
        foreach (var presetId in new[] { "Favorites", "PRESET-1", "Unknown" })
        {
            var missing = service.TrySelectRandom(new RandomRequest { PresetId = presetId }, presets, out _, out var missingStatus, out var missingError);
            Assert.False(missing);
            Assert.Equal(StatusCodes.Status404NotFound, missingStatus);
            Assert.Equal($"Preset '{presetId}' not found.", missingError);
        }
    }

    [Fact]
    public void TrySelectRandom_ShouldHonorMediaTypeFilterVideosOnly()
    {
        Directory.CreateDirectory(_tempDir);
        var videoPath = Path.Combine(_tempDir, "video-a.mp4");
        var photoPath = Path.Combine(_tempDir, "photo-a.jpg");
        File.WriteAllBytes(videoPath, [0x01, 0x02]);
        File.WriteAllBytes(photoPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("v1", videoPath)
                {
                    FileName = "video-a.mp4",
                    SourceId = "s1"
                },
                new SeedItem("p1", photoPath)
                {
                    FileName = "photo-a.jpg",
                    MediaType = 1,
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TrySelectRandom(
            new RandomRequest
            {
                PresetId = string.Empty,
                FilterState = ParseJson("{\"mediaTypeFilter\":\"VideosOnly\"}"),
                IncludeVideos = true,
                IncludePhotos = true
            },
            [],
            out var response,
            out var statusCode,
            out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.NotNull(response);
        Assert.Equal("video", response!.MediaType);
        Assert.Equal(videoPath, response.Id);
    }

    [Fact]
    public void TrySelectRandom_ShouldHonorOnlyNeverPlayed()
    {
        Directory.CreateDirectory(_tempDir);
        var neverPlayedPath = Path.Combine(_tempDir, "never-played.mp4");
        var playedPath = Path.Combine(_tempDir, "played.mp4");
        File.WriteAllBytes(neverPlayedPath, [0x01, 0x02]);
        File.WriteAllBytes(playedPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("n1", neverPlayedPath)
                {
                    FileName = "never-played.mp4",
                    SourceId = "s1"
                },
                new SeedItem("p1", playedPath)
                {
                    FileName = "played.mp4",
                    PlayCount = 4,
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TrySelectRandom(
            new RandomRequest
            {
                PresetId = string.Empty,
                FilterState = ParseJson("{\"onlyNeverPlayed\":true}")
            },
            [],
            out var response,
            out var statusCode,
            out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.NotNull(response);
        Assert.Equal(neverPlayedPath, response!.Id);
    }

    [Fact]
    public void TrySelectRandom_ShouldHonorAudioAndKnownLoudnessFilters()
    {
        Directory.CreateDirectory(_tempDir);
        var withAudioPath = Path.Combine(_tempDir, "with-audio.mp4");
        var withoutAudioPath = Path.Combine(_tempDir, "without-audio.mp4");
        File.WriteAllBytes(withAudioPath, [0x01, 0x02]);
        File.WriteAllBytes(withoutAudioPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("a1", withAudioPath)
                {
                    FileName = "with-audio.mp4",
                    HasAudio = true,
                    IntegratedLoudness = -14.2,
                    SourceId = "s1"
                },
                new SeedItem("a2", withoutAudioPath)
                {
                    FileName = "without-audio.mp4",
                    HasAudio = false,
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TrySelectRandom(
            new RandomRequest
            {
                PresetId = string.Empty,
                FilterState = ParseJson("{\"audioFilter\":\"WithAudioOnly\",\"onlyKnownLoudness\":true}")
            },
            [],
            out var response,
            out var statusCode,
            out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.NotNull(response);
        Assert.Equal(withAudioPath, response!.Id);
    }

    [Fact]
    public void TrySelectRandom_CarriesTheItemsMeasuredLoudnessAndPeak()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "measured.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("m1", mediaPath)
                {
                    FileName = "measured.mp4",
                    HasAudio = true,
                    IntegratedLoudness = -23.4,
                    PeakDb = -1.2,
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TrySelectRandom(
            new RandomRequest { PresetId = string.Empty, FilterState = ParseJson("{}") },
            [],
            out var response,
            out _,
            out _);

        Assert.True(ok);
        Assert.NotNull(response);
        Assert.Equal(-23.4, response!.IntegratedLoudness);
        Assert.Equal(-1.2, response.PeakDb);
    }

    [Fact]
    public void TrySelectRandom_CarriesNoLoudnessOrPeak_ForAnItemTheScanHasNotMeasured()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "unmeasured.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items: [new SeedItem("u1", mediaPath) { FileName = "unmeasured.mp4", SourceId = "s1" }]);

        var service = CreateService();
        var ok = service.TrySelectRandom(
            new RandomRequest { PresetId = string.Empty, FilterState = ParseJson("{}") },
            [],
            out var response,
            out _,
            out _);

        Assert.True(ok);
        Assert.NotNull(response);
        Assert.Null(response!.IntegratedLoudness);
        Assert.Null(response.PeakDb);
    }

    [Fact]
    public void BuildRandomizationScopeKey_ShouldIsolateSessionsForSameClient()
    {
        var a = LibraryPlaybackService.BuildRandomizationScopeKey("client-1", "session-a");
        var b = LibraryPlaybackService.BuildRandomizationScopeKey("client-1", "session-b");
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void BuildRandomizationScopeKey_ShouldUseClientOnlyWhenSessionMissing()
    {
        var withBlankSession = LibraryPlaybackService.BuildRandomizationScopeKey("client-1", "   ");
        var withNullSession = LibraryPlaybackService.BuildRandomizationScopeKey("client-1", null);
        Assert.Equal(withNullSession, withBlankSession);
    }

    [Fact]
    public void BuildRandomizationScopeKey_ShouldUseAnonymousClientWhenMissing()
    {
        var scoped = LibraryPlaybackService.BuildRandomizationScopeKey(null, "tab-session");
        Assert.StartsWith("web-anonymous", scoped, StringComparison.Ordinal);
        Assert.Contains("\u001f", scoped, StringComparison.Ordinal);
    }

    [Fact]
    public void TrySelectRandom_ShouldReturnEmptyResultWhenOnlyBlacklistedItemsMatchFilter()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "blocked.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("blk-1", mediaPath)
                {
                    FileName = "blocked.mp4",
                    IsBlacklisted = true,
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TrySelectRandom(
            new RandomRequest
            {
                PresetId = string.Empty,
                FilterState = ParseJson("{}"),
                IncludeVideos = true,
                IncludePhotos = true
            },
            [],
            out var response,
            out var statusCode,
            out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.Null(response);
    }

    [Fact]
    public void TryPlayItem_ShouldSucceed_ForPlayableItemByStableId()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "play.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("stable-id-1", mediaPath)
                {
                    FileName = "play.mp4",
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TryPlayItem("stable-id-1", false, out var response, out var statusCode, out var error, out var code);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.Null(code);
        Assert.NotNull(response);
        Assert.Equal(mediaPath, response!.Id);
        Assert.StartsWith("/api/media/", response.MediaUrl, StringComparison.Ordinal);
    }

    [Fact]
    public void TryPlayItem_CarriesTheItemsMeasuredLoudnessAndPeak_AndNeitherForAnUnmeasuredItem()
    {
        Directory.CreateDirectory(_tempDir);
        var measuredPath = Path.Combine(_tempDir, "measured.mp4");
        var unmeasuredPath = Path.Combine(_tempDir, "unmeasured.mp4");
        File.WriteAllBytes(measuredPath, [0x01, 0x02]);
        File.WriteAllBytes(unmeasuredPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("m1", measuredPath)
                {
                    FileName = "measured.mp4",
                    HasAudio = true,
                    IntegratedLoudness = -23.4,
                    PeakDb = -1.2,
                    SourceId = "s1"
                },
                new SeedItem("u1", unmeasuredPath) { FileName = "unmeasured.mp4", SourceId = "s1" }
            ]);

        var service = CreateService();
        Assert.True(service.TryPlayItem("m1", false, out var measured, out _, out _, out _));
        Assert.True(service.TryPlayItem("u1", false, out var unmeasured, out _, out _, out _));

        Assert.Equal(-23.4, measured!.IntegratedLoudness);
        Assert.Equal(-1.2, measured.PeakDb);
        Assert.Null(unmeasured!.IntegratedLoudness);
        Assert.Null(unmeasured.PeakDb);
    }

    [Theory]
    [InlineData(7, 3.5)]
    [InlineData(10, 5.0)]
    [InlineData(null, null)]
    public void TrySelectRandomAndTryPlayItem_CarryTheItemsRatingInStars(int? ratingHalfStars, double? expectedStars)
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "rated.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items: [new SeedItem("r1", mediaPath) { FileName = "rated.mp4", RatingHalfStars = ratingHalfStars, SourceId = "s1" }]);

        var service = CreateService();
        Assert.True(service.TrySelectRandom(
            new RandomRequest { PresetId = string.Empty, FilterState = ParseJson("{}") },
            [],
            out var picked,
            out _,
            out _));
        Assert.True(service.TryPlayItem("r1", false, out var played, out _, out _, out _));

        Assert.Equal(expectedStars, picked!.Rating);
        Assert.Equal(expectedStars, played!.Rating);
    }

    [Fact]
    public void TryPlayItem_ShouldSucceed_WhenItemIsBlacklisted()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "blisted.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("bl-1", mediaPath)
                {
                    FileName = "blisted.mp4",
                    SourceId = "s1",
                    IsBlacklisted = true
                }
            ]);

        var service = CreateService();
        var ok = service.TryPlayItem("bl-1", false, out var response, out var statusCode, out _, out _);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.NotNull(response);
        Assert.True(response!.IsBlacklisted);
    }

    [Fact]
    public void TryPlayItem_ShouldReturn404_WhenIdUnknown()
    {
        Directory.CreateDirectory(_tempDir);
        CatalogSeed.Write(_tempDir);

        var service = CreateService();
        var ok = service.TryPlayItem("missing-id", false, out _, out var statusCode, out var error, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status404NotFound, statusCode);
        Assert.Equal("Item not found", error);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorNotFound, code);
    }

    [Fact]
    public void TryPlayItem_ShouldReturn404_WhenFileMissingOnDisk()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "nope.mp4");

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("x-1", mediaPath)
                {
                    FileName = "nope.mp4",
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TryPlayItem("x-1", false, out _, out var statusCode, out var error, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status404NotFound, statusCode);
        Assert.Equal("Media file not found", error);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorMediaMissing, code);
    }

    // A file the server can see but not open, as on a stalled drive or share, is not missing. Holding it open with no
    // sharing makes the open fail while the file still exists.
    [Fact]
    public void TryPlayItem_ShouldReturn503_AndLogOneLineWithoutThePath_WhenTheFileCantBeRead()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "secret-held.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("held-1", mediaPath)
                {
                    FileName = "secret-held.mp4",
                    SourceId = "s1"
                }
            ]);

        var logDirectory = Path.Combine(_tempDir, "logs");
        var service = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            CatalogOpen.Host(_tempDir),
            new ServerLogService(logDirectory));

        bool ok;
        int statusCode;
        string? error;
        string? code;
        var held = new FileStream(mediaPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        try
        {
            Assert.True(File.Exists(mediaPath));
            ok = service.TryPlayItem("held-1", false, out _, out statusCode, out error, out code);
        }
        finally
        {
            held.Dispose();
        }

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, statusCode);
        Assert.Equal("Media file can't be read", error);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorMediaUnreadable, code);
        var line = Assert.Single(File.ReadAllLines(Path.Combine(logDirectory, "last.log")));
        Assert.Matches(@"\[server\] \[warn\] Play media read failed item=held-1 error=\w+\.$", line);
        Assert.DoesNotContain("secret", line, StringComparison.Ordinal);

        // Once the file can be read again, it plays.
        Assert.True(service.TryPlayItem("held-1", false, out _, out _, out _, out _));
    }

    [Fact]
    public void TryPlayItem_ShouldReturn404_WhenForceMediaMissing()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "present.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("fm-1", mediaPath)
                {
                    FileName = "present.mp4",
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TryPlayItem("fm-1", forceMediaMissing: true, out _, out var statusCode, out _, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status404NotFound, statusCode);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorMediaMissing, code);
    }

    [Fact]
    public void TryPlayItem_ShouldReturn409_WhenSourceDisabled()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "off.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir, IsEnabled: false)],
            items:
            [
                new SeedItem("off-1", mediaPath)
                {
                    FileName = "off.mp4",
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TryPlayItem("off-1", false, out _, out var statusCode, out var error, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status409Conflict, statusCode);
        Assert.Contains("disabled", error, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorSourceDisabled, code);
    }

    [Fact]
    public void TryPlayItem_ShouldReturn415_WhenExtensionNotPlayable()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "weird.xyz");
        File.WriteAllBytes(mediaPath, [0x01]);

        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("badext-1", mediaPath)
                {
                    FileName = "weird.xyz",
                    SourceId = "s1"
                }
            ]);

        var service = CreateService();
        var ok = service.TryPlayItem("badext-1", false, out _, out var statusCode, out _, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status415UnsupportedMediaType, statusCode);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorUnsupportedMedia, code);
    }

    [Fact]
    public void TrySelectRandom_AfterFavoritePlaybackAndTagChange_DoesNotBuildTheCatalogDocument()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "kept.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("s1", _tempDir, "Media", true);
        host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = "kept",
            SourceId = "s1",
            FullPath = mediaPath,
            RelativePath = "kept.mp4",
            FileName = "kept.mp4"
        });
        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host);
        var operations = new LibraryOperationsService(
            host,
            NullLogger<LibraryOperationsService>.Instance,
            _tempDir);
        var request = new RandomRequest
        {
            FilterState = ParseJson("{}"),
            IncludeVideos = true,
            IncludePhotos = true
        };

        Assert.True(playback.TrySelectRandom(request, [], out var first, out var statusCode, out var error));
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.Equal(mediaPath, first!.Id);

        Assert.NotNull(operations.SetFavorite("kept", true));
        Assert.True(operations.RecordPlayback("kept").Found);
        Assert.True(operations.ApplyItemTags(new ApplyItemTagsRequest
        {
            ItemIds = ["kept"],
            AddTags = ["Later"]
        }));
        Assert.True(playback.TrySelectRandom(request, [], out var second, out _, out _));
        Assert.Equal(mediaPath, second!.Id);

        Assert.True(playback.TryPlayItem("kept", false, out var played, out var playStatus, out var playError, out var code));
        Assert.Equal(StatusCodes.Status200OK, playStatus);
        Assert.Null(playError);
        Assert.Null(code);
        Assert.Equal(mediaPath, played!.Id);
        Assert.StartsWith("/api/media/", played.MediaUrl, StringComparison.Ordinal);
        Assert.True(playback.TryResolveMediaPath(played.MediaUrl["/api/media/".Length..], out var byToken));
        Assert.Equal(mediaPath, byToken);
        Assert.False(playback.TryResolveMediaPath("kept", out _));
        Assert.False(playback.TryResolveMediaPath(mediaPath, out _));
    }

    [Fact]
    public void TrySelectRandom_WeightedRandom_PrefersNeverPlayedItemInTheEligibleSet()
    {
        Directory.CreateDirectory(_tempDir);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("on", "/media", "On", true);
        host.Session.InsertSource("off", "/other", "Off", false);
        host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = "heavy",
            SourceId = "on",
            FullPath = "/media/heavy.mp4",
            RelativePath = "heavy.mp4",
            FileName = "heavy.mp4",
            PlayCount = 100_000,
            LastPlayedUtc = DateTime.UtcNow
        });
        host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = "light",
            SourceId = "on",
            FullPath = "/media/light.mp4",
            RelativePath = "light.mp4",
            FileName = "light.mp4"
        });
        host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = "blocked",
            SourceId = "on",
            FullPath = "/media/blocked.mp4",
            RelativePath = "blocked.mp4",
            FileName = "blocked.mp4",
            IsBlacklisted = true
        });
        host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = "hidden",
            SourceId = "off",
            FullPath = "/media/hidden.mp4",
            RelativePath = "hidden.mp4",
            FileName = "hidden.mp4"
        });
        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host);
        var listed = host.Session.QueryList(new LibraryListRequest
        {
            Filter = new ReelRoulette.Core.Filtering.FilterStateModel(),
            Limit = 20
        }).Items.Select(item => item.FullPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var lightWins = 0;
        for (var i = 0; i < 40; i++)
        {
            Assert.True(playback.TrySelectRandom(new RandomRequest
            {
                FilterState = ParseJson("{}"),
                RandomizationMode = "WeightedRandom"
            }, [], out var response, out _, out _));
            Assert.NotNull(response);
            Assert.Contains(response!.Id, listed);
            Assert.NotEqual("/media/blocked.mp4", response.Id);
            Assert.NotEqual("/media/hidden.mp4", response.Id);
            if (string.Equals(response.Id, "/media/light.mp4", StringComparison.OrdinalIgnoreCase))
            {
                lightWins++;
            }
        }

        Assert.True(lightWins >= 35, $"Expected the never-played item to win at least 35 of 40 weighted draws, got {lightWins}.");
    }

    [Theory]
    [InlineData("PureRandom")]
    [InlineData("WeightedRandom")]
    [InlineData("SmartShuffle")]
    [InlineData("SpreadMode")]
    [InlineData("WeightedWithSpread")]
    public void TrySelectRandom_EveryMode_PicksEachEligibleItemAndNothingElse(string mode)
    {
        Directory.CreateDirectory(_tempDir);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("on", "/media", "On", true);
        host.Session.InsertSource("off", "/other", "Off", false);
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4", lastPlayed: DateTime.UtcNow.AddDays(-3));
        InsertItem(host, "c", "on", "/media/two/c.mp4");
        InsertItem(host, "blocked", "on", "/media/one/blocked.mp4", blacklisted: true);
        InsertItem(host, "played", "on", "/media/two/played.mp4", playCount: 5);
        InsertItem(host, "photo", "on", "/media/two/photo.jpg", mediaType: 1);
        InsertItem(host, "hidden", "off", "/other/hidden.mp4");
        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host);

        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < 60; i++)
        {
            Assert.True(playback.TrySelectRandom(new RandomRequest
            {
                FilterState = ParseJson("""{"onlyNeverPlayed":true}"""),
                IncludeVideos = true,
                IncludePhotos = false,
                RandomizationMode = mode
            }, [], out var response, out var statusCode, out var error));
            Assert.Equal(StatusCodes.Status200OK, statusCode);
            Assert.Null(error);
            seen.Add(response!.Id);
        }

        Assert.Equal(["/media/one/a.mp4", "/media/one/b.mp4", "/media/two/c.mp4"], seen.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void TrySelectRandom_SmartShuffle_ReturnsTheCurrentPath_AndKeepsItsCycle_AfterPathsChange()
    {
        Directory.CreateDirectory(_tempDir);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("on", "/media", "On", true);
        for (var i = 0; i < 6; i++)
        {
            InsertItem(host, $"clip-{i}", "on", $"/media/clip-{i}.mp4");
        }

        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host);
        var request = new RandomRequest { FilterState = ParseJson("{}"), RandomizationMode = "SmartShuffle" };
        var first = new List<string>();
        for (var i = 0; i < 3; i++)
        {
            Assert.True(playback.TrySelectRandom(request, [], out var response, out _, out _));
            first.Add(Path.GetFileNameWithoutExtension(response!.Id));
        }

        using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = host.Session.DatabasePath,
            Pooling = false
        }.ToString()))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = """
                UPDATE items
                SET full_path = '/moved/' || id || '.mp4', full_path_fold = lower('/moved/' || id || '.mp4');
                """;
            Assert.Equal(6, command.ExecuteNonQuery());
        }

        var rest = new List<string>();
        for (var i = 0; i < 3; i++)
        {
            Assert.True(playback.TrySelectRandom(request, [], out var response, out _, out _));
            Assert.StartsWith("/moved/", response!.Id, StringComparison.Ordinal);
            rest.Add(Path.GetFileNameWithoutExtension(response.Id));
        }

        Assert.Equal(
            Enumerable.Range(0, 6).Select(i => $"clip-{i}").Except(first).Order(StringComparer.Ordinal),
            rest.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void TrySelectRandom_WritesOneLastLogLinePerPick_WithModeEligibleCountAndElapsedTime_AndNoPath()
    {
        Directory.CreateDirectory(_tempDir);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("on", "/media", "On", true);
        InsertItem(host, "a", "on", "/media/secret-a.mp4");
        InsertItem(host, "b", "on", "/media/secret-b.mp4");
        var logDirectory = Path.Combine(_tempDir, "logs");
        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host,
            new ServerLogService(logDirectory));

        Assert.True(playback.TrySelectRandom(new RandomRequest
        {
            FilterState = ParseJson("{}"),
            RandomizationMode = "WeightedRandom"
        }, [], out var picked, out _, out _));
        Assert.NotNull(picked);
        Assert.True(playback.TrySelectRandom(new RandomRequest
        {
            FilterState = ParseJson("{}"),
            IncludeVideos = false,
            IncludePhotos = true
        }, [], out var none, out _, out _));
        Assert.Null(none);

        var lines = File.ReadAllLines(Path.Combine(logDirectory, "last.log"));
        Assert.Equal(2, lines.Length);
        Assert.Matches(@"\[server\] \[info\] Random pick mode=WeightedRandom eligible=2 elapsedMs=\d+\.$", lines[0]);
        Assert.Matches(@"\[server\] \[info\] Random pick mode=SmartShuffle eligible=0 elapsedMs=\d+\.$", lines[1]);
        Assert.DoesNotContain("secret", string.Join('\n', lines), StringComparison.Ordinal);
    }

    [Fact]
    public void TrySelectRandom_ShouldReturn503_WhenLibraryHasNoItems()
    {
        Directory.CreateDirectory(_tempDir);
        var service = CreateService();
        var ok = service.TrySelectRandom(new RandomRequest(), [], out var response, out var statusCode, out var error);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, statusCode);
        Assert.Null(response);
        Assert.Equal("The library is empty.", error);
    }

    [Fact]
    public void TrySelectRandom_ShouldReturnNoItem_WhenVideosAndPhotosAreExcluded()
    {
        Directory.CreateDirectory(_tempDir);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("s1", _tempDir, "Media", true);
        host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = "clip",
            SourceId = "s1",
            FullPath = Path.Combine(_tempDir, "clip.mp4"),
            RelativePath = "clip.mp4",
            FileName = "clip.mp4"
        });
        var service = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host);

        var ok = service.TrySelectRandom(new RandomRequest
        {
            FilterState = ParseJson("{}"),
            IncludeVideos = false,
            IncludePhotos = false
        }, [], out var response, out var statusCode, out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.Null(response);
    }

    [Fact]
    public void TryPlayItem_ShouldReturn400_WhenItemIdBlank()
    {
        Directory.CreateDirectory(_tempDir);
        var service = CreateService();
        var ok = service.TryPlayItem("   ", false, out _, out var statusCode, out _, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status400BadRequest, statusCode);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorInvalidId, code);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private static void InsertItem(
        LibraryCatalogHost host,
        string id,
        string sourceId,
        string fullPath,
        bool blacklisted = false,
        int playCount = 0,
        DateTime? lastPlayed = null,
        int mediaType = 0)
    {
        Assert.True(host.Session.InsertItem(new LibraryCatalogItem
        {
            Id = id,
            SourceId = sourceId,
            FullPath = fullPath,
            RelativePath = fullPath.TrimStart('/'),
            FileName = Path.GetFileName(fullPath),
            IsBlacklisted = blacklisted,
            PlayCount = playCount,
            LastPlayedUtc = lastPlayed,
            MediaType = mediaType
        }));
    }

    private LibraryPlaybackService CreateService()
    {
        return new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            CatalogOpen.Host(_tempDir));
    }

    private static JsonElement ParseJson(string json)
    {
        return JsonDocument.Parse(json).RootElement.Clone();
    }
}
