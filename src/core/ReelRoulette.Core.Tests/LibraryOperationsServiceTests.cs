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
        }
        finally
        {
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
            Assert.NotNull(result.LastPlayedUtc);
            Assert.InRange(result.LastPlayedUtc!.Value, before.AddSeconds(-1), after.AddSeconds(1));

            var root = LoadLibrary(appDataRoot);
            var item = Assert.Single((root["items"] as JsonArray)!.OfType<JsonObject>());
            Assert.Equal(3, item["playCount"]?.GetValue<int>());
            Assert.NotNull(item["lastPlayedUtc"]);
        }
        finally
        {
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

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
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
            _ = service.RecordPlayback(@"C:\media\movie.mp4");
            var after = Directory.GetFiles(backupDir, "library.json.backup.*").OrderBy(path => path).ToArray();

            Assert.Equal([backupA, backupB, backupC], after);
            Assert.False(File.Exists(Path.Combine(appDataRoot, "library.json")));
        }
        finally
        {
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
                    }
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ApplyDuplicateSelection(new ReelRoulette.Server.Contracts.DuplicateApplyRequest
            {
                Selections =
                [
                    new ReelRoulette.Server.Contracts.DuplicateApplySelection
                    {
                        KeepItemId = "keep-1",
                        ItemIds = ["keep-1", "remove-1"]
                    }
                ]
            });

            Assert.Equal(1, response.DeletedOnDisk);
            Assert.Equal(1, response.RemovedFromLibrary);
            Assert.Empty(response.Failures);
            Assert.False(File.Exists(removePath));
            Assert.True(File.Exists(keepPath));

            var root = LoadLibrary(appDataRoot);
            var items = (root["items"] as JsonArray)!.OfType<JsonObject>().ToList();
            var kept = Assert.Single(items);
            Assert.Equal("keep-1", kept["id"]?.GetValue<string>());

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

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var stats = service.GetLibraryStats();
            var source = Assert.Single(stats.Sources);
            Assert.Equal("YouTube", source.DisplayName);
            Assert.Equal(storedRoot, source.RootPath);

            var stored = Assert.Single((LoadLibrary(appDataRoot)["sources"] as JsonArray)!.OfType<JsonObject>());
            Assert.Null(stored["displayName"]);
            Assert.Equal(storedRoot, stored["rootPath"]?.GetValue<string>());
        }
        finally
        {
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

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var enabledOnly = service.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = false, ItemIds = [] });
            var enabledPaths = enabledOnly.Rows.SelectMany(row => row.Files).Select(file => file.FullPath).ToList();
            Assert.Equal(["/media/on/Holiday-a.mp4"], enabledPaths);

            var listed = service.ScanAutoTags(new AutoTagScanRequest
            {
                ScanFullLibrary = false,
                ItemIds = ["/media/off/Holiday-b.mp4"]
            });
            var listedPaths = listed.Rows.SelectMany(row => row.Files).Select(file => file.FullPath).ToList();
            Assert.Equal(["/media/off/Holiday-b.mp4"], listedPaths);

            var full = service.ScanAutoTags(new AutoTagScanRequest
            {
                ScanFullLibrary = true,
                ItemIds = ["/media/off/Holiday-b.mp4"]
            });
            var fullPaths = full.Rows.SelectMany(row => row.Files).Select(file => file.FullPath).OrderBy(path => path).ToList();
            Assert.Equal(["/media/off/Holiday-b.mp4", "/media/on/Holiday-a.mp4"], fullPaths);
        }
        finally
        {
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

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ScanAutoTags(new AutoTagScanRequest { ScanFullLibrary = false, ItemIds = [] });
            Assert.Empty(response.Rows);
        }
        finally
        {
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
            SeedLibrary(appDataRoot, new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray
                {
                    Item("ready-a", "/media/ready-a.mp4", "fp-ready", "Ready"),
                    Item("ready-b", "/media/ready-b.mp4", "fp-ready", "Ready"),
                    Item("stale-1", "/media/stale.mp4", "fp-ready", "Stale"),
                    Item("failed-1", "/media/failed.mp4", null, "Failed"),
                    Item("legacy-a", "/media/legacy-a.mp4", "fp-legacy", null),
                    Item("legacy-b", "/media/legacy-b.mp4", "fp-legacy", null)
                },
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            });

            var service = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, appDataRoot);
            var response = service.ScanDuplicates(new DuplicateScanRequest());

            Assert.Equal(0, response.ExcludedPending);
            Assert.Equal(1, response.ExcludedFailed);
            Assert.Equal(1, response.ExcludedStale);
            Assert.Equal(2, response.Groups.Count);
            var scannedIds = response.Groups.SelectMany(group => group.Items.Select(item => item.ItemId)).ToHashSet(StringComparer.Ordinal);
            Assert.Equal(["legacy-a", "legacy-b", "ready-a", "ready-b"], scannedIds.OrderBy(id => id, StringComparer.Ordinal).ToArray());
        }
        finally
        {
            if (Directory.Exists(appDataRoot))
            {
                Directory.Delete(appDataRoot, recursive: true);
            }
        }
    }

    private static JsonObject Item(string id, string fullPath, string? fingerprint, string? fingerprintStatus)
    {
        var item = new JsonObject
        {
            ["id"] = id,
            ["fullPath"] = fullPath,
            ["fileName"] = Path.GetFileName(fullPath),
            ["fingerprintAlgorithm"] = "SHA-256",
            ["fingerprintVersion"] = 1
        };
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

    private static void SetBackupTimestampUtc(string path, DateTime timestampUtc)
    {
        File.SetCreationTimeUtc(path, timestampUtc);
        File.SetLastWriteTimeUtc(path, timestampUtc);
    }
}
