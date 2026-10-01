using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Interactivity;
using Avalonia.LogicalTree;
using Avalonia.Themes.Fluent;
using Avalonia.Threading;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class FilterDialogPresetUpdateTests
{
    private static readonly Lazy<HeadlessUnitTestSession> Session =
        new(() => HeadlessUnitTestSession.StartNew(typeof(HeadlessTestApp)));

    [Theory]
    [InlineData(false, null)]
    [InlineData(true, false)]
    public void ReopenOnAnAppliedGlobalModeChange_EnablesUpdateWithTheStar(bool appliedGlobal, bool? presetGlobal)
    {
        var (header, canUpdate, pending) = Run(() =>
        {
            var dialog = Open(Filter(appliedGlobal), Presets(presetGlobal));
            return (dialog.HeaderText, dialog.CanUpdatePreset, dialog.HasPendingChanges);
        });

        Assert.Equal("Preset: P*", header);
        Assert.True(canUpdate);
        Assert.False(pending);
    }

    [Fact]
    public void ReopenOnAnAppliedTagChange_EnablesUpdateWithTheStar()
    {
        var (header, canUpdate) = Run(() =>
        {
            var dialog = Open(new FilterState { SelectedTags = ["Ann"] }, Presets(null));
            return (dialog.HeaderText, dialog.CanUpdatePreset);
        });

        Assert.Equal("Preset: P*", header);
        Assert.True(canUpdate);
    }

    [Fact]
    public void ChangingOnlyTheGlobalMode_StarsTheHeadingAndEnablesUpdate_AndMatchingAgainClearsBoth()
    {
        var steps = Run(() =>
        {
            var dialog = Open(Filter(false), Presets(false));
            var opened = (dialog.HeaderText, dialog.CanUpdatePreset);
            PickGlobalMode(dialog, index: 0);
            var changed = (dialog.HeaderText, dialog.CanUpdatePreset);
            PickGlobalMode(dialog, index: 1);
            var matched = (dialog.HeaderText, dialog.CanUpdatePreset);
            return (opened, changed, matched);
        });

        Assert.Equal(("Preset: P", false), steps.opened);
        Assert.Equal(("Preset: P*", true), steps.changed);
        Assert.Equal(("Preset: P", false), steps.matched);
    }

    [Fact]
    public void TogglingTheGlobalModeAwayAndBack_OnAPresetSavedUnset_ClearsTheStarAndUpdate()
    {
        var steps = Run(() =>
        {
            var dialog = Open(Filter(null), Presets(null));
            PickGlobalMode(dialog, index: 1);
            var away = (dialog.HeaderText, dialog.CanUpdatePreset);
            PickGlobalMode(dialog, index: 0);
            var back = (dialog.HeaderText, dialog.CanUpdatePreset);
            return (away, back);
        });

        Assert.Equal(("Preset: P*", true), steps.away);
        Assert.Equal(("Preset: P", false), steps.back);
    }

    [Fact]
    public void TogglingTheGlobalModeAwayAndBack_FromAnUnsetOpeningFilter_LeavesApplyDisabled()
    {
        var steps = Run(() =>
        {
            var dialog = Open(Filter(null), Presets(null));
            var opened = (dialog.HasPendingChanges, dialog.ApplyButtonText);
            PickGlobalMode(dialog, index: 1);
            var away = (dialog.HasPendingChanges, dialog.ApplyButtonText);
            PickGlobalMode(dialog, index: 0);
            var back = (dialog.HasPendingChanges, dialog.ApplyButtonText);
            return (opened, away, back);
        });

        Assert.Equal((false, "Apply"), steps.opened);
        Assert.Equal((true, "Apply*"), steps.away);
        Assert.Equal((false, "Apply"), steps.back);
    }

    [Fact]
    public void UpdatingAPresetSavedUnset_BackToAnExplicitAnd_LeavesApplyDisabled()
    {
        var steps = Run(() =>
        {
            var dialog = Open(Filter(null), Presets(null));
            PickGlobalMode(dialog, index: 1);
            ClickUpdatePreset(dialog);
            var updatedToOr = (dialog.HeaderText, dialog.HasPendingChanges, dialog.ApplyButtonText);
            PickGlobalMode(dialog, index: 0);
            ClickUpdatePreset(dialog);
            var updatedBack = (dialog.HeaderText, dialog.HasPendingChanges, dialog.ApplyButtonText);
            return (updatedToOr, updatedBack);
        });

        Assert.Equal(("Preset: P", true, "Apply*"), steps.updatedToOr);
        Assert.Equal(("Preset: P", false, "Apply"), steps.updatedBack);
    }

    [Fact]
    public void ReopenThenMatchingThePresetAgain_ClearsTheStarAndTellsTheUpdateButton()
    {
        var result = Run(() =>
        {
            var dialog = Open(Filter(true), Presets(false));
            var raised = new List<string?>();
            dialog.PropertyChanged += (_, e) => raised.Add(e.PropertyName);
            var opened = dialog.CanUpdatePreset;
            PickGlobalMode(dialog, index: 1);
            return (opened, dialog.HeaderText, dialog.CanUpdatePreset, raised);
        });

        Assert.True(result.opened);
        Assert.Equal("Preset: P", result.HeaderText);
        Assert.False(result.CanUpdatePreset);
        Assert.Contains(nameof(FilterDialog.CanUpdatePreset), result.raised);
    }

    [Fact]
    public void OpeningOnTheSavedPreset_KeepsUpdateDisabled()
    {
        var (header, canUpdate) = Run(() =>
        {
            var dialog = Open(Filter(null), Presets(null));
            return (dialog.HeaderText, dialog.CanUpdatePreset);
        });

        Assert.Equal("Preset: P", header);
        Assert.False(canUpdate);
    }

    private static T Run<T>(Func<T> action)
    {
        return Session.Value.Dispatch(action, CancellationToken.None).GetAwaiter().GetResult();
    }

    private static FilterState Filter(bool? globalMatchMode)
    {
        return new FilterState { SelectedTags = ["Ann", "Bob"], GlobalMatchMode = globalMatchMode };
    }

    private static List<FilterPreset> Presets(bool? globalMatchMode)
    {
        return [new FilterPreset { Name = "P", FilterState = Filter(globalMatchMode) }];
    }

    private static FilterDialog Open(FilterState current, List<FilterPreset> presets)
    {
        var dialog = new FilterDialog(current, null, presets, "P");
        dialog.Show();
        Dispatcher.UIThread.RunJobs();
        return dialog;
    }

    private static void PickGlobalMode(FilterDialog dialog, int index)
    {
        dialog.FindControl<ComboBox>("GlobalMatchModeComboBox")!.SelectedIndex = index;
        Dispatcher.UIThread.RunJobs();
    }

    private static void ClickUpdatePreset(FilterDialog dialog)
    {
        // The button has no x:Name, so find it by its label.
        var button = dialog.GetLogicalDescendants().OfType<Button>().Single(b => Equals(b.Content, "Update Preset"));
        Assert.True(button.IsEnabled);
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Dispatcher.UIThread.RunJobs();
    }
}

public sealed class HeadlessTestApp : Application
{
    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<HeadlessTestApp>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = true });
    }

    public override void Initialize()
    {
        Styles.Add(new FluentTheme());
    }
}
