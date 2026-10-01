using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class FilterSummaryFormatTests
{
    [Theory]
    [InlineData(true, "2 tag(s) included (all)")]
    [InlineData(false, "2 tag(s) included (any)")]
    [InlineData(null, "2 tag(s) included (all)")]
    public void IncludedTags_FollowsTheGlobalMatchMode(bool? globalMatchMode, string expected)
    {
        var filter = new FilterState { SelectedTags = ["Ann", "Bob"], GlobalMatchMode = globalMatchMode };

        Assert.Equal(expected, FilterSummaryFormat.IncludedTags(filter));
    }

    [Fact]
    public void IncludedTags_IsNullWhenNoTagIsIncluded()
    {
        Assert.Null(FilterSummaryFormat.IncludedTags(new FilterState { GlobalMatchMode = false }));
    }
}
