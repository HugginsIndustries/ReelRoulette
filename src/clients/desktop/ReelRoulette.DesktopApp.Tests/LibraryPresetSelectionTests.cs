using System.Text.Json;
using ReelRoulette;
using ReelRoulette.Core.Filtering;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryPresetSelectionTests
{
    [Fact]
    public void None_SelectsTheDefaultFilter()
    {
        var selected = LibraryPresetSelection.FilterStateForSelection(null);

        Assert.Equal(FlagFilterModeValue.Off, selected.FavoritesMode);
        Assert.Equal(FlagFilterModeValue.Excluded, selected.BlacklistedMode);
        Assert.False(selected.OnlyNeverPlayed);
        Assert.False(selected.OnlyKnownDuration);
        Assert.False(selected.OnlyKnownLoudness);
        Assert.Equal(AudioFilterMode.PlayAll, selected.AudioFilter);
        Assert.Equal(MediaTypeFilter.All, selected.MediaTypeFilter);
        Assert.Null(selected.GlobalMatchMode);
        Assert.Null(selected.CategoryLocalMatchModes);
        Assert.Null(selected.MinDuration);
        Assert.Null(selected.MaxDuration);
        Assert.Empty(selected.SelectedTags);
        Assert.Empty(selected.ExcludedTags);
        Assert.Empty(selected.IncludedSourceIds);
    }

    [Fact]
    public void NamedPreset_SelectsASeparateCopyOfThatFilter()
    {
        var preset = new FilterPreset
        {
            Name = "Favorites",
            FilterState = new FilterState
            {
                FavoritesMode = FlagFilterModeValue.Only,
                BlacklistedMode = FlagFilterModeValue.Off,
                SelectedTags = ["kept"]
            }
        };

        var selected = LibraryPresetSelection.FilterStateForSelection(preset);
        selected.FavoritesMode = FlagFilterModeValue.Off;
        selected.SelectedTags.Add("added");

        Assert.Equal(FlagFilterModeValue.Off, selected.BlacklistedMode);
        Assert.Equal(FlagFilterModeValue.Only, preset.FilterState.FavoritesMode);
        Assert.Equal(["kept"], preset.FilterState.SelectedTags);
    }

    [Fact]
    public void CleanNone_IsTheDefaultAndHeadsTheList()
    {
        var presets = new[] { Youtube() };
        var anchor = LibraryPresetSelection.Resolve(new FilterState(), presets, "YouTube");

        Assert.False(anchor.Starred);
        Assert.Equal("None", anchor.Label);
        Assert.Equal("Preset: None", LibraryPresetSelection.Heading(anchor));
        Assert.Equal(["None", "YouTube"], LibraryPresetSelection.BuildRows(anchor, presets).Select(row => row.Label));
        Assert.Equal(LibraryPresetSelection.NoneLabel, LibraryPresetSelection.SelectedTag(anchor));
    }

    [Fact]
    public void CleanNamedPreset_SelectsThatPreset()
    {
        var youtube = Youtube();
        var presets = new[] { youtube };
        var anchor = LibraryPresetSelection.Resolve(youtube.FilterState, presets, null);

        Assert.False(anchor.Starred);
        Assert.Equal("YouTube", anchor.Label);
        Assert.Equal("Preset: YouTube", LibraryPresetSelection.Heading(anchor));
        Assert.Equal(LibraryPresetSelection.PresetPick.Named, LibraryPresetSelection.Pick("YouTube"));
    }

    [Fact]
    public void DirtyNamedBase_PutsTheStarredRowFirstAndKeepsTheCleanPreset()
    {
        var presets = new[] { Youtube() };
        var dirty = new FilterState { FavoritesMode = FlagFilterModeValue.Only, OnlyNeverPlayed = true };
        var anchor = LibraryPresetSelection.Resolve(dirty, presets, "YouTube");

        Assert.Equal("YouTube*", anchor.Label);
        Assert.Equal("Preset: YouTube*", LibraryPresetSelection.Heading(anchor));
        var rows = LibraryPresetSelection.BuildRows(anchor, presets);
        Assert.Equal(["YouTube*", "None", "YouTube"], rows.Select(row => row.Label));
        Assert.Equal(LibraryPresetSelection.StarredTag, rows[0].Tag);
        Assert.Equal(LibraryPresetSelection.PresetPick.Keep, LibraryPresetSelection.Pick(rows[0].Tag));
    }

    [Fact]
    public void ExplicitNone_StaysNoneWhenAPresetEqualsTheDefault()
    {
        var everything = new FilterPreset
        {
            Name = "Everything",
            FilterState = new FilterState()
        };

        var held = LibraryPresetSelection.Resolve(new FilterState(), new[] { everything }, previousBase: null, holdNone: true);
        Assert.False(held.Starred);
        Assert.Null(held.BaseName);
        Assert.Equal("None", held.Label);

        var released = LibraryPresetSelection.Resolve(new FilterState(), new[] { everything }, previousBase: null);
        Assert.False(released.Starred);
        Assert.Equal("Everything", released.Label);
    }

    [Fact]
    public void HeldNone_DropsWhenTheFilterIsNoLongerTheDefault()
    {
        var presets = new[] { Youtube() };
        var dirty = new FilterState { FavoritesMode = FlagFilterModeValue.Only, OnlyNeverPlayed = true };
        var anchor = LibraryPresetSelection.Resolve(dirty, presets, "YouTube", holdNone: true);

        Assert.Equal("YouTube*", anchor.Label);
    }

    [Fact]
    public void DialogNone_StaysOnAPresetTheFilterStillEquals()
    {
        var presets = new[] { Youtube() };
        var matched = LibraryPresetSelection.AfterDialogNone(Youtube().FilterState, presets);

        Assert.Equal("YouTube", matched.ActivePresetName);
        Assert.Equal("YouTube", matched.SelectedPresetName);

        var dirty = new FilterState { FavoritesMode = FlagFilterModeValue.Only, OnlyNeverPlayed = true };
        var cleared = LibraryPresetSelection.AfterDialogNone(dirty, presets);
        Assert.Null(cleared.ActivePresetName);
        Assert.Equal("None", cleared.SelectedPresetName);

        var defaults = LibraryPresetSelection.AfterDialogNone(new FilterState(), presets);
        Assert.Null(defaults.ActivePresetName);
        Assert.Equal("None", defaults.SelectedPresetName);
    }

    [Fact]
    public void MissingBase_ShowsNoneStarFirst()
    {
        var presets = new[] { Youtube() };
        var dirty = new FilterState { FavoritesMode = FlagFilterModeValue.Only, OnlyNeverPlayed = true };
        var anchor = LibraryPresetSelection.Resolve(dirty, presets, "Gone");

        Assert.Equal("None*", anchor.Label);
        Assert.Null(anchor.BaseName);
        Assert.Equal("Preset: None*", LibraryPresetSelection.Heading(anchor));
        Assert.Equal("None*", LibraryPresetSelection.BuildRows(anchor, presets)[0].Label);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(0)]
    public void SavedPresetTextWithTagMatchMode_MatchesTheSameFilter(int tagMatchMode)
    {
        // Saved presets written before tagMatchMode left the filter still carry it.
        var stored = JsonSerializer.Deserialize<FilterState>(
            $$"""{"selectedTags":["Ann","Bob"],"globalMatchMode":false,"tagMatchMode":{{tagMatchMode}},"favoritesOnly":true}""")!;
        var preset = new FilterPreset { Name = "Any person", FilterState = stored };
        var current = new FilterState { SelectedTags = ["Ann", "Bob"], GlobalMatchMode = false, FavoritesMode = FlagFilterModeValue.Only };

        Assert.DoesNotContain("tagMatchMode", LibraryPresetSelection.FilterSnapshot(stored));
        Assert.True(LibraryPresetSelection.FiltersEqual(current, stored));
        var anchor = LibraryPresetSelection.Resolve(current, [preset], null);
        Assert.False(anchor.Starred);
        Assert.Equal("Any person", anchor.Label);
    }

    [Fact]
    public void UnsetGlobalMode_EqualsAnExplicitAnd_ButNotOr()
    {
        var unset = new FilterState { SelectedTags = ["Ann", "Bob"] };
        var and = new FilterState { SelectedTags = ["Ann", "Bob"], GlobalMatchMode = true };
        var or = new FilterState { SelectedTags = ["Ann", "Bob"], GlobalMatchMode = false };

        Assert.True(LibraryPresetSelection.FiltersEqual(unset, and));
        Assert.True(LibraryPresetSelection.FiltersEqual(and, unset));
        Assert.False(LibraryPresetSelection.FiltersEqual(unset, or));
        Assert.True(LibraryPresetSelection.FiltersEqual(new FilterState { GlobalMatchMode = true }, new FilterState()));

        var anchor = LibraryPresetSelection.Resolve(and, [new FilterPreset { Name = "Saved unset", FilterState = unset }], null);
        Assert.False(anchor.Starred);
        Assert.Equal("Saved unset", anchor.Label);
        Assert.Null(unset.GlobalMatchMode);
    }

    [Fact]
    public void PresetsEqual_ComparesNamesAndOrderExactly_AndFiltersWithFiltersEqual()
    {
        static List<FilterPreset> Rows(bool? globalMatchMode, params string[] names) =>
            names.Select(name => new FilterPreset
            {
                Name = name,
                FilterState = new FilterState { SelectedTags = ["Ann"], GlobalMatchMode = globalMatchMode }
            }).ToList();

        Assert.True(LibraryPresetSelection.PresetsEqual(Rows(null, "A", "B"), Rows(true, "A", "B")));
        Assert.False(LibraryPresetSelection.PresetsEqual(Rows(null, "A", "B"), Rows(false, "A", "B")));
        Assert.False(LibraryPresetSelection.PresetsEqual(Rows(true, "A", "B"), Rows(true, "B", "A")));
        Assert.False(LibraryPresetSelection.PresetsEqual(Rows(true, "A"), Rows(true, "a")));
        Assert.False(LibraryPresetSelection.PresetsEqual(Rows(true, "A"), Rows(true, "A", "B")));
        Assert.True(LibraryPresetSelection.PresetsEqual([], []));
    }

    private static FilterPreset Youtube()
    {
        return new FilterPreset
        {
            Name = "YouTube",
            FilterState = new FilterState { FavoritesMode = FlagFilterModeValue.Only }
        };
    }
}
