using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The profile routes, the <c>profileId</c> each request that lists, counts, or picks items takes, and the source id the
/// item events carry for a profile to leave out what it hides, each checked against shared/api/openapi.yaml.
/// </summary>
public sealed class ProfileRouteTests : IDisposable
{
    private readonly string _dataDir = Path.Combine(Path.GetTempPath(), "reelroulette-profile-route-tests", Guid.NewGuid().ToString("N"));
    private readonly ServerStateService _state = new();
    private readonly LibraryProfileService _profiles;
    private readonly LibraryOperationsService _operations;
    private readonly LibraryPlaybackService _playback;
    private readonly RefreshPipelineService _refresh;

    /// <summary>Sources A and B, each with a beach video, and a photo in A.</summary>
    public ProfileRouteTests()
    {
        CatalogSeed.Write(
            _dataDir,
            sources: [new SeedSource("src-a", "/media/a"), new SeedSource("src-b", "/media/b")],
            tags: [new SeedTag("beach")],
            items:
            [
                new SeedItem("a-video", "/media/a/beach-a.mp4") { SourceId = "src-a", RelativePath = "beach-a.mp4", HasAudio = true, IntegratedLoudness = -30 },
                new SeedItem("a-photo", "/media/a/a.jpg") { SourceId = "src-a", RelativePath = "a.jpg", MediaType = 1 },
                new SeedItem("b-video", "/media/b/beach-b.mp4") { SourceId = "src-b", RelativePath = "beach-b.mp4", HasAudio = true, IntegratedLoudness = -10 }
            ]);
        var host = CatalogOpen.Host(_dataDir);
        _profiles = new LibraryProfileService(host, _state);
        _operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _dataDir);
        _playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host, random: new Random(1));
        _refresh = new RefreshPipelineService(
            new ServerStateService(),
            NullLogger<RefreshPipelineService>.Instance,
            new CoreSettingsService(new ServerRuntimeOptions(), _dataDir),
            host,
            _dataDir);
    }

    [Fact]
    public void ProfileRoutes_WriteAndPublish_AsTheirSchemasSay()
    {
        var revision = _state.GetCurrentRevision();
        var created = ServerHostComposition.CreateProfile(
            new CreateProfileRequest { Name = "Kids", Color = "#3E7BFA", FollowsAllSources = false, SourceIds = ["src-a"], ClientId = " client-a " },
            _profiles);

        var profile = Assert.IsType<ProfileResponse>(Value(created));
        Assert.Equal(("Kids", "#3e7bfa", false, false, "src-a"), (profile.Name, profile.Color, profile.IsDefault, profile.FollowsAllSources, string.Join(",", profile.SourceIds)));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(profile), "ProfileResponse");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(_profiles.GetProfiles()[0]), "ProfileResponse");

        var updated = ServerHostComposition.UpdateProfile(
            profile.Id,
            new UpdateProfileRequest { Name = "Teens", DefaultFilter = Filter("""{"favoritesMode":"only"}"""), ClientId = "client-b" },
            _profiles);
        var renamed = Assert.IsType<ProfileResponse>(Value(updated));
        Assert.Equal(("Teens", "#3e7bfa", "src-a"), (renamed.Name, renamed.Color, string.Join(",", renamed.SourceIds)));
        Assert.Equal("""{"favoritesMode":"only"}""", JsonSerializer.Serialize(renamed.DefaultFilter));

        var deleted = ServerHostComposition.DeleteProfile(profile.Id, null, _profiles);
        Assert.Equal(StatusCodes.Status200OK, Status(deleted));
        Assert.IsNotAssignableFrom<IValueHttpResult>(deleted);

        var published = _state.GetReplayAfter(revision).Events.Where(envelope => envelope.EventType == "profilesChanged").ToList();
        Assert.Equal(
            [("client-a", 2), ("client-b", 2), (null, 1)],
            published.Select(envelope => (((ProfilesChangedPayload)envelope.Payload).ClientId, ((ProfilesChangedPayload)envelope.Payload).Profiles.Count)));
        var json = OpenApiSpec.SerializeAsServer(published[0].Payload);
        OpenApiSpec.AssertMatchesSchema(json, "ProfilesChangedPayload");
        OpenApiSpec.AssertMatchesSchema(json.GetProperty("profiles")[1], "ProfileResponse");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(new CreateProfileRequest { Name = "Kids", Color = "#3e7bfa", SourceIds = [], ClientId = "client-a" }),
            "CreateProfileRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new UpdateProfileRequest()), "UpdateProfileRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new DeleteProfileRequest()), "DeleteProfileRequest");
    }

    [Fact]
    public void ProfileRoutes_AnswerARefusalWithItsStatusAndTheServersReason()
    {
        var kids = Assert.IsType<ProfileResponse>(Value(ServerHostComposition.CreateProfile(new CreateProfileRequest { Name = "Kids", Color = "#3e7bfa" }, _profiles))).Id;

        Assert.Equal(
            (StatusCodes.Status400BadRequest, "A profile needs a name."),
            Refusal(ServerHostComposition.CreateProfile(new CreateProfileRequest { Name = " ", Color = "#3e7bfa" }, _profiles)));
        Assert.Equal(
            (StatusCodes.Status400BadRequest, "A profile's color must be a hex color, such as #ef7f22."),
            Refusal(ServerHostComposition.CreateProfile(new CreateProfileRequest { Name = "Travel", Color = "blue" }, _profiles)));
        Assert.Equal(
            (StatusCodes.Status409Conflict, "Another profile is named \"Kids\"."),
            Refusal(ServerHostComposition.CreateProfile(new CreateProfileRequest { Name = "KIDS", Color = "#3e7bfa" }, _profiles)));
        Assert.Equal(
            (StatusCodes.Status400BadRequest, "The default filter isn't a filter the server can read."),
            Refusal(ServerHostComposition.UpdateProfile(kids, new UpdateProfileRequest { DefaultFilter = Filter("[]") }, _profiles)));
        Assert.Equal(
            (StatusCodes.Status400BadRequest, "The default profile always shows every source."),
            Refusal(ServerHostComposition.UpdateProfile(LibraryCatalogStore.DefaultProfileId, new UpdateProfileRequest { FollowsAllSources = false }, _profiles)));
        Assert.Equal(
            (StatusCodes.Status400BadRequest, "The default profile can't be deleted."),
            Refusal(ServerHostComposition.DeleteProfile(LibraryCatalogStore.DefaultProfileId, null, _profiles)));
        Assert.Equal(
            (StatusCodes.Status404NotFound, "That profile no longer exists."),
            Refusal(ServerHostComposition.UpdateProfile("gone", new UpdateProfileRequest { Name = "Gone" }, _profiles)));
        Assert.Equal(
            (StatusCodes.Status404NotFound, "That profile no longer exists."),
            Refusal(ServerHostComposition.DeleteProfile("gone", null, _profiles)));
    }

    [Fact]
    public void EachRequestThatNamesAProfile_KeepsOnlyItsSources()
    {
        var onlyA = OnlyA();

        Assert.Equal(("a-photo,a-video", 2, 2), Query(onlyA));
        Assert.Equal("a-photo,a-video", QueryIds(onlyA));
        var stats = Assert.IsType<LibraryStatsResponse>(Value(ServerHostComposition.GetLibraryStats(onlyA, _operations, _profiles)));
        Assert.Equal((1, 1, 2), (stats.Global.TotalVideos, stats.Global.TotalPhotos, stats.Global.TotalMedia));
        Assert.Equal("a-video", ScannedBeach(onlyA));

        var request = new RandomRequest { PresetId = "all-media", ClientId = "device", ProfileId = onlyA };
        var pick = Assert.IsType<RandomPickResponse>(Value(ServerHostComposition.SelectRandom(request, _state, _playback, _profiles)));
        Assert.Contains(pick.Item!.ItemId, new[] { "a-video", "a-photo" });
        Assert.Equal(2, pick.Cycle.Eligible);
        var cycle = Assert.IsType<RandomPickCycleResponse>(Value(ServerHostComposition.GetRandomCycle(request, _state, _playback, _profiles)));
        Assert.Equal(2, cycle.Eligible);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("gone")]
    [InlineData(LibraryCatalogStore.DefaultProfileId)]
    public void EachRequestWithoutAProfile_OrWithOneTheLibraryDoesntHave_SeesEverySource(string? profileId)
    {
        Assert.Equal(("a-photo,a-video,b-video", 3, 3), Query(profileId));
        Assert.Equal("a-photo,a-video,b-video", QueryIds(profileId));
        var stats = Assert.IsType<LibraryStatsResponse>(Value(ServerHostComposition.GetLibraryStats(profileId, _operations, _profiles)));
        Assert.Equal(3, stats.Global.TotalMedia);
        Assert.Equal("a-video,b-video", ScannedBeach(profileId));
        var request = new RandomRequest { PresetId = "all-media", ClientId = "device", ProfileId = profileId };
        var cycle = Assert.IsType<RandomPickCycleResponse>(Value(ServerHostComposition.GetRandomCycle(request, _state, _playback, _profiles)));
        Assert.Equal(3, cycle.Eligible);
    }

    [Fact]
    public void ProfileId_IsInEachScopedRequestsSchema()
    {
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new LibraryQueryRequest { ProfileId = "p" }), "LibraryQueryRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new LibraryIdsQueryRequest { ProfileId = "p" }), "LibraryIdsQueryRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new RandomRequest { ProfileId = "p" }), "RandomRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new AutoTagScanRequest { ProfileId = "p" }), "AutoTagScanRequest");
        Assert.Contains("name: profileId", OpenApiSpec.ReadOperationText("GET /api/library/stats"), StringComparison.Ordinal);
    }

    [Fact]
    public void ItemEvents_CarryEachItemsSourceId()
    {
        var revision = _state.GetCurrentRevision();

        ServerHostComposition.SetFavorite(new FavoriteRequest { ItemId = "a-video", IsFavorite = true }, _state, _operations);
        ServerHostComposition.SetRating(new RatingRequest { ItemId = "b-video", Rating = 4 }, _state, _operations);
        ServerHostComposition.SetBulkItemState(new BulkItemStateRequest { ItemIds = ["a-photo", "b-video"], Flag = "blacklist", Value = true }, _state, _operations);
        ServerHostComposition.SetBulkRating(new BulkRatingRequest { ItemIds = ["a-video", "b-video"], Rating = 2 }, _state, _operations);

        var events = _state.GetReplayAfter(revision).Events.Select(envelope => envelope.Payload).ToList();
        var favorite = Assert.IsType<ItemStateChangedPayload>(events[0]);
        Assert.Equal(("a-video", "src-a"), (favorite.ItemId, favorite.SourceId));
        var rating = Assert.IsType<ItemRatingChangedPayload>(events[1]);
        Assert.Equal(("b-video", "src-b"), (rating.ItemId, rating.SourceId));
        Assert.Equal(
            ["a-photo src-a", "b-video src-b"],
            Assert.IsType<BulkItemStateChangedPayload>(events[2]).Items.Select(item => $"{item.ItemId} {item.SourceId}"));
        Assert.Equal(
            ["a-video src-a", "b-video src-b"],
            Assert.IsType<BulkItemRatingChangedPayload>(events[3]).Items.Select(item => $"{item.ItemId} {item.SourceId}"));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(favorite), "ItemStateChangedPayload");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(rating), "ItemRatingChangedPayload");
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataDir))
        {
            Directory.Delete(_dataDir, recursive: true);
        }
    }

    private string OnlyA()
    {
        var created = ServerHostComposition.CreateProfile(
            new CreateProfileRequest { Name = "Only A", Color = "#3e7bfa", FollowsAllSources = false, SourceIds = ["src-a"] },
            _profiles);
        return Assert.IsType<ProfileResponse>(Value(created)).Id;
    }

    /// <summary>The page's ids in name order, the total after the filter, and the count before it.</summary>
    private (string Ids, int Total, int Baseline) Query(string? profileId)
    {
        var result = ServerHostComposition.QueryLibrary(new LibraryQueryRequest { ProfileId = profileId }, _operations, _refresh, _profiles);
        var body = Assert.IsType<JsonObject>(Value(result));
        return (
            string.Join(",", body["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>())),
            body["totalCount"]!.GetValue<int>(),
            body["searchBaselineCount"]!.GetValue<int>());
    }

    private string QueryIds(string? profileId)
    {
        var result = ServerHostComposition.QueryLibraryIds(new LibraryIdsQueryRequest { ProfileId = profileId }, _operations, _profiles);
        return string.Join(",", Assert.IsType<LibraryIdsQueryResponse>(Value(result)).Ids.Order(StringComparer.Ordinal));
    }

    private string ScannedBeach(string? profileId)
    {
        var result = ServerHostComposition.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = false, ProfileId = profileId }, _operations, _profiles);
        var row = Assert.Single(Assert.IsType<AutoTagScanResponse>(Value(result)).Rows);
        return string.Join(",", row.Files.Select(file => file.ItemId).Order(StringComparer.Ordinal));
    }

    private static (int? Status, string? Error) Refusal(IResult result) => (Status(result), OpenApiSpec.ErrorReason(result));

    private static object? Value(IResult result)
    {
        return Assert.IsAssignableFrom<IValueHttpResult>(result).Value;
    }

    private static int? Status(IResult result)
    {
        return Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode ?? StatusCodes.Status200OK;
    }

    private static JsonElement Filter(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
