using Microsoft.Extensions.Configuration;
using ReelRoulette.Server.Hosting;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerRuntimeOptionsTests
{
    [Fact]
    public void FromConfiguration_ShouldNormalizeCookieModesAndControlSettings()
    {
        var data = new Dictionary<string, string?>
        {
            ["CoreServer:RequireAuth"] = "true",
            ["CoreServer:PairingToken"] = "token",
            ["CoreServer:PairingCookieSameSite"] = "none",
            ["CoreServer:PairingCookieSecureMode"] = "always",
            ["CoreServer:ControlAdminSharedToken"] = "",
            ["CoreServer:ControlAdminCookieName"] = ""
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(data).Build();

        var options = ServerRuntimeOptions.FromConfiguration(config);
        Assert.Equal("Lax", options.PairingCookieSameSite);
        Assert.Equal("Always", options.PairingCookieSecureMode);
        Assert.Null(options.ControlAdminSharedToken);
        Assert.Equal("rr_admin", options.ControlAdminCookieName);
    }

}
