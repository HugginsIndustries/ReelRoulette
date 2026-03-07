using System;
using System.IO;
using Microsoft.AspNetCore.Http;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerAuthRegressionTests
{
    [Fact]
    public async Task Middleware_ShouldAllowOptionsPreflight_WhenAuthRequired()
    {
        var options = new ServerRuntimeOptions
        {
            RequireAuth = true,
            PairingToken = "token",
            TrustLocalhost = false
        };
        var sessions = new ServerSessionStore();
        var nextCalled = false;
        var middleware = new ServerPairingAuthMiddleware(
            _ =>
            {
                nextCalled = true;
                return Task.CompletedTask;
            },
            options,
            sessions,
            CreateSettingsService(options));

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Options;
        context.Request.Path = "/api/version";

        await middleware.InvokeAsync(context);
        Assert.True(nextCalled);
    }

    [Fact]
    public async Task Middleware_ShouldAuthorizeValidSessionCookie()
    {
        var options = new ServerRuntimeOptions
        {
            RequireAuth = true,
            PairingToken = "token",
            TrustLocalhost = false,
            PairingCookieName = "rr_paired"
        };
        var sessions = new ServerSessionStore();
        var sessionId = sessions.CreateSession(DateTimeOffset.UtcNow, TimeSpan.FromHours(1));
        var nextCalled = false;
        var middleware = new ServerPairingAuthMiddleware(
            _ =>
            {
                nextCalled = true;
                return Task.CompletedTask;
            },
            options,
            sessions,
            CreateSettingsService(options));

        var context = new DefaultHttpContext();
        context.Request.Path = "/api/version";
        context.Request.Headers.Cookie = $"{options.PairingCookieName}={sessionId}";

        await middleware.InvokeAsync(context);
        Assert.True(nextCalled);
    }

    [Fact]
    public async Task Middleware_ShouldRejectControlPath_WhenControlAuthEnabled_AndRemoteUnauthed()
    {
        var options = new ServerRuntimeOptions
        {
            RequireAuth = false,
            PairingToken = null,
            TrustLocalhost = false
        };

        var settings = CreateSettingsService(options);
        settings.UpdateControlRuntimeSettings(new ControlRuntimeSettingsSnapshot
        {
            AdminAuthMode = "TokenRequired",
            AdminSharedToken = "control-token"
        });

        var sessions = new ServerSessionStore();
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

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/control/status";
        context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("192.168.1.90");
        context.Connection.LocalIpAddress = System.Net.IPAddress.Parse("192.168.1.10");

        await middleware.InvokeAsync(context);
        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
    }

    private static CoreSettingsService CreateSettingsService(ServerRuntimeOptions options)
    {
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<CoreSettingsService>();
        var tempDir = Path.Combine(Path.GetTempPath(), "rr-auth-test", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        return new CoreSettingsService(logger, options, tempDir);
    }
}
