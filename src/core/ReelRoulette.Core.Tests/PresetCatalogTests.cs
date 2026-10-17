using System.Text.Json;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The server's per-preset writes: each changes only the preset it names, keeps every preset's id, publishes
/// <c>presetCatalogChanged</c>, and lands in the catalog. No preset may hold the default filter, another preset's
/// filter, or another preset's name.
/// </summary>
public sealed class PresetCatalogTests : IDisposable
{
    private const string NightFilter = """{"favoritesMode":"only"}""";
    private const string ClipsFilter = """{"mediaTypeFilter":1,"maxDuration":"00:02:00"}""";
    private const string AnnFilter = """{"selectedTags":["Ann","Bob"]}""";

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-preset-catalog-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void CreatePreset_AddsItLast_WithItsOwnId_AndPublishesTheChange()
    {
        var state = SeededState(out var ids);
        var revision = state.GetCurrentRevision();

        var created = state.CreatePreset("  Photos  ", Filter("""{"mediaTypeFilter":2}"""), "client-1");

        Assert.Equal(PresetWriteStatus.Done, created.Status);
        Assert.False(string.IsNullOrEmpty(created.PresetId));
        Assert.DoesNotContain(created.PresetId, ids);
        Assert.Equal(
            Describe([.. ids.Select((id, index) => (id, Names[index], Filters[index])), (created.PresetId!, "Photos", """{"mediaTypeFilter":2}""")]),
            Describe(state));
        Assert.Equal([(created.PresetId, "client-1")], PresetEvents(state, revision));
        Assert.Equal(Describe(state), Describe(Restarted()));
    }

    [Fact]
    public void UpdatePresetFilter_ChangesOnlyThatPresetsFilter()
    {
        var state = SeededState(out var ids);
        var revision = state.GetCurrentRevision();

        var updated = state.UpdatePresetFilter(ids[1], Filter("""{"mediaTypeFilter":1}"""), "client-1");

        Assert.Equal(PresetWriteStatus.Done, updated.Status);
        Assert.Equal(
            Describe([(ids[0], "Night", NightFilter), (ids[1], "Clips", """{"mediaTypeFilter":1}"""), (ids[2], "Ann", AnnFilter)]),
            Describe(state));
        Assert.Equal([(ids[1], "client-1")], PresetEvents(state, revision));
        Assert.Equal(Describe(state), Describe(Restarted()));
    }

    [Fact]
    public void UpdatePresetFilter_TakesThePresetsOwnFilter()
    {
        var state = SeededState(out var ids);

        // The same tags in another case and order are the same filter.
        var updated = state.UpdatePresetFilter(ids[2], Filter("""{"selectedTags":["bob","ann"]}"""), null);

        Assert.Equal(PresetWriteStatus.Done, updated.Status);
    }

    [Fact]
    public void RenamePreset_ChangesOnlyItsName_KeepingItsId()
    {
        var state = SeededState(out var ids);
        var revision = state.GetCurrentRevision();

        Assert.Equal(PresetWriteStatus.Done, state.RenamePreset(ids[0], " Late ", "client-1").Status);
        // A preset may take its own name in another case.
        Assert.Equal(PresetWriteStatus.Done, state.RenamePreset(ids[1], "CLIPS", "client-2").Status);

        Assert.Equal(
            Describe([(ids[0], "Late", NightFilter), (ids[1], "CLIPS", ClipsFilter), (ids[2], "Ann", AnnFilter)]),
            Describe(state));
        Assert.Equal([(ids[0], "client-1"), (ids[1], "client-2")], PresetEvents(state, revision));
        Assert.Equal(Describe(state), Describe(Restarted()));
    }

