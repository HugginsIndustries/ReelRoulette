using System.Text.Json;
using Microsoft.AspNetCore.Http;
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
    public void GetPresets_ShouldProjectPresetCatalogNames()
    {
        Directory.CreateDirectory(_tempDir);
        var service = CreateService();
        IReadOnlyList<FilterPresetSnapshot> presets =
        [
            new FilterPresetSnapshot { Name = "All Media", FilterState = ParseJson("{}") },
            new FilterPresetSnapshot { Name = "Favorites", FilterState = ParseJson("{}") }
        ];

        var responses = service.GetPresets(presets);

        Assert.Equal(2, responses.Count);
        Assert.Equal("All Media", responses[0].Id);
        Assert.Equal("Favorites", responses[1].Id);
    }

    [Fact]
    public void TrySelectRandom_ShouldReturnRealLibraryItemAndMediaTokenUrl()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02, 0x03]);

        var libraryJson = $$"""
        {
          "items": [
            {
              "id": "item-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "clip.mp4",
              "mediaType": 0,
              "sourceId": "s1",
              "isFavorite": true,
              "isBlacklisted": false,
              "duration": "00:00:12",
              "tags": ["tag-a"]
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """;
        File.WriteAllText(Path.Combine(_tempDir, "library.json"), libraryJson);

        var service = CreateService();
        IReadOnlyList<FilterPresetSnapshot> presets =
        [
            new FilterPresetSnapshot { Name = "All Media", FilterState = ParseJson("{}") }
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
        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "item-2",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "clip-filter.mp4",
              "mediaType": 0,
              "sourceId": "s1",
              "isFavorite": true,
              "isBlacklisted": false
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

        var service = CreateService();
        var ok = service.TrySelectRandom(new RandomRequest
        {
            PresetId = string.Empty,
            FilterState = ParseJson("{\"favoritesOnly\":true}")
        }, [], out var response, out var statusCode, out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.NotNull(response);
        Assert.Equal(mediaPath, response!.Id);
    }

    [Fact]
    public void TryMatchPreset_ShouldReturnMatchForEquivalentFilterState()
    {
        Directory.CreateDirectory(_tempDir);
        var service = CreateService();
        IReadOnlyList<FilterPresetSnapshot> presets =
        [
            new FilterPresetSnapshot { Name = "Favorites", FilterState = ParseJson("{\"favoritesOnly\":true,\"selectedTags\":[\"a\",\"b\"]}") }
        ];

        var ok = service.TryMatchPreset(
            new PresetMatchRequest { FilterState = ParseJson("{\"favoritesOnly\":true,\"selectedTags\":[\"b\",\"a\"]}") },
            presets,
            out var response,
            out var statusCode,
            out var error);

        Assert.True(ok);
        Assert.Equal(StatusCodes.Status200OK, statusCode);
        Assert.Null(error);
        Assert.True(response.Matched);
        Assert.Equal("Favorites", response.PresetName);
    }

    [Fact]
    public void TrySelectRandom_ShouldHonorMediaTypeFilterVideosOnly()
    {
        Directory.CreateDirectory(_tempDir);
        var videoPath = Path.Combine(_tempDir, "video-a.mp4");
        var photoPath = Path.Combine(_tempDir, "photo-a.jpg");
        File.WriteAllBytes(videoPath, [0x01, 0x02]);
        File.WriteAllBytes(photoPath, [0x01, 0x02]);

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            { "id": "v1", "fullPath": "{{videoPath.Replace("\\", "\\\\")}}", "fileName": "video-a.mp4", "mediaType": 0, "sourceId": "s1" },
            { "id": "p1", "fullPath": "{{photoPath.Replace("\\", "\\\\")}}", "fileName": "photo-a.jpg", "mediaType": 1, "sourceId": "s1" }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            { "id": "n1", "fullPath": "{{neverPlayedPath.Replace("\\", "\\\\")}}", "fileName": "never-played.mp4", "mediaType": 0, "playCount": 0, "sourceId": "s1" },
            { "id": "p1", "fullPath": "{{playedPath.Replace("\\", "\\\\")}}", "fileName": "played.mp4", "mediaType": 0, "playCount": 4, "sourceId": "s1" }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            { "id": "a1", "fullPath": "{{withAudioPath.Replace("\\", "\\\\")}}", "fileName": "with-audio.mp4", "mediaType": 0, "hasAudio": true, "integratedLoudness": -14.2, "sourceId": "s1" },
            { "id": "a2", "fullPath": "{{withoutAudioPath.Replace("\\", "\\\\")}}", "fileName": "without-audio.mp4", "mediaType": 0, "hasAudio": false, "sourceId": "s1" }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "blk-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "blocked.mp4",
              "mediaType": 0,
              "isBlacklisted": true,
              "sourceId": "s1"
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "stable-id-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "play.mp4",
              "mediaType": 0,
              "sourceId": "s1",
              "isBlacklisted": false
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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
    public void TryPlayItem_ShouldSucceed_WhenItemIsBlacklisted()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "blisted.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02]);

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "bl-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "blisted.mp4",
              "mediaType": 0,
              "sourceId": "s1",
              "isBlacklisted": true
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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
        File.WriteAllText(Path.Combine(_tempDir, "library.json"), """
        {
          "items": [],
          "sources": []
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "x-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "nope.mp4",
              "mediaType": 0,
              "sourceId": "s1"
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

        var service = CreateService();
        var ok = service.TryPlayItem("x-1", false, out _, out var statusCode, out var error, out var code);

        Assert.False(ok);
        Assert.Equal(StatusCodes.Status404NotFound, statusCode);
        Assert.Equal("Media file not found", error);
        Assert.Equal(LibraryPlaybackService.PlayItemErrorMediaMissing, code);
    }

    [Fact]
    public void TryPlayItem_ShouldReturn404_WhenForceMediaMissing()
    {
        Directory.CreateDirectory(_tempDir);
        var mediaPath = Path.Combine(_tempDir, "present.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "fm-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "present.mp4",
              "mediaType": 0,
              "sourceId": "s1"
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "off-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "off.mp4",
              "mediaType": 0,
              "sourceId": "s1"
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": false }
          ]
        }
        """);

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

        File.WriteAllText(Path.Combine(_tempDir, "library.json"), $$"""
        {
          "items": [
            {
              "id": "badext-1",
              "fullPath": "{{mediaPath.Replace("\\", "\\\\")}}",
              "fileName": "weird.xyz",
              "mediaType": 0,
              "sourceId": "s1"
            }
          ],
          "sources": [
            { "id": "s1", "rootPath": "{{_tempDir.Replace("\\", "\\\\")}}", "isEnabled": true }
          ]
        }
        """);

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
            _tempDir,
            host);
        var operations = new LibraryOperationsService(
            NullLogger<LibraryOperationsService>.Instance,
            _tempDir,
            host);
        var builds = host.Session.DocumentBuilds;
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
        Assert.Equal(builds, host.Session.DocumentBuilds);

        Assert.NotNull(operations.SetFavorite(mediaPath, true));
        Assert.True(operations.RecordPlayback(mediaPath).Found);
        Assert.True(operations.ApplyItemTags(new ApplyItemTagsRequest
        {
            ItemIds = ["kept"],
            AddTags = ["Later"]
        }));
        Assert.True(playback.TrySelectRandom(request, [], out var second, out _, out _));
        Assert.Equal(mediaPath, second!.Id);
        Assert.Equal(builds, host.Session.DocumentBuilds);

        Assert.True(playback.TryPlayItem("kept", false, out var played, out var playStatus, out var playError, out var code));
        Assert.Equal(StatusCodes.Status200OK, playStatus);
        Assert.Null(playError);
        Assert.Null(code);
        Assert.Equal(mediaPath, played!.Id);
        Assert.True(playback.TryResolveMediaPath("kept", out var byId));
        Assert.Equal(mediaPath, byId);
        Assert.True(playback.TryResolveMediaPath(mediaPath, out var byPath));
        Assert.Equal(mediaPath, byPath);
        Assert.Equal(builds, host.Session.DocumentBuilds);
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
            _tempDir,
            host);
        var listed = host.Session.QueryList(new LibraryListRequest
        {
            Filter = new ReelRoulette.Core.Filtering.FilterStateModel(),
            Limit = 20
        }).Items.Select(item => item.FullPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var builds = host.Session.DocumentBuilds;
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
        Assert.Equal(builds, host.Session.DocumentBuilds);
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
        Assert.Equal("Library not loaded or empty.", error);
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
            _tempDir,
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

    private LibraryPlaybackService CreateService()
    {
        return new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            _tempDir);
    }

    private static JsonElement ParseJson(string json)
    {
        return JsonDocument.Parse(json).RootElement.Clone();
    }
}
