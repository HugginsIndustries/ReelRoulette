using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerDataPathsTests
{
    [Fact]
    public void Resolve_WithoutOverride_ShouldUseTheOperatingSystemFolders()
    {
        Assert.Equal(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette"),
            ServerDataPaths.ResolveDataDirectory(null));
        Assert.Equal(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette", "thumbnails"),
            ServerDataPaths.ResolveThumbnailDirectory(null));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Resolve_WithBlankOverride_ShouldUseTheOperatingSystemFolders(string overrideDirectory)
    {
        Assert.Equal(ServerDataPaths.ResolveDataDirectory(null), ServerDataPaths.ResolveDataDirectory(overrideDirectory));
        Assert.Equal(ServerDataPaths.ResolveThumbnailDirectory(null), ServerDataPaths.ResolveThumbnailDirectory(overrideDirectory));
    }

    [Fact]
    public void Resolve_WithOverride_ShouldPutDataAndThumbnailsUnderIt()
    {
        var overrideDirectory = Path.Combine(Path.GetTempPath(), "reelroulette-data-override");

        Assert.Equal(overrideDirectory, ServerDataPaths.ResolveDataDirectory(overrideDirectory));
        Assert.Equal(Path.Combine(overrideDirectory, "thumbnails"), ServerDataPaths.ResolveThumbnailDirectory(overrideDirectory));
    }

    [Fact]
    public void Resolve_WithRelativeOverride_ShouldReturnAFullPath()
    {
        var expected = Path.GetFullPath("relative-data");

        Assert.Equal(expected, ServerDataPaths.ResolveDataDirectory("relative-data"));
        Assert.Equal(Path.Combine(expected, "thumbnails"), ServerDataPaths.ResolveThumbnailDirectory("relative-data"));
    }
}

[CollectionDefinition(nameof(ProcessEnvironmentCollection), DisableParallelization = true)]
public sealed class ProcessEnvironmentCollection;

/// <summary>Changes the process environment, so it runs apart from parallel tests.</summary>
[Collection(nameof(ProcessEnvironmentCollection))]
public sealed class ServerDataFolderOverrideTests : IDisposable
{
    private readonly string _dataDirectory = Path.Combine(Path.GetTempPath(), "reelroulette-data-override-tests", Guid.NewGuid().ToString("N"));

    public ServerDataFolderOverrideTests()
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

    [Fact]
    public void DataDirectory_ShouldReadTheEnvironmentVariable()
    {
        Assert.Equal(_dataDirectory, ServerDataPaths.DataDirectory());
        Assert.Equal(Path.Combine(_dataDirectory, "thumbnails"), ServerDataPaths.ThumbnailDirectory());
        Assert.Equal(Path.Combine(_dataDirectory, "thumbnails"), LibraryCatalogHost.LocalThumbnailDirectory());
    }

    [Fact]
    public async Task ServerComposition_WithOverride_ShouldWriteOnlyUnderTheOverride()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(new ServerRuntimeOptions());
        services.AddReelRouletteServer();

        await using (var provider = services.BuildServiceProvider())
        {
            var catalog = provider.GetRequiredService<LibraryCatalogHost>();
            provider.GetRequiredService<ServerStateService>();
            var settings = provider.GetRequiredService<CoreSettingsService>();
            provider.GetRequiredService<LibraryPlaybackService>();
            provider.GetRequiredService<RefreshPipelineService>();
            var operations = provider.GetRequiredService<LibraryOperationsService>();
            var logs = provider.GetRequiredService<ServerLogService>();

            settings.UpdateBackupSettings(new BackupSettingsSnapshot
            {
                Enabled = true,
                MinimumBackupGapMinutes = 0,
                NumberOfBackups = 2
            });
            settings.UpdateRefreshSettings(settings.GetRefreshSettings());
            operations.AppendClientLog(new ClientLogRequest { Message = "data folder override test" });

            var hostedServices = provider.GetServices<IHostedService>().ToList();
            foreach (var hosted in hostedServices)
            {
                await hosted.StartAsync(CancellationToken.None);
            }

            foreach (var hosted in hostedServices)
            {
                await hosted.StopAsync(CancellationToken.None);
            }

            Assert.Equal(Path.Combine(_dataDirectory, "library.db"), catalog.Session.DatabasePath);
            Assert.Equal(Path.Combine(_dataDirectory, "last.log"), logs.Read(10, null, null).SourcePath);
        }

        Assert.True(File.Exists(Path.Combine(_dataDirectory, "library.db")));
        Assert.True(File.Exists(Path.Combine(_dataDirectory, "core-settings.json")));
        Assert.NotEmpty(Directory.GetFiles(Path.Combine(_dataDirectory, "backups"), "core-settings.json.backup.*"));
        Assert.Contains("data folder override test", File.ReadAllText(Path.Combine(_dataDirectory, "last.log")));

        // On Linux the test run points ApplicationData and LocalApplicationData at these folders,
        // so a server lookup that skipped the override would leave a ReelRoulette folder here.
        if (OperatingSystem.IsLinux())
        {
            Assert.False(Directory.Exists(Path.Combine(TestIsolation.XdgConfigHome, "ReelRoulette")));
            Assert.False(Directory.Exists(Path.Combine(TestIsolation.XdgDataHome, "ReelRoulette")));
        }
    }
}
