using ReelRoulette;
using ReelRoulette.Core.Filtering;
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

    [Theory]
    [InlineData(FlagFilterModeValue.Only, FlagFilterModeValue.Excluded, new[] { "Favorites only" })]
    [InlineData(FlagFilterModeValue.Excluded, FlagFilterModeValue.Excluded, new[] { "Favorites excluded" })]
    [InlineData(FlagFilterModeValue.Off, FlagFilterModeValue.Only, new[] { "Blacklisted only" })]
    [InlineData(FlagFilterModeValue.Excluded, FlagFilterModeValue.Only, new[] { "Favorites excluded", "Blacklisted only" })]
    [InlineData(FlagFilterModeValue.Off, FlagFilterModeValue.Excluded, new string[0])]
    [InlineData(FlagFilterModeValue.Off, FlagFilterModeValue.Off, new string[0])]
    public void FlagFilters_NameEachModeButTheDefault(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted, string[] expected)
    {
        var filter = new FilterState { FavoritesMode = favorites, BlacklistedMode = blacklisted };

        Assert.Equal(expected, FilterSummaryFormat.FlagFilters(filter));
    }

    [Fact]
    public void IncludedTags_IsNullWhenNoTagIsIncluded()
    {
        Assert.Null(FilterSummaryFormat.IncludedTags(new FilterState { GlobalMatchMode = false }));
    }
}
