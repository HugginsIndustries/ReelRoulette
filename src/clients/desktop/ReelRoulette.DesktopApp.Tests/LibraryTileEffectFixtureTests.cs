using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// The patch-or-reload rule locked to the fixture the WebUI library session also reads.
/// </summary>
public sealed class LibraryTileEffectFixtureTests
{
    public static TheoryData<string, string> Cases()
    {
        var data = new TheoryData<string, string>();
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        foreach (var entry in fixture.RootElement.EnumerateArray())
        {
            data.Add(entry.GetProperty("name").GetString()!, entry.GetRawText());
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void EffectFor_MatchesTheSharedFixture(string name, string entryJson)
    {
        using var document = JsonDocument.Parse(entryJson);
        var entry = document.RootElement;
        var filterJson = entry.GetProperty("filter");
        var filter = new FilterState
        {
            FavoritesOnly = filterJson.GetProperty("favoritesOnly").GetBoolean(),
            ExcludeBlacklisted = filterJson.GetProperty("excludeBlacklisted").GetBoolean(),
            OnlyNeverPlayed = filterJson.GetProperty("onlyNeverPlayed").GetBoolean(),
            SelectedTags = Strings(filterJson, "selectedTags"),
            ExcludedTags = Strings(filterJson, "excludedTags")
        };
        var change = new LibraryTileChange
        {
            Kind = entry.GetProperty("event").GetString() switch
            {
                "favorite" => LibraryPanelBrowseEvent.FavoriteOrBlacklist,
                "playback" => LibraryPanelBrowseEvent.Playback,
                "tags" => LibraryPanelBrowseEvent.ItemTags,
                var other => throw new InvalidDataException($"Unknown event '{other}' in {name}.")
            },
            Loaded = entry.GetProperty("loaded").GetBoolean(),
            Before = Flags(entry, "before"),
            After = Flags(entry, "after"),
            AddedTags = Strings(entry, "addedTags"),
            RemovedTags = Strings(entry, "removedTags")
        };
        var expected = entry.GetProperty("expected").GetString() switch
        {
            "patch" => LibraryPanelBrowseEffect.Patch,
            "reload" => LibraryPanelBrowseEffect.ReloadLoaded,
            var other => throw new InvalidDataException($"Unknown expected '{other}' in {name}.")
        };

        var actual = LibraryPanelBrowse.EffectFor(change, filter, entry.GetProperty("sortMode").GetString());

        Assert.True(expected == actual, $"{name}: expected {expected}, got {actual}");
    }

    [Fact]
    public void TagSaveEffect_ReloadsUnderAnyTagFilter()
    {
        Assert.Equal(LibraryPanelBrowseEffect.ReloadLoaded, LibraryPanelBrowse.TagSaveEffect(hasTagFilter: true));
        Assert.Equal(LibraryPanelBrowseEffect.Patch, LibraryPanelBrowse.TagSaveEffect(hasTagFilter: false));
    }

    private static LibraryTileFlags? Flags(JsonElement entry, string property)
    {
        if (!entry.TryGetProperty(property, out var flags))
        {
            return null;
        }

        return new LibraryTileFlags(flags.GetProperty("isFavorite").GetBoolean(), flags.GetProperty("isBlacklisted").GetBoolean());
    }

    private static List<string> Strings(JsonElement entry, string property)
    {
        if (!entry.TryGetProperty(property, out var values))
        {
            return [];
        }

        return values.EnumerateArray().Select(value => value.GetString()!).ToList();
    }

    private static string FixturePath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "shared", "fixtures", "library-tile-effect.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("shared/fixtures/library-tile-effect.json was not found above the test output folder.");
    }
}
