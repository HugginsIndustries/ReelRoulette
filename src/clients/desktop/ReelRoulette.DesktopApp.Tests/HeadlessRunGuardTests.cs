using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class HeadlessRunGuardTests
{
    [Fact]
    public void Run_AfterATimeout_FailsImmediatelyNamingTheTestThatTimedOut()
    {
        var stuck = new TaskCompletionSource<object?>();
        var dispatched = 0;
        var guard = new HeadlessRunGuard(action =>
        {
            dispatched++;
            return dispatched == 1 ? stuck.Task : Task.FromResult(action());
        });

        var timeout = Assert.Throws<TimeoutException>(
            () => guard.Run(() => 1, TimeSpan.FromMilliseconds(10), "SettingsDialogTests.Reopen"));
        var withoutTimeout = Assert.Throws<InvalidOperationException>(() => guard.Run(() => 2));
        var withTimeout = Assert.Throws<InvalidOperationException>(
            () => guard.Run(() => 3, TimeSpan.FromSeconds(10), "OtherTests.Later"));

        Assert.Contains("SettingsDialogTests.Reopen", timeout.Message, StringComparison.Ordinal);
        Assert.Contains("SettingsDialogTests.Reopen", withoutTimeout.Message, StringComparison.Ordinal);
        Assert.Contains("SettingsDialogTests.Reopen", withTimeout.Message, StringComparison.Ordinal);
        Assert.Equal(1, dispatched);
    }

    [Fact]
    public async Task Run_StillWaitingWhenAnotherRunTimesOut_FailsNamingTheTestThatTimedOut()
    {
        var stuck = new TaskCompletionSource<object?>();
        var dispatchedOnce = new ManualResetEventSlim();
        var guard = new HeadlessRunGuard(_ =>
        {
            dispatchedOnce.Set();
            return stuck.Task;
        });

        var waiting = Task.Run(() => Assert.Throws<InvalidOperationException>(() => guard.Run(() => 1)));
        Assert.True(dispatchedOnce.Wait(TimeSpan.FromSeconds(10)), "The waiting run was never dispatched.");
        var timeout = Assert.Throws<TimeoutException>(() => guard.Run(() => 2, TimeSpan.FromSeconds(1), "SettingsDialogTests.Reopen"));

        var waitingFailure = await waiting.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Contains("SettingsDialogTests.Reopen", waitingFailure.Message, StringComparison.Ordinal);
        Assert.Contains("SettingsDialogTests.Reopen", timeout.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Run_WhenWorkThrows_RethrowsItUnwrapped()
    {
        var guard = new HeadlessRunGuard(action => Task.Run(action));

        Assert.Throws<ArgumentException>(() => guard.Run<int>(() => throw new ArgumentException("bad")));
        Assert.Throws<ArgumentException>(() => guard.Run<int>(() => throw new ArgumentException("bad"), TimeSpan.FromSeconds(10), "Test"));
    }

    [Fact]
    public void Run_WhenWorkFinishesInTime_ReturnsItsResultAndKeepsRunning()
    {
        var guard = new HeadlessRunGuard(action => Task.FromResult(action()));

        Assert.Equal(1, guard.Run(() => 1, TimeSpan.FromSeconds(10), "Test"));
        Assert.Equal("two", guard.Run(() => "two"));
    }
}
