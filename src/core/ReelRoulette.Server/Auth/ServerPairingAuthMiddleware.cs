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

        // Only /api routes need pairing. The WebUI's files and runtime config load for every caller, so a device that
        // is not paired reaches the pairing prompt, and the browser gets the manifest, which it fetches without cookies.
        if (!context.Request.Path.StartsWithSegments("/api") ||
            context.Request.Path.StartsWithSegments("/api/pair") ||
            HttpMethods.IsOptions(context.Request.Method) ||
            IsApiRequestAuthorized(context, _options, _sessions))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
    }

    /// <summary>
    /// Whether a request may use <c>/api</c> routes: pairing is off, the request comes straight from this machine
    /// with localhost trust on, or it carries a pairing session, the pairing token, or a control session.
    /// </summary>
    public static bool IsApiRequestAuthorized(HttpContext context, ServerRuntimeOptions options, ServerSessionStore sessions)
    {
        if (!options.RequireAuth || string.IsNullOrEmpty(options.PairingToken))
        {
            return true;
        }

        if (options.TrustLocalhost && LocalRequest.IsLocal(context))
        {
            return true;
        }

        if (IsAuthorized(context, options, sessions, options.PairingCookieName, options.PairingToken, ServerSessionStore.ApiScope, allowQueryToken: true))
        {
            return true;
        }

        // A control session also covers API requests, so the Operator can read them from another machine.
        return HasValidSession(context, sessions, options.ControlAdminCookieName, ServerSessionStore.ControlScope);
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

        if (LocalRequest.IsLocal(context))
        {
            await _next(context);
            return;
        }

        // Every non-localhost control request needs the control token; there is no off switch for other devices.
        var controlSettings = _settings.GetControlRuntimeSettings();
        // The control token is never accepted in a query, so it stays out of URLs and request logs.
        if (IsAuthorized(context, _options, _sessions, _options.ControlAdminCookieName, controlSettings.AdminSharedToken, ServerSessionStore.ControlScope, allowQueryToken: false))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
    }

    private static bool HasValidSession(HttpContext context, ServerSessionStore sessions, string cookieName, string scope)
    {
        return context.Request.Cookies.TryGetValue(cookieName, out var cookieValue) &&
               sessions.IsSessionValid(scope, cookieValue, DateTimeOffset.UtcNow);
    }

    private static bool IsAuthorized(
        HttpContext context,
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        string cookieName,
        string? expectedToken,
        string scope,
        bool allowQueryToken)
    {
        if (HasValidSession(context, sessions, cookieName, scope))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(expectedToken))
        {
            return false;
        }

        if (!options.AllowLegacyTokenAuth)
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
}
