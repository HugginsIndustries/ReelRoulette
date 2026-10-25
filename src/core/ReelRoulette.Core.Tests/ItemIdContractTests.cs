using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Randomization;
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

        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(random), "RandomPickResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(random!.Cycle), "RandomPickCycleResponse");
        foreach (var response in new[] { random.Item!, played! })
        {
            Assert.Equal("item-1", response.ItemId);
            Assert.Equal(mediaPath, response.Id);
            OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "PlaybackItemResponse");
        }
    }

    // An empty pick still names its item, as null, and its cycle; the cycle route answers the cycle alone.
    [Fact]
    public void EmptyRandomPickAndCycleResponses_MatchTheirSchemas()
    {
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items: [new SeedItem("item-1", Path.Combine(_tempDir, "clip.mp4")) { SourceId = "s1", IsBlacklisted = true }]);
        var playback = CreatePlayback(CatalogOpen.Host(_tempDir));
        var request = new RandomRequest { PresetId = "all-media", ClientId = "device" };

        Assert.True(playback.TrySelectRandom(request, [], out var empty, out _, out _));
        Assert.True(playback.TryGetRandomCycle(request, [], out var cycle, out _, out _));

        var json = OpenApiSpec.SerializeAsServer(empty);
        OpenApiSpec.AssertMatchesSchema(json, "RandomPickResponse");
        Assert.Equal(System.Text.Json.JsonValueKind.Null, json.GetProperty("item").ValueKind);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(empty!.Cycle), "RandomPickCycleResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(cycle), "RandomPickCycleResponse");
    }

    [Fact]
    public void RandomRequests_MatchTheirSchemas()
    {
        var request = new RandomRequest { PresetId = "all-media", ClientId = "device", Options = new RandomPickOptionsRequest() };

        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request), "RandomRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request.Options), "RandomPickOptionsRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new RandomResetRequest { ClientId = "device" }), "RandomResetRequest");
    }

    // Each value the spec lists is one the server knows, so none reads as the default instead.
    [Fact]
    public void RandomPickOptions_ReadEveryValueTheSpecLists()
    {
        var spreads = OpenApiSpec.ReadSchemaPropertyEnum("RandomPickOptionsRequest", "spreadByTags");
        Assert.Equal(["off", "allTags", "byCategory"], spreads);
        Assert.Equal(
            [TagSpreadValue.Off, TagSpreadValue.AllTags, TagSpreadValue.ByCategory],
            spreads.Select(value => LibraryPlaybackService.ReadPickOptions(new RandomPickOptionsRequest { SpreadByTags = value }).SpreadByTags));

        var windows = OpenApiSpec.ReadSchemaPropertyEnum("RandomPickOptionsRequest", "rememberPlaysForDays")
            .Select(value => int.Parse(value, System.Globalization.CultureInfo.InvariantCulture))
            .ToList();
        Assert.Equal([1, 7, 30, 90], windows);
        Assert.Equal(
            windows.Select(days => (int?)days),
            windows.Select(days => LibraryPlaybackService.ReadPickOptions(new RandomPickOptionsRequest { RememberPlaysForDays = days }).RememberPlaysForDays));
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

        Assert.Equal("item-1", Assert.IsType<PlaybackItemResponse>(Value(result)).ItemId);
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
    public void Rating_SetsChangesAndClearsIt_AndPublishesEachChangeWithThePreviousRatingAndTheClient()
    {
        var path = Path.Combine(_tempDir, "clip.mp4");
        CatalogSeed.Write(_tempDir, items: [new SeedItem("item-1", path) { IsFavorite = true }]);
        var host = CatalogOpen.Host(_tempDir);
        var operations = CreateOperations(host);
        var state = new ServerStateService();

        var set = RatingAnswer(ServerHostComposition.SetRating(new RatingRequest { ItemId = "item-1", Rating = 3.5, ClientId = " client-a " }, state, operations));
        var changed = RatingAnswer(ServerHostComposition.SetRating(new RatingRequest { ItemId = "item-1", Rating = 5, ClientId = "client-b" }, state, operations));
        // The rating the item already has publishes nothing, and answers with the current revision.
        var same = RatingAnswer(ServerHostComposition.SetRating(new RatingRequest { ItemId = "item-1", Rating = 5 }, state, operations));
        // A request that names only a blank client gets an event that names none.
        var cleared = RatingAnswer(ServerHostComposition.SetRating(new RatingRequest { ItemId = "item-1", Rating = null, ClientId = " " }, state, operations));

        var events = state.GetReplayAfter(0).Events;
        Assert.Equal(["itemRatingChanged", "itemRatingChanged", "itemRatingChanged"], events.Select(envelope => envelope.EventType));
        var changes = events.Select(envelope => Assert.IsType<ItemRatingChangedPayload>(envelope.Payload)).ToList();
        Assert.All(changes, change => Assert.Equal(("item-1", path), (change.ItemId, change.Path)));
        Assert.Equal([(3.5, null), (5.0, 3.5), (null, 5.0)], changes.Select(change => (change.Rating, change.PreviousRating)));
        Assert.Equal(["client-a", "client-b", null], changes.Select(change => change.ClientId));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(changes[0]), "ItemRatingChangedPayload");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(changes[2]), "ItemRatingChangedPayload");

        Assert.Equal(("item-1", 3.5, events[0].Revision), (set.ItemId, set.Rating, set.Revision));
        Assert.Equal((5.0, events[1].Revision), (changed.Rating, changed.Revision));
        Assert.Equal((5.0, events[1].Revision), (same.Rating, same.Revision));
        Assert.Equal(((double?)null, events[2].Revision), (cleared.Rating, cleared.Revision));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(set), "ItemRatingResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(cleared), "ItemRatingResponse");
        var item = host.Session.ReadItemState("item-1")!;
        Assert.Equal(((int?)null, true), (item.RatingHalfStars, item.IsFavorite));
    }

    [Fact]
    public void Rating_RefusesAnEmptyIdOrARatingOffTheHalfStarSteps_AndAnItemNotInTheLibrary()
    {
        var path = Path.Combine(_tempDir, "clip.mp4");
        CatalogSeed.Write(_tempDir, items: [new SeedItem("item-1", path) { RatingHalfStars = 6 }]);
        var host = CatalogOpen.Host(_tempDir);
        var operations = CreateOperations(host);
        var state = new ServerStateService();
        int Status(string itemId, double? rating) => Assert.IsAssignableFrom<IStatusCodeHttpResult>(
            ServerHostComposition.SetRating(new RatingRequest { ItemId = itemId, Rating = rating }, state, operations)).StatusCode!.Value;

        Assert.Equal(StatusCodes.Status400BadRequest, Status("", 3));
        Assert.Equal(StatusCodes.Status400BadRequest, Status(" ", 3));
        foreach (var rating in new[] { 0, 0.25, 3.3, 5.5, -1 })
        {
            Assert.Equal(StatusCodes.Status400BadRequest, Status("item-1", rating));
        }

        Assert.Equal(StatusCodes.Status404NotFound, Status("missing", 3));
        Assert.Equal(StatusCodes.Status404NotFound, Status(path, 3));
        Assert.Equal(
            "The file is no longer in the library.",
            OpenApiSpec.ErrorReason(ServerHostComposition.SetRating(new RatingRequest { ItemId = "missing", Rating = 3 }, state, operations)));
        Assert.Empty(state.GetReplayAfter(0).Events);
        Assert.Equal(6, host.Session.ReadItemState("item-1")!.RatingHalfStars);
    }

    [Fact]
    public void LibraryItemRead_RefusesAnItemNotInTheLibrary()
    {
        CatalogSeed.Write(_tempDir, items: [new SeedItem("item-1", Path.Combine(_tempDir, "clip.mp4"))]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));

        var result = ServerHostComposition.ReadLibraryItem(new LibraryItemReadRequest { Id = "missing" }, operations);

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal("The file is no longer in the library.", OpenApiSpec.ErrorReason(result));
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
        Assert.All(results[..3], result => Assert.Equal("The file is no longer in the library.", OpenApiSpec.ErrorReason(result)));
        Assert.Empty(state.GetReplayAfter(0).Events);
        var item = host.Session.ReadItemState("item-1")!;
        Assert.Equal((false, false, 0), (item.IsFavorite, item.IsBlacklisted, item.PlayCount));
    }

    [Fact]
    public void ItemRoutes_ReadTheItemIdField_AnswerAsTheSpecNames_AndClearStatsReadsItemIds()
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

        var rating = Request<RatingRequest>("""{"itemId":"item-1","rating":3.5,"clientId":"client-a"}""");
        var cleared = Request<RatingRequest>("""{"itemId":"item-2","rating":null}""");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(rating), "RatingRequest");
        Assert.Equal((3.5, "client-a"), (rating.Rating, rating.ClientId));
        Assert.Null(cleared.Rating);
        // A request without the rating reads as null, so it clears the rating too.
        Assert.Null(Request<RatingRequest>("""{"itemId":"item-2"}""").Rating);

        // The favorite and blacklist routes answer with the schema the spec names as their 200 response.
        foreach (var answer in new[]
                 {
                     ServerHostComposition.SetFavorite(favorite, state, operations),
                     ServerHostComposition.SetBlacklist(blacklist, state, operations)
                 })
        {
            OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(Assert.IsType<LibraryStateResponse>(Value(answer))), "LibraryStateResponse");
        }

        Assert.IsType<RecordPlaybackResponse>(Value(ServerHostComposition.RecordPlayback(record, state, operations)));
        Assert.Equal(new CatalogPlaybackStatsClear(1, 1), operations.ClearPlaybackStats(clear));
        Assert.IsType<ItemRatingResponse>(Value(ServerHostComposition.SetRating(rating, state, operations)));
        Assert.IsType<ItemRatingResponse>(Value(ServerHostComposition.SetRating(cleared, state, operations)));

        var first = host.Session.ReadItemState("item-1")!;
        var second = host.Session.ReadItemState("item-2")!;
        Assert.Equal((true, false, 4, 7), (first.IsFavorite, first.IsBlacklisted, first.PlayCount, first.RatingHalfStars));
        Assert.Equal((false, true, 0, (int?)null), (second.IsFavorite, second.IsBlacklisted, second.PlayCount, second.RatingHalfStars));

        // The old field names no longer bind, so a request that sends them names no item.
        var oldFavorite = Request<FavoriteRequest>("""{"path":"item-1","isFavorite":false}""");
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsAssignableFrom<IStatusCodeHttpResult>(
            ServerHostComposition.SetFavorite(oldFavorite, state, operations)).StatusCode);
        Assert.Null(Request<ClearPlaybackStatsRequest>("""{"itemPaths":["item-1"]}""").ItemIds);
    }

    [Fact]
    public void ClearPlaybackStats_WithAllItems_ClearsEveryItem_AndCountsEveryItem()
    {
        var (host, operations, state) = SeedPlayedItems();
        var request = Request<ClearPlaybackStatsRequest>("""{"allItems":true}""");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request), "ClearPlaybackStatsRequest");

        var response = Assert.IsType<ClearPlaybackStatsResponse>(Value(ServerHostComposition.ClearPlaybackStats(request, operations, state)));

        // The unplayed item counts too.
        Assert.Equal(3, response.Count);
        Assert.Equal((0, 0), (host.Session.ReadItemState("item-1")!.PlayCount, host.Session.ReadItemState("item-2")!.PlayCount));
        SingleEvent(state, "resyncRequired");
    }

    [Fact]
    public void ClearPlaybackStats_WithItemIds_ClearsOnlyThoseItems_AndCountsTheNamedItemsInTheLibrary()
    {
        var (host, operations, state) = SeedPlayedItems();
        var request = Request<ClearPlaybackStatsRequest>("""{"itemIds":["item-2","unplayed","missing","item-2"]}""");

        var response = Assert.IsType<ClearPlaybackStatsResponse>(Value(ServerHostComposition.ClearPlaybackStats(request, operations, state)));

        // The unplayed item counts though it had no stats to clear, and the id no item has doesn't.
        Assert.Equal(2, response.Count);
        Assert.Equal((3, 0), (host.Session.ReadItemState("item-1")!.PlayCount, host.Session.ReadItemState("item-2")!.PlayCount));
        SingleEvent(state, "resyncRequired");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "ClearPlaybackStatsResponse");
    }

    [Fact]
    public void ClearPlaybackStats_PublishesResyncRequired_WithTheRevisionBeforeItAndItsOwn()
    {
        var (_, operations, state) = SeedPlayedItems();
        state.CreateEnvelope("earlier", new { });
        state.CreateEnvelope("earlier", new { });

        ServerHostComposition.ClearPlaybackStats(Request<ClearPlaybackStatsRequest>("""{"itemIds":["item-1"]}"""), operations, state);

        var envelope = SingleEvent(state, "resyncRequired");
        var payload = Assert.IsType<ResyncRequiredPayload>(envelope.Payload);
        Assert.Equal(3, envelope.Revision);
        Assert.Equal(("playbackStatsCleared", 2L, 3L), (payload.Reason, payload.LastEventId, payload.CurrentRevision));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "ResyncRequiredPayload");
    }

    [Fact]
    public void ClearPlaybackStats_ThatChangesNothing_PublishesNothing_AndEachClearLogsItsCounts()
    {
        var (_, operations, state) = SeedPlayedItems();

        var response = Assert.IsType<ClearPlaybackStatsResponse>(Value(ServerHostComposition.ClearPlaybackStats(
            Request<ClearPlaybackStatsRequest>("""{"itemIds":["unplayed","missing"]}"""),
            operations,
            state)));
        ServerHostComposition.ClearPlaybackStats(Request<ClearPlaybackStatsRequest>("""{"allItems":true}"""), operations, state);

        Assert.Equal(1, response.Count);
        Assert.Single(state.GetReplayAfter(0).Events);
        var lines = File.ReadAllLines(Path.Combine(_tempDir, "last.log"))
            .Where(line => line.Contains("Clear playback stats", StringComparison.Ordinal))
            .ToList();
        Assert.Equal(2, lines.Count);
        Assert.Contains("[info] Clear playback stats allItems=false count=1 changed=0 elapsedMs=", lines[0]);
        Assert.Contains("[info] Clear playback stats allItems=true count=3 changed=2 elapsedMs=", lines[1]);
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
        var request = new ApplyItemTagsRequest { ItemIds = ["item-1", "item-2", "missing"], AddTags = ["Night"] };

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
        }, out _);

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

    [Fact]
    public void LibraryItems_CarryTheirRatingInStars_AndLeaveItOutWhenUnrated()
    {
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("half", Path.Combine(_tempDir, "half.mp4")) { SourceId = "s1", RatingHalfStars = 7 },
                new SeedItem("full", Path.Combine(_tempDir, "full.jpg")) { SourceId = "s1", MediaType = 1, RatingHalfStars = 10 },
                new SeedItem("unrated", Path.Combine(_tempDir, "unrated.mp4")) { SourceId = "s1" }
            ]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));

        var listed = operations.QueryLibrary(new LibraryQueryRequest()).Body!["items"]!.AsArray()
            .ToDictionary(item => item!["id"]!.GetValue<string>(), item => item!);
        foreach (var (id, stars) in new[] { ("half", 3.5), ("full", 5.0) })
        {
            foreach (var item in new[] { listed[id], operations.ReadLibraryItem(id)! })
            {
                Assert.Equal(stars, item["rating"]!.GetValue<double>());
            }
        }

        foreach (var unrated in new[] { listed["unrated"], operations.ReadLibraryItem("unrated")! })
        {
            Assert.False(unrated.AsObject().ContainsKey("rating"));
        }
    }

    [Fact]
    public void LibraryItems_CarryTheirDatesAddedAndCreated_AndLeaveThemOutWhenUnknown()
    {
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("dated", Path.Combine(_tempDir, "dated.mp4"))
                {
                    SourceId = "s1",
                    DateAddedUtc = new DateTime(2030, 3, 4, 5, 6, 7, DateTimeKind.Utc),
                    LastWriteTimeUtc = new DateTime(2029, 8, 9, 10, 11, 12, DateTimeKind.Utc)
                },
                new SeedItem("undated", Path.Combine(_tempDir, "undated.mp4")) { SourceId = "s1" }
            ]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));

        var listed = operations.QueryLibrary(new LibraryQueryRequest()).Body!["items"]!.AsArray()
            .ToDictionary(item => item!["id"]!.GetValue<string>(), item => item!);
        foreach (var dated in new[] { listed["dated"], operations.ReadLibraryItem("dated")! })
        {
            Assert.Equal("2030-03-04T05:06:07.0000000Z", dated["dateAddedUtc"]!.GetValue<string>());
            Assert.Equal("2029-08-09T10:11:12.0000000Z", dated["dateCreatedUtc"]!.GetValue<string>());
            Assert.False(dated.AsObject().ContainsKey("lastWriteTimeUtc"));
        }

        foreach (var undated in new[] { listed["undated"], operations.ReadLibraryItem("undated")! })
        {
            Assert.False(undated.AsObject().ContainsKey("dateAddedUtc"));
            Assert.False(undated.AsObject().ContainsKey("dateCreatedUtc"));
        }
    }

    // An item with every optional value: its single read sends exactly the fields the schema names, but the browse
    // page's thumbnail layout fields, and the page sends only fields the schema names.
    [Fact]
    public void LibraryProjectionItem_NamesEveryFieldTheServerSends()
    {
        var at = new DateTime(2030, 3, 4, 5, 6, 7, DateTimeKind.Utc);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("s1", _tempDir)],
            items:
            [
                new SeedItem("full", Path.Combine(_tempDir, "full.mp4"))
                {
                    SourceId = "s1",
                    RelativePath = "full.mp4",
                    Duration = TimeSpan.FromSeconds(90),
                    HasAudio = true,
                    IntegratedLoudness = -20.5,
                    PeakDb = -1.5,
                    LoudnessError = "The scan failed.",
                    PlayCount = 2,
                    LastPlayedUtc = at,
                    Fingerprint = "abc",
                    FileSizeBytes = 42,
                    LastWriteTimeUtc = at,
                    FingerprintLastUtc = at,
                    FingerprintStatus = 1,
                    ThumbnailWidth = 320,
                    ThumbnailHeight = 180,
                    RatingHalfStars = 7,
                    DateAddedUtc = at,
                    Tags = ["Ann"]
                }
            ]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));
        var named = OpenApiSpec.ReadSchemaProperties("LibraryProjectionItem");
        string[] pageOnly = ["hasThumbnail", "thumbnailVersion", "thumbnailWidth", "thumbnailHeight"];

        var read = operations.ReadLibraryItem("full")!.AsObject().Select(property => property.Key).Order(StringComparer.Ordinal);
        Assert.Equal(named.Except(pageOnly), read);
        var page = operations.QueryLibrary(new LibraryQueryRequest()).Body!["items"]!.AsArray().Single()!.AsObject();
        Assert.All(page.Select(property => property.Key), field => Assert.Contains(field, named));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private static object? Value(IResult result)
    {
        return Assert.IsAssignableFrom<IValueHttpResult>(result).Value;
    }

    private static ItemRatingResponse RatingAnswer(IResult result)
    {
        return Assert.IsType<ItemRatingResponse>(Value(result));
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
                new SeedItem("item-2", Path.Combine(_tempDir, "second.mp4")) { PlayCount = 5 },
                new SeedItem("unplayed", Path.Combine(_tempDir, "unplayed.mp4"))
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
