namespace ReelRoulette.Server.Hosting;

public static class PairingCookiePolicy
{
    /// <summary>
    /// <paramref name="isHttps"/> is the scheme the client used, which behind a proxy on this machine is the proxy's.
    /// </summary>
    public static CookieOptions BuildCookieOptions(ServerRuntimeOptions options, bool isHttps)
    {
        return new CookieOptions
        {
            HttpOnly = true,
            SameSite = ResolveSameSite(options.PairingCookieSameSite),
            Secure = ResolveSecure(options.PairingCookieSecureMode, isHttps),
            Path = "/",
            MaxAge = TimeSpan.FromHours(options.PairingSessionDurationHours)
        };
    }

    /// <summary>
    /// Lax or Strict. The WebUI and the API share one origin, so the cookie never needs to go with a cross-site request.
    /// </summary>
    public static SameSiteMode ResolveSameSite(string? value)
    {
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
