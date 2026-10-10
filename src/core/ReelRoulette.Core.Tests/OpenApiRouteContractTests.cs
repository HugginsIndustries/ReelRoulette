using System.Text.RegularExpressions;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class OpenApiRouteContractTests : IDisposable
{
    // Routes the server serves that are not part of the API contract: the WebUI shell and its runtime config.
    // The Operator UI page is mapped from a configured path rather than a literal, so the scan never sees it.
    private static readonly string[] ServerOnlyRoutes =
    [
        "GET /",
        "GET /runtime-config.json"
    ];

    private static readonly Regex RouteMapping = new(
        @"\.Map(Get|Post|Put|Patch|Delete)\(\s*""([^""]+)""",
        RegexOptions.Compiled);

    private static readonly Regex FilterFieldRead = new(
        @"\(element, ""([^""]+)""",
        RegexOptions.Compiled);

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-openapi-contract-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void Spec_ListsEveryMappedApiAndControlRoute()
    {
        var mapped = ReadMappedRoutes();
        Assert.Contains("GET /api/version", mapped);
        Assert.Contains("POST /control/startup", mapped);

        var expected = new SortedSet<string>(mapped.Except(ServerOnlyRoutes), StringComparer.Ordinal);
        var specified = OpenApiSpec.ReadOperations();

        var missingFromSpec = expected.Except(specified).ToList();
        var notServed = specified.Except(expected).ToList();
        Assert.True(
            missingFromSpec.Count == 0 && notServed.Count == 0,
            $"Missing from openapi.yaml: [{string.Join(", ", missingFromSpec)}]. In openapi.yaml but not served: [{string.Join(", ", notServed)}].");
    }

    [Fact]
    public void FilterStateSchema_NamesEveryFieldTheParserReads()
    {
        var read = ReadFilterParserFields();
        Assert.Contains("favoritesOnly", read);
        Assert.Contains("categoryLocalMatchModes", read);

        var specified = OpenApiSpec.ReadSchemaProperties("FilterState");

        var missingFromSpec = read.Except(specified).ToList();
        var notRead = specified.Except(read).ToList();
        Assert.True(
            missingFromSpec.Count == 0 && notRead.Count == 0,
            $"Read by the filter parser but missing from FilterState: [{string.Join(", ", missingFromSpec)}]. In FilterState but not read: [{string.Join(", ", notRead)}].");
    }

    [Fact]
    public void ControlStatus_ResponseMatchesSpec()
    {
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(new ControlStatusResponse()), "ControlStatusResponse");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(new ControlStatusResponse
            {
                LibraryState = "newer",
                LibraryMessage = ReelRoulette.Core.Library.LibraryCatalogStore.NewerMessage
            }),
            "ControlStatusResponse");
    }

    [Fact]
    public void BackupSettings_ResponseMatchesSpec()
    {
        var settings = CreateSettingsService();

        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(settings.GetBackupSettings()), "BackupSettingsSnapshot");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(settings.UpdateBackupSettings(new BackupSettingsSnapshot { NumberOfBackups = 3 })),
            "BackupSettingsSnapshot");
    }

    [Fact]
    public void WebRuntimeSettings_ResponseMatchesSpec()
    {
        var settings = CreateSettingsService();

        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(settings.GetWebRuntimeSettings()), "WebRuntimeSettingsSnapshot");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(settings.UpdateWebRuntimeSettings(new WebRuntimeSettingsSnapshot { SharedToken = "token" })),
            "WebRuntimeSettingsSnapshot");
    }

    [Fact]
    public void RefreshSettings_ResponseMatchesSpec()
    {
        var settings = CreateSettingsService();

        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(settings.GetRefreshSettings()), "RefreshSettingsSnapshot");
        OpenApiSpec.AssertMatchesSchema(
            OpenApiSpec.SerializeAsServer(settings.UpdateRefreshSettings(new RefreshSettingsSnapshot { ForceRescanLoudness = true })),
            "RefreshSettingsSnapshot");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private CoreSettingsService CreateSettingsService()
    {
        Directory.CreateDirectory(_tempDir);
        return new CoreSettingsService(new ServerRuntimeOptions(), _tempDir);
    }

    // Scans only literal MapGet/MapPost-style calls in ServerHostComposition.cs and ServerApp/Program.cs.
    // Routes mapped in other files, from constants, or through route groups are not checked.
    private static SortedSet<string> ReadMappedRoutes()
    {
        var sources = new[]
        {
            OpenApiSpec.RepoPath("src", "core", "ReelRoulette.Server", "Hosting", "ServerHostComposition.cs"),
            OpenApiSpec.RepoPath("src", "core", "ReelRoulette.ServerApp", "Program.cs")
        };

        var routes = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var source in sources)
        {
            foreach (Match match in RouteMapping.Matches(File.ReadAllText(source)))
            {
                routes.Add($"{match.Groups[1].Value.ToUpperInvariant()} {match.Groups[2].Value}");
            }
        }

        return routes;
    }

    // Scans the field names LibraryListFilterParser reads, which it passes beside the JSON element, as in
    // Bool(element, "favoritesOnly", false). A read written any other way is not seen.
    private static SortedSet<string> ReadFilterParserFields()
    {
        var source = OpenApiSpec.RepoPath("src", "core", "ReelRoulette.Server", "Services", "LibraryListFilterParser.cs");
        var fields = new SortedSet<string>(StringComparer.Ordinal);
        foreach (Match match in FilterFieldRead.Matches(File.ReadAllText(source)))
        {
            fields.Add(match.Groups[1].Value);
        }

        return fields;
    }
}
