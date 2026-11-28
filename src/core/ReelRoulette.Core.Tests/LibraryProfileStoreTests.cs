using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The server's profile store: profiles live in the catalog, each write publishes <c>profilesChanged</c> with every
/// profile, a taken name is refused ignoring case, and the default profile can't be deleted or limited. A request's
/// profile resolves to the sources it shows, an unknown one to every source.
/// </summary>
public sealed class LibraryProfileStoreTests : IDisposable
{
    private const string NightFilter = """{"favoritesMode":"only"}""";

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-profile-store-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void NewCatalog_HasOnlyTheDefaultProfile()
    {
        var profiles = Store().GetProfiles();

        var profile = Assert.Single(profiles);
        Assert.Equal(
            (LibraryCatalogStore.DefaultProfileId, "Main", "#ef7f22", true, true, (JsonElement?)null),
            (profile.Id, profile.Name, profile.Color, profile.IsDefault, profile.FollowsAllSources, profile.DefaultFilter));
        Assert.Empty(profile.SourceIds);
    }

    [Fact]
    public void CreateProfile_AddsItLast_WithTheDefaultProfilesFilter_AndPublishesEveryProfile()
    {
        var store = Store(out var state);
        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(LibraryCatalogStore.DefaultProfileId, new ProfileUpdate { DefaultFilter = Filter(NightFilter) }, null).Status);
        var revision = state.GetCurrentRevision();

        var created = store.CreateProfile("  Kids  ", "#3E7BFA", followsAllSources: false, ["src-a", "src-a", " "], "client-1");

