using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// Every event and response that names a library item carries its catalog item id, checked against
/// shared/api/openapi.yaml with the serializer options the server uses.
/// </summary>
public sealed class ItemIdContractTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-item-id-contract-tests", Guid.NewGuid().ToString("N"));

    public ItemIdContractTests()
    {
        Directory.CreateDirectory(_tempDir);
    }

    [Fact]
    public void RandomAndPlayResponses_CarryTheItemIdBesideThePath()
    {
        var mediaPath = Path.Combine(_tempDir, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items: [new SeedItem("item-1", mediaPath) { SourceId = "s1", FileName = "clip.mp4" }]);
        var playback = CreatePlayback(CatalogOpen.Host(_tempDir));

        Assert.True(playback.TrySelectRandom(
            new RandomRequest { PresetId = "all-media" },
            [],
            out var random,
            out _,
            out _));
        Assert.True(playback.TryPlayItem("item-1", forceMediaMissing: false, out var played, out _, out _, out _));

        foreach (var response in new[] { random!, played! })
        {
            Assert.Equal("item-1", response.ItemId);
            Assert.Equal(mediaPath, response.Id);
            OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "RandomResponse");
        }
    }

    [Fact]
    public void PlayItem_PublishesPlaybackRecordedWithTheItemId()
    {
        var mediaPath = Path.Combine(_tempDir, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items: [new SeedItem("item-1", mediaPath) { SourceId = "s1", FileName = "clip.mp4" }]);
        var host = CatalogOpen.Host(_tempDir);
        var state = new ServerStateService();

        var result = ServerHostComposition.PlayItem("item-1", null, CreatePlayback(host), CreateOperations(host), state, new OperatorTestingService());

        Assert.Equal("item-1", Assert.IsType<RandomResponse>(Value(result)).ItemId);
        var payload = Assert.IsType<PlaybackRecordedPayload>(SingleEvent(state, "playbackRecorded").Payload);
        Assert.Equal("item-1", payload.ItemId);
        Assert.Equal(1, payload.PlayCount);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "PlaybackRecordedPayload");
    }

    [Fact]
    public void RecordPlayback_ByItemId_RecordsThatItem_WhenTwoPathsDifferOnlyInCase()
    {
        var upperPath = Path.Combine(_tempDir, "Clip.mp4");
        var lowerPath = Path.Combine(_tempDir, "clip.mp4");
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("id-upper", upperPath),
                new SeedItem("id-lower", lowerPath)
            ]);
        var host = CatalogOpen.Host(_tempDir);
        var state = new ServerStateService();

        var result = ServerHostComposition.RecordPlayback(new RecordPlaybackRequest { ItemId = "id-lower" }, state, CreateOperations(host));

        var response = Assert.IsType<RecordPlaybackResponse>(Value(result));
        Assert.Equal("id-lower", response.ItemId);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "RecordPlaybackResponse");
        var payload = Assert.IsType<PlaybackRecordedPayload>(SingleEvent(state, "playbackRecorded").Payload);
        Assert.Equal("id-lower", payload.ItemId);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "PlaybackRecordedPayload");
        Assert.Equal(0, host.Session.ReadItemState("id-upper")!.PlayCount);
        Assert.Equal(1, host.Session.ReadItemState("id-lower")!.PlayCount);
    }

    [Fact]
    public void FavoriteAndBlacklist_PublishThePreviousFavoriteAndBlacklist_AndTheClientThatMadeTheChange()
    {
        var path = Path.Combine(_tempDir, "clip.mp4");
        CatalogSeed.Write(_tempDir, items: [new SeedItem("item-1", path) { IsBlacklisted = true }]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));
        var state = new ServerStateService();

        ServerHostComposition.SetFavorite(new FavoriteRequest { ItemId = "item-1", IsFavorite = true, ClientId = " client-a " }, state, operations);
        ServerHostComposition.SetBlacklist(new BlacklistRequest { ItemId = "item-1", IsBlacklisted = true, ClientId = "client-b" }, state, operations);
        // A request that names no client, or only a blank one, gets an event that names none.
        ServerHostComposition.SetFavorite(new FavoriteRequest { ItemId = "item-1", IsFavorite = true }, state, operations);
        ServerHostComposition.SetBlacklist(new BlacklistRequest { ItemId = "item-1", IsBlacklisted = true, ClientId = " " }, state, operations);

        var events = state.GetReplayAfter(0).Events
            .Select(envelope => Assert.IsType<ItemStateChangedPayload>(envelope.Payload))
            .ToList();
        Assert.Equal(4, events.Count);
        Assert.Equal(["client-a", "client-b", null, null], events.Select(change => change.ClientId));
        var favorite = events[0];
        Assert.Equal(("item-1", path), (favorite.ItemId, favorite.Path));
        Assert.Equal((true, false), (favorite.IsFavorite, favorite.IsBlacklisted));
        Assert.Equal((false, true), (favorite.PreviousIsFavorite, favorite.PreviousIsBlacklisted));
        var blacklist = events[1];
        Assert.Equal((false, true), (blacklist.IsFavorite, blacklist.IsBlacklisted));
        Assert.Equal((true, false), (blacklist.PreviousIsFavorite, blacklist.PreviousIsBlacklisted));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(favorite), "ItemStateChangedPayload");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(events[2]), "ItemStateChangedPayload");
    }

    [Fact]
    public void FavoriteBlacklistRecordPlaybackAndPlay_FindNoItemByItsFullPath()
    {
        var path = Path.Combine(_tempDir, "clip.mp4");
        File.WriteAllBytes(path, [0x01]);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items: [new SeedItem("item-1", path) { SourceId = "s1", FileName = "clip.mp4" }]);
        var host = CatalogOpen.Host(_tempDir);
        var operations = CreateOperations(host);
        var state = new ServerStateService();

        var results = new[]
        {
            ServerHostComposition.SetFavorite(new FavoriteRequest { ItemId = path, IsFavorite = true }, state, operations),
            ServerHostComposition.SetBlacklist(new BlacklistRequest { ItemId = path, IsBlacklisted = true }, state, operations),
            ServerHostComposition.RecordPlayback(new RecordPlaybackRequest { ItemId = path }, state, operations),
            ServerHostComposition.PlayItem(path, null, CreatePlayback(host), operations, state, new OperatorTestingService())
        };

        Assert.All(results, result => Assert.Equal(StatusCodes.Status404NotFound, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode));
        Assert.Empty(state.GetReplayAfter(0).Events);
        var item = host.Session.ReadItemState("item-1")!;
        Assert.Equal((false, false, 0), (item.IsFavorite, item.IsBlacklisted, item.PlayCount));
    }

    [Fact]
    public void FavoriteBlacklistAndRecordPlayback_ReadTheItemIdField_AndClearStatsReadsItemIds()
    {
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("item-1", Path.Combine(_tempDir, "first.mp4")) { PlayCount = 3 },
                new SeedItem("item-2", Path.Combine(_tempDir, "second.mp4")) { PlayCount = 5 }
            ]);
        var host = CatalogOpen.Host(_tempDir);
        var operations = CreateOperations(host);
        var state = new ServerStateService();

        var favorite = Request<FavoriteRequest>("""{"itemId":"item-1","isFavorite":true}""");
        var blacklist = Request<BlacklistRequest>("""{"itemId":"item-2","isBlacklisted":true}""");
        var record = Request<RecordPlaybackRequest>("""{"itemId":"item-1"}""");
        var clear = Request<ClearPlaybackStatsRequest>("""{"itemIds":["item-2"]}""");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(favorite), "FavoriteRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(blacklist), "BlacklistRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(record), "RecordPlaybackRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(clear), "ClearPlaybackStatsRequest");

        Assert.IsType<LibraryStateResponse>(Value(ServerHostComposition.SetFavorite(favorite, state, operations)));
        Assert.IsType<LibraryStateResponse>(Value(ServerHostComposition.SetBlacklist(blacklist, state, operations)));
        Assert.IsType<RecordPlaybackResponse>(Value(ServerHostComposition.RecordPlayback(record, state, operations)));
        Assert.Equal(1, operations.ClearPlaybackStats(clear).ClearedCount);

        var first = host.Session.ReadItemState("item-1")!;
        var second = host.Session.ReadItemState("item-2")!;
        Assert.Equal((true, false, 4), (first.IsFavorite, first.IsBlacklisted, first.PlayCount));
        Assert.Equal((false, true, 0), (second.IsFavorite, second.IsBlacklisted, second.PlayCount));

        // The old field names no longer bind, so a request that sends them names no item.
        var oldFavorite = Request<FavoriteRequest>("""{"path":"item-1","isFavorite":false}""");
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsAssignableFrom<IStatusCodeHttpResult>(
            ServerHostComposition.SetFavorite(oldFavorite, state, operations)).StatusCode);
        Assert.Null(Request<ClearPlaybackStatsRequest>("""{"itemPaths":["item-1"]}""").ItemIds);
    }

    [Fact]
    public void ClearPlaybackStats_WithAllItems_ClearsEveryItem()
    {
        var (host, operations, state) = SeedPlayedItems();
        var request = Request<ClearPlaybackStatsRequest>("""{"allItems":true}""");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request), "ClearPlaybackStatsRequest");

        var response = Assert.IsType<ClearPlaybackStatsResponse>(Value(ServerHostComposition.ClearPlaybackStats(request, operations, state)));

        Assert.Equal(2, response.ClearedCount);
        Assert.Equal((0, 0), (host.Session.ReadItemState("item-1")!.PlayCount, host.Session.ReadItemState("item-2")!.PlayCount));
        SingleEvent(state, "resyncRequired");
    }

    [Fact]
    public void ClearPlaybackStats_WithItemIds_ClearsOnlyThoseItems()
    {
        var (host, operations, state) = SeedPlayedItems();
        var request = Request<ClearPlaybackStatsRequest>("""{"itemIds":["item-2"]}""");

        var response = Assert.IsType<ClearPlaybackStatsResponse>(Value(ServerHostComposition.ClearPlaybackStats(request, operations, state)));

        Assert.Equal(1, response.ClearedCount);
        Assert.Equal((3, 0), (host.Session.ReadItemState("item-1")!.PlayCount, host.Session.ReadItemState("item-2")!.PlayCount));
        SingleEvent(state, "resyncRequired");
    }

    // A request that names no items is refused rather than read as every item, so an old client that sends
    // `itemPaths`, which this server doesn't read, can't clear the whole library.
    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"allItems":false}""")]
    [InlineData("""{"itemIds":null}""")]
    [InlineData("""{"itemIds":[]}""")]
    [InlineData("""{"itemIds":["  "]}""")]
    [InlineData("""{"itemPaths":["item-1"]}""")]
    [InlineData("""{"allItems":true,"itemIds":["item-1"]}""")]
    public void ClearPlaybackStats_WithoutExactlyOneOfAllItemsOrItemIds_IsRefusedAndClearsNothing(string json)
    {
        var (host, operations, state) = SeedPlayedItems();

        var result = ServerHostComposition.ClearPlaybackStats(Request<ClearPlaybackStatsRequest>(json), operations, state);

        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal((3, 5), (host.Session.ReadItemState("item-1")!.PlayCount, host.Session.ReadItemState("item-2")!.PlayCount));
        Assert.Empty(state.GetReplayAfter(0).Events);
    }

    [Fact]
    public void ApplyItemTags_PublishesTheItemIdsInTheCatalog()
    {
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("item-1", Path.Combine(_tempDir, "first.mp4")),
                new SeedItem("item-2", Path.Combine(_tempDir, "second.mp4"))
            ]);
        var state = new ServerStateService();
        var request = new ApplyItemTagsRequest { ItemIds = ["ITEM-1", "item-2", "missing"], AddTags = ["Night"] };

        ServerHostComposition.ApplyItemTags(request, state, CreateOperations(CatalogOpen.Host(_tempDir)));

        var payload = Assert.IsType<ItemTagsChangedPayload>(SingleEvent(state, "itemTagsChanged").Payload);
        Assert.Equal(["item-1", "item-2"], payload.ResolvedItemIds);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "ItemTagsChangedPayload");
    }

    [Fact]
    public void AutoTag_ScanFilesAndApplyResultsAndEvents_CarryItemIds()
    {
        var catPath = Path.Combine(_tempDir, "cat.mp4");
        var taggedPath = Path.Combine(_tempDir, "cat-tagged.mp4");
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("item-1", catPath) { FileName = "cat.mp4", RelativePath = "cat.mp4" },
                new SeedItem("item-2", taggedPath) { FileName = "cat-tagged.mp4", RelativePath = "cat-tagged.mp4", Tags = ["Cat"] }
            ],
            tags: [new SeedTag("Cat")]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));
        var state = new ServerStateService();

        var scan = operations.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = true });
        var files = Assert.Single(scan.Rows).Files;
        Assert.Equal(["item-1", "item-2"], files.Select(file => file.ItemId).Order(StringComparer.Ordinal));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(files[0]), "AutoTagMatchedFileResponse");

        var result = ServerHostComposition.ApplyAutoTags(
            new AutoTagApplyRequest { Assignments = [new AutoTagAssignment { TagName = "Cat", ItemPaths = [catPath, taggedPath] }] },
            operations,
            state);

        var response = Assert.IsType<AutoTagApplyResponse>(Value(result));
        var applied = Assert.Single(response.Applied);
        Assert.Equal(["item-1"], applied.ChangedItemIds);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "AutoTagApplyResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(applied), "AutoTagAppliedAssignment");
        var payload = Assert.IsType<ItemTagsChangedPayload>(SingleEvent(state, "itemTagsChanged").Payload);
        Assert.Equal(["item-1"], payload.ResolvedItemIds);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "ItemTagsChangedPayload");
    }

    [Fact]
    public void DuplicateApplyFailure_CarriesTheItemId()
    {
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("item-keep", Path.Combine(_tempDir, "keep.mp4")),
                new SeedItem("item-gone", Path.Combine(_tempDir, "gone.mp4"))
            ]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));

        var response = operations.ApplyDuplicateSelection(new DuplicateApplyRequest
        {
            Selections = [new DuplicateApplySelection { KeepItemId = "item-keep", ItemIds = ["item-keep", "item-gone"] }]
        });

        var failure = Assert.Single(response.Failures);
        Assert.Equal("item-gone", failure.ItemId);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(failure), "DuplicateApplyFailure");
    }

    [Fact]
    public void LibraryItems_CarryDurationInSecondsBesideTheDurationString()
    {
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("item-1", Path.Combine(_tempDir, "clip.mp4"))
                {
                    SourceId = "s1",
                    Duration = TimeSpan.FromSeconds(150.5)
                }
            ]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));

        var page = operations.QueryLibrary(new LibraryQueryRequest());
        var listed = Assert.Single(page.Body!["items"]!.AsArray())!;
        var read = operations.ReadLibraryItem("item-1")!;

        foreach (var item in new[] { listed, read })
        {
            Assert.Equal(150.5, item["durationSeconds"]!.GetValue<double>());
            Assert.Equal("00:02:30", item["duration"]!.GetValue<string>());
        }
    }

    [Fact]
    public void LibraryItems_CarryLoudnessAndPeak_AsTheSchemaNamesThem()
    {
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("measured", Path.Combine(_tempDir, "measured.mp4"))
                {
                    SourceId = "s1",
                    HasAudio = true,
                    IntegratedLoudness = -23.4,
                    PeakDb = -1.2
                },
                new SeedItem("unmeasured", Path.Combine(_tempDir, "unmeasured.mp4")) { SourceId = "s1" }
            ]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));

        var properties = OpenApiSpec.ReadSchemaProperties("LibraryProjectionItem");
        Assert.Contains("integratedLoudness", properties);
        Assert.Contains("peakDb", properties);

        var listed = operations.QueryLibrary(new LibraryQueryRequest()).Body!["items"]!.AsArray()
            .ToDictionary(item => item!["id"]!.GetValue<string>(), item => item!);
        foreach (var measured in new[] { listed["measured"], operations.ReadLibraryItem("measured")! })
        {
            Assert.Equal(-23.4, measured["integratedLoudness"]!.GetValue<double>());
            Assert.Equal(-1.2, measured["peakDb"]!.GetValue<double>());
        }

        // The server leaves a missing value out rather than sending null, as the schema's "present when" says.
        foreach (var unmeasured in new[] { listed["unmeasured"], operations.ReadLibraryItem("unmeasured")! })
        {
            Assert.False(unmeasured.AsObject().ContainsKey("integratedLoudness"));
            Assert.False(unmeasured.AsObject().ContainsKey("peakDb"));
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

    private static object? Value(IResult result)
    {
        return Assert.IsAssignableFrom<IValueHttpResult>(result).Value;
    }

    private static T Request<T>(string json)
    {
        return System.Text.Json.JsonSerializer.Deserialize<T>(json, OpenApiSpec.ServerJsonOptions)!;
    }

    private static ServerEventEnvelope SingleEvent(ServerStateService state, string eventType)
    {
        return Assert.Single(state.GetReplayAfter(0).Events, envelope => envelope.EventType == eventType);
    }

    private (LibraryCatalogHost Host, LibraryOperationsService Operations, ServerStateService State) SeedPlayedItems()
    {
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("item-1", Path.Combine(_tempDir, "first.mp4")) { PlayCount = 3 },
                new SeedItem("item-2", Path.Combine(_tempDir, "second.mp4")) { PlayCount = 5 }
            ]);
        var host = CatalogOpen.Host(_tempDir);
        return (host, CreateOperations(host), new ServerStateService());
    }

    private LibraryOperationsService CreateOperations(LibraryCatalogHost host)
    {
        return new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _tempDir);
    }

    private static LibraryPlaybackService CreatePlayback(LibraryCatalogHost host)
    {
        return new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host);
    }
}
