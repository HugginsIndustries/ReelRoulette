using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// With a catalog it cannot use, the server keeps running without a library: no backup, no refresh,
/// and library routes answer 503 with the reason.
/// </summary>
public sealed class LibraryUnavailableServerTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "rr-no-library-" + Guid.NewGuid().ToString("N"));

    public LibraryUnavailableServerTests()
    {
        Directory.CreateDirectory(_root);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public async Task RefreshPipeline_WithoutALibrary_NeitherRunsOnItsScheduleNorStartsManually()
    {
        var dataDirectory = Path.Combine(_root, "data");
        CatalogSeed.WriteAtVersion(dataDirectory, LibraryCatalogStore.SchemaVersion + 1);
        var catalog = LibraryCatalogHost.Open(dataDirectory);
        var settings = new CoreSettingsService(
            new ServerRuntimeOptions { AutoRefreshEnabled = true, AutoRefreshIntervalMinutes = 15 },
            dataDirectory);
        var refresh = new RefreshPipelineService(
            new ServerStateService(),
            NullLogger<RefreshPipelineService>.Instance,
            settings,
            catalog,
            dataDirectory);
        var nextAutoRun = typeof(RefreshPipelineService).GetField("_nextAutoRunUtc", BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(nextAutoRun);
        nextAutoRun!.SetValue(refresh, DateTimeOffset.UtcNow.AddMinutes(-1));

        // Called directly, the loop's first scheduled check runs before its first await, so a run that
        // was going to start has already been reserved when the call returns.
        var executeAsync = typeof(RefreshPipelineService).GetMethod("ExecuteAsync", BindingFlags.NonPublic | BindingFlags.Instance);
        Assert.NotNull(executeAsync);
        using var stopping = new CancellationTokenSource();
        var loop = (Task)executeAsync!.Invoke(refresh, [stopping.Token])!;
        try
        {
            Assert.False(loop.IsFaulted, loop.Exception?.ToString());
            var status = refresh.GetStatus();
            Assert.False(status.IsRunning);
            Assert.Null(status.RunId);

            var manual = refresh.TryStartManual();
            Assert.False(manual.Accepted);
            Assert.Equal(LibraryCatalogStore.NewerMessage, manual.Message);
            Assert.Null(refresh.GetStatus().RunId);
        }
        finally
        {
            stopping.Cancel();
            await loop.ContinueWith(static _ => { }, TaskScheduler.Default);
        }
    }

    [Fact]
    public void Gate_WithoutALibrary_RefusesLibraryRoutesAndPassesTheRest()
    {
        var catalog = OpenWithoutLibrary("newer");
        var expectedOpen = new SortedSet<string>(StringComparer.Ordinal)
        {
            "GET /api/pair",
            "POST /api/pair",
            "GET /api/version",
            "GET /api/capabilities",
            "GET /api/web-runtime/settings",
            "POST /api/web-runtime/settings",
            "GET /api/backup/settings",
            "POST /api/backup/settings",
            "GET /api/refresh/settings",
            "POST /api/refresh/settings",
            "POST /api/logs/client"
        };

        var open = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var operation in OpenApiSpec.ReadOperations())
        {
            var refusal = LibraryRouteGate.Refusal(RequestPath(operation), catalog);
            if (refusal == null)
            {
                open.Add(operation);
                continue;
            }

            Assert.StartsWith("/api/", operation.Split(' ')[1], StringComparison.Ordinal);
            Assert.Equal(LibraryCatalogStore.NewerMessage, refusal.Error);
            Assert.Equal("library_newer", refusal.Code);
        }

        var expected = new SortedSet<string>(
            OpenApiSpec.ReadOperations().Where(operation => !operation.Split(' ')[1].StartsWith("/api/", StringComparison.Ordinal)),
            StringComparer.Ordinal);
        expected.UnionWith(expectedOpen);
        Assert.Equal(expected, open);

        // openapi.yaml documents the 503 on exactly the routes the gate refuses.
        var refused = new SortedSet<string>(OpenApiSpec.ReadOperations().Except(open), StringComparer.Ordinal);
        Assert.Equal(refused, OpenApiSpec.ReadOperationsWithResponse("503"));
        Assert.NotNull(LibraryRouteGate.Refusal(new PathString("/API/Library/Query"), catalog));
        Assert.NotNull(LibraryRouteGate.Refusal(new PathString("/api/versions"), catalog));
        Assert.Null(LibraryRouteGate.Refusal(new PathString("/operator"), catalog));
        Assert.Null(LibraryRouteGate.Refusal(new PathString("/"), catalog));
    }

    [Theory]
    [InlineData("newer", "library_newer", LibraryCatalogStore.NewerMessage)]
    [InlineData("damaged", "library_damaged", LibraryCatalogStore.RefusedMessage)]
    [InlineData("missing", "library_missing", LibraryCatalogStore.MissingMessage)]
    [InlineData("unreadable", "library_unreadable", LibraryCatalogStore.UnreadableMessage)]
    public void Gate_RefusalCarriesTheReason(string state, string code, string message)
    {
        var catalog = OpenWithoutLibrary(state);

        var refusal = LibraryRouteGate.Refusal(new PathString("/api/library/query"), catalog);

        Assert.NotNull(refusal);
        Assert.Equal(code, refusal!.Code);
        Assert.Equal(message, refusal.Error);
        Assert.False(catalog.HasLibrary);
        Assert.Equal(state, catalog.StateName);
        Assert.Equal(message, catalog.UnavailableMessage);
        Assert.Equal(message, Assert.Throws<InvalidOperationException>(() => catalog.Session).Message);
    }

    [Fact]
    public void Gate_WithALibrary_PassesEveryRoute()
    {
        var dataDirectory = Path.Combine(_root, "ready");
        CatalogSeed.Write(dataDirectory);
        var catalog = LibraryCatalogHost.Open(dataDirectory);

        Assert.True(catalog.HasLibrary);
        Assert.Equal("ready", catalog.StateName);
        Assert.Null(catalog.UnavailableMessage);
        foreach (var operation in OpenApiSpec.ReadOperations())
        {
            Assert.Null(LibraryRouteGate.Refusal(RequestPath(operation), catalog));
        }
    }

    private LibraryCatalogHost OpenWithoutLibrary(string state)
    {
        var dataDirectory = Path.Combine(_root, state);
        Directory.CreateDirectory(dataDirectory);
        switch (state)
        {
            case "newer":
                CatalogSeed.WriteAtVersion(dataDirectory, LibraryCatalogStore.SchemaVersion + 1);
                break;
            case "damaged":
                File.WriteAllText(Path.Combine(dataDirectory, "library.db"), "not a database");
                break;
            case "missing":
                CatalogSeed.WriteAtVersion(Path.Combine(dataDirectory, "backups"), LibraryCatalogStore.SchemaVersion, "library.db.backup.2026-10-01_10-00-00", standalone: true);
                break;
            case "unreadable":
                using (CatalogSeed.HoldUnreadable(CatalogSeed.WriteAtVersion(dataDirectory, LibraryCatalogStore.SchemaVersion + 1)))
                {
                    return LibraryCatalogHost.Open(dataDirectory);
                }
        }

        return LibraryCatalogHost.Open(dataDirectory);
    }

    private static PathString RequestPath(string operation)
    {
        var template = operation.Split(' ')[1];
        return new PathString(System.Text.RegularExpressions.Regex.Replace(template, @"\{[^}]+\}", "x"));
    }
}

