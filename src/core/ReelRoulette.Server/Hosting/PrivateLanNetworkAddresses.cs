using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace ReelRoulette.Server.Hosting;

/// <summary>
/// Private RFC1918 IPv4 (and IPv6 link-local) addresses on eligible LAN interfaces.
/// Skips loopback and tunnel interfaces (for example Tailscale).
/// </summary>
public static class PrivateLanNetworkAddresses
{
    public static IEnumerable<IPAddress> GetPrivateLanIpv4Addresses()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var nic in GetEligibleNetworkInterfaces())
        {
            foreach (var unicast in nic.GetIPProperties().UnicastAddresses)
            {
                var ip = unicast.Address;
                if (ip.AddressFamily != AddressFamily.InterNetwork)
                {
                    continue;
                }

                if (!IsPrivateLanIpv4(ip))
                {
                    continue;
                }

                var key = ip.ToString();
                if (seen.Add(key))
                {
                    yield return ip;
                }
            }
        }
    }

    public static IEnumerable<IPAddress> GetMdnsAdvertisementAddresses()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var nic in GetEligibleNetworkInterfaces())
        {
            foreach (var unicast in nic.GetIPProperties().UnicastAddresses)
            {
                var ip = unicast.Address;
                if (ip.AddressFamily == AddressFamily.InterNetwork)
                {
                    if (!IsPrivateLanIpv4(ip))
                    {
                        continue;
                    }
                }
                else if (ip.AddressFamily == AddressFamily.InterNetworkV6)
                {
                    if (!ip.IsIPv6LinkLocal)
                    {
                        continue;
                    }
                }
                else
                {
                    continue;
                }

                var key = ip.ToString();
                if (seen.Add(key))
                {
                    yield return ip;
                }
            }
        }
    }

    private static IEnumerable<NetworkInterface> GetEligibleNetworkInterfaces()
    {
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up)
            {
                continue;
            }

            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
            {
                continue;
            }

            yield return nic;
        }
    }

    private static bool IsPrivateLanIpv4(IPAddress ip)
    {
        var bytes = ip.GetAddressBytes();
        return bytes[0] == 10 ||
               (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
               (bytes[0] == 192 && bytes[1] == 168);
    }
}
