using System.Text.Json;
using Microsoft.AspNetCore.Http;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The per-preset routes: each answers a write with the preset as written, a refusal with its status and the server's
/// reason, and a write the catalog doesn't take with 500. Their bodies and the preset event match openapi.yaml.
/// </summary>
public sealed class PresetRouteTests : IDisposable
{
    private const string AnnFilter = """{"selectedTags":["Ann","Bob"]}""";

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-preset-route-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void PresetRoutes_AnswerWithThePresetAsWritten_AndTheirBodiesAndEventsMatchTheSpec()
    {
        var state = SeededState(out var ids);
        var revision = state.GetCurrentRevision();
        var create = Request<CreatePresetRequest>("""{"name":" Photos ","filterState":{"mediaTypeFilter":2},"clientId":"client-1"}""");
        var update = Request<UpdatePresetFilterRequest>("""{"filterState":{"mediaTypeFilter":1},"clientId":"client-1"}""");
        var rename = Request<RenamePresetRequest>("""{"name":"Late","clientId":"client-1"}""");
        var delete = Request<DeletePresetRequest>("""{"clientId":"client-1"}""");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(create), "CreatePresetRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(update), "UpdatePresetFilterRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(rename), "RenamePresetRequest");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(delete), "DeletePresetRequest");

        var created = Written(ServerHostComposition.CreatePreset(create, state));
        Assert.DoesNotContain(created.Id, ids);
        Assert.Equal(("Photos", """{"mediaTypeFilter":2}"""), (created.Name, Compact(created.FilterState)));
        var updated = Written(ServerHostComposition.UpdatePreset(ids[1], update, state));
        Assert.Equal((ids[1], "Clips", """{"mediaTypeFilter":1}"""), (updated.Id, updated.Name, Compact(updated.FilterState)));
        var renamed = Written(ServerHostComposition.RenamePreset(ids[0], rename, state));
        Assert.Equal((ids[0], "Late", """{"favoritesMode":"only"}"""), (renamed.Id, renamed.Name, Compact(renamed.FilterState)));

        var reorder = Request<ReorderPresetsRequest>(
            JsonSerializer.Serialize(new { presetIds = new[] { created.Id, ids[2], ids[1], ids[0] }, clientId = "client-2" }));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(reorder), "ReorderPresetsRequest");
        Assert.Equal(StatusCodes.Status200OK, Status(ServerHostComposition.ReorderPresets(reorder, state)));
        Assert.Equal(StatusCodes.Status200OK, Status(ServerHostComposition.DeletePreset(ids[2], delete, state)));
        // A delete may send no body, and names no client.
        Assert.Equal(StatusCodes.Status200OK, Status(ServerHostComposition.DeletePreset(created.Id, null, state)));

        Assert.Equal([ids[1], ids[0]], state.GetPresetCatalogSnapshot().Select(preset => preset.Id));
        var events = PresetEvents(state, revision);
        Assert.Equal(
            [(created.Id, "client-1"), (ids[1], "client-1"), (ids[0], "client-1"), (null, "client-2"), (ids[2], "client-1"), (created.Id, null)],
            events.Select(payload => (payload.PresetId, payload.ClientId)));
        Assert.All(events, payload => OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(payload), "PresetCatalogChangedPayload"));
    }

    [Fact]
    public void PresetRoutes_AnswerARefusalWithItsStatusAndTheServersReason()
    {
        var state = SeededState(out var ids);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        // The default filter is 400, and another preset's filter 409, naming that preset.
        Assert.Equal((400, "A preset can't hold the default filter."), Refusal(Create(state, "Everything", "{}")));
        Assert.Equal((400, "A preset can't hold the default filter."), Refusal(Update(state, ids[0], "{}")));
        Assert.Equal((409, "Preset \"Ann\" already has this filter."), Refusal(Create(state, "Ann again", AnnFilter)));
        Assert.Equal((409, "Preset \"Ann\" already has this filter."), Refusal(Update(state, ids[0], AnnFilter)));

        // Another preset's name, ignoring case, is 409, and an empty name 400.
        Assert.Equal((409, "Another preset is named \"Night\"."), Refusal(Create(state, "night", """{"mediaTypeFilter":2}""")));
        Assert.Equal((409, "Another preset is named \"Night\"."), Refusal(Rename(state, ids[1], "NIGHT")));
        Assert.Equal((400, "A preset needs a name."), Refusal(Create(state, " ", """{"mediaTypeFilter":2}""")));
        Assert.Equal((400, "A preset needs a name."), Refusal(Rename(state, ids[1], " ")));

        // A filter state that isn't an object is 400.
        Assert.Equal((400, "filterState must be an object"), Refusal(Create(state, "List", "[1]")));

        // An id no preset has is 404, and a preset's name is not its id.
        IResult[] unknown =
        [
            Update(state, "Night", """{"mediaTypeFilter":2}"""),
            Rename(state, "Night", "Other"),
            ServerHostComposition.DeletePreset("Night", null, state)
        ];
        Assert.All(unknown, result => Assert.Equal((404, "That preset no longer exists."), Refusal(result)));

        // An order that doesn't name every preset once is 409.
        Assert.Equal((409, "The presets changed since they were loaded."), Refusal(Reorder(state, ids[0], ids[1])));
        Assert.Equal((409, "The presets changed since they were loaded."), Refusal(Reorder(state, ids[0], ids[1], ids[1])));

        Assert.Equal(before, Describe(state));
        Assert.Empty(PresetEvents(state, revision));
    }

    // The catalog lacks a preset the server holds, as a failed catalog write the server logged and went on from leaves
    // it, so a write to that preset changes no catalog row.
    [Fact]
    public void UpdateRenameReorderAndDelete_Answer500WithTheServersReason_ForAWriteTheCatalogDoesNotTake()
    {
        var log = new ServerLogService(_tempDir);
        var state = SeededState(out var ids, log);
        Assert.True(CatalogOpen.Host(_tempDir).Session.DeletePreset(ids[1]));
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        IResult[] results =
        [
            Update(state, ids[1], """{"mediaTypeFilter":2}"""),
            Rename(state, ids[1], "Other"),
            Reorder(state, ids[2], ids[1], ids[0]),
            ServerHostComposition.DeletePreset(ids[1], null, state)
        ];

        Assert.All(results, result => Assert.Equal((500, "The server couldn't write to the library."), Refusal(result)));
        Assert.Equal(before, Describe(state));
        Assert.Empty(PresetEvents(state, revision));
        Assert.Equal(4, Warnings().Count);
    }

    // Another write holds the catalog past the preset write's busy timeout, so the write throws. Create goes through the
    // same path as the other writes, so it and one of them stand for all five.
    [Fact]
    public void CreateAndUpdate_Answer500WithTheServersReason_WhenTheCatalogWriteThrows()
    {
        var log = new ServerLogService(_tempDir);
        var state = SeededState(out var ids, log);
        var before = Describe(state);
        var revision = state.GetCurrentRevision();

        IResult[] results;
        using (CatalogSeed.HoldWriteLock(Path.Combine(_tempDir, LibraryCatalogStore.DatabaseFileName)))
        {
            results =
            [
                Create(state, "Photos", """{"mediaTypeFilter":2}"""),
                Update(state, ids[1], """{"mediaTypeFilter":2}""")
            ];
        }

        Assert.All(results, result => Assert.Equal((500, "The server couldn't write to the library."), Refusal(result)));
        Assert.Equal(before, Describe(state));
        Assert.Equal(before, Describe(Restarted()));
        Assert.Empty(PresetEvents(state, revision));
        var warnings = Warnings();
        Assert.Equal(2, warnings.Count);
        Assert.All(warnings, line => Assert.Contains("was not saved: SQLite Error 5", line, StringComparison.Ordinal));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    /// <summary>A server with a catalog holding Night, Clips, and Ann, in that order, and their ids.</summary>
    private ServerStateService SeededState(out List<string> ids, ServerLogService? log = null)
    {
        CatalogSeed.Write(
            _tempDir,
            presets:
            [
                new SeedPreset("Night", """{"favoritesMode":"only"}"""),
                new SeedPreset("Clips", """{"mediaTypeFilter":1,"maxDuration":"00:02:00"}"""),
                new SeedPreset("Ann", AnnFilter)
            ]);
        var state = Restarted(log);
        ids = state.GetPresetCatalogSnapshot().Select(preset => preset.Id).ToList();
        return state;
    }

    private ServerStateService Restarted(ServerLogService? log = null)
    {
        return new ServerStateService(catalog: CatalogOpen.Host(_tempDir), serverLog: log);
    }

    private static IResult Create(ServerStateService state, string name, string filterState)
    {
        return ServerHostComposition.CreatePreset(
            Request<CreatePresetRequest>(JsonSerializer.Serialize(new { name, filterState = JsonSerializer.Deserialize<JsonElement>(filterState) })),
            state);
    }

    private static IResult Update(ServerStateService state, string presetId, string filterState)
    {
        return ServerHostComposition.UpdatePreset(
            presetId,
            Request<UpdatePresetFilterRequest>(JsonSerializer.Serialize(new { filterState = JsonSerializer.Deserialize<JsonElement>(filterState) })),
            state);
    }

    private static IResult Rename(ServerStateService state, string presetId, string name)
    {
        return ServerHostComposition.RenamePreset(presetId, new RenamePresetRequest { Name = name }, state);
    }

    private static IResult Reorder(ServerStateService state, params string[] presetIds)
    {
        return ServerHostComposition.ReorderPresets(new ReorderPresetsRequest { PresetIds = [.. presetIds] }, state);
    }

    /// <summary>The preset a write answered with, checked against the spec's PresetResponse.</summary>
    private static PresetResponse Written(IResult result)
    {
        Assert.Equal(StatusCodes.Status200OK, Status(result));
        var preset = Assert.IsType<PresetResponse>(Assert.IsAssignableFrom<IValueHttpResult>(result).Value);
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(preset), "PresetResponse");
        return preset;
    }

    private static int? Status(IResult result)
    {
        return Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode;
    }

    private static (int? Status, string? Error) Refusal(IResult result)
    {
        return (Status(result), OpenApiSpec.ErrorReason(result));
    }

    private static T Request<T>(string json)
    {
        return JsonSerializer.Deserialize<T>(json, OpenApiSpec.ServerJsonOptions)!;
    }

    private static string Compact(JsonElement? json)
    {
        return json == null ? "null" : JsonSerializer.Serialize(json.Value);
    }

    private static List<string> Describe(ServerStateService state)
    {
        return state.GetPresetCatalogSnapshot().Select(preset => $"{preset.Id} {preset.Name} {Compact(preset.FilterState)}").ToList();
    }

    private static List<PresetCatalogChangedPayload> PresetEvents(ServerStateService state, long afterRevision)
    {
        return state.GetReplayAfter(afterRevision).Events
            .Where(envelope => envelope.EventType == "presetCatalogChanged")
            .Select(envelope => (PresetCatalogChangedPayload)envelope.Payload)
            .ToList();
    }

    private List<string> Warnings()
    {
        return File.ReadLines(Path.Combine(_tempDir, "last.log")).Where(line => line.Contains("[warn]", StringComparison.Ordinal)).ToList();
    }
}