/// <summary>Points the server data folder at a temporary folder, so it runs apart from parallel tests.</summary>
[Collection(nameof(ProcessEnvironmentCollection))]
public sealed class LibraryUnavailableCompositionTests : IDisposable
{
    private readonly string _dataDirectory = Path.Combine(Path.GetTempPath(), "rr-no-library-composition", Guid.NewGuid().ToString("N"));

    public LibraryUnavailableCompositionTests()
    {
        Environment.SetEnvironmentVariable(ServerDataPaths.DataDirectoryVariable, _dataDirectory);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable(ServerDataPaths.DataDirectoryVariable, TestIsolation.DataDirectory);
        try
        {
            Directory.Delete(_dataDirectory, recursive: true);
        }
        catch
        {
            // Best effort; the directory lives under the temp folder.
        }
    }

    [Theory]
    [InlineData("newer")]
    [InlineData("damaged")]
    public async Task ServerComposition_WithoutAUsableCatalog_RunsWithoutALibraryOnEveryStart(string state)
    {
        Directory.CreateDirectory(_dataDirectory);
        File.WriteAllText(
            Path.Combine(_dataDirectory, "core-settings.json"),
            """{"backup":{"enabled":true,"minimumBackupGapMinutes":1,"numberOfBackups":1}}""");
        var backups = Path.Combine(_dataDirectory, "backups");
        var oldBackup = CatalogSeed.WriteAtVersion(backups, LibraryCatalogStore.SchemaVersion, "library.db.backup.2026-10-01_10-00-00", standalone: true);
        File.SetCreationTimeUtc(oldBackup, DateTime.UtcNow.AddDays(-2));
        File.SetLastWriteTimeUtc(oldBackup, DateTime.UtcNow.AddDays(-2));
        CatalogSeed.WriteAtVersion(backups, LibraryCatalogStore.SchemaVersion + 1, "library.db.backup.2026-10-02_10-00-00", standalone: true);
        var expectedStatus = LibraryCatalogOpenStatus.Newer;
        var expectedMessage = LibraryCatalogStore.NewerMessage;
        if (state == "newer")
        {
            CatalogSeed.WriteAtVersion(_dataDirectory, LibraryCatalogStore.SchemaVersion + 1, items: [new SeedItem("item-1", "/clips/a.mp4")]);
        }
        else
        {
            File.WriteAllText(Path.Combine(_dataDirectory, "library.db"), "not a database");
            expectedStatus = LibraryCatalogOpenStatus.Refused;
            expectedMessage = LibraryCatalogStore.RefusedMessage;
        }

        var before = CatalogFiles();

        await StartAndStopAsync(expectedStatus, expectedMessage);
        var afterFirst = CatalogFiles();
        await StartAndStopAsync(expectedStatus, expectedMessage);

        if (state == "newer")
        {
            Assert.Equal(before, afterFirst);
        }
        else
        {
            Assert.False(afterFirst.ContainsKey("library.db"));
            Assert.Equal(before["library.db"], afterFirst["library.db.refused"]);
            Assert.Equal(
                before.Where(file => file.Key != "library.db"),
                afterFirst.Where(file => file.Key != "library.db.refused"));
        }

        Assert.Equal(afterFirst, CatalogFiles());
        var log = File.ReadAllText(Path.Combine(_dataDirectory, "last.log"));
        Assert.Contains("[warn] " + expectedMessage, log, StringComparison.Ordinal);
    }

