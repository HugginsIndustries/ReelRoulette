using Microsoft.AspNetCore.Http;
using ReelRoulette.Server.Hosting;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerCookiePolicyTests
{
    [Theory]
    [InlineData("Lax", SameSiteMode.Lax)]
    [InlineData("Strict", SameSiteMode.Strict)]
    [InlineData("None", SameSiteMode.None)]
    [InlineData("anything", SameSiteMode.Lax)]
    public void ResolveSameSite_ShouldMapExpectedValues(string value, SameSiteMode expected)
    {
        Assert.Equal(expected, PairingCookiePolicy.ResolveSameSite(value));
    }

    [Theory]
    [InlineData("Always", false, true)]
    [InlineData("Never", true, false)]
    [InlineData("Request", true, true)]
    [InlineData("Request", false, false)]
    public void ResolveSecure_ShouldRespectMode(string mode, bool isHttps, bool expected)
    {
        Assert.Equal(expected, PairingCookiePolicy.ResolveSecure(mode, isHttps));
    }

    [Fact]
    public void BuildCookieOptions_ShouldApplyDurationAndHttpOnly()
    {
        var options = new ServerRuntimeOptions
        {
            PairingSessionDurationHours = 12,
            PairingCookieSameSite = "Lax",
            PairingCookieSecureMode = "Request"
        };

        var cookieOptions = PairingCookiePolicy.BuildCookieOptions(options, isHttps: true);
        Assert.True(cookieOptions.HttpOnly);
        Assert.Equal(TimeSpan.FromHours(12), cookieOptions.MaxAge);
        Assert.Equal(SameSiteMode.Lax, cookieOptions.SameSite);
        Assert.True(cookieOptions.Secure);
    }
}
