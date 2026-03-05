namespace ReelRoulette.Server.Hosting;

public static class PairingCookiePolicy
{
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
