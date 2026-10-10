using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.LogicalTree;
using Avalonia.Threading;
using Avalonia.VisualTree;
using ReelRoulette;
using ReelRoulette.Core.Filtering;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// The filter dialog's Favorites and Blacklisted controls: a checkbox and a choice of only or excluded for each.
/// </summary>
public sealed class FilterDialogFlagModeTests
{
    private static readonly FlagFilterModeValue[] AllModes = [FlagFilterModeValue.Off, FlagFilterModeValue.Only, FlagFilterModeValue.Excluded];

    public static TheoryData<FlagFilterModeValue, FlagFilterModeValue> AllPairings()
    {
        var data = new TheoryData<FlagFilterModeValue, FlagFilterModeValue>();
        foreach (var favorites in AllModes)
        {
            foreach (var blacklisted in AllModes)
            {
                data.Add(favorites, blacklisted);
            }
        }

        return data;
    }

    public static TheoryData<FlagFilterModeValue, FlagFilterModeValue> AllowedPairings()
    {
        var data = new TheoryData<FlagFilterModeValue, FlagFilterModeValue>();
        foreach (var favorites in AllModes)
        {
            foreach (var blacklisted in AllModes)
            {
                if (!IsRefused(favorites, blacklisted))
                {
                    data.Add(favorites, blacklisted);
                }
            }
        }

        return data;
    }

    [Fact]
    public void Controls_ShowTheirLabels_AndEachChoiceIsDisabledWhileItsCheckboxIsOff()
    {
        var result = Run(() =>
        {
            var dialog = Open(new FilterState(), []);
            var labels = (
                Favorites: FavoritesCheckBox(dialog).Content,
                Blacklisted: BlacklistedCheckBox(dialog).Content,
                FavoritesName: AutomationProperties.GetName(FavoritesComboBox(dialog)),
                BlacklistedName: AutomationProperties.GetName(BlacklistedComboBox(dialog)),
                FavoritesItems: ItemLabels(FavoritesComboBox(dialog)),
                BlacklistedItems: ItemLabels(BlacklistedComboBox(dialog)));
            var opened = (FavoritesComboBox(dialog).IsEnabled, BlacklistedComboBox(dialog).IsEnabled);
            SetChecked(FavoritesCheckBox(dialog), true);
            SetChecked(BlacklistedCheckBox(dialog), false);
            var toggled = (FavoritesComboBox(dialog).IsEnabled, BlacklistedComboBox(dialog).IsEnabled);
            return (labels, opened, toggled);
        });

        Assert.Equal("Favorites", result.labels.Favorites);
        Assert.Equal("Blacklisted", result.labels.Blacklisted);
        Assert.Equal("Favorites filter", result.labels.FavoritesName);
        Assert.Equal("Blacklisted filter", result.labels.BlacklistedName);
        Assert.Equal(["only", "excluded"], result.labels.FavoritesItems);
        Assert.Equal(["only", "excluded"], result.labels.BlacklistedItems);
        Assert.Equal((false, true), result.opened);
        Assert.Equal((true, false), result.toggled);
    }

    [Fact]
    public void Defaults_AreFavoritesOffWithOnly_AndBlacklistedOnWithExcluded()
    {
        var controls = Run(() => Controls(Open(new FilterState(), [])));

        Assert.Equal((false, 0, true, 1), controls);
    }

    [Fact]
    public void AChoice_SurvivesUncheckingAndRechecking()
    {
        var steps = Run(() =>
        {
            var dialog = Open(new FilterState(), []);
            SetChecked(FavoritesCheckBox(dialog), true);
            SetIndex(FavoritesComboBox(dialog), 1);
            SetIndex(BlacklistedComboBox(dialog), 0);
            var picked = Modes(dialog);
            SetChecked(FavoritesCheckBox(dialog), false);
            SetChecked(BlacklistedCheckBox(dialog), false);
            var cleared = (Modes(dialog), Controls(dialog));
            SetChecked(FavoritesCheckBox(dialog), true);
            SetChecked(BlacklistedCheckBox(dialog), true);
            var rechecked = (Modes(dialog), Controls(dialog));
            return (picked, cleared, rechecked);
        });

        Assert.Equal((FlagFilterModeValue.Excluded, FlagFilterModeValue.Only), steps.picked);
        Assert.Equal(((FlagFilterModeValue.Off, FlagFilterModeValue.Off), (false, 1, false, 0)), steps.cleared);
        Assert.Equal(((FlagFilterModeValue.Excluded, FlagFilterModeValue.Only), (true, 1, true, 0)), steps.rechecked);
    }

