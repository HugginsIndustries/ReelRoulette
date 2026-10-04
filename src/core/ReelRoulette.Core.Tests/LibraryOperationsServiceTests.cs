using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryOperationsServiceTests
{
    [Fact]
    public void Constructor_CreatesACatalogBackup()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(appDataRoot);

            _ = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);

            var backupDir = Path.Combine(appDataRoot, "backups");
            Assert.True(File.Exists(Path.Combine(appDataRoot, "library.db")));
            Assert.NotEmpty(Directory.GetFiles(backupDir, "library.db.backup.*"));
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_DoesNotCopyOrTrimOtherBackups()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 1, numberOfBackups: 1);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 1
                    }
                ]);

            var backupDir = Path.Combine(appDataRoot, "backups");
            Directory.CreateDirectory(backupDir);
            var leftover = Path.Combine(backupDir, "other.backup.leftover");
            File.WriteAllText(leftover, "{\"items\":[]}");
            SetBackupTimestampUtc(leftover, DateTime.UtcNow.AddHours(-12));

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            Assert.True(service.RecordPlayback(@"C:\media\movie.mp4").Found);

            var backupFiles = Directory.GetFiles(backupDir, "other.backup.*");
            Assert.Equal(leftover, Assert.Single(backupFiles));
            Assert.Equal("{\"items\":[]}", File.ReadAllText(leftover));
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_ShouldIncrementPlayCount_AndSetLastPlayedUtc()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 2
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var before = DateTime.UtcNow;
            var result = service.RecordPlayback(@"C:\media\movie.mp4");
            var after = DateTime.UtcNow;

            Assert.True(result.Found);
            Assert.Equal(3, result.PlayCount);
            Assert.Null(result.PreviousLastPlayedUtc);
            Assert.NotNull(result.LastPlayedUtc);
            Assert.InRange(result.LastPlayedUtc!.Value, before.AddSeconds(-1), after.AddSeconds(1));

            var item = Assert.Single(LoadLibrary(appDataRoot).Items);
            Assert.Equal(3, item.PlayCount);
            Assert.NotNull(item.LastPlayedUtc);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_ShouldReturnNotFound_WhenPathMissing()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(appDataRoot);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var result = service.RecordPlayback(@"C:\media\missing.mp4");

            Assert.False(result.Found);
            Assert.Equal(0, result.PlayCount);
            Assert.Null(result.LastPlayedUtc);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void SetFavorite_ShouldPersistAndClearBlacklist_WhenFavorited()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        IsBlacklisted = true
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var updated = service.SetFavorite(@"C:\media\movie.mp4", isFavorite: true);

            Assert.NotNull(updated);
            Assert.True(updated!.IsFavorite);
            Assert.False(updated.IsBlacklisted);

            var item = Assert.Single(LoadLibrary(appDataRoot).Items);
            Assert.True(item.IsFavorite);
            Assert.False(item.IsBlacklisted);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void FavoriteBlacklistAndPlayback_PersistWithoutBuildingTheCatalogDocument()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        IsBlacklisted = true,
                        PlayCount = 2
                    },
                    new SeedItem("item-2", @"C:\media\other.mp4")
                    {
                        IsFavorite = true,
                        PlayCount = 5
                    },
                    new SeedItem("item-3", @"C:\media\fresh.mp4")
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var revision = host.Session.Revision;

            var favorited = service.SetFavorite(@"C:\MEDIA\MOVIE.MP4", isFavorite: true);
            Assert.NotNull(favorited);
            Assert.Equal("item-1", favorited!.ItemId);
            Assert.Equal(@"C:\media\movie.mp4", favorited.Path);
            Assert.True(favorited.IsFavorite);
            Assert.False(favorited.IsBlacklisted);
            var unchanged = service.SetFavorite(@"C:\media\movie.mp4", isFavorite: true);
            Assert.NotNull(unchanged);
            Assert.True(unchanged!.IsFavorite);
            Assert.False(unchanged.IsBlacklisted);
            Assert.Equal(revision + 1, host.Session.Revision);
            Assert.Null(service.SetFavorite("missing", isFavorite: true));

            var blacklisted = service.SetBlacklist("ITEM-2", isBlacklisted: true);
            Assert.NotNull(blacklisted);
            Assert.Equal("item-2", blacklisted!.ItemId);
            Assert.Equal(@"C:\media\other.mp4", blacklisted.Path);
            Assert.True(blacklisted.IsBlacklisted);
            Assert.False(blacklisted.IsFavorite);

            var before = DateTime.UtcNow;
            var recorded = service.RecordPlayback("item-1");
            var after = DateTime.UtcNow;
            Assert.True(recorded.Found);
            Assert.Equal(3, recorded.PlayCount);
            Assert.NotNull(recorded.LastPlayedUtc);
            Assert.InRange(recorded.LastPlayedUtc!.Value, before.AddSeconds(-1), after.AddSeconds(1));
            Assert.False(service.RecordPlayback("missing").Found);

            var selected = service.ClearPlaybackStats(new ClearPlaybackStatsRequest
            {
                ItemPaths = [@"C:\media\other.mp4", "missing"]
            });
            Assert.Equal(1, selected.ClearedCount);
            Assert.Equal(3, host.Session.ReadItemState("item-1")!.PlayCount);
            Assert.Equal(0, host.Session.ReadItemState("item-2")!.PlayCount);
            Assert.Null(host.Session.ReadItemState("item-2")!.LastPlayedUtc);
            Assert.Equal(0, host.Session.ReadItemState("item-3")!.PlayCount);

            var all = service.ClearPlaybackStats(new ClearPlaybackStatsRequest());
            Assert.Equal(1, all.ClearedCount);
            Assert.Equal(0, host.Session.ReadItemState("item-1")!.PlayCount);
            Assert.Null(host.Session.ReadItemState("item-1")!.LastPlayedUtc);
            Assert.Equal(0, host.Session.ReadItemState("item-3")!.PlayCount);

            var revisionAfterClear = host.Session.Revision;
            var none = service.ClearPlaybackStats(new ClearPlaybackStatsRequest { ItemPaths = [] });
            Assert.Equal(0, none.ClearedCount);
            Assert.Equal(revisionAfterClear, host.Session.Revision);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ApplyItemTags_ShouldPersistTagChanges_ForItemIdAndPathInputs()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\one.mp4")
                    {
                        Tags = ["old"]
                    },
                    new SeedItem("item-2", @"C:\media\two.mp4")
                    {
                        Tags = ["old"]
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var changed = service.ApplyItemTags(new ReelRoulette.Server.Contracts.ApplyItemTagsRequest
            {
                ItemIds = ["item-1", @"C:\media\two.mp4"],
                AddTags = ["newTag"],
                RemoveTags = ["old"]
            });

            Assert.True(changed);
            var items = LoadLibrary(appDataRoot).Items;
            Assert.All(items, item =>
            {
                Assert.DoesNotContain("old", item.Tags, StringComparer.OrdinalIgnoreCase);
                Assert.Contains("newTag", item.Tags, StringComparer.OrdinalIgnoreCase);
            });
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ApplyItemTags_ShouldNotDuplicateOrRecategorizeExistingCatalogTag()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                categories:
                [
                    new SeedCategory("cat-1", "Category 1", 1),
                    new SeedCategory("uncategorized", "Uncategorized", int.MaxValue)
                ],
                tags: [new SeedTag("TagA", "cat-1")],
                items: [new SeedItem("item-1", @"C:\media\one.mp4")]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var changed = service.ApplyItemTags(new ReelRoulette.Server.Contracts.ApplyItemTagsRequest
            {
                ItemIds = ["item-1"],
                AddTags = ["TagA"],
                RemoveTags = []
            });

            Assert.True(changed);
            var root = LoadLibrary(appDataRoot);
            var tagA = Assert.Single(root.Tags, tag =>
                string.Equals(tag.Name, "TagA", StringComparison.OrdinalIgnoreCase));
            Assert.Equal("cat-1", tagA.CategoryId);

            var item = Assert.Single(root.Items);
            var itemTag = Assert.Single(item.Tags);
            Assert.Equal("TagA", itemTag);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ApplyItemTags_ShouldReportCatalogChangedFalse_WhenOnlyItemTagsMutate()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                categories:
                [
                    new SeedCategory("cat-1", "Category 1", 1),
                    new SeedCategory("uncategorized", "Uncategorized", int.MaxValue)
                ],
                tags: [new SeedTag("TagA", "cat-1")],
                items:
                [
                    new SeedItem("item-1", @"C:\media\one.mp4")
                    {
                        Tags = ["TagA"]
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var changed = service.ApplyItemTags(new ReelRoulette.Server.Contracts.ApplyItemTagsRequest
            {
                ItemIds = ["item-1"],
                AddTags = [],
                RemoveTags = ["TagA"]
            }, out var catalogChanged);

            Assert.True(changed);
            Assert.False(catalogChanged);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ApplyItemTags_ShouldReportCatalogChangedTrue_WhenApplyAddsNewCatalogTag()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                categories:
                [
                    new SeedCategory("cat-1", "Category 1", 1),
                    new SeedCategory("uncategorized", "Uncategorized", int.MaxValue)
                ],
                tags: [new SeedTag("TagA", "cat-1")],
                items: [new SeedItem("item-1", @"C:\media\one.mp4")]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var changed = service.ApplyItemTags(new ReelRoulette.Server.Contracts.ApplyItemTagsRequest
            {
                ItemIds = ["item-1"],
                AddTags = ["TagB"],
                RemoveTags = []
            }, out var catalogChanged);

            Assert.True(changed);
            Assert.True(catalogChanged);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void TagEditorWrites_PersistWithoutBuildingTheCatalogDocument()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                categories: [new SeedCategory("people", "People", 1)],
                tags: [new SeedTag("Old", "people")],
                items:
                [
                    new SeedItem("item-1", "/media/one.mp4")
                    {
                        Tags = ["Old"]
                    },
                    new SeedItem("item-2", "/media/two.mp4")
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);

            var changed = service.ApplyItemTags(new ApplyItemTagsRequest
            {
                ItemIds = ["item-1", "/media/two.mp4"],
                AddTags = ["Fresh"],
                RemoveTags = ["Old"]
            }, out var catalogChanged);
            Assert.True(changed);
            Assert.True(catalogChanged);
            Assert.True(service.UpsertCategory(new UpsertCategoryRequest { Id = "places", Name = "Places", SortOrder = 2 }));
            Assert.True(service.UpsertTag(new UpsertTagRequest { Name = "Fresh", CategoryId = "places" }));
            Assert.True(service.RenameTag(new RenameTagRequest { OldName = "Fresh", NewName = "Newer", NewCategoryId = "places" }));
            var applied = service.ApplyAutoTags(new AutoTagApplyRequest
            {
                Assignments = [new AutoTagAssignment { TagName = "Auto", ItemPaths = ["/media/two.mp4"] }]
            });
            Assert.Equal(1, applied.AssignmentsAdded);
            Assert.Equal(["/media/two.mp4"], applied.ChangedItemPaths);
            var appliedRow = Assert.Single(applied.Applied);
            Assert.Equal("Auto", appliedRow.TagName);
            Assert.Equal(["/media/two.mp4"], appliedRow.ChangedItemPaths);

            var model = service.GetTagEditorModel(new TagEditorModelRequest { ItemIds = ["/media/one.mp4", "missing"] });
            var item = Assert.Single(model.Items, candidate => candidate.ItemId == "/media/one.mp4");
            Assert.Equal(["Newer"], item.Tags);
            Assert.Contains(model.Categories, category => category.Id == "places" && category.Name == "Places");
            Assert.Contains(model.Tags, tag => tag.Name == "Newer" && tag.CategoryId == "places");
            Assert.Contains(model.Tags, tag => tag.Name == "Old");
            var missing = Assert.Single(model.Items, candidate => candidate.ItemId == "missing");
            Assert.Empty(missing.Tags);

            Assert.True(service.DeleteTag(new DeleteTagRequest { Name = "Newer" }));
            Assert.True(service.DeleteCategory(new DeleteCategoryRequest { CategoryId = "places" }));
            var afterDelete = service.GetTagEditorModel(new TagEditorModelRequest { ItemIds = ["item-1"] });
            Assert.DoesNotContain(afterDelete.Tags, tag => tag.Name == "Newer");
            Assert.DoesNotContain(afterDelete.Categories, category => category.Id == "places");
            Assert.Empty(Assert.Single(afterDelete.Items).Tags);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RenameAndDeleteTag_ShouldPersistCatalogAndItemTags()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                categories: [new SeedCategory("uncategorized", "Uncategorized", int.MaxValue)],
                tags: [new SeedTag("TagA")],
                items:
                [
                    new SeedItem("item-1", @"C:\media\one.mp4")
                    {
                        Tags = ["TagA"]
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            Assert.True(service.RenameTag(new ReelRoulette.Server.Contracts.RenameTagRequest
            {
                OldName = "TagA",
                NewName = "TagB"
            }));
            Assert.True(service.DeleteTag(new ReelRoulette.Server.Contracts.DeleteTagRequest
            {
                Name = "TagB"
            }));

            var root = LoadLibrary(appDataRoot);
            Assert.DoesNotContain(root.Tags, tag => string.Equals(tag.Name, "TagA", StringComparison.OrdinalIgnoreCase));
            Assert.DoesNotContain(root.Tags, tag => string.Equals(tag.Name, "TagB", StringComparison.OrdinalIgnoreCase));

            var item = Assert.Single(root.Items);
            Assert.DoesNotContain("TagA", item.Tags, StringComparer.OrdinalIgnoreCase);
            Assert.DoesNotContain("TagB", item.Tags, StringComparer.OrdinalIgnoreCase);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void GetLibraryStats_ShouldAggregateGlobalAndPerSourceTotals()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                sources:
                [
                    new SeedSource("src-a", @"C:\media\a", "A"),
                    new SeedSource("src-b", @"C:\media\b", "B", IsEnabled: false)
                ],
                items:
                [
                    new SeedItem("video-1", @"C:\media\a\v1.mp4")
                    {
                        SourceId = "src-a",
                        HasAudio = true,
                        Duration = TimeSpan.FromSeconds(120),
                        IsFavorite = true,
                        PlayCount = 2
                    },
                    new SeedItem("video-2", @"C:\media\a\v2.mp4")
                    {
                        SourceId = "src-a",
                        HasAudio = false,
                        Duration = TimeSpan.FromSeconds(180),
                        IsBlacklisted = true
                    },
                    new SeedItem("photo-1", @"C:\media\b\p1.jpg")
                    {
                        SourceId = "src-b",
                        MediaType = 1,
                        PlayCount = 1
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var stats = service.GetLibraryStats();

            Assert.Equal(2, stats.Global.TotalVideos);
            Assert.Equal(1, stats.Global.TotalPhotos);
            Assert.Equal(3, stats.Global.TotalMedia);
            Assert.Equal(1, stats.Global.Favorites);
            Assert.Equal(1, stats.Global.Blacklisted);
            Assert.Equal(1, stats.Global.UniquePlayedVideos);
            Assert.Equal(1, stats.Global.UniquePlayedPhotos);
            Assert.Equal(2, stats.Global.UniquePlayedMedia);
            Assert.Equal(1, stats.Global.NeverPlayedVideos);
            Assert.Equal(0, stats.Global.NeverPlayedPhotos);
            Assert.Equal(1, stats.Global.NeverPlayedMedia);
            Assert.Equal(3, stats.Global.TotalPlays);
            Assert.Equal(1, stats.Global.VideosWithAudio);
            Assert.Equal(1, stats.Global.VideosWithoutAudio);

            var sourceA = Assert.Single(stats.Sources, source => source.SourceId == "src-a");
            Assert.Equal(2, sourceA.TotalVideos);
            Assert.Equal(0, sourceA.TotalPhotos);
            Assert.Equal(2, sourceA.TotalMedia);
            Assert.Equal(1, sourceA.VideosWithAudio);
            Assert.Equal(1, sourceA.VideosWithoutAudio);
            Assert.Equal(300, sourceA.TotalDurationSeconds);
            Assert.Equal(150, sourceA.AverageDurationSeconds);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void GetLibraryStats_ResponseMatchesSpec()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            CatalogSeed.Write(
                appDataRoot,
                sources:
                [
                    new SeedSource("src-a", @"C:\media\a"),
                    new SeedSource("src-empty", @"C:\media\empty", "Empty", IsEnabled: false)
                ],
                items:
                [
                    new SeedItem("video-1", @"C:\media\a\v1.mp4")
                    {
                        SourceId = "src-a",
                        HasAudio = true,
                        Duration = TimeSpan.FromSeconds(120),
                        PlayCount = 1
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var json = OpenApiSpec.SerializeAsServer(service.GetLibraryStats());

            OpenApiSpec.AssertMatchesSchema(json, "LibraryStatsResponse");
            OpenApiSpec.AssertMatchesSchema(json.GetProperty("global"), "LibraryGlobalStatsResponse");
            var sources = json.GetProperty("sources").EnumerateArray().ToList();
            Assert.Equal(2, sources.Count);
            foreach (var source in sources)
            {
                OpenApiSpec.AssertMatchesSchema(source, "SourceStatsResponse");
            }
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void GetLibraryStats_ShouldHandleLegacyMediaTypeAndMissingSourceId()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                sources: [new SeedSource("src-a", @"C:\media\a", "A")],
                items:
                [
                    new SeedItem("video-legacy", @"C:\media\a\video-legacy.mp4")
                    {
                        PlayCount = 1
                    },
                    new SeedItem("photo-legacy", @"C:\media\a\photo-legacy.jpg")
                    {
                        MediaType = 1
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var stats = service.GetLibraryStats();

            Assert.Equal(1, stats.Global.TotalVideos);
            Assert.Equal(1, stats.Global.TotalPhotos);
            Assert.Equal(2, stats.Global.TotalMedia);
            Assert.Equal(1, stats.Global.UniquePlayedMedia);

            var sourceA = Assert.Single(stats.Sources, source => source.SourceId == "src-a");
            Assert.Equal(1, sourceA.TotalVideos);
            Assert.Equal(1, sourceA.TotalPhotos);
            Assert.Equal(2, sourceA.TotalMedia);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void GetLibraryStatsAndItemStates_MatchCurrentFiguresWithoutBuildingTheCatalogDocument()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                sources: [new SeedSource("src-a", @"C:\media\a", "A")],
                items:
                [
                    new SeedItem("video-fraction", @"C:\media\a\fraction.mp4")
                    {
                        SourceId = "src-a",
                        Duration = TimeSpan.FromSeconds(120.5),
                        PlayCount = -2
                    },
                    new SeedItem("video-whole", @"C:\media\a\whole.mp4")
                    {
                        SourceId = "src-a",
                        HasAudio = false,
                        Duration = TimeSpan.FromSeconds(60),
                        PlayCount = 4
                    },
                    new SeedItem("photo-odd", @"C:\media\a\odd.jpg")
                    {
                        MediaType = 2
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var stats = service.GetLibraryStats();

            Assert.Equal(2, stats.Global.TotalVideos);
            Assert.Equal(1, stats.Global.TotalPhotos);
            Assert.Equal(3, stats.Global.TotalMedia);
            Assert.Equal(0, stats.Global.VideosWithAudio);
            Assert.Equal(1, stats.Global.VideosWithoutAudio);
            Assert.Equal(1, stats.Global.UniquePlayedVideos);
            Assert.Equal(0, stats.Global.UniquePlayedPhotos);
            Assert.Equal(4, stats.Global.TotalPlays);
            Assert.Equal(1, stats.Global.NeverPlayedVideos);
            var source = Assert.Single(stats.Sources);
            Assert.Equal(2, source.TotalVideos);
            Assert.Equal(1, source.TotalPhotos);
            Assert.Equal(180, source.TotalDurationSeconds);
            Assert.Equal(90, source.AverageDurationSeconds);

            var states = service.GetLibraryStates(new ReelRoulette.Server.Contracts.LibraryStatesRequest
            {
                Paths = [@"C:\MEDIA\A\FRACTION.MP4", @"C:\media\missing.mp4"]
            });
            var state = Assert.Single(states);
            Assert.Equal("video-fraction", state.ItemId);
            Assert.Equal(@"C:\media\a\fraction.mp4", state.Path);

            Assert.Empty(service.GetLibraryStates(null));
            Assert.Empty(service.GetLibraryStates(new ReelRoulette.Server.Contracts.LibraryStatesRequest()));
            Assert.Empty(service.GetLibraryStates(new ReelRoulette.Server.Contracts.LibraryStatesRequest
            {
                Paths = [" ", ""]
            }));

            var ordered = service.GetLibraryStates(new ReelRoulette.Server.Contracts.LibraryStatesRequest
            {
                Paths = [@"C:\media\a\whole.mp4", @"C:\media\a\fraction.mp4"]
            });
            Assert.Equal(
                [@"C:\media\a\fraction.mp4", @"C:\media\a\whole.mp4"],
                ordered.Select(item => item.Path).ToArray());
            Assert.DoesNotContain(ordered, item => item.ItemId == "photo-odd");

        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_WhenRecentBackupExistsAtMax_ShouldSkipCreateAndDelete()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 3);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 2
                    }
                ]);

            var backupDir = Path.Combine(appDataRoot, "backups");
            Directory.CreateDirectory(backupDir);
            var backupA = Path.Combine(backupDir, "other.backup.a");
            var backupB = Path.Combine(backupDir, "other.backup.b");
            var backupC = Path.Combine(backupDir, "other.backup.c");
            File.WriteAllText(backupA, "{}");
            File.WriteAllText(backupB, "{}");
            File.WriteAllText(backupC, "{}");
            SetBackupTimestampUtc(backupA, DateTime.UtcNow.AddHours(-8));
            SetBackupTimestampUtc(backupB, DateTime.UtcNow.AddHours(-7));
            SetBackupTimestampUtc(backupC, DateTime.UtcNow.AddMinutes(-10));

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var before = Directory.GetFiles(backupDir, "other.backup.*").OrderBy(path => path).ToArray();
            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            var after = Directory.GetFiles(backupDir, "other.backup.*").OrderBy(path => path).ToArray();

            Assert.Equal(before, after);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_WhenRecentSqliteBackupExists_SkipsCreateAndTrim()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 1);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 2
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var backupDir = Path.Combine(appDataRoot, "backups");
            var before = Assert.Single(Directory.GetFiles(backupDir, "library.db.backup.*"));
            var bytes = File.ReadAllBytes(before);
            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            LibraryCatalogBackup.WaitForPending();
            var after = Assert.Single(Directory.GetFiles(backupDir, "library.db.backup.*"));
            Assert.Equal(before, after);
            Assert.Equal(bytes, File.ReadAllBytes(after));
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_WhenBackupGapIsSatisfied_DoesNotTrimOtherBackups()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 3);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 2
                    }
                ]);

            var backupDir = Path.Combine(appDataRoot, "backups");
            Directory.CreateDirectory(backupDir);
            var backupA = Path.Combine(backupDir, "other.backup.a");
            var backupB = Path.Combine(backupDir, "other.backup.b");
            var backupC = Path.Combine(backupDir, "other.backup.c");
            File.WriteAllText(backupA, "{}");
            File.WriteAllText(backupB, "{}");
            File.WriteAllText(backupC, "{}");
            SetBackupTimestampUtc(backupA, DateTime.UtcNow.AddHours(-12));
            SetBackupTimestampUtc(backupB, DateTime.UtcNow.AddHours(-8));
            SetBackupTimestampUtc(backupC, DateTime.UtcNow.AddHours(-7));

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            foreach (var existing in Directory.GetFiles(backupDir, "library.db.backup.*"))
            {
                SetBackupTimestampUtc(existing, DateTime.UtcNow.AddHours(-3));
            }

            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            LibraryCatalogBackup.WaitForPending();
            var after = Directory.GetFiles(backupDir, "other.backup.*").OrderBy(path => path).ToArray();

            Assert.Equal([backupA, backupB, backupC], after);
            var checkpoint = Directory.GetFiles(backupDir, "library.db.backup.*")
                .OrderBy(File.GetLastWriteTimeUtc)
                .Last();
            Assert.False(File.Exists(checkpoint + "-wal"));
            var copy = ReelRoulette.Core.Library.LibraryCatalogStore.Read(checkpoint);
            Assert.Equal(3, Assert.Single(copy.Items).PlayCount);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_WhenBackupGapIsShortened_CreatesACheckpoint()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 1
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var backupDir = Path.Combine(appDataRoot, "backups");
            foreach (var existing in Directory.GetFiles(backupDir, "library.db.backup.*"))
            {
                SetBackupTimestampUtc(existing, DateTime.UtcNow.AddMinutes(-90));
            }

            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            LibraryCatalogBackup.WaitForPending();
            Assert.Single(ListCatalogBackupFiles(backupDir));

            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 8);
            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            LibraryCatalogBackup.WaitForPending();
            var checkpoint = ListCatalogBackupFiles(backupDir)
                .OrderBy(File.GetLastWriteTimeUtc)
                .Last();
            var copy = ReelRoulette.Core.Library.LibraryCatalogStore.Read(checkpoint);
            Assert.Equal(3, Assert.Single(copy.Items).PlayCount);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void DeferredCatalogWrites_CheckpointTheLatestRowsAfterRelease()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 1
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var backupDir = Path.Combine(appDataRoot, "backups");
            foreach (var existing in Directory.GetFiles(backupDir, "library.db.backup.*"))
            {
                SetBackupTimestampUtc(existing, DateTime.UtcNow.AddHours(-3));
            }

            var databasePath = Path.Combine(appDataRoot, "library.db");
            using (LibraryCatalogBackup.Defer(databasePath))
            {
                _ = service.RecordPlayback(@"C:\media\movie.mp4");
                LibraryCatalogBackup.WaitForPending();
                _ = service.RecordPlayback(@"C:\media\movie.mp4");
                LibraryCatalogBackup.WaitForPending();
                var during = ListCatalogBackupFiles(backupDir)
                    .OrderBy(File.GetLastWriteTimeUtc)
                    .Last();
                var duringCopy = ReelRoulette.Core.Library.LibraryCatalogStore.Read(during);
                Assert.Equal(1, Assert.Single(duringCopy.Items).PlayCount);
            }

            LibraryCatalogBackup.WaitForPending();
            var checkpoint = ListCatalogBackupFiles(backupDir)
                .OrderBy(File.GetLastWriteTimeUtc)
                .Last();
            var copy = ReelRoulette.Core.Library.LibraryCatalogStore.Read(checkpoint);
            Assert.Equal(3, Assert.Single(copy.Items).PlayCount);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void RecordPlayback_WhenANewerBackupCannotBeOpened_UsesTheHealthyBackupAge()
    {
        var appDataRoot = CreateTempAppDataRoot();
        string? blocked = null;
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 1
                    }
                ]);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var backupDir = Path.Combine(appDataRoot, "backups");
            foreach (var existing in ListCatalogBackupFiles(backupDir))
            {
                SetBackupTimestampUtc(existing, DateTime.UtcNow.AddHours(-3));
            }

            if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
            {
                return;
            }

            blocked = Path.Combine(backupDir, "library.db.backup.blocked");
            File.WriteAllText(blocked, "not a database");
            SetBackupTimestampUtc(blocked, DateTime.UtcNow);
            File.SetUnixFileMode(blocked, UnixFileMode.None);

            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            LibraryCatalogBackup.WaitForPending();
            Assert.True(File.Exists(blocked));
            var checkpoint = ListCatalogBackupFiles(backupDir)
                .Where(path => !string.Equals(path, blocked, StringComparison.Ordinal))
                .OrderBy(File.GetLastWriteTimeUtc)
                .Last();
            var copy = ReelRoulette.Core.Library.LibraryCatalogStore.Read(checkpoint);
            Assert.Equal(2, Assert.Single(copy.Items).PlayCount);
        }
        finally
        {
            if (blocked != null && File.Exists(blocked) && (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS()))
            {
                File.SetUnixFileMode(blocked, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }

            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void TryCreate_IgnoresAnUnhealthyBackupFile()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("item-1", @"C:\media\movie.mp4")
                    {
                        PlayCount = 1
                    }
                ]);

            _ = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var backupDir = Path.Combine(appDataRoot, "backups");
            foreach (var existing in Directory.GetFiles(backupDir, "library.db.backup.*"))
            {
                File.Delete(existing);
            }

            var partial = Path.Combine(backupDir, "library.db.backup.partial");
            File.WriteAllText(partial, "not a database");
            LibraryCatalogBackup.TryCreate(
                Path.Combine(appDataRoot, "library.db"),
                appDataRoot,
                NullLogger.Instance);

            Assert.False(File.Exists(partial));
            var backup = Assert.Single(
                Directory.GetFiles(backupDir, "library.db.backup.*"),
                path => !path.EndsWith("-wal", StringComparison.Ordinal) &&
                        !path.EndsWith("-shm", StringComparison.Ordinal) &&
                        !path.EndsWith("-journal", StringComparison.Ordinal));
            Assert.Equal(
                ReelRoulette.Core.Library.LibraryCatalogStore.CatalogFileInspection.Usable,
                ReelRoulette.Core.Library.LibraryCatalogStore.InspectCatalogFile(backup));
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void TryCreate_LeavesABackupThatCannotBeOpened()
    {
        var appDataRoot = CreateTempAppDataRoot();
        string? blocked = null;
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 8);
            CatalogSeed.Write(appDataRoot);

            _ = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var backupDir = Path.Combine(appDataRoot, "backups");
            blocked = Assert.Single(
                Directory.GetFiles(backupDir, "library.db.backup.*"),
                path => !path.EndsWith("-wal", StringComparison.Ordinal) &&
                        !path.EndsWith("-shm", StringComparison.Ordinal) &&
                        !path.EndsWith("-journal", StringComparison.Ordinal));
            if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
            {
                return;
            }

            File.SetUnixFileMode(blocked, UnixFileMode.None);
            Assert.Equal(
                ReelRoulette.Core.Library.LibraryCatalogStore.CatalogFileInspection.Unavailable,
                ReelRoulette.Core.Library.LibraryCatalogStore.InspectCatalogFile(blocked));
            LibraryCatalogBackup.TryCreate(
                Path.Combine(appDataRoot, "library.db"),
                appDataRoot,
                NullLogger.Instance);
            Assert.True(File.Exists(blocked));
        }
        finally
        {
            if (blocked != null && File.Exists(blocked) && (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS()))
            {
                File.SetUnixFileMode(blocked, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }

            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ApplyDuplicateSelection_ShouldPersistRemovedItems_AndKeepProjectionParity()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            var mediaDir = Path.Combine(appDataRoot, "media");
            Directory.CreateDirectory(mediaDir);
            var keepPath = Path.Combine(mediaDir, "keep.mp4");
            var removePath = Path.Combine(mediaDir, "remove.mp4");
            var missingPath = Path.Combine(mediaDir, "missing.mp4");
            File.WriteAllText(keepPath, "keep");
            File.WriteAllText(removePath, "remove");

            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    new SeedItem("keep-1", keepPath)
                    {
                        IsFavorite = true
                    },
                    new SeedItem("remove-1", removePath),
                    new SeedItem("missing-1", missingPath)
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var skipped = service.ApplyDuplicateSelection(new ReelRoulette.Server.Contracts.DuplicateApplyRequest
            {
                Selections =
                [
                    new ReelRoulette.Server.Contracts.DuplicateApplySelection
                    {
                        KeepItemId = "missing-keep",
                        ItemIds = ["keep-1", "remove-1"]
                    }
                ]
            });
            Assert.Equal(0, skipped.RemovedFromLibrary);
            Assert.True(File.Exists(removePath));

            var response = service.ApplyDuplicateSelection(new ReelRoulette.Server.Contracts.DuplicateApplyRequest
            {
                Selections =
                [
                    new ReelRoulette.Server.Contracts.DuplicateApplySelection
                    {
                        KeepItemId = "keep-1",
                        ItemIds = ["keep-1", "remove-1", "missing-1"]
                    }
                ]
            });

            Assert.Equal(1, response.DeletedOnDisk);
            Assert.Equal(1, response.RemovedFromLibrary);
            var failure = Assert.Single(response.Failures);
            Assert.Equal(missingPath, failure.FullPath);
            Assert.Equal("File not found", failure.Reason);
            Assert.False(File.Exists(removePath));
            Assert.True(File.Exists(keepPath));

            var items = LoadLibrary(appDataRoot).Items;
            Assert.Equal(["keep-1", "missing-1"], items.Select(item => item.Id).ToArray());

            var states = service.GetLibraryStates(new ReelRoulette.Server.Contracts.LibraryStatesRequest
            {
                Paths = [keepPath, removePath]
            });
            var keptState = Assert.Single(states);
            Assert.Equal(keepPath, keptState.Path);
            Assert.True(keptState.IsFavorite);
            Assert.False(keptState.IsBlacklisted);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ImportSource_TrailingSlashAndEmptyDisplayName_PersistsFolderNameAndTrimmedRoot()
    {
        var appDataRoot = CreateTempAppDataRoot();
        var mediaParent = Path.Combine(Path.GetTempPath(), "reelroulette-import-src-" + Guid.NewGuid().ToString("N"));
        var mediaRoot = Path.Combine(mediaParent, "YouTube");
        try
        {
            Directory.CreateDirectory(mediaRoot);
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(appDataRoot);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ImportSource(new SourceImportRequest
            {
                RootPath = mediaRoot + Path.DirectorySeparatorChar,
                DisplayName = "  "
            });

            Assert.True(response.Accepted);
            var source = Assert.Single(LoadLibrary(appDataRoot).Sources);
            Assert.Equal(mediaRoot, source.RootPath);
            Assert.Equal("YouTube", source.DisplayName);
        }
        finally
        {
            if (Directory.Exists(mediaParent))
            {
                Directory.Delete(mediaParent, recursive: true);
            }

            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ImportSource_SameFolderWithAndWithoutTrailingSlash_DoesNotCreateDuplicate()
    {
        var appDataRoot = CreateTempAppDataRoot();
        var mediaParent = Path.Combine(Path.GetTempPath(), "reelroulette-import-src-" + Guid.NewGuid().ToString("N"));
        var mediaRoot = Path.Combine(mediaParent, "YouTube");
        try
        {
            Directory.CreateDirectory(mediaRoot);
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(appDataRoot);

            var service = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var first = service.ImportSource(new SourceImportRequest
            {
                RootPath = mediaRoot + Path.DirectorySeparatorChar
            });
            var second = service.ImportSource(new SourceImportRequest
            {
                RootPath = mediaRoot
            });

            Assert.True(first.Accepted);
            Assert.True(second.Accepted);
            Assert.Equal(first.SourceId, second.SourceId);
            Assert.Single(LoadLibrary(appDataRoot).Sources);
        }
        finally
        {
            if (Directory.Exists(mediaParent))
            {
                Directory.Delete(mediaParent, recursive: true);
            }

            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ImportSource_UpdatesRowsWithoutBuildingTheCatalogDocument()
    {
        var appDataRoot = CreateTempAppDataRoot();
        var mediaParent = Path.Combine(Path.GetTempPath(), "reelroulette-import-src-" + Guid.NewGuid().ToString("N"));
        var mediaRoot = Path.Combine(mediaParent, "Clips");
        var keptOnDisk = Path.Combine(mediaRoot, "kept.mp4");
        var keptStoredPath = Path.Combine(mediaRoot, "Kept.mp4");
        var freshPath = Path.Combine(mediaRoot, "fresh.jpg");
        var gonePath = Path.Combine(mediaRoot, "gone.mp4");
        var playedAt = new DateTime(2024, 3, 4, 5, 6, 7, DateTimeKind.Utc);
        try
        {
            Directory.CreateDirectory(mediaRoot);
            File.WriteAllBytes(keptOnDisk, [0x00]);
            File.WriteAllBytes(freshPath, [0x00]);
            File.WriteAllText(Path.Combine(mediaRoot, "notes.txt"), "skip");
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                sources: [new SeedSource("src-clips", mediaRoot + Path.DirectorySeparatorChar, "Clips")],
                items:
                [
                    new SeedItem("kept-1", keptStoredPath)
                    {
                        SourceId = "other-source",
                        RelativePath = "old/kept.mp4",
                        FileName = "Nope.mp4",
                        MediaType = 1,
                        IsFavorite = true,
                        PlayCount = 4,
                        LastPlayedUtc = DateTimeOffset.Parse("2024-03-04T05:06:07Z", System.Globalization.CultureInfo.InvariantCulture).UtcDateTime,
                        Duration = TimeSpan.FromSeconds(12),
                        Fingerprint = "abc123",
                        FingerprintStatus = 1,
                        Tags = ["Holiday", "Night"]
                    },
                    new SeedItem("gone-1", gonePath)
                    {
                        SourceId = "src-clips",
                        FileName = "gone.mp4",
                        PlayCount = 2,
                        Tags = ["Keep"]
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var revision = host.Session.Revision;

            var response = service.ImportSource(new SourceImportRequest
            {
                RootPath = mediaRoot + Path.DirectorySeparatorChar,
                DisplayName = "  "
            });

            Assert.True(response.Accepted);
            Assert.Equal("src-clips", response.SourceId);
            Assert.Equal(1, response.ImportedCount);
            Assert.Equal(1, response.UpdatedCount);
            Assert.Equal(revision + 1, host.Session.Revision);

            var kept = host.Session.ReadListedItem("kept-1");
            Assert.NotNull(kept);
            Assert.Equal(keptStoredPath, kept!.FullPath);
            Assert.Equal("src-clips", kept.SourceId);
            Assert.Equal("kept.mp4", kept.RelativePath);
            Assert.Equal("kept.mp4", kept.FileName);
            Assert.Equal(0, kept.MediaType);
            Assert.True(kept.IsFavorite);
            Assert.False(kept.IsBlacklisted);
            Assert.Equal(4, kept.PlayCount);
            Assert.Equal(playedAt, kept.LastPlayedUtc);
            Assert.Equal(TimeSpan.FromSeconds(12).Ticks, kept.DurationTicks);
            Assert.Equal("abc123", kept.Fingerprint);
            Assert.Equal(1, kept.FingerprintStatus);
            Assert.Equal(["Holiday", "Night"], kept.Tags);

            var gone = host.Session.ReadListedItem("gone-1");
            Assert.NotNull(gone);
            Assert.Equal(gonePath, gone!.FullPath);
            Assert.Equal(2, gone.PlayCount);
            Assert.Equal(["Keep"], gone.Tags);

            var fresh = host.Session.ReadListedItem(freshPath);
            Assert.NotNull(fresh);
            Assert.NotEqual("kept-1", fresh!.Id);
            Assert.NotEqual("gone-1", fresh.Id);
            Assert.Equal("src-clips", fresh.SourceId);
            Assert.Equal("fresh.jpg", fresh.FileName);
            Assert.Equal("fresh.jpg", fresh.RelativePath);
            Assert.Equal(1, fresh.MediaType);
            Assert.False(fresh.IsFavorite);
            Assert.False(fresh.IsBlacklisted);
            Assert.Equal(0, fresh.PlayCount);
            Assert.Null(fresh.LastPlayedUtc);
            Assert.Empty(fresh.Tags);
            Assert.Equal("SHA-256", fresh.FingerprintAlgorithm);
            Assert.Equal(1, fresh.FingerprintVersion);
            Assert.Equal(0, fresh.FingerprintStatus);
            Assert.Null(host.Session.ReadListedItem(Path.Combine(mediaRoot, "notes.txt")));

            var source = Assert.Single(service.GetLibraryStats().Sources);
            Assert.Equal("src-clips", source.SourceId);
            Assert.Equal(mediaRoot + Path.DirectorySeparatorChar, source.RootPath);
            Assert.Equal("Clips", source.DisplayName);

            var again = service.ImportSource(new SourceImportRequest
            {
                RootPath = mediaRoot,
                DisplayName = "  "
            });
            Assert.True(again.Accepted);
            Assert.Equal(0, again.ImportedCount);
            Assert.Equal(2, again.UpdatedCount);
            Assert.Equal(revision + 1, host.Session.Revision);
        }
        finally
        {
            if (Directory.Exists(mediaParent))
            {
                Directory.Delete(mediaParent, recursive: true);
            }

            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public async Task ImportSource_EnumeratesWithoutHoldingTheCatalogLock()
    {
        var appDataRoot = CreateTempAppDataRoot();
        var mediaParent = Path.Combine(Path.GetTempPath(), "reelroulette-import-src-" + Guid.NewGuid().ToString("N"));
        var mediaRoot = Path.Combine(mediaParent, "Clips");
        var entered = new ManualResetEventSlim(false);
        var release = new ManualResetEventSlim(false);
        Task<SourceImportResponse>? import = null;
        try
        {
            Directory.CreateDirectory(mediaRoot);
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(appDataRoot);
            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(
                host,
                NullLogger<LibraryOperationsService>.Instance,
                appDataRoot,
                _ =>
                {
                    entered.Set();
                    release.Wait(TimeSpan.FromSeconds(5));
                    return [];
                });

            import = Task.Run(() => service.ImportSource(new SourceImportRequest { RootPath = mediaRoot }));
            Assert.True(entered.Wait(TimeSpan.FromSeconds(5)));
            var browse = Task.Run(() => service.QueryLibrary(new LibraryQueryRequest()));
            var browseFinished = await Task.WhenAny(browse, Task.Delay(TimeSpan.FromSeconds(2))) == browse;
            release.Set();
            Assert.True(browseFinished);
            Assert.True((await browse).Accepted);
            var imported = await import.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.True(imported.Accepted);
        }
        finally
        {
            release.Set();
            if (import != null)
            {
                try
                {
                    await import.WaitAsync(TimeSpan.FromSeconds(5));
                }
                catch (Exception)
                {
                    // The assertion above reports an import failure.
                }
            }

            entered.Dispose();
            release.Dispose();
            if (Directory.Exists(mediaParent))
            {
                Directory.Delete(mediaParent, recursive: true);
            }

            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void GetLibraryStats_EmptyDisplayNameWithTrailingSlashRoot_DerivesFolderNameWithoutPersisting()
    {
        var appDataRoot = CreateTempAppDataRoot();
        const string storedRoot = "/mnt/nas/multimedia/YouTube/";
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            CatalogSeed.Write(
                appDataRoot,
                sources: [new SeedSource("src-yt", storedRoot)]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var stats = service.GetLibraryStats();
            var source = Assert.Single(stats.Sources);
            Assert.Equal("YouTube", source.DisplayName);
            Assert.Equal(storedRoot, source.RootPath);

            var stored = Assert.Single(LoadLibrary(appDataRoot).Sources);
            Assert.Null(stored.DisplayName);
            Assert.Equal(storedRoot, stored.RootPath);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ScanAutoTags_ScopeFollowsFullLibraryFlagAndPathList()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            CatalogSeed.Write(
                appDataRoot,
                sources:
                [
                    new SeedSource("on", "/media/on"),
                    new SeedSource("off", "/media/off", IsEnabled: false)
                ],
                tags: [new SeedTag("Holiday")],
                items:
                [
                    new SeedItem("a", "/media/on/Holiday-a.mp4")
                    {
                        SourceId = "on"
                    },
                    new SeedItem("kept", "/media/on/Holiday-kept.mp4")
                    {
                        SourceId = "on",
                        Tags = ["Holiday"]
                    },
                    new SeedItem("plain", "/media/on/plain.mp4")
                    {
                        SourceId = "on",
                        RelativePath = "clips/Holiday/plain.mp4"
                    },
                    new SeedItem("b", "/media/off/Holiday-b.mp4")
                    {
                        SourceId = "off"
                    },
                    new SeedItem("orphan", "/media/missing/Holiday-c.mp4")
                    {
                        SourceId = "missing"
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var enabledOnly = service.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = false, ItemIds = [] });
            var enabledFiles = Assert.Single(enabledOnly.Rows).Files;
            Assert.Equal(
                ["/media/on/Holiday-a.mp4", "/media/on/Holiday-kept.mp4", "/media/on/plain.mp4"],
                enabledFiles.Select(file => file.FullPath).ToArray());
            Assert.Equal([true, false, true], enabledFiles.Select(file => file.NeedsChange).ToArray());
            Assert.Equal("clips/Holiday/plain.mp4", enabledFiles[2].DisplayPath);
            var enabledRow = Assert.Single(enabledOnly.Rows);
            Assert.Equal(3, enabledRow.TotalMatchedCount);
            Assert.Equal(2, enabledRow.WouldChangeCount);

            var listed = service.ScanAutoTags(new AutoTagScanRequest
            {
                ScanFullLibrary = false,
                ItemIds = ["/MEDIA/OFF/Holiday-b.mp4"]
            });
            var listedPaths = listed.Rows.SelectMany(row => row.Files).Select(file => file.FullPath).ToList();
            Assert.Equal(["/media/off/Holiday-b.mp4"], listedPaths);

            var full = service.ScanAutoTags(new AutoTagScanRequest
            {
                ScanFullLibrary = true,
                ItemIds = ["/media/off/Holiday-b.mp4"]
            });
            var fullPaths = full.Rows.SelectMany(row => row.Files).Select(file => file.FullPath).ToList();
            Assert.Equal(
                [
                    "/media/on/Holiday-a.mp4",
                    "/media/on/Holiday-kept.mp4",
                    "/media/on/plain.mp4",
                    "/media/off/Holiday-b.mp4",
                    "/media/missing/Holiday-c.mp4"
                ],
                fullPaths);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ScanAutoTags_WhenNoEnabledSourcesAndNoList_ScansNothing()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            CatalogSeed.Write(
                appDataRoot,
                sources: [new SeedSource("off", "/media/off", IsEnabled: false)],
                tags: [new SeedTag("Holiday")],
                items:
                [
                    new SeedItem("b", "/media/off/Holiday-b.mp4")
                    {
                        SourceId = "off"
                    }
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = false, ItemIds = [] });
            Assert.Empty(response.Rows);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ScanDuplicates_HonorsIntegerFingerprintStatus()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            var readyA = Item("ready-a", "/media/ready-a.mp4", "fp-ready", 1) with
            {
                IsFavorite = true,
                PlayCount = 4,
                Tags = ["One", "Two"]
            };
            CatalogSeed.Write(
                appDataRoot,
                items:
                [
                    readyA,
                    Item("ready-b", "/media/ready-b.mp4", "fp-ready", 1),
                    Item("pending-1", "/media/pending.mp4", "fp-pending", 0),
                    Item("stale-1", "/media/stale.mp4", "fp-stale", 3),
                    Item("failed-1", "/media/failed.mp4", null, 2),
                    Item("unset-a", "/media/unset-a.mp4", "fp-unset", null),
                    Item("unset-b", "/media/unset-b.mp4", "fp-unset", null)
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ScanDuplicates(new DuplicateScanRequest());

            Assert.Equal(1, response.ExcludedPending);
            Assert.Equal(1, response.ExcludedFailed);
            Assert.Equal(1, response.ExcludedStale);
            var group = Assert.Single(response.Groups);
            Assert.Equal(["ready-a", "ready-b"], group.Items.Select(item => item.ItemId).ToArray());
            var ready = group.Items[0];
            Assert.True(ready.IsFavorite);
            Assert.Equal(4, ready.PlayCount);
            Assert.Equal(2, ready.TagCount);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void ScanDuplicates_ScopeFollowsCurrentSourceAndEnabledSources()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            CatalogSeed.Write(
                appDataRoot,
                sources:
                [
                    new SeedSource("src-on", "/media/on"),
                    new SeedSource("src-off", "/media/off", IsEnabled: false)
                ],
                items:
                [
                    Item("on-a", "/media/on/a.mp4", "fp-on", 1, "src-on"),
                    Item("on-b", "/media/on/b.mp4", "fp-on", 1, "src-on"),
                    Item("on-pending", "/media/on/pending.mp4", "fp-pending", 0, "src-on"),
                    Item("off-a", "/media/off/a.mp4", "fp-off", 1, "src-off"),
                    Item("off-b", "/media/off/b.mp4", "fp-off", 1, "src-off"),
                    Item("off-stale", "/media/off/stale.mp4", "fp-stale", 3, "src-off")
                ]);

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);

            var current = service.ScanDuplicates(new DuplicateScanRequest { Scope = "CurrentSource", SourceId = "SRC-ON" });
            var currentGroup = Assert.Single(current.Groups);
            Assert.Equal(["on-a", "on-b"], currentGroup.Items.Select(item => item.ItemId).ToArray());
            Assert.Equal(1, current.ExcludedPending);
            Assert.Equal(0, current.ExcludedStale);

            var enabled = service.ScanDuplicates(new DuplicateScanRequest { Scope = "AllEnabledSources" });
            var enabledGroup = Assert.Single(enabled.Groups);
            Assert.Equal(["on-a", "on-b"], enabledGroup.Items.Select(item => item.ItemId).ToArray());
            Assert.Equal(1, enabled.ExcludedPending);
            Assert.Equal(0, enabled.ExcludedStale);

            var all = service.ScanDuplicates(new DuplicateScanRequest { Scope = "AllSources" });
            Assert.Equal(2, all.Groups.Count);
            Assert.Equal(1, all.ExcludedPending);
            Assert.Equal(1, all.ExcludedStale);
        }
        finally
        {
            LibraryCatalogBackup.WaitForPending();
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    private static SeedItem Item(string id, string fullPath, string? fingerprint, int? fingerprintStatus, string? sourceId = null)
    {
        return new SeedItem(id, fullPath)
        {
            SourceId = sourceId ?? string.Empty,
            Fingerprint = fingerprint,
            FingerprintStatus = fingerprintStatus
        };
    }

    [Fact]
    public void Startup_LoadsSourcesFromTheCatalog()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            CatalogSeed.Write(
                appDataRoot,
                sources: [new SeedSource("src-1", "/media", "Clips")],
                items:
                [
                    new SeedItem("fav-1", "/media/fav.mp4")
                    {
                        IsFavorite = true,
                        Tags = ["Night"]
                    }
                ]);

            var state = new ServerStateService(catalog: CatalogOpen.Host(appDataRoot));
            var source = Assert.Single(state.GetSourcesSnapshot());
            Assert.Equal("src-1", source.Id);
            Assert.Equal("/media", source.RootPath);
            Assert.Equal("Clips", source.DisplayName);
            Assert.True(source.IsEnabled);
            Assert.True(File.Exists(Path.Combine(appDataRoot, "library.db")));
        }
        finally
        {
            Cleanup(appDataRoot);
        }
    }

    [Fact]
    public void ImportedSource_IsListedAndToggles_WithoutRestart()
    {
        var appDataRoot = CreateTempAppDataRoot();
        var mediaRoot = Path.Combine(appDataRoot, "media", "Clips");
        try
        {
            Directory.CreateDirectory(mediaRoot);
            File.WriteAllText(Path.Combine(mediaRoot, "clip.mp4"), "x");
            CatalogSeed.Write(appDataRoot);
            var (host, service) = OpenOperations(appDataRoot);
            var state = new ServerStateService(catalog: host);
            Assert.Empty(state.GetSourcesSnapshot());

            Assert.True(service.ImportSource(new SourceImportRequest { RootPath = mediaRoot }).Accepted);

            var imported = Assert.Single(state.GetSourcesSnapshot());
            Assert.Equal(mediaRoot, imported.RootPath);
            Assert.True(imported.IsEnabled);

            var revision = state.GetCurrentRevision();
            Assert.True(state.TrySetSourceEnabled(imported.Id, false, out var disabled));
            Assert.False(disabled!.IsEnabled);
            Assert.False(Assert.Single(state.GetSourcesSnapshot()).IsEnabled);
            Assert.True(state.TrySetSourceEnabled(imported.Id, true, out var enabled));
            Assert.True(enabled!.IsEnabled);
            Assert.True(Assert.Single(state.GetSourcesSnapshot()).IsEnabled);
            Assert.Equal(
                ["sourceStateChanged", "sourceStateChanged"],
                state.GetReplayAfter(revision).Events.Select(e => e.EventType).ToArray());

            // Setting the flag it already has neither writes nor publishes.
            revision = state.GetCurrentRevision();
            var catalogRevision = host.Session.Revision;
            Assert.True(state.TrySetSourceEnabled(imported.Id, true, out _));
            Assert.Equal(catalogRevision, host.Session.Revision);
            Assert.Empty(state.GetReplayAfter(revision).Events);
            Assert.False(state.TrySetSourceEnabled("missing", false, out _));
        }
        finally
        {
            Cleanup(appDataRoot);
        }
    }

    [Fact]
    public void EveryCatalogWritePath_KeepsUncategorized()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            var (host, service) = OpenOperations(appDataRoot);
            AssertHasUncategorized(host);

            Assert.True(service.UpsertCategory(new UpsertCategoryRequest { Id = "people", Name = "People", SortOrder = 1 }));
            AssertHasUncategorized(host);

            Assert.False(service.DeleteCategory(new DeleteCategoryRequest { CategoryId = "uncategorized" }));
            Assert.False(service.DeleteCategory(new DeleteCategoryRequest { CategoryId = "UNCATEGORIZED", NewCategoryId = "people" }));
            AssertHasUncategorized(host);
        }
        finally
        {
            Cleanup(appDataRoot);
        }

        static void AssertHasUncategorized(LibraryCatalogHost host)
        {
            Assert.Contains(
                LibraryCatalogStore.Read(host.Session.DatabasePath).Categories,
                category => category.Id == "uncategorized");
        }
    }

    private static (LibraryCatalogHost Host, LibraryOperationsService Service) OpenOperations(string appDataRoot)
    {
        var host = LibraryCatalogHost.Open(appDataRoot);
        var service = new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, appDataRoot);
        return (host, service);
    }

    private static void Cleanup(string appDataRoot)
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(appDataRoot))
        {
            Directory.Delete(appDataRoot, recursive: true);
        }
    }

    private static string CreateTempAppDataRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "reelroulette-library-ops-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static LibraryCatalogSnapshot LoadLibrary(string appDataRoot)
    {
        var opened = CatalogOpen.Open(appDataRoot);
        Assert.NotNull(opened.Session);
        return LibraryCatalogStore.Read(opened.Session.DatabasePath);
    }

    private static void SeedCoreSettings(string appDataRoot, bool enabled, int minimumGapMinutes, int numberOfBackups)
    {
        var coreSettingsPath = Path.Combine(appDataRoot, "core-settings.json");
        File.WriteAllText(coreSettingsPath, $$"""
{
  "backup": {
    "enabled": {{enabled.ToString().ToLowerInvariant()}},
    "minimumBackupGapMinutes": {{minimumGapMinutes}},
    "numberOfBackups": {{numberOfBackups}}
  }
}
""");
    }

    private static string[] ListCatalogBackupFiles(string backupDir)
    {
        return Directory.GetFiles(backupDir, "library.db.backup.*")
            .Where(path => !path.EndsWith("-wal", StringComparison.Ordinal) &&
                           !path.EndsWith("-shm", StringComparison.Ordinal) &&
                           !path.EndsWith("-journal", StringComparison.Ordinal))
            .ToArray();
    }

    private static void SetBackupTimestampUtc(string path, DateTime timestampUtc)
    {
        File.SetCreationTimeUtc(path, timestampUtc);
        File.SetLastWriteTimeUtc(path, timestampUtc);
    }
}
