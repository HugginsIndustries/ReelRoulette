using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.DependencyInjection;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ControlTokenTests : IDisposable
{
    private const string SavedOffSettings = """
        {
          "webRuntime": { "enabled": true, "port": 45123, "bindOnLan": true },
          "controlRuntime": { "adminAuthMode": "Off", "adminSharedToken": null }
        }
        """;

    private static readonly IPAddress LanClient = IPAddress.Parse("192.168.1.90");
    private static readonly IPAddress ServerLanAddress = IPAddress.Parse("192.168.1.10");

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "rr-control-token-tests", Guid.NewGuid().ToString("N"));

    public ControlTokenTests()
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

    [Fact]
    public async Task NonLocalControlRequest_WithOffSaved_IsUnauthorized()
    {
        var settings = CreateSettings(SavedOffSettings);
        var options = new ServerRuntimeOptions { RequireAuth = false };

        var (nextCalled, context) = await InvokeMiddleware(options, new ServerSessionStore(), settings, "/control/status", LanClient);

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task NonLocalControlRequest_WithControlSession_IsAllowed()
    {
        var settings = CreateSettings(SavedOffSettings);
        var options = new ServerRuntimeOptions { RequireAuth = false };
        var sessions = new ServerSessionStore();
        var sessionId = sessions.CreateSession(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow, TimeSpan.FromHours(1));

        var (nextCalled, _) = await InvokeMiddleware(
            options,
            sessions,
            settings,
            "/control/stop",
            LanClient,
            context => context.Request.Headers.Cookie = $"{options.ControlAdminCookieName}={sessionId}");

        Assert.True(nextCalled);
    }

    [Fact]
    public async Task NonLocalControlRequest_WithBearerToken_IsAllowed_AndWithWrongTokenIsNot()
    {
        var settings = CreateSettings(SavedOffSettings);
        var token = settings.GetControlRuntimeSettings().AdminSharedToken;
        var options = new ServerRuntimeOptions { RequireAuth = false };

        var (allowed, _) = await InvokeMiddleware(
            options,
            new ServerSessionStore(),
            settings,
            "/control/settings",
            LanClient,
            context => context.Request.Headers.Authorization = $"Bearer {token}");
        var (refused, refusedContext) = await InvokeMiddleware(
            options,
            new ServerSessionStore(),
            settings,
            "/control/settings",
            LanClient,
            context => context.Request.Headers.Authorization = "Bearer wrong-token");

        Assert.True(allowed);
        Assert.False(refused);
        Assert.Equal(StatusCodes.Status401Unauthorized, refusedContext.Response.StatusCode);
    }

    [Fact]
    public async Task ControlSession_AuthorizesNonLocalApiRequests_WhenApiPairingIsRequired()
    {
        var settings = CreateSettings(SavedOffSettings);
        var options = new ServerRuntimeOptions { RequireAuth = true, PairingToken = "api-token", TrustLocalhost = true };
        var sessions = new ServerSessionStore();
        var sessionId = sessions.CreateSession(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow, TimeSpan.FromHours(1));

        var (withControlSession, _) = await InvokeMiddleware(
            options,
            sessions,
            settings,
            "/api/version",
            LanClient,
            context => context.Request.Headers.Cookie = $"{options.ControlAdminCookieName}={sessionId}");
        var (withoutSession, context) = await InvokeMiddleware(options, sessions, settings, "/api/version", LanClient);

        Assert.True(withControlSession);
        Assert.False(withoutSession);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    public async Task LocalhostTestingRoutes_WorkWithoutTheToken(string address)
    {
        var settings = CreateSettings(SavedOffSettings);
        var options = new ServerRuntimeOptions { RequireAuth = true, PairingToken = "api-token" };
        var testing = new OperatorTestingService();
        var local = IPAddress.Parse(address);

        var (updatePassed, _) = await InvokeMiddleware(options, new ServerSessionStore(), settings, "/control/testing/update", local);
        var (resetPassed, _) = await InvokeMiddleware(options, new ServerSessionStore(), settings, "/control/testing/reset", local);
        var update = ServerHostComposition.UpdateTesting(new OperatorTestingUpdateRequest { TestingModeEnabled = true }, testing);
        var reset = ServerHostComposition.ResetTesting(testing);

        Assert.True(updatePassed);
        Assert.True(resetPassed);
        Assert.Equal(StatusCodes.Status200OK, Assert.IsAssignableFrom<IStatusCodeHttpResult>(update).StatusCode);
        Assert.Equal(StatusCodes.Status200OK, Assert.IsAssignableFrom<IStatusCodeHttpResult>(reset).StatusCode);
        Assert.True(testing.GetSnapshot().TestingModeEnabled);
    }

    [Fact]
    public async Task NonLocalTestingRoute_WithoutTheToken_IsUnauthorized()
    {
        var settings = CreateSettings(SavedOffSettings);
        var options = new ServerRuntimeOptions { RequireAuth = false };

        var (nextCalled, context) = await InvokeMiddleware(options, new ServerSessionStore(), settings, "/control/testing/reset", LanClient);

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public void Start_WithNoControlToken_GeneratesAndSavesOne()
    {
        var first = CreateSettings(null);
        var token = first.GetControlRuntimeSettings().AdminSharedToken;

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.Equal(32, token!.Length);
        Assert.Equal("TokenRequired", first.GetControlRuntimeSettings().AdminAuthMode);
        Assert.Equal(token, ReadSavedControlRuntime().GetProperty("adminSharedToken").GetString());

        var reloaded = new CoreSettingsService(new ServerRuntimeOptions(), _tempDir);
        Assert.Equal(token, reloaded.GetControlRuntimeSettings().AdminSharedToken);
    }

    [Fact]
    public void Start_WithOffSaved_RewritesTokenRequiredAndGeneratesAToken()
    {
        var settings = CreateSettings(SavedOffSettings);

        var saved = ReadSavedControlRuntime();
        Assert.Equal("TokenRequired", settings.GetControlRuntimeSettings().AdminAuthMode);
        Assert.Equal("TokenRequired", saved.GetProperty("adminAuthMode").GetString());
        Assert.False(string.IsNullOrWhiteSpace(saved.GetProperty("adminSharedToken").GetString()));
    }

    [Fact]
    public void Start_WithASavedToken_KeepsIt()
    {
        var settings = CreateSettings("""
            { "controlRuntime": { "adminAuthMode": "TokenRequired", "adminSharedToken": "saved-token" } }
            """);

        Assert.Equal("saved-token", settings.GetControlRuntimeSettings().AdminSharedToken);
    }

    [Fact]
    public void UpdateControlSettings_IgnoresPostedOff_AndRejectsAnEmptyToken()
    {
        var settings = CreateSettings(null);
        var token = settings.GetControlRuntimeSettings().AdminSharedToken;

        var off = settings.UpdateControlRuntimeSettings(new ControlRuntimeSettingsSnapshot { AdminAuthMode = "Off", AdminSharedToken = token });
        var empty = settings.UpdateControlRuntimeSettings(new ControlRuntimeSettingsSnapshot { AdminAuthMode = "TokenRequired", AdminSharedToken = " " });

        Assert.True(off.Result.Accepted);
        Assert.Equal("TokenRequired", off.Settings.AdminAuthMode);
        Assert.False(empty.Result.Accepted);
        Assert.Equal(token, settings.GetControlRuntimeSettings().AdminSharedToken);
    }

    [Fact]
    public void ControlPair_WithTheToken_SetsTheAdminCookie_EvenWithOffSaved()
    {
        var settings = CreateSettings(SavedOffSettings);
        var token = settings.GetControlRuntimeSettings().AdminSharedToken;
        var options = new ServerRuntimeOptions();
        var sessions = new ServerSessionStore();
        var context = CreateContext("/control/pair", LanClient);

        var result = ServerHostComposition.HandleControlPairRequest(context, token, options, settings, sessions, new ServerLogService(_tempDir));

        Assert.Equal(StatusCodes.Status200OK, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        var setCookie = context.Response.Headers.SetCookie.ToString();
        Assert.StartsWith($"{options.ControlAdminCookieName}=", setCookie);
        var sessionId = setCookie[(options.ControlAdminCookieName.Length + 1)..].Split(';')[0];
        Assert.True(sessions.IsSessionValid(ServerSessionStore.ControlScope, sessionId, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ControlPair_WithAWrongToken_IsRefusedAndLogsTheAddressButNotTheToken()
    {
        var settings = CreateSettings(SavedOffSettings);
        var sessions = new ServerSessionStore();
        var context = CreateContext("/control/pair", LanClient);

        var result = ServerHostComposition.HandleControlPairRequest(
            context,
            "guessed-token-value",
            new ServerRuntimeOptions(),
            settings,
            sessions,
            new ServerLogService(_tempDir));

        Assert.Equal(StatusCodes.Status401Unauthorized, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal(0, context.Response.Headers.SetCookie.Count);
        Assert.Empty(sessions.GetActiveSessions(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow));
        var log = File.ReadAllText(Path.Combine(_tempDir, "last.log"));
        Assert.Contains("[server] [warn] Control pairing failed from 192.168.1.90", log);
        Assert.DoesNotContain("guessed-token-value", log);
        Assert.DoesNotContain(settings.GetControlRuntimeSettings().AdminSharedToken!, log);
    }

    [Fact]
    public void ChangingTheControlToken_EndsEveryControlSession_AndLeavesApiSessions()
    {
        var settings = CreateSettings(null);
        var sessions = new ServerSessionStore();
        var now = DateTimeOffset.UtcNow;
        var control1 = sessions.CreateSession(ServerSessionStore.ControlScope, now, TimeSpan.FromHours(1));
        var control2 = sessions.CreateSession(ServerSessionStore.ControlScope, now, TimeSpan.FromHours(1));
        var api = sessions.CreateSession(ServerSessionStore.ApiScope, now, TimeSpan.FromHours(1));

        ServerHostComposition.UpdateControlSettings(
            CreateServiceContext(),
            new ControlRuntimeSettingsSnapshot { AdminSharedToken = "new-control-token" },
            new ServerRuntimeOptions(),
            settings,
            sessions);

        Assert.False(sessions.IsSessionValid(ServerSessionStore.ControlScope, control1, DateTimeOffset.UtcNow));
        Assert.False(sessions.IsSessionValid(ServerSessionStore.ControlScope, control2, DateTimeOffset.UtcNow));
        Assert.True(sessions.IsSessionValid(ServerSessionStore.ApiScope, api, DateTimeOffset.UtcNow));
        Assert.Equal("new-control-token", settings.GetControlRuntimeSettings().AdminSharedToken);
    }

    [Fact]
    public void NonLocalTokenChange_EndsOtherControlSessions_AndGivesTheCallerAFreshCookie()
    {
        var settings = CreateSettings(null);
        var options = new ServerRuntimeOptions();
        var sessions = new ServerSessionStore();
        var now = DateTimeOffset.UtcNow;
        var caller = sessions.CreateSession(ServerSessionStore.ControlScope, now, TimeSpan.FromHours(1));
        var other = sessions.CreateSession(ServerSessionStore.ControlScope, now, TimeSpan.FromHours(1));
        var api = sessions.CreateSession(ServerSessionStore.ApiScope, now, TimeSpan.FromHours(1));
        var context = CreateServiceContext();
        context.Connection.RemoteIpAddress = LanClient;
        context.Connection.LocalIpAddress = ServerLanAddress;
        context.Request.Headers.Cookie = $"{options.ControlAdminCookieName}={caller}";

        ServerHostComposition.UpdateControlSettings(
            context,
            new ControlRuntimeSettingsSnapshot { AdminSharedToken = "new-control-token" },
            options,
            settings,
            sessions);

        Assert.False(sessions.IsSessionValid(ServerSessionStore.ControlScope, caller, DateTimeOffset.UtcNow));
        Assert.False(sessions.IsSessionValid(ServerSessionStore.ControlScope, other, DateTimeOffset.UtcNow));
        Assert.True(sessions.IsSessionValid(ServerSessionStore.ApiScope, api, DateTimeOffset.UtcNow));
        var setCookie = context.Response.Headers.SetCookie.ToString();
        Assert.StartsWith($"{options.ControlAdminCookieName}=", setCookie);
        var fresh = setCookie[(options.ControlAdminCookieName.Length + 1)..].Split(';')[0];
        Assert.NotEqual(caller, fresh);
        Assert.True(sessions.IsSessionValid(ServerSessionStore.ControlScope, fresh, DateTimeOffset.UtcNow));
        Assert.Single(sessions.GetActiveSessions(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void LocalTokenChange_SetsNoCookie()
    {
        var settings = CreateSettings(null);
        var context = CreateServiceContext();

        ServerHostComposition.UpdateControlSettings(
            context,
            new ControlRuntimeSettingsSnapshot { AdminSharedToken = "new-control-token" },
            new ServerRuntimeOptions(),
            settings,
            new ServerSessionStore());

        Assert.Equal(0, context.Response.Headers.SetCookie.Count);
    }

    [Fact]
    public async Task NonLocalControlRequest_WithTheTokenAsAQueryParameter_IsUnauthorized()
    {
        var settings = CreateSettings(SavedOffSettings);
        var token = settings.GetControlRuntimeSettings().AdminSharedToken;
        var options = new ServerRuntimeOptions { RequireAuth = false, AllowLegacyTokenAuth = true };

        var (nextCalled, context) = await InvokeMiddleware(
            options,
            new ServerSessionStore(),
            settings,
            "/control/status",
            LanClient,
            context => context.Request.QueryString = new QueryString($"?token={token}"));

        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task NonLocalApiRequest_WithThePairingTokenAsAQueryParameter_IsStillAllowed()
    {
        var settings = CreateSettings(SavedOffSettings);
        var options = new ServerRuntimeOptions { RequireAuth = true, PairingToken = "api-token", AllowLegacyTokenAuth = true };

        var (nextCalled, _) = await InvokeMiddleware(
            options,
            new ServerSessionStore(),
            settings,
            "/api/version",
            LanClient,
            context => context.Request.QueryString = new QueryString("?token=api-token"));

        Assert.True(nextCalled);
    }

    [Fact]
    public void ControlPair_WithTheTokenOnlyInTheQuery_IsRefused()
    {
        var settings = CreateSettings(SavedOffSettings);
        var token = settings.GetControlRuntimeSettings().AdminSharedToken;
        var sessions = new ServerSessionStore();
        var context = CreateContext("/control/pair", LanClient);
        context.Request.QueryString = new QueryString($"?token={token}");

        var result = ServerHostComposition.HandleControlPairRequest(
            context,
            null,
            new ServerRuntimeOptions(),
            settings,
            sessions,
            new ServerLogService(_tempDir));

        Assert.Equal(StatusCodes.Status401Unauthorized, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Empty(sessions.GetActiveSessions(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void SavingTheSameControlToken_KeepsControlSessions()
    {
        var settings = CreateSettings(null);
        var token = settings.GetControlRuntimeSettings().AdminSharedToken;
        var sessions = new ServerSessionStore();
        var control = sessions.CreateSession(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow, TimeSpan.FromHours(1));

        ServerHostComposition.UpdateControlSettings(
            CreateServiceContext(),
            new ControlRuntimeSettingsSnapshot { AdminSharedToken = token, DevChannelEnabled = true },
            new ServerRuntimeOptions(),
            settings,
            sessions);

        Assert.True(sessions.IsSessionValid(ServerSessionStore.ControlScope, control, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ServerLogAppend_WhenLastLogCannotBeWritten_DoesNotThrow()
    {
        // A folder named last.log makes the append fail with an access error rather than an IOException.
        Directory.CreateDirectory(Path.Combine(_tempDir, "last.log"));
        var logs = new ServerLogService(_tempDir);

        var thrown = Record.Exception(() => logs.Append("warn", "Control pairing failed from 192.168.1.90."));

        Assert.Null(thrown);
    }

    private CoreSettingsService CreateSettings(string? savedJson)
    {
        if (savedJson != null)
        {
            File.WriteAllText(Path.Combine(_tempDir, "core-settings.json"), savedJson);
        }

        return new CoreSettingsService(new ServerRuntimeOptions(), _tempDir);
    }

    private JsonElement ReadSavedControlRuntime()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(_tempDir, "core-settings.json")));
        return document.RootElement.GetProperty("controlRuntime").Clone();
    }

    private static DefaultHttpContext CreateContext(string path, IPAddress remote)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = path;
        context.Connection.RemoteIpAddress = remote;
        context.Connection.LocalIpAddress = IPAddress.IsLoopback(remote) ? remote : ServerLanAddress;
        return context;
    }

    private DefaultHttpContext CreateServiceContext()
    {
        var services = new ServiceCollection();
        services.AddSingleton(new ServerLogService(_tempDir));
        return new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
    }

    private static async Task<(bool NextCalled, DefaultHttpContext Context)> InvokeMiddleware(
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        CoreSettingsService settings,
        string path,
        IPAddress remote,
        Action<DefaultHttpContext>? configure = null)
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
        var context = CreateContext(path, remote);
        context.Response.Body = new MemoryStream();
        configure?.Invoke(context);

        await middleware.InvokeAsync(context);
        return (nextCalled, context);
    }
}
