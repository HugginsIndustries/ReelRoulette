using System.Text.Json.Nodes;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryCatalogSessionTests
{
    [Fact]
    public void Open_StoresLoudnessErrorFromLibraryJson()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "items": [
                {
                  "id": "item-1",
                  "fullPath": "/clips/a.mp4",
                  "fileName": "a.mp4",
                  "loudnessError": "no audio stream"
                }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        var item = Assert.Single(opened.Catalog!.Items);
        Assert.Equal("no audio stream", item.LoudnessError);
        Assert.Equal("1", ReadUserVersion(dir.Path));
    }

    [Fact]
    public void FavoriteAndDurationUpdates_OnTwoConnections_BothRemain()
    {
        using var dir = new TempDirectory();
        var opened = LibraryCatalogStore.Open(dir.Path);
        var first = opened.Session!;
        Assert.True(first.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4",
            IsBlacklisted = true
        }));

        var second = new LibraryCatalogSession(first.DatabasePath);
        Assert.True(first.SetFavorite("item-1", true));
        Assert.True(second.SetDuration("item-1", TimeSpan.FromSeconds(90.5).Ticks));

        var item = Assert.Single(LibraryCatalogStore.Read(first.DatabasePath).Items);
        Assert.True(item.IsFavorite);
        Assert.False(item.IsBlacklisted);
        Assert.Equal(TimeSpan.FromSeconds(90.5).Ticks, item.DurationTicks);
    }

    [Fact]
    public void TagUpdate_SurvivesLaterSourceEnabledUpdate()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.InsertSource("source-1", "/clips", "Clips", false));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            SourceId = "source-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4"
        }));
        Assert.True(session.AddItemTags("item-1", ["Café"]));

        var other = new LibraryCatalogSession(session.DatabasePath);
        Assert.True(other.SetSourceEnabled("source-1", true));

        var catalog = LibraryCatalogStore.Read(session.DatabasePath);
        Assert.Equal(["Café"], Assert.Single(catalog.Items).Tags);
        Assert.True(Assert.Single(catalog.Sources).IsEnabled);
        Assert.False(catalog.AvailableTagsPresent);
    }

    [Fact]
    public void BuildDocument_UsesIntegerEnumsAndHourDuration_OmitsThumbnailsAndFingerprintIndex()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4",
            DurationTicks = TimeSpan.FromSeconds(90.5).Ticks,
            MediaType = 1,
            FingerprintStatus = 2,
            LoudnessError = "decode failed"
        }));

        var document = session.BuildDocument();
        var json = document.ToJsonString();
        var item = Assert.IsType<JsonObject>(Assert.IsType<JsonArray>(document["items"])[0]);

        Assert.Equal(1, item["mediaType"]!.GetValue<int>());
        Assert.Equal(2, item["fingerprintStatus"]!.GetValue<int>());
        Assert.Equal("00:01:30", item["duration"]!.GetValue<string>());
        Assert.Equal("decode failed", item["loudnessError"]!.GetValue<string>());
        Assert.DoesNotContain("thumbnailWidth", json, StringComparison.Ordinal);
        Assert.DoesNotContain("thumbnailHeight", json, StringComparison.Ordinal);
        Assert.DoesNotContain("hasThumbnail", json, StringComparison.Ordinal);
        Assert.DoesNotContain("fingerprintIndex", json, StringComparison.Ordinal);
        Assert.Null(document["availableTags"]);
    }

    [Fact]
    public void InsertItem_TrimsAndDedupesTags_SoLaterRemoveMatches()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4",
            Tags = [" Café ", "café"]
        }));

        Assert.Equal(["Café"], Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Items).Tags);

        Assert.True(session.RemoveItemTags("item-1", ["café"]));
        Assert.Empty(Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Items).Tags);
    }

    [Fact]
    public void RenameTag_OntoExistingName_MergesCatalogAndItemTags()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("foo", "alpha"));
        Assert.True(session.UpsertTag("bar", "beta"));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "only-foo",
            FullPath = "/clips/foo.mp4",
            FileName = "foo.mp4",
            Tags = ["foo"]
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "only-bar",
            FullPath = "/clips/bar.mp4",
            FileName = "bar.mp4",
            Tags = ["bar"]
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "both",
            FullPath = "/clips/both.mp4",
            FileName = "both.mp4",
            Tags = ["foo", "bar"]
        }));

        Assert.True(session.RenameTag("foo", "bar", null));

        var catalog = LibraryCatalogStore.Read(session.DatabasePath);
        var tag = Assert.Single(catalog.Tags);
        Assert.Equal("bar", tag.Name);
        Assert.Equal("alpha", tag.CategoryId);
        var items = catalog.Items.ToDictionary(item => item.Id);
        Assert.Equal(["bar"], items["only-foo"].Tags);
        Assert.Equal(["bar"], items["only-bar"].Tags);
        Assert.Equal(["bar"], items["both"].Tags);
    }

    [Fact]
    public void RenameTag_OntoEarlierName_KeepsEarlierCategory()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("bar", "beta"));
        Assert.True(session.UpsertTag("foo", "alpha"));

        Assert.True(session.RenameTag("foo", "bar", null));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("bar", tag.Name);
        Assert.Equal("beta", tag.CategoryId);
    }

    [Fact]
    public void RenameTag_UncategorizedLosesToRealCategory_InEitherOrder()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("foo", null));
        Assert.True(session.UpsertTag("bar", "beta"));

        Assert.True(session.RenameTag("foo", "bar", null));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("beta", tag.CategoryId);

        using var other = new TempDirectory();
        var later = LibraryCatalogStore.Open(other.Path).Session!;
        Assert.True(later.UpsertTag("bar", null));
        Assert.True(later.UpsertTag("foo", "alpha"));

        Assert.True(later.RenameTag("foo", "bar", null));

        var kept = Assert.Single(LibraryCatalogStore.Read(later.DatabasePath).Tags);
        Assert.Equal("alpha", kept.CategoryId);
    }

    [Fact]
    public void AddItemTags_CreatesMissingCatalogTag_AndLeavesExistingCategoryAndSpelling()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("Café", "beta"));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4"
        }));

        Assert.True(session.AddItemTags("item-1", [" café ", "New"]));

        var catalog = LibraryCatalogStore.Read(session.DatabasePath);
        Assert.Equal(["café", "New"], Assert.Single(catalog.Items).Tags);
        Assert.Equal(2, catalog.Tags.Count);
        var existing = Assert.Single(catalog.Tags, tag => string.Equals(tag.Name, "Café", StringComparison.Ordinal));
        Assert.Equal("beta", existing.CategoryId);
        var created = Assert.Single(catalog.Tags, tag => tag.Name == "New");
        Assert.Equal("uncategorized", created.CategoryId);
        Assert.False(catalog.AvailableTagsPresent);
    }

    [Fact]
    public void AddItemTags_WhenItemAlreadyHasTag_FillsMissingCatalogRow()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4",
            Tags = ["Café"]
        }));
        var revision = session.Revision;

        Assert.True(session.AddItemTags("item-1", ["café"]));

        var catalog = LibraryCatalogStore.Read(session.DatabasePath);
        Assert.Equal(["Café"], Assert.Single(catalog.Items).Tags);
        var tag = Assert.Single(catalog.Tags);
        Assert.Equal("café", tag.Name);
        Assert.Equal("uncategorized", tag.CategoryId);
        Assert.Equal(revision + 1, session.Revision);
    }

    [Fact]
    public void AddItemTags_MissingItem_CreatesNothing()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;

        Assert.False(session.AddItemTags("missing", ["Café"]));

        var catalog = LibraryCatalogStore.Read(session.DatabasePath);
        Assert.Empty(catalog.Items);
        Assert.Empty(catalog.Tags);
        Assert.Equal(0, session.Revision);
    }

    [Fact]
    public void UpsertTag_BlankCategory_KeepsExistingSpellingAndRevision()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("Foo", "beta"));
        var revision = session.Revision;

        Assert.False(session.UpsertTag("foo", null));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("Foo", tag.Name);
        Assert.Equal("beta", tag.CategoryId);
        Assert.Equal(revision, session.Revision);
    }

    [Fact]
    public void UpsertTag_SameCategory_DifferentSpelling_ChangesNothing()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("Foo", "beta"));
        var revision = session.Revision;

        Assert.False(session.UpsertTag("foo", "beta"));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("Foo", tag.Name);
        Assert.Equal("beta", tag.CategoryId);
        Assert.Equal(revision, session.Revision);
    }

    [Fact]
    public void UpsertTag_DifferentCategory_UpdatesCategoryOnly()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("Foo", "beta"));

        Assert.True(session.UpsertTag("foo", "alpha"));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("Foo", tag.Name);
        Assert.Equal("alpha", tag.CategoryId);
    }

    [Fact]
    public void UpsertTag_BlankCategory_KeepsExistingCategoryAndLeavesRevision()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("foo", "beta"));
        var revision = session.Revision;

        Assert.False(session.UpsertTag("foo", null));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("foo", tag.Name);
        Assert.Equal("beta", tag.CategoryId);
        Assert.Equal(revision, session.Revision);
    }

    [Fact]
    public void UpsertTag_BlankCategory_OnNewTag_StoresUncategorized()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;

        Assert.True(session.UpsertTag("foo", "  "));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("uncategorized", tag.CategoryId);
    }

    [Fact]
    public void ReplaceTagCatalog_DuplicateNames_KeepEarlierCategoryUnlessUncategorized()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;

        Assert.True(session.ReplaceTagCatalog(
            [],
            [
                new LibraryCatalogTag { Name = "Foo", CategoryId = "beta" },
                new LibraryCatalogTag { Name = "foo", CategoryId = "" }
            ]));

        var tag = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("Foo", tag.Name);
        Assert.Equal("beta", tag.CategoryId);

        Assert.True(session.ReplaceTagCatalog(
            [],
            [
                new LibraryCatalogTag { Name = "foo", CategoryId = "" },
                new LibraryCatalogTag { Name = "Foo", CategoryId = "alpha" }
            ]));

        var upgraded = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Tags);
        Assert.Equal("Foo", upgraded.Name);
        Assert.Equal("alpha", upgraded.CategoryId);
    }

    [Fact]
    public void InsertItem_MissingFingerprintVersion_StoresOne()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;

        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4"
        }));

        var item = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Items);
        Assert.Equal(1, item.FingerprintVersion);
        Assert.Equal(1, session.BuildDocument()["items"]![0]!["fingerprintVersion"]!.GetValue<int>());
    }

    [Fact]
    public void InsertItem_StoresLocalTimestampsAsUtc()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        var local = new DateTime(2024, 6, 15, 12, 0, 0, DateTimeKind.Local);
        var expected = local.ToUniversalTime().Ticks;

        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4",
            LastPlayedUtc = local,
            LastWriteTimeUtc = local,
            FingerprintLastUtc = local
        }));

        var item = Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Items);
        Assert.Equal(expected, item.LastPlayedUtc?.Ticks);
        Assert.Equal(expected, item.LastWriteTimeUtc?.Ticks);
        Assert.Equal(expected, item.FingerprintLastUtc?.Ticks);
    }

    [Fact]
    public void Revision_IncrementsOnlyWhenATransactionCommits()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.Equal(0, session.Revision);

        _ = session.BuildDocument();
        Assert.False(session.SetFavorite("missing", true));
        Assert.Equal(0, session.Revision);

        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4"
        }));
        Assert.Equal(1, session.Revision);

        _ = session.BuildDocument();
        Assert.Equal(1, session.Revision);

        Assert.True(session.SetLoudness("item-1", false, null, null, "no audio stream"));
        Assert.Equal(2, session.Revision);
        Assert.Equal("no audio stream", Assert.Single(LibraryCatalogStore.Read(session.DatabasePath).Items).LoudnessError);
    }

    [Fact]
    public void TagEdits_PersistByIdOrPath_WithoutBuildingTheCatalogDocument()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/one.mp4",
            FileName = "one.mp4"
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-2",
            FullPath = "/clips/two.mp4",
            FileName = "two.mp4"
        }));
        Assert.True(session.UpsertCategory("people", "People", 1));
        Assert.True(session.UpsertTag("Old", "people"));
        var builds = session.DocumentBuilds;

        Assert.True(session.ApplyItemTagEdits(["item-1", "/clips/two.mp4"], ["New"], ["Old"], out var catalogChanged));
        Assert.True(catalogChanged);
        Assert.True(session.RenameTag("New", "Fresh", "people"));
        Assert.True(session.DeleteTag("Fresh"));
        Assert.True(session.UpsertTag("Auto", "people"));
        var applied = session.ApplyAutoTagAssignments(
        [
            new CatalogAutoTagAssignment { TagName = "Auto", ItemPaths = ["/clips/one.mp4"] }
        ]);

        Assert.Equal(1, applied.AssignmentsAdded);
        Assert.Equal(["/clips/one.mp4"], applied.ChangedItemPaths);
        Assert.Equal(builds, session.DocumentBuilds);
        var model = session.ReadTagEditor(["/clips/one.mp4"]);
        Assert.Equal(["Auto"], Assert.Single(model.Items).Tags);
        Assert.Equal(builds, session.DocumentBuilds);
        _ = session.BuildDocument();
        Assert.Equal(builds + 1, session.DocumentBuilds);
    }

    [Fact]
    public void RenameAndDelete_ReturnTheItemIdsThatHadTheTag_WithoutBuildingTheCatalogDocument()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.UpsertTag("Night", null));
        Assert.True(session.UpsertTag("Day", null));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "kept",
            FullPath = "/clips/kept.mp4",
            FileName = "kept.mp4",
            Tags = ["Night"]
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "other",
            FullPath = "/clips/other.mp4",
            FileName = "other.mp4",
            Tags = ["Day"]
        }));
        var builds = session.DocumentBuilds;

        Assert.True(session.RenameTag("Night", "Late", null, out var renamed));
        Assert.Equal(["kept"], renamed);
        Assert.False(session.RenameTag("Missing", "Nope", null, out var missingRename));
        Assert.Empty(missingRename);
        Assert.Equal(builds, session.DocumentBuilds);

        Assert.True(session.DeleteTag("Late", out var deleted));
        Assert.Equal(["kept"], deleted);
        Assert.False(session.DeleteTag("Missing", out var missingDelete));
        Assert.Empty(missingDelete);
        Assert.Equal(builds, session.DocumentBuilds);
        _ = session.BuildDocument();
        Assert.Equal(builds + 1, session.DocumentBuilds);
    }

    [Fact]
    public void ApplyAutoTagAssignments_ReportsChangedPathsPerTag()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/one.mp4",
            FileName = "one.mp4"
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-2",
            FullPath = "/clips/two.mp4",
            FileName = "two.mp4"
        }));
        Assert.True(session.ApplyItemTagEdits(["/clips/one.mp4"], ["Cat"], [], out _));

        var applied = session.ApplyAutoTagAssignments(
        [
            new CatalogAutoTagAssignment { TagName = "Cat", ItemPaths = ["/clips/one.mp4", "/clips/two.mp4"] },
            new CatalogAutoTagAssignment { TagName = "Dog", ItemPaths = ["/clips/two.mp4"] }
        ]);

        Assert.Equal(2, applied.AssignmentsAdded);
        Assert.Equal(["/clips/two.mp4"], applied.ChangedItemPaths);
        var cat = Assert.Single(applied.Applied, row => row.TagName == "Cat");
        Assert.Equal(["/clips/two.mp4"], cat.ChangedItemPaths);
        var dog = Assert.Single(applied.Applied, row => row.TagName == "Dog");
        Assert.Equal(["/clips/two.mp4"], dog.ChangedItemPaths);
    }

    [Fact]
    public void FavoriteBlacklistAndPlayback_PersistByIdOrPath_WithoutBuildingTheCatalogDocument()
    {
        using var dir = new TempDirectory();
        var session = LibraryCatalogStore.Open(dir.Path).Session!;
        var playedAt = new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-a",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4",
            IsBlacklisted = true
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-b",
            FullPath = "/clips/b.mp4",
            FileName = "b.mp4",
            IsFavorite = true,
            PlayCount = 4,
            LastPlayedUtc = playedAt
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-max",
            FullPath = "/clips/max.mp4",
            FileName = "max.mp4",
            PlayCount = int.MaxValue
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-time",
            FullPath = "/clips/time.mp4",
            FileName = "time.mp4",
            LastPlayedUtc = playedAt
        }));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item-clean",
            FullPath = "/clips/clean.mp4",
            FileName = "clean.mp4"
        }));
        var builds = session.DocumentBuilds;
        var revision = session.Revision;

        Assert.True(session.SetFavorite("/CLIPS/A.MP4", true));
        var favorited = session.ReadItemState("item-a");
        Assert.NotNull(favorited);
        Assert.True(favorited!.IsFavorite);
        Assert.False(favorited.IsBlacklisted);
        Assert.Equal(revision + 1, session.Revision);
        Assert.False(session.SetFavorite("/clips/a.mp4", true));
        Assert.False(session.SetFavorite("missing", true));
        Assert.Equal(revision + 1, session.Revision);

        Assert.True(session.SetBlacklist("ITEM-B", true));
        var blacklisted = session.ReadItemState("/clips/b.mp4");
        Assert.NotNull(blacklisted);
        Assert.True(blacklisted!.IsBlacklisted);
        Assert.False(blacklisted.IsFavorite);
        Assert.Equal(4, blacklisted.PlayCount);
        Assert.True(session.SetBlacklist("item-b", false));
        var blacklistCleared = session.ReadItemState("item-b");
        Assert.False(blacklistCleared!.IsBlacklisted);
        Assert.False(blacklistCleared.IsFavorite);
        Assert.False(session.SetBlacklist("item-a", false));
        Assert.True(session.ReadItemState("item-a")!.IsFavorite);

        var neverPlayed = session.RecordPlayback("item-a");
        Assert.NotNull(neverPlayed);
        Assert.Null(neverPlayed!.PreviousLastPlayedUtc);
        Assert.Equal(1, neverPlayed.PlayCount);
        var beforePlay = DateTime.UtcNow;
        var firstPlay = session.RecordPlayback("item-b");
        var afterPlay = DateTime.UtcNow;
        Assert.NotNull(firstPlay);
        Assert.Equal("item-b", firstPlay!.Id);
        Assert.Equal("/clips/b.mp4", firstPlay.FullPath);
        Assert.Equal(5, firstPlay.PlayCount);
        Assert.Equal(playedAt, firstPlay.PreviousLastPlayedUtc);
        Assert.NotNull(firstPlay.LastPlayedUtc);
        Assert.InRange(firstPlay.LastPlayedUtc!.Value, beforePlay.AddSeconds(-1), afterPlay.AddSeconds(1));
        var secondPlay = session.RecordPlayback("/clips/b.mp4");
        Assert.Equal(6, secondPlay!.PlayCount);
        Assert.Equal(firstPlay.LastPlayedUtc, secondPlay.PreviousLastPlayedUtc);
        var saturated = session.RecordPlayback("ITEM-MAX");
        Assert.NotNull(saturated);
        Assert.Equal(int.MaxValue, saturated!.PlayCount);
        Assert.NotNull(saturated.LastPlayedUtc);
        Assert.Null(session.RecordPlayback("missing"));

        var revisionBeforeClear = session.Revision;
        Assert.Equal(0, session.ClearPlaybackStats(["missing"]));
        Assert.Equal(revisionBeforeClear, session.Revision);
        Assert.Equal(6, session.ReadItemState("item-b")!.PlayCount);
        Assert.NotNull(session.ReadItemState("item-time")!.LastPlayedUtc);

        Assert.Equal(1, session.ClearPlaybackStats(["/clips/b.mp4", "item-b", "missing"]));
        var clearedB = session.ReadItemState("item-b");
        Assert.Equal(0, clearedB!.PlayCount);
        Assert.Null(clearedB.LastPlayedUtc);
        Assert.Equal(int.MaxValue, session.ReadItemState("item-max")!.PlayCount);
        Assert.NotNull(session.ReadItemState("item-time")!.LastPlayedUtc);
        Assert.Equal(0, session.ReadItemState("item-clean")!.PlayCount);

        Assert.Equal(3, session.ClearPlaybackStats(null));
        Assert.Equal(0, session.ReadItemState("item-max")!.PlayCount);
        Assert.Null(session.ReadItemState("item-max")!.LastPlayedUtc);
        Assert.Equal(0, session.ReadItemState("item-time")!.PlayCount);
        Assert.Null(session.ReadItemState("item-time")!.LastPlayedUtc);
        Assert.True(session.ReadItemState("item-a")!.IsFavorite);
        Assert.Equal(0, session.ReadItemState("item-clean")!.PlayCount);

        var revisionAfterClear = session.Revision;
        Assert.Equal(0, session.ClearPlaybackStats([]));
        Assert.Equal(revisionAfterClear, session.Revision);
        Assert.Equal(builds, session.DocumentBuilds);
        _ = session.BuildDocument();
        Assert.Equal(builds + 1, session.DocumentBuilds);
    }

    private static string ReadUserVersion(string directory)
    {
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(directory, "library.db"),
            Mode = Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA user_version;";
        return Convert.ToString(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rr-catalog-session-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
            }
        }
    }
}
