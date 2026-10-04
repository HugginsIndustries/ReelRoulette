using System.Net;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Auth;

public sealed class ServerPairingAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ServerRuntimeOptions _options;
    private readonly ServerSessionStore _sessions;
    private readonly CoreSettingsService _settings;

    public ServerPairingAuthMiddleware(
        RequestDelegate next,
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        CoreSettingsService settings)
    {
        _next = next;
        _options = options;
        _sessions = sessions;
        _settings = settings;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var isControlPath = context.Request.Path.StartsWithSegments("/control");
        if (isControlPath)
        {
            await AuthorizeControlPlaneAsync(context);
            return;
        }

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

        if (IsAuthorized(context, _options.PairingCookieName, _options.PairingToken, ServerSessionStore.ApiScope, allowQueryToken: true))
        {
            await _next(context);
            return;
        }

        // A control session also covers API requests, so the Operator can read them from another machine.
        if (HasValidSession(context, _options.ControlAdminCookieName, ServerSessionStore.ControlScope))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
    }

    private async Task AuthorizeControlPlaneAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/control/pair"))
        {
            await _next(context);
            return;
        }

        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        if (IsLocalRequest(context))
        {
            await _next(context);
            return;
        }

        if (!_settings.GetWebRuntimeSettings().BindOnLan)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = "Forbidden. Control-plane LAN access is disabled." });
            return;
        }

        // Every non-localhost control request needs the control token; there is no off switch for the LAN.
        var controlSettings = _settings.GetControlRuntimeSettings();
        // The control token is never accepted in a query, so it stays out of URLs and request logs.
        if (IsAuthorized(context, _options.ControlAdminCookieName, controlSettings.AdminSharedToken, ServerSessionStore.ControlScope, allowQueryToken: false))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
    }

    private bool HasValidSession(HttpContext context, string cookieName, string scope)
    {
        return context.Request.Cookies.TryGetValue(cookieName, out var cookieValue) &&
               _sessions.IsSessionValid(scope, cookieValue, DateTimeOffset.UtcNow);
    }

    private bool IsAuthorized(HttpContext context, string cookieName, string? expectedToken, string scope, bool allowQueryToken)
    {
        if (HasValidSession(context, cookieName, scope))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(expectedToken))
        {
            return false;
        }

        if (!_options.AllowLegacyTokenAuth)
        {
            return false;
        }

        var authHeader = context.Request.Headers.Authorization.ToString();
        if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            if (string.Equals(token, expectedToken, StringComparison.Ordinal))
            {
                return true;
            }
        }

        if (!allowQueryToken)
        {
            return false;
        }

        var queryToken = context.Request.Query["token"].ToString();
        return !string.IsNullOrEmpty(queryToken) &&
               string.Equals(queryToken, expectedToken, StringComparison.Ordinal);
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