    private async Task StartAndStopAsync(LibraryCatalogOpenStatus expectedStatus, string expectedMessage)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(new ServerRuntimeOptions());
        services.AddReelRouletteServer();

        await using var provider = services.BuildServiceProvider();
        var catalog = provider.GetRequiredService<LibraryCatalogHost>();
        Assert.False(catalog.HasLibrary);
        Assert.Equal(expectedStatus, catalog.Status);
        Assert.Equal(expectedMessage, catalog.UnavailableMessage);
        provider.GetRequiredService<ServerStateService>();
        provider.GetRequiredService<LibraryOperationsService>();
        var refresh = provider.GetRequiredService<RefreshPipelineService>();

        var hostedServices = provider.GetServices<IHostedService>().ToList();
        Assert.Contains(refresh, hostedServices);
        foreach (var hosted in hostedServices)
        {
            await hosted.StartAsync(CancellationToken.None);
        }

        Assert.False(refresh.TryStartManual().Accepted);
        foreach (var hosted in hostedServices)
        {
            await hosted.StopAsync(CancellationToken.None);
        }

        LibraryCatalogBackup.WaitForPending();
    }

    /// <summary>The catalog files in the data folder and the catalog backups, with their content hashes.</summary>
    private SortedDictionary<string, string> CatalogFiles()
    {
        var files = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var (path, hash) in FolderSnapshot.Take(_dataDirectory))
        {
            if (path.StartsWith("library.db", StringComparison.Ordinal) ||
                path.StartsWith("backups/library.db", StringComparison.Ordinal))
            {
                files[path] = hash;
            }
        }

        return files;
    }
}
