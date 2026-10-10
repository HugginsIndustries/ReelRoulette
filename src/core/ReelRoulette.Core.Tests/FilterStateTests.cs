using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class FilterStateTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-filter-state-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void Parser_ResolvesFlagModes_AsTheSharedFixtureSays()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(OpenApiSpec.RepoPath("shared", "fixtures", "filter-mode-resolution.json")));
        var cases = fixture.RootElement.EnumerateArray().ToList();
        Assert.NotEmpty(cases);
        foreach (var testCase in cases)
        {
            var name = testCase.GetProperty("name").GetString();
            Assert.True(LibraryListFilterParser.TryParse(testCase.GetProperty("filter"), out var parsed, out var error), $"{name}: {error}");
            var expected = (Mode(testCase, "favoritesMode"), Mode(testCase, "blacklistedMode"));
            var actual = (parsed!.FavoritesMode, parsed.BlacklistedMode);
            Assert.True(expected == actual, $"{name}: expected {expected}, got {actual}.");
        }

        static FlagFilterModeValue Mode(JsonElement testCase, string name) => testCase.GetProperty(name).GetString() switch
        {
            "off" => FlagFilterModeValue.Off,
            "only" => FlagFilterModeValue.Only,
            "excluded" => FlagFilterModeValue.Excluded,
            var other => throw new InvalidOperationException($"Unknown expected mode '{other}'.")
        };
    }

    // Each route that takes a filter state, with its body read as the server binds it: the library query, the
    // random pick, and the preset catalog, whose presets a random pick reads by name.
    [Fact]
    public void MissingOrNullFilterState_KeepsEachRoutesMeaning()
    {
        var host = SeedPlainFavoriteAndBlacklisted();
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
        var state = new ServerStateService(catalog: host);

        // The library query applies no filter predicates, so blacklisted items are listed. A present {} leaves them out.
        Assert.Equal(["blacklisted", "favorite", "plain"], QueryIds(operations, "{}"));
        Assert.Equal(["blacklisted", "favorite", "plain"], QueryIds(operations, """{"filterState":null}"""));
        Assert.Equal(["favorite", "plain"], QueryIds(operations, """{"filterState":{}}"""));

        // A posted preset without a filter state, or with null, picks with the default filter, before and after a restart.
        state.SetPresetCatalog(Body<List<FilterPresetSnapshot>>(
            """[{"name":"Night","filterState":{"favoritesOnly":true}},{"name":"Bare"},{"name":"Empty","filterState":null}]"""));
        var restarted = new ServerStateService(catalog: CatalogOpen.Host(_tempDir));
        foreach (var presets in new[] { state.GetPresetCatalogSnapshot(), restarted.GetPresetCatalogSnapshot() })
        {
            // A random pick falls back to presetId. all-media, which names no preset here, is the default filter.
            Assert.Equal(["favorite"], PickIds(playback, presets, """{"presetId":"night"}"""));
            Assert.Equal(["favorite"], PickIds(playback, presets, """{"presetId":"night","filterState":null}"""));
            Assert.Equal(["favorite", "plain"], PickIds(playback, presets, """{"presetId":"all-media"}"""));
            Assert.Equal(["favorite", "plain"], PickIds(playback, presets, """{"presetId":"all-media","filterState":null}"""));
            Assert.Equal(["favorite", "plain"], PickIds(playback, presets, """{"presetId":"Bare"}"""));
            Assert.Equal(["favorite", "plain"], PickIds(playback, presets, """{"presetId":"Empty"}"""));

            Assert.Equal(StatusCodes.Status400BadRequest, PickStatus(playback, presets, "{}"));
            Assert.Equal(StatusCodes.Status400BadRequest, PickStatus(playback, presets, """{"filterState":null}"""));
            Assert.Equal(StatusCodes.Status404NotFound, PickStatus(playback, presets, """{"presetId":"Unknown"}"""));
            Assert.Equal(StatusCodes.Status404NotFound, PickStatus(playback, presets, """{"presetId":"Unknown","filterState":null}"""));
        }
    }

    [Fact]
    public void LibraryQueryAndRandomPick_ApplyFlagModes()
    {
        var host = SeedPlainFavoriteAndBlacklisted();
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
        (string Filter, string[] Ids)[] cases =
        [
            ("""{"favoritesMode":"excluded"}""", ["plain"]),
            ("""{"blacklistedMode":"only"}""", ["blacklisted"]),
            ("""{"favoritesMode":"Excluded","blacklistedMode":"OFF","favoritesOnly":true}""", ["blacklisted", "plain"])
        ];

        foreach (var (filter, ids) in cases)
        {
            Assert.Equal(ids, QueryIds(operations, $$"""{"filterState":{{filter}}}"""));
            Assert.Equal(ids, PickIds(playback, [], $$"""{"filterState":{{filter}}}"""));
        }
    }

    public void Dispose()
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private LibraryCatalogHost SeedPlainFavoriteAndBlacklisted()
    {
        Directory.CreateDirectory(_tempDir);
        var items = new List<SeedItem>();
        foreach (var (id, favorite, blacklisted) in new[] { ("plain", false, false), ("favorite", true, false), ("blacklisted", false, true) })
        {
            var path = Path.Combine(_tempDir, id + ".mp4");
            File.WriteAllBytes(path, [0x01, 0x02]);
            items.Add(new SeedItem(id, path)
            {
                FileName = id + ".mp4",
                RelativePath = id + ".mp4",
                SourceId = "s1",
                IsFavorite = favorite,
                IsBlacklisted = blacklisted
            });
        }

        CatalogSeed.Write(_tempDir, sources: [new SeedSource("s1", _tempDir)], items: items);
        return CatalogOpen.Host(_tempDir);
    }

    private static string[] QueryIds(LibraryOperationsService operations, string body)
    {
        var outcome = operations.QueryLibrary(Body<LibraryQueryRequest>(body));
        Assert.True(outcome.Accepted, outcome.Error);
        var ids = outcome.Body!["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>()).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(ids.Length, outcome.Body["totalCount"]!.GetValue<int>());
        return ids;
    }

    // Smart shuffle, the default mode, picks every eligible item once before any again, so six picks cover a set of three.
    private static string[] PickIds(LibraryPlaybackService playback, IReadOnlyList<FilterPresetSnapshot> presets, string body)
    {
        var request = Body<RandomRequest>(body);
        request.ClientId = Guid.NewGuid().ToString("N");
        var picked = new SortedSet<string>(StringComparer.Ordinal);
        for (var attempt = 0; attempt < 6; attempt++)
        {
            Assert.True(playback.TrySelectRandom(request, presets, out var response, out var statusCode, out var error), $"{body}: {statusCode} {error}");
            picked.Add(response!.ItemId);
        }

        return [.. picked];
    }

    private static int PickStatus(LibraryPlaybackService playback, IReadOnlyList<FilterPresetSnapshot> presets, string body)
    {
        Assert.False(playback.TrySelectRandom(Body<RandomRequest>(body), presets, out _, out var statusCode, out _));
        return statusCode;
    }

    private static T Body<T>(string json)
    {
        return JsonSerializer.Deserialize<T>(json, OpenApiSpec.ServerJsonOptions)!;
    }
}
