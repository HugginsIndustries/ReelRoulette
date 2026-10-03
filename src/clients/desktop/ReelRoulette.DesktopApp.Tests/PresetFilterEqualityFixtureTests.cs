using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// Preset equality locked to the fixture the WebUI preset comparison also reads.
/// </summary>
public sealed class PresetFilterEqualityFixtureTests
{
    public static TheoryData<string, string, string, bool> Cases()
    {
        var data = new TheoryData<string, string, string, bool>();
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        foreach (var entry in fixture.RootElement.EnumerateArray())
        {
            data.Add(
                entry.GetProperty("name").GetString()!,
                entry.GetProperty("left").GetRawText(),
                entry.GetProperty("right").GetRawText(),
                entry.GetProperty("same").GetBoolean());
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void FiltersEqual_MatchesTheSharedFixture(string name, string left, string right, bool same)
    {
        // Saved preset text is read the same way as presets loaded from the server.
        var leftFilter = JsonSerializer.Deserialize<FilterState>(left);
        var rightFilter = JsonSerializer.Deserialize<FilterState>(right);

        Assert.True(same == LibraryPresetSelection.FiltersEqual(leftFilter, rightFilter), name);
        Assert.True(same == LibraryPresetSelection.FiltersEqual(rightFilter, leftFilter), $"{name} (reversed)");
    }

    private static string FixturePath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "shared", "fixtures", "preset-filter-equality.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("shared/fixtures/preset-filter-equality.json was not found above the test output folder.");
    }
}
