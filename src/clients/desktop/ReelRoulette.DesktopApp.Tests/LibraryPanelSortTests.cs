using System.Text.Json;
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

    public static TheoryData<string, bool, string> SortDirectionLabels()
    {
        var data = new TheoryData<string, bool, string>();
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        foreach (var entry in fixture.RootElement.EnumerateArray())
        {
            data.Add(
                entry.GetProperty("sortMode").GetString()!,
                entry.GetProperty("descending").GetBoolean(),
                entry.GetProperty("label").GetString()!);
        }

        return data;
    }

    // The WebUI sort labels read the same fixture.
    [Theory]
    [MemberData(nameof(SortDirectionLabels))]
    public void GetSortDirectionLabel_MatchesTheSharedFixture(string sortMode, bool descending, string label)
    {
        Assert.Equal(label, LibraryPanelSort.GetSortDirectionLabel(sortMode, descending));
    }

    private static string FixturePath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "shared", "fixtures", "sort-direction-labels.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("shared/fixtures/sort-direction-labels.json was not found above the test output folder.");
    }
}