        Assert.Equal(ProfileWriteStatus.Done, created.Status);
        var id = created.Profile!.Id;
        Assert.NotEqual(LibraryCatalogStore.DefaultProfileId, id);
        Assert.Equal(
            ["default Main #ef7f22 default all " + NightFilter, $"{id} Kids #3e7bfa chosen:src-a " + NightFilter],
            Describe(store.GetProfiles()));
        Assert.Equal(Describe(store.GetProfiles()), Describe(Assert.Single(ProfileEvents(state, revision)).Profiles));
        Assert.Equal("client-1", ProfileEvents(state, revision)[0].ClientId);
        Assert.Equal(Describe(store.GetProfiles()), Describe(Store().GetProfiles()));
    }

    [Fact]
    public void UpdateProfile_ChangesOnlyWhatItNames()
    {
        var store = Store(out var state);
        var id = store.CreateProfile("Kids", "#3e7bfa", followsAllSources: false, ["src-a"], null).Profile!.Id;
        var revision = state.GetCurrentRevision();

        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(id, new ProfileUpdate { Name = " Teens " }, "client-1").Status);
        Assert.Equal($"{id} Teens #3e7bfa chosen:src-a none", Describe(store.GetProfiles())[1]);

        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(id, new ProfileUpdate { Color = "#30A46C", DefaultFilter = Filter(NightFilter) }, "client-1").Status);
        Assert.Equal($"{id} Teens #30a46c chosen:src-a {NightFilter}", Describe(store.GetProfiles())[1]);

        // Following all sources drops the chosen list, and a chosen list again takes the one the update names.
        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(id, new ProfileUpdate { FollowsAllSources = true, SourceIds = ["src-b"] }, "client-2").Status);
        Assert.Equal($"{id} Teens #30a46c all {NightFilter}", Describe(store.GetProfiles())[1]);
        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(id, new ProfileUpdate { FollowsAllSources = false, SourceIds = ["src-b", "src-c"] }, "client-2").Status);
        Assert.Equal($"{id} Teens #30a46c chosen:src-b,src-c {NightFilter}", Describe(store.GetProfiles())[1]);

        // A chosen list on its own replaces the profile's, and the event carries the new one.
        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(id, new ProfileUpdate { SourceIds = ["src-a"] }, "client-3").Status);
        Assert.Equal($"{id} Teens #30a46c chosen:src-a {NightFilter}", Describe(store.GetProfiles())[1]);
        Assert.Equal(Describe(store.GetProfiles()), Describe(ProfileEvents(state, revision)[^1].Profiles));

        Assert.Equal(["client-1", "client-1", "client-2", "client-2", "client-3"], ProfileEvents(state, revision).Select(payload => payload.ClientId));
        Assert.Equal(Describe(store.GetProfiles()), Describe(Store().GetProfiles()));
    }

    [Fact]
    public void Names_AreRefusedWhenEmptyOrAnotherProfilesIgnoringCase()
    {
        var store = Store(out var state);
        var id = store.CreateProfile("Kids", "#3e7bfa", followsAllSources: true, null, null).Profile!.Id;
        var before = Describe(store.GetProfiles());
        var revision = state.GetCurrentRevision();

        Assert.Equal(
            (ProfileWriteStatus.NameMissing, "A profile needs a name."),
            Refusal(store.CreateProfile("  ", "#3e7bfa", followsAllSources: true, null, null)));
        Assert.Equal(
            (ProfileWriteStatus.NameTaken, "Another profile is named \"Main\"."),
            Refusal(store.CreateProfile("MAIN", "#3e7bfa", followsAllSources: true, null, null)));
        Assert.Equal(
            (ProfileWriteStatus.NameTaken, "Another profile is named \"Main\"."),
            Refusal(store.UpdateProfile(id, new ProfileUpdate { Name = "main" }, null)));
        Assert.Equal(before, Describe(store.GetProfiles()));
        Assert.Empty(ProfileEvents(state, revision));

        // A profile may take its own name in another case.
        Assert.Equal(ProfileWriteStatus.Done, store.UpdateProfile(id, new ProfileUpdate { Name = "KIDS" }, null).Status);
    }

    [Theory]
    [InlineData("orange")]
    [InlineData("#abc")]
    [InlineData("#12345g")]
    [InlineData("")]
    public void Colors_ThatArentHex_AreRefused(string color)
    {
        var store = Store(out var state);
        var revision = state.GetCurrentRevision();

        var expected = (ProfileWriteStatus.ColorNotValid, "A profile's color must be a hex color, such as #ef7f22.");
        Assert.Equal(expected, Refusal(store.CreateProfile("Kids", color, followsAllSources: true, null, null)));
        Assert.Equal(expected, Refusal(store.UpdateProfile(LibraryCatalogStore.DefaultProfileId, new ProfileUpdate { Color = color }, null)));
        Assert.Single(store.GetProfiles());
        Assert.Empty(ProfileEvents(state, revision));
    }

    [Fact]
    public void DefaultProfile_CantBeDeletedOrLimited_ButTakesANameAColorAndAFilter()
    {
        var store = Store(out var state);
        var revision = state.GetCurrentRevision();

        Assert.Equal(
            (ProfileWriteStatus.DefaultProfile, "The default profile can't be deleted."),
            Refusal(store.DeleteProfile(LibraryCatalogStore.DefaultProfileId, null)));
        Assert.Equal(
            (ProfileWriteStatus.DefaultProfile, "The default profile always shows every source."),
            Refusal(store.UpdateProfile(LibraryCatalogStore.DefaultProfileId, new ProfileUpdate { FollowsAllSources = false, SourceIds = ["src-a"] }, null)));
        Assert.Empty(ProfileEvents(state, revision));

        Assert.Equal(
            ProfileWriteStatus.Done,
            store.UpdateProfile(LibraryCatalogStore.DefaultProfileId, new ProfileUpdate { Name = "Home", Color = "#e5484d", DefaultFilter = Filter(NightFilter) }, null).Status);
        Assert.Equal(["default Home #e5484d default all " + NightFilter], Describe(store.GetProfiles()));
    }

    [Fact]
    public void DefaultFilter_ThatIsntAnObject_IsRefused()
    {
        var store = Store();

        Assert.Equal(
            (ProfileWriteStatus.FilterNotValid, "The default filter isn't a filter the server can read."),
            Refusal(store.UpdateProfile(LibraryCatalogStore.DefaultProfileId, new ProfileUpdate { DefaultFilter = Filter("[]") }, null)));
        Assert.Null(Assert.Single(store.GetProfiles()).DefaultFilter);
    }

    [Fact]
    public void DeleteProfile_RemovesItWithItsChosenSources_AndPublishesTheRest()
    {
        var store = Store(out var state);
        var id = store.CreateProfile("Kids", "#3e7bfa", followsAllSources: false, ["src-a", "src-b"], null).Profile!.Id;
        var revision = state.GetCurrentRevision();

        var deleted = store.DeleteProfile(id, "client-1");

        Assert.Equal(ProfileWriteStatus.Done, deleted.Status);
        Assert.Equal("Kids", deleted.Profile!.Name);
        Assert.Equal(["default Main #ef7f22 default all none"], Describe(store.GetProfiles()));
        Assert.Equal(0, CountProfileSourceRows());
        var published = Assert.Single(ProfileEvents(state, revision));
        Assert.Equal((LibraryCatalogStore.DefaultProfileId, "client-1"), (Assert.Single(published.Profiles).Id, published.ClientId));
        Assert.Equal(
            (ProfileWriteStatus.NotFound, "That profile no longer exists."),
            Refusal(store.DeleteProfile(id, null)));
        Assert.Equal(
            (ProfileWriteStatus.NotFound, "That profile no longer exists."),
            Refusal(store.UpdateProfile(id, new ProfileUpdate { Name = "Kids" }, null)));
    }

    [Fact]
    public void ResolveSourceIds_GivesAChosenList_AndEverySourceOtherwise_LoggingEachUnknownIdOnce()
    {
        var store = Store(out _, log: new ServerLogService(_tempDir));
        var all = store.CreateProfile("Travel", "#f5c518", followsAllSources: true, null, null).Profile!.Id;
        var chosen = store.CreateProfile("Kids", "#3e7bfa", followsAllSources: false, ["src-a"], null).Profile!.Id;

        Assert.Equal(["src-a"], store.ResolveSourceIds(chosen));
        Assert.Null(store.ResolveSourceIds(all));
        Assert.Null(store.ResolveSourceIds(LibraryCatalogStore.DefaultProfileId));
        Assert.Null(store.ResolveSourceIds(null));
        Assert.Null(store.ResolveSourceIds(" "));
        Assert.Null(store.ResolveSourceIds("gone"));
        Assert.Null(store.ResolveSourceIds("gone"));
        Assert.Null(store.ResolveSourceIds("also-gone"));

        var unknown = File.ReadLines(Path.Combine(_tempDir, "last.log")).Where(line => line.Contains("is not in the library", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, unknown.Count);
        Assert.Contains("Profile id=gone is not in the library; using the default profile.", unknown[0], StringComparison.Ordinal);
        Assert.Contains("Profile id=also-gone", unknown[1], StringComparison.Ordinal);
    }

    [Fact]
    public void AProfileThatFollowsAllSources_ShowsASourceImportedLater_AndAChosenListDoesnt()
    {
        var mediaRoot = Path.Combine(_tempDir, "media-new");
        Directory.CreateDirectory(mediaRoot);
        CatalogSeed.Write(
            _tempDir,
            sources: [new SeedSource("src-a", "/media/a")],
            items: [new SeedItem("a1", "/media/a/a1.mp4") { SourceId = "src-a" }]);
        var host = CatalogOpen.Host(_tempDir);
        var store = new LibraryProfileService(host, new ServerStateService());
        var all = store.CreateProfile("Travel", "#f5c518", followsAllSources: true, null, null).Profile!.Id;
        var chosen = store.CreateProfile("Kids", "#3e7bfa", followsAllSources: false, ["src-a"], null).Profile!.Id;
        var operations = new LibraryOperationsService(
            host,
            NullLogger<LibraryOperationsService>.Instance,
            _tempDir,
            enumerateMediaFiles: root => [Path.Combine(root, "n1.mp4")]);

        Assert.True(operations.ImportSource(new SourceImportRequest { RootPath = mediaRoot }).Accepted);

        Assert.Equal(2, Listed(operations, store.ResolveSourceIds(all)).Count);
        Assert.Equal(["a1"], Listed(operations, store.ResolveSourceIds(chosen)));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    /// <summary>A profile store on a new catalog, or on the catalog this test already has, as after a restart.</summary>
    private LibraryProfileService Store() => Store(out _);

    private LibraryProfileService Store(out ServerStateService state, ServerLogService? log = null)
    {
        if (!File.Exists(Path.Combine(_tempDir, LibraryCatalogStore.DatabaseFileName)))
        {
            CatalogSeed.Write(_tempDir);
        }

        state = new ServerStateService();
        return new LibraryProfileService(CatalogOpen.Host(_tempDir), state, log);
    }

    private static List<string> Listed(LibraryOperationsService operations, IReadOnlyCollection<string>? profileSourceIds)
    {
        var outcome = operations.QueryLibrary(new LibraryQueryRequest(), profileSourceIds: profileSourceIds);
        return outcome.Body!["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>()).ToList();
    }

    private static JsonElement Filter(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    /// <summary>Each profile as one line: id, name, color, whether it is the default, its sources, and its default filter.</summary>
    private static List<string> Describe(IEnumerable<ProfileResponse> profiles)
    {
        return profiles
            .Select(profile =>
                $"{profile.Id} {profile.Name} {profile.Color}{(profile.IsDefault ? " default" : string.Empty)} " +
                $"{(profile.FollowsAllSources ? "all" : "chosen:" + string.Join(",", profile.SourceIds))} " +
                (profile.DefaultFilter is { } filter ? JsonSerializer.Serialize(filter) : "none"))
            .ToList();
    }

    private static (ProfileWriteStatus Status, string? Error) Refusal(ProfileWriteResult result) => (result.Status, result.Error);

    private static List<ProfilesChangedPayload> ProfileEvents(ServerStateService state, long afterRevision)
    {
        return state.GetReplayAfter(afterRevision).Events
            .Where(envelope => envelope.EventType == "profilesChanged")
            .Select(envelope => (ProfilesChangedPayload)envelope.Payload)
            .ToList();
    }

    private int CountProfileSourceRows()
    {
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(_tempDir, LibraryCatalogStore.DatabaseFileName),
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM profile_sources;";
        return Convert.ToInt32(command.ExecuteScalar());
    }
}
