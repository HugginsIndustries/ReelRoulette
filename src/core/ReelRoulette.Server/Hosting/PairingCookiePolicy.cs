namespace ReelRoulette.Server.Hosting;

public static class PairingCookiePolicy
{
    /// <summary>
    /// <paramref name="isHttps"/> is the scheme the client used, which behind a proxy on this machine is the proxy's.
    /// </summary>
    public static CookieOptions BuildCookieOptions(ServerRuntimeOptions options, bool isHttps)
    {
        var secure = ResolveSecure(options.PairingCookieSecureMode, isHttps);
        var sameSite = ResolveSameSite(options.PairingCookieSameSite);
        // Browsers reject SameSite=None without Secure, so such a cookie is sent as Lax instead.
        if (sameSite == SameSiteMode.None && !secure)
        {
            sameSite = SameSiteMode.Lax;
        }

        return new CookieOptions
        {
            HttpOnly = true,
            SameSite = sameSite,
            Secure = secure,
            Path = "/",
            MaxAge = TimeSpan.FromHours(options.PairingSessionDurationHours)
        };
    }

    public static SameSiteMode ResolveSameSite(string? value)
    {
        if (value != null && value.Equals("None", StringComparison.OrdinalIgnoreCase))
        {
            return SameSiteMode.None;
        }

        if (value != null && value.Equals("Strict", StringComparison.OrdinalIgnoreCase))
        {
            return SameSiteMode.Strict;
        }

        return SameSiteMode.Lax;
    }

    public static bool ResolveSecure(string? secureMode, bool isHttps)
    {
        if (secureMode != null && secureMode.Equals("Always", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (secureMode != null && secureMode.Equals("Never", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return isHttps;
    }
}
