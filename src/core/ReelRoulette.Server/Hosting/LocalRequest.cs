using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace ReelRoulette.Server.Hosting;

/// <summary>
/// The one localhost check every localhost decision uses. A request is local only when it comes straight from
/// this machine: from loopback, or to the server's own address from that address. A request that came through a
/// proxy is never local, even when the proxy runs on this machine, and neither is one with no remote address.
/// </summary>
public static class LocalRequest
{
    // The headers a proxy adds, and the ones ASP.NET leaves after applying them. They can only take localhost
    // trust away, so a client that sends them itself gains nothing.
    private static readonly string[] ProxyHeaderNames =
    [
        ForwardedHeadersDefaults.XForwardedForHeaderName,
        ForwardedHeadersDefaults.XForwardedProtoHeaderName,
        ForwardedHeadersDefaults.XForwardedHostHeaderName,
        ForwardedHeadersDefaults.XOriginalForHeaderName,
        ForwardedHeadersDefaults.XOriginalProtoHeaderName,
        ForwardedHeadersDefaults.XOriginalHostHeaderName,
        "Forwarded",
        "X-Real-IP"
    ];

    public static bool IsLocal(HttpContext context)
    {
        if (CameThroughProxy(context.Request))
        {
            return false;
        }

        var remote = context.Connection.RemoteIpAddress;
        if (remote is null)
        {
            return false;
        }

        return IPAddress.IsLoopback(remote) || remote.Equals(context.Connection.LocalIpAddress);
    }

    public static bool CameThroughProxy(HttpRequest request)
    {
        foreach (var name in ProxyHeaderNames)
        {
            if (request.Headers.ContainsKey(name))
            {
                return true;
            }
        }

        return false;
    }
}
