using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;
using static ReelRoulette.Core.Tests.RandomPickTest;

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

        var ok = service.TrySelectRandom(request, presets, out var picked, out var statusCode, out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        var response = picked!.Item;
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
        Assert.Equal(mediaPath, response!.Item!.Id);
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
            Assert.Equal(favoritePath, response!.Item!.Id);
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
        Assert.Equal("video", response!.Item!.MediaType);
        Assert.Equal(videoPath, response.Item.Id);
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
        Assert.Equal(neverPlayedPath, response!.Item!.Id);
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
        Assert.Equal(withAudioPath, response!.Item!.Id);
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
        Assert.Equal(-23.4, response!.Item!.IntegratedLoudness);
        Assert.Equal(-1.2, response.Item.PeakDb);
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
        Assert.NotNull(response!.Item);
        Assert.Null(response.Item.IntegratedLoudness);
        Assert.Null(response.Item.PeakDb);
    }

    [Fact]
    public void TrySelectRandom_ShouldReturnNoItemAndZeroCycle_WhenOnlyBlacklistedItemsMatchFilter()
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
        AssertEmptyPick(response);
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

        Assert.Equal(expectedStars, picked!.Item!.Rating);
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
        var service = CreateService(logDirectory: logDirectory);

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
        var playback = CreateService(host);
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
        Assert.Equal(mediaPath, first!.Item!.Id);

        Assert.NotNull(operations.SetFavorite("kept", true));
        Assert.True(operations.RecordPlayback("kept").Found);
        Assert.True(operations.ApplyItemTags(new ApplyItemTagsRequest
        {
            ItemIds = ["kept"],
            AddTags = ["Later"]
        }));
        Assert.True(playback.TrySelectRandom(request, [], out var second, out _, out _));
        Assert.Equal(mediaPath, second!.Item!.Id);

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

    // Each old mode's combination of options: Pure random, Weighted random, Smart shuffle, Spread, and Weighted with spread.
    [Theory]
    [InlineData(false, false, false)]
    [InlineData(false, false, true)]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(false, true, true)]
    public void TrySelectRandom_EachOldModesOptions_PickEachEligibleItemAndNothingElse(bool shuffle, bool spreadByFolder, bool favorLessPlayed)
    {
        var host = OpenCatalog();
        host.Session.InsertSource("off", "/other", "Off", false);
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4", lastPlayed: Now.AddDays(-3));
        InsertItem(host, "c", "on", "/media/two/c.mp4");
        InsertItem(host, "blocked", "on", "/media/one/blocked.mp4", blacklisted: true);
        InsertItem(host, "played", "on", "/media/two/played.mp4", playCount: 5);
        InsertItem(host, "photo", "on", "/media/two/photo.jpg", mediaType: 1);
        InsertItem(host, "hidden", "off", "/other/hidden.mp4");
        var playback = CreateService(host, new Random(17));

        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < 60; i++)
        {
            Assert.True(playback.TrySelectRandom(new RandomRequest
            {
                FilterState = ParseJson("""{"onlyNeverPlayed":true}"""),
                IncludeVideos = true,
                IncludePhotos = false,
                Options = new RandomPickOptionsRequest { Shuffle = shuffle, SpreadByFolder = spreadByFolder, FavorLessPlayed = favorLessPlayed }
            }, [], out var response, out var statusCode, out var error));
            Assert.Equal(StatusCodes.Status200OK, statusCode);
            Assert.Null(error);
            seen.Add(response!.Item!.Id);
        }

        Assert.Equal(["/media/one/a.mp4", "/media/one/b.mp4", "/media/two/c.mp4"], seen.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void TrySelectRandom_Shuffle_ReturnsTheCurrentPath_AndKeepsItsCycle_AfterPathsChange()
    {
        var host = OpenCatalog();
        for (var i = 0; i < 6; i++)
        {
            InsertItem(host, $"clip-{i}", "on", $"/media/clip-{i}.mp4");
        }

        var playback = CreateService(host, new Random(5));
        var request = new RandomRequest
        {
            FilterState = ParseJson("{}"),
            Options = new RandomPickOptionsRequest { Shuffle = true, SpreadByFolder = false }
        };
        var first = new List<string>();
        for (var i = 0; i < 3; i++)
        {
            Assert.True(playback.TrySelectRandom(request, [], out var response, out _, out _));
            first.Add(Path.GetFileNameWithoutExtension(response!.Item!.Id));
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
            Assert.StartsWith("/moved/", response!.Item!.Id, StringComparison.Ordinal);
            rest.Add(Path.GetFileNameWithoutExtension(response.Item.Id));
        }

        Assert.Equal(
            Enumerable.Range(0, 6).Select(i => $"clip-{i}").Except(first).Order(StringComparer.Ordinal),
            rest.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void TrySelectRandom_WritesOneLastLogLinePerPick_WithOptionsWindowEligibleCountAndElapsedTime_AndNoPath()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/secret-a.mp4");
        InsertItem(host, "b", "on", "/media/secret-b.mp4");
        var logDirectory = Path.Combine(_tempDir, "logs");
        var playback = CreateService(host, logDirectory: logDirectory);

        Pick(playback, """{"filterState":{},"options":{"shuffle":false,"spreadByFolder":false,"favorLessPlayed":true}}""");
        Assert.Null(Pick(playback, """{"filterState":{},"includeVideos":false,"includePhotos":true}""").Item);
        Pick(playback, """{"filterState":{},"options":{"shuffle":false,"spreadByFolder":false,"rememberPlaysForDays":null}}""");
        Pick(playback, """{"filterState":{},"options":{"spreadByTags":"BYCATEGORY","spreadCategoryIds":["people"],"rememberPlaysForDays":7}}""");
        Pick(playback, """
            {"filterState":{},"options":{"spreadByTags":"allTags","rememberPlaysForDays":90,"favorLessPlayed":true,
            "favorNewlyAdded":true,"favorNewlyCreated":true,"favorHigherRated":true}}
            """);
        Assert.Null(Pick(playback, """{"filterState":{},"includeVideos":false,"includePhotos":false}""").Item);
        playback.ResetRandom(null);

        var lines = File.ReadAllLines(Path.Combine(logDirectory, "last.log"));
        Assert.Equal(6, lines.Length);
        Assert.Matches(@"\[server\] \[info\] Random pick options=favorLessPlayed remember=30d eligible=2 elapsedMs=\d+\.$", lines[0]);
        Assert.Matches(@"\[server\] \[info\] Random pick options=shuffle,spreadByFolder remember=30d eligible=0 elapsedMs=\d+\.$", lines[1]);
        Assert.Matches(@"\[server\] \[info\] Random pick options=none remember=all eligible=2 elapsedMs=\d+\.$", lines[2]);
        Assert.Matches(
            @"\[server\] \[info\] Random pick options=shuffle,spreadByFolder,spreadByTags:byCategory remember=7d eligible=2 elapsedMs=\d+\.$",
            lines[3]);
        Assert.Matches(
            @"\[server\] \[info\] Random pick options=shuffle,spreadByFolder,spreadByTags:allTags,favorLessPlayed,favorNewlyAdded,favorNewlyCreated,favorHigherRated remember=90d eligible=2 elapsedMs=\d+\.$",
            lines[4]);
        Assert.EndsWith("[server] [info] Random pick memory reset.", lines[5], StringComparison.Ordinal);
        Assert.DoesNotContain("secret", string.Join('\n', lines), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("""{"shuffle":true,"rememberPlaysForDays":30,"spreadByFolder":true,"spreadByTags":"off","spreadCategoryIds":[]}""")]
    public void ReadPickOptions_ReadsMissingOptionsAsTheDefaults(string? options)
    {
        var request = Body<RandomRequest>(options is null ? "{}" : $$"""{"options":{{options}}}""");

        AssertDefaultOptions(LibraryPlaybackService.ReadPickOptions(request.Options));
    }

    [Theory]
    [InlineData("1", 1)]
    [InlineData("7", 7)]
    [InlineData("30", 30)]
    [InlineData("90", 90)]
    [InlineData("null", null)]
    [InlineData("5", 30)]
    [InlineData("0", 30)]
    [InlineData("-7", 30)]
    [InlineData("365", 30)]
    public void ReadPickOptions_ReadsAnUnknownWindowAs30Days(string window, int? expected)
    {
        var request = Body<RandomRequest>($$$"""{"options":{"rememberPlaysForDays":{{{window}}}}}""");

        Assert.Equal(expected, LibraryPlaybackService.ReadPickOptions(request.Options).RememberPlaysForDays);
    }

    [Theory]
    [InlineData("\"off\"", TagSpreadValue.Off)]
    [InlineData("\"allTags\"", TagSpreadValue.AllTags)]
    [InlineData("\"ALLTAGS\"", TagSpreadValue.AllTags)]
    [InlineData("\"byCategory\"", TagSpreadValue.ByCategory)]
    [InlineData("\"bycategory\"", TagSpreadValue.ByCategory)]
    [InlineData("\"sideways\"", TagSpreadValue.Off)]
    [InlineData("\"1\"", TagSpreadValue.Off)]
    [InlineData("\"\"", TagSpreadValue.Off)]
    [InlineData("null", TagSpreadValue.Off)]
    public void ReadPickOptions_ReadsSpreadByTagsInAnyCase_AndAnUnknownValueAsOff(string value, TagSpreadValue expected)
    {
        var request = Body<RandomRequest>($$$"""{"options":{"spreadByTags":{{{value}}}}}""");

        Assert.Equal(expected, LibraryPlaybackService.ReadPickOptions(request.Options).SpreadByTags);
    }

    [Fact]
    public void ReadPickOptions_KeepsTheCategoryIdsTrimmed_AndDropsBlankOnes()
    {
        var request = Body<RandomRequest>("""{"options":{"spreadCategoryIds":[" people ","","  ","places"]}}""");
        Assert.Equal(["people", "places"], LibraryPlaybackService.ReadPickOptions(request.Options).SpreadCategoryIds);

        var withNull = Body<RandomRequest>("""{"options":{"spreadCategoryIds":null}}""");
        Assert.Empty(LibraryPlaybackService.ReadPickOptions(withNull.Options).SpreadCategoryIds);
    }

    // With every option off, a roll of 0.25 picks a, then a again; under Shuffle the second pick leaves a out.
    [Fact]
    public void TrySelectRandom_Shuffle_LeavesOutTheDevicesPicks()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");

        Assert.Equal(["a", "a"], PickWith(host, """{"shuffle":false,"spreadByFolder":false}""", 0.25, 0.25));
        Assert.Equal(["a", "b"], PickWith(host, """{"shuffle":true,"spreadByFolder":false}""", 0.25, 0.25));
    }

    // Three folders skip the last pick's folder.
    [Fact]
    public void TrySelectRandom_SpreadByFolder_LeavesOutTheLastPicksFolder()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/two/b.mp4");
        InsertItem(host, "c", "on", "/media/three/c.mp4");

        Assert.Equal(["a", "a"], PickWith(host, """{"shuffle":false,"spreadByFolder":false}""", 0.1, 0.1));
        Assert.Equal(["a", "b"], PickWith(host, """{"shuffle":false,"spreadByFolder":true}""", 0.1, 0.1));
    }

    // After a, whose tag X is on half the files, X counts half an appearance beyond its share, so a and b each get
    // 1/9 of the odds and a roll of 0.3 picks c, where it picks b with tag spread off.
    [Theory]
    [InlineData("\"off\"", "[]", "b")]
    [InlineData("\"allTags\"", "[]", "c")]
    [InlineData("\"ALLTAGS\"", "[]", "c")]
    [InlineData("\"sideways\"", "[]", "b")]
    [InlineData("\"byCategory\"", """["people"]""", "c")]
    [InlineData("\"byCategory\"", """["people","no-such-category"]""", "c")]
    [InlineData("\"byCategory\"", """["no-such-category"]""", "b")]
    public void TrySelectRandom_SpreadByTags_LowersTheFilesSharingTheRecentPicksTags(string spread, string categories, string second)
    {
        var host = OpenCatalog();
        Assert.True(host.Session.UpsertCategory("people", "People", 1));
        Assert.True(host.Session.UpsertCategory("places", "Places", 2));
        Assert.True(host.Session.UpsertTag("X", "people"));
        Assert.True(host.Session.UpsertTag("Y", "places"));
        InsertItem(host, "a", "on", "/media/one/a.mp4", tags: ["X"]);
        InsertItem(host, "b", "on", "/media/one/b.mp4", tags: ["X"]);
        InsertItem(host, "c", "on", "/media/one/c.mp4", tags: ["Y"]);
        InsertItem(host, "d", "on", "/media/one/d.mp4", tags: ["Y"]);

        var options = $$"""{"shuffle":false,"spreadByFolder":false,"spreadByTags":{{spread}},"spreadCategoryIds":{{categories}}}""";
        Assert.Equal(["a", second], PickWith(host, options, 0.1, 0.3));
    }

    // The heavily played file gets the floor of 0.05 against the never-played file's 1.4.
    [Fact]
    public void TrySelectRandom_FavorLessPlayed_WeighsTheFilesByTheirPlays()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4", playCount: 100, lastPlayed: Now);
        InsertItem(host, "b", "on", "/media/one/b.mp4");

        Assert.Equal(["a"], PickWith(host, """{"shuffle":false,"spreadByFolder":false}""", 0.25));
        Assert.Equal(["b"], PickWith(host, """{"shuffle":false,"spreadByFolder":false,"favorLessPlayed":true}""", 0.25));
    }

    // The new file b takes the pool's 20% on top of its 40%, so a roll of 0.45 picks it.
    [Fact]
    public void TrySelectRandom_FavorNewlyAdded_GivesTheNewlyAddedFilesTheirShare()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4", added: Now.AddDays(-100), created: Now.AddDays(-100));
        InsertItem(host, "b", "on", "/media/one/b.mp4", added: Now.AddDays(-1), created: Now.AddDays(-100));

        Assert.Equal(["a"], PickWith(host, """{"shuffle":false,"spreadByFolder":false,"favorNewlyCreated":true}""", 0.45));
        Assert.Equal(["b"], PickWith(host, """{"shuffle":false,"spreadByFolder":false,"favorNewlyAdded":true}""", 0.45));
    }

    [Fact]
    public void TrySelectRandom_FavorNewlyCreated_GivesTheNewlyCreatedFilesTheirShare()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4", added: Now.AddDays(-100), created: Now.AddDays(-100));
        InsertItem(host, "b", "on", "/media/one/b.mp4", added: Now.AddDays(-100), created: Now.AddDays(-1));

        Assert.Equal(["a"], PickWith(host, """{"shuffle":false,"spreadByFolder":false,"favorNewlyAdded":true}""", 0.45));
        Assert.Equal(["b"], PickWith(host, """{"shuffle":false,"spreadByFolder":false,"favorNewlyCreated":true}""", 0.45));
    }

    // Five stars is four times as likely as unrated, so a gets 0.2 of the odds.
    [Fact]
    public void TrySelectRandom_FavorHigherRated_WeighsTheFilesByTheirRating()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4", rating: 10);

        Assert.Equal(["a"], PickWith(host, """{"shuffle":false,"spreadByFolder":false}""", 0.25));
        Assert.Equal(["b"], PickWith(host, """{"shuffle":false,"spreadByFolder":false,"favorHigherRated":true}""", 0.25));
    }

    // Under Shuffle the device picks a, then after the gap a again once its pick has passed the window, or b.
    [Theory]
    [InlineData("7", 8, "a")]
    [InlineData("30", 8, "b")]
    [InlineData("5", 8, "b")]
    [InlineData("30", 31, "a")]
    [InlineData("5", 31, "a")]
    [InlineData("1000", 31, "a")]
    [InlineData("90", 31, "b")]
    [InlineData("null", 31, "b")]
    public void TrySelectRandom_RememberPlaysFor_KeepsThePicksForTheWindow_AndAnUnknownOneFor30Days(string window, int gapDays, string second)
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        var clock = new TestClock(Now);
        var playback = CreateService(host, new ScriptedRandom(0.25, 0.25), clock);
        var body = $$$"""{"filterState":{},"clientId":"device","options":{"shuffle":true,"spreadByFolder":false,"rememberPlaysForDays":{{{window}}}}}""";

        Assert.Equal("a", Pick(playback, body).Item!.ItemId);
        clock.Advance(TimeSpan.FromDays(gapDays));
        Assert.Equal(second, Pick(playback, body).Item!.ItemId);
    }

    // Defaults: Shuffle leaves out a, then a and c; Spread by folder leaves out folder one, then folder two.
    [Theory]
    [InlineData(null, "a,c,b")]
    [InlineData("null", "a,c,b")]
    [InlineData("{}", "a,c,b")]
    [InlineData("""{"shuffle":true,"spreadByFolder":true}""", "a,c,b")]
    [InlineData("""{"shuffle":true,"spreadByFolder":false}""", "a,b,c")]
    [InlineData("""{"shuffle":false,"spreadByFolder":true}""", "a,c,a")]
    [InlineData("""{"shuffle":false,"spreadByFolder":false}""", "a,a,a")]
    public void TrySelectRandom_ReadsMissingOptionsAsShuffleAndSpreadByFolder(string? options, string expected)
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        InsertItem(host, "c", "on", "/media/two/c.mp4");

        Assert.Equal(expected.Split(','), PickWith(host, options, 0.1, 0.1, 0.1));
    }

    [Fact]
    public void TrySelectRandom_KeepsOneMemoryPerClientId_AcrossSessionIds()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        const string options = """{"shuffle":true,"spreadByFolder":false}""";

        var shared = CreateService(host, new ScriptedRandom(0.25, 0.25));
        Assert.Equal("a", Pick(shared, $$"""{"filterState":{},"clientId":"device","sessionId":"tab-a","options":{{options}}}""").Item!.ItemId);
        var second = Pick(shared, $$"""{"filterState":{},"clientId":" device ","sessionId":"tab-b","options":{{options}}}""");
        Assert.Equal("b", second.Item!.ItemId);
        Assert.Equal(2, second.Cycle.Picked);
        Assert.Equal(1, shared.RandomPickDeviceCount);

        var apart = CreateService(host, new ScriptedRandom(0.25, 0.25));
        Assert.Equal("a", Pick(apart, $$"""{"filterState":{},"clientId":"device-1","options":{{options}}}""").Item!.ItemId);
        Assert.Equal("a", Pick(apart, $$"""{"filterState":{},"clientId":"device-2","options":{{options}}}""").Item!.ItemId);
        Assert.Equal(2, apart.RandomPickDeviceCount);

        // Requests that name no device share one memory.
        var anonymous = CreateService(host, new ScriptedRandom(0.25, 0.25));
        Assert.Equal("a", Pick(anonymous, $$"""{"filterState":{},"options":{{options}}}""").Item!.ItemId);
        Assert.Equal("b", Pick(anonymous, $$"""{"filterState":{},"clientId":"  ","options":{{options}}}""").Item!.ItemId);
        Assert.Equal(1, anonymous.RandomPickDeviceCount);
    }

    [Fact]
    public void TrySelectRandom_DropsTheDevicesWhoseLastPickPassedItsWindow_AndKeepsUntilEverythingHasPlayed()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        var logDirectory = Path.Combine(_tempDir, "logs");
        var clock = new TestClock(Now);
        var playback = CreateService(host, time: clock, logDirectory: logDirectory);
        static string DeviceBody(string device, string window) =>
            $$$"""{"filterState":{},"clientId":"{{{device}}}","options":{"rememberPlaysForDays":{{{window}}}}}""";

        Pick(playback, DeviceBody("daily", "1"));
        Pick(playback, DeviceBody("forever", "null"));
        Pick(playback, DeviceBody("monthly", "30"));
        Assert.Equal(3, playback.RandomPickDeviceCount);

        clock.Advance(TimeSpan.FromDays(1) - TimeSpan.FromTicks(1));
        Pick(playback, DeviceBody("other", "30"));
        Assert.Equal(4, playback.RandomPickDeviceCount);

        clock.Advance(TimeSpan.FromTicks(1));
        Pick(playback, DeviceBody("other", "30"));
        Assert.Equal(3, playback.RandomPickDeviceCount);
        Assert.True(playback.TryGetRandomCycle(Body<RandomRequest>(DeviceBody("daily", "1")), [], out var dropped, out _, out _));
        Assert.Equal(0, dropped!.Picked);
        Assert.Equal(3, playback.RandomPickDeviceCount);

        clock.Advance(TimeSpan.FromDays(400));
        Pick(playback, DeviceBody("other", "30"));
        Assert.Equal(2, playback.RandomPickDeviceCount);
        Assert.True(playback.TryGetRandomCycle(Body<RandomRequest>(DeviceBody("forever", "null")), [], out var kept, out _, out _));
        Assert.Equal(1, kept!.Picked);

        var drops = File.ReadAllLines(Path.Combine(logDirectory, "last.log")).Where(line => line.Contains("dropped", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, drops.Count);
        Assert.All(drops, line => Assert.EndsWith("[server] [info] Random pick memory dropped devices=1.", line, StringComparison.Ordinal));
    }

    [Fact]
    public void TrySelectRandom_AnswersTheCycleNumbersAfterThePick()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        InsertItem(host, "c", "on", "/media/one/c.mp4");
        var playback = CreateService(host, new ScriptedRandom(0.1, 0.1, 0.1, 0.1));
        const string body = """{"filterState":{},"clientId":"device"}""";

        AssertCycle(Pick(playback, body).Cycle, picked: 1, eligible: 3);
        AssertCycle(Pick(playback, body).Cycle, picked: 2, eligible: 3);
        AssertCycle(Pick(playback, body).Cycle, picked: 3, eligible: 3);

        // Every file has played, so a new cycle starts with this pick.
        AssertCycle(Pick(playback, body).Cycle, picked: 1, eligible: 3);
    }

    [Fact]
    public void TryGetRandomCycle_AnswersTheDevicesCycleForTheFilter_AndChangesNothing()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        InsertItem(host, "c", "on", "/media/one/c.mp4");
        Assert.True(Assert.Single(host.Session.SetItemsFlag(["c"], CatalogItemFlag.Favorite, true)).Changed);
        var playback = CreateService(host, new ScriptedRandom(0.1, 0.1));
        Assert.Equal("a", Pick(playback, """{"filterState":{},"clientId":"device"}""").Item!.ItemId);
        Assert.Equal("b", Pick(playback, """{"filterState":{},"clientId":"device"}""").Item!.ItemId);

        AssertCycle(Cycle(playback, """{"filterState":{},"clientId":"device"}"""), picked: 2, eligible: 3);
        AssertCycle(Cycle(playback, """{"filterState":{},"clientId":"device"}"""), picked: 2, eligible: 3);
        AssertCycle(Cycle(playback, """{"filterState":{"favoritesMode":"only"},"clientId":"device"}"""), picked: 0, eligible: 1);
        AssertCycle(Cycle(playback, """{"filterState":{},"clientId":"device","includeVideos":false,"includePhotos":false}"""), picked: 0, eligible: 0);
        AssertCycle(Cycle(playback, """{"filterState":{},"clientId":"stranger"}"""), picked: 0, eligible: 3);
        Assert.Equal(1, playback.RandomPickDeviceCount);

        Assert.False(playback.TryGetRandomCycle(Body<RandomRequest>("""{"clientId":"device"}"""), [], out _, out var missingStatus, out var missingError));
        Assert.Equal(StatusCodes.Status400BadRequest, missingStatus);
        Assert.Equal("Either filterState or presetId is required.", missingError);
        Assert.False(playback.TryGetRandomCycle(Body<RandomRequest>("""{"presetId":"Unknown"}"""), [], out _, out var unknownStatus, out var unknownError));
        Assert.Equal(StatusCodes.Status404NotFound, unknownStatus);
        Assert.Equal("Preset 'Unknown' not found.", unknownError);
    }

    [Fact]
    public void ResetRandom_ClearsTheDevicesShuffleMemory_AndCreatesNoneForADeviceWithout()
    {
        var host = OpenCatalog();
        InsertItem(host, "a", "on", "/media/one/a.mp4");
        InsertItem(host, "b", "on", "/media/one/b.mp4");
        InsertItem(host, "c", "on", "/media/one/c.mp4");
        var playback = CreateService(host, new ScriptedRandom(0.1, 0.1, 0.1, 0.1));
        Assert.Equal("a", Pick(playback, """{"filterState":{},"clientId":"device"}""").Item!.ItemId);
        Assert.Equal("a", Pick(playback, """{"filterState":{},"clientId":"other"}""").Item!.ItemId);
        Assert.Equal("b", Pick(playback, """{"filterState":{},"clientId":"device"}""").Item!.ItemId);

        playback.ResetRandom(" DEVICE ");

        AssertCycle(Cycle(playback, """{"filterState":{},"clientId":"device"}"""), picked: 0, eligible: 3);
        AssertCycle(Cycle(playback, """{"filterState":{},"clientId":"other"}"""), picked: 1, eligible: 3);
        Assert.Equal("a", Pick(playback, """{"filterState":{},"clientId":"device"}""").Item!.ItemId);

        playback.ResetRandom("stranger");
        playback.ResetRandom(null);
        Assert.Equal(2, playback.RandomPickDeviceCount);
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
        var service = CreateService(host);

        var ok = service.TrySelectRandom(new RandomRequest
        {
            FilterState = ParseJson("{}"),
            IncludeVideos = false,
            IncludePhotos = false
        }, [], out var response, out var statusCode, out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        AssertEmptyPick(response);
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
        int mediaType = 0,
        DateTime? added = null,
        DateTime? created = null,
        int? rating = null,
        IReadOnlyList<string>? tags = null)
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
            MediaType = mediaType,
            DateAddedUtc = added,
            LastWriteTimeUtc = created,
            RatingHalfStars = rating,
            Tags = tags ?? []
        }));
    }

    /// <summary>A catalog with the enabled source "on" at /media.</summary>
    private LibraryCatalogHost OpenCatalog()
    {
        Directory.CreateDirectory(_tempDir);
        var host = LibraryCatalogHost.Open(_tempDir);
        host.Session.InsertSource("on", "/media", "On", true);
        return host;
    }

    /// <summary>A service at the test's time, with a seeded <see cref="Random"/> unless the test gives its own.</summary>
    private LibraryPlaybackService CreateService(
        LibraryCatalogHost? host = null,
        Random? random = null,
        TimeProvider? time = null,
        string? logDirectory = null)
    {
        return new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            host ?? CatalogOpen.Host(_tempDir),
            logDirectory is null ? null : new ServerLogService(logDirectory),
            random ?? new Random(1),
            time ?? new TestClock(Now));
    }

    /// <summary>The item ids one device picks with the options, one scripted roll each, from a new service.</summary>
    private string[] PickWith(LibraryCatalogHost host, string? options, params double[] rolls)
    {
        var playback = CreateService(host, new ScriptedRandom(rolls));
        var body = options is null
            ? """{"filterState":{},"clientId":"device"}"""
            : $$"""{"filterState":{},"clientId":"device","options":{{options}}}""";
        return rolls.Select(_ => Pick(playback, body).Item!.ItemId).ToArray();
    }

    private static RandomPickResponse Pick(LibraryPlaybackService playback, string body)
    {
        Assert.True(playback.TrySelectRandom(Body<RandomRequest>(body), [], out var response, out var statusCode, out var error), $"{statusCode} {error}");
        return response!;
    }

    private static RandomPickCycleResponse Cycle(LibraryPlaybackService playback, string body)
    {
        Assert.True(playback.TryGetRandomCycle(Body<RandomRequest>(body), [], out var response, out var statusCode, out var error), $"{statusCode} {error}");
        return response!;
    }

    private static void AssertCycle(RandomPickCycleResponse cycle, int picked, int eligible)
    {
        Assert.Equal((picked, eligible, eligible - picked), (cycle.Picked, cycle.Eligible, cycle.Remaining));
    }

    private static void AssertEmptyPick(RandomPickResponse? response)
    {
        Assert.NotNull(response);
        Assert.Null(response!.Item);
        AssertCycle(response.Cycle, picked: 0, eligible: 0);
    }

    private static void AssertDefaultOptions(RandomPickOptions options)
    {
        var defaults = RandomPickOptions.Default;
        Assert.Equal(
            (defaults.Shuffle, defaults.RememberPlaysForDays, defaults.SpreadByFolder, defaults.SpreadByTags,
                defaults.FavorLessPlayed, defaults.FavorNewlyAdded, defaults.FavorNewlyCreated, defaults.FavorHigherRated),
            (options.Shuffle, options.RememberPlaysForDays, options.SpreadByFolder, options.SpreadByTags,
                options.FavorLessPlayed, options.FavorNewlyAdded, options.FavorNewlyCreated, options.FavorHigherRated));
        Assert.Equal((true, 30, true, TagSpreadValue.Off), (options.Shuffle, options.RememberPlaysForDays, options.SpreadByFolder, options.SpreadByTags));
        Assert.Empty(options.SpreadCategoryIds);
    }

    private static T Body<T>(string json)
    {
        return JsonSerializer.Deserialize<T>(json, OpenApiSpec.ServerJsonOptions)!;
    }

    private static JsonElement ParseJson(string json)
    {
        return JsonDocument.Parse(json).RootElement.Clone();
    }
}