    [Theory]
    [MemberData(nameof(AllPairings))]
    public void LoadingAPreset_SetsTheControlsFromItsModes(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        var result = Run(() =>
        {
            // The dialog opens on choices that aren't the defaults, so a preset with a filter off shows the default choice.
            var presets = new List<FilterPreset>
            {
                new() { Name = "Q", FilterState = new FilterState { OnlyNeverPlayed = true, FavoritesMode = favorites, BlacklistedMode = blacklisted } }
            };
            var dialog = Open(new FilterState { FavoritesMode = FlagFilterModeValue.Excluded, BlacklistedMode = FlagFilterModeValue.Only }, presets);
            dialog.FindControl<ComboBox>("PresetComboBox")!.SelectedItem = "Q";
            Dispatcher.UIThread.RunJobs();
            return (Modes(dialog), Controls(dialog), dialog.HeaderText);
        });

        Assert.Equal("Preset: Q", result.HeaderText);
        Assert.Equal((favorites, blacklisted), result.Item1);
        Assert.Equal(ExpectedControls(favorites, blacklisted), result.Item2);
    }

    [Fact]
    public void ClearAll_RestoresTheDefaults()
    {
        var result = Run(() =>
        {
            var dialog = Open(new FilterState { FavoritesMode = FlagFilterModeValue.Excluded, BlacklistedMode = FlagFilterModeValue.Only }, []);
            var opened = Controls(dialog);
            Click(ButtonLabeled(dialog, "Clear all filters"));
            return (opened, Modes(dialog), Controls(dialog));
        });

        Assert.Equal((true, 1, true, 0), result.opened);
        Assert.Equal((FlagFilterModeValue.Off, FlagFilterModeValue.Excluded), result.Item2);
        Assert.Equal((false, 0, true, 1), result.Item3);
    }

    [Theory]
    [MemberData(nameof(AllPairings))]
    public void FlagModesAllowed_RefusesOnlyFavoritesOnlyWithBlacklistedOnly(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        var allowed = FilterDialog.FlagModesAllowed(new FilterState { FavoritesMode = favorites, BlacklistedMode = blacklisted });

        Assert.Equal(!IsRefused(favorites, blacklisted), allowed);
    }

    [Theory]
    [MemberData(nameof(AllowedPairings))]
    public void Apply_AppliesAnAllowedPairing(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        var result = Run(() =>
        {
            var original = StartFilter(favorites, blacklisted);
            var dialog = Open(original, []);
            SetPairing(dialog, favorites, blacklisted);
            var apply = ApplyButton(dialog);
            Assert.True(apply.IsEnabled);
            Click(apply);
            return (dialog.WasApplied, original.FavoritesMode, original.BlacklistedMode, dialog.IsVisible);
        });

        Assert.Equal((true, favorites, blacklisted, false), result);
    }

    [Theory]
    [MemberData(nameof(AllowedPairings))]
    public void AddPreset_SavesAnAllowedPairing(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        var result = Run(() =>
        {
            var dialog = Open(StartFilter(favorites, blacklisted), []);
            SetPairing(dialog, favorites, blacklisted);
            AddPreset(dialog, "New");
            var added = dialog.GetPresets().Single(preset => preset.Name == "New");
            return (added.FilterState.FavoritesMode, added.FilterState.BlacklistedMode, dialog.PresetsChanged);
        });

        Assert.Equal((favorites, blacklisted, true), result);
    }