    [Fact]
    public void ReorderPresets_ChangesOnlyTheOrder()
    {
        var state = SeededState(out var ids);
        var revision = state.GetCurrentRevision();

        var reordered = state.ReorderPresets([ids[2], ids[0], ids[1]], "client-1");

        Assert.Equal(PresetWriteStatus.Done, reordered.Status);
        Assert.Equal(
            Describe([(ids[2], "Ann", AnnFilter), (ids[0], "Night", NightFilter), (ids[1], "Clips", ClipsFilter)]),
            Describe(state));
        Assert.Equal([((string?)null, "client-1")], PresetEvents(state, revision));
        Assert.Equal(Describe(state), Describe(Restarted()));
    }

    [Fact]
    public void ReorderPresets_RefusesAnOrderThatDoesNotNameEveryPresetOnce()
    {
        var state = SeededState(out var ids);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        foreach (var order in new[] { [ids[1], ids[0]], [ids[0], ids[1], ids[2], "other"], [ids[0], ids[0], ids[1]], new List<string>() })
        {
            Assert.Equal(PresetWriteStatus.OrderMismatch, state.ReorderPresets(order, null).Status);
        }

        Assert.Equal(PresetWriteStatus.OrderMismatch, state.ReorderPresets(null, null).Status);
        AssertUnchanged(state, before, revision);
    }

    [Fact]
    public void DeletePreset_RemovesOnlyThatPreset()
    {
        var state = SeededState(out var ids);
        var revision = state.GetCurrentRevision();

        Assert.Equal(PresetWriteStatus.Done, state.DeletePreset(ids[1], "client-1").Status);

        Assert.Equal(Describe([(ids[0], "Night", NightFilter), (ids[2], "Ann", AnnFilter)]), Describe(state));
        Assert.Equal([(ids[1], "client-1")], PresetEvents(state, revision));
        Assert.Equal(Describe(state), Describe(Restarted()));

        // A preset created after a delete still goes last.
        var created = state.CreatePreset("Photos", Filter("""{"mediaTypeFilter":2}"""), null);
        Assert.Equal(["Night", "Ann", "Photos"], Restarted().GetPresetCatalogSnapshot().Select(preset => preset.Name));
        Assert.Equal(created.PresetId, state.GetPresetCatalogSnapshot()[^1].Id);
    }

    [Fact]
    public void WritesToAPresetThatIsNotThere_AreRefused()
    {
        var state = SeededState(out _);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        foreach (var id in new[] { "missing", "", null })
        {
            Assert.Equal(PresetWriteStatus.NotFound, state.UpdatePresetFilter(id, Filter("""{"mediaTypeFilter":2}"""), null).Status);
            Assert.Equal(PresetWriteStatus.NotFound, state.RenamePreset(id, "Other", null).Status);
            Assert.Equal(PresetWriteStatus.NotFound, state.DeletePreset(id, null).Status);
        }

        AssertUnchanged(state, before, revision);
    }

    // The catalog lacks a preset the server holds, as a failed catalog write the server logged and went on from leaves
    // it. A write to that preset changes no catalog row, so it is reported as not saved, warned of in last.log, and
    // changes nothing, rather than being lost at the next restart.
    [Fact]
    public void WritesTheCatalogDoesNotTake_AreNotSaved_AndChangeNothing()
    {
        var log = new ServerLogService(_tempDir);
        var state = SeededState(out var ids, log);
        Assert.True(CatalogOpen.Host(_tempDir).Session.DeletePreset(ids[1]));
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        PresetWriteResult[] results =
        [
            state.UpdatePresetFilter(ids[1], Filter("""{"mediaTypeFilter":2}"""), null),
            state.RenamePreset(ids[1], "Other", null),
            state.ReorderPresets([ids[2], ids[1], ids[0]], null),
            state.DeletePreset(ids[1], null)
        ];

        Assert.All(results, result => Assert.Equal(PresetWriteStatus.NotSaved, result.Status));
        Assert.Equal(before, Describe(state));
        Assert.Empty(PresetEvents(state, revision));
        var warnings = File.ReadLines(Path.Combine(_tempDir, "last.log")).Where(line => line.Contains("[warn]", StringComparison.Ordinal)).ToList();
        Assert.Equal(4, warnings.Count);
        Assert.All(warnings, line => Assert.Contains("was not saved", line, StringComparison.Ordinal));
    }

