using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryOperationsServiceTests
{
    [Fact]
    public void Constructor_DoesNotCreateLibraryJsonBackup()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 360, numberOfBackups: 8);
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray(),
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            _ = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);

            var backupDir = Path.Combine(appDataRoot, "backups");
            if (Directory.Exists(backupDir))
            {
                Assert.Empty(Directory.GetFiles(backupDir, "library.json.backup.*"));
            }

            Assert.False(File.Exists(Path.Combine(appDataRoot, "library.json")));
            Assert.True(File.Exists(Path.Combine(appDataRoot, "library.db")));
            Assert.NotEmpty(Directory.GetFiles(Path.Combine(appDataRoot, "backups"), "library.db.backup.*"));
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
    public void RecordPlayback_DoesNotCopyOrTrimLibraryJsonBackups()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 1, numberOfBackups: 1);
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 1
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var backupDir = Path.Combine(appDataRoot, "backups");
            Directory.CreateDirectory(backupDir);
            var leftover = Path.Combine(backupDir, "library.json.backup.leftover");
            File.WriteAllText(leftover, "{\"items\":[]}");
            SetBackupTimestampUtc(leftover, DateTime.UtcNow.AddHours(-12));

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            Assert.True(service.RecordPlayback(@"C:\media\movie.mp4").Found);

            var backupFiles = Directory.GetFiles(backupDir, "library.json.backup.*");
            Assert.Equal(leftover, Assert.Single(backupFiles));
            Assert.Equal("{\"items\":[]}", File.ReadAllText(leftover));
            Assert.False(File.Exists(Path.Combine(appDataRoot, "library.json")));
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 2,
                        ["lastPlayedUtc"] = null
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var before = DateTime.UtcNow;
            var result = service.RecordPlayback(@"C:\media\movie.mp4");
            var after = DateTime.UtcNow;

            Assert.True(result.Found);
            Assert.Equal(3, result.PlayCount);
            Assert.Null(result.PreviousLastPlayedUtc);
            Assert.NotNull(result.LastPlayedUtc);
            Assert.InRange(result.LastPlayedUtc!.Value, before.AddSeconds(-1), after.AddSeconds(1));

            var root = LoadLibrary(appDataRoot);
            var item = Assert.Single((root["items"] as JsonArray)!.OfType<JsonObject>());
            Assert.Equal(3, item["playCount"]?.GetValue<int>());
            Assert.NotNull(item["lastPlayedUtc"]);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray(),
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["isFavorite"] = false,
                        ["isBlacklisted"] = true
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var updated = service.SetFavorite(@"C:\media\movie.mp4", isFavorite: true);

            Assert.NotNull(updated);
            Assert.True(updated!.IsFavorite);
            Assert.False(updated.IsBlacklisted);

            var root = LoadLibrary(appDataRoot);
            var item = Assert.Single((root["items"] as JsonArray)!.OfType<JsonObject>());
            Assert.True(item["isFavorite"]!.GetValue<bool>());
            Assert.False(item["isBlacklisted"]!.GetValue<bool>());
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["isFavorite"] = false,
                        ["isBlacklisted"] = true,
                        ["playCount"] = 2
                    },
                    new JsonObject
                    {
                        ["id"] = "item-2",
                        ["fullPath"] = @"C:\media\other.mp4",
                        ["isFavorite"] = true,
                        ["isBlacklisted"] = false,
                        ["playCount"] = 5
                    },
                    new JsonObject
                    {
                        ["id"] = "item-3",
                        ["fullPath"] = @"C:\media\fresh.mp4",
                        ["playCount"] = 0
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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
            Assert.Equal(builds, host.Session.DocumentBuilds);
            _ = host.Session.BuildDocument();
            Assert.Equal(builds + 1, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\one.mp4",
                        ["tags"] = new JsonArray("old")
                    },
                    new JsonObject
                    {
                        ["id"] = "item-2",
                        ["fullPath"] = @"C:\media\two.mp4",
                        ["tags"] = new JsonArray("old")
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var changed = service.ApplyItemTags(new ReelRoulette.Server.Contracts.ApplyItemTagsRequest
            {
                ItemIds = ["item-1", @"C:\media\two.mp4"],
                AddTags = ["newTag"],
                RemoveTags = ["old"]
            });

            Assert.True(changed);
            var root = LoadLibrary(appDataRoot);
            var items = (root["items"] as JsonArray)!.OfType<JsonObject>().ToList();
            Assert.All(items, item =>
            {
                var tags = (item["tags"] as JsonArray)!.Select(tag => tag!.GetValue<string>()).ToList();
                Assert.DoesNotContain("old", tags, StringComparer.OrdinalIgnoreCase);
                Assert.Contains("newTag", tags, StringComparer.OrdinalIgnoreCase);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\one.mp4",
                        ["tags"] = new JsonArray()
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "TagA", ["categoryId"] = "cat-1" }
                },
                ["categories"] = new JsonArray
                {
                    new JsonObject { ["id"] = "cat-1", ["name"] = "Category 1", ["sortOrder"] = 1 },
                    new JsonObject { ["id"] = "uncategorized", ["name"] = "Uncategorized", ["sortOrder"] = int.MaxValue }
                }
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var changed = service.ApplyItemTags(new ReelRoulette.Server.Contracts.ApplyItemTagsRequest
            {
                ItemIds = ["item-1"],
                AddTags = ["TagA"],
                RemoveTags = []
            });

            Assert.True(changed);
            var root = LoadLibrary(appDataRoot);
            var tagCatalog = (root["tags"] as JsonArray)!.OfType<JsonObject>().ToList();
            var tagA = Assert.Single(tagCatalog, tag =>
                string.Equals(tag["name"]?.GetValue<string>(), "TagA", StringComparison.OrdinalIgnoreCase));
            Assert.Equal("cat-1", tagA["categoryId"]?.GetValue<string>());

            var item = Assert.Single((root["items"] as JsonArray)!.OfType<JsonObject>());
            var itemTags = (item["tags"] as JsonArray)!.Select(tag => tag!.GetValue<string>()).ToList();
            Assert.Single(itemTags);
            Assert.Equal("TagA", itemTags[0]);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\one.mp4",
                        ["tags"] = new JsonArray("TagA")
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "TagA", ["categoryId"] = "cat-1" }
                },
                ["categories"] = new JsonArray
                {
                    new JsonObject { ["id"] = "cat-1", ["name"] = "Category 1", ["sortOrder"] = 1 },
                    new JsonObject { ["id"] = "uncategorized", ["name"] = "Uncategorized", ["sortOrder"] = int.MaxValue }
                }
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\one.mp4",
                        ["tags"] = new JsonArray()
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "TagA", ["categoryId"] = "cat-1" }
                },
                ["categories"] = new JsonArray
                {
                    new JsonObject { ["id"] = "cat-1", ["name"] = "Category 1", ["sortOrder"] = 1 },
                    new JsonObject { ["id"] = "uncategorized", ["name"] = "Uncategorized", ["sortOrder"] = int.MaxValue }
                }
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = "/media/one.mp4",
                        ["fileName"] = "one.mp4",
                        ["tags"] = new JsonArray("Old")
                    },
                    new JsonObject
                    {
                        ["id"] = "item-2",
                        ["fullPath"] = "/media/two.mp4",
                        ["fileName"] = "two.mp4",
                        ["tags"] = new JsonArray()
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "Old", ["categoryId"] = "people" }
                },
                ["categories"] = new JsonArray
                {
                    new JsonObject { ["id"] = "people", ["name"] = "People", ["sortOrder"] = 1 }
                }
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;

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
            Assert.Equal(builds, host.Session.DocumentBuilds);
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
            Assert.Equal(builds, host.Session.DocumentBuilds);
            _ = host.Session.BuildDocument();
            Assert.Equal(builds + 1, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\one.mp4",
                        ["tags"] = new JsonArray("TagA")
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "TagA", ["categoryId"] = "uncategorized" }
                },
                ["categories"] = new JsonArray
                {
                    new JsonObject { ["id"] = "uncategorized", ["name"] = "Uncategorized", ["sortOrder"] = int.MaxValue }
                }
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            var tagsCatalog = (root["tags"] as JsonArray)!.OfType<JsonObject>()
                .Select(tag => tag["name"]!.GetValue<string>())
                .ToList();
            Assert.DoesNotContain("TagA", tagsCatalog, StringComparer.OrdinalIgnoreCase);
            Assert.DoesNotContain("TagB", tagsCatalog, StringComparer.OrdinalIgnoreCase);

            var item = Assert.Single((root["items"] as JsonArray)!.OfType<JsonObject>());
            var itemTags = (item["tags"] as JsonArray)!.Select(tag => tag!.GetValue<string>()).ToList();
            Assert.DoesNotContain("TagA", itemTags, StringComparer.OrdinalIgnoreCase);
            Assert.DoesNotContain("TagB", itemTags, StringComparer.OrdinalIgnoreCase);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "src-a",
                        ["rootPath"] = @"C:\media\a",
                        ["displayName"] = "A",
                        ["isEnabled"] = true
                    },
                    new JsonObject
                    {
                        ["id"] = "src-b",
                        ["rootPath"] = @"C:\media\b",
                        ["displayName"] = "B",
                        ["isEnabled"] = false
                    }
                },
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "video-1",
                        ["sourceId"] = "src-a",
                        ["fullPath"] = @"C:\media\a\v1.mp4",
                        ["mediaType"] = "Video",
                        ["hasAudio"] = true,
                        ["duration"] = "00:02:00",
                        ["isFavorite"] = true,
                        ["isBlacklisted"] = false,
                        ["playCount"] = 2
                    },
                    new JsonObject
                    {
                        ["id"] = "video-2",
                        ["sourceId"] = "src-a",
                        ["fullPath"] = @"C:\media\a\v2.mp4",
                        ["mediaType"] = "Video",
                        ["hasAudio"] = false,
                        ["duration"] = "00:03:00",
                        ["isFavorite"] = false,
                        ["isBlacklisted"] = true,
                        ["playCount"] = 0
                    },
                    new JsonObject
                    {
                        ["id"] = "photo-1",
                        ["sourceId"] = "src-b",
                        ["fullPath"] = @"C:\media\b\p1.jpg",
                        ["mediaType"] = "Photo",
                        ["isFavorite"] = false,
                        ["isBlacklisted"] = false,
                        ["playCount"] = 1
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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
            Assert.Equal(builds, host.Session.DocumentBuilds);
            _ = host.Session.BuildDocument();
            Assert.Equal(builds + 1, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "src-a",
                        ["rootPath"] = @"C:\media\a",
                        ["displayName"] = "A",
                        ["isEnabled"] = true
                    }
                },
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "video-legacy",
                        ["fullPath"] = @"C:\media\a\video-legacy.mp4",
                        ["mediaType"] = 0,
                        ["playCount"] = 1
                    },
                    new JsonObject
                    {
                        ["id"] = "photo-legacy",
                        ["fullPath"] = @"C:\media\a\photo-legacy.jpg",
                        ["mediaType"] = 1,
                        ["playCount"] = 0
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
            var stats = service.GetLibraryStats();

            Assert.Equal(1, stats.Global.TotalVideos);
            Assert.Equal(1, stats.Global.TotalPhotos);
            Assert.Equal(2, stats.Global.TotalMedia);
            Assert.Equal(1, stats.Global.UniquePlayedMedia);

            var sourceA = Assert.Single(stats.Sources, source => source.SourceId == "src-a");
            Assert.Equal(1, sourceA.TotalVideos);
            Assert.Equal(1, sourceA.TotalPhotos);
            Assert.Equal(2, sourceA.TotalMedia);
            Assert.Equal(builds, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "src-a",
                        ["rootPath"] = @"C:\media\a",
                        ["displayName"] = "A",
                        ["isEnabled"] = true
                    }
                },
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "video-fraction",
                        ["sourceId"] = "src-a",
                        ["fullPath"] = @"C:\media\a\fraction.mp4",
                        ["mediaType"] = "Video",
                        ["duration"] = 120.5,
                        ["playCount"] = -2
                    },
                    new JsonObject
                    {
                        ["id"] = "video-whole",
                        ["sourceId"] = "src-a",
                        ["fullPath"] = @"C:\media\a\whole.mp4",
                        ["mediaType"] = "Video",
                        ["hasAudio"] = false,
                        ["duration"] = 60,
                        ["playCount"] = 4
                    },
                    new JsonObject
                    {
                        ["id"] = "photo-odd",
                        ["fullPath"] = @"C:\media\a\odd.jpg",
                        ["mediaType"] = 2,
                        ["playCount"] = 0
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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

            Assert.Equal(builds, host.Session.DocumentBuilds);
            _ = host.Session.BuildDocument();
            Assert.Equal(builds + 1, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 2,
                        ["lastPlayedUtc"] = null
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var backupDir = Path.Combine(appDataRoot, "backups");
            Directory.CreateDirectory(backupDir);
            var backupA = Path.Combine(backupDir, "library.json.backup.a");
            var backupB = Path.Combine(backupDir, "library.json.backup.b");
            var backupC = Path.Combine(backupDir, "library.json.backup.c");
            File.WriteAllText(backupA, "{}");
            File.WriteAllText(backupB, "{}");
            File.WriteAllText(backupC, "{}");
            SetBackupTimestampUtc(backupA, DateTime.UtcNow.AddHours(-8));
            SetBackupTimestampUtc(backupB, DateTime.UtcNow.AddHours(-7));
            SetBackupTimestampUtc(backupC, DateTime.UtcNow.AddMinutes(-10));

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var before = Directory.GetFiles(backupDir, "library.json.backup.*").OrderBy(path => path).ToArray();
            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            var after = Directory.GetFiles(backupDir, "library.json.backup.*").OrderBy(path => path).ToArray();

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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 2
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
    public void RecordPlayback_WhenBackupGapIsSatisfied_DoesNotTrimOrCreateJsonBackups()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedCoreSettings(appDataRoot, enabled: true, minimumGapMinutes: 60, numberOfBackups: 3);
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 2,
                        ["lastPlayedUtc"] = null
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var backupDir = Path.Combine(appDataRoot, "backups");
            Directory.CreateDirectory(backupDir);
            var backupA = Path.Combine(backupDir, "library.json.backup.a");
            var backupB = Path.Combine(backupDir, "library.json.backup.b");
            var backupC = Path.Combine(backupDir, "library.json.backup.c");
            File.WriteAllText(backupA, "{}");
            File.WriteAllText(backupB, "{}");
            File.WriteAllText(backupC, "{}");
            SetBackupTimestampUtc(backupA, DateTime.UtcNow.AddHours(-12));
            SetBackupTimestampUtc(backupB, DateTime.UtcNow.AddHours(-8));
            SetBackupTimestampUtc(backupC, DateTime.UtcNow.AddHours(-7));

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            foreach (var existing in Directory.GetFiles(backupDir, "library.db.backup.*"))
            {
                SetBackupTimestampUtc(existing, DateTime.UtcNow.AddHours(-3));
            }

            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            LibraryCatalogBackup.WaitForPending();
            var after = Directory.GetFiles(backupDir, "library.json.backup.*").OrderBy(path => path).ToArray();

            Assert.Equal([backupA, backupB, backupC], after);
            Assert.False(File.Exists(Path.Combine(appDataRoot, "library.json")));
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 1
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 1
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 1
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = @"C:\media\movie.mp4",
                        ["playCount"] = 1
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            _ = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            Assert.True(ReelRoulette.Core.Library.LibraryCatalogStore.IsUsableDatabase(backup));
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray(),
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            _ = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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

            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "keep-1",
                        ["fullPath"] = keepPath,
                        ["isFavorite"] = true,
                        ["isBlacklisted"] = false
                    },
                    new JsonObject
                    {
                        ["id"] = "remove-1",
                        ["fullPath"] = removePath,
                        ["isFavorite"] = false,
                        ["isBlacklisted"] = false
                    },
                    new JsonObject
                    {
                        ["id"] = "missing-1",
                        ["fullPath"] = missingPath,
                        ["isFavorite"] = false,
                        ["isBlacklisted"] = false
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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
            Assert.Equal(builds, host.Session.DocumentBuilds);

            var root = LoadLibrary(appDataRoot);
            var items = (root["items"] as JsonArray)!.OfType<JsonObject>().ToList();
            Assert.Equal(["keep-1", "missing-1"], items.Select(item => item["id"]!.GetValue<string>()).ToArray());
            var kept = items[0];

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
            SeedLibrary(appDataRoot, EmptyLibraryRoot());

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ImportSource(new SourceImportRequest
            {
                RootPath = mediaRoot + Path.DirectorySeparatorChar,
                DisplayName = "  "
            });

            Assert.True(response.Accepted);
            var sources = (LoadLibrary(appDataRoot)["sources"] as JsonArray)!.OfType<JsonObject>().ToList();
            var source = Assert.Single(sources);
            Assert.Equal(mediaRoot, source["rootPath"]?.GetValue<string>());
            Assert.Equal("YouTube", source["displayName"]?.GetValue<string>());
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
            SeedLibrary(appDataRoot, EmptyLibraryRoot());

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            var sources = (LoadLibrary(appDataRoot)["sources"] as JsonArray)!.OfType<JsonObject>().ToList();
            Assert.Single(sources);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "src-clips",
                        ["rootPath"] = mediaRoot + Path.DirectorySeparatorChar,
                        ["displayName"] = "Clips",
                        ["isEnabled"] = true
                    }
                },
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "kept-1",
                        ["sourceId"] = "other-source",
                        ["fullPath"] = keptStoredPath,
                        ["relativePath"] = "old/kept.mp4",
                        ["fileName"] = "Nope.mp4",
                        ["mediaType"] = "Photo",
                        ["isFavorite"] = true,
                        ["isBlacklisted"] = false,
                        ["playCount"] = 4,
                        ["lastPlayedUtc"] = "2024-03-04T05:06:07Z",
                        ["duration"] = "00:00:12",
                        ["fingerprint"] = "abc123",
                        ["fingerprintStatus"] = "Ready",
                        ["tags"] = new JsonArray("Holiday", "Night")
                    },
                    new JsonObject
                    {
                        ["id"] = "gone-1",
                        ["sourceId"] = "src-clips",
                        ["fullPath"] = gonePath,
                        ["fileName"] = "gone.mp4",
                        ["playCount"] = 2,
                        ["tags"] = new JsonArray("Keep")
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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
            Assert.Equal(builds, host.Session.DocumentBuilds);

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
            Assert.Equal(builds, host.Session.DocumentBuilds);
            _ = host.Session.BuildDocument();
            Assert.Equal(builds + 1, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, EmptyLibraryRoot());
            var host = LibraryCatalogHost.Open(appDataRoot);
            var builds = host.Session.DocumentBuilds;
            var service = new LibraryOperationsService(
                NullLogger<LibraryOperationsService>.Instance,
                appDataRoot,
                host,
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
            Assert.Equal(builds, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "src-yt",
                        ["rootPath"] = storedRoot,
                        ["displayName"] = "",
                        ["isEnabled"] = true
                    }
                },
                ["items"] = new JsonArray(),
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
            var stats = service.GetLibraryStats();
            var source = Assert.Single(stats.Sources);
            Assert.Equal("YouTube", source.DisplayName);
            Assert.Equal(storedRoot, source.RootPath);
            Assert.Equal(builds, host.Session.DocumentBuilds);

            var stored = Assert.Single((LoadLibrary(appDataRoot)["sources"] as JsonArray)!.OfType<JsonObject>());
            Assert.Null(stored["displayName"]);
            Assert.Equal(storedRoot, stored["rootPath"]?.GetValue<string>());
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject { ["id"] = "on", ["rootPath"] = "/media/on", ["isEnabled"] = true },
                    new JsonObject { ["id"] = "off", ["rootPath"] = "/media/off", ["isEnabled"] = false }
                },
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "a",
                        ["sourceId"] = "on",
                        ["fullPath"] = "/media/on/Holiday-a.mp4",
                        ["fileName"] = "Holiday-a.mp4"
                    },
                    new JsonObject
                    {
                        ["id"] = "kept",
                        ["sourceId"] = "on",
                        ["fullPath"] = "/media/on/Holiday-kept.mp4",
                        ["fileName"] = "Holiday-kept.mp4",
                        ["tags"] = new JsonArray { "Holiday" }
                    },
                    new JsonObject
                    {
                        ["id"] = "plain",
                        ["sourceId"] = "on",
                        ["fullPath"] = "/media/on/plain.mp4",
                        ["relativePath"] = "clips/Holiday/plain.mp4",
                        ["fileName"] = "plain.mp4"
                    },
                    new JsonObject
                    {
                        ["id"] = "b",
                        ["sourceId"] = "off",
                        ["fullPath"] = "/media/off/Holiday-b.mp4",
                        ["fileName"] = "Holiday-b.mp4"
                    },
                    new JsonObject
                    {
                        ["id"] = "orphan",
                        ["sourceId"] = "missing",
                        ["fullPath"] = "/media/missing/Holiday-c.mp4",
                        ["fileName"] = "Holiday-c.mp4"
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "Holiday", ["categoryId"] = "uncategorized" }
                },
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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
            Assert.Equal(builds, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject { ["id"] = "off", ["rootPath"] = "/media/off", ["isEnabled"] = false }
                },
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "b",
                        ["sourceId"] = "off",
                        ["fullPath"] = "/media/off/Holiday-b.mp4",
                        ["fileName"] = "Holiday-b.mp4"
                    }
                },
                ["tags"] = new JsonArray
                {
                    new JsonObject { ["name"] = "Holiday", ["categoryId"] = "uncategorized" }
                },
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
            var response = service.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = false, ItemIds = [] });
            Assert.Empty(response.Rows);
            Assert.Equal(builds, host.Session.DocumentBuilds);
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
            var readyA = Item("ready-a", "/media/ready-a.mp4", "fp-ready", 1);
            readyA["isFavorite"] = true;
            readyA["playCount"] = 4;
            readyA["tags"] = new JsonArray { "One", "Two" };
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    readyA,
                    Item("ready-b", "/media/ready-b.mp4", "fp-ready", 1),
                    Item("pending-1", "/media/pending.mp4", "fp-pending", 0),
                    Item("stale-1", "/media/stale.mp4", "fp-stale", 3),
                    Item("failed-1", "/media/failed.mp4", null, 2),
                    Item("unset-a", "/media/unset-a.mp4", "fp-unset", null),
                    Item("unset-b", "/media/unset-b.mp4", "fp-unset", null)
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;
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
            Assert.Equal(builds, host.Session.DocumentBuilds);
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray
                {
                    new JsonObject { ["id"] = "src-on", ["rootPath"] = "/media/on", ["isEnabled"] = true },
                    new JsonObject { ["id"] = "src-off", ["rootPath"] = "/media/off", ["isEnabled"] = false }
                },
                ["items"] = new JsonArray
                {
                    Item("on-a", "/media/on/a.mp4", "fp-on", 1, "src-on"),
                    Item("on-b", "/media/on/b.mp4", "fp-on", 1, "src-on"),
                    Item("on-pending", "/media/on/pending.mp4", "fp-pending", 0, "src-on"),
                    Item("off-a", "/media/off/a.mp4", "fp-off", 1, "src-off"),
                    Item("off-b", "/media/off/b.mp4", "fp-off", 1, "src-off"),
                    Item("off-stale", "/media/off/stale.mp4", "fp-stale", 3, "src-off")
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot, host);
            var builds = host.Session.DocumentBuilds;

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
            Assert.Equal(builds, host.Session.DocumentBuilds);
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

    private static JsonObject Item(string id, string fullPath, string? fingerprint, int? fingerprintStatus, string? sourceId = null)
    {
        var item = new JsonObject
        {
            ["id"] = id,
            ["fullPath"] = fullPath,
            ["fileName"] = Path.GetFileName(fullPath),
            ["fingerprintAlgorithm"] = "SHA-256",
            ["fingerprintVersion"] = 1
        };
        if (sourceId != null)
        {
            item["sourceId"] = sourceId;
        }

        if (fingerprint != null)
        {
            item["fingerprint"] = fingerprint;
        }

        if (fingerprintStatus != null)
        {
            item["fingerprintStatus"] = fingerprintStatus;
        }

        return item;
    }

    [Fact]
    public void SaveChanges_KeepsTagApplyWhenDurationIsCommittedFromAnEarlierSnapshot()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = "/media/clip.mp4",
                        ["fileName"] = "clip.mp4",
                        ["tags"] = new JsonArray()
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var baseline = host.LoadDocument();
            var edited = baseline.DeepClone()!.AsObject();
            var item = edited["items"]!.AsArray().OfType<JsonObject>().Single();
            item["duration"] = "00:01:30";

            Assert.True(host.Session.AddItemTags("item-1", ["Holiday"]));
            host.SaveChanges(baseline, edited);

            var stored = host.LoadDocument();
            var storedItem = stored["items"]!.AsArray().OfType<JsonObject>().Single();
            Assert.Equal("00:01:30", storedItem["duration"]?.GetValue<string>());
            Assert.Equal("Holiday", storedItem["tags"]!.AsArray().Single()!.GetValue<string>());
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
    public void SaveChanges_PersistsCaseOnlyPathRename()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = "/media/Clip.mp4",
                        ["relativePath"] = "Clip.mp4",
                        ["fileName"] = "Clip.mp4"
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var baseline = host.LoadDocument();
            var edited = baseline.DeepClone()!.AsObject();
            var item = edited["items"]!.AsArray().OfType<JsonObject>().Single();
            item["fullPath"] = "/media/clip.mp4";
            item["relativePath"] = "clip.mp4";
            item["fileName"] = "clip.mp4";
            host.SaveChanges(baseline, edited);

            var stored = host.LoadDocument();
            var storedItem = stored["items"]!.AsArray().OfType<JsonObject>().Single();
            Assert.Equal("/media/clip.mp4", storedItem["fullPath"]?.GetValue<string>());
            Assert.Equal("clip.mp4", storedItem["relativePath"]?.GetValue<string>());
            Assert.Equal("clip.mp4", storedItem["fileName"]?.GetValue<string>());
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
    public void SaveChanges_RollsBackEarlierEditsWhenALaterUpdateFails()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "item-1",
                        ["fullPath"] = "/media/clip.mp4",
                        ["fileName"] = "clip.mp4"
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"] = "people",
                        ["name"] = "People",
                        ["sortOrder"] = 1
                    }
                }
            });

            var host = LibraryCatalogHost.Open(appDataRoot);
            var revision = host.Session.Revision;
            var baseline = host.LoadDocument();
            var edited = baseline.DeepClone()!.AsObject();
            var category = edited["categories"]!.AsArray().OfType<JsonObject>()
                .Single(node => node["id"]?.GetValue<string>() == "people");
            category["name"] = "Cast";
            baseline["items"] = new JsonArray();

            Assert.ThrowsAny<Exception>(() => host.SaveChanges(baseline, edited));

            var stored = host.LoadDocument();
            var storedCategory = stored["categories"]!.AsArray().OfType<JsonObject>()
                .Single(node => node["id"]?.GetValue<string>() == "people");
            Assert.Equal("People", storedCategory["name"]?.GetValue<string>());
            Assert.Single(stored["items"]!.AsArray());
            Assert.Equal(revision, host.Session.Revision);
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

    private static JsonObject EmptyLibraryRoot()
    {
        return new JsonObject
        {
            ["sources"] = new JsonArray(),
            ["items"] = new JsonArray(),
            ["tags"] = new JsonArray(),
            ["categories"] = new JsonArray()
        };
    }

    private static string CreateTempAppDataRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "reelroulette-library-ops-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static void SeedLibrary(string appDataRoot, JsonObject root)
    {
        var libraryPath = Path.Combine(appDataRoot, "library.json");
        File.WriteAllText(libraryPath, root.ToJsonString());
    }

    private static JsonObject LoadLibrary(string appDataRoot)
    {
        var opened = ReelRoulette.Core.Library.LibraryCatalogStore.Open(appDataRoot);
        Assert.NotNull(opened.Session);
        return opened.Session.BuildDocument();
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