    [Theory]
    [MemberData(nameof(AllowedPairings))]
    public void UpdatePreset_SavesAnAllowedPairing(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        var result = Run(() =>
        {
            var start = StartFilter(favorites, blacklisted);
            var dialog = Open(start, [new FilterPreset { Name = "P", FilterState = LibraryPresetSelection.CopyFilter(start) }], "P");
            SetPairing(dialog, favorites, blacklisted);
            ClickUpdatePreset(dialog);
            var preset = dialog.GetPresets().Single();
            return (preset.FilterState.FavoritesMode, preset.FilterState.BlacklistedMode, dialog.HeaderText);
        });

        Assert.Equal((favorites, blacklisted, "Preset: P"), result);
    }

    [Fact]
    public void FavoritesOnlyWithBlacklistedOnly_IsNotApplied()
    {
        var result = Run(() =>
        {
            var original = new FilterState();
            var dialog = Open(original, []);
            SetPairing(dialog, FlagFilterModeValue.Only, FlagFilterModeValue.Only);
            var apply = ApplyButton(dialog);
            var enabled = apply.IsEnabled;
            Click(apply);
            var outcome = (enabled, dialog.WasApplied, original.FavoritesMode, original.BlacklistedMode, dialog.IsVisible);
            dialog.Close();
            return outcome;
        });

        Assert.Equal((true, false, FlagFilterModeValue.Off, FlagFilterModeValue.Excluded, true), result);
    }

    [Fact]
    public void FavoritesOnlyWithBlacklistedOnly_IsNotAddedAsAPreset()
    {
        var result = Run(() =>
        {
            var dialog = Open(new FilterState(), [new FilterPreset { Name = "P", FilterState = new FilterState { OnlyNeverPlayed = true } }]);
            SetPairing(dialog, FlagFilterModeValue.Only, FlagFilterModeValue.Only);
            AddPreset(dialog, "New");
            return (string.Join(",", dialog.GetPresets().Select(preset => preset.Name)), dialog.PresetsChanged);
        });

        Assert.Equal(("P", false), result);
    }

    [Fact]
    public void FavoritesOnlyWithBlacklistedOnly_DoesNotUpdateThePreset()
    {
        var result = Run(() =>
        {
            var start = new FilterState { OnlyNeverPlayed = true };
            var dialog = Open(start, [new FilterPreset { Name = "P", FilterState = LibraryPresetSelection.CopyFilter(start) }], "P");
            SetPairing(dialog, FlagFilterModeValue.Only, FlagFilterModeValue.Only);
            ClickUpdatePreset(dialog);
            var preset = dialog.GetPresets().Single();
            return (preset.FilterState.FavoritesMode, preset.FilterState.BlacklistedMode, dialog.HeaderText, dialog.PresetsChanged);
        });

        Assert.Equal((FlagFilterModeValue.Off, FlagFilterModeValue.Excluded, "Preset: P*", false), result);
    }

    [Fact]
    public void PresetsChanged_IsFalseOnOpen_AndAfterAnUndoneEdit()
    {
        var steps = Run(() =>
        {
            var dialog = Open(new FilterState(), TwoPresets());
            var opened = dialog.PresetsChanged;
            SetChecked(FavoritesCheckBox(dialog), true);
            SetChecked(FavoritesCheckBox(dialog), false);
            var filterUndone = dialog.PresetsChanged;
            ClickPresetRowButton(dialog, "B", "↑");
            var moved = dialog.PresetsChanged;
            ClickPresetRowButton(dialog, "B", "↓");
            var moveUndone = dialog.PresetsChanged;
            return (opened, filterUndone, moved, moveUndone);
        });

        Assert.Equal((false, false, true, false), steps);
    }

    [Fact]
    public void PresetsChanged_IsTrueAfterAdd()
    {
        var changed = Run(() =>
        {
            var dialog = Open(new FilterState(), TwoPresets());
            SetChecked(FavoritesCheckBox(dialog), true);
            AddPreset(dialog, "New");
            return dialog.PresetsChanged;
        });

        Assert.True(changed);
    }

