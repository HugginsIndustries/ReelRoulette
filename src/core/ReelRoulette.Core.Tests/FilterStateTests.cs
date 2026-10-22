using System.Text.Json;
using System.Text.Json.Nodes;
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

    // The catalog's schema 5 step writes each stored filter state's modes by this rule, and the parser then reads only
    // the modes.
    [Fact]
    public void WriteModes_ResolvesFlagModes_AsTheFixtureSays()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(
            OpenApiSpec.RepoPath("src", "core", "ReelRoulette.Core.Tests", "Fixtures", "filter-mode-resolution.json")));
        var cases = fixture.RootElement.EnumerateArray().ToList();
        Assert.NotEmpty(cases);
        foreach (var testCase in cases)
        {
            var name = testCase.GetProperty("name").GetString();
            var filterState = JsonNode.Parse(testCase.GetProperty("filter").GetRawText())!.AsObject();
            FlagFilterModes.WriteModes(filterState);
            Assert.False(filterState.ContainsKey("favoritesOnly") || filterState.ContainsKey("excludeBlacklisted"), $"{name}: {filterState.ToJsonString()}");
            using var written = JsonDocument.Parse(filterState.ToJsonString());
            Assert.True(LibraryListFilterParser.TryParse(written.RootElement, out var parsed, out var error), $"{name}: {error}");
            var expected = (ExpectedMode(testCase, "favoritesMode"), ExpectedMode(testCase, "blacklistedMode"));
            var actual = (parsed!.FavoritesMode, parsed.BlacklistedMode);
            Assert.True(expected == actual, $"{name}: expected {expected}, got {actual}.");
        }
    }

    // Each side is read as the server reads a filter state, and compared both ways round. The WebUI reads the same fixture.
    [Fact]
    public void Comparison_AgreesWithEveryCaseOfTheSharedFixture()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(OpenApiSpec.RepoPath("shared", "fixtures", "preset-filter-equality.json")));
        var cases = fixture.RootElement.EnumerateArray().ToList();
        Assert.NotEmpty(cases);
        foreach (var testCase in cases)
        {
            var name = testCase.GetProperty("name").GetString();
            Assert.True(LibraryListFilterParser.TryParse(testCase.GetProperty("left"), out var left, out var leftError), $"{name}: {leftError}");
            Assert.True(LibraryListFilterParser.TryParse(testCase.GetProperty("right"), out var right, out var rightError), $"{name}: {rightError}");
            var same = testCase.GetProperty("same").GetBoolean();
            Assert.True(same == FilterStateComparison.SameFilter(left!, right!), $"{name}: expected same={same}.");
            Assert.True(same == FilterStateComparison.SameFilter(right!, left!), $"{name}, the other way round: expected same={same}.");
        }
    }

    [Fact]
    public void Comparison_TellsTheDefaultFilterByEquality()
    {
        foreach (var json in new[] { "{}", """{"favoritesMode":"off","blacklistedMode":"excluded","globalMatchMode":null}""", """{"categoryLocalMatchModes":{"people":0}}""" })
        {
            using var document = JsonDocument.Parse(json);
            Assert.True(LibraryListFilterParser.TryParse(document.RootElement, out var filter, out var error), error);
            Assert.True(FilterStateComparison.IsDefault(filter!), json);
        }

        using var favorites = JsonDocument.Parse("""{"favoritesMode":"only"}""");
        Assert.True(LibraryListFilterParser.TryParse(favorites.RootElement, out var favoritesFilter, out _));
        Assert.False(FilterStateComparison.IsDefault(favoritesFilter!));
    }

    [Fact]
    public void Parser_ReadsEnumFields_AsTheSharedFixtureSays()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(OpenApiSpec.RepoPath("shared", "fixtures", "filter-enum-values.json")));
        var cases = fixture.RootElement.EnumerateArray().ToList();
        Assert.NotEmpty(cases);
        foreach (var testCase in cases)
        {
            var name = testCase.GetProperty("name").GetString();
            Assert.True(LibraryListFilterParser.TryParse(testCase.GetProperty("filter"), out var parsed, out var error), $"{name}: {error}");
            Assert.True(testCase.GetProperty("audioFilter").GetInt32() == (int)parsed!.AudioFilter, $"{name}: audioFilter is {parsed.AudioFilter}.");
            Assert.True(testCase.GetProperty("mediaTypeFilter").GetInt32() == (int)parsed.MediaTypeFilter, $"{name}: mediaTypeFilter is {parsed.MediaTypeFilter}.");
            var expectedModes = testCase.GetProperty("categoryLocalMatchModes").EnumerateObject()
                .Select(property => $"{property.Name}={property.Value.GetInt32()}").Order(StringComparer.Ordinal);
            var actualModes = (parsed.CategoryLocalMatchModes ?? []).Select(pair => $"{pair.Key}={(int)pair.Value}").Order(StringComparer.Ordinal);
            Assert.True(expectedModes.SequenceEqual(actualModes), $"{name}: categoryLocalMatchModes are {string.Join(", ", actualModes)}.");
            var expected = (ExpectedMode(testCase, "favoritesMode"), ExpectedMode(testCase, "blacklistedMode"));
            var actual = (parsed.FavoritesMode, parsed.BlacklistedMode);
            Assert.True(expected == actual, $"{name}: expected modes {expected}, got {actual}.");
        }
    }

    // Each route that takes a filter state, with its body read as the server binds it: the library query, and the
    // random pick, which also reads a preset's filter state by its id.
    [Fact]
    public void MissingOrNullFilterState_KeepsEachRoutesMeaning()
    {
        // A stored preset without a filter state, or with null, picks with the default filter.
        var host = SeedPlainFavoriteAndBlacklisted(
            [new SeedPreset("Night", """{"favoritesMode":"only"}"""), new SeedPreset("Bare"), new SeedPreset("Empty", "null")]);
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
        var state = new ServerStateService(catalog: host);

        // The library query applies no filter predicates, so blacklisted items are listed. A present {} leaves them out.
        Assert.Equal(["blacklisted", "favorite", "plain"], QueryIds(operations, "{}"));
        Assert.Equal(["blacklisted", "favorite", "plain"], QueryIds(operations, """{"filterState":null}"""));
        Assert.Equal(["favorite", "plain"], QueryIds(operations, """{"filterState":{}}"""));

        var presets = state.GetPresetCatalogSnapshot();
        var ids = presets.ToDictionary(preset => preset.Name, preset => preset.Id);

        // A random pick falls back to presetId, a preset's id. all-media, which is never a preset's id, is the default filter.
        Assert.Equal(["favorite"], PickIds(playback, presets, $$"""{"presetId":"{{ids["Night"]}}"}"""));
        Assert.Equal(["favorite"], PickIds(playback, presets, $$"""{"presetId":"{{ids["Night"]}}","filterState":null}"""));
        Assert.Equal(["favorite", "plain"], PickIds(playback, presets, """{"presetId":"all-media"}"""));
        Assert.Equal(["favorite", "plain"], PickIds(playback, presets, """{"presetId":"all-media","filterState":null}"""));
        Assert.Equal(["favorite", "plain"], PickIds(playback, presets, $$"""{"presetId":"{{ids["Bare"]}}"}"""));
        Assert.Equal(["favorite", "plain"], PickIds(playback, presets, $$"""{"presetId":"{{ids["Empty"]}}"}"""));

        Assert.Equal(StatusCodes.Status400BadRequest, PickStatus(playback, presets, "{}"));
        Assert.Equal(StatusCodes.Status400BadRequest, PickStatus(playback, presets, """{"filterState":null}"""));
        Assert.Equal(StatusCodes.Status404NotFound, PickStatus(playback, presets, """{"presetId":"Unknown"}"""));
        Assert.Equal(StatusCodes.Status404NotFound, PickStatus(playback, presets, """{"presetId":"Unknown","filterState":null}"""));
        // A preset's name finds no preset.
        Assert.Equal(StatusCodes.Status404NotFound, PickStatus(playback, presets, """{"presetId":"Night"}"""));
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

    // The library query and the random pick, as the routes run them, keep only playable containers and photos with
    // the option on.
    [Fact]
    public void LibraryQueryAndRandomPick_ApplyBrowserPlayable()
    {
        var host = SeedBrowserPlayableItems();
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);

        Assert.Equal(["clip", "photo"], QueryIds(operations, """{"filterState":{"onlyBrowserPlayable":true}}"""));
        Assert.Equal(["clip", "photo"], PickIds(playback, [], """{"filterState":{"onlyBrowserPlayable":true}}"""));
        Assert.Equal(["clip", "film", "old", "photo"], QueryIds(operations, """{"filterState":{"onlyBrowserPlayable":false}}"""));
        Assert.Equal(["clip", "film", "old", "photo"], PickIds(playback, [], """{"filterState":{}}"""));
    }

    // A preset stored before the option has no field for it, and picks with the option off.
    [Fact]
    public void StoredPresetWithoutBrowserPlayable_PicksWithTheOptionOff()
    {
        var host = SeedBrowserPlayableItems([new SeedPreset("Old", """{"favoritesMode":"off","blacklistedMode":"excluded","onlyNeverPlayed":false}""")]);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
        var presets = new ServerStateService(catalog: host).GetPresetCatalogSnapshot();
        var preset = Assert.Single(presets);
        Assert.Equal(["clip", "film", "old", "photo"], PickIds(playback, presets, $$"""{"presetId":"{{preset.Id}}"}"""));
    }

    [Fact]
    public void Comparison_TellsFiltersApartByBrowserPlayable()
    {
        Assert.False(FilterStateComparison.SameFilter(
            new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only },
            new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only, OnlyBrowserPlayable = true }));
        Assert.False(FilterStateComparison.IsDefault(new FilterStateModel { OnlyBrowserPlayable = true }));
        Assert.True(FilterStateComparison.IsDefault(new FilterStateModel { OnlyBrowserPlayable = false }));
    }

    [Fact]
    public void Parser_ReadsMinRating_AsTheSharedFixtureSays()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(OpenApiSpec.RepoPath("shared", "fixtures", "filter-min-rating.json")));
        var cases = fixture.RootElement.EnumerateArray().ToList();
        Assert.NotEmpty(cases);
        foreach (var testCase in cases)
        {
            var name = testCase.GetProperty("name").GetString();
            Assert.True(LibraryListFilterParser.TryParse(testCase.GetProperty("filter"), out var parsed, out var error), $"{name}: {error}");
            var expected = testCase.GetProperty("minRating");
            double? stars = expected.ValueKind == JsonValueKind.Null ? null : expected.GetDouble();
            Assert.True(stars == ItemRating.ToStars(parsed!.MinRatingHalfStars), $"{name}: read {parsed.MinRatingHalfStars} half stars.");
        }
    }

    // The library query and the random pick, as the routes run them: a minimum keeps items rated at or above it, Only
    // unrated keeps the unrated ones, and the two together keep nothing.
    [Fact]
    public void LibraryQueryAndRandomPick_ApplyRatingFilters()
    {
        var host = SeedRatedItems();
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
        (string Filter, string[] Ids)[] cases =
        [
            ("""{"minRating":3}""", ["high"]),
            ("""{"minRating":0.5}""", ["high", "low"]),
            ("""{"onlyUnrated":true}""", ["unrated"]),
            ("""{"onlyUnrated":false,"minRating":null}""", ["high", "low", "unrated"])
        ];

        foreach (var (filter, ids) in cases)
        {
            Assert.Equal(ids, QueryIds(operations, $$"""{"filterState":{{filter}}}"""));
            Assert.Equal(ids, PickIds(playback, [], $$"""{"filterState":{{filter}}}"""));
        }

        const string both = """{"filterState":{"onlyUnrated":true,"minRating":0.5}}""";
        Assert.Empty(QueryIds(operations, both));
        Assert.True(playback.TrySelectRandom(Body<RandomRequest>(both), [], out var response, out var statusCode, out var error), $"{statusCode} {error}");
        Assert.Null(response);
    }

    // A preset stored before the rating filter has no fields for it, and picks with no minimum and Only unrated off.
    [Fact]
    public void StoredPresetWithoutRatingFields_PicksWithNoMinimumAndOnlyUnratedOff()
    {
        var host = SeedRatedItems([new SeedPreset("Old", """{"favoritesMode":"off","blacklistedMode":"excluded","onlyBrowserPlayable":false}""")]);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
        var presets = new ServerStateService(catalog: host).GetPresetCatalogSnapshot();
        var preset = Assert.Single(presets);
        Assert.Equal(["high", "low", "unrated"], PickIds(playback, presets, $$"""{"presetId":"{{preset.Id}}"}"""));
    }

    [Fact]
    public void Comparison_TellsFiltersApartByRating()
    {
        var favorites = new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only };
        Assert.False(FilterStateComparison.SameFilter(favorites, new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only, OnlyUnrated = true }));
        Assert.False(FilterStateComparison.SameFilter(favorites, new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only, MinRatingHalfStars = 6 }));
        Assert.False(FilterStateComparison.SameFilter(new FilterStateModel { MinRatingHalfStars = 6 }, new FilterStateModel { MinRatingHalfStars = 7 }));
        Assert.False(FilterStateComparison.IsDefault(new FilterStateModel { OnlyUnrated = true }));
        Assert.False(FilterStateComparison.IsDefault(new FilterStateModel { MinRatingHalfStars = 1 }));
    }

    public void Dispose()
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private LibraryCatalogHost SeedPlainFavoriteAndBlacklisted(IEnumerable<SeedPreset>? presets = null)
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

        CatalogSeed.Write(_tempDir, sources: [new SeedSource("s1", _tempDir)], items: items, presets: presets);
        return CatalogOpen.Host(_tempDir);
    }

    // A video in each of a playable and three unplayable containers, and a photo, with names that agree with their
    // media types.
    private LibraryCatalogHost SeedBrowserPlayableItems(IEnumerable<SeedPreset>? presets = null)
    {
        Directory.CreateDirectory(_tempDir);
        var items = new List<SeedItem>();
        foreach (var (id, fileName, mediaType) in new[] { ("clip", "clip.mp4", 0), ("film", "film.mkv", 0), ("old", "old.avi", 0), ("photo", "photo.jpg", 1) })
        {
            var path = Path.Combine(_tempDir, fileName);
            File.WriteAllBytes(path, [0x01, 0x02]);
            items.Add(new SeedItem(id, path)
            {
                FileName = fileName,
                RelativePath = fileName,
                SourceId = "s1",
                MediaType = mediaType
            });
        }

        CatalogSeed.Write(_tempDir, sources: [new SeedSource("s1", _tempDir)], items: items, presets: presets);
        return CatalogOpen.Host(_tempDir);
    }

    // An unrated item, one rated 1 star, and one rated 4 stars.
    private LibraryCatalogHost SeedRatedItems(IEnumerable<SeedPreset>? presets = null)
    {
        Directory.CreateDirectory(_tempDir);
        var items = new List<SeedItem>();
        foreach (var (id, halfStars) in new (string Id, int? HalfStars)[] { ("unrated", null), ("low", 2), ("high", 8) })
        {
            var path = Path.Combine(_tempDir, id + ".mp4");
            File.WriteAllBytes(path, [0x01, 0x02]);
            items.Add(new SeedItem(id, path)
            {
                FileName = id + ".mp4",
                RelativePath = id + ".mp4",
                SourceId = "s1",
                RatingHalfStars = halfStars
            });
        }

        CatalogSeed.Write(_tempDir, sources: [new SeedSource("s1", _tempDir)], items: items, presets: presets);
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
    private static string[] PickIds(LibraryPlaybackService playback, IReadOnlyList<StoredPreset> presets, string body)
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

    private static int PickStatus(LibraryPlaybackService playback, IReadOnlyList<StoredPreset> presets, string body)
    {
        Assert.False(playback.TrySelectRandom(Body<RandomRequest>(body), presets, out _, out var statusCode, out _));
        return statusCode;
    }

    private static T Body<T>(string json)
    {
        return JsonSerializer.Deserialize<T>(json, OpenApiSpec.ServerJsonOptions)!;
    }

    // A fixture names each expected mode in lower case.
    private static FlagFilterModeValue ExpectedMode(JsonElement testCase, string name) => testCase.GetProperty(name).GetString() switch
    {
        "off" => FlagFilterModeValue.Off,
        "only" => FlagFilterModeValue.Only,
        "excluded" => FlagFilterModeValue.Excluded,
        var other => throw new InvalidOperationException($"Unknown expected mode '{other}'.")
    };
}
