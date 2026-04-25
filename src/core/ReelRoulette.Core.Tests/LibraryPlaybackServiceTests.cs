using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
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
              "isFavorite": true,
              "isBlacklisted": false,
              "duration": "00:00:12",
              "tags": ["tag-a"]
            }
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

        var ok = service.TrySelectRandom(request, presets, [], [], out var response, out var statusCode, out var error);

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
              "isFavorite": true,
              "isBlacklisted": false
            }
          ]
        }
        """);

        var service = CreateService();
        var ok = service.TrySelectRandom(new RandomRequest
        {
            PresetId = string.Empty,
            FilterState = ParseJson("{\"favoritesOnly\":true}")
        }, [], [], [], out var response, out var statusCode, out var error);

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
            { "id": "s1", "isEnabled": true }
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
            [],
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
            { "id": "s1", "isEnabled": true }
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
            [],
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
            { "id": "s1", "isEnabled": true }
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
            [],
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