    [Fact]
    public void CreateAndUpdate_RefuseTheDefaultFilter()
    {
        var state = SeededState(out var ids);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        // A missing filter state and null are the default filter, and so is one whose only entry is a category's AND mode.
        JsonElement?[] defaults =
        [
            null,
            Filter("null"),
            Filter("{}"),
            Filter("""{"favoritesMode":"off","blacklistedMode":"excluded","globalMatchMode":true}"""),
            Filter("""{"categoryLocalMatchModes":{"people":0}}""")
        ];
        foreach (var filter in defaults)
        {
            Assert.Equal(PresetWriteStatus.DefaultFilter, state.CreatePreset("Everything", filter, null).Status);
            Assert.Equal(PresetWriteStatus.DefaultFilter, state.UpdatePresetFilter(ids[0], filter, null).Status);
        }

        AssertUnchanged(state, before, revision);
    }

    [Fact]
    public void CreateAndUpdate_RefuseAnotherPresetsFilter_NamingThatPreset()
    {
        var state = SeededState(out var ids);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        // The same tags in another case and order, with a leftover AND mode, are Ann's filter.
        var annAgain = Filter("""{"selectedTags":["bob","ANN"],"categoryLocalMatchModes":{"people":0},"globalMatchMode":null}""");
        var created = state.CreatePreset("Ann again", annAgain, null);
        var updated = state.UpdatePresetFilter(ids[0], annAgain, null);

        foreach (var refused in new[] { created, updated })
        {
            Assert.Equal(PresetWriteStatus.FilterTaken, refused.Status);
            Assert.Equal("Preset \"Ann\" already has this filter.", refused.Error);
        }

        AssertUnchanged(state, before, revision);
    }

    [Fact]
    public void CreateAndRename_RefuseAnotherPresetsName_IgnoringCase()
    {
        var state = SeededState(out var ids);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        var created = state.CreatePreset(" night ", Filter("""{"mediaTypeFilter":2}"""), null);
        var renamed = state.RenamePreset(ids[1], "NIGHT", null);
        foreach (var refused in new[] { created, renamed })
        {
            Assert.Equal(PresetWriteStatus.NameTaken, refused.Status);
            Assert.Equal("Another preset is named \"Night\".", refused.Error);
        }

        foreach (var name in new[] { null, "", "   " })
        {
            Assert.Equal(PresetWriteStatus.NameMissing, state.CreatePreset(name, Filter("""{"mediaTypeFilter":2}"""), null).Status);
            Assert.Equal(PresetWriteStatus.NameMissing, state.RenamePreset(ids[1], name, null).Status);
        }

        AssertUnchanged(state, before, revision);
    }

    [Fact]
    public void Create_RefusesAFilterStateThatIsNotAnObject()
    {
        var state = SeededState(out _);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        Assert.Equal(PresetWriteStatus.FilterNotValid, state.CreatePreset("List", Filter("[1]"), null).Status);

        AssertUnchanged(state, before, revision);
    }

    [Fact]
    public void WholeListReplace_KeepsEachPresetsIdByItsName()
    {
        var state = SeededState(out var ids);

        state.SetPresetCatalog(
        [
            new FilterPresetSnapshot { Name = "ann", FilterState = Filter(AnnFilter) },
            new FilterPresetSnapshot { Name = "Photos", FilterState = Filter("""{"mediaTypeFilter":2}""") },
            new FilterPresetSnapshot { Name = "Night", FilterState = Filter("""{"favoritesMode":"excluded"}""") }
        ]);

        var presets = state.GetPresetCatalogSnapshot();
        Assert.Equal(["ann", "Photos", "Night"], presets.Select(preset => preset.Name));
        Assert.Equal(ids[2], presets[0].Id);
        Assert.DoesNotContain(presets[1].Id, ids);
        Assert.False(string.IsNullOrEmpty(presets[1].Id));
        Assert.Equal(ids[0], presets[2].Id);
        Assert.Equal(Describe(state), Describe(Restarted()));
    }

