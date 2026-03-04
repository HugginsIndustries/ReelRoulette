namespace ReelRoulette.Server.Hosting;

public sealed class ServerRuntimeOptions
{
    public string ListenUrl { get; set; } = "http://localhost:51301";
    public bool RequireAuth { get; set; }
    public bool TrustLocalhost { get; set; } = true;
    public bool BindOnLan { get; set; }
    public string? PairingToken { get; set; }
    public string PairingCookieName { get; set; } = "rr_paired";
    public bool AutoRefreshEnabled { get; set; } = true;
    public int AutoRefreshIntervalMinutes { get; set; } = 15;

    public static ServerRuntimeOptions FromConfiguration(IConfiguration configuration)
    {
        var options = new ServerRuntimeOptions();
        configuration.GetSection("CoreServer").Bind(options);

        if (string.IsNullOrWhiteSpace(options.PairingToken))
        {
            options.PairingToken = null;
        }

        if (options.RequireAuth && string.IsNullOrWhiteSpace(options.PairingToken))
        {
            options.PairingToken = Guid.NewGuid().ToString("N");
        }

        if (string.IsNullOrWhiteSpace(options.PairingCookieName))
        {
            options.PairingCookieName = "rr_paired";
        }

        if (options.BindOnLan && options.ListenUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase))
        {
            options.ListenUrl = options.ListenUrl.Replace("localhost", "0.0.0.0", StringComparison.OrdinalIgnoreCase);
        }

        options.AutoRefreshIntervalMinutes = Math.Clamp(options.AutoRefreshIntervalMinutes, 5, 1440);

        return options;
    }
}
