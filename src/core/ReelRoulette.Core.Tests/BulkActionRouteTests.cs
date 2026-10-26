using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The routes that act on many items at once: every matching id for select all, bulk favorite, blacklist, and rating,
/// deleting files and duplicate apply, which deletes through the same code, tag apply, and the tag counts across many
/// items, each checked against shared/api/openapi.yaml.
/// </summary>
public sealed class BulkActionRouteTests : IDisposable
{
    private static readonly IPAddress LanClient = IPAddress.Parse("192.168.1.90");
    private static readonly IPAddress ServerLanAddress = IPAddress.Parse("192.168.1.10");

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "rr-bulk-action-tests", Guid.NewGuid().ToString("N"));
    private readonly string _dataDir;
    private readonly string _mediaDir;

    public BulkActionRouteTests()
    {
        _dataDir = Path.Combine(_tempDir, "data");
        _mediaDir = Path.Combine(_tempDir, "media");
        Directory.CreateDirectory(_dataDir);
        Directory.CreateDirectory(_mediaDir);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_tempDir, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public void QueryIds_ReturnsEveryMatch_PastOnePage_WithTheSearchAndFilter_AndLeavesOutDisabledSources()
    {
        var items = Enumerable.Range(0, LibraryQueryLimits.DefaultLimit + 50)
            .Select(index => new SeedItem($"on-{index}", $"/media/on/clip-{index}.mp4")
            {
                SourceId = "on",
                RelativePath = $"clip-{index}.mp4",
                IsFavorite = index % 3 == 0,
                IsBlacklisted = index == 1
            })
            .Concat(Enumerable.Range(0, 5).Select(index => new SeedItem($"off-{index}", $"/media/off/clip-{index}.mp4")
            {
                SourceId = "off",
                RelativePath = $"clip-{index}.mp4"
            }))
            .ToList();
        CatalogSeed.Write(
            _dataDir,
            sources: [new SeedSource("on", "/media/on"), new SeedSource("off", "/media/off", IsEnabled: false)],
            items: items);
        var operations = CreateOperations();
        var enabled = items.Where(item => item.SourceId == "on").ToList();

        var all = QueryIds(operations, new LibraryIdsQueryRequest());
        Assert.Equal(enabled.Select(item => item.Id).Order(StringComparer.Ordinal), all.Order(StringComparer.Ordinal));

        // A filter leaves blacklisted items out unless it says otherwise, as the library query does.
        var unfiltered = QueryIds(operations, new LibraryIdsQueryRequest { FilterState = Filter("{}") });
        Assert.Equal(enabled.Count - 1, unfiltered.Count);
        Assert.DoesNotContain("on-1", unfiltered);

        var searched = QueryIds(operations, new LibraryIdsQueryRequest { Search = "CLIP-1", FilterState = Filter("""{ "favoritesMode": "only" }""") });
        var expected = enabled
            .Where(item => item.RelativePath.StartsWith("clip-1", StringComparison.Ordinal) && item.IsFavorite)
            .Select(item => item.Id)
            .Order(StringComparer.Ordinal)
            .ToList();
        Assert.NotEmpty(expected);
        Assert.Equal(expected, searched.Order(StringComparer.Ordinal));

        // The same request to the library query matches the same items.
        var page = operations.QueryLibrary(new LibraryQueryRequest
        {
            Search = "CLIP-1",
            FilterState = Filter("""{ "favoritesMode": "only" }"""),
            Limit = LibraryQueryLimits.MaxLimit
        }).Body!;
        Assert.Equal(
            expected,
            page["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>()).Order(StringComparer.Ordinal));

        // One line for each of the three ids queries, with its count.
        var logLines = LogLines().Where(line => line.Contains("Library ids query", StringComparison.Ordinal)).ToList();
        Assert.Equal(3, logLines.Count);
        Assert.Contains($"total={all.Count} elapsedMs=", logLines[0]);
        Assert.Contains($"total={searched.Count} elapsedMs=", logLines[2]);
    }

    [Fact]
    public void QueryIds_WithItemIds_AnswersOnlyThoseThatMatch_EachOnce()
    {
        CatalogSeed.Write(
            _dataDir,
            sources: [new SeedSource("on", "/media/on"), new SeedSource("off", "/media/off", IsEnabled: false)],
            items:
            [
                new SeedItem("kept-1", "/media/on/clip-1.mp4") { SourceId = "on", RelativePath = "clip-1.mp4" },
                new SeedItem("kept-2", "/media/on/clip-2.mp4") { SourceId = "on", RelativePath = "clip-2.mp4" },
                new SeedItem("blacklisted", "/media/on/clip-3.mp4") { SourceId = "on", RelativePath = "clip-3.mp4", IsBlacklisted = true },
                new SeedItem("unsearched", "/media/on/other.mp4") { SourceId = "on", RelativePath = "other.mp4" },
                new SeedItem("disabled", "/media/off/clip-4.mp4") { SourceId = "off", RelativePath = "clip-4.mp4" },
                new SeedItem("not-asked", "/media/on/clip-5.mp4") { SourceId = "on", RelativePath = "clip-5.mp4" }
            ]);
        var operations = CreateOperations();

        var ids = QueryIds(operations, new LibraryIdsQueryRequest
        {
            Search = "clip",
            FilterState = Filter("{}"),
            ItemIds = ["kept-1", "kept-2", "kept-1", "blacklisted", "unsearched", "disabled", "missing", "KEPT-2"]
        });

        Assert.Equal(["kept-1", "kept-2"], ids.Order(StringComparer.Ordinal));
        Assert.Empty(QueryIds(operations, new LibraryIdsQueryRequest { FilterState = Filter("{}"), ItemIds = [] }));

        var logLines = LogLines().Where(line => line.Contains("Library ids query", StringComparison.Ordinal)).ToList();
        Assert.Contains("requested=7 total=2 elapsedMs=", logLines[0]);
        Assert.Contains("requested=0 total=0 elapsedMs=", logLines[1]);
    }

    [Fact]
    public void QueryIds_RefusesAFilterThatIsNotAnObject()
    {
        CatalogSeed.Write(_dataDir);

        var result = ServerHostComposition.QueryLibraryIds(new LibraryIdsQueryRequest { FilterState = Filter("[]") }, CreateOperations());

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
        Assert.Equal("filterState must be an object", OpenApiSpec.ErrorReason(result));
    }

    [Fact]
    public void BulkItemState_SetsAndClearsFavoriteAndBlacklist_AndPublishesOneEventWithTheChangedItems()
    {
        CatalogSeed.Write(
            _dataDir,
            items:
            [
                new SeedItem("plain", "/media/plain.mp4"),
                new SeedItem("favorite", "/media/favorite.mp4") { IsFavorite = true },
                new SeedItem("blacklisted", "/media/blacklisted.mp4") { IsBlacklisted = true }
            ]);
        var operations = CreateOperations();
        var state = new ServerStateService();
        string[] ids = ["plain", "favorite", "blacklisted", "missing", "plain", "PLAIN"];
        var catalogRevision = CatalogOpen.Host(_dataDir).Session.Revision;

        var favorite = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = [.. ids], Flag = "favorite", Value = true, ClientId = " client-a " },
            state,
            operations);

        // One write and one event for the request, naming only the items it changed; setting favorite clears blacklist.
        Assert.Equal(3, BulkCount(favorite));
        Assert.Equal(catalogRevision + 1, CatalogOpen.Host(_dataDir).Session.Revision);
        var favoriteEvent = Assert.IsType<BulkItemStateChangedPayload>(Assert.Single(state.GetReplayAfter(0).Events).Payload);
        Assert.Equal(("favorite", true, 3, "client-a"), (favoriteEvent.Flag, favoriteEvent.Value, favoriteEvent.Count, favoriteEvent.ClientId));
        Assert.Equal(
            [("plain", true, false, false, false), ("blacklisted", true, false, false, true)],
            favoriteEvent.Items.Select(Describe));
        AssertFlags("plain", true, false);
        AssertFlags("favorite", true, false);
        AssertFlags("blacklisted", true, false);

        var revision = state.GetCurrentRevision();
        var blacklist = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = ["plain", "favorite"], Flag = "blacklist", Value = true, ClientId = "client-b" },
            state,
            operations);
        Assert.Equal(2, BulkCount(blacklist));
        var blacklistEvent = Assert.IsType<BulkItemStateChangedPayload>(Assert.Single(state.GetReplayAfter(revision).Events).Payload);
        Assert.Equal(
            [("plain", false, true, true, false), ("favorite", false, true, true, false)],
            blacklistEvent.Items.Select(Describe));
        AssertFlags("plain", false, true);
        AssertFlags("blacklisted", true, false);

        // Clearing a flag leaves the other one, and an item that already has the state is counted but not listed.
        revision = state.GetCurrentRevision();
        var cleared = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = ["plain", "blacklisted"], Flag = "blacklist", Value = false },
            state,
            operations);
        Assert.Equal(2, BulkCount(cleared));
        var clearedEvent = Assert.IsType<BulkItemStateChangedPayload>(Assert.Single(state.GetReplayAfter(revision).Events).Payload);
        Assert.Equal([("plain", false, false, false, true)], clearedEvent.Items.Select(Describe));
        Assert.Null(clearedEvent.ClientId);
        AssertFlags("plain", false, false);
        AssertFlags("blacklisted", true, false);

        revision = state.GetCurrentRevision();
        var unfavorited = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = ["blacklisted"], Flag = "favorite", Value = false },
            state,
            operations);
        Assert.Equal(1, BulkCount(unfavorited));
        Assert.Single(state.GetReplayAfter(revision).Events);
        AssertFlags("blacklisted", false, false);

        // Each bulk request writes one line with its counts, and a single item's favorite writes none.
        Assert.NotNull(operations.SetFavorite("plain", isFavorite: true));
        var lines = LogLines().Where(line => line.Contains("Bulk item state", StringComparison.Ordinal)).ToList();
        Assert.Equal(4, lines.Count);
        Assert.Contains("[info] Bulk item state flag=favorite value=true count=3 changed=2 elapsedMs=", lines[0]);
        Assert.Contains("[info] Bulk item state flag=blacklist value=false count=2 changed=1 elapsedMs=", lines[2]);

        var json = OpenApiSpec.SerializeAsServer(favoriteEvent);
        OpenApiSpec.AssertMatchesSchema(json, "BulkItemStateChangedPayload");
        OpenApiSpec.AssertMatchesSchema(json.GetProperty("items")[0], "BulkItemState");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(Value(favorite)), "BulkChangeResponse");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(new BulkItemStateRequest { ItemIds = ["plain"], Flag = "favorite", ClientId = "client-a" }),
            "BulkItemStateRequest");
        Assert.Equal(["favorite", "blacklist"], OpenApiSpec.ReadSchemaPropertyEnum("BulkItemStateRequest", "flag"));
        Assert.Equal(["favorite", "blacklist"], OpenApiSpec.ReadSchemaPropertyEnum("BulkItemStateChangedPayload", "flag"));
    }

    [Fact]
    public void BulkItemState_WithNoNamedItemInTheLibrary_AnswersZeroAndPublishesNothing()
    {
        CatalogSeed.Write(_dataDir, items: [new SeedItem("item-1", "/media/one.mp4")]);
        var state = new ServerStateService();

        var result = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = ["missing", "ITEM-1"], Flag = "favorite", Value = true },
            state,
            CreateOperations());

        Assert.Equal(0, BulkCount(result));
        Assert.Empty(state.GetReplayAfter(0).Events);
        AssertFlags("item-1", false, false);
    }

    [Theory]
    [InlineData(null, "favorite", "itemIds is required")]
    [InlineData(" ", "favorite", "itemIds is required")]
    [InlineData("item-1", null, "flag must be favorite or blacklist")]
    [InlineData("item-1", "rating", "flag must be favorite or blacklist")]
    public void BulkItemState_RefusesNoIdsOrAnUnknownFlag(string? itemId, string? flag, string error)
    {
        CatalogSeed.Write(_dataDir, items: [new SeedItem("item-1", "/media/one.mp4")]);
        var state = new ServerStateService();

        var result = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = itemId == null ? null : [itemId], Flag = flag, Value = true },
            state,
            CreateOperations());

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
        Assert.Equal(error, OpenApiSpec.ErrorReason(result));
        Assert.Empty(state.GetReplayAfter(0).Events);
    }

    [Fact]
    public void BulkRating_SetsAndClearsOneRating_AndPublishesOneEventWithEachChangedItemsPreviousRating()
    {
        CatalogSeed.Write(
            _dataDir,
            items:
            [
                new SeedItem("unrated", "/media/unrated.mp4"),
                new SeedItem("rated", "/media/rated.mp4") { RatingHalfStars = 3 },
                new SeedItem("already", "/media/already.mp4") { RatingHalfStars = 9, IsFavorite = true }
            ]);
        var operations = CreateOperations();
        var state = new ServerStateService();

        var set = ServerHostComposition.SetBulkRating(
            new BulkRatingRequest { ItemIds = ["unrated", "rated", "already", "missing"], Rating = 4.5, ClientId = "client-a" },
            state,
            operations);

        Assert.Equal(3, BulkCount(set));
        var setEvent = Assert.IsType<BulkItemRatingChangedPayload>(Assert.Single(state.GetReplayAfter(0).Events).Payload);
        Assert.Equal((4.5, 3, "client-a"), (setEvent.Rating, setEvent.Count, setEvent.ClientId));
        Assert.Equal(
            [("unrated", (double?)4.5, (double?)null), ("rated", 4.5, 1.5)],
            setEvent.Items.Select(item => (item.ItemId, item.Rating, item.PreviousRating)));
        var host = CatalogOpen.Host(_dataDir);
        Assert.All(["unrated", "rated", "already"], id => Assert.Equal(9, host.Session.ReadItemState(id)!.RatingHalfStars));
        Assert.True(host.Session.ReadItemState("already")!.IsFavorite);

        var revision = state.GetCurrentRevision();
        var cleared = ServerHostComposition.SetBulkRating(new BulkRatingRequest { ItemIds = ["rated"], Rating = null }, state, operations);
        Assert.Equal(1, BulkCount(cleared));
        var clearedEvent = Assert.IsType<BulkItemRatingChangedPayload>(Assert.Single(state.GetReplayAfter(revision).Events).Payload);
        Assert.Null(clearedEvent.Rating);
        Assert.Equal([("rated", (double?)null, (double?)4.5)], clearedEvent.Items.Select(item => (item.ItemId, item.Rating, item.PreviousRating)));
        Assert.Null(host.Session.ReadItemState("rated")!.RatingHalfStars);

        revision = state.GetCurrentRevision();
        Assert.Equal(0, BulkCount(ServerHostComposition.SetBulkRating(new BulkRatingRequest { ItemIds = ["missing"], Rating = 2 }, state, operations)));
        Assert.Empty(state.GetReplayAfter(revision).Events);

        // Each bulk request writes one line with its counts, and a single item's rating writes none.
        Assert.NotNull(operations.SetRating("rated", 4));
        var lines = LogLines().Where(line => line.Contains("Bulk rating", StringComparison.Ordinal)).ToList();
        Assert.Equal(3, lines.Count);
        Assert.Contains("[info] Bulk rating rating=4.5 count=3 changed=2 elapsedMs=", lines[0]);
        Assert.Contains("[info] Bulk rating rating=none count=1 changed=1 elapsedMs=", lines[1]);

        var json = OpenApiSpec.SerializeAsServer(setEvent);
        OpenApiSpec.AssertMatchesSchema(json, "BulkItemRatingChangedPayload");
        OpenApiSpec.AssertMatchesSchema(json.GetProperty("items")[0], "BulkItemRating");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(Value(set)), "BulkChangeResponse");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(new BulkRatingRequest { ItemIds = ["rated"], Rating = 3, ClientId = "client-a" }),
            "BulkRatingRequest");
    }

    [Theory]
    [InlineData(null, 3.0, "itemIds is required")]
    [InlineData("item-1", 0.0, "rating must be a multiple of 0.5 from 0.5 to 5, or null")]
    [InlineData("item-1", 3.2, "rating must be a multiple of 0.5 from 0.5 to 5, or null")]
    public void BulkRating_RefusesNoIdsOrARatingTheSingleRouteRefuses(string? itemId, double rating, string error)
    {
        CatalogSeed.Write(_dataDir, items: [new SeedItem("item-1", "/media/one.mp4") { RatingHalfStars = 2 }]);
        var operations = CreateOperations();
        var state = new ServerStateService();

        var bulk = ServerHostComposition.SetBulkRating(
            new BulkRatingRequest { ItemIds = itemId == null ? null : [itemId], Rating = rating },
            state,
            operations);

        Assert.Equal(StatusCodes.Status400BadRequest, Status(bulk));
        Assert.Equal(error, OpenApiSpec.ErrorReason(bulk));
        if (itemId != null)
        {
            Assert.Equal(
                OpenApiSpec.ErrorReason(ServerHostComposition.SetRating(new RatingRequest { ItemId = itemId, Rating = rating }, state, operations)),
                OpenApiSpec.ErrorReason(bulk));
        }

        Assert.Empty(state.GetReplayAfter(0).Events);
        Assert.Equal(2, CatalogOpen.Host(_dataDir).Session.ReadItemState("item-1")!.RatingHalfStars);
    }

    [Fact]
    public void DeleteFiles_DeletesTheFilesAndRemovesTheirItemsAndTags_AndKeepsTheItemsItCouldNotDelete()
    {
        var first = MediaFile("first.mp4");
        var second = MediaFile("second.mp4");
        var lockedDir = Path.Combine(_mediaDir, "locked");
        Directory.CreateDirectory(lockedDir);
        var locked = Path.Combine(lockedDir, "locked.mp4");
        File.WriteAllBytes(locked, [0x01]);
        CatalogSeed.Write(
            _dataDir,
            items:
            [
                new SeedItem("first", first) { Tags = ["Night"] },
                new SeedItem("second", second),
                new SeedItem("gone", Path.Combine(_mediaDir, "gone.mp4")),
                new SeedItem("locked", locked) { Tags = ["Night"] },
                new SeedItem("kept", MediaFile("kept.mp4")) { Tags = ["Night"] }
            ],
            tags: [new SeedTag("Night")]);
        var state = new ServerStateService();
        MakeUndeletable(locked);
        IResult result;
        try
        {
            result = DeleteFiles(Local(), ["first", "second", "gone", "locked", "missing", "first"], state);
        }
        finally
        {
            MakeDeletable(locked);
        }

        var response = Assert.IsType<DeleteFilesResponse>(Value(result));
        Assert.Equal(2, response.DeletedCount);
        Assert.Equal(["gone", "locked"], response.FailedItemIds);
        Assert.False(File.Exists(first));
        Assert.False(File.Exists(second));
        Assert.True(File.Exists(locked));

        var catalog = LibraryCatalogStoreRead();
        Assert.Equal(["gone", "kept", "locked"], catalog.Items.Select(item => item.Id).Order(StringComparer.Ordinal));
        Assert.Equal(["Night"], catalog.Items.Single(item => item.Id == "locked").Tags);
        Assert.Equal(0, CountItemTagRows("first"));
        Assert.Equal(1, CountItemTagRows("locked"));

        var envelope = Assert.Single(state.GetReplayAfter(0).Events);
        Assert.Equal("itemsRemoved", envelope.EventType);
        var removed = Assert.IsType<ItemsRemovedPayload>(envelope.Payload);
        Assert.Equal(["first", "second"], removed.ItemIds);

        var lines = LogLines();
        var summary = Assert.Single(lines, line => line.Contains("[info] Delete files", StringComparison.Ordinal));
        Assert.Contains("found=4 deleted=2 removed=2 failed=2 elapsedMs=", summary);
        var warning = Assert.Single(lines, line => line.Contains("[warn] Delete files", StringComparison.Ordinal));
        Assert.Contains("missing=1", warning);
        Assert.Contains("UnauthorizedAccessException", warning);
        Assert.All(lines, line => Assert.DoesNotContain(_mediaDir, line));
        Assert.All(lines, line => Assert.DoesNotContain(".mp4", line));

        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "DeleteFilesResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(removed), "ItemsRemovedPayload");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new DeleteFilesRequest { ItemIds = ["first"] }), "DeleteFilesRequest");
    }

    [Fact]
    public void DeleteFiles_ThatRemovesNothing_PublishesNothing()
    {
        CatalogSeed.Write(_dataDir, items: [new SeedItem("gone", Path.Combine(_mediaDir, "gone.mp4"))]);
        var state = new ServerStateService();

        var response = Assert.IsType<DeleteFilesResponse>(Value(DeleteFiles(Local(), ["gone", "missing"], state)));

        Assert.Equal(0, response.DeletedCount);
        Assert.Equal(["gone"], response.FailedItemIds);
        Assert.Empty(state.GetReplayAfter(0).Events);
        Assert.Single(LibraryCatalogStoreRead().Items);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(" ")]
    public void DeleteFiles_RefusesNoIds(string? itemId)
    {
        CatalogSeed.Write(_dataDir);

        var result = DeleteFiles(Local(), itemId == null ? null : [itemId], new ServerStateService());

        Assert.Equal(StatusCodes.Status400BadRequest, Status(result));
        Assert.Equal("itemIds is required", OpenApiSpec.ErrorReason(result));
    }

    [Fact]
    public void DeleteFiles_FromAnotherMachine_NeedsAControlSessionOrTheControlToken()
    {
        var path = MediaFile("clip.mp4");
        CatalogSeed.Write(_dataDir, items: [new SeedItem("clip", path)]);
        var settings = new CoreSettingsService(new ServerRuntimeOptions(), _dataDir);
        var sessions = new ServerSessionStore();
        var options = new ServerRuntimeOptions();
        var state = new ServerStateService();

        var refused = DeleteFiles(Lan(), ["clip"], state, settings, sessions, options);

        Assert.Equal(StatusCodes.Status403Forbidden, Status(refused));
        var body = OpenApiSpec.SerializeAsServer(Value(refused));
        Assert.Equal("Deleting files is an admin action, which needs the server's control token.", body.GetProperty("error").GetString());
        Assert.Equal("control_token_required", body.GetProperty("code").GetString());
        Assert.True(File.Exists(path));
        Assert.Empty(state.GetReplayAfter(0).Events);

        var wrongToken = Lan();
        wrongToken.Request.Headers.Authorization = "Bearer wrong-token";
        Assert.Equal(StatusCodes.Status403Forbidden, Status(DeleteFiles(wrongToken, ["clip"], state, settings, sessions, options)));
        Assert.Equal(
            2,
            LogLines().Count(line => line.Contains("[warn] Delete files refused from 192.168.1.90: no control session or control token.", StringComparison.Ordinal)));

        var withSession = Lan();
        var sessionId = sessions.CreateSession(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow, TimeSpan.FromHours(1));
        withSession.Request.Headers.Cookie = $"{options.ControlAdminCookieName}={sessionId}";
        Assert.True(ServerPairingAuthMiddleware.IsControlRequestAuthorized(withSession, options, sessions, settings));

        var withToken = Lan();
        withToken.Request.Headers.Authorization = $"Bearer {settings.GetControlRuntimeSettings().AdminSharedToken}";
        var allowed = DeleteFiles(withToken, ["clip"], state, settings, sessions, options);
        Assert.Equal(1, Assert.IsType<DeleteFilesResponse>(Value(allowed)).DeletedCount);
        Assert.False(File.Exists(path));
    }

    [Fact]
    public void DuplicateApply_FromAnotherMachine_NeedsTheControlCheck_AndPublishesItemsRemoved()
    {
        var keep = MediaFile("keep.mp4");
        var copy = MediaFile("copy.mp4");
        CatalogSeed.Write(_dataDir, items: [new SeedItem("keep", keep), new SeedItem("copy", copy)]);
        var state = new ServerStateService();
        var request = new DuplicateApplyRequest
        {
            Selections = [new DuplicateApplySelection { KeepItemId = "keep", ItemIds = ["keep", "copy"] }]
        };

        var refused = ApplyDuplicates(Lan(), request, state);

        Assert.Equal(StatusCodes.Status403Forbidden, Status(refused));
        var body = OpenApiSpec.SerializeAsServer(Value(refused));
        Assert.Equal("Deleting files is an admin action, which needs the server's control token.", body.GetProperty("error").GetString());
        Assert.Equal("control_token_required", body.GetProperty("code").GetString());
        Assert.True(File.Exists(copy));
        Assert.Empty(state.GetReplayAfter(0).Events);
        Assert.Single(
            LogLines(),
            line => line.Contains("[warn] Duplicate apply refused from 192.168.1.90: no control session or control token.", StringComparison.Ordinal));

        var response = Assert.IsType<DuplicateApplyResponse>(Value(ApplyDuplicates(Local(), request, state)));

        Assert.Equal((1, 1), (response.DeletedOnDisk, response.RemovedFromLibrary));
        Assert.False(File.Exists(copy));
        Assert.True(File.Exists(keep));
        var envelope = Assert.Single(state.GetReplayAfter(0).Events);
        Assert.Equal("itemsRemoved", envelope.EventType);
        Assert.Equal(["copy"], Assert.IsType<ItemsRemovedPayload>(envelope.Payload).ItemIds);

        // A second apply finds nothing to delete, so it publishes nothing.
        var revision = state.GetCurrentRevision();
        Assert.Equal(0, Assert.IsType<DuplicateApplyResponse>(Value(ApplyDuplicates(Local(), request, state))).RemovedFromLibrary);
        Assert.Empty(state.GetReplayAfter(revision).Events);
    }

    [Fact]
    public void DuplicateApply_LogsItsCounts_AndAWarningForTheFilesItKept()
    {
        var keep = MediaFile("keep.mp4");
        var copy = MediaFile("copy.mp4");
        CatalogSeed.Write(
            _dataDir,
            items: [new SeedItem("keep", keep), new SeedItem("copy", copy), new SeedItem("gone", Path.Combine(_mediaDir, "gone.mp4"))]);
        var request = new DuplicateApplyRequest
        {
            Selections = [new DuplicateApplySelection { KeepItemId = "keep", ItemIds = ["keep", "copy", "gone"] }]
        };

        var response = Assert.IsType<DuplicateApplyResponse>(Value(ApplyDuplicates(Local(), request, new ServerStateService())));

        Assert.Equal((1, 1), (response.DeletedOnDisk, response.RemovedFromLibrary));
        var lines = LogLines();
        var summary = Assert.Single(lines, line => line.Contains("[info] Duplicate apply", StringComparison.Ordinal));
        Assert.Contains("found=2 deleted=1 removed=1 failed=1 elapsedMs=", summary);
        var warning = Assert.Single(lines, line => line.Contains("[warn] Duplicate apply", StringComparison.Ordinal));
        Assert.Contains("kept 1 items: missing=1 errors=[]", warning);
        Assert.All(lines, line => Assert.DoesNotContain(_mediaDir, line));
        Assert.All(lines, line => Assert.DoesNotContain(".mp4", line));
    }

    [Theory]
    [InlineData("POST /api/library/delete-files")]
    [InlineData("POST /api/duplicates/apply")]
    public void FileDeletionRoutes_ListTheirControlTokenRefusal(string route)
    {
        var operation = OpenApiSpec.ReadOperationText(route);

        Assert.Contains("\"403\":", operation);
        Assert.Contains("code: control_token_required", operation);
        Assert.Contains("error: Deleting files is an admin action, which needs the server's control token.", operation);
    }

    // Past 1,000 listed items, a bulk event is replaced by resyncRequired, so one change can't send every device megabytes.
    [Theory]
    [InlineData(1000)]
    [InlineData(1001)]
    public void BulkItemState_PublishesItsEventUpToTheCap_AndResyncRequiredInItsPlacePastIt(int changed)
    {
        var ids = SeedItems(changed);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));

        var result = ServerHostComposition.SetBulkItemState(
            new BulkItemStateRequest { ItemIds = ids, Flag = "favorite", Value = true },
            state,
            CreateOperations());

        Assert.Equal(changed, BulkCount(result));
        AssertListedOrReplaced(state, "bulkItemStateChanged", changed, payload =>
            Assert.Equal(changed, Assert.IsType<BulkItemStateChangedPayload>(payload).Items.Count));
    }

    [Theory]
    [InlineData(1000)]
    [InlineData(1001)]
    public void BulkRating_PublishesItsEventUpToTheCap_AndResyncRequiredInItsPlacePastIt(int changed)
    {
        var ids = SeedItems(changed);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));

        var result = ServerHostComposition.SetBulkRating(new BulkRatingRequest { ItemIds = ids, Rating = 3 }, state, CreateOperations());

        Assert.Equal(changed, BulkCount(result));
        AssertListedOrReplaced(state, "bulkItemRatingChanged", changed, payload =>
            Assert.Equal(changed, Assert.IsType<BulkItemRatingChangedPayload>(payload).Items.Count));
    }

    [Theory]
    [InlineData(1000)]
    [InlineData(1001)]
    public void DeleteFiles_PublishesItemsRemovedUpToTheCap_AndResyncRequiredInItsPlacePastIt(int removed)
    {
        var ids = SeedItems(removed, withFiles: true);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));

        var response = Assert.IsType<DeleteFilesResponse>(Value(DeleteFiles(Local(), ids, state)));

        Assert.Equal(removed, response.DeletedCount);
        AssertListedOrReplaced(state, "itemsRemoved", removed, payload =>
            Assert.Equal(ids, Assert.IsType<ItemsRemovedPayload>(payload).ItemIds));
    }

    [Fact]
    public void ApplyItemTags_AnswersTheNamedItemsInTheLibrary_AndLogsItsCounts_MatchingItsSchema()
    {
        CatalogSeed.Write(
            _dataDir,
            items:
            [
                new SeedItem("one", "/media/one.mp4") { Tags = ["Night"] },
                new SeedItem("two", "/media/two.mp4"),
                new SeedItem("three", "/media/three.mp4") { Tags = ["Night", "Day"] }
            ],
            tags: [new SeedTag("Night"), new SeedTag("Day")]);
        var state = new ServerStateService();

        var result = ServerHostComposition.ApplyItemTags(
            new ApplyItemTagsRequest { ItemIds = ["one", "two", "three", "missing", "two"], AddTags = ["Night"], RemoveTags = ["Day"] },
            state,
            CreateOperations());

        // "one" already has Night and lacks Day, so two of the three items change, and the count is all three.
        var json = OpenApiSpec.SerializeAsServer(Assert.IsType<BulkChangeResponse>(Value(result)));
        Assert.Equal(3, json.GetProperty("count").GetInt32());
        Assert.Equal(["count"], json.EnumerateObject().Select(property => property.Name));
        OpenApiSpec.AssertMatchesSchema(json, "BulkChangeResponse");
        Assert.Equal(["count"], OpenApiSpec.ReadSchemaRequired("BulkChangeResponse"));
        var operation = OpenApiSpec.ReadOperationText("POST /api/tag-editor/apply-item-tags");
        var ok = operation[operation.IndexOf("\"200\":", StringComparison.Ordinal)..operation.IndexOf("\"400\":", StringComparison.Ordinal)];
        Assert.Contains("$ref: \"#/components/schemas/BulkChangeResponse\"", ok);

        var line = Assert.Single(LogLines(), line => line.Contains("Apply item tags", StringComparison.Ordinal));
        Assert.Contains("[info] Apply item tags adds=1 removes=1 count=3 changed=2 elapsedMs=", line);
        Assert.DoesNotContain("Night", line);
        Assert.DoesNotContain("Day", line);
    }

    [Fact]
    public void ApplyItemTags_LogsAnApplyThatChangesNothing()
    {
        CatalogSeed.Write(_dataDir, items: [new SeedItem("one", "/media/one.mp4") { Tags = ["Night"] }], tags: [new SeedTag("Night")]);

        var result = ServerHostComposition.ApplyItemTags(
            new ApplyItemTagsRequest { ItemIds = ["one"], AddTags = ["Night"] },
            new ServerStateService(),
            CreateOperations());

        Assert.Equal(StatusCodes.Status409Conflict, Status(result));
        var line = Assert.Single(LogLines(), line => line.Contains("Apply item tags", StringComparison.Ordinal));
        Assert.Contains("[info] Apply item tags adds=1 removes=0 count=1 changed=0 elapsedMs=", line);
    }

    [Theory]
    [InlineData(1000)]
    [InlineData(1001)]
    public void ApplyItemTags_PublishesItemTagsChangedUpToTheCap_AndResyncRequiredInItsPlacePastIt(int named)
    {
        var ids = SeedItems(named, tags: ["Night"]);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));

        var result = ServerHostComposition.ApplyItemTags(
            new ApplyItemTagsRequest { ItemIds = ids, AddTags = ["Day"], RemoveTags = ["Night"] },
            state,
            CreateOperations());

        Assert.Equal(named, BulkCount(result));
        AssertListedOrReplaced(state, "itemTagsChanged", named, payload =>
            Assert.Equal(ids, Assert.IsType<ItemTagsChangedPayload>(payload).ResolvedItemIds));
    }

    [Theory]
    [InlineData(1000)]
    [InlineData(1001)]
    public void AutoTagApply_PublishesItemTagsChangedUpToTheCap_AndResyncRequiredInItsPlacePastIt(int changed)
    {
        SeedItems(changed, tags: ["Night"]);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));
        var paths = Enumerable.Range(0, changed).Select(index => Path.Combine(_mediaDir, $"clip-{index}.mp4")).ToList();

        var result = ServerHostComposition.ApplyAutoTags(
            new AutoTagApplyRequest { Assignments = [new AutoTagAssignment { TagName = "Day", ItemPaths = paths }] },
            CreateOperations(),
            state);

        Assert.Equal(changed, Assert.Single(Assert.IsType<AutoTagApplyResponse>(Value(result)).Applied).ChangedItemIds.Count);
        AssertListedOrReplaced(state, "itemTagsChanged", changed, payload =>
            Assert.Equal(changed, Assert.IsType<ItemTagsChangedPayload>(payload).ResolvedItemIds.Count));
    }

    // A resync makes every device reload everything, so one stands in for every tag past the cap, while a tag within it
    // still lists its files.
    [Fact]
    public void AutoTagApply_PublishesOneResyncRequired_InPlaceOfEveryTagPastTheCap()
    {
        SeedItems(1001, tags: ["Night"]);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));
        var paths = Enumerable.Range(0, 1001).Select(index => Path.Combine(_mediaDir, $"clip-{index}.mp4")).ToList();

        ServerHostComposition.ApplyAutoTags(
            new AutoTagApplyRequest
            {
                Assignments =
                [
                    new AutoTagAssignment { TagName = "Day", ItemPaths = paths },
                    new AutoTagAssignment { TagName = "Dawn", ItemPaths = paths.Take(2).ToList() },
                    new AutoTagAssignment { TagName = "Dusk", ItemPaths = paths }
                ]
            },
            CreateOperations(),
            state);

        var events = state.GetReplayAfter(0).Events.Where(envelope => envelope.EventType != "tagCatalogChanged").ToList();
        Assert.Equal(["itemTagsChanged", "resyncRequired"], events.Select(envelope => envelope.EventType));
        var dawn = Assert.IsType<ItemTagsChangedPayload>(events[0].Payload);
        Assert.Equal("Dawn", Assert.Single(dawn.AddedTags));
        Assert.Equal(2, dawn.ResolvedItemIds.Count);
        Assert.Equal("itemTagsChanged", Assert.IsType<ResyncRequiredPayload>(events[1].Payload).Reason);
        var line = Assert.Single(LogLines(), line => line.Contains("in place of", StringComparison.Ordinal));
        Assert.Contains("[info] Published resyncRequired in place of 2 itemTagsChanged events, which would have listed 2002 items.", line);
    }

    // Other devices retarget their filters from a rename's or delete's itemTagsChanged, so it lists every item.
    [Fact]
    public void RenameTag_ListsEveryItemThatHeldTheTag_PastTheCap()
    {
        var ids = SeedItems(1001, tags: ["Night"]);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));

        ServerHostComposition.RenameTag(new RenameTagRequest { OldName = "Night", NewName = "Evening" }, state, CreateOperations());

        var renamed = SingleItemTagsChanged(state);
        Assert.Equal(ids, renamed.ResolvedItemIds);
        Assert.Equal(("Night", "Evening"), (renamed.CatalogReplacedTag, renamed.CatalogReplacementTag));
    }

    [Fact]
    public void DeleteTag_ListsEveryItemThatHeldTheTag_PastTheCap()
    {
        var ids = SeedItems(1001, tags: ["Night"]);
        var state = new ServerStateService(serverLog: new ServerLogService(_dataDir));

        ServerHostComposition.DeleteTag(new DeleteTagRequest { Name = "Night" }, state, CreateOperations());

        var deleted = SingleItemTagsChanged(state);
        Assert.Equal(ids, deleted.ResolvedItemIds);
        Assert.Equal("Night", deleted.CatalogReplacedTag);
    }

    [Fact]
    public void TagModel_CountsEachTagAcrossTheItems_IgnoringCase_MatchingItsSchemas()
    {
        CatalogSeed.Write(
            _dataDir,
            items:
            [
                new SeedItem("one", "/media/one.mp4") { Tags = ["Night", "Ann"] },
                new SeedItem("two", "/media/two.mp4") { Tags = ["night"] },
                new SeedItem("three", "/media/three.mp4") { Tags = ["Ann"] },
                new SeedItem("other", "/media/other.mp4") { Tags = ["Other"] }
            ],
            tags: [new SeedTag("Night"), new SeedTag("Ann"), new SeedTag("Other")]);
        var operations = CreateOperations();
        var request = new TagEditorModelRequest { ItemIds = ["one", "two", "three", "missing", "one", "ONE"] };

        var counts = operations.GetTagEditorModel(request);

        Assert.Equal(3, counts.ItemCount);
        // "Night" and "night" are one tag, named as one of the items holds it.
        Assert.Equal([("Ann", 2), ("Night", 2)], counts.TagCounts.Select(tag => (tag.Name, tag.ItemCount)));
        Assert.Equal(3, counts.Tags.Count);
        var json = OpenApiSpec.SerializeAsServer(counts);
        OpenApiSpec.AssertMatchesSchema(json, "TagEditorModelResponse");
        OpenApiSpec.AssertMatchesSchema(json.GetProperty("tagCounts")[0], "TagItemCount");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request), "TagEditorModelRequest");

        // One item's tags are counts too, each held by the one item.
        var single = operations.GetTagEditorModel(new TagEditorModelRequest { ItemIds = ["one"] });
        Assert.Equal(1, single.ItemCount);
        Assert.Equal([("Ann", 1), ("Night", 1)], single.TagCounts.Select(tag => (tag.Name, tag.ItemCount)));

        // No item ids, as the Filter tab and the tag catalog send, read the catalog with no counts.
        var catalog = operations.GetTagEditorModel(new TagEditorModelRequest { ItemIds = [] });
        Assert.Equal((0, 0, 3), (catalog.ItemCount, catalog.TagCounts.Count, catalog.Tags.Count));
        var catalogJson = OpenApiSpec.SerializeAsServer(catalog);
        OpenApiSpec.AssertMatchesSchema(catalogJson, "TagEditorModelResponse");
        Assert.Equal(
            ["categories", "itemCount", "tagCounts", "tags"],
            catalogJson.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new TagEditorModelRequest { ItemIds = [] }), "TagEditorModelRequest");
        Assert.Equal(["categories", "itemCount", "tagCounts", "tags"], OpenApiSpec.ReadSchemaRequired("TagEditorModelResponse"));
    }

    [Fact]
    public void TagCounts_CountItemsAcrossMoreIdsThanOneChunk()
    {
        var items = Enumerable.Range(0, 1203)
            .Select(index => new SeedItem($"item-{index}", $"/media/{index}.mp4") { Tags = index % 2 == 0 ? ["Even", "All"] : ["all"] })
            .ToList();
        CatalogSeed.Write(_dataDir, items: items);

        var counts = CreateOperations().GetTagEditorModel(new TagEditorModelRequest
        {
            ItemIds = [.. items.Select(item => item.Id), "missing"]
        });

        Assert.Equal(1203, counts.ItemCount);
        Assert.Equal(1203, Assert.Single(counts.TagCounts, tag => tag.Name.Equals("all", StringComparison.OrdinalIgnoreCase)).ItemCount);
        Assert.Equal(602, Assert.Single(counts.TagCounts, tag => tag.Name == "Even").ItemCount);
    }

    [Fact]
    public void QueryIdsAndRequest_MatchTheirSchemas()
    {
        CatalogSeed.Write(
            _dataDir,
            sources: [new SeedSource("s1", "/media")],
            items: [new SeedItem("item-1", "/media/one.mp4") { SourceId = "s1" }]);

        var result = ServerHostComposition.QueryLibraryIds(null, CreateOperations());

        var response = Assert.IsType<LibraryIdsQueryResponse>(Value(result));
        Assert.Equal(["item-1"], response.Ids);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "LibraryIdsQueryResponse");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(new LibraryIdsQueryRequest { FilterState = Filter("{}"), Search = "one" }),
            "LibraryIdsQueryRequest");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(new LibraryIdsQueryRequest { FilterState = Filter("{}"), Search = "one", ItemIds = ["item-1"] }),
            "LibraryIdsQueryRequest");
    }

    [Fact]
    public void ItemSummary_CountsTheNamedItemsInEachState_AndAnswersZerosForNoIds_MatchingItsSchemas()
    {
        CatalogSeed.Write(
            _dataDir,
            sources: [new SeedSource("s1", "/media")],
            items:
            [
                new SeedItem("favorite", "/media/favorite.mp4") { SourceId = "s1", IsFavorite = true },
                new SeedItem("blacklisted", "/media/blacklisted.mp4") { SourceId = "s1", IsBlacklisted = true },
                new SeedItem("played", "/media/played.mp4") { SourceId = "s1", PlayCount = 2 },
                new SeedItem("plain", "/media/plain.mp4") { SourceId = "s1" },
                new SeedItem("not-named", "/media/not-named.mp4") { SourceId = "s1", IsFavorite = true }
            ]);
        var operations = CreateOperations();
        var request = new LibraryItemSummaryRequest { ItemIds = ["favorite", "blacklisted", "played", "plain", "PLAIN", "missing"] };

        var response = Assert.IsType<LibraryItemSummaryResponse>(Value(ServerHostComposition.SummarizeItems(request, operations)));

        Assert.Equal((4, 1, 1, 1), (response.Count, response.FavoriteCount, response.BlacklistedCount, response.PlayedCount));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request), "LibraryItemSummaryRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "LibraryItemSummaryResponse");

        var empty = Assert.IsType<LibraryItemSummaryResponse>(
            Value(ServerHostComposition.SummarizeItems(new LibraryItemSummaryRequest { ItemIds = [] }, operations)));
        Assert.Equal((0, 0, 0, 0), (empty.Count, empty.FavoriteCount, empty.BlacklistedCount, empty.PlayedCount));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(empty), "LibraryItemSummaryResponse");

        var logLines = LogLines().Where(line => line.Contains("Library item summary", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, logLines.Count);
        Assert.Contains("requested=6 count=4 favorites=1 blacklisted=1 played=1 elapsedMs=", logLines[0]);
        Assert.Contains("requested=0 count=0 favorites=0 blacklisted=0 played=0 elapsedMs=", logLines[1]);
    }

    /// <summary>
    /// Seeds <paramref name="count"/> items, with files on disk when asked, each holding <paramref name="tags"/>, which
    /// the tag catalog holds too, and returns their ids.
    /// </summary>
    private List<string> SeedItems(int count, bool withFiles = false, IReadOnlyList<string>? tags = null)
    {
        var items = Enumerable.Range(0, count)
            .Select(index =>
            {
                var path = Path.Combine(_mediaDir, $"clip-{index}.mp4");
                if (withFiles)
                {
                    File.WriteAllBytes(path, [0x01]);
                }

                return new SeedItem($"item-{index:D4}", path) { Tags = [.. tags ?? []] };
            })
            .ToList();
        CatalogSeed.Write(_dataDir, items: items, tags: (tags ?? []).Select(tag => new SeedTag(tag)));
        return items.Select(item => item.Id).ToList();
    }

    /// <summary>
    /// The one published event, besides the tag catalog, is <paramref name="eventType"/> for at most 1,000 items, and
    /// otherwise resyncRequired in its place, with the revision before it and its own, and a last.log line saying so.
    /// </summary>
    private void AssertListedOrReplaced(ServerStateService state, string eventType, int itemCount, Action<object> assertListed)
    {
        var envelope = Assert.Single(state.GetReplayAfter(0).Events, envelope => envelope.EventType != "tagCatalogChanged");
        var replacedLines = LogLines().Where(line => line.Contains("in place of", StringComparison.Ordinal)).ToList();
        if (itemCount <= 1000)
        {
            Assert.Equal(eventType, envelope.EventType);
            assertListed(envelope.Payload);
            Assert.Empty(replacedLines);
            return;
        }

        Assert.Equal("resyncRequired", envelope.EventType);
        var resync = Assert.IsType<ResyncRequiredPayload>(envelope.Payload);
        Assert.Equal((eventType, envelope.Revision - 1, envelope.Revision), (resync.Reason, resync.LastEventId, resync.CurrentRevision));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(resync), "ResyncRequiredPayload");
        var line = Assert.Single(replacedLines);
        Assert.Contains($"[info] Published resyncRequired in place of {eventType}, which would have listed {itemCount} items.", line);
    }

    /// <summary>The one published event besides the tag catalog, an itemTagsChanged, with no resyncRequired in its place.</summary>
    private ItemTagsChangedPayload SingleItemTagsChanged(ServerStateService state)
    {
        var envelope = Assert.Single(state.GetReplayAfter(0).Events, envelope => envelope.EventType != "tagCatalogChanged");
        Assert.Equal("itemTagsChanged", envelope.EventType);
        Assert.DoesNotContain(LogLines(), line => line.Contains("in place of", StringComparison.Ordinal));
        return Assert.IsType<ItemTagsChangedPayload>(envelope.Payload);
    }

    private IResult DeleteFiles(
        HttpContext context,
        List<string>? itemIds,
        ServerStateService state,
        CoreSettingsService? settings = null,
        ServerSessionStore? sessions = null,
        ServerRuntimeOptions? options = null)
    {
        return ServerHostComposition.DeleteFiles(
            context,
            new DeleteFilesRequest { ItemIds = itemIds },
            options ?? new ServerRuntimeOptions(),
            sessions ?? new ServerSessionStore(),
            settings ?? new CoreSettingsService(new ServerRuntimeOptions(), _dataDir),
            new ServerLogService(_dataDir),
            state,
            CreateOperations());
    }

    private IResult ApplyDuplicates(HttpContext context, DuplicateApplyRequest request, ServerStateService state)
    {
        var options = new ServerRuntimeOptions();
        return ServerHostComposition.ApplyDuplicates(
            context,
            request,
            options,
            new ServerSessionStore(),
            new CoreSettingsService(options, _dataDir),
            new ServerLogService(_dataDir),
            state,
            CreateOperations());
    }

    private static DefaultHttpContext Local() => Request(IPAddress.Loopback, IPAddress.Loopback);

    private static DefaultHttpContext Lan() => Request(LanClient, ServerLanAddress);

    private static DefaultHttpContext Request(IPAddress remote, IPAddress local)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = "/api/library/delete-files";
        context.Connection.RemoteIpAddress = remote;
        context.Connection.LocalIpAddress = local;
        return context;
    }

    // A file the server can't delete: read-only on Windows, and in a folder it can't write to elsewhere.
    private static void MakeUndeletable(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            File.SetAttributes(path, FileAttributes.ReadOnly);
        }
        else
        {
            File.SetUnixFileMode(Path.GetDirectoryName(path)!, UnixFileMode.UserRead | UnixFileMode.UserExecute);
        }
    }

    private static void MakeDeletable(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            File.SetAttributes(path, FileAttributes.Normal);
        }
        else
        {
            File.SetUnixFileMode(Path.GetDirectoryName(path)!, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
    }

    private string MediaFile(string name)
    {
        var path = Path.Combine(_mediaDir, name);
        File.WriteAllBytes(path, [0x01]);
        return path;
    }

    private ReelRoulette.Core.Library.LibraryCatalogSnapshot LibraryCatalogStoreRead()
    {
        return ReelRoulette.Core.Library.LibraryCatalogStore.Read(Path.Combine(_dataDir, "library.db"));
    }

    private int CountItemTagRows(string itemId)
    {
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={Path.Combine(_dataDir, "library.db")};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM item_tags WHERE item_id = $id;";
        command.Parameters.AddWithValue("$id", itemId);
        return Convert.ToInt32(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private void AssertFlags(string itemId, bool isFavorite, bool isBlacklisted)
    {
        var item = CatalogOpen.Host(_dataDir).Session.ReadItemState(itemId)!;
        Assert.Equal((isFavorite, isBlacklisted), (item.IsFavorite, item.IsBlacklisted));
    }

    private static (string, bool, bool, bool, bool) Describe(BulkItemState item) =>
        (item.ItemId, item.IsFavorite, item.IsBlacklisted, item.PreviousIsFavorite, item.PreviousIsBlacklisted);

    private static List<string> QueryIds(LibraryOperationsService operations, LibraryIdsQueryRequest request)
    {
        return Assert.IsType<LibraryIdsQueryResponse>(Value(ServerHostComposition.QueryLibraryIds(request, operations))).Ids;
    }

    private static JsonElement Filter(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private LibraryOperationsService CreateOperations()
    {
        return new LibraryOperationsService(CatalogOpen.Host(_dataDir), NullLogger<LibraryOperationsService>.Instance, _dataDir);
    }

    private string[] LogLines()
    {
        var logPath = Path.Combine(_dataDir, "last.log");
        return File.Exists(logPath) ? File.ReadAllLines(logPath) : [];
    }

    private static int BulkCount(IResult result)
    {
        return Assert.IsType<BulkChangeResponse>(Value(result)).Count;
    }

    private static object? Value(IResult result)
    {
        return Assert.IsAssignableFrom<IValueHttpResult>(result).Value;
    }

    private static int? Status(IResult result)
    {
        return Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode;
    }
}
