using Microsoft.AspNetCore.Http;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Hosting;
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
            sessions);

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
            sessions);

        var context = new DefaultHttpContext();
        context.Request.Path = "/api/version";
        context.Request.Headers.Cookie = $"{options.PairingCookieName}={sessionId}";

        await middleware.InvokeAsync(context);
        Assert.True(nextCalled);
    }
}
