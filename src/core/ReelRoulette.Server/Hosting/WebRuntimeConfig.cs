using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Hosting;

public sealed record WebRuntimeConfigResponse(string ApiBaseUrl, string SseUrl, string? PairToken);

/// <summary>
/// The WebUI's <c>/runtime-config.json</c>, which loads for every caller. Its URLs use the scheme and host the
/// caller used, which behind a proxy on this machine are the proxy's. The pairing token is included only for a
/// caller the pairing check already accepts, so a device that is not paired gets the pairing prompt.
/// </summary>
public static class WebRuntimeConfig
{
    public static WebRuntimeConfigResponse Build(
        HttpContext context,
        ServerRuntimeOptions options,
        WebRuntimeSettingsSnapshot startupWebRuntime,
        ServerSessionStore sessions)
    {
        var authModeOff = string.Equals(startupWebRuntime.AuthMode, "Off", StringComparison.OrdinalIgnoreCase);
        var pairToken = !options.RequireAuth || authModeOff || !ServerPairingAuthMiddleware.IsApiRequestAuthorized(context, options, sessions)
            ? null
            : startupWebRuntime.SharedToken ?? options.PairingToken;

        var root = $"{context.Request.Scheme}://{context.Request.Host.Value}";
        return new WebRuntimeConfigResponse(root, $"{root}/api/events", pairToken);
    }
}
