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

        if (IsAuthorized(context, _options.PairingCookieName, _options.PairingToken, ServerSessionStore.ApiScope))
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

        var controlSettings = _settings.GetControlRuntimeSettings();
        var authMode = NormalizeControlAuthMode(controlSettings.AdminAuthMode);
        if (!string.Equals(authMode, "TokenRequired", StringComparison.Ordinal))
        {
            await _next(context);
            return;
        }

        if (IsAuthorized(context, _options.ControlAdminCookieName, controlSettings.AdminSharedToken, ServerSessionStore.ControlScope))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
    }

    private bool IsAuthorized(HttpContext context, string cookieName, string? expectedToken, string scope)
    {
        if (context.Request.Cookies.TryGetValue(cookieName, out var cookieValue) &&
            _sessions.IsSessionValid(scope, cookieValue, DateTimeOffset.UtcNow))
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

    private static string NormalizeControlAuthMode(string? value)
    {
        return string.Equals(value, "TokenRequired", StringComparison.OrdinalIgnoreCase)
            ? "TokenRequired"
            : "Off";
    }
}
