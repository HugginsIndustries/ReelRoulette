using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// Show in file manager: only a direct request from the server machine opens the file manager, by item id, and the
/// capability that offers it is listed only for such a caller while the server has a desktop to open it in.
/// </summary>
public sealed class ShowInFileManagerRouteTests : IDisposable
{
    private const string OnDiskId = "on-disk";
    private const string GoneId = "gone";

    private static readonly IPAddress TailnetClient = IPAddress.Parse("100.101.102.103");
    private static readonly IPAddress LanClient = IPAddress.Parse("192.168.1.90");
    private static readonly IPAddress ServerLanAddress = IPAddress.Parse("192.168.1.10");

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "rr-show-in-file-manager-tests", Guid.NewGuid().ToString("N"));
    private readonly string _dataDir;
    private readonly string _onDiskPath;
    private readonly LibraryCatalogHost _catalog;

    public ShowInFileManagerRouteTests()
    {
        _dataDir = Path.Combine(_tempDir, "data");
        var mediaDir = Path.Combine(_tempDir, "media");
        Directory.CreateDirectory(_dataDir);
        Directory.CreateDirectory(mediaDir);
        _onDiskPath = Path.Combine(mediaDir, "clip one.mp4");
        File.WriteAllBytes(_onDiskPath, [0x01, 0x02, 0x03]);
        CatalogSeed.Write(
            _dataDir,
            items:
            [
                new SeedItem(OnDiskId, _onDiskPath),
                new SeedItem(GoneId, Path.Combine(mediaDir, "gone.mp4"))
            ]);
        _catalog = CatalogOpen.Host(_dataDir);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_tempDir, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    [Theory]
    [InlineData("loopback")]
    [InlineData("own-address")]
    public async Task FromTheServerMachine_OpensTheFileManagerAtTheItemsFile(string caller)
    {
        var launcher = new FakeLauncher();
        var context = await RequestFromAsync(caller, launcher);

        var result = await ServerHostComposition.ShowInFileManager(context, OnDiskId, _catalog);

        Assert.Equal(StatusCodes.Status204NoContent, Status(result));
        Assert.Equal(_onDiskPath, Assert.Single(launcher.Shown));
        var line = Assert.Single(LogLines());
        Assert.Contains("[info] Show in file manager item=on-disk outcome=dbus.", line);
        Assert.DoesNotContain("clip one", line);
        Assert.DoesNotContain(_tempDir, line);
    }

    [Theory]
    [InlineData("lan")]
    [InlineData("proxied")]
    public async Task FromAnywhereElse_IsRefused_WithoutTheLauncher(string caller)
    {
        var launcher = new FakeLauncher();
        var context = await RequestFromAsync(caller, launcher);

        var result = await ServerHostComposition.ShowInFileManager(context, OnDiskId, _catalog);

        Assert.Equal((StatusCodes.Status403Forbidden, ServerHostComposition.FileManagerErrorNotLocal), Refusal(result));
        Assert.Empty(launcher.Shown);
        Assert.Contains("outcome=not-local.", Assert.Single(LogLines()));
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData(" ")]
    [InlineData("")]
    public async Task UnknownOrBlankId_IsNotFound(string itemId)
    {
        var launcher = new FakeLauncher();
        var context = await RequestFromAsync("loopback", launcher);

        var result = await ServerHostComposition.ShowInFileManager(context, itemId, _catalog);

        Assert.Equal((StatusCodes.Status404NotFound, ServerHostComposition.FileManagerErrorItemNotFound), Refusal(result));
        Assert.Equal("The file is no longer in the library.", OpenApiSpec.ErrorReason(result));
        Assert.Empty(launcher.Shown);
        Assert.Contains("outcome=not-found.", Assert.Single(LogLines()));
    }

    [Fact]
    public async Task APath_IsNotAnId()
    {
        var launcher = new FakeLauncher();
        var context = await RequestFromAsync("loopback", launcher);

        var result = await ServerHostComposition.ShowInFileManager(context, _onDiskPath, _catalog);

        Assert.Equal((StatusCodes.Status404NotFound, ServerHostComposition.FileManagerErrorItemNotFound), Refusal(result));
        Assert.Empty(launcher.Shown);
    }

    [Fact]
    public async Task FileNotOnDisk_IsReported()
    {
        var launcher = new FakeLauncher();
        var context = await RequestFromAsync("loopback", launcher);

        var result = await ServerHostComposition.ShowInFileManager(context, GoneId, _catalog);

        Assert.Equal((StatusCodes.Status404NotFound, ServerHostComposition.FileManagerErrorFileMissing), Refusal(result));
        Assert.Empty(launcher.Shown);
        Assert.Contains("outcome=file-missing.", Assert.Single(LogLines()));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task WithoutADesktop_IsUnavailable(bool registered)
    {
        var launcher = new FakeLauncher { IsAvailable = false };
        var context = await RequestFromAsync("loopback", registered ? launcher : null);

        var result = await ServerHostComposition.ShowInFileManager(context, OnDiskId, _catalog);

        Assert.Equal((StatusCodes.Status409Conflict, ServerHostComposition.FileManagerErrorUnavailable), Refusal(result));
        Assert.Empty(launcher.Shown);
        Assert.Contains("outcome=unavailable.", Assert.Single(LogLines()));
    }

    [Fact]
    public async Task LauncherFailure_IsAServerError_AndWarnsWithTheErrorType()
    {
        var launcher = new FakeLauncher
        {
            Result = FileManagerShowResult.Failed(new System.ComponentModel.Win32Exception())
        };
        var context = await RequestFromAsync("loopback", launcher);

        var result = await ServerHostComposition.ShowInFileManager(context, OnDiskId, _catalog);

        Assert.Equal((StatusCodes.Status500InternalServerError, ServerHostComposition.FileManagerErrorFailed), Refusal(result));
        Assert.Equal("No file manager on the server machine answered.", OpenApiSpec.ErrorReason(result));
        Assert.Single(launcher.Shown);
        Assert.Contains("[warn] Show in file manager item=on-disk outcome=failed error=Win32Exception.", Assert.Single(LogLines()));
    }

    [Theory]
    [InlineData("loopback", "available", true)]
    [InlineData("own-address", "available", true)]
    [InlineData("lan", "available", false)]
    [InlineData("proxied", "available", false)]
    [InlineData("loopback", "unavailable", false)]
    [InlineData("loopback", "none", false)]
    public async Task Capability_IsListedOnlyForACallerTheRouteWouldAccept(string caller, string launcherState, bool expected)
    {
        var launcher = launcherState == "none" ? null : new FakeLauncher { IsAvailable = launcherState == "available" };
        var state = new ServerStateService();
        var testing = new OperatorTestingService();

        var versionResult = ServerHostComposition.GetVersion(await RequestFromAsync(caller, launcher), state, testing, _catalog);
        var version = Assert.IsType<Ok<VersionResponse>>(versionResult).Value!;
        var capabilitiesResult = ServerHostComposition.GetCapabilities(await RequestFromAsync(caller, launcher), state, testing);
        var capabilities = OpenApiSpec.SerializeAsServer(Assert.IsAssignableFrom<IValueHttpResult>(capabilitiesResult).Value)
            .GetProperty("capabilities")
            .EnumerateArray()
            .Select(capability => capability.GetString())
            .ToList();

        Assert.Equal(expected, version.Capabilities.Contains(ServerHostComposition.ShowInFileManagerCapability));
        Assert.Equal(expected, capabilities.Contains(ServerHostComposition.ShowInFileManagerCapability));
        Assert.Contains("identity.sessionId", version.Capabilities);
        Assert.Contains("identity.sessionId", capabilities);
    }

    private async Task<DefaultHttpContext> RequestFromAsync(string caller, IFileManagerLauncher? launcher)
    {
        const string path = "/api/show-in-file-manager/x";
        var context = caller switch
        {
            "loopback" => DirectRequest(path, IPAddress.Loopback),
            "own-address" => DirectRequest(path, ServerLanAddress),
            "lan" => DirectRequest(path, LanClient),
            "proxied" => await ThroughForwardedHeadersAsync(ProxiedRequest(path, IPAddress.Loopback)),
            _ => throw new ArgumentOutOfRangeException(nameof(caller))
        };

        var services = new ServiceCollection().AddSingleton(new ServerLogService(_dataDir));
        if (launcher != null)
        {
            services.AddSingleton(launcher);
        }

        context.RequestServices = services.BuildServiceProvider();
        return context;
    }

    private string[] LogLines()
    {
        var logPath = Path.Combine(_dataDir, "last.log");
        return File.Exists(logPath) ? File.ReadAllLines(logPath) : [];
    }

    private static int? Status(IResult result)
    {
        return Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode;
    }

    private static (int? Status, string? Code) Refusal(IResult result)
    {
        var body = OpenApiSpec.SerializeAsServer(Assert.IsAssignableFrom<IValueHttpResult>(result).Value);
        return (Status(result), body.GetProperty("code").GetString());
    }

    private static DefaultHttpContext DirectRequest(string path, IPAddress remote)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("localhost:45123");
        context.Request.Path = path;
        context.Connection.RemoteIpAddress = remote;
        context.Connection.LocalIpAddress = IPAddress.IsLoopback(remote) ? remote : ServerLanAddress;
        return context;
    }

    // What `tailscale serve` sends when it connects from the proxy address to the server's local port.
    private static DefaultHttpContext ProxiedRequest(string path, IPAddress proxy)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("127.0.0.1:45123");
        context.Request.Path = path;
        context.Request.Headers["X-Forwarded-For"] = TailnetClient.ToString();
        context.Request.Headers["X-Forwarded-Proto"] = "https";
        context.Request.Headers["X-Forwarded-Host"] = "box.tailnet.ts.net";
        context.Connection.RemoteIpAddress = proxy;
        context.Connection.LocalIpAddress = IPAddress.IsLoopback(proxy) ? proxy : ServerLanAddress;
        return context;
    }

    private static async Task<DefaultHttpContext> ThroughForwardedHeadersAsync(DefaultHttpContext context)
    {
        var middleware = new ForwardedHeadersMiddleware(
            _ => Task.CompletedTask,
            NullLoggerFactory.Instance,
            Options.Create(ProxyForwarding.CreateOptions()));
        await middleware.Invoke(context);
        return context;
    }

    private sealed class FakeLauncher : IFileManagerLauncher
    {
        public bool IsAvailable { get; init; } = true;

        public FileManagerShowResult Result { get; init; } = FileManagerShowResult.Succeeded(FileManagerShowResult.ShownWithDbus);

        public List<string> Shown { get; } = [];

        public Task<FileManagerShowResult> ShowAsync(string fullPath, CancellationToken cancellationToken)
        {
            Shown.Add(fullPath);
            return Task.FromResult(Result);
        }
    }
}
