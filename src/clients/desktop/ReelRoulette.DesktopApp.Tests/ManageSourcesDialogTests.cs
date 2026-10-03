using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Threading;
using Avalonia.VisualTree;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class ManageSourcesDialogTests
{
    [Fact]
    public void SourceRow_HidesRenameAndRemove_AndShowsTheOtherActions()
    {
        var visible = HeadlessTestSession.Run(() =>
        {
            var dialog = new ManageSourcesDialog(getLibraryStatsAsync: () => Task.FromResult<CoreLibraryStatsResponse?>(new CoreLibraryStatsResponse
            {
                Sources = [new CoreSourceStatsResponse { SourceId = "source-1", RootPath = "/clips", DisplayName = "Clips" }]
            }));
            dialog.Show();
            Dispatcher.UIThread.RunJobs();
            try
            {
                return dialog.GetVisualDescendants()
                    .OfType<Control>()
                    .Where(control => control is Button or ToggleButton)
                    .Where(control => control.IsEffectivelyVisible)
                    .Select(control => control is ContentControl content ? content.Content as string : null)
                    .Where(label => label != null)
                    .ToList();
            }
            finally
            {
                dialog.Close();
            }
        });

        Assert.DoesNotContain("Rename", visible);
        Assert.DoesNotContain("Remove", visible);
        Assert.Contains("Refresh", visible);
        Assert.Contains("Find Duplicates...", visible);
    }
}
