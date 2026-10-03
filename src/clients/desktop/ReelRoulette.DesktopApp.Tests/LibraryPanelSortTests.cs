using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryPanelSortTests
{
    [Fact]
    public void IsDefaultDescendingForSortMode_DateAdded_IsTrue()
    {
        Assert.True(LibraryPanelSort.IsDefaultDescendingForSortMode("DateAdded"));
    }

    [Fact]
    public void GetSortDirectionLabel_DateAdded_MatchesLastPlayedLabels()
    {
        Assert.Equal("Newest -> Oldest", LibraryPanelSort.GetSortDirectionLabel("DateAdded", descending: true));
        Assert.Equal("Oldest -> Newest", LibraryPanelSort.GetSortDirectionLabel("DateAdded", descending: false));
    }
}