    [Fact]
    public void PresetsChanged_IsTrueAfterUpdate()
    {
        var changed = Run(() =>
        {
            var dialog = Open(new FilterState { OnlyNeverPlayed = true }, TwoPresets(), "A");
            SetChecked(FavoritesCheckBox(dialog), true);
            ClickUpdatePreset(dialog);
            return dialog.PresetsChanged;
        });

        Assert.True(changed);
    }

    [Fact]
    public void PresetsChanged_IsTrueAfterRename()
    {
        var changed = Run(() =>
        {
            var dialog = Open(new FilterState(), TwoPresets());
            ClickPresetRowButton(dialog, "A", "Rename");
            var rename = dialog.OwnedWindows.OfType<RenamePresetDialog>().Single();
            rename.GetVisualDescendants().OfType<TextBox>().Single().Text = "R";
            rename.GetVisualDescendants().OfType<Button>().Single(b => Equals(b.Content, "OK"))
                .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Dispatcher.UIThread.RunJobs();
            return (string.Join(",", dialog.GetPresets().Select(preset => preset.Name)), dialog.PresetsChanged);
        });

        Assert.Equal(("R,B", true), changed);
    }

    [Theory]
    [InlineData("Delete", "B")]
    [InlineData("↑", "B,A")]
    public void PresetsChanged_IsTrueAfterDeleteOrMove(string label, string order)
    {
        var changed = Run(() =>
        {
            var dialog = Open(new FilterState(), TwoPresets());
            ClickPresetRowButton(dialog, label == "Delete" ? "A" : "B", label);
            return (string.Join(",", dialog.GetPresets().Select(preset => preset.Name)), dialog.PresetsChanged);
        });

        Assert.Equal((order, true), changed);
    }

    private static T Run<T>(Func<T> action)
    {
        return HeadlessTestSession.Run(action);
    }

    private static bool IsRefused(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        return favorites == FlagFilterModeValue.Only && blacklisted == FlagFilterModeValue.Only;
    }

    /// <summary>
    /// A filter the pairing isn't, and never the default filter, so setting the pairing is a change and keeps a preset starred.
    /// </summary>
    private static FilterState StartFilter(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        var start = (favorites, blacklisted) == (FlagFilterModeValue.Excluded, FlagFilterModeValue.Only)
            ? (FlagFilterModeValue.Off, FlagFilterModeValue.Excluded)
            : (FlagFilterModeValue.Excluded, FlagFilterModeValue.Only);
        return new FilterState { OnlyNeverPlayed = true, FavoritesMode = start.Item1, BlacklistedMode = start.Item2 };
    }

    private static List<FilterPreset> TwoPresets()
    {
        return
        [
            new FilterPreset { Name = "A", FilterState = new FilterState { OnlyNeverPlayed = true } },
            new FilterPreset { Name = "B", FilterState = new FilterState { OnlyKnownDuration = true } }
        ];
    }

    private static FilterDialog Open(FilterState current, List<FilterPreset> presets, string? activePresetName = null)
    {
        var dialog = new FilterDialog(current, null, presets, activePresetName);
        dialog.Show();
        Dispatcher.UIThread.RunJobs();
        return dialog;
    }

    private static CheckBox FavoritesCheckBox(FilterDialog dialog) => dialog.FindControl<CheckBox>("FavoritesFilterCheckBox")!;

    private static CheckBox BlacklistedCheckBox(FilterDialog dialog) => dialog.FindControl<CheckBox>("BlacklistedFilterCheckBox")!;

    private static ComboBox FavoritesComboBox(FilterDialog dialog) => dialog.FindControl<ComboBox>("FavoritesFilterComboBox")!;

    private static ComboBox BlacklistedComboBox(FilterDialog dialog) => dialog.FindControl<ComboBox>("BlacklistedFilterComboBox")!;

