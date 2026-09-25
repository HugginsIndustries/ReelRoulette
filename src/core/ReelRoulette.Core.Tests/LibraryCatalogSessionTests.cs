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
