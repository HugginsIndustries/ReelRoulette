using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryPanelSortTests
{
    private static LibraryItem Item(string fileName, DateTime? lastWriteTimeUtc = null, DateTime? lastPlayedUtc = null)
    {
        return new LibraryItem
        {
            FileName = fileName,
            FullPath = $"/media/{fileName}",
            LastWriteTimeUtc = lastWriteTimeUtc,
            LastPlayedUtc = lastPlayedUtc
        };
    }

    [Fact]
    public void Apply_DateAddedDescending_OrdersNewestFirst()
    {
        var items = new[]
        {
            Item("old.mp4", new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            Item("new.mp4", new DateTime(2024, 6, 1, 0, 0, 0, DateTimeKind.Utc)),
            Item("mid.mp4", new DateTime(2022, 3, 1, 0, 0, 0, DateTimeKind.Utc))
        };

        var sorted = LibraryPanelSort.Apply(items, "DateAdded", descending: true);

        Assert.Equal(["new.mp4", "mid.mp4", "old.mp4"], sorted.Select(i => i.FileName));
    }

    [Fact]
    public void Apply_DateAddedAscending_OrdersOldestFirst()
    {
        var items = new[]
        {
            Item("old.mp4", new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            Item("new.mp4", new DateTime(2024, 6, 1, 0, 0, 0, DateTimeKind.Utc)),
            Item("mid.mp4", new DateTime(2022, 3, 1, 0, 0, 0, DateTimeKind.Utc))
        };

        var sorted = LibraryPanelSort.Apply(items, "DateAdded", descending: false);

        Assert.Equal(["old.mp4", "mid.mp4", "new.mp4"], sorted.Select(i => i.FileName));
    }

    [Fact]
    public void Apply_DateAddedDescending_TreatsMissingTimestampAsOldest()
    {
        var items = new[]
        {
            Item("dated.mp4", new DateTime(2023, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            Item("missing.mp4", lastWriteTimeUtc: null)
        };

        var sorted = LibraryPanelSort.Apply(items, "DateAdded", descending: true);

        Assert.Equal(["dated.mp4", "missing.mp4"], sorted.Select(i => i.FileName));
    }

    [Fact]
    public void Apply_DateAddedAscending_PlacesMissingTimestampFirst()
    {
        var items = new[]
        {
            Item("dated.mp4", new DateTime(2023, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
            Item("missing.mp4", lastWriteTimeUtc: null)
        };

        var sorted = LibraryPanelSort.Apply(items, "DateAdded", descending: false);

        Assert.Equal(["missing.mp4", "dated.mp4"], sorted.Select(i => i.FileName));
    }

    [Fact]
    public void Apply_DateAddedDescending_UsesFileNameAscendingAsTieBreaker()
    {
        var timestamp = new DateTime(2023, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var items = new[]
        {
            Item("b.mp4", timestamp),
            Item("a.mp4", timestamp)
        };

        var sorted = LibraryPanelSort.Apply(items, "DateAdded", descending: true);

        Assert.Equal(["a.mp4", "b.mp4"], sorted.Select(i => i.FileName));
    }

    [Fact]
    public void Apply_DateAddedDescending_TieBreakerOrderIsIndependentOfInputOrder()
    {
        var timestamp = new DateTime(2023, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var reversedInput = new[]
        {
            Item("a.mp4", timestamp),
            Item("b.mp4", timestamp)
        };

        var sorted = LibraryPanelSort.Apply(reversedInput, "DateAdded", descending: true);

        Assert.Equal(["a.mp4", "b.mp4"], sorted.Select(i => i.FileName));
    }

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

    [Fact]
    public void Apply_NameAscending_SortsAlphabetically()
    {
        var items = new[] { Item("z.mp4"), Item("a.mp4"), Item("m.mp4") };

        var sorted = LibraryPanelSort.Apply(items, "Name", descending: false);

        Assert.Equal(["a.mp4", "m.mp4", "z.mp4"], sorted.Select(i => i.FileName));
    }
}
