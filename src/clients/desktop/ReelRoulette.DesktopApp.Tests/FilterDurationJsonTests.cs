using System.Text.Json;
using ReelRoulette;
using ReelRoulette.Core.Filtering;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class FilterDurationJsonTests
{
    [Fact]
    public void SavedPresetWithNumericDurations_KeepsItsOtherSettings()
    {
        // Saved preset text is read this way for presets loaded from the server.
        var filter = JsonSerializer.Deserialize<FilterState>(
            """{"favoritesOnly":true,"selectedTags":["Ann"],"minDuration":60,"maxDuration":90.5}""")!;

        Assert.Equal(FlagFilterModeValue.Only, filter.FavoritesMode);
        Assert.Equal(["Ann"], filter.SelectedTags);
        Assert.Equal(TimeSpan.FromSeconds(60), filter.MinDuration);
        Assert.Equal(TimeSpan.FromSeconds(90.5), filter.MaxDuration);
    }

    [Theory]
    [InlineData("\"00:01:00\"", 60.0)]
    [InlineData("\"75\"", 75.0 * 86400)] // A bare whole number string is days, as on the server.
    [InlineData("\"1e2\"", 100.0)]
    [InlineData("\"1:30\"", 5400.0)]
    [InlineData("\"not a duration\"", null)]
    [InlineData("\"\"", null)]
    [InlineData("null", null)]
    [InlineData("true", null)]
    public void DurationValues_ReadLikeTheServerFilter(string json, double? expectedSeconds)
    {
        var filter = JsonSerializer.Deserialize<FilterState>($$"""{"favoritesOnly":true,"minDuration":{{json}}}""")!;

        Assert.Equal(FlagFilterModeValue.Only, filter.FavoritesMode);
        Assert.Equal(expectedSeconds.HasValue ? TimeSpan.FromSeconds(expectedSeconds.Value) : null, filter.MinDuration);
    }

    [Fact]
    public void Durations_AreStillWrittenAsText()
    {
        var json = JsonSerializer.Serialize(new FilterState { MinDuration = TimeSpan.FromSeconds(60), MaxDuration = null });

        using var doc = JsonDocument.Parse(json);
        Assert.Equal("00:01:00", doc.RootElement.GetProperty("minDuration").GetString());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("maxDuration").ValueKind);
    }
}