    private static string[] ItemLabels(ComboBox comboBox)
    {
        return comboBox.Items.OfType<ComboBoxItem>().Select(item => item.Content as string ?? string.Empty).ToArray();
    }

    /// <summary>
    /// The Favorites checkbox and choice, then the Blacklisted checkbox and choice (0 = only, 1 = excluded).
    /// </summary>
    private static (bool, int, bool, int) Controls(FilterDialog dialog)
    {
        return (
            FavoritesCheckBox(dialog).IsChecked == true,
            FavoritesComboBox(dialog).SelectedIndex,
            BlacklistedCheckBox(dialog).IsChecked == true,
            BlacklistedComboBox(dialog).SelectedIndex);
    }

    private static (bool, int, bool, int) ExpectedControls(FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        return (
            favorites != FlagFilterModeValue.Off,
            favorites == FlagFilterModeValue.Excluded ? 1 : 0,
            blacklisted != FlagFilterModeValue.Off,
            blacklisted == FlagFilterModeValue.Only ? 0 : 1);
    }

    private static (FlagFilterModeValue, FlagFilterModeValue) Modes(FilterDialog dialog)
    {
        return (dialog.FilterState.FavoritesMode, dialog.FilterState.BlacklistedMode);
    }

    private static void SetChecked(CheckBox checkBox, bool value)
    {
        checkBox.IsChecked = value;
        Dispatcher.UIThread.RunJobs();
    }

    private static void SetIndex(ComboBox comboBox, int index)
    {
        Assert.True(comboBox.IsEnabled);
        comboBox.SelectedIndex = index;
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>
    /// Sets one pairing through the controls: a filter that is off is unchecked, and any other is checked with its choice.
    /// </summary>
    private static void SetPairing(FilterDialog dialog, FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        SetFlag(FavoritesCheckBox(dialog), FavoritesComboBox(dialog), favorites);
        SetFlag(BlacklistedCheckBox(dialog), BlacklistedComboBox(dialog), blacklisted);
        Assert.Equal((favorites, blacklisted), Modes(dialog));
    }

    private static void SetFlag(CheckBox checkBox, ComboBox comboBox, FlagFilterModeValue mode)
    {
        if (mode == FlagFilterModeValue.Off)
        {
            SetChecked(checkBox, false);
            return;
        }

        SetChecked(checkBox, true);
        SetIndex(comboBox, mode == FlagFilterModeValue.Excluded ? 1 : 0);
    }

    private static Button ButtonLabeled(FilterDialog dialog, string label)
    {
        // These buttons have no x:Name, so find them by their label.
        return dialog.GetLogicalDescendants().OfType<Button>().Distinct().Single(b => Equals(b.Content, label));
    }

    private static Button ApplyButton(FilterDialog dialog)
    {
        return dialog.GetLogicalDescendants().OfType<Button>().Distinct().Single(b => b.IsDefault);
    }

    private static void Click(Button button)
    {
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Dispatcher.UIThread.RunJobs();
    }

    private static void AddPreset(FilterDialog dialog, string name)
    {
        dialog.FindControl<TextBox>("NewPresetNameTextBox")!.Text = name;
        Click(ButtonLabeled(dialog, "Add Preset"));
    }

    private static void ClickUpdatePreset(FilterDialog dialog)
    {
        var button = ButtonLabeled(dialog, "Update Preset");
        Assert.True(button.IsEnabled);
        Click(button);
    }

    private static void ClickPresetRowButton(FilterDialog dialog, string name, string label)
    {
        // Open the Presets tab so the row buttons are realized, then click the button on that preset's row.
        dialog.GetLogicalDescendants().OfType<TabControl>().Single().SelectedIndex = 2;
        Dispatcher.UIThread.RunJobs();
        var button = dialog.GetVisualDescendants().OfType<Button>()
            .Single(b => Equals(b.Content, label) && b.Tag is FilterPreset preset && preset.Name == name);
        Click(button);
    }
}
