using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Auth;

/// <summary>
/// With remote connections off, only this machine is served: every request from another device is refused,
/// directly or through a proxy, whatever its path or method. It runs before CORS, so a preflight is refused too.
/// </summary>
public static class RemoteConnectionsGate
{
    public static bool Refuses(HttpContext context, CoreSettingsService settings)
    {
        return !LocalRequest.IsLocal(context) && !settings.GetWebRuntimeSettings().BindOnLan;
    }

    public static async Task WriteRefusalAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/control"))
        {
            await context.Response.WriteAsJsonAsync(new { error = "Forbidden. Remote connections are turned off." });
            return;
        }

        context.Response.ContentType = "text/plain; charset=utf-8";
        await context.Response.WriteAsync(
            "Remote connections are turned off on this ReelRoulette server. Turn on Allow remote connections in the Operator on the server machine.");
    }
}
