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
            service.PublishExternal("itemStateChanged", new ItemStateChangedPayload
            {
                ItemId = $"clip-{i}",
                Path = $"clip-{i}.mp4",
                IsFavorite = true,
                IsBlacklisted = false
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
        service.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
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
        Assert.Null(payload.PlayCount);
        Assert.Null(payload.LastPlayedUtc);
    }

    [Fact]
    public void RecordPlayback_WithStats_ShouldIncludeStatsInPayload()
    {
        var service = new ServerStateService();
        var nowUtc = DateTime.UtcNow;
        service.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
        {
            Path = "movie.mp4",
            ClientId = "desktop-client",
            SessionId = "session-1",
            PlayCount = 9,
            LastPlayedUtc = nowUtc
        });

        var replay = service.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        var payload = Assert.IsType<PlaybackRecordedPayload>(envelope.Payload);
        Assert.Equal(9, payload.PlayCount);
        Assert.NotNull(payload.LastPlayedUtc);
        Assert.InRange(payload.LastPlayedUtc!.Value, nowUtc.AddSeconds(-1), nowUtc.AddSeconds(1));
    }

    [Fact]
    public void PublishExternal_ShouldAppendEventsInOrder()
    {
        var service = new ServerStateService();
        service.PublishExternal("itemStateChanged", new ItemStateChangedPayload
        {
            ItemId = "zeta",
            Path = "zeta.mp4",
            IsFavorite = true,
            IsBlacklisted = false
        });
        service.PublishExternal("itemStateChanged", new ItemStateChangedPayload
        {
            ItemId = "alpha",
            Path = "alpha.mp4",
            IsFavorite = true,
            IsBlacklisted = false
        });

        var replay = service.GetReplayAfter(0);
        Assert.Equal(2, replay.Events.Count);
        Assert.Equal("zeta.mp4", Assert.IsType<ItemStateChangedPayload>(replay.Events[0].Payload).Path);
        Assert.Equal("alpha.mp4", Assert.IsType<ItemStateChangedPayload>(replay.Events[1].Payload).Path);
    }

    [Fact]
    public void PublishExternal_TagCatalogChanged_ShouldRoundTripPayload()
    {
        var service = new ServerStateService();
        var payload = new TagCatalogChangedPayload
        {
            Reason = "syncCatalog",
            Categories = [new TagCategorySnapshot { Id = "uncategorized", Name = "Uncategorized", SortOrder = int.MaxValue }],
            Tags = [new TagSnapshot { Name = "TagA", CategoryId = "uncategorized" }]
        };
        service.PublishExternal("tagCatalogChanged", payload);

        var replay = service.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("tagCatalogChanged", envelope.EventType);
        var replayPayload = Assert.IsType<TagCatalogChangedPayload>(envelope.Payload);
        Assert.Equal("syncCatalog", replayPayload.Reason);
        Assert.Contains(replayPayload.Tags, tag => string.Equals(tag.Name, "TagA", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ApplyItemTags_EventPublish_ShouldEmitOnlyItemTagsChanged_WhenCatalogUnchanged()
    {
        var service = new ServerStateService();
        _ = service.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
        {
            ItemIds = ["item-1"],
            AddedTags = ["TagA"],
            RemovedTags = []
        });

        var replay = service.GetReplayAfter(0);
        Assert.Single(replay.Events);
        Assert.Equal("itemTagsChanged", replay.Events[0].EventType);
    }

    [Fact]
    public void ApplyItemTags_EventPublish_ShouldEmitItemAndCatalogEvents_WhenCatalogChanged()
    {
        var service = new ServerStateService();
        _ = service.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
        {
            ItemIds = ["item-1"],
            AddedTags = ["NewTag"],
            RemovedTags = []
        });
        _ = service.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
        {
            Reason = "applyItemTags",
            Categories = [new TagCategorySnapshot { Id = "uncategorized", Name = "Uncategorized", SortOrder = int.MaxValue }],
            Tags = [new TagSnapshot { Name = "NewTag", CategoryId = "uncategorized" }]
        });

        var replay = service.GetReplayAfter(0);
        Assert.Equal(2, replay.Events.Count);
        Assert.Equal("itemTagsChanged", replay.Events[0].EventType);
        Assert.Equal("tagCatalogChanged", replay.Events[1].EventType);
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
    public void RenameTagInPresetCatalogOnly_ShouldRenameSelectedAndExcludedTags()
    {
        var appDataPath = Path.Combine(Path.GetTempPath(), "reelroulette-server-state-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(appDataPath);
        try
        {
            var service = new ServerStateService(appDataPathOverride: appDataPath);
            service.SetPresetCatalog(
            [
                new FilterPresetSnapshot
                {
                    Name = "Tag test",
                    FilterState = System.Text.Json.JsonSerializer.SerializeToElement(new
                    {
                        selectedTags = new[] { "TagA" },
                        excludedTags = new[] { "TagA" }
                    })
                }
            ]);

            Assert.True(service.RenameTagInPresetCatalogOnly("TagA", "TagB"));
            var presets = service.GetPresetCatalogSnapshot();
            var preset = Assert.Single(presets);
            var raw = preset.FilterState.GetRawText();
            Assert.Contains("TagB", raw, StringComparison.Ordinal);
            Assert.DoesNotContain("TagA", raw, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(appDataPath))
            {
                Directory.Delete(appDataPath, recursive: true);
            }
        }
    }
}
