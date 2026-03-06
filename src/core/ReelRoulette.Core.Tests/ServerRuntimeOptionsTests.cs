using Microsoft.Extensions.Configuration;
using ReelRoulette.Server.Hosting;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerRuntimeOptionsTests
{
    [Fact]
    public void FromConfiguration_ShouldNormalizeCorsOriginsAndCookieModes()
    {
        var data = new Dictionary<string, string?>
        {
            ["CoreServer:RequireAuth"] = "true",
            ["CoreServer:PairingToken"] = "token",
            ["CoreServer:PairingCookieSameSite"] = "none",
            ["CoreServer:PairingCookieSecureMode"] = "always",
            ["CoreServer:CorsAllowedOrigins:0"] = "http://localhost:5173",
            ["CoreServer:CorsAllowedOrigins:1"] = " http://localhost:5173 ",
            ["CoreServer:CorsAllowedOrigins:2"] = "http://127.0.0.1:5173"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(data).Build();

        var options = ServerRuntimeOptions.FromConfiguration(config);
        Assert.Equal("None", options.PairingCookieSameSite);
        Assert.Equal("Always", options.PairingCookieSecureMode);
        Assert.Equal(2, options.CorsAllowedOrigins.Length);
    }

}
