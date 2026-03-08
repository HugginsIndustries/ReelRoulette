using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerStateRegressionTests
{
    [Fact]
    public void ReplayAfter_ShouldDetectGapWhenRevisionFallsOutsideBuffer()
    {
        var service = new ServerStateService();

        for (var i = 0; i < 300; i++)
        {
            service.SetFavorite(new FavoriteRequest
            {
                Path = $"clip-{i}.mp4",
                IsFavorite = true
            });
        }

        var replay = service.GetReplayAfter(1);
        Assert.True(replay.GapDetected);
        Assert.NotEmpty(replay.Events);
    }

    [Fact]
    public void RecordPlayback_ShouldPublishPlaybackRecordedPayloadWithClientId()
    {
        var service = new ServerStateService();
        service.RecordPlayback(new RecordPlaybackRequest
        {
            Path = "movie.mp4",
            ClientId = "desktop-client",
            SessionId = "session-1"
        });

        var replay = service.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("playbackRecorded", envelope.EventType);

        var payload = Assert.IsType<PlaybackRecordedPayload>(envelope.Payload);
        Assert.Equal("movie.mp4", payload.Path);
        Assert.Equal("desktop-client", payload.ClientId);
        Assert.Equal("session-1", payload.SessionId);
    }

    [Fact]
    public void LibraryStates_WithoutPathFilter_ShouldReturnAllPathsSorted()
    {
        var service = new ServerStateService();
        service.SetFavorite(new FavoriteRequest { Path = "zeta.mp4", IsFavorite = true });
        service.SetFavorite(new FavoriteRequest { Path = "alpha.mp4", IsFavorite = true });

        var allStates = service.GetLibraryStates(new LibraryStatesRequest());
        Assert.Equal(2, allStates.Count);
        Assert.Equal("alpha.mp4", allStates[0].Path);
        Assert.Equal("zeta.mp4", allStates[1].Path);
    }

    [Fact]
    public void SetFavoriteAfterBlacklist_ShouldClearBlacklistForSameItem()
    {
        var service = new ServerStateService();
        service.SetBlacklist(new BlacklistRequest { Path = "movie.mp4", IsBlacklisted = true });
        service.SetFavorite(new FavoriteRequest { Path = "movie.mp4", IsFavorite = true });

        var state = Assert.Single(service.GetLibraryStates(new LibraryStatesRequest { Paths = ["movie.mp4"] }));
        Assert.True(state.IsFavorite);
        Assert.False(state.IsBlacklisted);
    }

    [Fact]
    public void ApplyItemTags_ShouldPublishItemTagsChangedEvent()
    {
        var service = new ServerStateService();
        service.ApplyItemTags(new ApplyItemTagsRequest
        {
            ItemIds = ["a.mp4"],
            AddTags = ["TagA"]
        });

        var replay = service.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("itemTagsChanged", envelope.EventType);
        var payload = Assert.IsType<ItemTagsChangedPayload>(envelope.Payload);
        Assert.Equal("a.mp4", Assert.Single(payload.ItemIds));
        Assert.Equal("TagA", Assert.Single(payload.AddedTags));
    }

    [Fact]
    public void ApplyItemTags_ShouldPreserveExistingTagCategory()
    {
        var service = new ServerStateService();
        service.UpsertCategory(new UpsertCategoryRequest { Id = "cat-1", Name = "Category 1", SortOrder = 1 });
        service.UpsertTag(new UpsertTagRequest { Name = "TagA", CategoryId = "cat-1" });

        service.ApplyItemTags(new ApplyItemTagsRequest
        {
            ItemIds = ["a.mp4"],
            AddTags = ["TagA"]
        });

        var model = service.GetTagEditorModel(new TagEditorModelRequest { ItemIds = ["a.mp4"] });
        var tag = Assert.Single(model.Tags, t => string.Equals(t.Name, "TagA", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("cat-1", tag.CategoryId);
    }

    [Fact]
    public void BootstrapFromDisk_ShouldNotLoadPresetsFromLegacySettingsJson()
    {
        var appDataPath = Path.Combine(Path.GetTempPath(), "reelroulette-server-state-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(appDataPath);

        try
        {
            var settingsPath = Path.Combine(appDataPath, "settings.json");
            File.WriteAllText(settingsPath, """
            {
              "filterPresets": [
                {
                  "name": "Favorites",
                  "filterState": {
                    "favoritesOnly": true
                  }
                }
              ]
            }
            """);

            var service = new ServerStateService(appDataPathOverride: appDataPath);
            var presetCatalog = service.GetPresetCatalogSnapshot();
            Assert.Empty(presetCatalog);
            Assert.False(File.Exists(Path.Combine(appDataPath, "presets.json")));
        }
        finally
        {
            if (Directory.Exists(appDataPath))
            {
                Directory.Delete(appDataPath, recursive: true);
            }
        }
    }

    [Fact]
    public void RenameTag_ShouldUpdateCatalogAndItemTagModel()
    {
        var service = new ServerStateService();
        service.UpsertCategory(new UpsertCategoryRequest { Id = "cat-1", Name = "Category 1" });
        service.UpsertTag(new UpsertTagRequest { Name = "TagA", CategoryId = "cat-1" });
        service.ApplyItemTags(new ApplyItemTagsRequest
        {
            ItemIds = ["a.mp4"],
            AddTags = ["TagA"]
        });

        service.RenameTag(new RenameTagRequest
        {
            OldName = "TagA",
            NewName = "TagB",
            NewCategoryId = "cat-1"
        });

        var model = service.GetTagEditorModel(new TagEditorModelRequest { ItemIds = ["a.mp4"] });
        Assert.Contains(model.Tags, t => t.Name == "TagB");
        Assert.DoesNotContain(model.Tags, t => t.Name == "TagA");
        var item = Assert.Single(model.Items);
        Assert.Contains("TagB", item.Tags);
        Assert.DoesNotContain("TagA", item.Tags);
    }

    [Fact]
    public void DeleteCategory_ShouldReassignTagsToUncategorized()
    {
        var service = new ServerStateService();
        service.UpsertCategory(new UpsertCategoryRequest { Id = "cat-1", Name = "Category 1" });
        service.UpsertTag(new UpsertTagRequest { Name = "TagA", CategoryId = "cat-1" });

        service.DeleteCategory(new DeleteCategoryRequest { CategoryId = "cat-1" });

        var model = service.GetTagEditorModel(new TagEditorModelRequest { ItemIds = [] });
        var tag = Assert.Single(model.Tags, t => t.Name == "TagA");
        Assert.Equal("uncategorized", tag.CategoryId);
        Assert.Contains(model.Categories, c => c.Id == "uncategorized" && c.Name == "Uncategorized");
    }

    [Fact]
    public void SyncTagCatalog_ShouldNormalizeBlankCategoryIdsToUncategorized()
    {
        var service = new ServerStateService();
        service.SyncTagCatalog(new SyncTagCatalogRequest
        {
            Categories = [new TagCategorySnapshot { Id = "cat-1", Name = "Category 1", SortOrder = 0 }],
            Tags =
            [
                new TagSnapshot { Name = "TagA", CategoryId = string.Empty },
                new TagSnapshot { Name = "TagB", CategoryId = "cat-1" }
            ]
        });

        var model = service.GetTagEditorModel(new TagEditorModelRequest { ItemIds = [] });
        var uncategorizedTag = Assert.Single(model.Tags, t => t.Name == "TagA");
        Assert.Equal("uncategorized", uncategorizedTag.CategoryId);
        Assert.Contains(model.Categories, c => c.Id == "uncategorized" && c.Name == "Uncategorized");
    }
}
