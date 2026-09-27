using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryPresetSelectionTests
{
    [Fact]
    public void None_SelectsTheDefaultFilter()
    {
        var selected = LibraryPresetSelection.FilterStateForSelection(null);

        Assert.False(selected.FavoritesOnly);
        Assert.True(selected.ExcludeBlacklisted);
        Assert.False(selected.OnlyNeverPlayed);
        Assert.False(selected.OnlyKnownDuration);
        Assert.False(selected.OnlyKnownLoudness);
        Assert.Equal(AudioFilterMode.PlayAll, selected.AudioFilter);
        Assert.Equal(MediaTypeFilter.All, selected.MediaTypeFilter);
        Assert.Equal(TagMatchMode.And, selected.TagMatchMode);
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
                FavoritesOnly = true,
                ExcludeBlacklisted = false,
                SelectedTags = ["kept"]
            }
        };

        var selected = LibraryPresetSelection.FilterStateForSelection(preset);
        selected.FavoritesOnly = false;
        selected.SelectedTags.Add("added");

        Assert.False(selected.ExcludeBlacklisted);
        Assert.True(preset.FilterState.FavoritesOnly);
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
        var dirty = new FilterState { FavoritesOnly = true, OnlyNeverPlayed = true };
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
        var dirty = new FilterState { FavoritesOnly = true, OnlyNeverPlayed = true };
        var anchor = LibraryPresetSelection.Resolve(dirty, presets, "YouTube", holdNone: true);

        Assert.Equal("YouTube*", anchor.Label);
    }

    [Fact]
    public void SameFilterSnapshot_RejectsAFilterThatChanged()
    {
        var original = Youtube().FilterState;
        var snapshot = LibraryPresetSelection.FilterSnapshot(original);
        var copy = LibraryPresetSelection.CopyFilter(original);
        copy.OnlyNeverPlayed = true;

        Assert.True(LibraryPresetSelection.SameFilterSnapshot(snapshot, LibraryPresetSelection.CopyFilter(original)));
        Assert.False(LibraryPresetSelection.SameFilterSnapshot(snapshot, copy));
        Assert.True(LibraryPresetSelection.SameFilterSnapshot(LibraryPresetSelection.FilterSnapshot(null), new FilterState()));
    }

    [Fact]
    public void DialogNone_StaysOnAPresetTheFilterStillEquals()
    {
        var presets = new[] { Youtube() };
        var matched = LibraryPresetSelection.AfterDialogNone(Youtube().FilterState, presets);

        Assert.Equal("YouTube", matched.ActivePresetName);
        Assert.Equal("YouTube", matched.SelectedPresetName);

        var dirty = new FilterState { FavoritesOnly = true, OnlyNeverPlayed = true };
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
        var dirty = new FilterState { FavoritesOnly = true, OnlyNeverPlayed = true };
        var anchor = LibraryPresetSelection.Resolve(dirty, presets, "Gone");

        Assert.Equal("None*", anchor.Label);
        Assert.Null(anchor.BaseName);
        Assert.Equal("Preset: None*", LibraryPresetSelection.Heading(anchor));
        Assert.Equal("None*", LibraryPresetSelection.BuildRows(anchor, presets)[0].Label);
    }

    private static FilterPreset Youtube()
    {
        return new FilterPreset
        {
            Name = "YouTube",
            FilterState = new FilterState { FavoritesOnly = true }
        };
    }
}
