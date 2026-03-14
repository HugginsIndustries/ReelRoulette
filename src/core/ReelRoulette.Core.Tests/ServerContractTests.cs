using System;
using System.IO;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerContractTests
{
    [Fact]
    public void VersionResponse_ShouldContainApiVersion()
    {
        var response = ApiContractMapper.MapVersion(
            "1",
            assetsVersion: "0.11.0-dev",
            minimumCompatibleApiVersion: "0",
            supportedApiVersions: ["1", "0"],
            capabilities: ["identity.sessionId", "events.refreshStatusChanged", "events.resyncRequired"]);

        Assert.False(string.IsNullOrWhiteSpace(response.AppVersion));
        Assert.Equal("1", response.ApiVersion);
        Assert.Equal("0.11.0-dev", response.AssetsVersion);
        Assert.Equal("0", response.MinimumCompatibleApiVersion);
        Assert.Contains("1", response.SupportedApiVersions);
        Assert.Contains("0", response.SupportedApiVersions);
        Assert.Contains("events.refreshStatusChanged", response.Capabilities);
        Assert.Contains("events.resyncRequired", response.Capabilities);
        Assert.Contains("identity.sessionId", response.Capabilities);
    }

    [Fact]
    public void OpenApi_VersionResponse_ShouldContainCompatibilityProperties()
    {
        var openApiPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "..",
            "..",
            "shared",
            "api",
            "openapi.yaml"));
        var yaml = File.ReadAllText(openApiPath);

        Assert.Contains("VersionResponse:", yaml, StringComparison.Ordinal);
        Assert.Contains("/api/capabilities:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/restart:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/stop:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/status:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/settings:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/pair:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/logs/server:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/testing:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/testing/update:", yaml, StringComparison.Ordinal);
        Assert.Contains("/control/testing/reset:", yaml, StringComparison.Ordinal);
        Assert.Contains("minimumCompatibleApiVersion:", yaml, StringComparison.Ordinal);
        Assert.Contains("supportedApiVersions:", yaml, StringComparison.Ordinal);
        Assert.Contains("capabilities:", yaml, StringComparison.Ordinal);
    }

    [Fact]
    public void GetVersion_ShouldExposeCapabilitiesAndCompatibilityWindow()
    {
        var service = new ServerStateService();
        var version = service.GetVersion();

        Assert.Equal("1", version.ApiVersion);
        Assert.Equal("0", version.MinimumCompatibleApiVersion);
        Assert.Contains("1", version.SupportedApiVersions);
        Assert.Contains("0", version.SupportedApiVersions);
        Assert.Contains("auth.sessionCookie", version.Capabilities);
        Assert.Contains("identity.sessionId", version.Capabilities);
        Assert.Contains("events.refreshStatusChanged", version.Capabilities);
        Assert.Contains("events.resyncRequired", version.Capabilities);
        Assert.Contains("api.random.filterState", version.Capabilities);
        Assert.Contains("api.presets.match", version.Capabilities);
        Assert.Contains("control.status", version.Capabilities);
        Assert.Contains("control.settings", version.Capabilities);
        Assert.Contains("control.logs.server", version.Capabilities);
        Assert.Contains("control.testing.suite", version.Capabilities);
    }

    [Fact]
    public void CreateEnvelope_ShouldProduceMonotonicRevisions()
    {
        var service = new ServerStateService();
        var first = service.CreateEnvelope("testEvent", new { value = 1 });
        var second = service.CreateEnvelope("testEvent", new { value = 2 });

        Assert.True(second.Revision > first.Revision);
        Assert.Equal("testEvent", first.EventType);
        Assert.Equal("testEvent", second.EventType);
    }

    [Fact]
    public void ReplayAfter_ShouldReturnBufferedEventsWithoutGap()
    {
        var service = new ServerStateService();
        service.PublishExternal("itemStateChanged", new ItemStateChangedPayload
        {
            ItemId = "a",
            Path = "a.mp4",
            IsFavorite = true,
            IsBlacklisted = false
        });
        service.PublishExternal("itemStateChanged", new ItemStateChangedPayload
        {
            ItemId = "b",
            Path = "b.mp4",
            IsFavorite = false,
            IsBlacklisted = true
        });

        var replay = service.GetReplayAfter(1);
        Assert.False(replay.GapDetected);
        Assert.Single(replay.Events);
        Assert.True(replay.Events[0].Revision > 1);
    }

    [Fact]
    public void PublishExternal_ShouldIncludeCanonicalItemStatePayload()
    {
        var service = new ServerStateService();
        var envelope = service.PublishExternal("itemStateChanged", new ItemStateChangedPayload
        {
            ItemId = "movie",
            Path = "movie.mp4",
            IsFavorite = false,
            IsBlacklisted = true
        });

        Assert.Equal("itemStateChanged", envelope.EventType);
        var payload = Assert.IsType<ItemStateChangedPayload>(envelope.Payload);
        Assert.Equal("movie.mp4", payload.Path);
        Assert.False(payload.IsFavorite);
        Assert.True(payload.IsBlacklisted);
        Assert.True(envelope.Revision > 0);
    }

    [Fact]
    public void M8fPackagingScripts_AndWorkflows_ShouldExist()
    {
        var repoRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "..",
            ".."));

        Assert.True(File.Exists(Path.Combine(repoRoot, "tools", "scripts", "package-serverapp-win-portable.ps1")));
        Assert.True(File.Exists(Path.Combine(repoRoot, "tools", "scripts", "package-serverapp-win-inno.ps1")));
        Assert.True(File.Exists(Path.Combine(repoRoot, "tools", "installer", "ReelRoulette.ServerApp.iss")));
        Assert.True(File.Exists(Path.Combine(repoRoot, ".github", "workflows", "ci.yml")));
        Assert.True(File.Exists(Path.Combine(repoRoot, ".github", "workflows", "package-windows.yml")));
    }
}
