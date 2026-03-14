namespace ReelRoulette.Server.Hosting;

public sealed class ServerRuntimeOptions
{
    public string ListenUrl { get; set; } = "http://localhost:45123";
    public bool RequireAuth { get; set; }
    public bool TrustLocalhost { get; set; } = true;
    public bool BindOnLan { get; set; }
    public string? PairingToken { get; set; }
    public string PairingCookieName { get; set; } = "rr_paired";
    public int PairingSessionDurationHours { get; set; } = 24 * 30;
    public string PairingCookieSameSite { get; set; } = "Lax";
    public string PairingCookieSecureMode { get; set; } = "Request";
    public bool AllowLegacyTokenAuth { get; set; } = true;
    public bool EnableCors { get; set; } = true;
    public bool CorsAllowCredentials { get; set; } = true;
    public string[] CorsAllowedOrigins { get; set; } =
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ];
    public bool AutoRefreshEnabled { get; set; } = true;
    public int AutoRefreshIntervalMinutes { get; set; } = 15;
    public bool ForceRescanLoudness { get; set; }
    public bool ForceRescanDuration { get; set; }
    public bool BackupEnabled { get; set; } = true;
    public int MinimumBackupGapMinutes { get; set; } = 360;
    public int NumberOfBackups { get; set; } = 8;
    public string ControlAdminAuthMode { get; set; } = "Off";
    public string? ControlAdminSharedToken { get; set; }
    public string ControlAdminCookieName { get; set; } = "rr_admin";

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

        options.PairingSessionDurationHours = Math.Clamp(options.PairingSessionDurationHours, 1, 24 * 365);
        options.PairingCookieSameSite = NormalizeSameSite(options.PairingCookieSameSite);
        options.PairingCookieSecureMode = NormalizeSecureMode(options.PairingCookieSecureMode);
        options.CorsAllowedOrigins = (options.CorsAllowedOrigins ?? [])
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Select(origin => origin.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (options.BindOnLan && options.ListenUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase))
        {
            options.ListenUrl = options.ListenUrl.Replace("localhost", "0.0.0.0", StringComparison.OrdinalIgnoreCase);
        }

        options.AutoRefreshIntervalMinutes = Math.Clamp(options.AutoRefreshIntervalMinutes, 5, 1440);
        options.MinimumBackupGapMinutes = Math.Clamp(options.MinimumBackupGapMinutes, 1, 10080);
        options.NumberOfBackups = Math.Clamp(options.NumberOfBackups, 1, 100);
        options.ControlAdminAuthMode = NormalizeControlAuthMode(options.ControlAdminAuthMode);
        if (string.IsNullOrWhiteSpace(options.ControlAdminSharedToken))
        {
            options.ControlAdminSharedToken = null;
        }

        if (string.Equals(options.ControlAdminAuthMode, "TokenRequired", StringComparison.Ordinal) &&
            string.IsNullOrWhiteSpace(options.ControlAdminSharedToken))
        {
            options.ControlAdminSharedToken = Guid.NewGuid().ToString("N");
        }

        if (string.IsNullOrWhiteSpace(options.ControlAdminCookieName))
        {
            options.ControlAdminCookieName = "rr_admin";
        }

        return options;
    }

    private static string NormalizeSameSite(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "Lax";
        }

        if (value.Equals("None", StringComparison.OrdinalIgnoreCase))
        {
            return "None";
        }

        if (value.Equals("Strict", StringComparison.OrdinalIgnoreCase))
        {
            return "Strict";
        }

        return "Lax";
    }

    private static string NormalizeSecureMode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "Request";
        }

        if (value.Equals("Always", StringComparison.OrdinalIgnoreCase))
        {
            return "Always";
        }

        if (value.Equals("Never", StringComparison.OrdinalIgnoreCase))
        {
            return "Never";
        }

        return "Request";
    }

    private static string NormalizeControlAuthMode(string? value)
    {
        if (string.Equals(value, "TokenRequired", StringComparison.OrdinalIgnoreCase))
        {
            return "TokenRequired";
        }

        return "Off";
    }
}
