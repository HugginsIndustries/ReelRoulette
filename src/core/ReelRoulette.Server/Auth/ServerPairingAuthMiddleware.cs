using System.Net;
using ReelRoulette.Server.Hosting;

namespace ReelRoulette.Server.Auth;

public sealed class ServerPairingAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ServerRuntimeOptions _options;
    private readonly ServerSessionStore _sessions;

    public ServerPairingAuthMiddleware(RequestDelegate next, ServerRuntimeOptions options, ServerSessionStore sessions)
    {
        _next = next;
        _options = options;
        _sessions = sessions;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.RequireAuth || string.IsNullOrEmpty(_options.PairingToken))
        {
            await _next(context);
            return;
        }

        if (context.Request.Path.StartsWithSegments("/health") ||
            context.Request.Path.StartsWithSegments("/api/pair"))
        {
            await _next(context);
            return;
        }

        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        if (_options.TrustLocalhost && IsLocalRequest(context))
        {
            await _next(context);
            return;
        }

        if (IsAuthorized(context))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
    }

    private bool IsAuthorized(HttpContext context)
    {
        if (context.Request.Cookies.TryGetValue(_options.PairingCookieName, out var cookieValue) &&
            _sessions.IsSessionValid(cookieValue, DateTimeOffset.UtcNow))
        {
            return true;
        }

        if (!_options.AllowLegacyTokenAuth)
        {
            return false;
        }

        var authHeader = context.Request.Headers.Authorization.ToString();
        if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            if (string.Equals(token, _options.PairingToken, StringComparison.Ordinal))
            {
                return true;
            }
        }

        var queryToken = context.Request.Query["token"].ToString();
        return !string.IsNullOrEmpty(queryToken) &&
               string.Equals(queryToken, _options.PairingToken, StringComparison.Ordinal);
    }

    private static bool IsLocalRequest(HttpContext context)
    {
        var remote = context.Connection.RemoteIpAddress;
        if (remote is null)
        {
            return true;
        }

        return IPAddress.IsLoopback(remote) ||
               remote.Equals(context.Connection.LocalIpAddress);
    }
}
