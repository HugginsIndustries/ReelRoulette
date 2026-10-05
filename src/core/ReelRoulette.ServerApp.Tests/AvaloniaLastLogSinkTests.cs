using Avalonia.Logging;
using ReelRoulette.Core.Tests;
using ReelRoulette.Server.Services;
using ReelRoulette.ServerApp.Hosting;
using Xunit;

namespace ReelRoulette.ServerApp.Tests;

public sealed class AvaloniaLastLogSinkTests
{
    [Fact]
    public void WarningRepeatedByNewControlsIsWrittenOnce()
    {
        var (sink, readLines) = CreateSink();

        // Each tray menu opening builds new controls, so the same warning arrives from a new source each time.
        // Plain objects stand in for the controls: creating a control here would claim Avalonia's UI thread outside
        // the headless session and break the tray tests running alongside.
        for (var i = 0; i < 3; i++)
        {
            sink.Log(LogEventLevel.Warning, LogArea.Binding, new object(), "Could not bind {Property} on {Target}", "Width", i);
        }

        var line = Assert.Single(readLines());
        Assert.Contains("[warn] Tray UI (Avalonia) [Binding]: Could not bind 'Width' on '0' (Object).", line);
    }

    [Fact]
    public void ErrorIsWrittenAsErrorAndInformationIsSkipped()
    {
        var (sink, readLines) = CreateSink();

        sink.Log(LogEventLevel.Information, LogArea.Layout, null, "Measured");
        sink.Log(LogEventLevel.Error, LogArea.Layout, null, "Layout failed");

        var line = Assert.Single(readLines());
        Assert.Contains("[error] Tray UI (Avalonia) [Layout]: Layout failed.", line);
    }

    private static (ILogSink Sink, Func<string[]> ReadLines) CreateSink()
    {
        var directory = Path.Combine(TestIsolation.RootDirectory, "avalonia-sink-" + Guid.NewGuid().ToString("N"));
        var sink = new AvaloniaLastLogSink(new ServerLogService(directory));
        var logPath = Path.Combine(directory, "last.log");
        return (sink, () => File.Exists(logPath) ? File.ReadAllLines(logPath) : []);
    }
}
