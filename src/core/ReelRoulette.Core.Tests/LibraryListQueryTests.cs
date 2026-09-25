using System.Text.Json;
using System.Text.Json.Nodes;
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
            Filter = new FilterStateModel { FavoritesOnly = true, ExcludeBlacklisted = false },
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
                ExcludeBlacklisted = true,
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
                ExcludeBlacklisted = false,
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
                ExcludeBlacklisted = false,
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
    public void Query_LegacyTagAnd_WhenCatalogHasNoCategories()
    {
        using var dir = new TempDirectory();
        var session = Open(dir);
        session.InsertSource("on", "/media", "On", true);
        Add(session, "both", "on", "both.mp4", "both.mp4", tags: ["Red", "Blue"]);
        Add(session, "red", "on", "red.mp4", "red.mp4", tags: ["Red"]);
        using (var connection = LibraryCatalogStore.OpenWrite(session.DatabasePath))
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "DELETE FROM categories;";
            command.ExecuteNonQuery();
        }

        var page = session.QueryList(new LibraryListRequest
        {
            Filter = new FilterStateModel
            {
                ExcludeBlacklisted = false,
                SelectedTags = ["red", "blue"],
                TagMatchMode = TagMatchModeValue.And
            },
            Limit = 10
        });

        Assert.Equal("both", Assert.Single(page.Items).Id);
        Assert.Equal(["Blue", "Red"], page.Items[0].Tags.OrderBy(tag => tag, StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void QueryLibrary_RejectsInvalidPagingSortAndFilter_AndEnrichesOnlyThePage()
    {
        var appData = Path.Combine(Path.GetTempPath(), "reelroulette-library-query", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(appData);
        try
        {
            File.WriteAllText(Path.Combine(appData, "library.json"), """
                {
                  "sources": [ { "id": "on", "rootPath": "/media", "isEnabled": true } ],
                  "items": [
                    { "id": "a", "sourceId": "on", "fullPath": "/media/a.mp4", "fileName": "a.mp4", "relativePath": "a.mp4" },
                    { "id": "b", "sourceId": "on", "fullPath": "/media/b.mp4", "fileName": "b.mp4", "relativePath": "b.mp4" }
                  ]
                }
                """);
            var thumbs = Path.Combine(appData, "thumbnails");
            Directory.CreateDirectory(thumbs);
            File.WriteAllBytes(Path.Combine(thumbs, "a.jpg"), [0xFF, 0xD8, 0xFF]);
            File.WriteAllText(Path.Combine(thumbs, "index.json"), """{"a":{"width":320,"height":180,"revision":"r"}}""");

            var operations = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appData);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { Offset = -1 }).Accepted);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { Limit = 0 }).Accepted);
            Assert.False(operations.QueryLibrary(new LibraryQueryRequest { Limit = 501 }).Accepted);
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
    public void QueryLibrary_AcceptsDesktopDurationFilterJson()
    {
        var appData = Path.Combine(Path.GetTempPath(), "reelroulette-library-query", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(appData);
        try
        {
            File.WriteAllText(Path.Combine(appData, "library.json"), """
                {
                  "sources": [ { "id": "on", "rootPath": "/media", "isEnabled": true } ],
                  "items": [
                    { "id": "brief", "sourceId": "on", "fullPath": "/media/brief.mp4", "fileName": "brief.mp4", "relativePath": "brief.mp4", "duration": "00:00:30" },
                    { "id": "long", "sourceId": "on", "fullPath": "/media/long.mp4", "fileName": "long.mp4", "relativePath": "long.mp4", "duration": "00:02:00" }
                  ]
                }
                """);
            var operations = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appData);
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

    private static RefreshPipelineService CreateRefresh(string appData)
    {
        var settings = new CoreSettingsService(
            NullLogger<CoreSettingsService>.Instance,
            new ServerRuntimeOptions(),
            appData);
        return new RefreshPipelineService(
            new ServerStateService(),
            NullLogger<RefreshPipelineService>.Instance,
            settings,
            appData);
    }

    private static LibraryCatalogSession Open(TempDirectory dir)
    {
        return LibraryCatalogStore.Open(dir.Path).Session!;
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
            Assert.True(session.AddItemTags(id, tags));
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
