using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryListQueryTests
{
    [Fact]
    public void Query_AppliesEnabledSourcesThenSearchThenFilter_AndSplitsCounts()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.InsertSource("off", "/other", "Off", false);
        Add(session, "keep", "on", "Alpha.mp4", "clips/Alpha.mp4", favorite: true);
        Add(session, "search-only", "on", "alpha-notes.mp4", "clips/alpha-notes.mp4");
        Add(session, "other", "on", "Beta.mp4", "clips/Beta.mp4", favorite: true);
        Add(session, "disabled", "off", "Alpha-hidden.mp4", "clips/Alpha-hidden.mp4", favorite: true);
        Add(session, "missing", "on", "Gone.mp4", "missing/Gone.mp4", favorite: true);

        var page = session.QueryList(new LibraryListRequest
        {
            Search = "ALPHA",
            Filter = new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only, BlacklistedMode = FlagFilterModeValue.Off },
            Limit = 50
        });

        Assert.Equal(2, page.SearchBaselineCount);
        Assert.Equal(1, page.TotalCount);
        Assert.Equal("keep", Assert.Single(page.Items).Id);

        var missing = session.QueryList(new LibraryListRequest
        {
            Search = "gone",
            Limit = 20
        });
        Assert.Equal("missing", Assert.Single(missing.Items).Id);
        Assert.DoesNotContain(missing.Items, item => item.Id == "disabled");
    }

    [Fact]
    public void Query_SearchUsesInvariantFold_AndStaysAccentSensitive()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        Add(session, "accent", "on", "Café.mp4", "clips/Café.mp4");
        Add(session, "plain", "on", "Cafe.mp4", "clips/Cafe.mp4");
        Add(session, "wild", "on", "100%.mp4", "clips/100%.mp4");

        var accent = session.QueryList(new LibraryListRequest { Search = "CAFÉ", Limit = 20 });
        Assert.Equal(["accent"], accent.Items.Select(item => item.Id).ToArray());

        var plain = session.QueryList(new LibraryListRequest { Search = "cafe", Limit = 20 });
        Assert.Equal(["plain"], plain.Items.Select(item => item.Id).ToArray());

        var literal = session.QueryList(new LibraryListRequest { Search = "%", Limit = 20 });
        Assert.Equal(["wild"], literal.Items.Select(item => item.Id).ToArray());

        var blank = session.QueryList(new LibraryListRequest { Search = "   ", Limit = 20 });
        Assert.Equal(3, blank.SearchBaselineCount);
    }

    [Fact]
    public void Query_NameSort_UsesOrdinalIgnoreCase_ThenId_IncludingDescending()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        Add(session, "2", "on", "same.mp4", "a/same.mp4");
        Add(session, "1", "on", "Same.mp4", "b/Same.mp4");
        Add(session, "e", "on", "e.mp4", "c/e.mp4");
        Add(session, "accent", "on", "é.mp4", "d/é.mp4");

        var ascending = session.QueryList(new LibraryListRequest { Sort = LibraryListSort.Name, Limit = 10 });
        Assert.Equal(["e", "1", "2", "accent"], ascending.Items.Select(item => item.Id).ToArray());

        var first = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.Name,
            SortDescending = true,
            Limit = 1
        });
        var tied = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.Name,
            SortDescending = true,
            Offset = 1,
            Limit = 1
        });
        var tiedNext = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.Name,
            SortDescending = true,
            Offset = 2,
            Limit = 1
        });
        Assert.Equal("accent", Assert.Single(first.Items).Id);
        Assert.Equal("1", Assert.Single(tied.Items).Id);
        Assert.Equal("2", Assert.Single(tiedNext.Items).Id);
        Assert.Equal(4, first.TotalCount);
        Assert.Empty(session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.Name,
            Offset = 50,
            Limit = 10
        }).Items);
    }

    [Fact]
    public void Query_DescendingPrimary_KeepsFilenameThenIdAscending_AndPlacesNullsAsMinimum()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        var played = new DateTime(2024, 1, 2, 0, 0, 0, DateTimeKind.Utc);
        Add(session, "b", "on", "b.mp4", "b.mp4", lastPlayed: played, playCount: 3);
        Add(session, "a", "on", "a.mp4", "a.mp4", lastPlayed: played, playCount: 3);
        Add(session, "none", "on", "m.mp4", "m.mp4");
        Add(session, "zero", "on", "a-zero.mp4", "a-zero.mp4", duration: TimeSpan.Zero);
        Add(session, "none-duration", "on", "z-none.mp4", "z-none.mp4");
        Add(session, "short", "on", "s.mp4", "s.mp4", duration: TimeSpan.FromSeconds(5));
        Add(session, "photo", "on", "p.jpg", "p.jpg", mediaType: 1);

        var playedPage = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.LastPlayed,
            SortDescending = true,
            Limit = 2
        });
        Assert.Equal(["a", "b"], playedPage.Items.Select(item => item.Id).ToArray());
        var plays = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.PlayCount,
            SortDescending = true,
            Limit = 2
        });
        Assert.Equal(["a", "b"], plays.Items.Select(item => item.Id).ToArray());
        var playedTail = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.LastPlayed,
            SortDescending = true,
            Offset = 2,
            Limit = 10
        });
        Assert.Equal("zero", playedTail.Items[0].Id);

        var duration = session.QueryList(new LibraryListRequest { Sort = LibraryListSort.Duration, Limit = 10 });
        var durationIds = duration.Items.Select(item => item.Id).ToList();
        Assert.True(durationIds.IndexOf("zero") < durationIds.IndexOf("none-duration"));
        Assert.True(durationIds.IndexOf("none-duration") < durationIds.IndexOf("short"));

        var written = new DateTime(2020, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        Add(session, "old", "on", "old.mp4", "old.mp4", written: written);
        var added = session.QueryList(new LibraryListRequest
        {
            Sort = LibraryListSort.DateAdded,
            SortDescending = false,
            Limit = 1
        });
        Assert.NotEqual("old", Assert.Single(added.Items).Id);
    }

    [Fact]
    public void Query_FilterMatchesPanelRules_ForTagsDurationAndPhotos()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.InsertSource("extra", "/extra", "Extra", true);
        session.UpsertCategory("people", "People", 1);
        session.UpsertCategory("place", "Place", 2);
        session.UpsertTag("Ann", "people");
        session.UpsertTag("Bob", "people");
        session.UpsertTag("Home", "place");
        Add(session, "ann-home", "on", "ann-home.mp4", "ann-home.mp4", tags: ["Ann", "Home"]);
        Add(session, "ann-bob", "on", "ann-bob.mp4", "ann-bob.mp4", tags: ["Ann", "Bob"]);
        Add(session, "bob-home", "on", "bob-home.mp4", "bob-home.mp4", tags: ["Bob", "Home"]);
        Add(session, "ann", "on", "ann.mp4", "ann.mp4", tags: ["Ann"]);
        Add(session, "long", "on", "long.mp4", "long.mp4", duration: TimeSpan.FromMinutes(10), hasAudio: true);
        Add(session, "brief", "on", "brief.mp4", "brief.mp4", duration: TimeSpan.FromSeconds(5), hasAudio: false);
        Add(session, "silent-photo", "on", "pic.jpg", "pic.jpg", mediaType: 1);
        Add(session, "other-source", "extra", "other.mp4", "other.mp4", duration: TimeSpan.FromMinutes(10), hasAudio: true);
        Add(session, "blocked", "on", "blocked.mp4", "blocked.mp4", blacklisted: true, tags: ["Ann", "Home"]);

        var tags = session.QueryList(new LibraryListRequest
        {
            Filter = new FilterStateModel
            {
                BlacklistedMode = FlagFilterModeValue.Excluded,
                SelectedTags = ["Ann", "Bob", "Home"],
                GlobalMatchMode = true,
                CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase)
                {
                    ["people"] = TagMatchModeValue.Or,
                    ["place"] = TagMatchModeValue.And
                }
            },
            Limit = 20
        });
        Assert.Equal(["ann-home", "bob-home"], tags.Items.Select(item => item.Id).OrderBy(id => id, StringComparer.Ordinal).ToArray());

        var orAcross = session.QueryList(new LibraryListRequest
        {
            Filter = new FilterStateModel
            {
                BlacklistedMode = FlagFilterModeValue.Off,
                SelectedTags = ["Ann", "Bob", "Home"],
                GlobalMatchMode = false,
                CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>
                {
                    ["people"] = TagMatchModeValue.And,
                    ["place"] = TagMatchModeValue.Or
                }
            },
            Limit = 20
        });
        Assert.Contains(orAcross.Items, item => item.Id == "ann-bob");
        Assert.Contains(orAcross.Items, item => item.Id == "ann-home");
        Assert.DoesNotContain(orAcross.Items, item => item.Id == "ann");

        var duration = session.QueryList(new LibraryListRequest
        {
            Filter = new FilterStateModel
            {
                BlacklistedMode = FlagFilterModeValue.Off,
                MinDuration = TimeSpan.FromMinutes(1),
                AudioFilter = AudioFilterModeValue.WithAudioOnly,
                IncludedSourceIds = ["ON"]
            },
            Limit = 20
        });
        Assert.Contains(duration.Items, item => item.Id == "long");
        Assert.Contains(duration.Items, item => item.Id == "silent-photo");
        Assert.DoesNotContain(duration.Items, item => item.Id == "brief");
        Assert.DoesNotContain(duration.Items, item => item.Id == "other-source");
        Assert.DoesNotContain(duration.Items, item => item.Id is "ann" or "ann-home" or "ann-bob" or "bob-home");
    }

    [Fact]
    public void QueryRandomCandidates_MatchesListQuery_ForFilterEnabledSourcesAndMediaType_InOrdinalIdOrder()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.InsertSource("off", "/other", "Off", false);
        session.UpsertCategory("people", "People", 1);
        session.UpsertTag("Ann", "people");
        var played = new DateTime(2026, 3, 4, 5, 6, 7, DateTimeKind.Utc);
        Add(session, "video", "on", "video.mp4", "video.mp4", favorite: true, tags: ["Ann"]);
        Add(session, "photo", "on", "photo.jpg", "photo.jpg", favorite: true, playCount: 3, lastPlayed: played, mediaType: 1, tags: ["Ann"]);
        Add(session, "Upper", "on", "upper.mp4", "upper.mp4", favorite: true, tags: ["Ann"]);
        Add(session, "plain", "on", "plain.mp4", "plain.mp4", tags: ["Ann"]);
        Add(session, "blocked", "on", "blocked.mp4", "blocked.mp4", favorite: true, blacklisted: true, tags: ["Ann"]);
        Add(session, "hidden", "off", "hidden.mp4", "hidden.mp4", favorite: true, tags: ["Ann"]);
        Add(session, "ghost", "ghost", "ghost.mp4", "ghost.mp4", favorite: true, tags: ["Ann"]);

        var filter = new FilterStateModel
        {
            FavoritesMode = FlagFilterModeValue.Only,
            BlacklistedMode = FlagFilterModeValue.Excluded,
            SelectedTags = ["Ann"]
        };
        var listed = session.QueryList(new LibraryListRequest { Filter = filter, Limit = 50 });
        var eligible = session.QueryRandomCandidates(filter);
        Assert.Equal(
            listed.Items.Select(item => item.Id).OrderBy(id => id, StringComparer.Ordinal).ToArray(),
            eligible.Select(item => item.Id).ToArray());
        Assert.Equal(["Upper", "photo", "video"], eligible.Select(item => item.Id).ToArray());
        var photo = eligible[1];
        Assert.Equal("/media/photo.jpg", photo.FullPath);
        Assert.Equal(3, photo.PlayCount);
        Assert.Equal(played, photo.LastPlayedUtc);
        Assert.Null(eligible[2].LastPlayedUtc);

        var videosOnly = new FilterStateModel
        {
            FavoritesMode = FlagFilterModeValue.Only,
            BlacklistedMode = FlagFilterModeValue.Excluded,
            SelectedTags = ["Ann"],
            MediaTypeFilter = MediaTypeFilterValue.VideosOnly
        };
        var listedVideos = session.QueryList(new LibraryListRequest { Filter = videosOnly, Limit = 50 });
        var eligibleVideos = session.QueryRandomCandidates(filter, MediaTypeValue.Video);
        Assert.Equal(
            listedVideos.Items.Select(item => item.Id).OrderBy(id => id, StringComparer.Ordinal).ToArray(),
            eligibleVideos.Select(item => item.Id).ToArray());
        Assert.Equal(["Upper", "video"], eligibleVideos.Select(item => item.Id).ToArray());

        var eligiblePhotos = session.QueryRandomCandidates(filter, MediaTypeValue.Photo);
        Assert.Equal("photo", Assert.Single(eligiblePhotos).Id);
    }

    [Fact]
    public void ReadPlaybackItemById_ReadsOnlyThatExactId()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.InsertSource("off", "/other", "Off", false);
        Add(session, "keep", "on", "keep.mp4", "keep.mp4", favorite: true, duration: TimeSpan.FromSeconds(12), mediaType: 1);
        Add(session, "hidden", "off", "hidden.mp4", "hidden.mp4", blacklisted: true);

        var item = session.ReadPlaybackItemById("keep");
        Assert.NotNull(item);
        Assert.Equal("keep", item!.Id);
        Assert.Equal("/media/keep.mp4", item.FullPath);
        Assert.Equal("keep.mp4", item.FileName);
        Assert.Equal(1, item.MediaType);
        Assert.Equal(TimeSpan.FromSeconds(12).Ticks, item.DurationTicks);
        Assert.True(item.IsFavorite);
        Assert.False(item.IsBlacklisted);
        Assert.True(item.IsSourceEnabled);
        Assert.True(session.ReadPlaybackItemById("hidden")!.IsBlacklisted);
        Assert.Null(session.ReadPlaybackItemById("KEEP"));
        Assert.Null(session.ReadPlaybackItemById("/media/keep.mp4"));
        Assert.Null(session.ReadPlaybackItemById(""));
    }

    [Fact]
    public void ReadPlaybackItem_ReadsThatItemAndSource_ByIdOrPath_WithoutBuildingTheCatalogDocument()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.InsertSource("off", "/other", "Off", false);
        Add(session, "keep", "on", "keep.mp4", "keep.mp4", duration: TimeSpan.FromSeconds(12));
        Add(session, "hidden", "off", "hidden.mp4", "hidden.mp4");
        Add(session, "ghost", "ghost", "ghost.mp4", "ghost.mp4");

        var byId = session.ReadPlaybackItem("KEEP");
        Assert.NotNull(byId);
        Assert.Equal("keep", byId!.Id);
        Assert.Equal("/media/keep.mp4", byId.FullPath);
        Assert.True(byId.IsSourceEnabled);
        Assert.Equal(TimeSpan.FromSeconds(12).Ticks, byId.DurationTicks);

        var byPath = session.ReadPlaybackItem("/MEDIA/keep.mp4");
        Assert.Equal("keep", byPath!.Id);
        Assert.False(session.ReadPlaybackItem("hidden")!.IsSourceEnabled);
        Assert.True(session.ReadPlaybackItem("ghost")!.IsSourceEnabled);
        Assert.Null(session.ReadPlaybackItem("missing"));
    }

    [Fact]
    public void TagFilter_ListQueryAndRandomEligibilityAgree_ForEveryTagShape()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.UpsertCategory("people", "People", 1);
        session.UpsertCategory("place", "Place", 2);
        session.UpsertTag("Ann", "people");
        session.UpsertTag("Bob", "people");
        session.UpsertTag("Home", "place");
        session.UpsertTag("Misc", null);
        session.UpsertTag("Spare", null);
        Add(session, "ann-home", "on", "ann-home.mp4", "ann-home.mp4", tags: ["Ann", "Home"]);
        Add(session, "ann-bob", "on", "ann-bob.mp4", "ann-bob.mp4", tags: ["Ann", "Bob"]);
        Add(session, "bob-home", "on", "bob-home.mp4", "bob-home.mp4", tags: ["Bob", "Home"]);
        Add(session, "ann", "on", "ann.mp4", "ann.mp4", tags: ["Ann"]);
        Add(session, "misc", "on", "misc.mp4", "misc.mp4", tags: ["Misc"]);
        Add(session, "spare-ann", "on", "spare-ann.mp4", "spare-ann.mp4", tags: ["Spare", "Ann"]);
        Add(session, "misc-spare", "on", "misc-spare.mp4", "misc-spare.mp4", tags: ["Misc", "Spare"]);
        Add(session, "loose-ann", "on", "loose-ann.mp4", "loose-ann.mp4", tags: ["Loose", "Ann"]);
        Add(session, "plain", "on", "plain.mp4", "plain.mp4");

        AssertBoth(session, new FilterStateModel { SelectedTags = ["home"] }, "ann-home", "bob-home");
        AssertBoth(
            session,
            new FilterStateModel { ExcludedTags = ["bob"] },
            "ann", "ann-home", "loose-ann", "misc", "misc-spare", "plain", "spare-ann");
        AssertBoth(
            session,
            new FilterStateModel { SelectedTags = ["Ann"], ExcludedTags = ["Home"] },
            "ann", "ann-bob", "loose-ann", "spare-ann");
        AssertBoth(
            session,
            new FilterStateModel
            {
                SelectedTags = ["Ann", "Bob", "Home"],
                GlobalMatchMode = true,
                CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase)
                {
                    ["people"] = TagMatchModeValue.Or,
                    ["place"] = TagMatchModeValue.And
                }
            },
            "ann-home", "bob-home");
        AssertBoth(
            session,
            new FilterStateModel
            {
                SelectedTags = ["Ann", "Bob", "Home"],
                GlobalMatchMode = false,
                CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase)
                {
                    ["people"] = TagMatchModeValue.And,
                    ["place"] = TagMatchModeValue.Or
                }
            },
            "ann-bob", "ann-home", "bob-home");

        // Uncategorized tags form one group keyed by the Uncategorized id.
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Misc", "Spare"] }, "misc-spare");
        AssertBoth(
            session,
            new FilterStateModel
            {
                SelectedTags = ["Misc", "Spare", "Ann"],
                GlobalMatchMode = true,
                CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase)
                {
                    ["uncategorized"] = TagMatchModeValue.Or
                }
            },
            "spare-ann");

        // A tag first added by an item edit joins the tag table as Uncategorized, so Loose and Ann are two groups
        // that the global mode combines.
        AssertBoth(
            session,
            new FilterStateModel { SelectedTags = ["Loose", "Ann"], GlobalMatchMode = false },
            "ann", "ann-bob", "ann-home", "loose-ann", "spare-ann");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Loose", "Ann"], GlobalMatchMode = true }, "loose-ann");

        // A tagMatchMode an older client still sends does not change a filter; the global and per-category modes decide.
        foreach (var tagMatchMode in new[] { "1", "\"Or\"" })
        {
            using var sent = JsonDocument.Parse($$"""{"selectedTags":["Ann","Bob"],"tagMatchMode":{{tagMatchMode}}}""");
            Assert.True(LibraryListFilterParser.TryParse(sent.RootElement, out var parsed, out var error), error);
            AssertBoth(session, parsed!, "ann-bob");
        }
    }

    [Fact]
    public void TagFilter_MatchesTagsByFold_ForTrickyNamesAndEdgeCases()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.UpsertCategory("people", "People", 1);
        session.UpsertCategory("crowd", "Crowd", 2);
        session.UpsertTag("Ann", "people");
        session.UpsertTag("Bob", "people");
        session.UpsertTag("Zed", "people");
        var crowd = Enumerable.Range(1, 27).Select(i => $"Person{i:00}").ToList();
        foreach (var name in crowd)
        {
            session.UpsertTag(name, "crowd");
        }

        // Item tags keep the name they were written with, so an item can hold a catalog tag in another case.
        Add(session, "ann", "on", "ann.mp4", "ann.mp4", tags: ["Ann"]);
        Add(session, "ann-upper", "on", "ann-upper.mp4", "ann-upper.mp4", tags: ["ANN"]);
        Add(session, "ann-bob", "on", "ann-bob.mp4", "ann-bob.mp4", tags: ["ann", "Bob"]);
        Add(session, "kelvin", "on", "kelvin.mp4", "kelvin.mp4", tags: ["K"]);
        Add(session, "k", "on", "k.mp4", "k.mp4", tags: ["k"]);
        Add(session, "final-sigma", "on", "final-sigma.mp4", "final-sigma.mp4", tags: ["ς"]);
        Add(session, "sigma", "on", "sigma.mp4", "sigma.mp4", tags: ["σ"]);
        Add(session, "capital-sigma", "on", "capital-sigma.mp4", "capital-sigma.mp4", tags: ["Σ"]);
        Add(session, "dz-title", "on", "dz-title.mp4", "dz-title.mp4", tags: ["ǅ"]);
        Add(session, "dz-upper", "on", "dz-upper.mp4", "dz-upper.mp4", tags: ["Ǆ"]);
        Add(session, "strasse-sharp", "on", "strasse-sharp.mp4", "strasse-sharp.mp4", tags: ["Straße"]);
        Add(session, "strasse-upper", "on", "strasse-upper.mp4", "strasse-upper.mp4", tags: ["STRASSE"]);
        Add(session, "crowd-all", "on", "crowd-all.mp4", "crowd-all.mp4", tags: crowd);
        Add(session, "crowd-one", "on", "crowd-one.mp4", "crowd-one.mp4", tags: ["person07"]);
        Add(session, "plain", "on", "plain.mp4", "plain.mp4");
        string[] everything =
        [
            "ann", "ann-bob", "ann-upper", "capital-sigma", "crowd-all", "crowd-one", "dz-title", "dz-upper",
            "final-sigma", "k", "kelvin", "plain", "sigma", "strasse-sharp", "strasse-upper"
        ];
        var peopleOr = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase) { ["people"] = TagMatchModeValue.Or };

        // Tags match by the name fold the catalog identifies them by, whatever case each item holds.
        AssertBoth(session, new FilterStateModel { SelectedTags = ["ann"] }, "ann", "ann-bob", "ann-upper");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["k"] }, "k", "kelvin");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["K"] }, "k", "kelvin");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["σ"] }, "capital-sigma", "sigma");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["ς"] }, "final-sigma");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["ǆ"] }, "dz-title", "dz-upper");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["STRASSE"] }, "strasse-upper");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["straße"] }, "strasse-sharp");

        // Names that fold alike count once in an AND group.
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Ann", "ANN"] }, "ann", "ann-bob", "ann-upper");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["ann", "BOB"] }, "ann-bob");

        // A tag no item holds empties an AND group and is ignored by an OR group and by exclusion.
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Ann", "Zed"] });
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Ann", "Zed"], CategoryLocalMatchModes = peopleOr }, "ann", "ann-bob", "ann-upper");
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Ann", "Nobody"], GlobalMatchMode = true });
        AssertBoth(session, new FilterStateModel { SelectedTags = ["Ann", "Nobody"], GlobalMatchMode = false }, "ann", "ann-bob", "ann-upper");
        AssertBoth(session, new FilterStateModel { ExcludedTags = ["Nobody"] }, everything);

        // Exclusion matches by fold too.
        AssertBoth(
            session,
            new FilterStateModel { ExcludedTags = ["ANN", "k"] },
            everything.Except(["ann", "ann-bob", "ann-upper", "k", "kelvin"]).ToArray());

        // 27 tags in one group.
        var crowdOr = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase) { ["crowd"] = TagMatchModeValue.Or };
        AssertBoth(session, new FilterStateModel { SelectedTags = crowd, CategoryLocalMatchModes = crowdOr }, "crowd-all", "crowd-one");
        AssertBoth(session, new FilterStateModel { SelectedTags = crowd }, "crowd-all");
        AssertBoth(session, new FilterStateModel { ExcludedTags = crowd }, everything.Except(["crowd-all", "crowd-one"]).ToArray());
    }

    [Fact]
    public void TagFilter_MatchesReference_ForSeededRandomFilters()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.UpsertCategory("people", "People", 1);
        session.UpsertCategory("place", "Place", 2);
        string[] people = ["Ann", "Bob", "Cy", "K", "σ"];
        string[] places = ["Home", "Park", "Straße", "ǅ"];
        foreach (var name in people)
        {
            session.UpsertTag(name, "people");
        }

        foreach (var name in places)
        {
            session.UpsertTag(name, "place");
        }

        // These become Uncategorized catalog tags when an item first gets them.
        string[] pool = [.. people, .. places, "Misc", "ς", "STRASSE", "k"];
        var random = new Random(20261007);
        var ids = new List<string>();
        for (var i = 0; i < 60; i++)
        {
            var id = $"item-{i:00}";
            ids.Add(id);
            var tags = Enumerable.Range(0, random.Next(0, 5)).Select(_ => VaryCase(pool[random.Next(pool.Length)], random)).ToList();
            Add(session, id, "on", $"{id}.mp4", $"{id}.mp4", tags: tags);
        }

        var model = session.ReadTagEditor(ids);
        var catalogTags = session.ReadTagEditor(null).Tags;
        var itemTags = model.Items.ToDictionary(item => item.ItemId, item => item.Tags, StringComparer.Ordinal);
        string[] modeKeys = ["people", "PLACE", "uncategorized", string.Empty, "missing"];
        string[] extras = ["Nobody", " ", "ann", "PARK"];
        for (var run = 0; run < 400; run++)
        {
            var modes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase);
            foreach (var key in modeKeys.Where(_ => random.Next(2) == 0))
            {
                modes[key] = random.Next(2) == 0 ? TagMatchModeValue.And : TagMatchModeValue.Or;
            }

            var filter = new FilterStateModel
            {
                BlacklistedMode = FlagFilterModeValue.Off,
                SelectedTags = Enumerable.Range(0, random.Next(0, 7)).Select(_ => RandomTag(random)).ToList(),
                ExcludedTags = Enumerable.Range(0, random.Next(0, 3)).Select(_ => RandomTag(random)).ToList(),
                CategoryLocalMatchModes = random.Next(4) == 0 ? null : modes,
                GlobalMatchMode = random.Next(3) switch { 0 => null, 1 => true, _ => false }
            };
            var expected = ReferenceMatches(filter, catalogTags, itemTags).Order(StringComparer.Ordinal).ToArray();
            var eligible = session.QueryRandomCandidates(filter).Select(item => item.Id).ToArray();
            var listed = session.QueryList(new LibraryListRequest { Filter = filter, Limit = 100 });
            var listedIds = listed.Items.Select(item => item.Id).Order(StringComparer.Ordinal).ToArray();
            if (!expected.SequenceEqual(eligible) || !expected.SequenceEqual(listedIds) || listed.TotalCount != expected.Length)
            {
                Assert.Fail($"Run {run}, filter {JsonSerializer.Serialize(filter)}: expected [{string.Join(", ", expected)}], eligible [{string.Join(", ", eligible)}], listed [{string.Join(", ", listedIds)}] of {listed.TotalCount}.");
            }
        }

        string RandomTag(Random random) => random.Next(6) == 0
            ? extras[random.Next(extras.Length)]
            : VaryCase(pool[random.Next(pool.Length)], random);

        static string VaryCase(string name, Random random) => random.Next(3) switch
        {
            0 => name.ToUpperInvariant(),
            1 => name.ToLowerInvariant(),
            _ => name
        };
    }

    [Fact]
    public void TagFilter_QueryPlans_AreTheSameFor1And27Tags_WithNoCorrelatedSubqueries()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        session.UpsertCategory("people", "People", 1);
        session.UpsertCategory("place", "Place", 2);
        var people = Enumerable.Range(1, 27).Select(i => $"Person{i:00}").ToList();
        var places = Enumerable.Range(1, 27).Select(i => $"Place{i:00}").ToList();
        foreach (var name in people)
        {
            session.UpsertTag(name, "people");
        }

        foreach (var name in places)
        {
            session.UpsertTag(name, "place");
        }

        for (var i = 0; i < 27; i++)
        {
            Add(session, $"item-{i:00}", "on", $"item-{i:00}.mp4", $"item-{i:00}.mp4", tags: [people[i], places[i]]);
        }

        var anyMode = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["people"] = TagMatchModeValue.Or,
            ["place"] = TagMatchModeValue.Or
        };
        // Two-group shapes take one tag from each group at the low end and 27 across both at the high end.
        List<string> TwoGroups(int count) => count == 1 ? [people[0], places[0]] : [.. people.Take(14), .. places.Take(13)];
        (string Shape, Func<int, FilterStateModel> Filter)[] shapes =
        [
            ("one group, local OR", count => new FilterStateModel { SelectedTags = people.Take(count).ToList(), CategoryLocalMatchModes = anyMode }),
            ("one group, local AND", count => new FilterStateModel { SelectedTags = people.Take(count).ToList() }),
            ("two groups, global AND", count => new FilterStateModel { SelectedTags = TwoGroups(count), CategoryLocalMatchModes = anyMode, GlobalMatchMode = true }),
            ("two groups, global OR", count => new FilterStateModel { SelectedTags = TwoGroups(count), GlobalMatchMode = false }),
            ("excluded", count => new FilterStateModel { ExcludedTags = people.Take(count).ToList() })
        ];

        foreach (var (shape, filter) in shapes)
        {
            var one = QueryPlans(session, filter(1));
            var many = QueryPlans(session, filter(27));
            Assert.True(one.SequenceEqual(many), $"{shape}: 1 tag [{string.Join(" | ", one)}] vs 27 tags [{string.Join(" | ", many)}]");
            Assert.DoesNotContain(many, line => line.Contains("CORRELATED", StringComparison.Ordinal));
            Assert.Contains(many, line => line.Contains("idx_item_tags_name_fold", StringComparison.Ordinal));
        }
    }

    /// <summary>
    /// The rule the tag filter applies, written out over each item's stored tags: each category group of
    /// selected tags needs any (local OR) or all (local AND) of its tags, the groups combine by the global
    /// mode, and an item with an excluded tag is left out. Tags compare by name fold.
    /// </summary>
    private static IEnumerable<string> ReferenceMatches(
        FilterStateModel filter,
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        IReadOnlyDictionary<string, List<string>> itemTags)
    {
        var groups = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var tag in filter.SelectedTags.Where(tag => !string.IsNullOrWhiteSpace(tag)))
        {
            var fold = LibraryCatalogStore.Fold(tag);
            var category = catalogTags.FirstOrDefault(candidate => candidate.NameFold == fold)?.CategoryId ?? string.Empty;
            if (!groups.TryGetValue(category, out var folds))
            {
                folds = new HashSet<string>(StringComparer.Ordinal);
                groups[category] = folds;
            }

            folds.Add(fold);
        }

        var excluded = filter.ExcludedTags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Select(LibraryCatalogStore.Fold)
            .ToHashSet(StringComparer.Ordinal);
        foreach (var (itemId, tags) in itemTags)
        {
            var held = tags.Select(LibraryCatalogStore.Fold).ToHashSet(StringComparer.Ordinal);
            if (held.Overlaps(excluded))
            {
                continue;
            }

            var passed = groups.Select(group => IsLocalOr(group.Key) ? group.Value.Overlaps(held) : group.Value.IsSubsetOf(held)).ToList();
            if (passed.Count == 0 || (filter.GlobalMatchMode == false ? passed.Any(ok => ok) : passed.All(ok => ok)))
            {
                yield return itemId;
            }
        }

        bool IsLocalOr(string category) =>
            filter.CategoryLocalMatchModes != null &&
            filter.CategoryLocalMatchModes.TryGetValue(category, out var mode) &&
            mode == TagMatchModeValue.Or;
    }

    /// <summary>The plan details of the browse count, browse page, and random candidates queries for a filter.</summary>
    private static List<string> QueryPlans(LibraryCatalogSession session, FilterStateModel filter)
    {
        using var connection = LibraryCatalogStore.OpenWrite(session.DatabasePath);
        LibraryCatalogListSql.RegisterCollation(connection);
        var catalogTags = session.ReadTagEditor(null).Tags;
        var request = new LibraryListRequest { Filter = filter, Limit = 200 };
        var lines = new List<string>();

        var countArgs = new LibraryCatalogListSql.SqlArgs();
        var countWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, countArgs);
        lines.AddRange(Explain(LibraryCatalogSession.ListCountSql(countWhere), countArgs).Select(line => "count: " + line));

        var pageArgs = new LibraryCatalogListSql.SqlArgs();
        var pageWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, pageArgs);
        var limit = pageArgs.Add(request.Limit);
        var offset = pageArgs.Add(request.Offset);
        var pageSql = LibraryCatalogSession.ListPageSql(pageWhere, LibraryCatalogListSql.BuildOrderBy(request), limit, offset);
        lines.AddRange(Explain(pageSql, pageArgs).Select(line => "page: " + line));

        var candidateArgs = new LibraryCatalogListSql.SqlArgs();
        var candidateWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, candidateArgs);
        lines.AddRange(Explain(LibraryCatalogSession.RandomCandidatesSql(candidateWhere), candidateArgs).Select(line => "candidates: " + line));
        return lines;

        List<string> Explain(string sql, LibraryCatalogListSql.SqlArgs args)
        {
            using var command = connection.CreateCommand();
            command.CommandText = "EXPLAIN QUERY PLAN " + sql;
            args.Bind(command);
            using var reader = command.ExecuteReader();
            var details = new List<string>();
            while (reader.Read())
            {
                details.Add(reader.GetString(3));
            }

            return details;
        }
    }

    private static void AssertBoth(LibraryCatalogSession session, FilterStateModel filter, params string[] expected)
    {
        var listed = session.QueryList(new LibraryListRequest { Filter = filter, Limit = 50 })
            .Items.Select(item => item.Id).OrderBy(id => id, StringComparer.Ordinal).ToArray();
        var eligible = session.QueryRandomCandidates(filter)
            .Select(item => item.Id).OrderBy(id => id, StringComparer.Ordinal).ToArray();
        Assert.Equal(expected, listed);
        Assert.Equal(expected, eligible);
    }

    [Fact]
    public void QueryLibrary_RejectsInvalidPagingSortAndFilter_AndEnrichesOnlyThePage()
    {
        var appData = Path.Combine(Path.GetTempPath(), "reelroulette-library-query", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(appData);
        try
        {
            CatalogSeed.Write(
                appData,
                sources: [new SeedSource("on", "/media")],
                items:
                [
                    new SeedItem("a", "/media/a.mp4")
                    {
                        SourceId = "on",
                        RelativePath = "a.mp4",
                        ThumbnailRevision = "r",
                        ThumbnailWidth = 320,
                        ThumbnailHeight = 180
                    },
                    new SeedItem("b", "/media/b.mp4")
                    {
                        SourceId = "on",
                        RelativePath = "b.mp4"
                    }
                ]);
            var thumbs = Path.Combine(appData, "thumbnails");
            Directory.CreateDirectory(thumbs);
            File.WriteAllBytes(Path.Combine(thumbs, "a.jpg"), [0xFF, 0xD8, 0xFF]);

            var operations = new LibraryOperationsService(CatalogOpen.Host(appData), NullLogger<LibraryOperationsService>.Instance, appData);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { Offset = -1 }).Accepted);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { Limit = 0 }).Accepted);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { Limit = 10_001 }).Accepted);
            Assert.True(operations.QueryLibrary(new LibraryQueryRequest { Limit = 10_000 }).Accepted);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { SortMode = "Size" }).Accepted);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest
            {
                FilterState = JsonSerializer.SerializeToElement(new[] { 1 })
            }).Accepted);

            var favorites = operations.QueryLibrary(new LibraryQueryRequest
            {
                FilterState = JsonSerializer.SerializeToElement(new { favoritesOnly = true }),
                Limit = 10
            });
            Assert.True(favorites.Accepted);
            Assert.Empty(favorites.Body!["items"]!.AsArray());
            Assert.Equal(2, favorites.Body["searchBaselineCount"]!.GetValue<int>());
            Assert.Equal(0, favorites.Body["totalCount"]!.GetValue<int>());

            var outcome = operations.QueryLibrary(new LibraryQueryRequest { Limit = 1, SortMode = "name" });
            Assert.True(outcome.Accepted);
            var items = outcome.Body!["items"]!.AsArray();
            Assert.Equal("a", items[0]!["id"]!.GetValue<string>());
            Assert.Null(items[0]!["hasThumbnail"]);

            var refresh = CreateRefresh(appData);
            refresh.EnrichListedItems(items);
            Assert.True(items[0]!["hasThumbnail"]!.GetValue<bool>());
            Assert.Equal(
                RefreshPipelineService.ThumbnailVersion(new FileInfo(Path.Combine(thumbs, "a.jpg"))),
                items[0]!["thumbnailVersion"]!.GetValue<string>());
            Assert.Equal(320, items[0]!["thumbnailWidth"]!.GetValue<int>());
            Assert.Equal(180, items[0]!["thumbnailHeight"]!.GetValue<int>());
            Assert.False(File.Exists(Path.Combine(thumbs, "b.jpg")));
            Assert.Single(items);
        }
        finally
        {
            if (Directory.Exists(appData))
            {
                Directory.Delete(appData, recursive: true);
            }
        }
    }

    [Fact]
    public void QueryLibrary_WritesOneLineWithItsElapsedTime_AfterEnrichingTheItems()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        Add(session, "a", "on", "a.mp4", "a.mp4");
        Add(session, "b", "on", "b.mp4", "b.mp4");
        var operations = new LibraryOperationsService(CatalogOpen.Host(dir.Path), NullLogger<LibraryOperationsService>.Instance, dir.Path);
        var enrichedBeforeLog = false;

        var outcome = operations.QueryLibrary(
            new LibraryQueryRequest { Limit = 10 },
            items =>
            {
                var log = Path.Combine(dir.Path, "last.log");
                enrichedBeforeLog = !File.Exists(log) ||
                    !File.ReadAllText(log).Contains("Library query", StringComparison.Ordinal);
                Assert.Equal(2, items.Count);
            });

        Assert.True(outcome.Accepted);
        Assert.True(enrichedBeforeLog);
        var line = Assert.Single(File.ReadAllLines(Path.Combine(dir.Path, "last.log")), line => line.Contains("Library query", StringComparison.Ordinal));
        Assert.Matches(@"Library query offset=0 limit=10 sort=Name descending=False total=2 baseline=2 returned=2 elapsedMs=\d+\.$", line);
    }

    [Fact]
    public void QueryLibrary_ReturnsCatalogThumbnailDimensions_ForTaggedAndUntaggedItems()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        Add(session, "tagged", "on", "a.mp4", "a.mp4", tags: ["x"]);
        Add(session, "plain", "on", "b.mp4", "b.mp4");
        Assert.True(session.SetThumbnail("tagged", "r1", 320, 180));
        Assert.True(session.SetThumbnail("plain", "r2", 180, 320));

        var host = LibraryCatalogHost.Open(dir.Path);
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, dir.Path);
        var outcome = operations.QueryLibrary(new LibraryQueryRequest { Limit = 10 });
        Assert.True(outcome.Accepted);
        var items = outcome.Body!["items"]!.AsArray();
        CreateRefresh(dir.Path).EnrichListedItems(items);

        var byId = items.ToDictionary(item => item!["id"]!.GetValue<string>(), item => item!);
        Assert.Equal(320, byId["tagged"]["thumbnailWidth"]?.GetValue<int>());
        Assert.Equal(180, byId["tagged"]["thumbnailHeight"]?.GetValue<int>());
        Assert.Equal(180, byId["plain"]["thumbnailWidth"]?.GetValue<int>());
        Assert.Equal(320, byId["plain"]["thumbnailHeight"]?.GetValue<int>());
    }

    [Fact]
    public void QueryLibrary_AcceptsDesktopDurationFilterJson()
    {
        var appData = Path.Combine(Path.GetTempPath(), "reelroulette-library-query", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(appData);
        try
        {
            CatalogSeed.Write(
                appData,
                sources: [new SeedSource("on", "/media")],
                items:
                [
                    new SeedItem("brief", "/media/brief.mp4")
                    {
                        SourceId = "on",
                        RelativePath = "brief.mp4",
                        Duration = TimeSpan.FromSeconds(30)
                    },
                    new SeedItem("long", "/media/long.mp4")
                    {
                        SourceId = "on",
                        RelativePath = "long.mp4",
                        Duration = TimeSpan.FromSeconds(120)
                    }
                ]);
            var operations = new LibraryOperationsService(CatalogOpen.Host(appData), NullLogger<LibraryOperationsService>.Instance, appData);
            var outcome = operations.QueryLibrary(new LibraryQueryRequest
            {
                FilterState = JsonSerializer.SerializeToElement(new
                {
                    minDuration = "00:01:00",
                    maxDuration = "01:00:00"
                }),
                Limit = 10
            });

            Assert.True(outcome.Accepted);
            var ids = outcome.Body!["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>()).ToList();
            Assert.Equal(["long"], ids);
        }
        finally
        {
            if (Directory.Exists(appData))
            {
                Directory.Delete(appData, recursive: true);
            }
        }
    }

    [Fact]
    public void ReadListedItemAndBaseline_CoverHeaderReaders_WithoutBuildingTheCatalogDocument()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        Assert.Equal(-18.0, session.ReadLibraryStats().Global.BaselineLoudnessLufs);

        session.InsertSource("on", "/media", "On", true);
        session.InsertSource("off", "/other", "Off", false);
        session.UpsertCategory("people", "People", 1);
        session.UpsertTag("Ann", "people");
        var played = new DateTime(2024, 3, 2, 4, 5, 6, DateTimeKind.Utc);
        Add(session, "quiet", "on", "quiet.mp4", "quiet.mp4", hasAudio: true, tags: ["Ann"]);
        Add(session, "mid", "on", "mid.mp4", "mid.mp4", hasAudio: true);
        Add(session, "loud", "on", "loud.mp4", "loud.mp4", hasAudio: true);
        Add(session, "keep", "on", "keep.mp4", "keep.mp4", favorite: true, playCount: 4, lastPlayed: played, hasAudio: true, tags: ["Ann"]);
        Add(session, "photo", "on", "photo.jpg", "photo.jpg", mediaType: 1, hasAudio: true);
        Add(session, "silent", "on", "silent.mp4", "silent.mp4", hasAudio: false);
        Add(session, "unknown", "on", "unknown.mp4", "unknown.mp4", hasAudio: true);
        Add(session, "disabled", "off", "disabled.mp4", "disabled.mp4", hasAudio: true);
        Assert.True(session.SetLoudness("quiet", true, -30.0, null, null));
        Assert.True(session.SetLoudness("mid", true, -24.0, null, null));
        Assert.True(session.SetLoudness("loud", true, -20.0, null, null));
        Assert.True(session.SetLoudness("keep", true, -14.0, -1.25, null));
        Assert.True(session.SetLoudness("photo", true, -10.0, null, null));
        Assert.True(session.SetLoudness("silent", false, -8.0, null, null));
        Assert.True(session.SetLoudness("disabled", true, -16.0, null, null));

        var stats = session.ReadLibraryStats();
        Assert.Equal(-16.0, stats.Global.BaselineLoudnessLufs);

        var byId = session.ReadListedItem("KEEP");
        Assert.NotNull(byId);
        Assert.Equal("keep", byId!.Id);
        Assert.Equal("/media/keep.mp4", byId.FullPath);
        Assert.True(byId.IsFavorite);
        Assert.False(byId.IsBlacklisted);
        Assert.Equal(4, byId.PlayCount);
        Assert.Equal(played, byId.LastPlayedUtc);
        Assert.Equal(-14.0, byId.IntegratedLoudness);
        Assert.Equal(["Ann"], byId.Tags);

        var byPath = session.ReadListedItem("/MEDIA/keep.mp4");
        Assert.Equal("keep", byPath!.Id);
        Assert.Null(session.ReadListedItem("missing"));

        var host = LibraryCatalogHost.Open(dir.Path);
        var operations = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, dir.Path);
        var item = operations.ReadLibraryItem("keep");
        Assert.NotNull(item);
        Assert.Equal("keep", item!["id"]!.GetValue<string>());
        Assert.Equal("Ann", item["tags"]!.AsArray()[0]!.GetValue<string>());
        Assert.True(item["isFavorite"]!.GetValue<bool>());
        Assert.Equal(4, item["playCount"]!.GetValue<int>());
        Assert.Null(operations.ReadLibraryItem("missing"));
        Assert.Null(operations.ReadLibraryItem("  "));
        var serviceStats = operations.GetLibraryStats();
        Assert.Equal(-16.0, serviceStats.Global.BaselineLoudnessLufs);
    }

    [Fact]
    public void Query_RepeatAtTheSameRevision_RunsNoCountQueries_AndAWriteCountsAgain()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        Add(session, "a", "on", "Alpha.mp4", "Alpha.mp4");
        Add(session, "b", "on", "Beta.mp4", "Beta.mp4", favorite: true);
        Add(session, "c", "on", "Gamma.mp4", "Gamma.mp4");
        var favorites = new FilterStateModel { FavoritesMode = FlagFilterModeValue.Only };
        var counted = session.ListCountQueries;

        var first = session.QueryList(new LibraryListRequest { Filter = favorites, Limit = 1 });
        Assert.Equal(counted + 2, session.ListCountQueries);

        var repeat = session.QueryList(new LibraryListRequest { Filter = favorites, Limit = 1 });
        var nextPage = session.QueryList(new LibraryListRequest { Filter = favorites, Offset = 1, Limit = 1 });
        var reload = session.QueryList(new LibraryListRequest { Filter = favorites, Limit = 50 });
        Assert.Equal(counted + 2, session.ListCountQueries);
        foreach (var page in new[] { first, repeat, nextPage, reload })
        {
            Assert.Equal((1, 3), (page.TotalCount, page.SearchBaselineCount));
        }

        // The same search with another filter counts only the filtered total.
        Assert.Equal(3, session.QueryList(new LibraryListRequest { Filter = new FilterStateModel(), Limit = 1 }).TotalCount);
        Assert.Equal(counted + 3, session.ListCountQueries);

        Assert.True(session.SetFavorite("a", true));
        var afterWrite = session.QueryList(new LibraryListRequest { Filter = favorites, Limit = 1 });

        Assert.Equal(counted + 5, session.ListCountQueries);
        Assert.Equal((2, 3), (afterWrite.TotalCount, afterWrite.SearchBaselineCount));
    }

    // The app never lets an item be both favorite and blacklisted, so two of the nine pairings repeat another's result:
    // Favorites only is the same with Blacklisted off or excluded, and Blacklisted only is the same with Favorites off
    // or excluded. Favorites only with Blacklisted only is always empty. With 1 plain, 2 favorite, and 4 blacklisted
    // items, the seven distinct results each have their own count, so a count can't match another's set.
    [Fact]
    public void FlagModes_ListCountAndRandomCandidates_MatchEachPairing()
    {
        using var dir = new TempDirectory();
        var session = SeedFlagModeItems(dir);
        var counts = new HashSet<int>();
        foreach (var favorites in FlagModes)
        {
            foreach (var blacklisted in FlagModes)
            {
                var expected = FlagModeItemIds(item => FlagMatches(favorites, item.Favorite) && FlagMatches(blacklisted, item.Blacklisted));
                AssertListedAndEligible(session, FlagModeFilter(favorites, blacklisted), expected);
                counts.Add(expected.Length);
            }
        }

        Assert.Equal(7, counts.Count);

        // The defaults, Favorites off and Blacklisted excluded, are today's results.
        AssertListedAndEligible(session, "{}", FlagModeItemIds(item => !item.Blacklisted));
    }

    // Each old field alone, true, false, or missing, as the parser read them before the modes: favoritesOnly true keeps
    // only favorites, and excludeBlacklisted anything but false leaves out blacklisted items.
    [Fact]
    public void FlagModes_OldFieldsAlone_GiveTheirOldResults()
    {
        using var dir = new TempDirectory();
        var session = SeedFlagModeItems(dir);
        foreach (var favoritesOnly in new bool?[] { true, false, null })
        {
            foreach (var excludeBlacklisted in new bool?[] { true, false, null })
            {
                var fields = new List<string>();
                if (favoritesOnly is bool favorites)
                {
                    fields.Add($"\"favoritesOnly\":{(favorites ? "true" : "false")}");
                }

                if (excludeBlacklisted is bool exclude)
                {
                    fields.Add($"\"excludeBlacklisted\":{(exclude ? "true" : "false")}");
                }

                var expected = FlagModeItemIds(item => (favoritesOnly != true || item.Favorite) && (excludeBlacklisted == false || !item.Blacklisted));
                AssertListedAndEligible(session, "{" + string.Join(",", fields) + "}", expected);
            }
        }
    }

    // Every count a filtered query returns, its total and its search baseline, at one catalog revision. Each pairing
    // after the first runs with the cache warm from the others and counts its own total, then every count is cached.
    // Favorites off with Blacklisted off adds no condition, so its total is the same query as the baseline and shares
    // its count: nine count queries for nine totals and one baseline.
    [Fact]
    public void FlagModes_CountCache_KeepsEachPairingsCounts()
    {
        using var dir = new TempDirectory();
        var session = SeedFlagModeItems(dir);
        var pairings = FlagModes.SelectMany(favorites => FlagModes.Select(blacklisted => (favorites, blacklisted))).ToList();
        var counted = session.ListCountQueries;

        AssertCounts(pairings);
        Assert.Equal(counted + pairings.Count, session.ListCountQueries);

        pairings.Reverse();
        AssertCounts(pairings);
        Assert.Equal(counted + pairings.Count, session.ListCountQueries);

        void AssertCounts(IEnumerable<(FlagFilterModeValue Favorites, FlagFilterModeValue Blacklisted)> sequence)
        {
            foreach (var (favorites, blacklisted) in sequence)
            {
                var filterJson = FlagModeFilter(favorites, blacklisted);
                var page = session.QueryList(new LibraryListRequest { Filter = ParseFilter(filterJson), Limit = 1 });
                var expected = FlagModeItemIds(item => FlagMatches(favorites, item.Favorite) && FlagMatches(blacklisted, item.Blacklisted)).Length;
                Assert.True(
                    (page.TotalCount, page.SearchBaselineCount) == (expected, FlagModeItems.Length),
                    $"{filterJson}: expected ({expected}, {FlagModeItems.Length}), got ({page.TotalCount}, {page.SearchBaselineCount}).");
            }
        }
    }

    private static readonly FlagFilterModeValue[] FlagModes = [FlagFilterModeValue.Off, FlagFilterModeValue.Only, FlagFilterModeValue.Excluded];

    private static readonly (string Id, bool Favorite, bool Blacklisted)[] FlagModeItems =
    [
        ("plain", false, false),
        ("favorite-1", true, false),
        ("favorite-2", true, false),
        ("blacklisted-1", false, true),
        ("blacklisted-2", false, true),
        ("blacklisted-3", false, true),
        ("blacklisted-4", false, true)
    ];

    private static LibraryCatalogSession SeedFlagModeItems(TempDirectory dir)
    {
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        foreach (var item in FlagModeItems)
        {
            Add(session, item.Id, "on", item.Id + ".mp4", item.Id + ".mp4", favorite: item.Favorite, blacklisted: item.Blacklisted);
        }

        return session;
    }

    private static string[] FlagModeItemIds(Func<(string Id, bool Favorite, bool Blacklisted), bool> matches)
    {
        return FlagModeItems.Where(matches).Select(item => item.Id).Order(StringComparer.Ordinal).ToArray();
    }

    private static bool FlagMatches(FlagFilterModeValue mode, bool flag) => mode switch
    {
        FlagFilterModeValue.Only => flag,
        FlagFilterModeValue.Excluded => !flag,
        _ => true
    };

    private static string FlagModeFilter(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        return $$"""{"favoritesMode":"{{favorites.ToString().ToLowerInvariant()}}","blacklistedMode":"{{blacklisted.ToString().ToLowerInvariant()}}"}""";
    }

    private static FilterStateModel ParseFilter(string json)
    {
        using var document = JsonDocument.Parse(json);
        Assert.True(LibraryListFilterParser.TryParse(document.RootElement, out var filter, out var error), error);
        return filter!;
    }

    // The list query's items and total, and random selection's candidates, which come back in ordinal id order.
    private static void AssertListedAndEligible(LibraryCatalogSession session, string filterJson, string[] expected)
    {
        var filter = ParseFilter(filterJson);
        var listed = session.QueryList(new LibraryListRequest { Filter = filter, Limit = 50 });
        var listedIds = listed.Items.Select(item => item.Id).Order(StringComparer.Ordinal).ToArray();
        var eligibleIds = session.QueryRandomCandidates(filter).Select(item => item.Id).ToArray();
        Assert.True(
            expected.SequenceEqual(listedIds) && listed.TotalCount == expected.Length && expected.SequenceEqual(eligibleIds),
            $"{filterJson}: expected [{string.Join(", ", expected)}], listed [{string.Join(", ", listedIds)}] of {listed.TotalCount}, eligible [{string.Join(", ", eligibleIds)}].");
    }

    private static RefreshPipelineService CreateRefresh(string appData)
    {
        var settings = new CoreSettingsService(
            new ServerRuntimeOptions(),
            appData);
        return new RefreshPipelineService(
            new ServerStateService(),
            NullLogger<RefreshPipelineService>.Instance,
            settings,
            CatalogOpen.Host(appData),
            appData);
    }

    private static LibraryCatalogSession Open(TempDirectory dir)
    {
        return CatalogOpen.Open(dir.Path).Session!;
    }

    private static void Add(
        LibraryCatalogSession session,
        string id,
        string sourceId,
        string fileName,
        string relativePath,
        bool favorite = false,
        bool blacklisted = false,
        int playCount = 0,
        DateTime? lastPlayed = null,
        DateTime? written = null,
        TimeSpan? duration = null,
        int mediaType = 0,
        bool? hasAudio = null,
        IReadOnlyList<string>? tags = null)
    {
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = id,
            SourceId = sourceId,
            FullPath = "/media/" + relativePath,
            RelativePath = relativePath,
            FileName = fileName,
            IsFavorite = favorite,
            IsBlacklisted = blacklisted,
            PlayCount = playCount,
            LastPlayedUtc = lastPlayed,
            LastWriteTimeUtc = written,
            DurationTicks = duration?.Ticks,
            MediaType = mediaType,
            HasAudio = hasAudio
        }));
        if (tags is { Count: > 0 })
        {
            Assert.True(session.ApplyItemTagEdits([id], tags, [], out _));
        }
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "reelroulette-list-query", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, recursive: true);
            }
        }
    }
}