    // A tag rename onto another tag's name, or a tag delete, can leave presets with one filter, or with the default
    // filter. Neither is refused, and each preset keeps its id. The tag routes publish the tag catalog's change, so
    // these publish no preset change.
    [Fact]
    public void TagRenameAndDelete_LeavingPresetsWithOneFilterOrTheDefaultFilter_StillLand()
    {
        var state = SeededState(out _);
        state.SetPresetCatalog(
        [
            new FilterPresetSnapshot { Name = "Bob", FilterState = Filter("""{"selectedTags":["Bob"]}""") },
            new FilterPresetSnapshot { Name = "Robert", FilterState = Filter("""{"selectedTags":["Robert"]}""") }
        ]);
        var ids = state.GetPresetCatalogSnapshot().Select(preset => preset.Id).ToList();
        var revision = state.GetCurrentRevision();

        Assert.True(state.RenameTagInPresetCatalogOnly("bob", "Robert"));
        Assert.Equal(
            Describe([(ids[0], "Bob", """{"selectedTags":["Robert"]}"""), (ids[1], "Robert", """{"selectedTags":["Robert"]}""")]),
            Describe(state));
        Assert.Equal(Describe(state), Describe(Restarted()));

        Assert.True(state.RemoveTagFromPresetCatalogOnly("robert"));
        Assert.Equal(
            Describe([(ids[0], "Bob", """{"selectedTags":[]}"""), (ids[1], "Robert", """{"selectedTags":[]}""")]),
            Describe(state));
        Assert.Equal(Describe(state), Describe(Restarted()));
        Assert.Empty(PresetEvents(state, revision));
    }

    public void Dispose()
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private static readonly string[] Names = ["Night", "Clips", "Ann"];

    private static readonly string[] Filters = [NightFilter, ClipsFilter, AnnFilter];

    /// <summary>A server with a catalog holding Night, Clips, and Ann, in that order, and their ids.</summary>
    private ServerStateService SeededState(out List<string> ids, ServerLogService? log = null)
    {
        CatalogSeed.Write(_tempDir, presets: Names.Select((name, index) => new SeedPreset(name, Filters[index])));
        var state = Restarted(log);
        ids = state.GetPresetCatalogSnapshot().Select(preset => preset.Id).ToList();
        Assert.Equal(3, ids.Distinct(StringComparer.Ordinal).Count());
        return state;
    }

    /// <summary>A server started again on the same catalog, which reads its presets from it.</summary>
    private ServerStateService Restarted(ServerLogService? log = null)
    {
        return new ServerStateService(catalog: CatalogOpen.Host(_tempDir), serverLog: log);
    }

    private static JsonElement Filter(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static List<string> Describe(ServerStateService state)
    {
        return Describe(state.GetPresetCatalogSnapshot().Select(preset => (preset.Id, preset.Name, preset.FilterState.GetRawText())));
    }

    private static List<string> Describe(IEnumerable<(string Id, string Name, string FilterState)> presets)
    {
        return presets.Select(preset => $"{preset.Id} {preset.Name} {Compact(preset.FilterState)}").ToList();
    }

    private static string Compact(string json)
    {
        using var document = JsonDocument.Parse(json);
        return JsonSerializer.Serialize(document.RootElement);
    }

    private static List<(string? PresetId, string? ClientId)> PresetEvents(ServerStateService state, long afterRevision)
    {
        return state.GetReplayAfter(afterRevision).Events
            .Where(envelope => envelope.EventType == "presetCatalogChanged")
            .Select(envelope => (PresetCatalogChangedPayload)envelope.Payload)
            .Select(payload => (payload.PresetId, payload.ClientId))
            .ToList();
    }

    private void AssertUnchanged(ServerStateService state, List<string> before, long revision)
    {
        Assert.Equal(before, Describe(state));
        Assert.Equal(before, Describe(Restarted()));
        Assert.Empty(PresetEvents(state, revision));
    }
}
