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
        Assert.Equal(mediaPath, payload.Path);
        Assert.Equal(1, payload.PlayCount);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "PlaybackRecordedPayload");
    }

    [Fact]
    public void RecordPlayback_ByItemId_RecordsThatItem_AndNamesItsPath_WhenTwoPathsDifferOnlyInCase()
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

        var result = ServerHostComposition.RecordPlayback(new RecordPlaybackRequest { Path = "id-lower" }, state, CreateOperations(host));

        var response = Assert.IsType<RecordPlaybackResponse>(Value(result));
        Assert.Equal("id-lower", response.ItemId);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "RecordPlaybackResponse");
        var payload = Assert.IsType<PlaybackRecordedPayload>(SingleEvent(state, "playbackRecorded").Payload);
        Assert.Equal("id-lower", payload.ItemId);
        Assert.Equal(lowerPath, payload.Path);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "PlaybackRecordedPayload");
        Assert.Equal(0, host.Session.ReadItemState("id-upper")!.PlayCount);
        Assert.Equal(1, host.Session.ReadItemState("id-lower")!.PlayCount);
    }

    [Fact]
    public void FavoriteAndBlacklist_PublishThePreviousFavoriteAndBlacklist()
    {
        var path = Path.Combine(_tempDir, "clip.mp4");
        CatalogSeed.Write(_tempDir, items: [new SeedItem("item-1", path) { IsBlacklisted = true }]);
        var operations = CreateOperations(CatalogOpen.Host(_tempDir));
        var state = new ServerStateService();

        ServerHostComposition.SetFavorite(new FavoriteRequest { Path = "item-1", IsFavorite = true }, state, operations);
        ServerHostComposition.SetBlacklist(new BlacklistRequest { Path = "item-1", IsBlacklisted = true }, state, operations);

        var events = state.GetReplayAfter(0).Events
            .Select(envelope => Assert.IsType<ItemStateChangedPayload>(envelope.Payload))
            .ToList();
        Assert.Equal(2, events.Count);
        var favorite = events[0];
        Assert.Equal(("item-1", path), (favorite.ItemId, favorite.Path));
        Assert.Equal((true, false), (favorite.IsFavorite, favorite.IsBlacklisted));
        Assert.Equal((false, true), (favorite.PreviousIsFavorite, favorite.PreviousIsBlacklisted));
        var blacklist = events[1];
        Assert.Equal((false, true), (blacklist.IsFavorite, blacklist.IsBlacklisted));
        Assert.Equal((true, false), (blacklist.PreviousIsFavorite, blacklist.PreviousIsBlacklisted));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(favorite), "ItemStateChangedPayload");
    }

    [Fact]
    public void ApplyItemTags_PublishesTheResolvedItemIds_AndKeepsTheRequestedIdentifiers()
    {
        var firstPath = Path.Combine(_tempDir, "first.mp4");
        CatalogSeed.Write(
            _tempDir,
            items:
            [
                new SeedItem("item-1", firstPath),
                new SeedItem("item-2", Path.Combine(_tempDir, "second.mp4"))
            ]);
        var state = new ServerStateService();
        var request = new ApplyItemTagsRequest { ItemIds = [firstPath, "item-2", "missing"], AddTags = ["Night"] };

        ServerHostComposition.ApplyItemTags(request, state, CreateOperations(CatalogOpen.Host(_tempDir)));

        var payload = Assert.IsType<ItemTagsChangedPayload>(SingleEvent(state, "itemTagsChanged").Payload);
        Assert.Equal([firstPath, "item-2", "missing"], payload.ItemIds);
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
        Assert.Equal(["item-1"], response.ChangedItemIds);
        var applied = Assert.Single(response.Applied);
        Assert.Equal(["item-1"], applied.ChangedItemIds);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "AutoTagApplyResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(applied), "AutoTagAppliedAssignment");
        var payload = Assert.IsType<ItemTagsChangedPayload>(SingleEvent(state, "itemTagsChanged").Payload);
        Assert.Equal([catPath], payload.ItemIds);
        Assert.Equal(["item-1"], payload.ResolvedItemIds);
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

    private static ServerEventEnvelope SingleEvent(ServerStateService state, string eventType)
    {
        return Assert.Single(state.GetReplayAfter(0).Events, envelope => envelope.EventType == eventType);
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
