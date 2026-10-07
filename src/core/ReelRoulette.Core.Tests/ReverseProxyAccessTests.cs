using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// Behind a reverse proxy on the server machine: the server takes the client's address, scheme, and host from the
/// proxy, a proxied request is never localhost, and the WebUI loads for a device that is not paired yet.
/// </summary>
public sealed class ReverseProxyAccessTests : IDisposable
{
    private const string ProxyHost = "box.tailnet.ts.net";
    private const string PairingToken = "api-token";

    private static readonly IPAddress TailnetClient = IPAddress.Parse("100.101.102.103");
    private static readonly IPAddress LanClient = IPAddress.Parse("192.168.1.90");
    private static readonly IPAddress ServerLanAddress = IPAddress.Parse("192.168.1.10");

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "rr-reverse-proxy-tests", Guid.NewGuid().ToString("N"));

    public ReverseProxyAccessTests()
    {
        Directory.CreateDirectory(_tempDir);
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
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    public async Task ForwardedHeaders_FromAProxyOnThisMachine_GiveTheClientAddressSchemeAndHost(string proxyAddress)
    {
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/", IPAddress.Parse(proxyAddress)));

        Assert.Equal(TailnetClient, context.Connection.RemoteIpAddress);
        Assert.Equal("https", context.Request.Scheme);
        Assert.True(context.Request.IsHttps);
        Assert.Equal(ProxyHost, context.Request.Host.Value);
    }

    [Fact]
    public async Task ForwardedHeaders_FromAnotherMachine_AreIgnored()
    {
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/", IPAddress.Parse("192.168.1.5")));

        Assert.Equal(IPAddress.Parse("192.168.1.5"), context.Connection.RemoteIpAddress);
        Assert.Equal("http", context.Request.Scheme);
        Assert.Equal("127.0.0.1:45123", context.Request.Host.Value);
    }

    [Theory]
    [InlineData("127.0.0.1", "127.0.0.1", true)]
    [InlineData("::1", "::1", true)]
    [InlineData("192.168.1.10", "192.168.1.10", true)]
    [InlineData("192.168.1.90", "192.168.1.10", false)]
    [InlineData(null, "127.0.0.1", false)]
    public void LocalRequest_IsADirectConnectionFromThisMachine(string? remote, string local, bool expected)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = remote == null ? null : IPAddress.Parse(remote);
        context.Connection.LocalIpAddress = IPAddress.Parse(local);

        Assert.Equal(expected, LocalRequest.IsLocal(context));
    }

    [Theory]
    [InlineData("X-Forwarded-For", "100.101.102.103")]
    [InlineData("X-Forwarded-For", "127.0.0.1")]
    [InlineData("X-Forwarded-For", "not-an-address")]
    [InlineData("X-Forwarded-Proto", "https")]
    [InlineData("X-Forwarded-Host", ProxyHost)]
    [InlineData("Forwarded", "for=100.101.102.103;proto=https")]
    [InlineData("X-Real-IP", "100.101.102.103")]
    public async Task LocalRequest_ThroughAProxyOnThisMachine_IsNotLocal(string header, string value)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Loopback;
        context.Connection.LocalIpAddress = IPAddress.Loopback;
        context.Request.Headers[header] = value;

        // Before and after ASP.NET applies the headers, including those that leave a loopback client address behind.
        Assert.False(LocalRequest.IsLocal(context));
        await ThroughForwardedHeadersAsync(context);
        Assert.False(LocalRequest.IsLocal(context));
    }

    [Fact]
    public async Task ApiRequest_ThroughAProxyOnThisMachine_NeedsPairingEvenWithLocalhostTrust()
    {
        var options = TokenRequired();
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/api/version", IPAddress.Loopback));

        var nextCalled = await InvokeMiddlewareAsync(context, options, new ServerSessionStore(), Settings(allowRemote: true));

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task ApiRequest_FromThisMachine_IsStillTrusted()
    {
        var context = DirectRequest("/api/version", IPAddress.Loopback);

        var nextCalled = await InvokeMiddlewareAsync(context, TokenRequired(), new ServerSessionStore(), Settings(allowRemote: false));

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task ControlRequest_ThroughAProxyOnThisMachine_NeedsTheControlToken()
    {
        var settings = Settings(allowRemote: true);
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/control/status", IPAddress.Loopback));

        var nextCalled = await InvokeMiddlewareAsync(context, new ServerRuntimeOptions(), new ServerSessionStore(), settings);

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task ControlRequest_ThroughAProxy_WithTheControlSession_IsAllowed()
    {
        var options = new ServerRuntimeOptions();
        var sessions = new ServerSessionStore();
        var sessionId = sessions.CreateSession(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow, TimeSpan.FromHours(1));
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/control/status", IPAddress.Loopback));
        context.Request.Headers.Cookie = $"{options.ControlAdminCookieName}={sessionId}";

        var nextCalled = await InvokeMiddlewareAsync(context, options, sessions, Settings(allowRemote: true));

        Assert.True(nextCalled);
    }

    [Theory]
    [InlineData("/api/version")]
    [InlineData("/control/status")]
    public async Task Request_WithNoRemoteAddress_IsNotTreatedAsLocal(string path)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;

        var nextCalled = await InvokeMiddlewareAsync(context, TokenRequired(), new ServerSessionStore(), Settings(allowRemote: true));

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    [InlineData("/manifest.webmanifest")]
    [InlineData("/sw.js")]
    [InlineData("/icons/icon-192.png")]
    [InlineData("/assets/index-abc123.js")]
    [InlineData("/HI.ico")]
    [InlineData("/runtime-config.json")]
    [InlineData("/operator")]
    public async Task WebUiFiles_LoadForADeviceThatIsNotPaired(string path)
    {
        var context = DirectRequest(path, LanClient);

        var nextCalled = await InvokeMiddlewareAsync(context, TokenRequired(), new ServerSessionStore(), Settings(allowRemote: true));

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task ApiRequest_FromADeviceThatIsNotPaired_IsStillRefused()
    {
        var context = DirectRequest("/api/library/query", LanClient);

        var nextCalled = await InvokeMiddlewareAsync(context, TokenRequired(), new ServerSessionStore(), Settings(allowRemote: true));

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("/", false)]
    [InlineData("/runtime-config.json", false)]
    [InlineData("/health", false)]
    [InlineData("/api/version", false)]
    [InlineData("/api/pair", false)]
    [InlineData("/control/pair", false)]
    [InlineData("/control/status", false)]
    [InlineData("/", true)]
    [InlineData("/api/version", true)]
    [InlineData("/control/pair", true)]
    public async Task WithRemoteConnectionsOff_EveryRequestFromAnotherDeviceIsRefused(string path, bool throughProxy)
    {
        var context = throughProxy
            ? ProxiedRequest(path, IPAddress.Loopback)
            : DirectRequest(path, LanClient);

        // The pipeline runs with pairing off, so nothing but the remote connections setting refuses the request.
        var reachedEndpoint = await InvokePipelineAsync(context, Settings(allowRemote: false));

        Assert.False(reachedEndpoint);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/api/version")]
    [InlineData("/control/status")]
    public void WithRemoteConnectionsOff_ThisMachineIsStillServed(string path)
    {
        var context = DirectRequest(path, IPAddress.Loopback);

        Assert.False(RemoteConnectionsGate.Refuses(context, Settings(allowRemote: false)));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void WithRemoteConnectionsOn_AnotherDeviceIsServed(bool throughProxy)
    {
        var context = throughProxy
            ? ProxiedRequest("/", IPAddress.Loopback)
            : DirectRequest("/", LanClient);

        Assert.False(RemoteConnectionsGate.Refuses(context, Settings(allowRemote: true)));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task WithRemoteConnectionsOff_APreflightFromAnotherDeviceIsRefused(bool throughProxy)
    {
        var context = throughProxy
            ? ProxiedRequest("/api/library/query", IPAddress.Loopback)
            : DirectRequest("/api/library/query", LanClient);
        context.Request.Method = HttpMethods.Options;
        context.Request.Headers.Origin = $"https://{ProxyHost}";
        context.Request.Headers.AccessControlRequestMethod = HttpMethods.Post;

        var reachedEndpoint = await InvokePipelineAsync(context, Settings(allowRemote: false));

        Assert.False(reachedEndpoint);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
    }

    [Fact]
    public async Task WithRemoteConnectionsOn_ADeviceStillNeedsTheControlTokenForControlRoutes()
    {
        var context = DirectRequest("/control/status", LanClient);

        var nextCalled = await InvokeMiddlewareAsync(context, new ServerRuntimeOptions(), new ServerSessionStore(), Settings(allowRemote: true));

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task RuntimeConfig_ThroughAProxy_UsesTheProxysHttpsAddress_AndWithholdsThePairingToken()
    {
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/runtime-config.json", IPAddress.Loopback));

        var config = WebRuntimeConfig.Build(context, TokenRequired(), new WebRuntimeSettingsSnapshot(), new ServerSessionStore());

        Assert.Equal($"https://{ProxyHost}", config.ApiBaseUrl);
        Assert.Equal($"https://{ProxyHost}/api/events", config.SseUrl);
        Assert.Null(config.PairToken);
    }

    [Fact]
    public void RuntimeConfig_ForADeviceThatIsNotPaired_HasNoPairingToken()
    {
        var context = DirectRequest("/runtime-config.json", LanClient);
        context.Request.Host = new HostString("192.168.1.10:45123");

        var config = WebRuntimeConfig.Build(context, TokenRequired(), new WebRuntimeSettingsSnapshot(), new ServerSessionStore());

        Assert.Equal("http://192.168.1.10:45123", config.ApiBaseUrl);
        Assert.Null(config.PairToken);
    }

    [Fact]
    public void RuntimeConfig_ForThisMachine_HasThePairingToken()
    {
        var context = DirectRequest("/runtime-config.json", IPAddress.Loopback);

        var config = WebRuntimeConfig.Build(context, TokenRequired(), new WebRuntimeSettingsSnapshot(), new ServerSessionStore());

        Assert.Equal(PairingToken, config.PairToken);
    }

    [Fact]
    public void RuntimeConfig_ForAPairedDevice_HasThePairingToken()
    {
        var options = TokenRequired();
        var sessions = new ServerSessionStore();
        var sessionId = sessions.CreateSession(DateTimeOffset.UtcNow, TimeSpan.FromHours(1));
        var context = DirectRequest("/runtime-config.json", LanClient);
        context.Request.Headers.Cookie = $"{options.PairingCookieName}={sessionId}";

        var config = WebRuntimeConfig.Build(context, options, new WebRuntimeSettingsSnapshot(), sessions);

        Assert.Equal(PairingToken, config.PairToken);
    }

    [Fact]
    public void RuntimeConfig_WithAuthModeOff_HasNoPairingToken()
    {
        var context = DirectRequest("/runtime-config.json", IPAddress.Loopback);

        var config = WebRuntimeConfig.Build(context, TokenRequired(), new WebRuntimeSettingsSnapshot { AuthMode = "Off" }, new ServerSessionStore());

        Assert.Null(config.PairToken);
    }

    [Fact]
    public async Task Pairing_ThroughAnHttpsProxy_SetsASecureCookie()
    {
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/api/pair", IPAddress.Loopback));

        ServerHostComposition.HandlePairRequest(context, PairingToken, TokenRequired(), new ServerSessionStore());

        var setCookie = context.Response.Headers.SetCookie.ToString();
        Assert.StartsWith("rr_paired=", setCookie);
        Assert.Contains("secure", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Pairing_OverPlainHttp_SetsACookieWithoutSecure()
    {
        var context = DirectRequest("/api/pair", LanClient);

        ServerHostComposition.HandlePairRequest(context, PairingToken, TokenRequired(), new ServerSessionStore());

        var setCookie = context.Response.Headers.SetCookie.ToString();
        Assert.StartsWith("rr_paired=", setCookie);
        Assert.DoesNotContain("secure", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ControlTokenChange_ThroughAProxyOnThisMachine_GivesTheCallerAFreshCookie()
    {
        var settings = Settings(allowRemote: true);
        var options = new ServerRuntimeOptions();
        var sessions = new ServerSessionStore();
        var caller = sessions.CreateSession(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow, TimeSpan.FromHours(1));
        var context = await ThroughForwardedHeadersAsync(ProxiedRequest("/control/settings", IPAddress.Loopback));
        context.RequestServices = new ServiceCollection().AddSingleton(new ServerLogService(_tempDir)).BuildServiceProvider();
        context.Request.Headers.Cookie = $"{options.ControlAdminCookieName}={caller}";

        ServerHostComposition.UpdateControlSettings(
            context,
            new ControlRuntimeSettingsSnapshot { AdminSharedToken = "new-control-token" },
            options,
            settings,
            sessions);

        // A local caller gets no cookie, so this shows the proxied caller was treated as another device.
        Assert.StartsWith($"{options.ControlAdminCookieName}=", context.Response.Headers.SetCookie.ToString());
    }

    [Fact]
    public void Cors_AcceptsAConfiguredHttpsOrigin()
    {
        using var registry = new DynamicCorsOriginRegistry(new ServerRuntimeOptions
        {
            CorsAllowedOrigins = [$"https://{ProxyHost}"]
        });

        Assert.True(registry.IsAllowed($"https://{ProxyHost}"));
        Assert.True(registry.IsAllowed($"https://{ProxyHost}:443"));
        Assert.False(registry.IsAllowed($"http://{ProxyHost}"));
        Assert.False(registry.IsAllowed($"ftp://{ProxyHost}"));
    }

    [Theory]
    [InlineData("http://localhost:45123", "http://localhost:45123", "https://localhost:45123")]
    [InlineData("https://localhost:45123", "https://localhost:45123", "http://localhost:45123")]
    public void Cors_BuildsTheServersOwnOriginsWithTheSchemeItListensOn(string listenUrl, string allowed, string refused)
    {
        using var registry = new DynamicCorsOriginRegistry(new ServerRuntimeOptions { ListenUrl = listenUrl, CorsAllowedOrigins = [] });
        registry.Start(Settings(allowRemote: false), NullLogger.Instance);

        Assert.True(registry.IsAllowed(allowed));
        Assert.False(registry.IsAllowed(refused));
    }

    [Fact]
    public void ForwardedHeadersFromAnotherMachine_WarnOncePerAddressInLastLog()
    {
        var forwarding = new ProxyForwarding(new ServerLogService(_tempDir));
        var fromLan = () => ProxiedRequest("/", IPAddress.Parse("192.168.1.5"));

        forwarding.WarnIfUntrusted(fromLan());
        forwarding.WarnIfUntrusted(fromLan());
        forwarding.WarnIfUntrusted(ProxiedRequest("/", IPAddress.Loopback));
        forwarding.WarnIfUntrusted(DirectRequest("/", LanClient));

        var lines = File.ReadAllLines(Path.Combine(_tempDir, "last.log"));
        var line = Assert.Single(lines);
        Assert.Contains("[server] [warn] Ignored proxy headers from 192.168.1.5", line);
    }

    private static ServerRuntimeOptions TokenRequired()
    {
        return new ServerRuntimeOptions { RequireAuth = true, PairingToken = PairingToken, TrustLocalhost = true };
    }

    private CoreSettingsService Settings(bool allowRemote)
    {
        var directory = Path.Combine(_tempDir, Guid.NewGuid().ToString("N"));
        var settings = new CoreSettingsService(new ServerRuntimeOptions(), directory);
        settings.UpdateWebRuntimeSettings(new WebRuntimeSettingsSnapshot { BindOnLan = allowRemote });
        return settings;
    }

    private static DefaultHttpContext DirectRequest(string path, IPAddress remote)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
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
        context.Request.Method = HttpMethods.Get;
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("127.0.0.1:45123");
        context.Request.Path = path;
        context.Request.Headers["X-Forwarded-For"] = TailnetClient.ToString();
        context.Request.Headers["X-Forwarded-Proto"] = "https";
        context.Request.Headers["X-Forwarded-Host"] = ProxyHost;
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

    // Every step before an endpoint, in the server's order, with a CORS policy that accepts the origin.
    private async Task<bool> InvokePipelineAsync(DefaultHttpContext context, CoreSettingsService settings)
    {
        var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton(new ServerLogService(_tempDir))
            .AddSingleton(settings)
            .AddSingleton(new ServerSessionStore())
            .AddSingleton<ApiTelemetryService>()
            .AddSingleton<OperatorTestingService>()
            .AddCors(cors => cors.AddPolicy(
                ServerHostComposition.WebClientCorsPolicyName,
                policy => policy.SetIsOriginAllowed(_ => true).AllowAnyMethod().AllowAnyHeader().AllowCredentials()))
            .BuildServiceProvider();
        var app = new ApplicationBuilder(services);
        ServerHostComposition.UseRequestPipeline(app, new ServerRuntimeOptions());
        var reachedEndpoint = false;
        app.Run(_ =>
        {
            reachedEndpoint = true;
            return Task.CompletedTask;
        });

        context.RequestServices = services;
        await app.Build()(context);
        return reachedEndpoint;
    }

    private static async Task<bool> InvokeMiddlewareAsync(
        DefaultHttpContext context,
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        CoreSettingsService settings)
    {
        var nextCalled = false;
        var middleware = new ServerPairingAuthMiddleware(
            _ =>
            {
                nextCalled = true;
                return Task.CompletedTask;
            },
            options,
            sessions,
            settings);
        await middleware.InvokeAsync(context);
        return nextCalled;
    }
}
