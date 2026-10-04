using Avalonia.Controls;
using Avalonia.Threading;
using Avalonia.VisualTree;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class SettingsDialogTests
{
    private sealed record BaselineState(bool DialogAutoMode, bool? AutoChecked, bool? ManualChecked);

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Reopen_AfterClosingWithoutVisitingPlayback_LoadsAndSwitchesBaselineMode(bool baselineAutoMode)
    {
        var (loaded, switched) = HeadlessTestSession.Run(() =>
        {
            // The first dialog's Playback radios are never shown, so Avalonia keeps them in its shared radio group.
            var first = OpenDialog(baselineAutoMode);
            first.Close();
            Dispatcher.UIThread.RunJobs();

            var second = OpenDialog(baselineAutoMode);
            try
            {
                var tabs = second.GetVisualDescendants().OfType<TabControl>().First();
                tabs.SelectedItem = tabs.Items.OfType<TabItem>().First(tab => tab.Header as string == "Playback");
                Dispatcher.UIThread.RunJobs();

                var radios = second.GetVisualDescendants()
                    .OfType<RadioButton>()
                    .Where(radio => radio.GroupName == "BaselineMode")
                    .ToList();
                var auto = radios.Single(radio => (radio.Content as string)!.StartsWith("Automatic", StringComparison.Ordinal));
                var manual = radios.Single(radio => radio.Content as string == "Manual override");
                var loadedState = new BaselineState(second.GetBaselineAutoMode(), auto.IsChecked, manual.IsChecked);

                (baselineAutoMode ? manual : auto).IsChecked = true;
                Dispatcher.UIThread.RunJobs();
                var switchedState = new BaselineState(second.GetBaselineAutoMode(), auto.IsChecked, manual.IsChecked);

                GC.KeepAlive(first);
                return (loadedState, switchedState);
            }
            finally
            {
                second.Close();
                Dispatcher.UIThread.RunJobs();
            }
        }, TimeSpan.FromSeconds(10));

        Assert.Equal(new BaselineState(baselineAutoMode, baselineAutoMode, !baselineAutoMode), loaded);
        Assert.Equal(new BaselineState(!baselineAutoMode, !baselineAutoMode, baselineAutoMode), switched);
    }

    private static SettingsDialog OpenDialog(bool baselineAutoMode)
    {
        var dialog = new SettingsDialog();
        dialog.LoadFromSettings(
            loopEnabled: true,
            autoPlayNext: true,
            forceApiPlayback: false,
            duplicateHandlingDefaultBehavior: DuplicateHandlingDefaultBehavior.KeepAll,
            intervalSeconds: 300,
            seekStep: "5s",
            volumeStep: 5,
            volumeNormalizationEnabled: true,
            baselineAutoMode: baselineAutoMode);
        dialog.Show();
        Dispatcher.UIThread.RunJobs();
        return dialog;
    }
}
