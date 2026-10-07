using System.Collections.Concurrent;
using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

/// <summary>
/// Forwarded headers count only from a proxy on this machine, which connects from loopback. From it the server
/// takes the client's address, the scheme, and the host the client used, so links and cookies follow the proxy's
/// HTTPS address. A proxy on another machine is not supported: its forwarded headers are ignored, and the first
/// request from each such address writes one warning to <c>last.log</c>.
/// </summary>
public sealed class ProxyForwarding
{
    private readonly ServerLogService _logs;
    private readonly ConcurrentDictionary<string, byte> _warnedAddresses = new(StringComparer.Ordinal);

    public ProxyForwarding(ServerLogService logs)
    {
        _logs = logs;
    }

    public static ForwardedHeadersOptions CreateOptions()
    {
        // ASP.NET's defaults already trust only loopback (127.0.0.0/8 and ::1) and apply one hop.
        return new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost
        };
    }

    /// <summary>Runs before the forwarded headers are applied, while the connection's own address is still there.</summary>
    public void WarnIfUntrusted(HttpContext context)
    {
        var remote = context.Connection.RemoteIpAddress;
        if (remote is null || IPAddress.IsLoopback(remote) || !LocalRequest.CameThroughProxy(context.Request))
        {
            return;
        }

        var address = remote.ToString();
        if (_warnedAddresses.TryAdd(address, 0))
        {
            _logs.Append(
                "warn",
                $"Ignored proxy headers from {address}: only a proxy on this machine, connecting to 127.0.0.1 or ::1, is trusted.");
        }
    }
}
