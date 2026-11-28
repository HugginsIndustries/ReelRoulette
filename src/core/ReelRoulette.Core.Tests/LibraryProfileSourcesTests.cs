using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// A profile's sources in every read that lists, counts, or picks items: the library query's page and both counts, the
/// ids-only query, random picks and their cycle numbers, Auto Tag's scan, and library stats. They apply together with
/// enabled sources and the filter, and a request without a profile, or with one the catalog doesn't have, sees every
/// source.
/// </summary>
public sealed class LibraryProfileSourcesTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-profile-sources-tests", Guid.NewGuid().ToString("N"));
    private readonly LibraryProfileService _profiles;
    private readonly LibraryOperationsService _operations;
    private readonly LibraryPlaybackService _playback;
    private readonly string _onlyA;
    private readonly string _aAndOff;

    /// <summary>
    /// Sources A and B, and Off, which is disabled, each with beach files; A has a video and a photo. Two profiles:
    /// one shows only A, and one A and Off.
    /// </summary>
    public LibraryProfileSourcesTests()
    {
        CatalogSeed.Write(
            _tempDir,
            sources:
            [
                new SeedSource("src-a", "/media/a"),
                new SeedSource("src-b", "/media/b"),
                new SeedSource("src-off", "/media/off", IsEnabled: false)
            ],
            tags: [new SeedTag("beach")],
            items:
            [
                new SeedItem("a-video", "/media/a/beach-a.mp4") { SourceId = "src-a", RelativePath = "beach-a.mp4", HasAudio = true, IntegratedLoudness = -30, IsFavorite = true },
                new SeedItem("a-photo", "/media/a/a.jpg") { SourceId = "src-a", RelativePath = "a.jpg", MediaType = 1 },
                new SeedItem("b-video", "/media/b/beach-b.mp4") { SourceId = "src-b", RelativePath = "beach-b.mp4", HasAudio = true, IntegratedLoudness = -10 },
                new SeedItem("off-video", "/media/off/beach-off.mp4") { SourceId = "src-off", RelativePath = "beach-off.mp4", HasAudio = true, IntegratedLoudness = -5 }
            ]);
        var host = CatalogOpen.Host(_tempDir);
        _profiles = new LibraryProfileService(host, new ServerStateService());
        _operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
        _playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host, random: new Random(1));
        _onlyA = _profiles.CreateProfile("Only A", "#3e7bfa", followsAllSources: false, ["src-a"], null).Profile!.Id;
        _aAndOff = _profiles.CreateProfile("A and Off", "#30a46c", followsAllSources: false, ["SRC-A", "src-off"], null).Profile!.Id;
    }

    [Fact]
    public void LibraryQuery_KeepsOnlyTheProfilesSources_InItsPageAndBothCounts()
    {
        var sources = _profiles.ResolveSourceIds(_onlyA);

        Assert.Equal(("a-photo,a-video", 2, 2), Query(sources));
        // The count before the filter keeps to the profile's sources too.
        Assert.Equal(("a-video", 1, 2), Query(sources, """{"mediaTypeFilter":1}"""));
        Assert.Equal(("a-video", 1, 1), Query(sources, search: "beach"));
    }

    [Fact]
    public void IdsQuery_KeepsOnlyTheProfilesSources()
    {
        var response = _operations.QueryLibraryIds(new LibraryIdsQueryRequest(), out var error, _profiles.ResolveSourceIds(_onlyA));

        Assert.Null(error);
        Assert.Equal(["a-photo", "a-video"], response!.Ids.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void RandomPicksAndTheirCycle_KeepOnlyTheProfilesSources()
    {
        var sources = _profiles.ResolveSourceIds(_onlyA);
        var picked = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < 6; i++)
        {
            Assert.True(_playback.TrySelectRandom(AllMedia(), [], out var response, out var statusCode, out var error, sources), $"{statusCode} {error}");
            picked.Add(response!.Item!.ItemId);
            Assert.Equal(2, response.Cycle.Eligible);
        }

        Assert.Subset(new HashSet<string>(["a-video", "a-photo"], StringComparer.Ordinal), picked);
        Assert.True(_playback.TryGetRandomCycle(AllMedia(), [], out var cycle, out _, out _, sources));
        Assert.Equal(2, cycle!.Eligible);
        Assert.True(_playback.TryGetRandomCycle(AllMedia(), [], out var everything, out _, out _));
        Assert.Equal(3, everything!.Eligible);
    }

    [Fact]
    public void AFilterNamingOnlySourcesTheProfileHides_FindsNothing()
    {
        var sources = _profiles.ResolveSourceIds(_onlyA);
        const string onlyB = """{"includedSourceIds":["src-b"]}""";

        Assert.Equal(("", 0, 2), Query(sources, onlyB));
        Assert.True(_playback.TrySelectRandom(new RandomRequest { FilterState = Filter(onlyB) }, [], out var response, out _, out _, sources));
        Assert.Null(response!.Item);
        Assert.Equal(0, response.Cycle.Eligible);
    }

    [Fact]
    public void AChosenSourceThatIsDisabled_StaysOut()
    {
        Assert.Equal(("a-photo,a-video", 2, 2), Query(_profiles.ResolveSourceIds(_aAndOff)));
    }

    // Removing a source from the library leaves a chosen list that named only it empty.
    [Fact]
    public void AChosenListThatNamesNoSource_ShowsNothing()
    {
        var none = _profiles.CreateProfile("None", "#8e4ec6", followsAllSources: false, [], null).Profile!.Id;

        Assert.Equal(("", 0, 0), Query(_profiles.ResolveSourceIds(none)));
    }

    [Fact]
    public void ARequestWithoutAProfile_OrWithAnUnknownOne_SeesEverySource()
    {
        var everything = ("a-photo,a-video,b-video", 3, 3);

        Assert.Equal(everything, Query(_profiles.ResolveSourceIds(null)));
        Assert.Equal(everything, Query(_profiles.ResolveSourceIds("gone")));
        Assert.Equal(everything, Query(_profiles.ResolveSourceIds(LibraryCatalogStore.DefaultProfileId)));
    }

    [Fact]
    public void AutoTagScan_KeepsOnlyTheProfilesSources()
    {
        var sources = _profiles.ResolveSourceIds(_aAndOff);

        // A full scan takes every item in the profile's sources, a disabled one's included, and the other scan only the
        // enabled ones.
        Assert.Equal(["a-video", "off-video"], ScannedBeach(fullLibrary: true, sources));
        Assert.Equal(["a-video"], ScannedBeach(fullLibrary: false, sources));
        Assert.Equal(["a-video", "b-video", "off-video"], ScannedBeach(fullLibrary: true, profileSourceIds: null));
        Assert.Equal(["a-video", "b-video"], ScannedBeach(fullLibrary: false, profileSourceIds: null));
    }

    [Fact]
    public void LibraryStats_WithAProfile_TotalOnlyItsSources_WhileTheBaselineAndEachSourceStayWhole()
    {
        var stats = _operations.GetLibraryStats(_profiles.ResolveSourceIds(_onlyA));

        Assert.Equal((1, 1, 2, 1, 1), (stats.Global.TotalVideos, stats.Global.TotalPhotos, stats.Global.TotalMedia, stats.Global.Favorites, stats.Global.VideosWithAudio));
        // The baseline is the 75th percentile of every enabled source's videos, -30 and -10, leaving out Off's -5.
        Assert.Equal(-10.0, stats.Global.BaselineLoudnessLufs);
        Assert.Equal(
            [("src-a", 2), ("src-b", 1), ("src-off", 1)],
            stats.Sources.Select(source => (source.SourceId, source.TotalMedia)));

        var everything = _operations.GetLibraryStats();
        Assert.Equal((2, 1, 3), (everything.Global.TotalVideos, everything.Global.TotalPhotos, everything.Global.TotalMedia));
        Assert.Equal(-10.0, everything.Global.BaselineLoudnessLufs);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    /// <summary>The page's ids in name order, the total after the filter, and the count before it.</summary>
    private (string Ids, int Total, int Baseline) Query(
        IReadOnlyCollection<string>? profileSourceIds,
        string? filter = null,
        string? search = null)
    {
        var outcome = _operations.QueryLibrary(
            new LibraryQueryRequest { FilterState = filter == null ? null : Filter(filter), Search = search },
            profileSourceIds: profileSourceIds);
        Assert.True(outcome.Accepted, outcome.Error);
        var body = outcome.Body!;
        return (
            string.Join(",", body["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>())),
            body["totalCount"]!.GetValue<int>(),
            body["searchBaselineCount"]!.GetValue<int>());
    }

    private List<string> ScannedBeach(bool fullLibrary, IReadOnlyCollection<string>? profileSourceIds)
    {
        var scan = _operations.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = fullLibrary }, profileSourceIds);
        return Assert.Single(scan.Rows).Files.Select(file => file.ItemId).Order(StringComparer.Ordinal).ToList();
    }

    private static RandomRequest AllMedia() => new() { PresetId = "all-media", ClientId = "device" };

    private static JsonElement Filter(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
