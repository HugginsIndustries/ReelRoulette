using ReelRoulette.Core.Verification;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class CoreVerificationTests
{
    [Fact]
    public void RunAll_ShouldPassWithoutIssues()
    {
        var result = CoreVerification.RunAll();
        Assert.True(result.Success, string.Join(Environment.NewLine, result.Issues.Select(i => $"{i.Name}: {i.Message}")));
    }
}
